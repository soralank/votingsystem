import { ethers } from "ethers";

async function main() {
  // REPLACE THIS with your actual deployed address
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  
  console.log("Verifying contract at:", contractAddress);
  
  // Connect directly to localhost
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  
  // Check if contract exists
  const code = await provider.getCode(contractAddress);
  console.log("Contract code length:", code.length);
  
  if (code === '0x' || code === '0x0') {
    console.error("✗ No contract deployed at this address");
    console.error("Deploy the contract first using:");
    console.error("npx hardhat ignition deploy ignition/modules/Voting.ts --network localhost");
    return;
  }
  
  console.log("✓ Contract code found - contract is deployed");
  console.log("\nNow paste this address into your UI:");
  console.log(contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
