import hre from "hardhat";

async function main() {
  console.log("Deploying ElectionsManager contract...");

  const ElectionsManager = await hre.ethers.getContractFactory("ElectionsManager");
  const contract = await ElectionsManager.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ ElectionsManager contract deployed to:", address);
  console.log("\n📋 Update your frontend .env.development:");
  console.log(`REACT_APP_CONTRACT_ADDRESS=${address}`);
  console.log(`REACT_APP_HARDHAT_RPC=http://127.0.0.1:8545`);

  // Verify deployment
  const owner = await contract.owner();
  const pollsCount = await contract.pollsCount();
  console.log("\n✅ Contract verified:");
  console.log("   Owner:", owner);
  console.log("   Polls Count:", pollsCount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
