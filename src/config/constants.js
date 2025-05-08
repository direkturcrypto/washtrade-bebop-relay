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
 * Combined service swap configurations (Bebop + Relay)
 */
const COMBINED_SWAP_CONFIGS = [
  {
    name: "USDC → WETH → USDC (Bebop+Relay)",
    active: true,
    fromToken: TOKEN_ADDRESSES.USDC,
    toToken: TOKEN_ADDRESSES.WETH,
    // Use min and max for random amount selection
    minAmount: 10 * 1e6, // 0.5 USDC with 6 decimals
    maxAmount: 20 * 1e6,   // 2 USDC with 6 decimals
    amount: 1 * 1e6,      // Default amount (used if random not enabled)
    description: "Swap USDC to WETH using Bebop, then back to USDC using Relay",
    service: "combined" // Use combined service for this swap
  },
  // {
  //   name: "USDT → WETH → USDT (Bebop+Relay)",
  //   active: false, // Disabled by default
  //   fromToken: TOKEN_ADDRESSES.USDT,
  //   toToken: TOKEN_ADDRESSES.WETH,
  //   // Use min and max for random amount selection
  //   minAmount: 0.5 * 1e6, // 0.5 USDT with 6 decimals
  //   maxAmount: 2 * 1e6,   // 2 USDT with 6 decimals
  //   amount: 1 * 1e6,      // Default amount (used if random not enabled)
  //   description: "Swap USDT to WETH using Bebop, then back to USDT using Relay",
  //   service: "combined"
  // }
];

// Use combined configs as all configs
const ALL_SWAP_CONFIGS = COMBINED_SWAP_CONFIGS;

/**
 * General configuration
 */
const CONFIG = {
  // Set to true to randomly select from active swap configurations
  useRandomSwap: true,
  
  // Set to true to use random amount between minAmount and maxAmount
  useRandomAmount: true,
  
  // Number of seconds to wait between swaps if running multiple
  delayBetweenSwaps: 5,
  
  // Minimum and maximum delay (in seconds) between repeat transactions
  minDelaySeconds: 60, // 1 minute
  maxDelaySeconds: 300, // 5 minutes
  
  // Max gas price in gwei to use for transactions
  maxGasPrice: 1.5,
  
  // Maximum acceptable total cost percentage (shortfall + fee, abort if exceeded)
  maxAcceptableShortfallPercentage: 2,
  
  // Percentage buffer to add to shortfall amount (helps prevent transaction failures)
  shortfallBufferPercentage: 20
};

/**
 * Router addresses
 */
const BEBOP_ROUTER = "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F";
const RELAY_ROUTER = "0xaaaaaaae92cc1ceef79a038017889fdd26d23d4d";

module.exports = {
  PRIVATE_KEY,
  RPC_URL,
  FLASHLOAN_CONTRACT,
  TOKEN_ADDRESSES,
  COMBINED_SWAP_CONFIGS,
  ALL_SWAP_CONFIGS,
  CONFIG,
  BEBOP_ROUTER,
  RELAY_ROUTER
}; 