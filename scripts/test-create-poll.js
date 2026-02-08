import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
  // Replace this with your deployed contract address
  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  console.log("🔍 Testing createPoll on contract:", CONTRACT_ADDRESS);
  console.log();

  const [owner, admin] = await ethers.getSigners();
  console.log("Owner address:", owner.address);
  console.log("Admin address:", admin.address);
  console.log();

  // Connect to deployed contract
  const ElectionsManager = await ethers.getContractFactory("ElectionsManager");
  const voting = ElectionsManager.attach(CONTRACT_ADDRESS);

  // Check initial pollsCount
  const initialCount = await voting.pollsCount();
  console.log("📊 Initial pollsCount:", initialCount.toString());
  console.log();

  // Create a poll
  console.log("📝 Creating poll...");
  const tx = await voting.createPoll("Test Poll", admin.address, 3600);
  console.log("Transaction sent:", tx.hash);

  console.log("⏳ Waiting for transaction to be mined...");
  const receipt = await tx.wait();
  console.log("✅ Transaction mined in block:", receipt.blockNumber);
  console.log();

  // Check pollsCount after creation
  const finalCount = await voting.pollsCount();
  console.log("📊 Final pollsCount:", finalCount.toString());
  console.log();

  if (finalCount > initialCount) {
    console.log("✅ SUCCESS! Poll created successfully!");
    console.log("Poll ID:", finalCount.toString());
  } else {
    console.log("❌ FAILED! pollsCount did not increase");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
