# 🚀 Deployment Guide (Quick Reference)

## Prerequisites

- Node.js 18+ and npm
- Git
- A web browser with MetaMask extension

For detailed step-by-step instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

---

## Compile Contracts

```bash
npx hardhat compile
```

Expected output: Successfully compiles 12 Solidity files.

---

## Deploy to Local Network

### Step 1: Start Local Hardhat Network

```bash
npx hardhat node
```

### Step 2: Deploy Contracts

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost
```

This deploys and configures:
1. **ElectionsManager** — Main voting contract
2. **TokenManager** — Per-poll token factory
3. **VotingPaymaster** — Gas sponsor (funded with 1 ETH)
4. **SecretBallotManager** — Commit-reveal voting

All contracts are wired together automatically. Infrastructure locks permanently after the first poll is created.

---

## Deploy to Sepolia Testnet

### 1. Get Test ETH

- Visit [Sepolia Faucet](https://sepoliafaucet.com/)
- Request 0.5 ETH for deployment + testing

### 2. Configure Environment

Set up your Hardhat config variables (or `.env`):

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
SEPOLIA_PRIVATE_KEY=your_private_key_here
```

### 3. Deploy

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network sepolia
```

### 4. Verify on Etherscan

```bash
npx hardhat verify --network sepolia DEPLOYED_CONTRACT_ADDRESS
```

---

## Deploy to Mainnet

⚠️ **Real money involved!** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for the full mainnet deployment checklist.

### Configure

Set up your Hardhat config variables:

```env
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY
MAINNET_PRIVATE_KEY=your_private_key_here
```

### Deploy

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network mainnet
```

---

## Run Tests

```bash
npx hardhat test
```

All 312 tests should pass.

---

## Gas Cost Matrix

### Gas Costs by Function

| Function | Estimated Gas | Notes |
|----------|---------------|-------|
| **Deployment** |
| Deploy ElectionsManager | ~2,800,000 | Main contract (24,411 bytes) |
| Deploy SecretBallotManager | ~800,000 | Commit-reveal contract |
| Deploy TokenManager | ~1,500,000 | Token factory |
| Deploy VotingPaymaster | ~1,200,000 | Gas sponsor |
| **Poll Management** |
| `createPoll()` | ~200,000 | Locks infrastructure on first call |
| `createPoll()` (with token) | ~1,000,000 | Includes token deployment |
| `addOptionToPoll()` | ~80,000 | Per option |
| `addVoter()` | ~50,000 | Single voter |
| `addVoters()` (batch 10) | ~200,000 | Batch operation |
| `addVotersWithTokens()` (10) | ~350,000 | Authorize + allocate tokens |
| **Voting** |
| `voteInPoll()` | ~70,000 | Traditional vote |
| `voteInPollWithToken()` | ~120,000 | Token burn included |
| `voteMultiChoice()` (3 choices) | ~140,000 | Multi-choice |
| `voteQuadratic()` | ~150,000 | Quadratic voting |
| `voteAsDelegate()` | ~100,000 | Delegation vote |
| **Secret Ballot** |
| `commitVote()` | ~80,000 | Hash commitment |
| `commitVoteWithToken()` | ~130,000 | Commit + token burn |
| `revealVote()` | ~100,000 | Hash verification + callback |
| **Results** |
| `revealResults()` | ~50,000 | Anyone can call after time |
| **View Functions** | 0 (read-only) | Free |
| **Ownership** |
| `transferOwnership()` | ~35,000 | Initiate transfer |
| `acceptOwnership()` | ~30,000 | Accept transfer |

### Typical Use Case Costs

| Scenario | Total Gas | At 50 Gwei (~$2000/ETH) |
|----------|-----------|------------------------|
| **Small Poll** (3 options, 10 voters, 10 votes) | ~1,000,000 | ~$100 |
| **Medium Poll** (5 options, 50 voters, 50 votes) | ~4,000,000 | ~$400 |
| **Large Poll** (10 options, 100 voters, 100 votes) | ~12,500,000 | ~$1,250 |
| **Secret Ballot** (add commit + reveal overhead per voter) | +~180,000/voter | +~$18/voter |

### Notes

1. Gas prices vary with network congestion. Check [Etherscan Gas Tracker](https://etherscan.io/gastracker).
2. View functions are free (no transaction required).
3. Batch operations (`addVoters`, `addVotersWithTokens`) are more efficient than individual calls.
4. Secret ballot adds ~180K gas per voter (commit + reveal) vs traditional voting.
5. Optimizer is set to 100 runs with `viaIR: true` for contract size optimization.

---

## Connect MetaMask

### For Local Network

1. Open MetaMask → Add Network
2. **Network Name**: Hardhat Local
3. **RPC URL**: `http://127.0.0.1:8545`
4. **Chain ID**: `31337`
5. **Currency Symbol**: ETH
6. Import a test account private key from Hardhat node output

### For Sepolia

MetaMask includes Sepolia by default. Select from network dropdown.

### For Mainnet

MetaMask Ethereum Mainnet is the default network.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Nonce too high" | Reset MetaMask: Settings → Advanced → Clear activity data |
| Contract not deployed | Run `npx hardhat run scripts/check-contract-state.js --network localhost` |
| Connection issues | Ensure `npx hardhat node` is running, use `http://127.0.0.1:8545` |
| Transaction fails | Check account has sufficient ETH, verify permissions |
| "Infra locked" | Infrastructure is permanently locked after first poll — by design |

---

## Next Steps

1. ✅ Note all deployed contract addresses
2. ✅ Verify contracts on Etherscan (for testnets/mainnet)
3. ✅ Test with a small poll before production use
4. ✅ Set up event monitoring

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for the comprehensive deployment walkthrough.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details.
