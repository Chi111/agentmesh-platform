import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbi,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function artifact(contractName) {
  const prefix = resolve(`dist-contracts/contracts_${contractName}_sol_${contractName}`);
  return {
    abi: JSON.parse(readFileSync(`${prefix}.abi`, 'utf8')),
    bytecode: `0x${readFileSync(`${prefix}.bin`, 'utf8').trim()}`,
  };
}

const rpcUrl = required('SEPOLIA_RPC_URL');
const rawPrivateKey = required('SEPOLIA_PRIVATE_KEY');
const account = privateKeyToAccount(rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`);
const admin = (process.env.YD_ADMIN_ADDRESS ?? account.address).trim();
const treasury = (process.env.YD_TREASURY_ADDRESS ?? account.address).trim();
if (!isAddress(admin) || !isAddress(treasury)) throw new Error('YD_ADMIN_ADDRESS and YD_TREASURY_ADDRESS must be valid addresses');

const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });
if (await publicClient.getChainId() !== sepolia.id) throw new Error(`Expected Sepolia chain ${sepolia.id}`);
if (await publicClient.getBalance({ address: account.address }) === 0n) throw new Error('Deployment account has no Sepolia ETH');

async function deploy(contractName, args) {
  const compiled = artifact(contractName);
  const hash = await walletClient.deployContract({ abi: compiled.abi, bytecode: compiled.bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`${contractName} deployment failed: ${hash}`);
  return { address: receipt.contractAddress, transactionHash: hash, blockNumber: receipt.blockNumber.toString() };
}

let tokenAddress = process.env.YD_TOKEN_ADDRESS?.trim();
let tokenDeployment = null;
if (!isAddress(tokenAddress ?? '')) {
  if (process.env.YD_DEPLOY_TEST_TOKEN !== 'true') {
    throw new Error('YD_TOKEN_ADDRESS must reference an audited token, or set YD_DEPLOY_TEST_TOKEN=true for the Sepolia-only mapping token');
  }
  const testSupply = parseUnits(process.env.YD_TEST_SUPPLY?.trim() || '100000000', 18);
  tokenDeployment = await deploy('TestYDToken', [treasury, testSupply]);
  tokenAddress = tokenDeployment.address;
}

const tokenMetadataAbi = parseAbi(['function decimals() view returns (uint8)']);
const tokenDecimals = Number(await publicClient.readContract({ address: tokenAddress, abi: tokenMetadataAbi, functionName: 'decimals' }));
if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) throw new Error('YD token decimals must be between 0 and 18');
const lockCap = parseUnits(process.env.YD_MAX_LOCK_PER_ACCOUNT?.trim() || '1000000', tokenDecimals);
const powerCap = BigInt(process.env.YD_MAX_POWER_PER_ACCOUNT?.trim() || '10000000000000');
const distributor = await deploy('YDRewardDistributor', [tokenAddress, treasury, admin]);
const staking = await deploy('YDStaking', [tokenAddress, admin, lockCap, powerCap]);

const distributorViewAbi = parseAbi([
  'function ydToken() view returns (address)',
  'function treasury() view returns (address)',
]);
const stakingViewAbi = parseAbi([
  'function ydToken() view returns (address)',
  'function ydDecimals() view returns (uint8)',
  'function maxLockedPerAccount() view returns (uint256)',
  'function maxPowerPerAccount() view returns (uint256)',
]);
const [distributorToken, deployedTreasury, stakingToken, ydDecimals, deployedLockCap, deployedPowerCap] = await Promise.all([
  publicClient.readContract({ address: distributor.address, abi: distributorViewAbi, functionName: 'ydToken' }),
  publicClient.readContract({ address: distributor.address, abi: distributorViewAbi, functionName: 'treasury' }),
  publicClient.readContract({ address: staking.address, abi: stakingViewAbi, functionName: 'ydToken' }),
  publicClient.readContract({ address: staking.address, abi: stakingViewAbi, functionName: 'ydDecimals' }),
  publicClient.readContract({ address: staking.address, abi: stakingViewAbi, functionName: 'maxLockedPerAccount' }),
  publicClient.readContract({ address: staking.address, abi: stakingViewAbi, functionName: 'maxPowerPerAccount' }),
]);
if (distributorToken.toLocaleLowerCase() !== tokenAddress.toLocaleLowerCase() || stakingToken.toLocaleLowerCase() !== tokenAddress.toLocaleLowerCase()) {
  throw new Error('Deployed contracts do not reference the requested YD token');
}

console.log(JSON.stringify({
  network: 'sepolia',
  chainId: sepolia.id,
  deployer: account.address,
  admin,
  treasury: deployedTreasury,
  token: { address: tokenAddress, decimals: Number(ydDecimals), deployment: tokenDeployment },
  distributor,
  staking: { ...staking, maxLockedPerAccount: deployedLockCap.toString(), maxPowerPerAccount: deployedPowerCap.toString() },
  next: [
    'Treasury transfers the fixed epoch YD pool to the distributor before publishing a root.',
    'Configure YD_* Worker secrets and matching VITE_YD_* public addresses.',
    'Grant operational roles to separate multisig accounts before any non-test deployment.',
  ],
}, null, 2));
