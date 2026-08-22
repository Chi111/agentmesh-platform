import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const rpcUrl = required('SEPOLIA_RPC_URL');
const rawPrivateKey = required('SEPOLIA_PRIVATE_KEY');
const privateKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`;
const account = privateKeyToAccount(privateKey);
const deployment = JSON.parse(readFileSync(resolve('deployments/sepolia.json'), 'utf8'));
const escrowAddress = deployment.address;
const musdcAddress = deployment.mUSDC;
const escrowAbi = JSON.parse(readFileSync(resolve('dist-contracts/contracts_AgentMeshEscrow_sol_AgentMeshEscrow.abi'), 'utf8'));
const tokenAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });

async function writeContract(address, abi, functionName, args, value) {
  const { request } = await publicClient.simulateContract({
    account,
    address,
    abi,
    functionName,
    args,
    value,
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180_000 });
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted: ${hash}`);
  return hash;
}

const tokenAmount = parseUnits('0.01', 6);
const nativeAmount = parseUnits('0.000001', 18);
const tokenBalance = await publicClient.readContract({ address: musdcAddress, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });
if (tokenBalance < tokenAmount) throw new Error('Deployment account does not have enough mUSDC for smoke testing');

const runId = Date.now().toString();
const tokenMissionKey = keccak256(stringToHex(`AGENTMESH-SMOKE-MUSDC-${runId}`));
const nativeMissionKey = keccak256(stringToHex(`AGENTMESH-SMOKE-SETH-${runId}`));
const recipients = [account.address];
const weights = [1n];
const payoutHash = keccak256(encodeAbiParameters(
  parseAbiParameters('address[] recipients, uint256[] weights'),
  [recipients, weights],
));
const approveHash = await writeContract(musdcAddress, tokenAbi, 'approve', [escrowAddress, tokenAmount]);
const tokenDepositHash = await writeContract(escrowAddress, escrowAbi, 'depositToken', [tokenMissionKey, tokenAmount, payoutHash]);
const tokenReleaseHash = await writeContract(escrowAddress, escrowAbi, 'release', [tokenMissionKey, recipients, weights]);
const nativeDepositHash = await writeContract(escrowAddress, escrowAbi, 'depositNative', [nativeMissionKey, payoutHash], nativeAmount);
const nativeReleaseHash = await writeContract(escrowAddress, escrowAbi, 'release', [nativeMissionKey, recipients, weights]);
const [tokenEscrow, nativeEscrow] = await Promise.all([
  publicClient.readContract({ address: escrowAddress, abi: escrowAbi, functionName: 'escrows', args: [tokenMissionKey] }),
  publicClient.readContract({ address: escrowAddress, abi: escrowAbi, functionName: 'escrows', args: [nativeMissionKey] }),
]);

console.log(JSON.stringify({
  chainId: sepolia.id,
  contractAddress: escrowAddress,
  mUSDC: { approveHash, depositHash: tokenDepositHash, releaseHash: tokenReleaseHash, status: Number(tokenEscrow[2]) },
  sETH: { depositHash: nativeDepositHash, releaseHash: nativeReleaseHash, status: Number(nativeEscrow[2]) },
}, null, 2));
