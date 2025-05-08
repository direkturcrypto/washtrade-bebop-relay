const { ethers } = require('ethers');
const { RPC_URL, PRIVATE_KEY } = require('../config/constants');
const tokenABI = require('../../abis/erc20.json');
const flashloanABI = require('../../abis/flashloan.json');

/**
 * Initialize provider
 * @returns {Object} Ethers provider
 */
const initializeProvider = () => {
  return new ethers.JsonRpcProvider(RPC_URL);
};

/**
 * Initialize wallet with provider
 * @param {Object} provider Ethers provider
 * @returns {Object} Ethers wallet
 */
const initializeWallet = (provider) => {
  return new ethers.Wallet(PRIVATE_KEY, provider);
};

/**
 * Initialize provider and wallet
 * @returns {Object} Object containing provider, wallet, and signer
 */
const initializeProviderAndWallet = () => {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  return { provider, wallet };
};

/**
 * Get token decimals
 * @param {Object} wallet Ethers wallet
 * @param {string} tokenAddress Token address
 * @returns {Promise<number>} Token decimals
 */
const getTokenDecimals = async (wallet, tokenAddress) => {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
    const decimals = await tokenContract.decimals();
    return decimals;
  } catch (error) {
    console.error(`❌ Error getting decimals for token ${tokenAddress}:`, error.message);
    // Return default decimals based on common tokens
    if (tokenAddress.toLowerCase() === '0x4200000000000000000000000000000000000006') {
      return 18; // WETH typically has 18 decimals
    } else if (tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
      return 6; // USDC typically has 6 decimals
    }
    return 18; // Default to 18 decimals
  }
};

/**
 * Format token amount to human-readable string
 * @param {string|bigint} amount Raw token amount
 * @param {number} decimals Token decimals
 * @param {number} displayDecimals Number of decimals to display
 * @returns {string} Formatted amount
 */
const formatTokenAmount = (amount, decimals, displayDecimals = 6) => {
  try {
    const bigintAmount = BigInt(amount);
    const divisor = BigInt(10) ** BigInt(decimals);
    const integerPart = bigintAmount / divisor;
    
    // Calculate decimal part with specified precision
    const decimalFactor = BigInt(10) ** BigInt(displayDecimals);
    const decimalPart = ((bigintAmount * decimalFactor) / divisor) % decimalFactor;
    
    // Format the decimal part with leading zeros if needed
    const decimalStr = decimalPart.toString().padStart(displayDecimals, '0');
    
    return `${integerPart}.${decimalStr}`;
  } catch (error) {
    console.error('❌ Error formatting token amount:', error.message);
    return amount.toString();
  }
};

/**
 * Check token approval status
 * @param {Object} wallet Ethers wallet
 * @param {string} tokenAddress Token address to check
 * @param {string} spenderAddress Spender address
 * @returns {Promise<boolean>} Approval status
 */
const checkApproval = async (wallet, tokenAddress, spenderAddress) => {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
    const allowance = await tokenContract.allowance(wallet.address, spenderAddress);
    
    return allowance > 0n;
  } catch (error) {
    console.error('❌ Error checking approval:', error.message);
    return false;
  }
};

/**
 * Approve token if not approved
 * @param {Object} wallet Ethers wallet
 * @param {string} tokenAddress Token to approve
 * @param {string} spenderAddress Spender to approve
 * @returns {Promise<boolean>} Approval transaction success
 */
const approveToken = async (wallet, tokenAddress, spenderAddress) => {
  try {
    const isApproved = await checkApproval(wallet, tokenAddress, spenderAddress);
    
    if (isApproved) {
      console.log(`✅ Token ${tokenAddress} already approved for ${spenderAddress}`);
      return true;
    }
    
    console.log(`🔑 Approving token ${tokenAddress} for ${spenderAddress}...`);
    
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
    const tx = await tokenContract.approve(
      spenderAddress,
      ethers.MaxUint256
    );
    
    await tx.wait();
    console.log(`✅ Approval successful: ${tx.hash}`);
    return true;
  } catch (error) {
    console.error('❌ Error approving token:', error.message);
    return false;
  }
};

/**
 * Check token balance
 * @param {Object} wallet Ethers wallet
 * @param {string} tokenAddress Token address to check
 * @returns {Promise<{balance: bigint, decimals: number, formatted: string}>} Token balance info
 */
const checkTokenBalance = async (wallet, tokenAddress) => {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
    const balance = await tokenContract.balanceOf(wallet.address);
    const decimals = await getTokenDecimals(wallet, tokenAddress);
    const symbol = await tokenContract.symbol();
    
    return {
      balance,
      decimals,
      symbol,
      formatted: formatTokenAmount(balance, decimals)
    };
  } catch (error) {
    console.error(`❌ Error checking token balance for ${tokenAddress}:`, error.message);
    throw error;
  }
};

/**
 * Get fee percentage from flashloan contract
 * @param {Object} wallet Ethers wallet
 * @param {string} flashloanContractAddress Flashloan contract address
 * @returns {Promise<number>} Fee percentage (e.g., 0.09 for 0.09%)
 */
const getFlashloanFeePercentage = async (wallet, flashloanContractAddress) => {
  try {
    const flashloanContract = new ethers.Contract(
      flashloanContractAddress,
      flashloanABI,
      wallet
    );
    
    // Check if the contract has a feePercentage method
    if (typeof flashloanContract.FEE_PRECENTAGE === 'function') {
      const feePercentageBps = await flashloanContract.FEE_PRECENTAGE();
      // Convert from basis points (1/10000) to percentage
      return Number(feePercentageBps) / 100;
    } else {
      // Default fee if not available from the contract
      console.log('⚠️ Fee percentage method not found in contract, using default 0.09%');
      return 0.09;
    }
  } catch (error) {
    console.error('❌ Error getting fee percentage:', error.message);
    // Default fee if there's an error
    return 0.09;
  }
};

/**
 * Calculate required tokens for transaction
 * @param {bigint} shortfallAmount USDC shortfall amount
 * @param {number} feePercentage Fee percentage (e.g., 0.09 for 0.09%)
 * @param {number} decimals Token decimals
 * @returns {Promise<{required: bigint, fee: bigint, formatted: string}>} Required tokens info
 */
const calculateRequiredTokens = (shortfallAmount, feePercentage, decimals = 6) => {
  // Convert percentage to multiplier (e.g., 0.09% -> 0.0009)
  const feeMultiplier = feePercentage / 100;
  
  // Calculate fee amount
  const feeAmount = BigInt(Math.ceil(Number(shortfallAmount) * feeMultiplier));
  
  // Total required = shortfall + fee
  const requiredAmount = shortfallAmount + feeAmount;
  
  return {
    required: requiredAmount,
    fee: feeAmount,
    formatted: formatTokenAmount(requiredAmount, decimals),
    feeFormatted: formatTokenAmount(feeAmount, decimals)
  };
};

module.exports = {
  initializeProviderAndWallet,
  initializeProvider,
  initializeWallet,
  getTokenDecimals,
  formatTokenAmount,
  checkApproval,
  approveToken,
  checkTokenBalance,
  getFlashloanFeePercentage,
  calculateRequiredTokens
}; 