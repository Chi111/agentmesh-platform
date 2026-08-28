/**
 * Public Sepolia deployment metadata for the PM contribution asset.
 *
 * These values are not secrets. Runtime environments may override them with
 * the legacy YD_* / VITE_YD_* variables when testing a different deployment.
 */
export const PM_SEPOLIA_DEPLOYMENT = Object.freeze({
  networkName: 'Sepolia',
  chainId: 11155111,
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  testnet: true,
  confirmations: 2,
  decimals: 18,
  deployerAddress: '0x500291C7C3c1A41Abe94c7B9161DaB3882464640',
  adminAddress: '0x500291C7C3c1A41Abe94c7B9161DaB3882464640',
  treasuryAddress: '0x500291C7C3c1A41Abe94c7B9161DaB3882464640',
  tokenAddress: '0xfdf06a468dcc7464c3871057acd863d6bc514bae',
  distributorAddress: '0x852c36af469f0eea10c6aa26cf9489423c7d037e',
  stakingAddress: '0x9875e2eabe942dd9f8dd0e7bcb6f36071040a5c2',
  tokenDeployment: Object.freeze({
    transactionHash: '0x64b398db9857da526eed0849c15d217a02962856c9895bfceef81aef5989f16a',
    blockNumber: 11582576,
  }),
  distributorDeployment: Object.freeze({
    transactionHash: '0x443e0cfca5775097859295ca14fff080a53651653bbdf4e2eed87f0238b4388b',
    blockNumber: 11582578,
  }),
  stakingDeployment: Object.freeze({
    transactionHash: '0x4e55de4cd6de621072b90bede9fc3bfdf1132473b47a8cb7b7eb6ab10825bd14',
    blockNumber: 11582581,
  }),
});
