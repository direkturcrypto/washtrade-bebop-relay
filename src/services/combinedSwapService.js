const { ethers } = require('ethers');
const bebopService = require('./bebopService');
const relayService = require('./relayService');
const flashloanService = require('./flashloanService');
const { BEBOP_ROUTER, RELAY_ROUTER, CONFIG } = require('../config/constants');
const { 
  getTokenDecimals, 
  formatTokenAmount,
  getFlashloanFeePercentage,
  calculateRequiredTokens,
  checkTokenBalance,
  approveToken
} = require('../utils/ethereum');

/**
 * Execute a combined swap cycle using Bebop for first swap and Relay for second swap
 * @param {Object} wallet User wallet
 * @param {Object} provider Ethereum provider
 * @param {Object} swapConfig Configuration for this swap
 * @param {string} flashloanContract Flashloan contract address
 * @returns {Promise<boolean>} Success status
 */
const executeCombinedSwapCycle = async (wallet, provider, swapConfig, flashloanContract) => {
  try {
    console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Starting Combined Swap Cycle: ${swapConfig.name || 'Bebop + Relay'}`);
    
    // Get flashloan contract instance
    const flashloanContractInstance = new ethers.Contract(
      flashloanContract,
      require('../../abis/flashloan.json'),
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
    
    // Step 1: Request inquiry from token A to token B using BEBOP for first swap
    console.log(`📊 Step 1: Requesting Bebop inquiry from ${fromToken} to ${toToken}...`);
    const inquiry1 = await bebopService.requestInquiry(
      toToken,
      fromToken,
      amount,
      flashloanContract,
      wallet.address,
      flashloanContract
    );
    
    // Validate inquiry1 results
    if (!inquiry1.buyTokens[toToken] || !inquiry1.buyTokens[toToken].amount) {
      throw new Error("Missing buy amount in Bebop inquiry response");
    }
    
    // Get the amount of toToken we'll receive from the first swap
    const buyAmount = inquiry1.buyTokens[toToken].amount;
    console.log(`💱 Bebop first swap result: ${formatTokenAmount(buyAmount, toTokenDecimals)} ${inquiry1.buyTokens[toToken].symbol}`);
    
    // Step 2: Request quote from token B to token A using RELAY for second swap
    console.log(`📊 Step 2: Requesting Relay quote from ${toToken} to ${fromToken}...`);
    
    const relayResponse = await relayService.requestQuote(
      toToken,
      fromToken,
      buyAmount,
      wallet.address,
      flashloanContract
    );
    
    // Prepare data for the relay flashloan
    const relayConfig = {
      fromToken: toToken,
      toToken: fromToken,
      amount: buyAmount
    };
    
    const relayFlashloanData = relayService.prepareFlashloanData(
      relayResponse,
      relayConfig,
      wallet.address
    );
    
    // Calculate the shortfall
    const initialAmount = BigInt(amount);
    const returnedAmount = BigInt(relayFlashloanData.outputAmount);
    let shortfallAmount = initialAmount - returnedAmount;
    
    console.log(`💵 Initial amount: ${formatTokenAmount(initialAmount, fromTokenDecimals)} (${initialAmount} raw)`);
    console.log(`💵 Returned amount: ${formatTokenAmount(returnedAmount, fromTokenDecimals)} (${returnedAmount} raw)`);
    console.log(`🔄 Base shortfall amount: ${formatTokenAmount(shortfallAmount, fromTokenDecimals)} (${shortfallAmount} raw)`);
    
    // Add 20% buffer to shortfall amount to ensure there's enough to cover all costs
    const bufferPercentage = CONFIG.shortfallBufferPercentage;
    const shortfallBuffer = (shortfallAmount * BigInt(bufferPercentage)) / BigInt(100);
    const originalShortfall = shortfallAmount;
    shortfallAmount = shortfallAmount + shortfallBuffer;
    
    console.log(`🛡️ Adding ${bufferPercentage}% buffer: ${formatTokenAmount(shortfallBuffer, fromTokenDecimals)} (${shortfallBuffer} raw)`);
    console.log(`🔄 Adjusted shortfall amount: ${formatTokenAmount(shortfallAmount, fromTokenDecimals)} (${shortfallAmount} raw)`);
    
    // Get flashloan fee percentage
    const feePercentage = await getFlashloanFeePercentage(wallet, flashloanContract);
    console.log(`💸 Flashloan fee percentage: ${feePercentage}%`);
    
    // Calculate total required tokens (shortfall + fee)
    const requiredTokensInfo = calculateRequiredTokens(shortfallAmount, feePercentage, fromTokenDecimals);
    console.log(`💰 Total required: ${requiredTokensInfo.formatted} (including ${requiredTokensInfo.feeFormatted} fee)`);
    
    // Check if combined shortfall + fee is too high
    const maxAcceptableShortfallPercentage = CONFIG.maxAcceptableShortfallPercentage;
    
    // Calculate combined percentage (shortfall + fee) with decimal precision
    const totalCost = BigInt(requiredTokensInfo.required);
    const totalCostPercentage = Number((Number(totalCost) * 100) / Number(initialAmount));
    const formattedTotalCostPercentage = totalCostPercentage.toFixed(2);
    
    console.log(`📊 Total cost percentage (shortfall + fee): ${formattedTotalCostPercentage}%`);
    
    if (totalCostPercentage > maxAcceptableShortfallPercentage) {
      console.error(`❌ Total cost too high: ${formattedTotalCostPercentage}% > ${maxAcceptableShortfallPercentage}%`);
      console.error(`❌ Transaction would result in excessive cost. Aborting execution.`);
      return false;
    }
    
    console.log(`✅ Total cost within acceptable range (${formattedTotalCostPercentage}% ≤ ${maxAcceptableShortfallPercentage}%)`);
    
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
      
      const approvalSuccess = await approveToken(wallet, fromToken, flashloanContract);
      if (!approvalSuccess) {
        throw new Error("Failed to approve token for flashloan contract");
      }
    }
    
    // Validate transaction data
    if (!inquiry1.tx || !inquiry1.tx.data) {
      throw new Error("Missing transaction data in Bebop inquiry response");
    }
    
    if (!relayFlashloanData.swapTxData) {
      throw new Error("Missing transaction data in Relay response");
    }
    
    // Step 3: Execute flashloan with both swap transactions in a single call
    console.log('🔄 Step 3: Preparing flashloan transaction with both Bebop and Relay swaps...');
    
    // We need to borrow the initial amount
    const amountBorrow = amount;
    console.log(`🏦 Setting borrow amount to: ${formatTokenAmount(amountBorrow, fromTokenDecimals)}`);
    
    // Generate flashloan payload - using Bebop data for first swap and Relay data for second swap
    const flashloanPayloadArr = generateCombinedPayload(
      amountBorrow,
      shortfallAmount.toString(),
      inquiry1.tx.data,          // Bebop first swap data
      relayFlashloanData.swapTxData,  // Relay second swap data
      flashloanContract,
      wallet.address,
      swapConfig,
      BEBOP_ROUTER,
      RELAY_ROUTER
    );
    
    // Encode the data for flashloan
    const flashloanPayload = await flashloanService.encodeFlashloanData(
      flashloanContractInstance, 
      JSON.parse(flashloanPayloadArr)
    );
    
    // Execute the flashloan - this will execute both swaps in a single transaction
    console.log('💫 Executing flashloan with both Bebop and Relay swaps in a single transaction...');
    await flashloanService.executeFlashloan(
      wallet,
      flashloanContract,
      fromToken, // Token to borrow
      amountBorrow,
      flashloanPayload,
      { maxGasPrice: 1.5 } // Use a reasonable gas price
    );
    
    console.log('✅ Combined swap cycle completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Return summary info
    return {
      success: true,
      amountSwapped: amount,
      shortfallPaid: shortfallAmount.toString(),
      shortfallBuffer: shortfallBuffer.toString(),
      feePercentage,
      fromToken,
      fromTokenDecimals,
      fromTokenSymbol: inquiry1.buyTokens[fromToken]?.symbol || 'TOKEN'
    };
  } catch (error) {
    console.error('❌ Error in combined swap cycle:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return { success: false, error };
  }
};

/**
 * Generate a combined payload for the flashloan that includes both Bebop and Relay swap data
 * @param {string} borrowAmount Amount to borrow
 * @param {string} shortfallAmount Shortfall amount
 * @param {string} bebopSwapData Transaction data for first swap (Bebop)
 * @param {string} relaySwapData Transaction data for second swap (Relay)
 * @param {string} flashloanContract Flashloan contract address
 * @param {string} walletAddress User wallet address
 * @param {Object} swapConfig Swap configuration
 * @param {string} bebopRouter Bebop router address
 * @param {string} relayRouter Relay router address
 * @returns {string} Flashloan payload as JSON string
 */
const generateCombinedPayload = (
  borrowAmount,
  shortfallAmount,
  bebopSwapData,
  relaySwapData,
  flashloanContract,
  walletAddress,
  swapConfig,
  bebopRouter = BEBOP_ROUTER,
  relayRouter = RELAY_ROUTER
) => {
  console.log(`🔧 Generating combined payload with Bebop and Relay data...`);
  console.log(`🧩 First swap: Bebop (${bebopSwapData.substring(0, 20)}...)`);
  console.log(`🧩 Second swap: Relay (${relaySwapData.substring(0, 20)}...)`);
  
  const tokenIface = new ethers.Interface([
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ]);

  // Extract tokens from swap config
  const fromToken = swapConfig.fromToken;
  const toToken = swapConfig.toToken;

  // Create payload elements
  // 1. Transfer shortfall from contract to signer if needed
  let payloads = [];
  
  if (BigInt(shortfallAmount) > 0) {
    // If there's a shortfall, we need to handle it
    console.log(`💰 Adding shortfall handling operations for ${shortfallAmount} (raw)`);
    
    // Get shortfall amount from signer to contract
    const transferFromPayload = tokenIface.encodeFunctionData(
      "transferFrom",
      [walletAddress, flashloanContract, shortfallAmount]
    );
    payloads.push([flashloanContract, fromToken, 0, transferFromPayload]);
  }
  
  // Always approve router for both tokens
  const approveFromTokenPayload = tokenIface.encodeFunctionData(
    "approve", 
    [bebopRouter, ethers.MaxUint256]
  );
  
  const approveToTokenPayload = tokenIface.encodeFunctionData(
    "approve", 
    [bebopRouter, ethers.MaxUint256]
  );
  
  // Add approvals first
  payloads.push(
    [flashloanContract, fromToken, 0, approveFromTokenPayload],
    [flashloanContract, toToken, 0, approveToTokenPayload]
  );
  
  // Also approve the relay router
  const approveRelayRouterPayload = tokenIface.encodeFunctionData(
    "approve", 
    [relayRouter, ethers.MaxUint256]
  );
  
  payloads.push(
    [flashloanContract, fromToken, 0, approveRelayRouterPayload],
    [flashloanContract, toToken, 0, approveRelayRouterPayload]
  );
  
  // Add swap operations
  // Bebop swap (first swap)
  payloads.push([flashloanContract, bebopRouter, 0, bebopSwapData]);
  
  // Relay swap (second swap) - extracted to router address from the payload
  // For relay, we'll use the raw swap data which already contains the router address
  const relayObject = extractRelaySwapTxDetails(relaySwapData, relayRouter);
  payloads.push([flashloanContract, relayObject.to, 0, relayObject.data]);
  
  console.log(`📦 Generated ${payloads.length} payload operations`);
  
  return JSON.stringify(payloads);
};

/**
 * Extract transaction details from Relay swap data
 * @param {string} relaySwapData Relay swap transaction data
 * @param {string} defaultRouter Default relay router address
 * @returns {Object} Transaction details with to and data fields
 */
const extractRelaySwapTxDetails = (relaySwapData, defaultRouter = RELAY_ROUTER) => {
  try {
    // If relaySwapData is an object with to and data fields, extract them
    if (typeof relaySwapData === 'object' && relaySwapData.to && relaySwapData.data) {
      return {
        to: relaySwapData.to,
        data: relaySwapData.data
      };
    }
    
    // If relaySwapData is a string, assume it's just the data part
    // and use the default relay router
    return {
      to: defaultRouter,
      data: relaySwapData
    };
  } catch (error) {
    console.error('❌ Error extracting relay swap details:', error);
    // Return defaults as fallback
    return {
      to: defaultRouter,
      data: relaySwapData
    };
  }
};

module.exports = {
  executeCombinedSwapCycle,
  generateCombinedPayload
}; 