import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { BRAND } from '../shared/brand.ts';
import { PM_SEPOLIA_DEPLOYMENT } from '../shared/pmDeployment.ts';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const rawPrivateKey = required('SEPOLIA_PRIVATE_KEY');
const account = privateKeyToAccount(rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`);
if (account.address.toLocaleLowerCase() !== PM_SEPOLIA_DEPLOYMENT.adminAddress.toLocaleLowerCase()) {
  throw new Error('Smoke signer is not the configured PM Sepolia admin');
}

const transport = http(process.env.SEPOLIA_RPC_URL?.trim() || PM_SEPOLIA_DEPLOYMENT.rpcUrl);
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });
if (await publicClient.getChainId() !== PM_SEPOLIA_DEPLOYMENT.chainId) throw new Error('PM smoke test requires Sepolia');

const token = PM_SEPOLIA_DEPLOYMENT.tokenAddress;
const distributor = PM_SEPOLIA_DEPLOYMENT.distributorAddress;
const staking = PM_SEPOLIA_DEPLOYMENT.stakingAddress;
const tokenAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to,uint256 amount) returns (bool)',
  'function approve(address spender,uint256 amount) returns (bool)',
]);
const distributorAbi = parseAbi([
  'function ydToken() view returns (address)',
  'function paused() view returns (bool)',
  'function outstandingCommitments() view returns (uint256)',
  'function rewardLeaf(uint256 epochId,address account,uint256 amount) view returns (bytes32)',
  'function epochs(uint256 epochId) view returns (bytes32 merkleRoot,uint256 totalAllocation,uint256 totalClaimed,uint64 claimEndsAt,bool swept)',
  'function hasClaimed(uint256 epochId,address account) view returns (bool)',
  'function publishEpoch(uint256 epochId,bytes32 merkleRoot,uint256 totalAllocation,uint64 claimEndsAt)',
  'function claim(uint256 epochId,uint256 amount,bytes32[] proof)',
  'function recoverExcess(uint256 amount)',
  'function pause()',
  'function unpause()',
]);
const stakingAbi = parseAbi([
  'function ydToken() view returns (address)',
  'function paused() view returns (bool)',
  'function verifiedAccounts(address account) view returns (bool)',
  'function positions(address account) view returns (uint128 amount,uint64 unlockTime,uint64 duration)',
  'function rawPowerOf(address account) view returns (uint256)',
  'function getVotes(address account) view returns (uint256)',
  'function delegates(address account) view returns (address)',
  'function setVerifiedAccount(address account,bool verified)',
  'function lock(uint128 amount,uint64 duration)',
  'function delegate(address delegatee)',
  'function emergencyWithdraw()',
  'function pause()',
  'function unpause()',
]);

const transactions = [];
async function send(label, address, abi, functionName, args = []) {
  const hash = await walletClient.writeContract({ address, abi, functionName, args });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: PM_SEPOLIA_DEPLOYMENT.confirmations,
    timeout: 180_000,
  });
  if (receipt.status !== 'success') throw new Error(`${label} reverted: ${hash}`);
  transactions.push({ label, hash, blockNumber: receipt.blockNumber.toString() });
  console.error(`${label}: ${hash}`);
  return receipt;
}

const [tokenCode, distributorCode, stakingCode, tokenName, tokenSymbol, distributorToken, stakingToken] = await Promise.all([
  publicClient.getBytecode({ address: token }),
  publicClient.getBytecode({ address: distributor }),
  publicClient.getBytecode({ address: staking }),
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'name' }),
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'symbol' }),
  publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: 'ydToken' }),
  publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'ydToken' }),
]);
if (![tokenCode, distributorCode, stakingCode].every((code) => code && code.length > 2)) throw new Error('One or more PM contracts have no bytecode');
if (tokenName !== BRAND.contribution.testName || tokenSymbol !== BRAND.contribution.symbol) throw new Error('PM token metadata mismatch');
if ([distributorToken, stakingToken].some((address) => address.toLocaleLowerCase() !== token.toLocaleLowerCase())) {
  throw new Error('PM smoke contracts do not reference the configured token');
}

let stakingPaused = await publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'paused' });
const existingPosition = await publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'positions', args: [account.address] });
if (existingPosition[0] > 0n) {
  if (!stakingPaused) {
    await send('cleanup: pause staking', staking, stakingAbi, 'pause');
    stakingPaused = true;
  }
  await send('cleanup: emergency withdraw', staking, stakingAbi, 'emergencyWithdraw');
}
if (stakingPaused) await send('cleanup: unpause staking', staking, stakingAbi, 'unpause');

let distributorPaused = await publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: 'paused' });
if (distributorPaused) await send('cleanup: unpause distributor', distributor, distributorAbi, 'unpause');
const outstandingBefore = await publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: 'outstandingCommitments' });
if (outstandingBefore !== 0n) throw new Error('Distributor has outstanding commitments; refusing to mix smoke funds');
const distributorBalanceBefore = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [distributor] });
if (distributorBalanceBefore > 0n) await send('cleanup: recover distributor excess', distributor, distributorAbi, 'recoverExcess', [distributorBalanceBefore]);

const rewardAmount = parseUnits(process.env.PM_SMOKE_REWARD?.trim() || '100', PM_SEPOLIA_DEPLOYMENT.decimals);
const poolAmount = parseUnits(process.env.PM_SMOKE_POOL?.trim() || '1000', PM_SEPOLIA_DEPLOYMENT.decimals);
const lockAmount = parseUnits(process.env.PM_SMOKE_LOCK?.trim() || '100', PM_SEPOLIA_DEPLOYMENT.decimals);
if (rewardAmount <= 0n || poolAmount < rewardAmount || lockAmount <= 0n) throw new Error('Invalid PM smoke amounts');

const latestBlock = await publicClient.getBlock();
const epochId = BigInt(process.env.PM_SMOKE_EPOCH_ID?.trim() || latestBlock.timestamp.toString());
const existingEpoch = await publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: 'epochs', args: [epochId] });
if (existingEpoch[0] !== `0x${'00'.repeat(32)}`) throw new Error(`PM smoke epoch ${epochId} already exists`);
const claimEndsAt = latestBlock.timestamp + 7n * 24n * 60n * 60n;
const leaf = await publicClient.readContract({
  address: distributor,
  abi: distributorAbi,
  functionName: 'rewardLeaf',
  args: [epochId, account.address, rewardAmount],
});

const treasuryBalanceBefore = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });
if (treasuryBalanceBefore < poolAmount) throw new Error('Treasury has insufficient PM for smoke test');
await send('fund reward distributor', token, tokenAbi, 'transfer', [distributor, poolAmount]);
await send('publish reward epoch', distributor, distributorAbi, 'publishEpoch', [epochId, leaf, rewardAmount, claimEndsAt]);
await send('claim PM reward', distributor, distributorAbi, 'claim', [epochId, rewardAmount, []]);
const distributorBalanceAfterClaim = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [distributor] });
if (distributorBalanceAfterClaim > 0n) {
  await send('recover unused reward pool', distributor, distributorAbi, 'recoverExcess', [distributorBalanceAfterClaim]);
}
await send('pause reward distributor', distributor, distributorAbi, 'pause');
await send('unpause reward distributor', distributor, distributorAbi, 'unpause');

const verified = await publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'verifiedAccounts', args: [account.address] });
if (!verified) await send('verify staking account', staking, stakingAbi, 'setVerifiedAccount', [account.address, true]);
await send('approve PM staking', token, tokenAbi, 'approve', [staking, lockAmount]);
await send('lock PM', staking, stakingAbi, 'lock', [lockAmount, 30n * 24n * 60n * 60n]);
await send('delegate Power to self', staking, stakingAbi, 'delegate', [account.address]);

const [lockedPosition, rawPower, votingPower, delegatee] = await Promise.all([
  publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'positions', args: [account.address] }),
  publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'rawPowerOf', args: [account.address] }),
  publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'getVotes', args: [account.address] }),
  publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'delegates', args: [account.address] }),
]);
if (lockedPosition[0] !== lockAmount || rawPower <= 0n || votingPower !== rawPower || delegatee.toLocaleLowerCase() !== account.address.toLocaleLowerCase()) {
  throw new Error('PM lock or delegated Power state mismatch');
}

await send('pause staking', staking, stakingAbi, 'pause');
await send('emergency withdraw PM', staking, stakingAbi, 'emergencyWithdraw');
await send('unpause staking', staking, stakingAbi, 'unpause');

const [epoch, claimed, outstandingAfter, distributorBalanceAfter, stakingBalanceAfter, finalPosition, finalRawPower, finalVotingPower, treasuryBalanceAfter] = await Promise.all([
  publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: 'epochs', args: [epochId] }),
  publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: 'hasClaimed', args: [epochId, account.address] }),
  publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: 'outstandingCommitments' }),
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [distributor] }),
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [staking] }),
  publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'positions', args: [account.address] }),
  publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'rawPowerOf', args: [account.address] }),
  publicClient.readContract({ address: staking, abi: stakingAbi, functionName: 'getVotes', args: [account.address] }),
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] }),
]);
if (!claimed || epoch[1] !== rewardAmount || epoch[2] !== rewardAmount || outstandingAfter !== 0n) throw new Error('PM reward lifecycle did not settle exactly');
if (distributorBalanceAfter !== 0n || stakingBalanceAfter !== 0n || finalPosition[0] !== 0n || finalRawPower !== 0n || finalVotingPower !== 0n) {
  throw new Error('PM smoke cleanup did not restore zero contract balances and Power');
}
if (treasuryBalanceAfter !== treasuryBalanceBefore) throw new Error('PM Treasury balance did not return to its starting value');

console.log(JSON.stringify({
  ok: true,
  network: 'sepolia',
  chainId: PM_SEPOLIA_DEPLOYMENT.chainId,
  account: account.address,
  epochId: epochId.toString(),
  rewardAmount: rewardAmount.toString(),
  poolAmount: poolAmount.toString(),
  lockAmount: lockAmount.toString(),
  observedPower: rawPower.toString(),
  finalState: {
    claimed,
    outstandingCommitments: outstandingAfter.toString(),
    distributorBalance: distributorBalanceAfter.toString(),
    stakingBalance: stakingBalanceAfter.toString(),
    lockedAmount: finalPosition[0].toString(),
    rawPower: finalRawPower.toString(),
    votingPower: finalVotingPower.toString(),
    treasuryBalanceRestored: treasuryBalanceAfter === treasuryBalanceBefore,
  },
  transactions,
}, null, 2));
