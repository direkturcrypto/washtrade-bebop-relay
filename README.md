# Bebop Flashloan Transaction Tool

A Node.js tool to execute transactions on the Base chain using Bebop API and flashloan contracts.

## Flow

1. Request inquiry from token A to token B (USDC -> WETH)
2. Check if approval is needed for the spender address from inquiry
3. Request inquiry from token B to token A (WETH -> USDC)
4. Execute flashloan transaction with both swap data included

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example` and fill in your values:
   ```
   RPC_URL=https://mainnet.base.org
   PRIVATE_KEY=your_private_key_here
   FLASHLOAN_CONTRACT=your_flashloan_contract_address_here
   ```

## Usage

Run the script with:

```bash
node index.js
```

## Configuration

You can modify the following values in the `main` function in `index.js`:

- `USDC_ADDRESS`: USDC token address on Base chain
- `WETH_ADDRESS`: WETH token address on Base chain
- `SELL_AMOUNT`: Amount of USDC to sell (in smallest units)
- `amountBorrow`: Amount to borrow from flashloan (currently set to 0 for testing)

## Notes

- This tool uses the Bebop API to get swap quotes
- The flashloan contract ABI is loaded from `abis/flashloan.json`
- All transactions are executed with the wallet specified by the `PRIVATE_KEY` in `.env` 