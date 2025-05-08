const axios = require('axios');
const { formatTokenAmount } = require('../utils/ethereum');

/**
 * Request a quote from Relay.link API
 * @param {string} fromToken Token to sell (address)
 * @param {string} toToken Token to buy (address)
 * @param {string} amount Amount to sell
 * @param {string} walletAddress User wallet address
 * @param {string} flashloanContract Flashloan contract address
 * @returns {Promise<Object>} Quote response
 */
const requestQuote = async (fromToken, toToken, amount, walletAddress, flashloanContract) => {
  try {
    const url = 'https://api.relay.link/quote';
    
    const payload = {
      user: walletAddress,
      originChainId: 8453, // Base chain
      destinationChainId: 8453, // Base chain
      originCurrency: fromToken,
      destinationCurrency: toToken,
      recipient: flashloanContract,
      tradeType: "EXACT_INPUT",
      amount: amount.toString(),
      referrer: "relay.link",
      useExternalLiquidity: false,
      useDepositAddress: false,
      topupGas: false,
      slippageTolerance: '50'
    };
    
    console.log(`🔍 Requesting Relay.link quote for ${fromToken} to ${toToken}...`);
    const response = await axios.post(url, payload);
    
    if (!response.data || !response.data.steps) {
      throw new Error('Invalid response from Relay.link API');
    }
    
    // Extract transaction data from the steps
    const transactions = extractTransactionsFromSteps(response.data.steps);
    
    // Extract currency information
    const currencyInfo = {
      in: response.data.details.currencyIn,
      out: response.data.details.currencyOut
    };
    
    // Log swap details
    console.log(`✅ Relay.link quote received:`);
    console.log(`📋 Request ID: ${transactions.requestId || 'Not available'}`);
    console.log(`📈 Input: ${currencyInfo.in.amountFormatted} ${currencyInfo.in.currency.symbol} (${currencyInfo.in.amount} raw)`);
    console.log(`📉 Output: ${currencyInfo.out.amountFormatted} ${currencyInfo.out.currency.symbol} (${currencyInfo.out.amount} raw)`);
    console.log(`⚙️ Transaction Steps: ${transactions.count}`);
    
    return {
      ...response.data,
      transactions
    };
  } catch (error) {
    console.error(`❌ Error requesting Relay.link quote:`, error.message);
    if (error.response) {
      console.error('🔴 API Response:', error.response.data);
    }
    throw error;
  }
};

/**
 * Extract transaction data from steps
 * @param {Array} steps Steps from Relay.link response
 * @returns {Object} Extracted transactions
 */
const extractTransactionsFromSteps = (steps) => {
  const transactions = {
    count: 0,
    approvalTx: null,
    swapTx: null,
    requestId: null
  };
  
  steps.forEach(step => {
    // Store the requestId from any step
    if (step.requestId && !transactions.requestId) {
      transactions.requestId = step.requestId;
    }
    
    if (step.items && step.items.length > 0) {
      step.items.forEach(item => {
        if (item.data) {
          transactions.count++;
          
          // Identify transaction type based on step id
          if (step.id === 'approve') {
            transactions.approvalTx = item.data;
          } else if (step.id === 'swap') {
            transactions.swapTx = item.data;
          }
        }
      });
    }
  });
  
  return transactions;
};

/**
 * Prepare data for flashloan from Relay.link response
 * @param {Object} quoteResponse Response from requestQuote
 * @param {Object} swapConfig The swap configuration
 * @returns {Object} Formatted data for flashloan
 */
const prepareFlashloanData = (quoteResponse, swapConfig, walletAddress) => {
  // Extract transactions data
  const { transactions } = quoteResponse;
  
  if (!transactions.swapTx || !transactions.swapTx.data) {
    throw new Error('Swap transaction data not found in response');
  }
  
  // Extract currency information
  const { currencyIn, currencyOut } = quoteResponse.details;
  
  // Calculate the expected returned amount
  const inputAmount = BigInt(currencyIn.amount);
  const outputAmount = BigInt(currencyOut.amount);
  
  return {
    swapTxData: transactions.swapTx.data,
    approvalTxData: transactions.approvalTx ? transactions.approvalTx.data : null,
    fromToken: swapConfig.fromToken,
    toToken: swapConfig.toToken,
    inputAmount: inputAmount.toString(),
    outputAmount: outputAmount.toString(),
    walletAddress,
    requestId: transactions.requestId
  };
};

module.exports = {
  requestQuote,
  extractTransactionsFromSteps,
  prepareFlashloanData
}; 