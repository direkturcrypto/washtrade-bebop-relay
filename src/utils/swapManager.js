const { SWAP_CONFIGS, CONFIG } = require('../config/constants');
const { formatTokenAmount } = require('./ethereum');

/**
 * Get all active swap configurations
 * @returns {Array} Array of active swap configurations
 */
const getActiveSwapConfigs = () => {
  return SWAP_CONFIGS.filter(config => config.active);
};

/**
 * Randomly select a swap configuration from active configs
 * @returns {Object} Selected swap configuration
 */
const getRandomSwapConfig = () => {
  const activeConfigs = getActiveSwapConfigs();
  
  if (activeConfigs.length === 0) {
    throw new Error('No active swap configurations found');
  }
  
  const randomIndex = Math.floor(Math.random() * activeConfigs.length);
  return activeConfigs[randomIndex];
};

/**
 * Get a specific swap configuration by index
 * @param {number} index Index of the configuration to get
 * @returns {Object} Selected swap configuration
 */
const getSwapConfigByIndex = (index) => {
  const activeConfigs = getActiveSwapConfigs();
  
  if (activeConfigs.length === 0) {
    throw new Error('No active swap configurations found');
  }
  
  if (index < 0 || index >= activeConfigs.length) {
    throw new Error(`Invalid index ${index}. Available range: 0-${activeConfigs.length - 1}`);
  }
  
  return activeConfigs[index];
};

/**
 * Select a swap configuration based on current settings
 * @param {number} specificIndex Optional index to select a specific configuration
 * @returns {Object} Selected swap configuration and information
 */
const selectSwapConfiguration = async (wallet, specificIndex = null) => {
  try {
    // Get swap configuration
    let selectedConfig;
    
    if (specificIndex !== null) {
      selectedConfig = getSwapConfigByIndex(specificIndex);
      console.log(`🔢 Using swap configuration at index ${specificIndex}: ${selectedConfig.name}`);
    } else if (CONFIG.useRandomSwap) {
      selectedConfig = getRandomSwapConfig();
      console.log(`🎲 Randomly selected swap configuration: ${selectedConfig.name}`);
    } else {
      // Default to first active config
      selectedConfig = getActiveSwapConfigs()[0];
      console.log(`📋 Using first active swap configuration: ${selectedConfig.name}`);
    }
    
    console.log(`📝 Description: ${selectedConfig.description}`);
    
    return selectedConfig;
  } catch (error) {
    console.error('❌ Error selecting swap configuration:', error.message);
    throw error;
  }
};

/**
 * Delay execution for specified seconds
 * @param {number} seconds Seconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
const delay = (seconds) => {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

/**
 * Display all available swap configurations
 */
const displayAvailableConfigs = () => {
  const activeConfigs = getActiveSwapConfigs();
  
  console.log('📊 Available Swap Configurations:');
  console.log('----------------------------------------');
  
  activeConfigs.forEach((config, index) => {
    console.log(`[${index}] ${config.name}`);
    console.log(`    Description: ${config.description}`);
    console.log(`    From Token: ${config.fromToken}`);
    console.log(`    To Token: ${config.toToken}`);
    console.log(`    Amount: ${config.amount}`);
    console.log('----------------------------------------');
  });
  
  console.log(`Total active configurations: ${activeConfigs.length}`);
  
  if (CONFIG.useRandomSwap) {
    console.log('🎲 Random selection is ENABLED');
  } else {
    console.log('🔢 Using first configuration by default');
  }
};

module.exports = {
  getActiveSwapConfigs,
  getRandomSwapConfig,
  getSwapConfigByIndex,
  selectSwapConfiguration,
  delay,
  displayAvailableConfigs
}; 