require('dotenv').config();
const { ethers } = require('ethers');

// Import constants
const { 
  FLASHLOAN_CONTRACT, 
  CONFIG
} = require('./src/config/constants');

// Import services
const bebopService = require('./src/services/bebopService');
const flashloanService = require('./src/services/flashloanService');

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
  delay
} = require('./src/utils/swapManager');

/**
 * Execute a single swap cycle
 * @param {Object} wallet User wallet
 * @param {Object} swapConfig Configuration for this swap
 * @returns {Promise<boolean>} Success status
 */
const executeSwapCycle = async (wallet, swapConfig) => {
  try {
    console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Starting swap cycle: ${swapConfig.name}`);
    
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
      FLASHLOAN_CONTRACT,
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
      FLASHLOAN_CONTRACT,
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
      swapConfig
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
    
    console.log('✅ Swap cycle completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return true;
  } catch (error) {
    console.error('❌ Error in swap cycle:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return false;
  }
};

/**
 * Main function to execute the entire flow
 */
const main = async () => {
  try {
    console.log('🚀 Starting Bebop Flashloan Tool');
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    let configIndex = null;
    let runAll = false;
    
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
        console.log('  --config <index>  Run a specific swap configuration');
        console.log('  --all             Run all active swap configurations');
        console.log('  --help            Show this help message');
        return;
      }
    }
    
    // Initialize provider and wallet
    const { wallet } = initializeProviderAndWallet();
    console.log(`🔌 Connected to Base chain with wallet: ${wallet.address}`);
    
    // Display available configurations
    displayAvailableConfigs();
    
    // Get active configs
    const activeConfigs = getActiveSwapConfigs();
    if (activeConfigs.length === 0) {
      console.error('❌ No active swap configurations found');
      return;
    }
    
    // Run all active configurations
    if (runAll) {
      console.log('🔄 Running all active swap configurations...');
      
      for (let i = 0; i < activeConfigs.length; i++) {
        const config = activeConfigs[i];
        console.log(`🔢 Running configuration ${i+1}/${activeConfigs.length}: ${config.name}`);
        
        await executeSwapCycle(wallet, config);
        
        // Add delay between swaps if not the last one
        if (i < activeConfigs.length - 1) {
          console.log(`⏳ Waiting ${CONFIG.delayBetweenSwaps} seconds before next swap...`);
          await delay(CONFIG.delayBetweenSwaps);
        }
      }
      
      console.log('🎉 All swap configurations completed!');
      return;
    }
    
    // Run a specific or random configuration
    const selectedConfig = await selectSwapConfiguration(wallet, configIndex);
    await executeSwapCycle(wallet, selectedConfig);
    
    console.log('🎉 Transaction flow completed successfully!');
  } catch (error) {
    console.error('❌ Error in main flow:', error);
    process.exit(1);
  }
};

// Run the main function
main().catch(console.error);
