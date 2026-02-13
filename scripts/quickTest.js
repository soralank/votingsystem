/**
 * Quick Test Script
 *
 * Simple test to verify your deployment is working.
 * Creates a poll with optional token voting and demonstrates all methods.
 *
 * Usage:
 *   npx hardhat run scripts/quickTest.js --network localhost
 */

const hre = require("hardhat");

async function main() {
  console.log("\n🚀 Quick Voting System Test\n");

  // Get signers
  const [owner, admin, voter1, voter2] = await hre.ethers.getSigners();

  // Connect to deployed contracts (update these addresses from your deployment)
  const electionsManager = await hre.ethers.getContractAt(
    "ElectionsManager",
    "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  );

  console.log("📋 Contract: ElectionsManager");
  console.log(`   Address: ${await electionsManager.getAddress()}`);
  console.log(`   Owner: ${owner.address}`);
  console.log(`   Admin: ${admin.address}\n`);

  // Get current time and add buffer
  const block = await hre.ethers.provider.getBlock("latest");
  const now = block.timestamp;
  const startTime = now + 100; // Start in 100 seconds (safe buffer)
  const duration = 3600;

  // Create poll with OPTIONAL token voting
  console.log("Creating poll...");
  const tx = await electionsManager.createPoll(
    "Quick Test Poll",
    admin.address,
    startTime,
    duration,
    true,   // tokenVotingEnabled = true (optional)
    false   // tokenVotingRequired = false (allows traditional voting)
  );
  await tx.wait();
  console.log("✅ Poll created (ID: 1)\n");

  // Add options
  console.log("Adding options...");
  await (await electionsManager.connect(admin).addOptionToPoll(1, "Option A")).wait();
  await (await electionsManager.connect(admin).addOptionToPoll(1, "Option B")).wait();
  console.log("✅ Added options\n");

  // Authorize voters
  console.log("Authorizing voters...");
  await (await electionsManager.connect(admin).addVoters(1, [voter1.address, voter2.address])).wait();
  console.log("✅ Voters authorized\n");

  // Wait for poll to start
  console.log("⏳ Starting poll...");
  await hre.ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 10]);
  await hre.ethers.provider.send("evm_mine");
  console.log("✅ Poll is active\n");

  // Vote traditionally
  console.log("Voter 1 voting (traditional method)...");
  await (await electionsManager.connect(voter1).voteInPoll(1, 1)).wait();
  console.log("✅ Vote recorded!\n");

  // Get results
  const poll = await electionsManager.polls(1);
  const option1 = await electionsManager.options(1, 1);

  console.log("📊 Results:");
  console.log(`   Total votes: ${poll.totalVotes}`);
  console.log(`   Option A: ${option1.votes} votes\n`);

  console.log("✅ Test completed successfully!");
  console.log("\n💡 To test token voting, allocate tokens first:");
  console.log("   await electionsManager.connect(admin).addVotersWithTokens(1, [voter2.address], 5);");
  console.log("   await electionsManager.connect(voter2).voteInPollWithToken(1, 2, voter2.address);\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
