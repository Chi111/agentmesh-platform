import {
  createPublicClient,
  decodeEventLog,
  encodeAbiParameters,
  http,
  isAddress as isViemAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import type { Agent, PaymentMethod, WorkflowStage } from './contracts';
import { AGENTMESH_TESTNET_SETTLEMENT, paymentConfig } from './payments';

export interface SettlementEnv {
  PROJECT_NAME?: string;
  SETTLEMENT_MODE?: string;
  BASE_RPC_URL?: string;
  BASE_CHAIN_ID?: string;
  ESCROW_CONTRACT_ADDRESS?: string;
  MUSDC_ADDRESS?: string;
  USDC_DECIMALS?: string;
  MIN_CONFIRMATIONS?: string;
}

const escrowEvents = parseAbi([
  'event EscrowDeposited(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount, bytes32 payoutHash)',
  'event EscrowFrozen(bytes32 indexed missionKey, address indexed actor)',
  'event EscrowUnfrozen(bytes32 indexed missionKey, address indexed arbiter)',
  'event EscrowReleased(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount, uint256 platformFee, bytes32 payoutHash)',
  'event EscrowRefunded(bytes32 indexed missionKey, address indexed requester, address indexed asset, uint256 amount)',
]);

export type ChainVerification =
  | { ok: true; confirmations: number; blockNumber: string }
  | { ok: false; status: number; code: string; message: string };

function isAddress(value: string | undefined): value is Address {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

function isHash(value: string): value is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export interface SettlementPlan {
  recipients: Address[];
  weights: bigint[];
  payoutHash: Hex;
}

export function buildSettlementPlan(stages: WorkflowStage[], agents: Agent[]): SettlementPlan {
  const wallets = new Map(agents.map((agent) => [agent.id, agent.wallet]));
  const aggregated = new Map<string, { address: Address; weight: bigint }>();
  for (const stage of [...stages].sort((left, right) => left.position - right.position)) {
    const wallet = stage.agentId ? wallets.get(stage.agentId) : null;
    if (!wallet || !isViemAddress(wallet, { strict: false })) throw new Error(`Stage ${stage.id} does not have a valid settlement wallet`);
    const weight = parseUnits(stage.budget.toFixed(6), 6);
    if (weight <= 0n) throw new Error(`Stage ${stage.id} must have a positive settlement weight`);
    const key = wallet.toLocaleLowerCase();
    const current = aggregated.get(key);
    aggregated.set(key, { address: key as Address, weight: (current?.weight ?? 0n) + weight });
  }
  const entries = [...aggregated.values()].sort((left, right) => left.address.toLocaleLowerCase().localeCompare(right.address.toLocaleLowerCase()));
  if (entries.length === 0) throw new Error('A settlement plan requires at least one recipient');
  const recipients = entries.map((entry) => entry.address);
  const weights = entries.map((entry) => entry.weight);
  const payoutHash = keccak256(encodeAbiParameters(
    parseAbiParameters('address[] recipients, uint256[] weights'),
    [recipients, weights],
  ));
  return { recipients, weights, payoutHash };
}

function resolveSettlementConfig(env: SettlementEnv) {
  const useProjectDefaults = env.PROJECT_NAME?.trim() === AGENTMESH_TESTNET_SETTLEMENT.projectName;
  return {
    mode: env.SETTLEMENT_MODE?.trim() || (useProjectDefaults ? 'contract' : 'ledger'),
    rpcUrl: env.BASE_RPC_URL?.trim() || (useProjectDefaults ? AGENTMESH_TESTNET_SETTLEMENT.rpcUrl : ''),
    chainId: Number(env.BASE_CHAIN_ID ?? (useProjectDefaults ? AGENTMESH_TESTNET_SETTLEMENT.chainId : 11155111)),
    contractAddress: env.ESCROW_CONTRACT_ADDRESS?.trim() || (useProjectDefaults ? AGENTMESH_TESTNET_SETTLEMENT.escrowAddress : ''),
    musdcAddress: env.MUSDC_ADDRESS?.trim() || (useProjectDefaults ? AGENTMESH_TESTNET_SETTLEMENT.musdcAddress : ''),
    musdcDecimals: Math.max(0, Number(env.USDC_DECIMALS ?? AGENTMESH_TESTNET_SETTLEMENT.musdcDecimals)),
    confirmations: Math.max(1, Number(env.MIN_CONFIRMATIONS ?? AGENTMESH_TESTNET_SETTLEMENT.confirmations)),
  };
}

export function isOnchainSettlementConfigured(env: SettlementEnv): boolean {
  const config = resolveSettlementConfig(env);
  return config.mode === 'contract'
    && Boolean(config.rpcUrl)
    && isAddress(config.contractAddress)
    && isAddress(config.musdcAddress);
}

export function settlementDescriptor(env: SettlementEnv) {
  const configured = isOnchainSettlementConfigured(env);
  const config = resolveSettlementConfig(env);
  return {
    mode: configured ? 'verified_contract' : 'offchain_ledger_with_chain_references',
    token: configured ? 'mUSDC / sETH' : 'CREDIT',
    assets: configured ? ['mUSDC', 'sETH'] : ['CREDIT'],
    network: configured ? `eip155:${config.chainId}` : 'agentmesh',
    contractAddress: configured ? config.contractAddress : null,
    confirmations: configured ? config.confirmations : 0,
  };
}

async function verifyEscrowEvent(
  env: SettlementEnv,
  txHash: string,
  missionId: string,
  amount: number,
  eventName: 'EscrowDeposited' | 'EscrowReleased',
  paymentMethod: Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'>,
  expectedPayoutHash: Hex,
  expectedRequester?: string,
): Promise<ChainVerification> {
  if (!isOnchainSettlementConfigured(env)) {
    return { ok: false, status: 503, code: 'CHAIN_NOT_CONFIGURED', message: 'Verified on-chain settlement is not configured' };
  }
  if (!isHash(txHash)) return { ok: false, status: 400, code: 'INVALID_TX_HASH', message: 'A valid transaction hash is required' };

  const config = resolveSettlementConfig(env);
  const rpcUrl = config.rpcUrl;
  const contract = config.contractAddress as Address;
  const client = createPublicClient({ transport: http(rpcUrl) });
  try {
    const [receipt, transaction, latestBlock] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash }),
      client.getTransaction({ hash: txHash }),
      client.getBlockNumber(),
    ]);
    if (receipt.status !== 'success') return { ok: false, status: 409, code: 'TX_REVERTED', message: 'The settlement transaction reverted' };
    if (transaction.to?.toLocaleLowerCase() !== contract.toLocaleLowerCase()) {
      return { ok: false, status: 400, code: 'WRONG_CONTRACT', message: 'The transaction was not sent to the configured escrow contract' };
    }

    const confirmations = Number(latestBlock - receipt.blockNumber + 1n);
    const requiredConfirmations = config.confirmations;
    if (confirmations < requiredConfirmations) {
      return { ok: false, status: 409, code: 'TX_CONFIRMING', message: `Transaction needs ${requiredConfirmations - confirmations} more confirmation(s)` };
    }

    const missionKey = keccak256(stringToHex(missionId));
    const payment = paymentConfig(paymentMethod);
    const decimals = paymentMethod === 'web3_musdc'
      ? config.musdcDecimals
      : payment.decimals;
    const expectedAmount = parseUnits(String(amount), decimals);
    const expectedAsset = paymentMethod === 'web3_musdc'
      ? config.musdcAddress.toLocaleLowerCase()
      : zeroAddress;
    for (const log of receipt.logs) {
      if (log.address.toLocaleLowerCase() !== contract.toLocaleLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: escrowEvents, data: log.data, topics: log.topics });
        if (decoded.eventName !== eventName) continue;
        const args = decoded.args as { missionKey?: Hex; requester?: Address; asset?: Address; amount?: bigint; payoutHash?: Hex };
        if (args.missionKey !== missionKey || args.amount !== expectedAmount || args.asset?.toLocaleLowerCase() !== expectedAsset) continue;
        if (args.payoutHash !== expectedPayoutHash) continue;
        if (expectedRequester && args.requester?.toLocaleLowerCase() !== expectedRequester.toLocaleLowerCase()) continue;
        return { ok: true, confirmations, blockNumber: receipt.blockNumber.toString() };
      } catch {
        // Ignore unrelated logs from the same transaction.
      }
    }
    return { ok: false, status: 400, code: 'SETTLEMENT_EVENT_MISMATCH', message: 'The transaction does not contain the expected AgentMesh escrow event' };
  } catch {
    return { ok: false, status: 409, code: 'TX_NOT_AVAILABLE', message: 'The transaction is not available from the configured RPC yet' };
  }
}

