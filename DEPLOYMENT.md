# Deployment Guide

This guide will help you deploy and test the Blockchain Voting System.

## Prerequisites

Before you begin, ensure you have:
- Node.js v16 or higher installed
- MetaMask browser extension installed
- Basic understanding of blockchain and Ethereum

## Step 1: Installation

```bash
# Clone the repository
git clone https://github.com/soralank/votingsystem.git
cd votingsystem

# Install dependencies
npm install
```

## Step 2: Compile Smart Contracts

```bash
npm run compile
```

This will compile the Solidity smart contracts and generate artifacts in the `artifacts/` directory.

## Step 3: Run Tests

```bash
npm test
```

All tests should pass, demonstrating that the smart contract functions correctly.

## Step 4: Deploy to Local Network

### Start Local Blockchain

In one terminal, start a local Hardhat network:

```bash
npm run node
```

This will:
- Start a local Ethereum network
- Create 20 test accounts with 10,000 ETH each
- Display the network details (http://127.0.0.1:8545)

Keep this terminal running.

### Deploy the Contract

In a new terminal:

```bash
npm run deploy
```

This will deploy the VotingSystem contract to your local network and display:
- The contract address
- The owner address

**Important**: Save the contract address - you'll need it for the frontend.

## Step 5: Configure MetaMask

### Add Local Network to MetaMask

1. Open MetaMask
2. Click the network dropdown (usually shows "Ethereum Mainnet")
3. Click "Add Network" → "Add a network manually"
4. Enter the following details:
   - Network Name: `Hardhat Local`
   - New RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `1337`
   - Currency Symbol: `ETH`
5. Click "Save"

### Import Test Account

1. In MetaMask, click the account icon
2. Select "Import Account"
3. Copy a private key from the Hardhat node terminal (Account #0 is the contract owner)
4. Paste and import

## Step 6: Use the Frontend

1. Open `frontend/index.html` in your browser
2. Click "Connect Wallet" and approve the connection
3. Enter the deployed contract address
4. Click "Load Contract"

### Creating an Election (Owner Only)

1. Fill in the election details:
   - Name: "Test Election 2024"
   - Description: "A test election"
   - Duration: 7 (days)
2. Click "Create Election"
3. Approve the transaction in MetaMask

### Adding Candidates (Owner Only)

**Note**: Candidates must be added before the election starts. Since elections start immediately in this demo, you'll need to modify the contract or create a new election with a future start time.

For testing:
1. Modify the smart contract to accept a startTime parameter, or
2. Use the Hardhat console to manipulate time

### Registering Voters (Owner Only)

1. Enter the election ID (1)
2. Enter a voter address (you can use one of the other accounts from Hardhat)
3. Click "Register Voter"
4. Approve the transaction

### Casting Votes

1. Switch to a registered voter account in MetaMask
2. Enter the election ID
3. Enter the candidate ID
4. Click "Vote"
5. Approve the transaction

### Viewing Results

1. Enter the election ID
2. Click "View Election Details" to see all candidates and vote counts
3. Click "View Results" to see the winner (only works after election ends)

## Step 7: Testing with Hardhat Console

For more control, use the Hardhat console:

```bash
npx hardhat console --network localhost
```

Then run commands:

```javascript
const VotingSystem = await ethers.getContractFactory("VotingSystem");
const votingSystem = await VotingSystem.attach("YOUR_CONTRACT_ADDRESS");

// Create election
await votingSystem.createElection("Test", "Description", 7);

// Get election count
const count = await votingSystem.electionCount();
console.log("Elections:", count.toString());

// Register voter
const [owner, voter1] = await ethers.getSigners();
await votingSystem.registerVoter(1, voter1.address);

// Check registration
const isRegistered = await votingSystem.isRegisteredVoter(1, voter1.address);
console.log("Registered:", isRegistered);
```

## Troubleshooting

### "Transaction failed" error
- Make sure you're connected to the correct network (Hardhat Local)
- Ensure you have enough ETH in your account
- Check that you're using the correct contract address

### "Only owner can call this function"
- Ensure you're using the owner account for owner-only functions
- The owner is the account that deployed the contract

### "Election has not started yet" or "Election has ended"
- Check the election's start and end times
- Use Hardhat's time manipulation for testing

### Frontend not connecting
- Make sure the Hardhat node is running
- Verify MetaMask is on the correct network
- Check browser console for errors

## Advanced: Time Manipulation for Testing

To test time-based features:

```javascript
// In Hardhat console
await network.provider.send("evm_increaseTime", [24 * 60 * 60]); // Add 1 day
await network.provider.send("evm_mine"); // Mine a block

// Now you can test election end scenarios
```

## Deploying to Testnet (Sepolia, Goerli, etc.)

1. Get testnet ETH from a faucet
2. Update `hardhat.config.js` with your network configuration
3. Set up environment variables for your private key
4. Deploy: `npx hardhat run scripts/deploy.js --network sepolia`

## Production Deployment

⚠️ **Warning**: This is a demo application. Before deploying to mainnet:

1. Get a professional security audit
2. Add additional access controls
3. Implement proper key management
4. Consider gas optimization
5. Add event monitoring
6. Implement emergency pause functionality
7. Test extensively on testnets

## Support

For issues and questions:
- Check the README.md
- Review the smart contract comments
- Test on the local network first
- Check Hardhat documentation: https://hardhat.org/
