/**
 * Deploy script for the Token-Based Gasless Voting System
 *
 * Deploys all 5 contracts and configures them:
 * 1. ElectionsManager (main voting + trust features)
 * 2. TokenManager (per-poll voting tokens)
 * 3. VotingPaymaster (gas sponsorship)
 * 4. SecretBallotManager (commit-reveal secret ballot)
 * 5. FranchiseManager (sub-admin franchise system)
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network hardhatMainnet   # local
 *   npx hardhat run scripts/deploy.ts --network sepolia           # testnet
 *   npx hardhat run scripts/deploy.ts --network mainnet           # production
 */
import { network } from "hardhat";

async function main() {
  const connection = await network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Voting System Deployment                           ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Deployer:", deployer.address);
  console.log("Network:", network.name);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("");

  // --- 1. Deploy ElectionsManager ---
  console.log("1/5 Deploying ElectionsManager...");
  const ElectionsManager = await ethers.getContractFactory("ElectionsManager");
  const electionsManager = await ElectionsManager.deploy();
  await electionsManager.waitForDeployment();
  const emAddr = await electionsManager.getAddress();
  console.log("     ElectionsManager:", emAddr);

  // --- 2. Deploy TokenManager ---
  console.log("2/5 Deploying TokenManager...");
  const TokenManager = await ethers.getContractFactory("TokenManager");
  const tokenManager = await TokenManager.deploy(emAddr);
  await tokenManager.waitForDeployment();
  const tmAddr = await tokenManager.getAddress();
  console.log("     TokenManager:", tmAddr);

  // --- 3. Deploy VotingPaymaster ---
  console.log("3/5 Deploying VotingPaymaster...");
  const VotingPaymaster = await ethers.getContractFactory("VotingPaymaster");
  const votingPaymaster = await VotingPaymaster.deploy(emAddr, tmAddr, deployer.address);
  await votingPaymaster.waitForDeployment();
  const vpAddr = await votingPaymaster.getAddress();
  console.log("     VotingPaymaster:", vpAddr);

  // --- 4. Deploy SecretBallotManager ---
  console.log("4/5 Deploying SecretBallotManager...");
  const SecretBallotManager = await ethers.getContractFactory("SecretBallotManager");
  const secretBallotManager = await SecretBallotManager.deploy(emAddr);
  await secretBallotManager.waitForDeployment();
  const sbmAddr = await secretBallotManager.getAddress();
  console.log("     SecretBallotManager:", sbmAddr);

  // --- 5. Deploy FranchiseManager ---
  console.log("5/5 Deploying FranchiseManager...");
  const FranchiseManager = await ethers.getContractFactory("FranchiseManager");
  const franchiseManager = await FranchiseManager.deploy(emAddr);
  await franchiseManager.waitForDeployment();
  const fmAddr = await franchiseManager.getAddress();
  console.log("     FranchiseManager:", fmAddr);

  // --- Configure ---
  console.log("");
  console.log("Configuring contracts...");

  console.log("  → setTokenManager");
  const tx1 = await electionsManager.setTokenManager(tmAddr);
  await tx1.wait();

  console.log("  → setVotingPaymaster");
  const tx2 = await electionsManager.setVotingPaymaster(vpAddr);
  await tx2.wait();

  console.log("  → setSecretBallotManager");
  const tx3 = await electionsManager.setSecretBallotManager(sbmAddr);
  await tx3.wait();

  console.log("  → setFranchiseManager");
  const tx3b = await electionsManager.setFranchiseManager(fmAddr);
  await tx3b.wait();

  // NOTE: Paymaster is deployed but NOT funded.
  // Admin or franchisee should fund it manually after deployment:
  //   votingPaymaster.fund({ value: ethers.parseEther("<amount>") })

  // --- Summary ---
  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Deployment Complete ✓                              ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  ElectionsManager:    ${emAddr}  ║`);
  console.log(`║  TokenManager:        ${tmAddr}  ║`);
  console.log(`║  VotingPaymaster:     ${vpAddr}  ║`);
  console.log(`║  SecretBallotManager: ${sbmAddr}  ║`);
  console.log(`║  FranchiseManager:    ${fmAddr}  ║`);
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("⚠  Infrastructure will lock permanently after first poll creation.");
  console.log("⚠  VotingPaymaster is NOT funded. Admin/franchisee must fund it manually:");
  console.log(`   votingPaymaster.fund({ value: ethers.parseEther("<amount>") })`);
  console.log("");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
