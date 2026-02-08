# 🚀 Deployment Guide

## Prerequisites

- Node.js 16+ and npm
- Git
- A web browser with MetaMask extension

---

## Local Development Network

### Option 1: Hardhat Network (Recommended)

**Start the local blockchain:**

```bash
npx hardhat node
```

This will:
- Start a local Ethereum network on `http://127.0.0.1:8545`
- Provide 20 test accounts with 10,000 ETH each
- Display account addresses and private keys
- Show transaction logs in real-time

Keep this terminal running during development.

### Option 2: Deprecated - Ganache (Legacy)

⚠️ **Note**: Ganache is deprecated but still functional for legacy projects.

**Using Ganache GUI:**
1. Download from [trufflesuite.com/ganache](https://trufflesuite.com/ganache)
2. Install and launch
3. Create a new workspace or use quickstart
4. Note the RPC server URL (usually `http://127.0.0.1:7545`)

**Using Ganache CLI (Deprecated):**
```bash
npm install -g ganache-cli
ganache-cli
```

---

## Compile Contracts

```bash
npx hardhat compile
```

**Expected output:**
```
Compiled 3 Solidity files successfully
```

---

## Deploy to Local Network

### Method 1: Using Hardhat Ignition (Recommended)

```bash
npx hardhat ignition deploy ignition/modules/Voting.ts --network localhost
```

**Save the deployed contract address** from the output:
```
VotingModule#ElectionsManager - 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### Method 2: Using Custom Deploy Script

```bash
npx hardhat run scripts/deploy-elections.js --network localhost
```

---

## Verify Deployment

Run the verification script:

```bash
npx hardhat run scripts/verify.ts --network localhost
```

**Expected output:**
```
✓ Contract code found - contract is deployed
```

---

## Run Tests

```bash
npx hardhat test
```

All tests should pass (30+ tests covering all functionality).

---

## Deploy to Sepolia Testnet

### 1. Get Test ETH

- Visit [Sepolia Faucet](https://sepoliafaucet.com/)
- Enter your MetaMask wallet address
- Request test ETH (0.5 ETH recommended)

### 2. Configure Environment

Create a `.env` file in the project root:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
SEPOLIA_PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key
```

⚠️ **Security**: Never commit `.env` to version control!

### 3. Deploy

```bash
npx hardhat ignition deploy ignition/modules/Voting.ts --network sepolia
```

### 4. Verify on Etherscan

```bash
npx hardhat verify --network sepolia DEPLOYED_CONTRACT_ADDRESS
```

---

## Gas Cost Matrix

Understanding the cost of interactions with the Voting System smart contract. Costs are estimates and may vary based on network congestion.

### Gas Costs by Function

| Function | Estimated Gas | Low (10 Gwei) | Medium (50 Gwei) | High (100 Gwei) | Description |
|----------|---------------|---------------|------------------|-----------------|-------------|
| **Poll Creation** |
| `createPoll()` | ~150,000 | 0.0015 ETH<br/>$2.85 | 0.0075 ETH<br/>$14.25 | 0.015 ETH<br/>$28.50 | Create a new poll with title, admin, and duration |
| **Option Management** |
| `addOptionToPoll()` | ~80,000 | 0.0008 ETH<br/>$1.52 | 0.004 ETH<br/>$7.60 | 0.008 ETH<br/>$15.20 | Add one voting option to a poll |
| `addOptionToPoll()` (5 options) | ~400,000 | 0.004 ETH<br/>$7.60 | 0.020 ETH<br/>$38.00 | 0.040 ETH<br/>$76.00 | Add five options (5x single) |
| **Voter Management** |
| `addVoter()` | ~50,000 | 0.0005 ETH<br/>$0.95 | 0.0025 ETH<br/>$4.75 | 0.005 ETH<br/>$9.50 | Authorize one voter |
| `addVoters()` (batch) | ~45,000 per voter | 0.000225 ETH<br/>$0.43 per voter | 0.002225 ETH<br/>$4.23 per voter | 0.0045 ETH<br/>$8.55 per voter | Authorize multiple voters in one transaction |
| `removeVoter()` | ~30,000 | 0.0003 ETH<br/>$0.57 | 0.0015 ETH<br/>$2.85 | 0.003 ETH<br/>$5.70 | Remove voter authorization |
| **Voting** |
| `voteInPoll()` | ~70,000 | 0.0007 ETH<br/>$1.33 | 0.0035 ETH<br/>$6.65 | 0.007 ETH<br/>$13.30 | Cast a vote (one-time per voter per poll) |
| **Poll Control** |
| `endPoll()` | ~35,000 | 0.00035 ETH<br/>$0.67 | 0.00175 ETH<br/>$3.33 | 0.0035 ETH<br/>$6.65 | Manually end poll before time expires |
| `revealResults()` | ~30,000 | 0.0003 ETH<br/>$0.57 | 0.0015 ETH<br/>$2.85 | 0.003 ETH<br/>$5.70 | Reveal poll results after end time |
| **View Functions** |
| `getWinner()` | 0 (read-only) | Free | Free | Free | Get winning option and vote count |
| `getOption()` | 0 (read-only) | Free | Free | Free | Get option details |
| `getTotalVotes()` | 0 (read-only) | Free | Free | Free | Get total votes cast |
| `isPollActive()` | 0 (read-only) | Free | Free | Free | Check if poll is active |
| **Ownership** |
| `transferOwnership()` | ~35,000 | 0.00035 ETH<br/>$0.67 | 0.00175 ETH<br/>$3.33 | 0.0035 ETH<br/>$6.65 | Initiate ownership transfer |
| `acceptOwnership()` | ~30,000 | 0.0003 ETH<br/>$0.57 | 0.0015 ETH<br/>$2.85 | 0.003 ETH<br/>$5.70 | Accept pending ownership |

### Typical Use Case Scenarios

| Scenario | Total Gas | Low (10 Gwei) | Medium (50 Gwei) | High (100 Gwei) |
|----------|-----------|---------------|------------------|-----------------|
| **Small Poll** (3 options, 10 voters) | ~980,000 | 0.0098 ETH<br/>$18.62 | 0.049 ETH<br/>$93.10 | 0.098 ETH<br/>$186.20 |
| - Create poll | 150,000 | | | |
| - Add 3 options | 240,000 | | | |
| - Add 10 voters (batch) | 450,000 | | | |
| - 10 votes | 700,000 | | | |
| - Reveal results | 30,000 | | | |
| **Medium Poll** (5 options, 50 voters) | ~3,930,000 | 0.0393 ETH<br/>$74.67 | 0.1965 ETH<br/>$373.35 | 0.393 ETH<br/>$746.70 |
| - Create poll | 150,000 | | | |
| - Add 5 options | 400,000 | | | |
| - Add 50 voters (batch) | 2,250,000 | | | |
| - 50 votes | 3,500,000 | | | |
| - Reveal results | 30,000 | | | |
| **Large Poll** (10 options, 100 voters) | ~12,430,000 | 0.1243 ETH<br/>$236.17 | 0.6215 ETH<br/>$1,180.85 | 1.243 ETH<br/>$2,361.70 |
| - Create poll | 150,000 | | | |
| - Add 10 options | 800,000 | | | |
| - Add 100 voters (batch) | 4,500,000 | | | |
| - 100 votes | 7,000,000 | | | |
| - Reveal results | 30,000 | | | |

### Notes on Gas Costs

1. **ETH to USD Conversion**: Assumes 1 ETH = $1,900 (prices fluctuate)
2. **Gas Price Tiers**:
   - **Low (10 Gwei)**: Off-peak hours, slower confirmation
   - **Medium (50 Gwei)**: Normal network activity
   - **High (100 Gwei)**: Peak hours, fast confirmation
3. **View Functions**: All read-only functions are free (no transaction required)
4. **Batch Operations**: Using `addVoters()` is more efficient than multiple `addVoter()` calls
5. **Optimization**: Costs are estimates; actual costs depend on:
   - Input data size (longer strings cost more)
   - Current network conditions
   - Compiler optimizations enabled

### Check Current Gas Prices

- [Etherscan Gas Tracker](https://etherscan.io/gastracker)
- [ETH Gas Station](https://ethgasstation.info/)

---

## Connect MetaMask

### For Local Network

1. Open MetaMask
2. Click network dropdown → "Add Network"
3. Enter details:
   - **Network Name**: Hardhat Local
   - **RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: ETH

4. Import test account:
   - Copy private key from Hardhat node output
   - MetaMask → Account → Import Account
   - Paste private key

### For Sepolia

MetaMask includes Sepolia by default. Select it from the network dropdown.

---

## Troubleshooting

### "Nonce too high" Error

Reset MetaMask account:
1. Settings → Advanced
2. Clear activity tab data

### Contract Not Deployed

Verify the contract exists:
```bash
npx hardhat run scripts/check-contract-state.js --network localhost
```

### Hardhat Network Connection Issues

- Ensure `npx hardhat node` is running
- Check that port 8545 is not blocked
- Verify RPC URL is `http://127.0.0.1:8545` (not localhost)

### Transaction Fails

- Check that you're using the owner account for admin functions
- Ensure poll duration meets minimum (300 seconds)
- Verify voter authorization before voting

---

## Next Steps

Once deployed:
1. ✅ Note the contract address
2. ✅ Update your frontend configuration
3. ✅ Add voters to your poll
4. ✅ Test voting functionality
5. ✅ Monitor events and transactions

Refer to [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details.
Refer to [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.