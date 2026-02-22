# Deployment Guide — Voting System v4.1

Complete operational reference for deploying the voting system smart contracts to local, Sepolia testnet, and Ethereum mainnet environments.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development Deployment](#local-development-deployment)
- [Testnet Deployment (Sepolia)](#testnet-deployment-sepolia)
- [Mainnet Deployment](#mainnet-deployment)
- [Post-Deployment Verification](#post-deployment-verification)
- [Gas Cost Reference](#gas-cost-reference)
- [Upgradeable Deployment](#upgradeable-deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [MetaMask Configuration](#metamask-configuration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Minimum Version |
|----------|----------------|
| Node.js | 18.0.0 |
| npm | 9.0.0 |
| Git | Latest |

Verify installation:

```bash
node --version   # v18.0.0+
npm --version    # 9.0.0+
```

### Wallet Requirements

| Network | Funding |
|---------|---------|
| **Local (Hardhat)** | Free — 20 test accounts with 10,000 ETH each |
| **Sepolia Testnet** | Free — obtained from faucets (0.5–1 ETH recommended) |
| **Mainnet** | Real ETH — minimum 0.2 ETH for deployment; hardware wallet recommended |

---

## Environment Setup

### Step 1 — Clone and Install

```bash
git clone https://github.com/soralank/votingsystem.git
cd votingsystem
npm install
npx hardhat compile
```

### Step 2 — Create Environment File

Create `.env` in the project root:

```env
# Network RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_API_KEY
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_API_KEY

# Private Keys (NEVER commit these)
SEPOLIA_PRIVATE_KEY=your_sepolia_private_key_here
MAINNET_PRIVATE_KEY=your_mainnet_private_key_here

# Etherscan API Key (for contract verification)
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

> **Security**: Ensure `.env` is listed in `.gitignore`. Never commit private keys to version control.

### Step 3 — Obtain API Keys

**RPC Providers** (choose one):
- [Infura](https://infura.io/) — Create project, copy API key
- [Alchemy](https://www.alchemy.com/) — Create app, copy HTTPS URL

**Etherscan** (for contract verification):
- [etherscan.io](https://etherscan.io/) — Register, navigate to API Keys, create key

### Step 4 — Obtain Test ETH (Sepolia)

- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Alchemy Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)
- [Infura Faucet](https://www.infura.io/faucet/sepolia)

Request 0.5–1 ETH, sufficient for multiple deployments.

---

## Local Development Deployment

### Step 1 — Start Local Network

```bash
npx hardhat node
```

Keep this terminal running. The console will display 20 test accounts with pre-funded balances.

### Step 2 — Deploy All Contracts

In a separate terminal:

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost
```

The deployment module automatically:
1. Deploys **ElectionsManager** (which auto-deploys 4 module contracts in its constructor)
2. Deploys **TokenManager** and links it to ElectionsManager
3. Deploys **VotingPaymaster**, links it to ElectionsManager, and funds it with 1 ETH
4. Deploys **SecretBallotManager** and links it to ElectionsManager

Expected output:

```
Hardhat Ignition

Deploying [ GaslessVotingModule ]

Batch #1
  Executed GaslessVotingModule#ElectionsManager
  Executed GaslessVotingModule#TokenManager
  Executed GaslessVotingModule#VotingPaymaster
  Executed GaslessVotingModule#SecretBallotManager

Batch #2
  Executed GaslessVotingModule#ElectionsManager.setTokenManager
  Executed GaslessVotingModule#ElectionsManager.setVotingPaymaster
  Executed GaslessVotingModule#ElectionsManager.setSecretBallotManager
  Executed GaslessVotingModule#VotingPaymaster.fund

[ GaslessVotingModule ] successfully deployed

Deployed Addresses
GaslessVotingModule#ElectionsManager - 0x...
GaslessVotingModule#TokenManager - 0x...
GaslessVotingModule#VotingPaymaster - 0x...
GaslessVotingModule#SecretBallotManager - 0x...
```

Record all four deployed addresses.

### Step 3 — Verify Deployment

```javascript
// Via Hardhat console: npx hardhat console --network localhost
const em = await ethers.getContractAt("ElectionsManager", "YOUR_ADDRESS");

console.log("Owner:", await em.owner());
console.log("Infrastructure locked:", await em.infrastructureLocked());  // false until first poll
console.log("TokenManager:", await em.tokenManager());
console.log("VotingPaymaster:", await em.votingPaymaster());
console.log("SecretBallotMgr:", await em.secretBallotMgr());
```

### Step 4 — Run Tests

```bash
npx hardhat test
```

All 396 tests across 12 suites should pass with 100% success rate.

---

## Testnet Deployment (Sepolia)

### Step 1 — Verify Configuration

Confirm `hardhat.config.ts` contains the Sepolia network definition:

```typescript
networks: {
  sepolia: {
    type: "http",
    chainType: "l1",
    url: configVariable("SEPOLIA_RPC_URL"),
    accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
  },
}
```

### Step 2 — Verify Wallet Balance

Ensure the deployer wallet holds at least 0.1 ETH on Sepolia.

### Step 3 — Deploy

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network sepolia
```

### Step 4 — Verify Contracts on Etherscan

Verify each contract for source code transparency:

```bash
# ElectionsManager (no constructor arguments)
npx hardhat verify --network sepolia ELECTIONS_MANAGER_ADDRESS

# SecretBallotManager (constructor arg: ElectionsManager address)
npx hardhat verify --network sepolia SECRET_BALLOT_MANAGER_ADDRESS ELECTIONS_MANAGER_ADDRESS

# TokenManager (constructor arg: ElectionsManager address)
npx hardhat verify --network sepolia TOKEN_MANAGER_ADDRESS ELECTIONS_MANAGER_ADDRESS

# VotingPaymaster (constructor args: ElectionsManager, TokenManager, admin)
npx hardhat verify --network sepolia VOTING_PAYMASTER_ADDRESS ELECTIONS_MANAGER_ADDRESS TOKEN_MANAGER_ADDRESS DEPLOYER_ADDRESS
```

### Step 5 — Smoke Test

```javascript
const em = await ethers.getContractAt("ElectionsManager", "YOUR_ADDRESS");
console.log("Owner:", await em.owner());
console.log("Locked:", await em.infrastructureLocked());
```

---

## Mainnet Deployment

> **Warning**: Mainnet deployment involves real funds. Follow the checklist below without exception.

### Pre-Deployment Checklist

- [ ] All 396 tests passing locally
- [ ] Successfully deployed and tested on Sepolia
- [ ] Gas cost estimates reviewed and acceptable
- [ ] Private keys secured (hardware wallet recommended)
- [ ] Deployer wallet holds at least 0.2 ETH
- [ ] Emergency ownership transfer plan prepared (two-step transfer, multisig path)
- [ ] All documentation reviewed

### Step 1 — Full Test Suite

```bash
npx hardhat test
REPORT_GAS=true npx hardhat test
```

100% pass rate required.

### Step 2 — Deploy

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network mainnet
```

### Step 3 — Verify on Etherscan

```bash
npx hardhat verify --network mainnet ELECTIONS_MANAGER_ADDRESS
npx hardhat verify --network mainnet SECRET_BALLOT_MANAGER_ADDRESS ELECTIONS_MANAGER_ADDRESS
npx hardhat verify --network mainnet TOKEN_MANAGER_ADDRESS ELECTIONS_MANAGER_ADDRESS
npx hardhat verify --network mainnet VOTING_PAYMASTER_ADDRESS ELECTIONS_MANAGER_ADDRESS TOKEN_MANAGER_ADDRESS DEPLOYER_ADDRESS
```

### Step 4 — Post-Deployment Actions

1. Verify all contracts on Etherscan
2. Execute a test poll to confirm end-to-end functionality
3. Transfer ownership to a multisig if appropriate:
   ```javascript
   await em.transferOwnership("MULTISIG_ADDRESS");
   // From the multisig:
   await em.acceptOwnership();
   ```
4. After the first poll is created, infrastructure is **permanently locked** — TokenManager, VotingPaymaster, SecretBallotManager, and FranchiseManager addresses become immutable

---

## Post-Deployment Verification

After deploying to any network, verify the full contract graph:

```javascript
const em = await ethers.getContractAt("ElectionsManager", EM_ADDRESS);

// Ownership
console.log("Owner:", await em.owner());

// Linked infrastructure contracts
console.log("TokenManager:", await em.tokenManager());
console.log("VotingPaymaster:", await em.votingPaymaster());
console.log("SecretBallotMgr:", await em.secretBallotMgr());
console.log("FranchiseManager:", await em.franchiseMgr());

// Auto-deployed module contracts
console.log("MultiChoiceVoting:", await em.multiChoiceVoting());
console.log("QuadraticVoting:", await em.quadraticVoting());
console.log("DelegationVoting:", await em.delegationVoting());
console.log("MetadataVoting:", await em.metadataVoting());

// Infrastructure lock status
console.log("Locked:", await em.infrastructureLocked());

// Paymaster balance
const pm = await ethers.getContractAt("VotingPaymaster", PM_ADDRESS);
const balance = await ethers.provider.getBalance(PM_ADDRESS);
console.log("Paymaster balance:", ethers.formatEther(balance), "ETH");
```

---

## Gas Cost Reference

### Deployment Gas

| Contract | Estimated Gas | Notes |
|----------|---------------|-------|
| ElectionsManager | ~2,800,000 | Main contract (23,932 bytes, near 24 KB limit) |
| TokenManager | ~1,500,000 | Per-poll token factory |
| VotingPaymaster | ~1,200,000 | Gas sponsorship contract |
| SecretBallotManager | ~800,000 | Commit-reveal contract |
| FranchiseManager | ~600,000 | Franchise sub-admin system |
| Configuration txs | ~300,000 | setTokenManager, setVotingPaymaster, setSecretBallotManager |

### Per-Function Gas

| Function | Estimated Gas | Notes |
|----------|---------------|-------|
| `createPoll()` | ~200,000 | Locks infrastructure on first call |
| `createPoll()` (with tokens) | ~1,000,000 | Includes per-poll token deployment |
| `addOptionToPoll()` | ~80,000 | Per option |
| `addVoter()` | ~50,000 | Single voter |
| `addVoters()` (batch 10) | ~200,000 | Batch authorisation |
| `addVotersWithTokens()` (10) | ~350,000 | Authorise + allocate tokens |
| `voteInPoll()` | ~70,000 | Traditional vote |
| `voteInPollWithToken()` | ~120,000 | Token burn included |
| `voteMultiChoice()` (3 choices) | ~140,000 | Multi-choice vote |
| `voteQuadratic()` | ~150,000 | Quadratic vote |
| `voteAsDelegate()` | ~100,000 | Delegation vote |
| `commitVote()` | ~80,000 | Secret ballot hash commitment |
| `commitVoteWithToken()` | ~130,000 | Commit + token burn |
| `revealVote()` | ~100,000 | Hash verification + callback |
| `revealResults()` | ~50,000 | Democratic reveal (anyone) |
| `transferOwnership()` | ~35,000 | Initiate two-step transfer |
| `acceptOwnership()` | ~30,000 | Accept ownership |
| View functions | 0 | Read-only, no transaction required |

### Typical Scenario Costs

At 50 gwei gas price and $2,000/ETH:

| Scenario | Total Gas | Estimated USD |
|----------|-----------|---------------|
| Small poll: 3 options, 10 voters, 10 votes | ~1,000,000 | ~$100 |
| Medium poll: 5 options, 50 voters, 50 votes | ~4,000,000 | ~$400 |
| Large poll: 10 options, 100 voters, 100 votes | ~12,500,000 | ~$1,250 |
| Secret ballot overhead per voter | +~180,000 | +~$18 |

Check live gas prices: [etherscan.io/gastracker](https://etherscan.io/gastracker)

> **Notes**: Batch operations (`addVoters`, `addVotersWithTokens`) are more gas-efficient than individual calls. Optimizer is configured at 100 runs with `viaIR: true` for contract size optimisation.

---

## Upgradeable Deployment

For deployments requiring post-deployment upgrade capability:

### Initial Deployment (V1)

```bash
npx hardhat ignition deploy ignition/modules/UpgradeableVoting.ts --network <network>
```

Deploys an ERC1967 proxy pointing to the ElectionsManagerUpgradeable V1 implementation, plus TokenManager and VotingPaymaster. The proxy address is your permanent contract address.

### Upgrade to V2

```bash
npx hardhat ignition deploy ignition/modules/UpgradeToV2.ts \
  --parameters ignition/parameters/upgrade-v2.json \
  --network <network>
```

All existing data is preserved across upgrades. Users continue interacting with the same proxy address.

See [docs/UPGRADEABLE_MODULE.md](./docs/UPGRADEABLE_MODULE.md) for the complete upgrade guide including storage layout rules, safety features, and rollback procedures.

---

## CI/CD Pipeline

The project includes a GitHub Actions pipeline (`.github/workflows/ci.yml`) executing on every push and pull request to `main` and `develop`.

| Job | Description |
|-----|-------------|
| **Compile** | Compiles all Solidity contracts, validates sizes |
| **Test** | Runs full 396-test suite with gas reporting |
| **Slither** | Static security analysis |
| **Deploy Check** | Verifies all Ignition deployment modules are valid |

### Running CI Locally

```bash
npx hardhat compile
npx hardhat test
REPORT_GAS=true npx hardhat test
```

---

## MetaMask Configuration

### Local Network (Hardhat)

| Setting | Value |
|---------|-------|
| Network Name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | 31337 |
| Currency Symbol | ETH |

Import a test account private key from Hardhat node output to fund your local wallet.

### Sepolia

Sepolia is included in MetaMask by default. Select it from the network dropdown.

### Mainnet

Ethereum Mainnet is the MetaMask default network.

---

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| "Insufficient funds for gas" | Obtain testnet ETH from a faucet, or add mainnet ETH |
| "Nonce too high" | Reset MetaMask: Settings → Advanced → Clear activity data |
| "Transaction underpriced" | Increase gas price or wait for lower network congestion |
| "Contract size exceeds limit" | Optimizer is already configured (100 runs, viaIR). Do not add code to ElectionsManager without factoring to modules |
| "Verification failed" | Ensure constructor arguments match exactly. Attempt manual verification on Etherscan |
| "Infra locked" | Infrastructure is permanently locked after the first poll is created. This is by design |
| Connection refused | Ensure `npx hardhat node` is running for localhost; verify RPC URL for remote networks |

### Getting Help

1. [Hardhat Documentation](https://hardhat.org/docs)
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — Design intent, threat model, attack classification, governance hardening (upgrade risk matrix, emergency migration), operational playbooks, monitoring guide (Grafana/Graph queries), formal verification roadmap, threat simulation appendix
3. [docs/ERROR_CODES.md](./docs/ERROR_CODES.md) — All 56+ error messages with frontend handling guidance

---

**Version**: 4.1.0  
**Networks**: Local (Hardhat) | Sepolia | Mainnet  
**Contracts Deployed**: 5 explicit + 4 auto-deployed modules  
**Last Updated**: 2026-02-22
