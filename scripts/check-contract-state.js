import hre from "hardhat";

async function main() {
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  console.log("Checking contract at:", contractAddress);

  const ElectionsManager = await hre.ethers.getContractFactory("ElectionsManager");
  const contract = ElectionsManager.attach(contractAddress);

  console.log("\n=== Contract State ===");

  try {
    const owner = await contract.owner();
    console.log("Owner:", owner);
  } catch (e) {
    console.log("Owner call failed:", e.message);
  }

  try {
    const pollsCount = await contract.pollsCount();
    console.log("pollsCount (public var):", pollsCount.toString());
  } catch (e) {
    console.log("pollsCount failed:", e.message);
  }

  try {
    const count = await contract.getPollsCount();
    console.log("getPollsCount():", count.toString());
  } catch (e) {
    console.log("getPollsCount failed:", e.message);
  }

  // Try to read poll #1
  try {
    const poll = await contract.polls(1);
    console.log("\nPoll #1:");
    console.log("  Title:", poll.title);
    console.log("  Admin:", poll.admin);
    console.log("  Exists:", poll.exists);
  } catch (e) {
    console.log("\nPoll #1 read failed:", e.message);
  }

  // Check contract bytecode
  const provider = hre.ethers.provider;
  const code = await provider.getCode(contractAddress);
  console.log("\nContract bytecode length:", code.length, "bytes");
  console.log("Contract deployed:", code !== "0x" && code !== "0x0");
}

main().catch(console.error);
