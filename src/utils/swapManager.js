const { ALL_SWAP_CONFIGS, CONFIG } = require('../config/constants');
const { formatTokenAmount, getTokenDecimals } = require('./ethereum');

/**
 * Get random number between min and max (inclusive)
 * @param {number} min Minimum value
 * @param {number} max Maximum value
 * @returns {number} Random number
 */
const getRandomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

/**
 * Applies random amount to a swap configuration if enabled
 * @param {Object} config Swap configuration
 * @returns {Object} Swap configuration with possibly randomized amount
 */
const applyRandomAmount = (config) => {
  // Skip if random amount is disabled or min/max not set
  if (!CONFIG.useRandomAmount || 
      !config.minAmount || 
      !config.maxAmount) {
    return config;
  }

  // Create a copy of the config
  const newConfig = { ...config };
  
  // Calculate random amount between min and max
  const minAmount = BigInt(config.minAmount);
  const maxAmount = BigInt(config.maxAmount);
  
  // Ensure max is greater than min
  if (maxAmount <= minAmount) {
    console.warn(`⚠️ maxAmount must be greater than minAmount for ${config.name}. Using default amount.`);
    return config;
  }
  
  // Calculate range and random factor
  const range = Number(maxAmount - minAmount);
  const randomFactor = Math.random(); // 0 to 1
  
  // Apply random factor to range and add to min
  const randomAmount = minAmount + BigInt(Math.floor(range * randomFactor));
  
  // Update amount in copy
  newConfig.amount = randomAmount.toString();
  
  console.log(`🎲 Randomized amount: ${formatTokenAmount(newConfig.amount, 6)} (between ${formatTokenAmount(minAmount, 6)} and ${formatTokenAmount(maxAmount, 6)})`);
  
  return newConfig;
};

/**
 * Get all active swap configurations
 * @returns {Array} Array of active swap configurations
 */
const getActiveSwapConfigs = () => {
  return ALL_SWAP_CONFIGS.filter(config => config.active);
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
 * Get swap configurations by service type
 * @param {string} service Service type ("bebop" or "relay")
 * @returns {Array} Array of configurations for the specified service
 */
const getSwapConfigsByService = (service) => {
  const activeConfigs = getActiveSwapConfigs();
  return activeConfigs.filter(config => config.service === service);
};

/**
 * Select a swap configuration based on current settings
 * @param {Object} wallet Ethers wallet instance
 * @param {number} specificIndex Optional index to select a specific configuration
 * @param {string} specificService Optional service type to filter by ("bebop" or "relay")
 * @returns {Object} Selected swap configuration and information
 */
const selectSwapConfiguration = async (wallet, specificIndex = null, specificService = null) => {
  try {
    // Get swap configuration
    let selectedConfig;
    
    // Filter by service if specified
    const availableConfigs = specificService 
      ? getSwapConfigsByService(specificService)
      : getActiveSwapConfigs();
    
    if (availableConfigs.length === 0) {
      throw new Error(specificService 
        ? `No active configurations found for service: ${specificService}`
        : 'No active swap configurations found');
    }
    
    if (specificIndex !== null) {
      // If specificIndex is provided, use it within the filtered configs
      if (specificIndex < 0 || specificIndex >= availableConfigs.length) {
        throw new Error(`Invalid index ${specificIndex}. Available range: 0-${availableConfigs.length - 1}`);
      }
      selectedConfig = availableConfigs[specificIndex];
      console.log(`🔢 Using swap configuration at index ${specificIndex}: ${selectedConfig.name}`);
    } else if (CONFIG.useRandomSwap) {
      // Randomly select from filtered configs
      const randomIndex = Math.floor(Math.random() * availableConfigs.length);
      selectedConfig = availableConfigs[randomIndex];
      console.log(`🎲 Randomly selected swap configuration: ${selectedConfig.name}`);
    } else {
      // Default to first config in filtered list
      selectedConfig = availableConfigs[0];
      console.log(`📋 Using first active swap configuration: ${selectedConfig.name}`);
    }
    
    // Apply random amount if enabled
    if (CONFIG.useRandomAmount) {
      selectedConfig = applyRandomAmount(selectedConfig);
    }
    
    console.log(`📝 Description: ${selectedConfig.description}`);
    console.log(`🔧 Service: ${selectedConfig.service || 'bebop'}`);
    
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
 * @param {string} serviceFilter Optional service type to filter by
 */
const displayAvailableConfigs = (serviceFilter = null) => {
  const activeConfigs = serviceFilter 
    ? getSwapConfigsByService(serviceFilter)
    : getActiveSwapConfigs();
  
  console.log('📊 Available Swap Configurations:');
  console.log('----------------------------------------');
  
  if (activeConfigs.length === 0) {
    console.log(`No active configurations found${serviceFilter ? ` for service: ${serviceFilter}` : ''}`);
    console.log('----------------------------------------');
    return;
  }
  
  activeConfigs.forEach((config, index) => {
    console.log(`[${index}] ${config.name}`);
    console.log(`    Description: ${config.description}`);
    console.log(`    Service: ${config.service || 'bebop'}`);
    console.log(`    From Token: ${config.fromToken}`);
    console.log(`    To Token: ${config.toToken}`);
    
    if (config.minAmount && config.maxAmount) {
      console.log(`    Amount Range: ${formatTokenAmount(config.minAmount, 6)} to ${formatTokenAmount(config.maxAmount, 6)}`);
      console.log(`    Default Amount: ${formatTokenAmount(config.amount, 6)}`);
    } else {
      console.log(`    Amount: ${formatTokenAmount(config.amount, 6)}`);
    }
    
    console.log('----------------------------------------');
  });
  
  console.log(`Total active configurations: ${activeConfigs.length}`);
  
  if (CONFIG.useRandomSwap) {
    console.log('🎲 Random selection is ENABLED');
  } else {
    console.log('🔢 Using first configuration by default');
  }
  
  if (CONFIG.useRandomAmount) {
    console.log('🎲 Random amount selection is ENABLED');
  }
};

module.exports = {
  getActiveSwapConfigs,
  getRandomSwapConfig,
  getSwapConfigByIndex,
  getSwapConfigsByService,
  selectSwapConfiguration,
  applyRandomAmount,
  delay,
  displayAvailableConfigs
}; 