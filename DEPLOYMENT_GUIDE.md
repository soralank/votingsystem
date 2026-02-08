# 🚀 Deployment Guide - Blockchain Voting System

Complete guide for deploying the Solidity smart contracts to various Ethereum networks using Hardhat.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development Deployment](#local-development-deployment)
- [Testnet Deployment](#testnet-deployment)
- [Mainnet Deployment](#mainnet-deployment)
- [Post-Deployment](#post-deployment)
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

### Required Knowledge

- Basic understanding of Ethereum and smart contracts
- Familiarity with command-line interface
- Understanding of gas costs and transaction fees

### Funded Wallet

You'll need a wallet with:
- **Testnet**: Free testnet ETH from faucets
- **Mainnet**: Real ETH for deployment (~0.05-0.1 ETH recommended)

## 🔧 Environment Setup

### Step 1: Clone and Install

```bash
# Clone repository
git clone https://github.com/soralank/votingsystem.git
cd votingsystem

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

Expected output:
```
Compiled 3 Solidity files successfully (evm target: london).
```

### Step 2: Create Environment File

Create `.env` file in the root directory:

```env
# Network RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_API_KEY
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_API_KEY

# Private Keys (NEVER commit these!)
SEPOLIA_PRIVATE_KEY=your_sepolia_private_key_here
MAINNET_PRIVATE_KEY=your_mainnet_private_key_here

# Etherscan API Key (for contract verification)
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Optional: Gas settings
GAS_PRICE_GWEI=50
GAS_LIMIT=5000000
```

⚠️ **Security Warning**: Add `.env` to `.gitignore` to prevent committing sensitive data!

### Step 3: Get API Keys

#### Infura/Alchemy RPC Access

**Option A: Infura** (Recommended)

1. Visit [infura.io](https://infura.io/)
2. Sign up for free account
3. Create new project
4. Copy your Project ID
5. RPC URL format: `https://sepolia.infura.io/v3/YOUR_PROJECT_ID`

**Option B: Alchemy**

1. Visit [alchemy.com](https://www.alchemy.com/)
2. Create free account
3. Create new app
4. Copy HTTPS URL

#### Etherscan API Key

1. Visit [etherscan.io](https://etherscan.io/)
2. Sign up for free account
3. Go to API Keys section
4. Create new API key
5. Copy key to `.env`

### Step 4: Get Test ETH

For Sepolia testnet:

1. **Sepolia Faucet**: [sepoliafaucet.com](https://sepoliafaucet.com/)
2. **Alchemy Faucet**: [sepoliafaucet.com](https://www.alchemy.com/faucets/ethereum-sepolia)
3. **Infura Faucet**: [infura.io/faucet](https://www.infura.io/faucet/sepolia)

Request 0.5 - 1 ETH (should be sufficient for multiple deployments and testing).

## 🏠 Local Development Deployment

Perfect for development and testing without spending real ETH.

### Step 1: Start Local Hardhat Network

Open terminal and run:

```bash
npx hardhat node
```

Expected output:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts
========
WARNING: These accounts, and their private keys, are publicly known...

Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
...
```

Keep this terminal running.

### Step 2: Deploy Contracts

In a **new terminal**:

```bash
npx hardhat ignition deploy ignition/modules/Voting.ts --network localhost
```

Expected output:
```
Hardhat Ignition 🚀

Deploying [ VotingModule ]

Batch #1
  Executed VotingModule#ElectionsManager

[ VotingModule ] successfully deployed 🚀

Deployed Addresses

VotingModule#ElectionsManager - 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### Step 3: Verify Deployment

Create `scripts/verify-local.js`:

```javascript
const hre = require("hardhat");

async function main() {
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Your deployed address
  
  console.log("Verifying contract at:", contractAddress);
  
  const ElectionsManager = await hre.ethers.getContractFactory("ElectionsManager");
  const contract = ElectionsManager.attach(contractAddress);
  
  // Test contract
  const owner = await contract.owner();
  const pollsCount = await contract.pollsCount();
  
  console.log("✅ Contract verified!");
  console.log("   Owner:", owner);
  console.log("   Polls Count:", pollsCount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Run verification:

```bash
npx hardhat run scripts/verify-local.js --network localhost
```

### Step 4: Interact with Contract

Use Hardhat console:

```bash
npx hardhat console --network localhost
```

```javascript
// Get contract
const ElectionsManager = await ethers.getContractFactory("ElectionsManager");
const contract = await ElectionsManager.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");

// Create a poll
const [owner, admin] = await ethers.getSigners();
const tx = await contract.createPoll("Test Election", admin.address, 3600);
await tx.wait();

// Check polls
const count = await contract.pollsCount();
console.log("Total polls:", count.toString());
```

## 🌐 Testnet Deployment (Sepolia)

Deploy to Ethereum Sepolia testnet for public testing.

### Step 1: Verify Configuration

Check `hardhat.config.ts` has Sepolia network:

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

Ensure your wallet has sufficient Sepolia ETH:

```bash
npx hardhat run scripts/check-balance.js --network sepolia
```

Create `scripts/check-balance.js`:

```javascript
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  
  console.log("Deployer address:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  
  if (balance < hre.ethers.parseEther("0.1")) {
    console.log("⚠️  Low balance! Get more ETH from faucet.");
  } else {
    console.log("✅ Sufficient balance for deployment");
  }
}

main().catch(console.error);
```

### Step 3: Deploy to Sepolia

```bash
npx hardhat ignition deploy ignition/modules/Voting.ts --network sepolia
```

This will:
- Deploy ElectionsManager contract
- Wait for confirmations
- Output deployed address

Expected output:
```
Hardhat Ignition 🚀

Deploying [ VotingModule ]

Batch #1
  Executed VotingModule#ElectionsManager

[ VotingModule ] successfully deployed 🚀

Deployed Addresses

VotingModule#ElectionsManager - 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

### Step 4: Verify on Etherscan

```bash
npx hardhat verify --network sepolia 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

Expected output:
```
Successfully submitted source code for contract
contracts/ElectionsManager.sol:ElectionsManager at 0x742d35...
for verification on the block explorer. Waiting for verification result...

Successfully verified contract ElectionsManager on Etherscan.
https://sepolia.etherscan.io/address/0x742d35...#code
```

### Step 5: Test on Sepolia

```javascript
npx hardhat console --network sepolia

const ElectionsManager = await ethers.getContractFactory("ElectionsManager");
const contract = await ElectionsManager.attach("YOUR_DEPLOYED_ADDRESS");

// Test basic function
const owner = await contract.owner();
console.log("Owner:", owner);
```

## 🔴 Mainnet Deployment

⚠️ **DANGER ZONE**: Real money involved! Read carefully.

### Pre-Deployment Checklist

Before deploying to mainnet, ensure:

- [ ] **Security Audit**: Contract has been audited by professionals
- [ ] **Extensive Testing**: Tested on local network and multiple testnets
- [ ] **Gas Analysis**: Gas costs analyzed and optimized
- [ ] **Emergency Plan**: Pause/upgrade mechanism tested
- [ ] **Documentation**: Complete documentation available
- [ ] **Backup Keys**: Private keys backed up securely (hardware wallet recommended)
- [ ] **Sufficient ETH**: At least 0.1 ETH for deployment + testing
- [ ] **Legal Review**: Terms and compliance reviewed

### Estimated Mainnet Costs

At 50 gwei gas price and $2,000 ETH:

| Operation | Gas | Cost (USD) |
|-----------|-----|------------|
| Deploy Contract | ~2,500,000 | ~$250 |
| Create Poll | ~200,000 | ~$20 |
| Add 10 Voters | ~200,000 | ~$20 |
| Cast Vote | ~80,000 | ~$8 |

**Total Initial Deployment**: ~$250-300

Check current gas prices: [etherscan.io/gastracker](https://etherscan.io/gastracker)

### Step 1: Final Testing

```bash
# Run full test suite
npx hardhat test

# Gas report
REPORT_GAS=true npx hardhat test

# Coverage
npx hardhat coverage
```

All tests must pass with 100% success rate.

### Step 2: Configure Mainnet

Ensure `hardhat.config.ts` has mainnet configuration:

```typescript
networks: {
  mainnet: {
    type: "http",
    chainType: "l1",
    url: configVariable("MAINNET_RPC_URL"),
    accounts: [configVariable("MAINNET_PRIVATE_KEY")],
    gasPrice: 50000000000, // 50 gwei
  },
}
```

### Step 3: Dry Run

Estimate deployment cost without actually deploying:

```bash
npx hardhat run scripts/estimate-deployment.js --network mainnet
```

Create `scripts/estimate-deployment.js`:

```javascript
const hre = require("hardhat");

async function main() {
  console.log("🔍 Estimating mainnet deployment cost...
");
  
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH
");
  
  // Get gas price
  const gasPrice = await hre.ethers.provider.getFeeData();
  console.log("Current gas price:", hre.ethers.formatUnits(gasPrice.gasPrice, "gwei"), "gwei");
  
  // Estimate deployment
  const ElectionsManager = await hre.ethers.getContractFactory("ElectionsManager");
  const deployTx = await ElectionsManager.getDeployTransaction();
  const estimatedGas = await hre.ethers.provider.estimateGas(deployTx);
  
  const estimatedCost = estimatedGas * gasPrice.gasPrice;
  
  console.log("\n📊 Deployment Estimates:");
  console.log("   Gas:", estimatedGas.toString());
  console.log("   Cost:", hre.ethers.formatEther(estimatedCost), "ETH");
  console.log("   USD (at $2000/ETH):", "$" + (parseFloat(hre.ethers.formatEther(estimatedCost)) * 2000).toFixed(2));
  
  if (balance < estimatedCost * 2n) {
    console.log("\n⚠️  WARNING: Insufficient balance for deployment!");
  } else {
    console.log("\n✅ Sufficient balance");
  }
}

main().catch(console.error);
```

### Step 4: Deploy to Mainnet

⚠️ **FINAL WARNING**: This will spend real ETH!

```bash
npx hardhat ignition deploy ignition/modules/Voting.ts --network mainnet
```

### Step 5: Verify on Etherscan

```bash
npx hardhat verify --network mainnet YOUR_DEPLOYED_ADDRESS
```

### Step 6: Initial Configuration

After deployment, immediately:

1. **Test Basic Functions**
   ```javascript
   const contract = await ethers.getContractAt("ElectionsManager", "ADDRESS");
   const owner = await contract.owner();
   console.log("Verified owner:", owner);
   ```

2. **Transfer Ownership** (if needed)
   ```javascript
   await contract.transferOwnership("MULTISIG_ADDRESS");
   ```

3. **Announce Deployment**
   - Post contract address
   - Share verified Etherscan link
   - Update documentation

## 📋 Post-Deployment

### Deployment Checklist

After successful deployment:

- [ ] Contract verified on Etherscan
- [ ] Owner address confirmed
- [ ] Test transaction successful
- [ ] Documentation updated with address
- [ ] Deployment announced
- [ ] Monitoring setup
- [ ] Backup plan tested

### Update Documentation

Update relevant files with deployed address:

**README.md**:
```markdown
## Deployed Contracts

### Mainnet
- ElectionsManager: `0x...` ([Etherscan](https://etherscan.io/address/0x...))

### Sepolia
- ElectionsManager: `0x...` ([Etherscan](https://sepolia.etherscan.io/address/0x...))
```

### Monitoring

Set up monitoring for:

- Contract events
- Transaction activity
- Gas usage
- Error logs

Tools:
- [Etherscan](https://etherscan.io/)
- [Tenderly](https://tenderly.co/)
- [Dune Analytics](https://dune.com/)

## 🔧 Troubleshooting

### Common Issues

#### Issue: "Insufficient funds for gas"

**Solution**:
```bash
# Check balance
npx hardhat run scripts/check-balance.js --network sepolia

# Get testnet ETH from faucet
# For mainnet, send more ETH to deployer address
```

#### Issue: "Nonce too high"

**Solution**:
```bash
# Reset Hardhat network
npx hardhat clean

# Or specify nonce manually in deployment script
```

#### Issue: "Transaction underpriced"

**Solution**:
```javascript
// In hardhat.config.ts, increase gas price
networks: {
  sepolia: {
    gasPrice: 100000000000, // 100 gwei
  }
}
```

#### Issue: "Contract size exceeds limit"

**Solution**:
```javascript
// In hardhat.config.ts
solidity: {
  settings: {
    optimizer: {
      enabled: true,
      runs: 200, // Reduce runs for smaller size
    },
  },
}
```

#### Issue: "Verification failed"

**Solution**:
```bash
# Ensure constructor args match
npx hardhat verify --network sepolia CONTRACT_ADDRESS

# If still failing, manually verify on Etherscan
```

### Getting Help

If you encounter issues:

1. Check [Hardhat Documentation](https://hardhat.org/docs)
2. Search existing [GitHub Issues](https://github.com/soralank/votingsystem/issues)
3. Ask in discussions
4. Contact maintainers

## 📚 Additional Resources

### Documentation

- [Hardhat Deployment Guide](https://hardhat.org/hardhat-runner/docs/guides/deploying)
- [Etherscan Verification](https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify)
- [Infura Documentation](https://docs.infura.io/)

### Tools

- [Remix IDE](https://remix.ethereum.org/) - Online Solidity IDE
- [Hardhat Network](https://hardhat.org/hardhat-network/) - Local development
- [Ganache](https://trufflesuite.com/ganache/) - Alternative local blockchain

### Security

- [Smart Contract Security Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [Slither](https://github.com/crytic/slither) - Static analysis tool
- [MythX](https://mythx.io/) - Security analysis platform

## ✅ Deployment Complete!

Congratulations! Your voting system is now deployed.

**Next Steps**:
1. Create your first poll
2. Test voting functionality
3. Monitor contract activity
4. Build frontend integration

---

**Need Help?** Open an issue or reach out to the maintainers.

**Happy Deploying! 🚀**