async function verifyEscrowStateEvent(
  env: SettlementEnv,
  txHash: string,
  missionId: string,
  eventName: 'EscrowFrozen' | 'EscrowUnfrozen' | 'EscrowRefunded',
  expectedActor: string,
  paymentMethod?: Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'>,
  amount?: number,
  expectedRequester?: string,
): Promise<ChainVerification> {
  if (!isOnchainSettlementConfigured(env)) {
    return { ok: false, status: 503, code: 'CHAIN_NOT_CONFIGURED', message: 'Verified on-chain settlement is not configured' };
  }
  if (!isHash(txHash)) return { ok: false, status: 400, code: 'INVALID_TX_HASH', message: 'A valid transaction hash is required' };
  if (!isAddress(expectedActor)) return { ok: false, status: 409, code: 'WALLET_IDENTITY_REQUIRED', message: 'A verified wallet is required for this chain action' };

  const config = resolveSettlementConfig(env);
  const contract = config.contractAddress as Address;
  const client = createPublicClient({ transport: http(config.rpcUrl) });
  try {
    const [receipt, transaction, latestBlock] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash }),
      client.getTransaction({ hash: txHash }),
      client.getBlockNumber(),
    ]);
    if (receipt.status !== 'success') return { ok: false, status: 409, code: 'TX_REVERTED', message: 'The escrow state transaction reverted' };
    if (transaction.to?.toLocaleLowerCase() !== contract.toLocaleLowerCase()) {
      return { ok: false, status: 400, code: 'WRONG_CONTRACT', message: 'The transaction was not sent to the configured escrow contract' };
    }
    if (transaction.from.toLocaleLowerCase() !== expectedActor.toLocaleLowerCase()) {
      return { ok: false, status: 403, code: 'WRONG_CHAIN_ACTOR', message: 'The transaction was not sent by the verified wallet' };
    }
    const confirmations = Number(latestBlock - receipt.blockNumber + 1n);
    if (confirmations < config.confirmations) {
      return { ok: false, status: 409, code: 'TX_CONFIRMING', message: `Transaction needs ${config.confirmations - confirmations} more confirmation(s)` };
    }

    const missionKey = keccak256(stringToHex(missionId));
    const expectedAsset = paymentMethod === 'web3_musdc' ? config.musdcAddress.toLocaleLowerCase() : zeroAddress;
    const expectedAmount = paymentMethod && amount !== undefined
      ? parseUnits(String(amount), paymentMethod === 'web3_musdc' ? config.musdcDecimals : paymentConfig(paymentMethod).decimals)
      : null;
    for (const log of receipt.logs) {
      if (log.address.toLocaleLowerCase() !== contract.toLocaleLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: escrowEvents, data: log.data, topics: log.topics });
        if (decoded.eventName !== eventName) continue;
        const args = decoded.args as { missionKey?: Hex; actor?: Address; arbiter?: Address; requester?: Address; asset?: Address; amount?: bigint };
        if (args.missionKey !== missionKey) continue;
        const eventActor = args.actor ?? args.arbiter;
        if (eventActor && eventActor.toLocaleLowerCase() !== expectedActor.toLocaleLowerCase()) continue;
        if (eventName === 'EscrowRefunded') {
          if (args.asset?.toLocaleLowerCase() !== expectedAsset || args.amount !== expectedAmount) continue;
          if (expectedRequester && args.requester?.toLocaleLowerCase() !== expectedRequester.toLocaleLowerCase()) continue;
        }
        return { ok: true, confirmations, blockNumber: receipt.blockNumber.toString() };
      } catch {
        // Ignore unrelated logs from the same transaction.
      }
    }
    return { ok: false, status: 400, code: 'SETTLEMENT_EVENT_MISMATCH', message: 'The transaction does not contain the expected AgentMesh escrow state event' };
  } catch {
    return { ok: false, status: 409, code: 'TX_NOT_AVAILABLE', message: 'The transaction is not available from the configured RPC yet' };
  }
}

