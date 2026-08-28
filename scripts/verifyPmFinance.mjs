import { createPublicClient, formatUnits, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';
import { BRAND } from '../shared/brand.ts';
import { PM_SEPOLIA_DEPLOYMENT } from '../shared/pmDeployment.ts';

const epochIdValue = process.env.PM_VERIFY_EPOCH?.trim();
if (!epochIdValue || !/^\d+$/.test(epochIdValue)) {
  throw new Error('PM_VERIFY_EPOCH must be the numeric reward epoch to verify');
}

const epochId = BigInt(epochIdValue);
const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL?.trim() || PM_SEPOLIA_DEPLOYMENT.rpcUrl),
});
const account = PM_SEPOLIA_DEPLOYMENT.treasuryAddress;
const token = PM_SEPOLIA_DEPLOYMENT.tokenAddress;
const distributor = PM_SEPOLIA_DEPLOYMENT.distributorAddress;
const staking = PM_SEPOLIA_DEPLOYMENT.stakingAddress;
const tokenAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);
const distributorAbi = parseAbi([
  'function ydToken() view returns (address)',
  'function paused() view returns (bool)',
  'function outstandingCommitments() view returns (uint256)',
  'function epochs(uint256 epochId) view returns (bytes32 merkleRoot,uint256 totalAllocation,uint256 totalClaimed,uint64 claimEndsAt,bool swept)',
  'function hasClaimed(uint256 epochId,address account) view returns (bool)',
]);
const stakingAbi = parseAbi([
  'function ydToken() view returns (address)',
  'function paused() view returns (bool)',
  'function positions(address account) view returns (uint128 amount,uint64 unlockTime,uint64 duration)',
  'function rawPowerOf(address account) view returns (uint256)',
  'function getVotes(address account) view returns (uint256)',
]);

const chainId = await client.getChainId();
const [
  tokenCode,
  distributorCode,
  stakingCode,
  name,
  symbol,
  decimals,
  totalSupply,
  treasuryBalance,
  distributorBalance,
  stakingBalance,
  distributorToken,
  stakingToken,
  distributorPaused,
  stakingPaused,
  outstandingCommitments,
  epoch,
  claimed,
  position,
  rawPower,
  votingPower,
] = await Promise.all([
  client.getBytecode({ address: token }),
  client.getBytecode({ address: distributor }),
  client.getBytecode({ address: staking }),
  client.readContract({ address: token, abi: tokenAbi, functionName: 'name' }),
  client.readContract({ address: token, abi: tokenAbi, functionName: 'symbol' }),
  client.readContract({ address: token, abi: tokenAbi, functionName: 'decimals' }),
  client.readContract({ address: token, abi: tokenAbi, functionName: 'totalSupply' }),
  client.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [account] }),
  client.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [distributor] }),
  client.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [staking] }),
  client.readContract({ address: distributor, abi: distributorAbi, functionName: 'ydToken' }),
  client.readContract({ address: staking, abi: stakingAbi, functionName: 'ydToken' }),
  client.readContract({ address: distributor, abi: distributorAbi, functionName: 'paused' }),
  client.readContract({ address: staking, abi: stakingAbi, functionName: 'paused' }),
  client.readContract({ address: distributor, abi: distributorAbi, functionName: 'outstandingCommitments' }),
  client.readContract({ address: distributor, abi: distributorAbi, functionName: 'epochs', args: [epochId] }),
  client.readContract({ address: distributor, abi: distributorAbi, functionName: 'hasClaimed', args: [epochId, account] }),
  client.readContract({ address: staking, abi: stakingAbi, functionName: 'positions', args: [account] }),
  client.readContract({ address: staking, abi: stakingAbi, functionName: 'rawPowerOf', args: [account] }),
  client.readContract({ address: staking, abi: stakingAbi, functionName: 'getVotes', args: [account] }),
]);

const expectedSupply = 100_000_000n * 10n ** BigInt(PM_SEPOLIA_DEPLOYMENT.decimals);
const contractsHaveCode = [tokenCode, distributorCode, stakingCode].every((code) => code && code.length > 2);
const tokenReferencesMatch = [distributorToken, stakingToken].every(
  (address) => address.toLocaleLowerCase() === token.toLocaleLowerCase(),
);
const finalStateIsClean = distributorBalance === 0n
  && stakingBalance === 0n
  && outstandingCommitments === 0n
  && position[0] === 0n
  && rawPower === 0n
  && votingPower === 0n
  && !distributorPaused
  && !stakingPaused;
const epochSettledExactly = epoch[0] !== `0x${'00'.repeat(32)}`
  && epoch[1] > 0n
  && epoch[2] === epoch[1]
  && claimed;
const treasuryOwnsFixedSupply = totalSupply === expectedSupply && treasuryBalance === totalSupply;
const metadataMatches = name === BRAND.contribution.testName
  && symbol === BRAND.contribution.symbol
  && decimals === PM_SEPOLIA_DEPLOYMENT.decimals;
const ok = chainId === PM_SEPOLIA_DEPLOYMENT.chainId
  && contractsHaveCode
  && tokenReferencesMatch
  && metadataMatches
  && treasuryOwnsFixedSupply
  && epochSettledExactly
  && finalStateIsClean;

const result = {
  ok,
  network: 'sepolia',
  chainId,
  epochId: epochId.toString(),
  contractsHaveCode,
  tokenReferencesMatch,
  token: {
    name,
    symbol,
    decimals,
    totalSupply: formatUnits(totalSupply, decimals),
    treasuryBalance: formatUnits(treasuryBalance, decimals),
    treasuryOwnsFixedSupply,
  },
  epoch: {
    totalAllocation: formatUnits(epoch[1], decimals),
    totalClaimed: formatUnits(epoch[2], decimals),
    claimed,
    settledExactly: epochSettledExactly,
  },
  finalState: {
    distributorPaused,
    stakingPaused,
    outstandingCommitments: formatUnits(outstandingCommitments, decimals),
    distributorBalance: formatUnits(distributorBalance, decimals),
    stakingBalance: formatUnits(stakingBalance, decimals),
    lockedAmount: formatUnits(position[0], decimals),
    rawPower: rawPower.toString(),
    votingPower: votingPower.toString(),
    clean: finalStateIsClean,
  },
};

console.log(JSON.stringify(result, null, 2));
if (!ok) process.exitCode = 1;
