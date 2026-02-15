import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deployment module for token-based gasless voting system with secret ballot + franchise support
 *
 * This module deploys:
 * 1. ElectionsManager (main voting contract with token support & trust features)
 *    - Internally deploys: MultiChoiceVoting, QuadraticVoting, DelegationVoting, MetadataVoting modules
 * 2. TokenManager (manages per-poll voting tokens)
 * 3. VotingPaymaster (sponsors gas fees for token-based votes)
 * 4. SecretBallotManager (commit-reveal voting for secret ballot polls)
 * 5. FranchiseManager (sub-admin franchise system)
 *
 * And configures:
 * - TokenManager, Paymaster, SecretBallotManager, and FranchiseManager references in ElectionsManager
 * - Initial funding for the paymaster
 *
 * Note: Infrastructure is permanently locked after the first poll is created,
 * so all configuration must happen during deployment.
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

  // 4. Deploy SecretBallotManager (needs voting contract address)
  const secretBallotManager = m.contract("SecretBallotManager", [
    electionsManager,
  ]);

  // 5. Deploy FranchiseManager (needs voting contract address)
  const franchiseManager = m.contract("FranchiseManager", [
    electionsManager,
  ]);

  // 6. Configure ElectionsManager with TokenManager reference
  m.call(electionsManager, "setTokenManager", [tokenManager]);

  // 7. Configure ElectionsManager with VotingPaymaster reference
  m.call(electionsManager, "setVotingPaymaster", [votingPaymaster]);

  // 8. Configure ElectionsManager with SecretBallotManager reference
  //    Must be set BEFORE enableSecretBallot() can be called on any poll
  m.call(electionsManager, "setSecretBallotManager", [secretBallotManager]);

  // 9. Configure ElectionsManager with FranchiseManager reference
  m.call(electionsManager, "setFranchiseManager", [franchiseManager]);

  // 10. Fund the paymaster with initial ETH to cover gas costs
  m.call(votingPaymaster, "fund", [], { value: initialFunding });

  return {
    electionsManager,
    tokenManager,
    votingPaymaster,
    secretBallotManager,
    franchiseManager,
  };
});

export default GaslessVotingModule;
