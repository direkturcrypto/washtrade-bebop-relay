const { ethers } = require('ethers');
const { checkTokenAllowance, approveToken } = require('../utils/ethereum');
const relayService = require('./relayService');

/**
 * Execute a flashloan through Relay.link
 * @param {Object} provider Ethereum provider
 * @param {Object} wallet Ethers wallet
 * @param {string} fromToken Token to sell address
 * @param {string} toToken Token to buy address
 * @param {string} amount Amount to sell in token decimals
 * @param {string} flashloanContract Flashloan contract address
 * @returns {Promise<Object>} Transaction receipt
 */
const executeRelayFlashloan = async (
  provider,
  wallet,
  fromToken,
  toToken,
  amount,
  flashloanContract
) => {
  try {
    console.log(`\n🚀 Starting Relay.link flashloan process`);
    console.log(`💰 Swapping ${amount} of ${fromToken} to ${toToken}`);
    
    // 1. Request quote from Relay.link
    const quoteResponse = await relayService.requestQuote(
      fromToken,
      toToken,
      amount,
      wallet.address,
      flashloanContract
    );
    
    // 2. Extract the swap configuration for later use
    const swapConfig = {
      fromToken,
      toToken,
      amount
    };
    
    // 3. Prepare data for flashloan
    const flashloanData = relayService.prepareFlashloanData(
      quoteResponse,
      swapConfig,
      wallet.address
    );
    
    // 4. Check if approval is needed
    if (flashloanData.approvalTxData) {
      console.log(`⚠️ Token approval needed for ${fromToken}`);
      
      // Extract approval details from the transaction data
      const to = fromToken; // The token contract address
      const data = flashloanData.approvalTxData;
      
      // Approve the token
      const approvalTx = {
        to,
        data,
      };
      
      console.log(`🔓 Sending approval transaction...`);
      const approvalResponse = await wallet.sendTransaction(approvalTx);
      console.log(`✅ Approval sent! Waiting for confirmation...`);
      
      // Wait for approval to be confirmed
      const approvalReceipt = await approvalResponse.wait();
      console.log(`✅ Approval confirmed! Transaction hash: ${approvalReceipt.hash}`);
    } else {
      console.log(`✅ No approval needed for ${fromToken}`);
    }
    
    // 5. Execute the swap transaction
    const swapTx = {
      to: flashloanData.swapTxData.to || flashloanContract,
      data: flashloanData.swapTxData.data,
      value: flashloanData.swapTxData.value || '0',
    };
    
    console.log(`💱 Sending swap transaction to ${swapTx.to}...`);
    const swapResponse = await wallet.sendTransaction(swapTx);
    console.log(`🔄 Swap transaction sent! Waiting for confirmation...`);
    
    // Wait for swap to be confirmed
    const swapReceipt = await swapResponse.wait();
    console.log(`✅ Swap confirmed! Transaction hash: ${swapReceipt.hash}`);
    
    // Return detailed information about the transaction
    return {
      success: true,
      transactionHash: swapReceipt.hash,
      blockNumber: swapReceipt.blockNumber,
      requestId: flashloanData.requestId,
      inputToken: fromToken,
      outputToken: toToken,
      inputAmount: flashloanData.inputAmount,
      expectedOutputAmount: flashloanData.outputAmount,
    };
  } catch (error) {
    console.error(`❌ Error executing Relay.link flashloan:`, error.message);
    if (error.response) {
      console.error('🔴 API Response:', error.response.data);
    }
    throw error;
  }
};

module.exports = {
  executeRelayFlashloan
}; 