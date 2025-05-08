const axios = require('axios');
const { formatTokenAmount } = require('../utils/ethereum');

/**
 * Request inquiry from Bebop API
 * @param {string} buyToken Token to buy
 * @param {string} sellToken Token to sell
 * @param {string} sellAmount Amount to sell
 * @param {string} takerAddress Wallet address
 * @param {string} receiverAddress Optional receiver address
 * @returns {Promise<Object>} Inquiry response
 */
const requestInquiry = async (buyToken, sellToken, sellAmount, takerAddress, originAddress = takerAddress, receiverAddress) => {
  try {
    const url = `https://api.bebop.xyz/pmm/base/v3/quote?buy_tokens=${buyToken}&sell_tokens=${sellToken}&sell_amounts=${sellAmount}&taker_address=${takerAddress}&gasless=false&skip_validation=true&receiver_address=${receiverAddress || takerAddress}&origin_address=${originAddress}`;
    
    console.log(`🔍 Requesting inquiry from ${sellToken} to ${buyToken}...`);
    const response = await axios.get(url);
    
    if (!response.data || response.data.status !== 'SIG_SUCCESS') {
      throw new Error(`API returned unsuccessful status: ${response.data?.status || 'No status'}`);
    }
    
    if (!response.data.buyTokens || !response.data.buyTokens[buyToken]) {
      throw new Error(`Buy token ${buyToken} not found in response`);
    }
    
    if (!response.data.sellTokens || !response.data.sellTokens[sellToken]) {
      throw new Error(`Sell token ${sellToken} not found in response`);
    }
    
    // Get token decimals from response
    const buyTokenData = response.data.buyTokens[buyToken];
    const sellTokenData = response.data.sellTokens[sellToken];
    
    // Format token amounts for display
    const formattedBuyAmount = formatTokenAmount(
      buyTokenData.amount,
      buyTokenData.decimals
    );
    
    const formattedSellAmount = formatTokenAmount(
      sellTokenData.amount,
      sellTokenData.decimals
    );
    
    console.log(`✅ Inquiry response for ${sellToken} to ${buyToken}:`);
    console.log(`📋 Quote ID: ${response.data.quoteId}`);
    console.log(`📈 Buy Amount: ${formattedBuyAmount} ${buyTokenData.symbol} (${buyTokenData.amount} raw)`);
    console.log(`📉 Sell Amount: ${formattedSellAmount} ${sellTokenData.symbol} (${sellTokenData.amount} raw)`);
    
    // Add formatted amounts to the response
    response.data.buyTokens[buyToken].formattedAmount = formattedBuyAmount;
    response.data.sellTokens[sellToken].formattedAmount = formattedSellAmount;
    
    return response.data;
  } catch (error) {
    console.error(`❌ Error requesting inquiry from ${sellToken} to ${buyToken}:`, error.message);
    if (error.response) {
      console.error('🔴 API Response:', error.response.data);
    }
    throw error;
  }
};

module.exports = {
  requestInquiry
}; 