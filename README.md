# Base Chain Swap Tool

A Node.js tool to execute token swaps on the Base chain using Bebop and Relay.link APIs within a single flashloan transaction.

## Supported Service

### Combined (Bebop + Relay)
- Uses Bebop for the first swap (from token A to token B)
- Uses Relay.link for the second swap (from token B back to token A)
- Executes both swaps in a single flashloan transaction
- May provide better overall rates by combining the strengths of both services

## Flow

### Combined Flow
1. Request inquiry from token A to token B using Bebop API
2. Request quote from token B to token A using Relay.link API
3. Execute a single flashloan transaction that performs both swaps atomically

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example` and fill in your values:
   ```
   RPC_URL=https://base.llamarpc.com
   PRIVATE_KEY=your_private_key_here
   FLASHLOAN_CONTRACT=0x70A3eeB7DCff1979321E54513ac8697960797791
   ```

## Usage

Run the script with various options:

```bash
# Run with default configuration (random selection)
npm start

# Run all active configurations
node index.js
```

## Configuration

You can modify the swap configurations in `src/config/constants.js`:

### General Settings
```javascript
const CONFIG = {
  // Set to true to randomly select from active swap configurations
  useRandomSwap: true,
  
  // Set to true to use random amount between minAmount and maxAmount
  useRandomAmount: true,
  
  // Max gas price in gwei to use for transactions
  maxGasPrice: 1.5,
  
  // Maximum acceptable total cost percentage (shortfall + fee, abort if exceeded)
  maxAcceptableShortfallPercentage: 2,
  
  // Percentage buffer to add to shortfall amount (helps prevent transaction failures)
  shortfallBufferPercentage: 20,
  
  // Other settings...
}
```

### Token Addresses
```javascript
const TOKEN_ADDRESSES = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  // Other tokens...
};
```

### Combined Swap Configurations
```javascript
const COMBINED_SWAP_CONFIGS = [
  {
    name: "USDC → WETH → USDC (Bebop+Relay)",
    active: true,
    fromToken: TOKEN_ADDRESSES.USDC,
    toToken: TOKEN_ADDRESSES.WETH,
    // Random amount feature
    minAmount: 0.5 * 1e6, // 0.5 USDC with 6 decimals
    maxAmount: 2 * 1e6,   // 2 USDC with 6 decimals
    amount: 1 * 1e6,      // Default amount (used if random not enabled)
    description: "Swap USDC to WETH using Bebop, then back to USDC using Relay",
    service: "combined" // Use combined service
  }
];
```

## Notes

- The tool now exclusively uses the combined service (Bebop + Relay) for all swaps
- Random amount selection allows for dynamic swap amounts between the configured min and max values
- All transactions are executed with the wallet specified by the `PRIVATE_KEY` in `.env`
- Slippage protection will abort transactions if the total cost (shortfall + fee) exceeds the configured percentage 