export function verifyDepositTransaction(
  env: SettlementEnv,
  txHash: string,
  missionId: string,
  amount: number,
  paymentMethod: Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'>,
  payoutHash: Hex,
  requester?: string,
) {
  return verifyEscrowEvent(env, txHash, missionId, amount, 'EscrowDeposited', paymentMethod, payoutHash, requester);
}

export function verifyReleaseTransaction(
  env: SettlementEnv,
  txHash: string,
  missionId: string,
  amount: number,
  paymentMethod: Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'>,
  payoutHash: Hex,
  requester?: string,
) {
  return verifyEscrowEvent(env, txHash, missionId, amount, 'EscrowReleased', paymentMethod, payoutHash, requester);
}

export function verifyFreezeTransaction(env: SettlementEnv, txHash: string, missionId: string, actor: string) {
  return verifyEscrowStateEvent(env, txHash, missionId, 'EscrowFrozen', actor);
}

export function verifyUnfreezeTransaction(env: SettlementEnv, txHash: string, missionId: string, actor: string) {
  return verifyEscrowStateEvent(env, txHash, missionId, 'EscrowUnfrozen', actor);
}

export function verifyRefundTransaction(
  env: SettlementEnv,
  txHash: string,
  missionId: string,
  amount: number,
  paymentMethod: Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'>,
  actor: string,
  requester: string,
) {
  return verifyEscrowStateEvent(env, txHash, missionId, 'EscrowRefunded', actor, paymentMethod, amount, requester);
}
