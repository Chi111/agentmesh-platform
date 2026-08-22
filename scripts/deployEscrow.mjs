import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbi,
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
const tokenAddress = (process.env.MUSDC_ADDRESS ?? process.env.MOCK_USDC_ADDRESS)?.trim();
const treasuryAddress = (process.env.TREASURY_ADDRESS ?? process.env.OWNER_ADDRESS ?? account.address).trim();
const adminAddress = (process.env.ADMIN_ADDRESS ?? process.env.OWNER_ADDRESS ?? account.address).trim();
const feeBps = Number(process.env.PLATFORM_FEE_BPS ?? 40);

if (!isAddress(tokenAddress ?? '')) throw new Error('MUSDC_ADDRESS or MOCK_USDC_ADDRESS must be a valid address');
if (!isAddress(treasuryAddress) || !isAddress(adminAddress)) throw new Error('Treasury and admin must be valid addresses');
if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1_000) throw new Error('PLATFORM_FEE_BPS must be an integer from 0 to 1000');

const abi = JSON.parse(readFileSync(resolve('dist-contracts/contracts_AgentMeshEscrow_sol_AgentMeshEscrow.abi'), 'utf8'));
const bytecode = `0x${readFileSync(resolve('dist-contracts/contracts_AgentMeshEscrow_sol_AgentMeshEscrow.bin'), 'utf8').trim()}`;
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });

const chainId = await publicClient.getChainId();
if (chainId !== sepolia.id) throw new Error(`Expected Sepolia chain ${sepolia.id}, received ${chainId}`);
const balance = await publicClient.getBalance({ address: account.address });
if (balance === 0n) throw new Error('Deployment account has no Sepolia ETH');

const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [tokenAddress, treasuryAddress, adminAddress, feeBps],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`);

const contractAddress = receipt.contractAddress;
const verificationAbi = parseAbi([
  'function token() view returns (address)',
  'function treasury() view returns (address)',
  'function platformFeeBps() view returns (uint16)',
]);
const [deployedToken, deployedTreasury, deployedFeeBps] = await Promise.all([
  publicClient.readContract({ address: contractAddress, abi: verificationAbi, functionName: 'token' }),
  publicClient.readContract({ address: contractAddress, abi: verificationAbi, functionName: 'treasury' }),
  publicClient.readContract({ address: contractAddress, abi: verificationAbi, functionName: 'platformFeeBps' }),
]);

console.log(JSON.stringify({
  chainId,
  contractAddress,
  transactionHash: hash,
  blockNumber: receipt.blockNumber.toString(),
  deployer: account.address,
  admin: adminAddress,
  token: deployedToken,
  treasury: deployedTreasury,
  platformFeeBps: Number(deployedFeeBps),
}, null, 2));
