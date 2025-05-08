require('dotenv').config();
const { ethers } = require('ethers');

// Import constants
const { 
  FLASHLOAN_CONTRACT, 
  CONFIG,
  TOKEN_ADDRESSES
} = require('./src/config/constants');

// Import services
const bebopService = require('./src/services/bebopService');
const flashloanService = require('./src/services/flashloanService');
const relayService = require('./src/services/relayService');
const relayFlashloanService = require('./src/services/relayFlashloanService');
const combinedSwapService = require('./src/services/combinedSwapService');

// Import utilities
const {
  initializeProviderAndWallet,
  approveToken,
  checkTokenBalance,
  getFlashloanFeePercentage,
  calculateRequiredTokens,
  getTokenDecimals,
  formatTokenAmount
} = require('./src/utils/ethereum');

// Import swap manager
const {
  selectSwapConfiguration,
  displayAvailableConfigs,
  getActiveSwapConfigs,
  getSwapConfigsByService,
  delay
} = require('./src/utils/swapManager');

// Helper to resolve token symbol from address
function getTokenSymbolByAddress(address) {
  const entries = Object.entries(TOKEN_ADDRESSES);
  for (const [symbol, addr] of entries) {
    if (addr.toLowerCase() === address.toLowerCase()) return symbol;
  }
  return 'TOKEN';
}

/**
 * Execute a single swap cycle with Bebop service
 * @param {Object} wallet User wallet
 * @param {Object} swapConfig Configuration for this swap
 * @returns {Promise<boolean>} Success status
 */
