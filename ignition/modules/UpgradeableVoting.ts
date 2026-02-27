import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deployment Module for Upgradeable Voting System (V1)
 *
 * Deploys:
 * 1. ElectionsManagerUpgradeable V1 (implementation)
 * 2. ERC1967Proxy pointing to implementation
 * 3. TokenManager (can be upgraded separately if needed)
 * 4. VotingPaymaster (can be upgraded separately if needed)
 *
 * Usage:
 *   npx hardhat ignition deploy ignition/modules/UpgradeableVoting.ts
 */

export default buildModule("UpgradeableVotingSystemV1", (m) => {
  // ========== Step 1: Deploy Implementation Contracts ==========

  // Deploy ElectionsManager V1 implementation
  const electionsManagerImpl = m.contract("ElectionsManagerUpgradeable", [], {
    id: "ElectionsManagerUpgradeable_Implementation",
  });

  // ========== Step 2: Deploy Proxy ==========

  // Encode initialize() call
  const initializeData = m.encodeFunctionCall(electionsManagerImpl, "initialize", []);

  // Deploy ERC1967Proxy
  // Note: Using OpenZeppelin's ERC1967Proxy from @openzeppelin/contracts
  const proxy = m.contract("TestERC1967Proxy", [
    electionsManagerImpl,
    initializeData,
  ], {
    id: "ElectionsManager_Proxy",
  });

  // ========== Step 3: Get Contract Interface ==========

  // Create interface to interact with proxy as if it were the implementation
  const electionsManager = m.contractAt("ElectionsManagerUpgradeable", proxy, {
    id: "ElectionsManager",
  });

  // ========== Step 4: Deploy Supporting Contracts ==========

  // Deploy TokenManager (pointing to proxy address)
  const tokenManager = m.contract("TokenManager", [proxy], {
    id: "TokenManager",
  });

  // Deploy VotingPaymaster (pointing to proxy address)
  const votingPaymaster = m.contract("VotingPaymaster", [
    proxy,
    tokenManager,
    m.getAccount(0), // Admin address (deployer)
  ], {
    id: "VotingPaymaster",
  });

  // ========== Step 5: Configure ElectionsManager ==========

  // Set TokenManager
  m.call(electionsManager, "setTokenManager", [tokenManager], {
    id: "SetTokenManager",
  });

  // Set VotingPaymaster
  m.call(electionsManager, "setVotingPaymaster", [votingPaymaster], {
    id: "SetVotingPaymaster",
  });

  // NOTE: Paymaster is deployed UNFUNDED.
  // Admin or franchisee should fund it manually after deployment:
  //   votingPaymaster.fund({ value: <desired amount> })

  // ========== Return All Deployed Contracts ==========

  return {
    proxy,                      // The proxy contract (this is the address users interact with)
    implementation: electionsManagerImpl, // The implementation (for reference)
    electionsManager,           // Interface to call functions through proxy
    tokenManager,
    votingPaymaster,
  };
});
