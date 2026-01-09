const hre = require("hardhat");

async function main() {
  console.log("=== Blockchain Voting System Demo ===\n");

  // Get signers
  const [owner, voter1, voter2, voter3] = await hre.ethers.getSigners();
  
  console.log("Accounts:");
  console.log("Owner:", owner.address);
  console.log("Voter1:", voter1.address);
  console.log("Voter2:", voter2.address);
  console.log("Voter3:", voter3.address);
  console.log();

  // Deploy contract
  console.log("Deploying VotingSystem contract...");
  const VotingSystem = await hre.ethers.getContractFactory("VotingSystem");
  const votingSystem = await VotingSystem.deploy();
  await votingSystem.waitForDeployment();
  
  const contractAddress = await votingSystem.getAddress();
  console.log("Contract deployed at:", contractAddress);
  console.log();

  // Create an election
  console.log("Creating election...");
  const tx1 = await votingSystem.createElection(
    "Presidential Election 2024",
    "National presidential election to choose the next leader",
    24, // Start in 24 hours (allows time to add candidates)
    7   // 7 days duration
  );
  await tx1.wait();
  console.log("✓ Election created with ID: 1");
  console.log("✓ Election will start in 24 hours, allowing time to add candidates");
  console.log();

  // Note: Election starts in 24 hours, so we can add candidates now
  console.log("Adding candidates...");
  await (await votingSystem.addCandidate(1, "John Smith")).wait();
  console.log("✓ Candidate 1: John Smith");
  
  await (await votingSystem.addCandidate(1, "Jane Doe")).wait();
  console.log("✓ Candidate 2: Jane Doe");
  
  await (await votingSystem.addCandidate(1, "Bob Johnson")).wait();
  console.log("✓ Candidate 3: Bob Johnson");
  console.log();

  // Register voters
  console.log("Registering voters...");
  await (await votingSystem.registerVoter(1, voter1.address)).wait();
  console.log("✓ Voter1 registered");
  
  await (await votingSystem.registerVoter(1, voter2.address)).wait();
  console.log("✓ Voter2 registered");
  
  await (await votingSystem.registerVoter(1, voter3.address)).wait();
  console.log("✓ Voter3 registered");
  console.log();

  // Get election details
  console.log("Election details:");
  const election = await votingSystem.getElection(1);
  console.log("ID:", election.id.toString());
  console.log("Name:", election.name);
  console.log("Description:", election.description);
  console.log("Start:", new Date(Number(election.startTime) * 1000).toLocaleString());
  console.log("End:", new Date(Number(election.endTime) * 1000).toLocaleString());
  console.log("Candidates:", election.candidateCount.toString());
  
  // Display all candidates
  if (election.candidateCount > 0) {
    console.log("\nCandidate List:");
    for (let i = 1; i <= election.candidateCount; i++) {
      const candidate = await votingSystem.getCandidate(1, i);
      console.log(`  ${i}. ${candidate.name} - ${candidate.voteCount} votes`);
    }
  }
  console.log();

  // Check voter registration
  console.log("Checking registrations:");
  console.log("Voter1 registered:", await votingSystem.isRegisteredVoter(1, voter1.address));
  console.log("Voter2 registered:", await votingSystem.isRegisteredVoter(1, voter2.address));
  console.log();

  console.log("=== Demo Complete ===");
  console.log("\nNext Steps:");
  console.log("1. Wait for election to start (24 hours in this demo)");
  console.log("2. Registered voters can cast their votes");
  console.log("3. After 7 days, view results to see the winner");
  console.log("\nTo simulate time passage in testing, use:");
  console.log("  await network.provider.send('evm_increaseTime', [86400]); // Add 1 day");
  console.log("  await network.provider.send('evm_mine');");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
