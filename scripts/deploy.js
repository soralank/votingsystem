const hre = require("hardhat");

async function main() {
  console.log("Deploying VotingSystem contract...");

  const VotingSystem = await hre.ethers.getContractFactory("VotingSystem");
  const votingSystem = await VotingSystem.deploy();

  await votingSystem.waitForDeployment();

  const address = await votingSystem.getAddress();
  console.log(`VotingSystem deployed to: ${address}`);
  console.log(`Owner address: ${(await hre.ethers.getSigners())[0].address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
