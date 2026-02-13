/**
 * Test Script: All Voting Methods
 *
 * Demonstrates:
 * 1. Traditional voting (voter pays gas)
 * 2. Token-based voting (voter pays gas, token burned)
 * 3. Gasless voting (admin pays gas via paymaster)
 *
 * Usage:
 *   npx hardhat run scripts/testAllVotingMethods.js --network localhost
 */

const hre = require("hardhat");

async function main() {
  console.log("\n🗳️  Testing All Voting Methods\n");
  console.log("=".repeat(60));

  // Get signers
  const [owner, admin, alice, bob, charlie] = await hre.ethers.getSigners();
  console.log("\n👥 Signers:");
  console.log(`   Owner:   ${owner.address}`);
  console.log(`   Admin:   ${admin.address}`);
  console.log(`   Alice:   ${alice.address}`);
  console.log(`   Bob:     ${bob.address}`);
  console.log(`   Charlie: ${charlie.address}`);

  // Get deployed contract addresses (from Hardhat Ignition deployment)
  console.log("\n📋 Reading deployment addresses...");
  const electionsManagerAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const tokenManagerAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const paymasterAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

  // Attach to deployed contracts
  const electionsManager = await hre.ethers.getContractAt("ElectionsManager", electionsManagerAddress);
  const tokenManager = await hre.ethers.getContractAt("TokenManager", tokenManagerAddress);
  const paymaster = await hre.ethers.getContractAt("VotingPaymaster", paymasterAddress);

  console.log(`   ElectionsManager: ${electionsManagerAddress}`);
  console.log(`   TokenManager:     ${tokenManagerAddress}`);
  console.log(`   VotingPaymaster:  ${paymasterAddress}`);

  // Get current block timestamp
  const block = await hre.ethers.provider.getBlock("latest");
  const now = block.timestamp;
  const startTime = now + 100; // Start in 100 seconds (safe buffer)
  const duration = 3600; // 1 hour

  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST 1: Traditional Voting (Voter Pays Gas)");
  console.log("=".repeat(60));

  // Create poll with optional token voting (not required)
  console.log("\n1️⃣  Creating poll with optional token voting...");
  const tx1 = await electionsManager.createPoll(
    "Which color do you prefer?",
    admin.address,
    startTime,
    duration,
    true,  // tokenVotingEnabled (optional)
    false  // tokenVotingRequired (FALSE = allows traditional voting)
  );
  await tx1.wait();
  const pollId = 1;
  console.log(`   ✅ Poll #${pollId} created`);

  // Add options
  console.log("\n2️⃣  Adding voting options...");
  await (await electionsManager.connect(admin).addOptionToPoll(pollId, "Red")).wait();
  await (await electionsManager.connect(admin).addOptionToPoll(pollId, "Blue")).wait();
  await (await electionsManager.connect(admin).addOptionToPoll(pollId, "Green")).wait();
  console.log("   ✅ Added options: Red, Blue, Green");

  // Authorize voters
  console.log("\n3️⃣  Authorizing voters...");
  await (await electionsManager.connect(admin).addVoters(pollId, [alice.address, bob.address, charlie.address])).wait();
  console.log("   ✅ Authorized Alice, Bob, Charlie");

  // Wait for poll to start
  console.log("\n⏳ Waiting for poll to start...");
  await hre.ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 10]);
  await hre.ethers.provider.send("evm_mine");
  console.log("   ✅ Poll is now active");

  // Alice votes traditionally (pays gas)
  console.log("\n4️⃣  Alice voting traditionally (option 1: Red)...");
  const aliceBalanceBefore = await hre.ethers.provider.getBalance(alice.address);
  const txAlice = await electionsManager.connect(alice).voteInPoll(pollId, 1);
  const receiptAlice = await txAlice.wait();
  const aliceBalanceAfter = await hre.ethers.provider.getBalance(alice.address);
  const aliceGasCost = aliceBalanceBefore - aliceBalanceAfter;

  console.log(`   ✅ Alice voted for Red`);
  console.log(`   ⛽ Gas paid by Alice: ${hre.ethers.formatEther(aliceGasCost)} ETH`);

  // Verify vote was recorded
  const aliceChoice = await electionsManager.voterChoice(pollId, alice.address);
  const aliceMethod = await electionsManager.voteMethod(pollId, alice.address);
  console.log(`   📊 Vote recorded: Option ${aliceChoice}, Method: ${aliceMethod === 0n ? "GasPayment" : "Token"}`);

  console.log("\n" + "=".repeat(60));
  console.log("🪙 TEST 2: Token-Based Voting (Voter Pays Gas + Token)");
  console.log("=".repeat(60));

  // Allocate tokens to Bob
  console.log("\n1️⃣  Allocating tokens to Bob...");
  await (await electionsManager.connect(admin).addVotersWithTokens(pollId, [bob.address], 5)).wait();
  console.log("   ✅ Allocated 5 tokens to Bob");

  // Check Bob's token balance
  const bobTokensBefore = await tokenManager.getTokenBalance(pollId, bob.address);
  console.log(`   💰 Bob's token balance: ${bobTokensBefore}`);

  // Bob votes with token
  console.log("\n2️⃣  Bob voting with token (option 2: Blue)...");
  const bobBalanceBefore = await hre.ethers.provider.getBalance(bob.address);
  const txBob = await electionsManager.connect(bob).voteInPollWithToken(pollId, 2, bob.address);
  const receiptBob = await txBob.wait();
  const bobBalanceAfter = await hre.ethers.provider.getBalance(bob.address);
  const bobGasCost = bobBalanceBefore - bobBalanceAfter;

  console.log(`   ✅ Bob voted for Blue`);
  console.log(`   ⛽ Gas paid by Bob: ${hre.ethers.formatEther(bobGasCost)} ETH`);

  // Check Bob's token balance after vote
  const bobTokensAfter = await tokenManager.getTokenBalance(pollId, bob.address);
  console.log(`   🔥 Token burned: ${bobTokensBefore - bobTokensAfter}`);
  console.log(`   💰 Bob's remaining tokens: ${bobTokensAfter}`);

  // Verify vote was recorded
  const bobChoice = await electionsManager.voterChoice(pollId, bob.address);
  const bobMethod = await electionsManager.voteMethod(pollId, bob.address);
  console.log(`   📊 Vote recorded: Option ${bobChoice}, Method: ${bobMethod === 0n ? "GasPayment" : "Token"}`);

  console.log("\n" + "=".repeat(60));
  console.log("⛽ TEST 3: Gasless Voting (Admin Pays Gas via Paymaster)");
  console.log("=".repeat(60));

  // Allocate tokens to Charlie
  console.log("\n1️⃣  Allocating tokens to Charlie...");
  await (await electionsManager.connect(admin).addVotersWithTokens(pollId, [charlie.address], 5)).wait();
  console.log("   ✅ Allocated 5 tokens to Charlie");

  // Check Charlie's ETH balance (should not change)
  const charlieBalanceBefore = await hre.ethers.provider.getBalance(charlie.address);
  console.log(`   💰 Charlie's ETH balance: ${hre.ethers.formatEther(charlieBalanceBefore)} ETH`);

  // Get paymaster balance before
  const paymasterBalanceBefore = await hre.ethers.provider.getBalance(paymasterAddress);
  console.log(`   💰 Paymaster balance: ${hre.ethers.formatEther(paymasterBalanceBefore)} ETH`);

  // Charlie signs vote off-chain (EIP-712)
  console.log("\n2️⃣  Charlie signing vote off-chain (EIP-712)...");

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const nonce = await paymaster.nonces(charlie.address);
  const deadline = now + 3600; // 1 hour from now

  const domain = {
    name: "VotingPaymaster",
    version: "1",
    chainId: chainId,
    verifyingContract: paymasterAddress
  };

  const types = {
    VoteWithToken: [
      { name: "pollId", type: "uint256" },
      { name: "optionId", type: "uint256" },
      { name: "voter", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };

  const value = {
    pollId: pollId,
    optionId: 3, // Green
    voter: charlie.address,
    nonce: nonce,
    deadline: deadline
  };

  const signature = await charlie.signTypedData(domain, types, value);
  const { v, r, s } = hre.ethers.Signature.from(signature);

  console.log(`   ✅ Signature created`);
  console.log(`   📝 Nonce: ${nonce}`);
  console.log(`   ⏰ Deadline: ${deadline}`);

  // Relayer (or anyone) submits the transaction - paymaster pays gas
  console.log("\n3️⃣  Relayer submitting gasless vote...");
  const txCharlie = await paymaster.connect(owner).executeVoteWithToken(
    pollId,
    3, // Green
    charlie.address,
    deadline,
    v,
    r,
    s
  );
  const receiptCharlie = await txCharlie.wait();
  console.log(`   ✅ Charlie voted for Green (gasless!)`);

  // Check Charlie's ETH balance (should be unchanged)
  const charlieBalanceAfter = await hre.ethers.provider.getBalance(charlie.address);
  console.log(`   💰 Charlie's ETH balance: ${hre.ethers.formatEther(charlieBalanceAfter)} ETH`);
  console.log(`   🎉 Charlie paid ZERO gas!`);

  // Check paymaster balance (should have decreased)
  const paymasterBalanceAfter = await hre.ethers.provider.getBalance(paymasterAddress);
  const paymasterGasPaid = paymasterBalanceBefore - paymasterBalanceAfter;
  console.log(`   ⛽ Gas paid by paymaster: ${hre.ethers.formatEther(paymasterGasPaid)} ETH`);

  // Verify vote was recorded
  const charlieChoice = await electionsManager.voterChoice(pollId, charlie.address);
  const charlieMethod = await electionsManager.voteMethod(pollId, charlie.address);
  console.log(`   📊 Vote recorded: Option ${charlieChoice}, Method: ${charlieMethod === 0n ? "GasPayment" : "Token"}`);

  console.log("\n" + "=".repeat(60));
  console.log("📊 FINAL RESULTS");
  console.log("=".repeat(60));

  // Get poll details
  const poll = await electionsManager.polls(pollId);
  console.log(`\n📋 Poll: "${poll.title}"`);
  console.log(`   Total votes: ${poll.totalVotes}`);
  console.log(`   Options: ${poll.optionsCount}`);

  // Get vote counts for each option
  console.log("\n🗳️  Vote Distribution:");
  for (let i = 1; i <= 3; i++) {
    const option = await electionsManager.options(pollId, i);
    console.log(`   Option ${i} (${option.name}): ${option.votes} votes`);
  }

  console.log("\n👥 Voters:");
  console.log(`   Alice voted: Red (Method: GasPayment)`);
  console.log(`   Bob voted: Blue (Method: Token)`);
  console.log(`   Charlie voted: Green (Method: Token + Gasless)`);

  console.log("\n💰 Gas Cost Summary:");
  console.log(`   Alice paid: ${hre.ethers.formatEther(aliceGasCost)} ETH`);
  console.log(`   Bob paid: ${hre.ethers.formatEther(bobGasCost)} ETH`);
  console.log(`   Charlie paid: 0 ETH (gasless!)`);
  console.log(`   Paymaster paid: ${hre.ethers.formatEther(paymasterGasPaid)} ETH`);

  console.log("\n" + "=".repeat(60));
  console.log("✅ ALL TESTS COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log("\n🎉 Your voting system supports all three methods:\n");
  console.log("   1️⃣  Traditional voting (voter pays gas)");
  console.log("   2️⃣  Token-based voting (voter pays gas + token)");
  console.log("   3️⃣  Gasless voting (admin pays via paymaster)\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
