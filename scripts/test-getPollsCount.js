import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  console.log("🔍 Testing getPollsCount() on contract:", CONTRACT_ADDRESS);
  console.log();

  const [owner, admin] = await ethers.getSigners();

  // Connect to deployed contract
  const ElectionsManager = await ethers.getContractFactory("ElectionsManager");
  const voting = ElectionsManager.attach(CONTRACT_ADDRESS);

  // Test 1: Check initial value
  console.log("📊 Test 1: Initial getPollsCount()");
  let count = await voting.getPollsCount();
  console.log("   Result:", count.toString());
  console.log();

  // Test 2: Create a poll and check again
  console.log("📝 Test 2: Creating a poll...");
  const tx = await voting.createPoll("Test Poll", admin.address, 3600);
  await tx.wait();
  console.log("   ✅ Poll created");

  count = await voting.getPollsCount();
  console.log("   getPollsCount() after creation:", count.toString());
  console.log();

  // Test 3: Verify both methods return same value
  console.log("🔄 Test 3: Comparing pollsCount() vs getPollsCount()");
  const oldMethod = await voting.pollsCount();
  const newMethod = await voting.getPollsCount();
  console.log("   pollsCount():", oldMethod.toString());
  console.log("   getPollsCount():", newMethod.toString());
  console.log("   Match:", oldMethod.toString() === newMethod.toString() ? "✅" : "❌");
  console.log();

  // Summary
  if (oldMethod.toString() === newMethod.toString()) {
    console.log("✅ SUCCESS! getPollsCount() works correctly!");
  } else {
    console.log("❌ FAILED! Methods don't match!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
