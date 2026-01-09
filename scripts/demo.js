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
    7 // 7 days duration
  );
  await tx1.wait();
  console.log("✓ Election created with ID: 1");
  console.log();

  // Note: We can't add candidates after election starts
  // This is a demonstration limitation. In a real system, you'd schedule the start time
  console.log("Note: Election starts immediately in this demo.");
  console.log("In production, you would set a future start time to add candidates first.");
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
  console.log();

  // Check voter registration
  console.log("Checking registrations:");
  console.log("Voter1 registered:", await votingSystem.isRegisteredVoter(1, voter1.address));
  console.log("Voter2 registered:", await votingSystem.isRegisteredVoter(1, voter2.address));
  console.log();

  console.log("=== Demo Complete ===");
  console.log("\nTo test the full voting flow:");
  console.log("1. Create an election with a future start time");
  console.log("2. Add candidates before the election starts");
  console.log("3. Register voters");
  console.log("4. Let voters cast their votes during the election period");
  console.log("5. View results after the election ends");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
