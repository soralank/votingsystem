# 🚀 Deployment Guide - Blockchain Voting System v4.0

Complete guide for deploying the voting system smart contracts to local, Sepolia testnet, and Ethereum mainnet.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development Deployment](#local-development-deployment)
- [Testnet Deployment (Sepolia)](#testnet-deployment-sepolia)
- [Mainnet Deployment](#mainnet-deployment)
- [Post-Deployment Verification](#post-deployment-verification)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

## ✅ Prerequisites

### Required Software

```bash
Node.js >= 18.0.0
npm >= 9.0.0
Git
```

Check your versions:

```bash
node --version  # Should be v18.0.0 or higher
npm --version   # Should be 9.0.0 or higher
```

### Funded Wallet

- **Local**: Free (Hardhat provides test accounts with 10,000 ETH each)
- **Testnet**: Free Sepolia ETH from faucets
- **Mainnet**: Real ETH (~0.1-0.2 ETH recommended for full deployment)

## 🔧 Environment Setup

### Step 1: Clone and Install

```bash
git clone https://github.com/soralank/votingsystem.git
cd votingsystem
npm install
npx hardhat compile
```

### Step 2: Create Environment File

Create `.env` in the project root:

```env
# Network RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_API_KEY
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_API_KEY

# Private Keys (NEVER commit these!)
SEPOLIA_PRIVATE_KEY=your_sepolia_private_key_here
MAINNET_PRIVATE_KEY=your_mainnet_private_key_here

# Optional: Etherscan API Key (for contract verification)
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

⚠️ **Security Warning**: Add `.env` to `.gitignore`!

### Step 3: Get API Keys

**RPC URLs** (choose one):
- [Infura](https://infura.io/) — Create project → copy API key
- [Alchemy](https://www.alchemy.com/) — Create app → copy HTTPS URL

**Etherscan API Key** (for contract verification):
- [etherscan.io](https://etherscan.io/) → Sign up → API Keys → Create key

### Step 4: Get Test ETH (Sepolia)

- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Alchemy Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)
- [Infura Faucet](https://www.infura.io/faucet/sepolia)

Request 0.5-1 ETH (sufficient for multiple deployments).

## 🏠 Local Development Deployment

### Step 1: Start Local Hardhat Network

```bash
npx hardhat node
```

Keep this terminal running. You'll see 20 test accounts with 10,000 ETH each.

### Step 2: Deploy All Contracts

In a **new terminal**:

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost
```

This deploys and auto-configures:
1. **ElectionsManager** — Main voting contract with trust features
2. **TokenManager** — Per-poll token factory (linked to ElectionsManager)
3. **VotingPaymaster** — Gas sponsor (linked + funded with 1 ETH)
4. **SecretBallotManager** — Commit-reveal voting (linked to ElectionsManager)

Expected output:
```
Hardhat Ignition 🚀

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

[ GaslessVotingModule ] successfully deployed 🚀

Deployed Addresses
GaslessVotingModule#ElectionsManager - 0x...
GaslessVotingModule#TokenManager - 0x...
GaslessVotingModule#VotingPaymaster - 0x...
GaslessVotingModule#SecretBallotManager - 0x...
```

**Save all 4 deployed addresses!**

### Step 3: Verify Deployment

```bash
npx hardhat run scripts/check-contract-state.js --network localhost
```

Or use Hardhat console:

```bash
npx hardhat console --network localhost
```

```javascript
const EM = await ethers.getContractFactory("ElectionsManager");
const em = await EM.attach("YOUR_ELECTIONS_MANAGER_ADDRESS");

const owner = await em.owner();
console.log("Owner:", owner);

const locked = await em.infrastructureLocked();
console.log("Infrastructure locked:", locked);  // false (until first poll)
```

### Step 4: Test Locally

```bash
npx hardhat test
```

All 312 tests should pass.

## 🌐 Testnet Deployment (Sepolia)

### Step 1: Verify Configuration

Confirm `hardhat.config.ts` has the Sepolia network:

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

### Step 2: Check Balance

Ensure your wallet has sufficient Sepolia ETH (>0.1 ETH recommended).

### Step 3: Deploy to Sepolia

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network sepolia
```

### Step 4: Verify on Etherscan

Verify each contract on Etherscan for transparency:

```bash
# ElectionsManager (no constructor args)
npx hardhat verify --network sepolia ELECTIONS_MANAGER_ADDRESS

# SecretBallotManager (constructor arg: electionsManager address)
npx hardhat verify --network sepolia SECRET_BALLOT_MANAGER_ADDRESS ELECTIONS_MANAGER_ADDRESS

# TokenManager (constructor arg: electionsManager address)
npx hardhat verify --network sepolia TOKEN_MANAGER_ADDRESS ELECTIONS_MANAGER_ADDRESS

# VotingPaymaster (constructor args: electionsManager, tokenManager, admin)
npx hardhat verify --network sepolia VOTING_PAYMASTER_ADDRESS ELECTIONS_MANAGER_ADDRESS TOKEN_MANAGER_ADDRESS DEPLOYER_ADDRESS
```

### Step 5: Test on Sepolia

```bash
npx hardhat console --network sepolia
```

```javascript
const em = await ethers.getContractAt("ElectionsManager", "YOUR_ADDRESS");
const owner = await em.owner();
console.log("Owner:", owner);
console.log("Locked:", await em.infrastructureLocked());
```

## 🔴 Mainnet Deployment

⚠️ **DANGER ZONE**: Real money involved!

### Pre-Deployment Checklist

- [ ] All 312 tests passing
- [ ] Tested on Sepolia testnet successfully
- [ ] Gas costs estimated and acceptable
- [ ] Private keys secured (hardware wallet recommended)
- [ ] At least 0.2 ETH in deployer wallet
- [ ] Documentation reviewed
- [ ] Emergency plan ready (two-step ownership transfer, upgradeable path)

### Step 1: Verify Configuration

Confirm `hardhat.config.ts` has the mainnet network:

```typescript
networks: {
  mainnet: {
    type: "http",
    chainType: "l1",
    url: configVariable("MAINNET_RPC_URL"),
    accounts: [configVariable("MAINNET_PRIVATE_KEY")],
  },
}
```

### Step 2: Run Full Test Suite

```bash
npx hardhat test
REPORT_GAS=true npx hardhat test
```

All 312 tests must pass with 100% success rate.

### Step 3: Estimate Costs

At 50 gwei gas price and $2,000/ETH:

| Contract | Estimated Gas | Estimated Cost |
|----------|---------------|----------------|
| ElectionsManager | ~2,800,000 | ~$280 |
| TokenManager | ~1,500,000 | ~$150 |
| VotingPaymaster | ~1,200,000 | ~$120 |
| SecretBallotManager | ~800,000 | ~$80 |
| Configuration txs | ~300,000 | ~$30 |
| Paymaster funding | 1 ETH | $2,000 |
| **Total** | | **~$2,660** |

Check current gas prices: [etherscan.io/gastracker](https://etherscan.io/gastracker)

### Step 4: Deploy to Mainnet

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network mainnet
```

### Step 5: Verify on Etherscan

```bash
npx hardhat verify --network mainnet ELECTIONS_MANAGER_ADDRESS
npx hardhat verify --network mainnet SECRET_BALLOT_MANAGER_ADDRESS ELECTIONS_MANAGER_ADDRESS
npx hardhat verify --network mainnet TOKEN_MANAGER_ADDRESS ELECTIONS_MANAGER_ADDRESS
npx hardhat verify --network mainnet VOTING_PAYMASTER_ADDRESS ELECTIONS_MANAGER_ADDRESS TOKEN_MANAGER_ADDRESS DEPLOYER_ADDRESS
```

### Step 6: Post-Deployment Actions

1. **Verify all contracts** on Etherscan
2. **Test a small poll** to confirm everything works
3. **Transfer ownership** to a multisig if needed:
   ```javascript
   await em.transferOwnership("MULTISIG_ADDRESS");
   // Then from multisig:
   await em.acceptOwnership();
   ```
4. **Note**: After creating the first poll, infrastructure is **permanently locked** — TokenManager, VotingPaymaster, and SecretBallotManager addresses cannot be changed.

## 📋 Post-Deployment Verification

After deploying to any network, verify:

```javascript
const em = await ethers.getContractAt("ElectionsManager", EM_ADDRESS);

// 1. Check owner
console.log("Owner:", await em.owner());

// 2. Check linked contracts
console.log("TokenManager:", await em.tokenManager());
console.log("VotingPaymaster:", await em.votingPaymaster());
console.log("SecretBallotMgr:", await em.secretBallotMgr());

// 3. Check infrastructure lock status
console.log("Locked:", await em.infrastructureLocked());

// 4. Check paymaster balance
const pm = await ethers.getContractAt("VotingPaymaster", PM_ADDRESS);
const balance = await ethers.provider.getBalance(PM_ADDRESS);
console.log("Paymaster balance:", ethers.formatEther(balance), "ETH");
```

## 🔄 Upgradeable Deployment (Optional)

For production use with upgrade capability:

### Initial Deployment (V1)

```bash
npx hardhat ignition deploy ignition/modules/UpgradeableVoting.ts --network <network>
```

Deploys:
- ERC1967Proxy (your permanent address)
- ElectionsManagerUpgradeable V1 (implementation)
- TokenManager
- VotingPaymaster

### Upgrade to V2

```bash
npx hardhat ignition deploy ignition/modules/UpgradeToV2.ts \
  --parameters ignition/parameters/upgrade-v2.json \
  --network <network>
```

See [docs/UPGRADEABLE_MODULE.md](./docs/UPGRADEABLE_MODULE.md) for the full upgrade guide.

## 🔧 CI/CD Pipeline

The project includes a GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml`) that runs on every push and PR to `main` and `develop` branches.

### Pipeline Jobs

| Job | Description |
|-----|-------------|
| **Compile** | Compiles all Solidity contracts, checks sizes |
| **Test** | Runs all 312 tests + gas reporting |
| **Slither** | Static security analysis (Slither) |
| **Deploy Check** | Verifies all ignition deployment modules exist |

### Running CI Locally

```bash
# Same steps as CI pipeline
npx hardhat compile
npx hardhat test
REPORT_GAS=true npx hardhat test
```

### Deployment Commands Summary

| Network | Command |
|---------|---------|
| **Local** | `npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost` |
| **Sepolia** | `npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network sepolia` |
| **Mainnet** | `npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network mainnet` |
| **Upgradeable** | `npx hardhat ignition deploy ignition/modules/UpgradeableVoting.ts --network <network>` |

## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Insufficient funds for gas" | Get testnet ETH from faucet, or add more mainnet ETH |
| "Nonce too high" | Reset MetaMask: Settings → Advanced → Clear activity data |
| "Transaction underpriced" | Increase gas price in hardhat.config.ts or wait for lower gas |
| "Contract size exceeds limit" | Optimizer is already configured (100 runs, viaIR). Don't add code. |
| "Verification failed" | Ensure constructor args match exactly. Try manual verification on Etherscan. |
| "Infra locked" | Infrastructure is permanently locked after first poll — this is by design. |
| Connection refused | Ensure `npx hardhat node` is running for localhost. Check RPC URL for testnets. |

### Getting Help

1. Check [Hardhat Documentation](https://hardhat.org/docs)
2. Search [GitHub Issues](https://github.com/soralank/votingsystem/issues)
3. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
4. Review [docs/ERROR_CODES.md](./docs/ERROR_CODES.md) for error messages

---

**Version**: 4.0.0
**Networks**: Local (Hardhat) | Sepolia | Mainnet
**Contracts Deployed**: 4 (ElectionsManager, TokenManager, VotingPaymaster, SecretBallotManager)
