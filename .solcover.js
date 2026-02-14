module.exports = {
  // Skip mock/test-only contracts
  skipFiles: [
    "upgradeable/v1/ElectionsManagerUpgradeable.sol",
    "upgradeable/v2/ElectionsManagerUpgradeableV2.sol",
  ],

  // Mocha options for coverage runs
  mocha: {
    timeout: 120000, // 2 minutes per test (coverage is slower)
  },

  // Configure provider (increase gas limit for coverage instrumentation)
  providerOptions: {
    gas: 0xfffffffffff,
    gasPrice: 0x01,
  },

  // Optimize for large contracts
  configureYulOptimizer: true,
  solcOptimizerDetails: {
    yul: true,
    yulDetails: {
      stackAllocation: true,
    },
  },
};