const executeBebopSwapCycle = async (wallet, swapConfig) => {
  try {
    console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Starting Bebop swap cycle: ${swapConfig.name}`);
    
    // Flashloan contract
    const flashloanContract = new ethers.Contract(
      FLASHLOAN_CONTRACT,
      require('./abis/flashloan.json'),
      wallet
    );

    const fromToken = swapConfig.fromToken;
    const toToken = swapConfig.toToken;
    const amount = swapConfig.amount;

    // Get token decimals for better display
    const fromTokenDecimals = await getTokenDecimals(wallet, fromToken);
    const toTokenDecimals = await getTokenDecimals(wallet, toToken);
    
    console.log(`💱 Token info loaded: From (${fromTokenDecimals} decimals), To (${toTokenDecimals} decimals)`);
    console.log(`💲 Initial amount: ${formatTokenAmount(amount, fromTokenDecimals)}`);
    
    // Step 1: Request inquiry from token A to token B
    console.log(`📊 Step 1: Requesting inquiry from token A to token B...`);
    const inquiry1 = await bebopService.requestInquiry(
      toToken,
      fromToken,
      amount,
      wallet.address,
      wallet.address,
      FLASHLOAN_CONTRACT
    );
    
    // Step 2: Request inquiry from token B to token A
    console.log(`📊 Step 2: Requesting inquiry from token B to token A...`);
    // Use the buy amount from first inquiry as the sell amount for second inquiry
    if (!inquiry1.buyTokens[toToken] || !inquiry1.buyTokens[toToken].amount) {
      throw new Error("Missing buy amount in inquiry1 response");
    }
    
    const buyAmount = inquiry1.buyTokens[toToken].amount;
    const inquiry2 = await bebopService.requestInquiry(
      fromToken,
      toToken,
      buyAmount,
      wallet.address,
      wallet.address,
      FLASHLOAN_CONTRACT
    );
    
    // Calculate the shortfall
    const initialAmount = BigInt(amount);
    const returnedAmount = BigInt(inquiry2.buyTokens[fromToken].amount);
    const shortfallAmount = initialAmount - returnedAmount;
    
    console.log(`💵 Initial amount: ${formatTokenAmount(initialAmount, fromTokenDecimals)} (${initialAmount} raw)`);
    console.log(`💵 Returned amount: ${formatTokenAmount(returnedAmount, fromTokenDecimals)} (${returnedAmount} raw)`);
    console.log(`🔄 Shortfall amount: ${formatTokenAmount(shortfallAmount, fromTokenDecimals)} (${shortfallAmount} raw)`);
    
    // Get flashloan fee percentage
    const feePercentage = await getFlashloanFeePercentage(wallet, FLASHLOAN_CONTRACT);
    console.log(`💸 Flashloan fee percentage: ${feePercentage}%`);
    
    // Calculate total required tokens (shortfall + fee)
    const requiredTokensInfo = calculateRequiredTokens(shortfallAmount, feePercentage, fromTokenDecimals);
    console.log(`💰 Total required: ${requiredTokensInfo.formatted} (including ${requiredTokensInfo.feeFormatted} fee)`);
    
    // Check if user has enough tokens
    const userBalanceInfo = await checkTokenBalance(wallet, fromToken);
    console.log(`💳 User balance: ${userBalanceInfo.formatted} ${userBalanceInfo.symbol}`);
    
    // Validate if user has enough tokens
    if (userBalanceInfo.balance < requiredTokensInfo.required) {
      console.error('❌ Insufficient balance:');
      console.error(`   Required: ${requiredTokensInfo.formatted}`);
      console.error(`   Available: ${userBalanceInfo.formatted}`);
      console.error(`   Missing: ${formatTokenAmount(requiredTokensInfo.required - userBalanceInfo.balance, fromTokenDecimals)}`);
      throw new Error("Insufficient balance to cover shortfall and fee");
    }
    
    console.log('✅ Sufficient balance to cover shortfall and fee');
    
    // If there's a shortfall, we need to approve the token for the flashloan contract
    if (shortfallAmount > 0n) {
      console.log(`🔑 Need to approve token for the flashloan contract to handle ${formatTokenAmount(shortfallAmount, fromTokenDecimals)} shortfall`);
      
      const approvalSuccess = await approveToken(wallet, fromToken, FLASHLOAN_CONTRACT);
      if (!approvalSuccess) {
        throw new Error("Failed to approve token for flashloan contract");
      }
    }
    
    // Validate inquiry transaction data
    if (!inquiry1.tx || !inquiry1.tx.data) {
      throw new Error("Missing transaction data in inquiry1 response");
    }
    
    if (!inquiry2.tx || !inquiry2.tx.data) {
      throw new Error("Missing transaction data in inquiry2 response");
    }
    
    // Step 3: Execute flashloan
    console.log('🔄 Step 3: Preparing flashloan transaction...');
    
    // We need to borrow the initial amount
    const amountBorrow = amount;
    console.log(`🏦 Setting borrow amount to: ${formatTokenAmount(amountBorrow, fromTokenDecimals)}`);
    
    // Generate flashloan payload
    const flashloanPayloadArr = flashloanService.generatePayload(
      amountBorrow,
      shortfallAmount.toString(),
      inquiry1.tx.data,
      inquiry2.tx.data,
      FLASHLOAN_CONTRACT,
      wallet.address,
      swapConfig,
      inquiry1.approvalTarget
    );
    
    // Encode the data for flashloan
    const flashloanPayload = await flashloanService.encodeFlashloanData(
      flashloanContract, 
      JSON.parse(flashloanPayloadArr)
    );
    
    // Execute the flashloan
    await flashloanService.executeFlashloan(
      wallet,
      FLASHLOAN_CONTRACT,
      fromToken, // Token to borrow
      amountBorrow,
      flashloanPayload,
      { maxGasPrice: CONFIG.maxGasPrice }
    );
    
    console.log('✅ Bebop swap cycle completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return true;
  } catch (error) {
    console.error('❌ Error in Bebop swap cycle:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return false;
  }
};

/**
 * Execute a single swap cycle with Relay service
 * @param {Object} wallet User wallet
 * @param {Object} provider Ethereum provider
 * @param {Object} swapConfig Configuration for this swap
 * @returns {Promise<boolean>} Success status
 */
const executeRelaySwapCycle = async (wallet, provider, swapConfig) => {
  try {
    console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Starting Relay swap cycle: ${swapConfig.name}`);
    
    const fromToken = swapConfig.fromToken;
    const toToken = swapConfig.toToken;
    const amount = swapConfig.amount;

    // Get token decimals for better display
    const fromTokenDecimals = await getTokenDecimals(wallet, fromToken);
    const toTokenDecimals = await getTokenDecimals(wallet, toToken);
    
    console.log(`💱 Token info loaded: From (${fromTokenDecimals} decimals), To (${toTokenDecimals} decimals)`);
    console.log(`💲 Initial amount: ${formatTokenAmount(amount, fromTokenDecimals)}`);
    
    // Check token balance
    const userBalanceInfo = await checkTokenBalance(wallet, fromToken);
    console.log(`💳 User balance: ${userBalanceInfo.formatted} ${userBalanceInfo.symbol}`);
    
    // Validate if user has enough tokens
    if (userBalanceInfo.balance < BigInt(amount)) {
      console.error('❌ Insufficient balance:');
      console.error(`   Required: ${formatTokenAmount(amount, fromTokenDecimals)}`);
      console.error(`   Available: ${userBalanceInfo.formatted}`);
      throw new Error("Insufficient balance for swap");
    }
    
    console.log('✅ Sufficient balance for swap');
    
    // Execute the relay flashloan
    const result = await relayFlashloanService.executeRelayFlashloan(
      provider,
      wallet,
      fromToken,
      toToken,
      amount,
      FLASHLOAN_CONTRACT
    );
    
    console.log('✅ Relay swap cycle completed successfully!');
    console.log(`💲 Transaction hash: ${result.transactionHash}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return true;
  } catch (error) {
    console.error('❌ Error in Relay swap cycle:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return false;
  }
};

/**
 * Execute a combined swap cycle using Bebop for first swap and Relay for second swap
 * @param {Object} wallet User wallet
 * @param {Object} provider Ethereum provider
 * @param {Object} swapConfig Configuration for this swap
 * @returns {Promise<boolean>} Success status
 */
const executeCombinedSwapCycle = async (wallet, provider, swapConfig) => {
  return await combinedSwapService.executeCombinedSwapCycle(
    wallet,
    provider,
    swapConfig,
    FLASHLOAN_CONTRACT
  );
};

/**
 * Execute a single swap cycle based on the service type
 * @param {Object} wallet User wallet
 * @param {Object} provider Ethereum provider
 * @param {Object} swapConfig Configuration for this swap
 * @returns {Promise<boolean>} Success status
 */
const executeSwapCycle = async (wallet, provider, swapConfig) => {
  const service = swapConfig.service || 'bebop';
  
  switch (service) {
    case 'relay':
      return executeRelaySwapCycle(wallet, provider, swapConfig);
    case 'combined': {
      const result = await executeCombinedSwapCycle(wallet, provider, swapConfig);
      if (result && result.success) {
        // Format values for summary
        const { amountSwapped, shortfallPaid, fromTokenDecimals, fromToken } = result;
        const formattedAmount = formatTokenAmount(amountSwapped, fromTokenDecimals);
        const formattedFee = formatTokenAmount(shortfallPaid, fromTokenDecimals);
        const symbol = getTokenSymbolByAddress(fromToken);
        console.log(`\n📊 SUMMARY: Swapped ${formattedAmount} ${symbol} with total fees ${formattedFee} ${symbol}`);
      }
      return result;
    }
    case 'bebop':
    default:
      return executeBebopSwapCycle(wallet, swapConfig);
  }
};

// Helper to get a random integer between min and max (inclusive)
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Main function to execute the entire flow
 * This application now only uses the combined service (Bebop + Relay)
 */
const main = async () => {
  try {
    console.log('🚀 Starting Flashloan Tool');
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    let configIndex = null;
    let runAll = false;
    
    // Always use combined service
    const serviceType = 'combined';
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--config' && args[i+1]) {
        configIndex = parseInt(args[i+1]);
        i++; // Skip next argument
      } else if (args[i] === '--all') {
        runAll = true;
      } else if (args[i] === '--help') {
        console.log('Usage: node index.js [options]');
        console.log('Options:');
        console.log('  --config <index>   Run a specific swap configuration');
        console.log('  --all              Run all active swap configurations');
        console.log('  --help             Show this help message');
        return;
      }
    }
    
    // Initialize provider and wallet
    const { provider, wallet } = initializeProviderAndWallet();
    console.log(`🔌 Connected to Base chain with wallet: ${wallet.address}`);
    
    // Display available configurations
    displayAvailableConfigs(serviceType);
    
    // Get active configs (only from combined service)
    const activeConfigs = getSwapConfigsByService(serviceType);
    
    if (activeConfigs.length === 0) {
      console.error(`❌ No active swap configurations found for combined service`);
      return;
    }
    
    // Run a specific or random configuration in an infinite repeat loop
    const selectedConfig = await selectSwapConfiguration(wallet, configIndex, serviceType);
    while (true) {
      const result = await executeSwapCycle(wallet, provider, selectedConfig);
      if (result && result.success) {
        // Wait a random delay between minDelaySeconds and maxDelaySeconds
        const minDelay = CONFIG.minDelaySeconds;
        const maxDelay = CONFIG.maxDelaySeconds;
        const delaySeconds = getRandomInt(minDelay, maxDelay);
        console.log(`⏳ Waiting ${delaySeconds} seconds before next swap...`);
        await delay(delaySeconds);
      } else {
        console.log('🔁 Retrying in 10 seconds immediately due to failure...');
        await delay(10);
      }
    }
  } catch (error) {
    console.error('❌ Error in main flow:', error);
    process.exit(1);
  }
};

// Run the main function
main().catch(console.error);
