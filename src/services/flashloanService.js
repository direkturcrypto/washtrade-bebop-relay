const { ethers } = require('ethers');
const { BEBOP_ROUTER } = require('../config/constants');
const { formatTokenAmount, getTokenDecimals } = require('../utils/ethereum');
const flashloanABI = require('../../abis/flashloan.json');

/**
 * Generate flashloan payload
 * @param {string} amountBorrow Amount to borrow
 * @param {string} shortfallAmount Amount of token shortfall to handle
 * @param {string} dataSwap1 Swap 1 data
 * @param {string} dataSwap2 Swap 2 data
 * @param {string} contractAddr Flashloan contract address
 * @param {string} signerAddress Signer address
 * @param {Object} swapConfig Swap configuration with fromToken and toToken
 * @returns {string} JSON string payload
 */
const generatePayload = (
  amountBorrow,
  shortfallAmount, 
  dataSwap1, 
  dataSwap2, 
  contractAddr,
  signerAddress,
  swapConfig,
  routerAddress = BEBOP_ROUTER
) => {
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
      [signerAddress, contractAddr, shortfallAmount]
    );
    payloads.push([contractAddr, fromToken, 0, transferFromPayload]);
  }
  
  // Always approve router for both tokens
  const approveFromTokenPayload = tokenIface.encodeFunctionData(
    "approve", 
    [routerAddress, ethers.MaxUint256]
  );
  
  const approveToTokenPayload = tokenIface.encodeFunctionData(
    "approve", 
    [routerAddress, ethers.MaxUint256]
  );
  
  // Add approvals first
  payloads.push(
    [contractAddr, fromToken, 0, approveFromTokenPayload],
    [contractAddr, toToken, 0, approveToTokenPayload]
  );
  
  // Add swap operations
  payloads.push(
    [contractAddr, routerAddress, 0, dataSwap1],
    [contractAddr, routerAddress, 0, dataSwap2]
  );
  
  console.log(`📦 Generated ${payloads.length} payload operations`);
  return JSON.stringify(payloads);
};

/**
 * Encode bulk payload data
 * @param {Object} flashloanContract Flashloan contract
 * @param {Array} payloadData Payload data array
 * @returns {Promise<string>} Encoded data
 */
const encodeFlashloanData = async (flashloanContract, payloadData) => {
  try {
    console.log(`🔄 Encoding ${payloadData.length} payload operations`);
    
    // Log a sample of the payload data for debugging
    if (payloadData.length > 0) {
      console.log('📄 Sample payload operation:', 
        JSON.stringify(payloadData[0])
          .substring(0, 100) + '...');
    }
    
    const encodedData = await flashloanContract.encodeData(payloadData);
    console.log('✅ Payload data encoded successfully');
    return encodedData;
  } catch (error) {
    console.error('❌ Error encoding flashloan data:', error.message);
    if (error.code && error.code === 'CALL_EXCEPTION') {
      console.error('🔴 Contract call error details:', error.error?.message || 'Unknown error');
    }
    throw error;
  }
};

/**
 * Execute flashloan transaction
 * @param {Object} wallet Ethers wallet
 * @param {string} flashloanContractAddress Flashloan contract address
 * @param {string} tokenAddress Token address to borrow
 * @param {string} amountBorrow Amount to borrow
 * @param {string} flashloanPayload Encoded flashloan payload
 * @param {Object} config Configuration options
 * @returns {Promise<Object>} Transaction result
 */
const executeFlashloan = async (
  wallet, 
  flashloanContractAddress, 
  tokenAddress, 
  amountBorrow, 
  flashloanPayload,
  config = {}
) => {
  try {
    const flashloanContract = new ethers.Contract(
      flashloanContractAddress,
      flashloanABI,
      wallet
    );
    
    // Get token decimals for better display
    const tokenDecimals = await getTokenDecimals(wallet, tokenAddress);
    const formattedAmount = formatTokenAmount(amountBorrow, tokenDecimals);
    
    console.log(`🚀 Executing flashloan for ${formattedAmount} tokens (${amountBorrow} raw)...`);
    
    // First estimate gas to ensure the transaction will succeed
    const estimatedGas = await flashloanContract.utang.estimateGas(
      [tokenAddress],
      [amountBorrow],
      flashloanPayload
    );
    
    console.log(`⛽ Estimated gas: ${estimatedGas} units`);
    return;
    
    // Add a buffer to the estimated gas
    const gasLimit = Math.floor(Number(estimatedGas) * 1.2);
    
    // Set up transaction options
    const txOptions = {
      gasLimit
    };
    
    // Add gas price if specified in config
    if (config.maxGasPrice) {
      txOptions.gasPrice = ethers.parseUnits(config.maxGasPrice.toString(), "gwei");
      console.log(`💰 Setting max gas price: ${config.maxGasPrice} gwei`);
    }
    
    // Now execute the actual transaction
    const tx = await flashloanContract.utang(
      [tokenAddress],
      [amountBorrow],
      flashloanPayload,
      txOptions
    );
    
    console.log(`📝 Flashloan transaction submitted: ${tx.hash}`);
    console.log('⏳ Waiting for transaction confirmation...');
    
    const receipt = await tx.wait();
    console.log(`✅ Flashloan transaction successful: ${receipt.hash}`);
    return receipt;
  } catch (error) {
    console.error('❌ Error executing flashloan:', error.message);
    throw error;
  }
};

module.exports = {
  generatePayload,
  encodeFlashloanData,
  executeFlashloan
}; 