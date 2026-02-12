import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deployment module for token-based gasless voting system
 *
 * This module deploys:
 * 1. ElectionsManager (main voting contract with token support)
 * 2. TokenManager (manages per-poll voting tokens)
 * 3. VotingPaymaster (sponsors gas fees for token-based votes)
 *
 * And configures:
 * - TokenManager and Paymaster references in ElectionsManager
 * - Initial funding for the paymaster
 */
const GaslessVotingModule = buildModule("GaslessVotingModule", (m) => {
  // Parameters
  const initialFunding = m.getParameter("initialFunding", 1n * 10n ** 18n); // 1 ETH default

  // 1. Deploy ElectionsManager (main voting contract)
  const electionsManager = m.contract("ElectionsManager");

  // 2. Deploy TokenManager (needs voting contract address)
  const tokenManager = m.contract("TokenManager", [electionsManager]);

  // 3. Deploy VotingPaymaster (needs voting contract, token manager, and admin address)
  // Use the deployer account as initial paymaster admin
  const paymasterAdmin = m.getAccount(0);
  const votingPaymaster = m.contract("VotingPaymaster", [
    electionsManager,
    tokenManager,
    paymasterAdmin,
  ]);

  // 4. Configure ElectionsManager with TokenManager reference
  m.call(electionsManager, "setTokenManager", [tokenManager]);

  // 5. Configure ElectionsManager with VotingPaymaster reference
  m.call(electionsManager, "setVotingPaymaster", [votingPaymaster]);

  // 6. Fund the paymaster with initial ETH to cover gas costs
  m.call(votingPaymaster, "fund", [], { value: initialFunding });

  return {
    electionsManager,
    tokenManager,
    votingPaymaster,
  };
});

export default GaslessVotingModule;
