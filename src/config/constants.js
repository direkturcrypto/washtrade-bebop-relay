/**
 * Environment variables
 */
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const FLASHLOAN_CONTRACT = process.env.FLASHLOAN_CONTRACT;

/**
 * Common token addresses on Base chain
 */
const TOKEN_ADDRESSES = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  CBETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
  USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  USDT: "0x7085d103c2eafDEa81e0d5D0eaf447D00D387500",
  rETH: "0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c",
  WBTC: "0x77852CE4804DCf8e99Bc418566b05A8bC5dE8fA0"
};

/**
 * Swap configurations
 * Each config defines a token pair to swap
 */
const SWAP_CONFIGS = [
  {
    name: "USDC → WETH → USDC",
    active: true, // Set to false to disable this swap
    fromToken: TOKEN_ADDRESSES.USDC, 
    toToken: TOKEN_ADDRESSES.WETH,
    amount: 1 * 1e6, // 1 USDC with 6 decimals
    description: "Swap USDC to WETH and back"
  },
  // {
  //   name: "WETH → USDC → WETH",
  //   active: true,
  //   fromToken: TOKEN_ADDRESSES.WETH, 
  //   toToken: TOKEN_ADDRESSES.USDC,
  //   amount: 0.01 * 1e18, // 0.01 WETH with 18 decimals
  //   description: "Swap WETH to USDC and back"
  // }
];

/**
 * General configuration
 */
const CONFIG = {
  // Set to true to randomly select from active swap configurations
  useRandomSwap: true,
  
  // Number of seconds to wait between swaps if running multiple
  delayBetweenSwaps: 5,
  
  // Max gas price in gwei to use for transactions
  maxGasPrice: 1.5
};

/**
 * Router addresses
 */
const BEBOP_ROUTER = "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F";

module.exports = {
  PRIVATE_KEY,
  RPC_URL,
  FLASHLOAN_CONTRACT,
  TOKEN_ADDRESSES,
  SWAP_CONFIGS,
  CONFIG,
  BEBOP_ROUTER
}; 