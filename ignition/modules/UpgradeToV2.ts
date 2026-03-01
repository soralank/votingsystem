import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Upgrade Module: V1 -> V2
 *
 * Upgrades ElectionsManager from V1 to V2
 * - Preserves all existing poll data
 * - Adds new V2 features (categories, vote weights, pause, etc.)
 *
 * Prerequisites:
 * 1. V1 must already be deployed
 * 2. You must have the proxy address from V1 deployment
 * 3. You must be the owner to authorize the upgrade
 *
 * Usage:
 *   npx hardhat ignition deploy ignition/modules/UpgradeToV2.ts --parameters ignition/parameters/upgrade-v2.json
 *
 * Parameters file (upgrade-v2.json):
 * {
 *   "UpgradeToV2": {
 *     "proxyAddress": "0x..." // Address of deployed proxy from V1
 *   }
 * }
 */

export default buildModule("UpgradeToV2", (m) => {
  // Get proxy address from parameters
  const proxyAddress = m.getParameter("proxyAddress");

  // ========== Step 1: Deploy New Implementation (V2) ==========

  const electionsManagerV2Impl = m.contract("ElectionsManagerUpgradeableV2", [], {
    id: "ElectionsManagerV2_Implementation",
  });

  // ========== Step 2: Get Proxy Interface ==========

  // Get the existing proxy contract (as V1 interface)
  const proxyAsV1 = m.contractAt("ElectionsManagerUpgradeable", proxyAddress, {
    id: "ExistingProxy_AsV1",
  });

  // ========== Step 3: Perform Upgrade ==========

  // Call upgradeToAndCall on the proxy (UUPS upgrade)
  // This is a special function from UUPS that:
  // 1. Updates the implementation address in the proxy
  // 2. Calls initializeV2() on the new implementation

  const initializeV2Data = m.encodeFunctionCall(electionsManagerV2Impl, "initializeV2", []);

  m.call(proxyAsV1, "upgradeToAndCall", [
    electionsManagerV2Impl,
    initializeV2Data,
  ], {
    id: "UpgradeToV2",
  });

  // ========== Step 4: Get Upgraded Interface ==========

  // Now interact with proxy using V2 interface
  const electionsManagerV2 = m.contractAt("ElectionsManagerUpgradeableV2", proxyAddress, {
    id: "ElectionsManager_V2",
  });

  // ========== Verification: Check Version ==========

  // Note: This is informational, actual verification would be done in tests
  // After deployment, you can manually verify:
  // const version = await electionsManagerV2.getVersion();
  // console.log("Upgraded to version:", version); // Should output "2.0.0"

  // ========== Return Upgraded Contracts ==========

  return {
    implementation: electionsManagerV2Impl, // New V2 implementation
    proxy: proxyAddress,                     // Same proxy address (preserved)
    electionsManager: electionsManagerV2,    // Interface to interact as V2
  };
});
