# Voting System - Blockchain-Based Polling Platform

A secure, decentralized voting system built with Solidity smart contracts on Ethereum. This system enables transparent poll creation, voting, and result management with robust access controls and security features.

---

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Smart Contracts](#smart-contracts)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Features](#security-features)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## ✨ Features

### Core Functionality
- **Poll Creation**: Create time-bound polls with custom voting options
- **Voter Authorization**: Control who can vote in each poll
- **Secret Ballot**: Vote privacy until results are revealed
- **Result Management**: Admin-controlled result revelation
- **Ownership Management**: Two-step ownership transfer for security

### Security Features
- **DoS Attack Prevention**: Limits on options and batch operations
- **Timestamp Manipulation Mitigation**: Time buffers for poll deadlines
- **Duplicate Prevention**: No duplicate poll titles or option names
- **Access Controls**: Role-based permissions (Owner, Admin, Voter)
- **Vote Privacy**: Hidden vote counts and choices until reveal

---

## 🏗️ Architecture

The system consists of three main smart contracts:

1. **Ownable.sol**: Base contract for ownership management
2. **ElectionsManager.sol**: Core voting logic and poll management
3. **Voting.sol**: Main contract that inherits from ElectionsManager

### Contract Hierarchy
```
Ownable (standalone)
    ↓
ElectionsManager (standalone)
    ↓
Voting (inherits ElectionsManager)
```

---

## 📜 Smart Contracts

### Ownable.sol
Provides ownership management with a secure two-step transfer process.

**Key Functions:**
- `transferOwnership(address)` - Initiate ownership transfer
- `acceptOwnership()` - New owner accepts ownership
- `cancelOwnershipTransfer()` - Cancel pending transfer
- `renounceOwnership()` - Remove ownership (irreversible)

### ElectionsManager.sol
Core contract handling all voting functionality.

**Key Functions:**

#### Poll Management
- `createPoll(string title, address admin, uint duration)` - Create new poll
- `addOptionToPoll(uint pollId, string name)` - Add voting option
- `endPoll(uint pollId)` - End poll before deadline
- `revealPoll(uint pollId)` - Reveal poll results

#### Voter Management
- `addAuthorizedVoter(uint pollId, address voter)` - Authorize single voter
- `addAuthorizedVoters(uint pollId, address[] voters)` - Batch authorize
- `removeAuthorizedVoter(uint pollId, address voter)` - Remove authorization

#### Voting
- `voteInPoll(uint pollId, uint optionId)` - Cast a vote

#### Query Functions
- `getPollsCount()` - Get total number of polls
- `getOptionsCount(uint pollId)` - Get options in poll
- `getOption(uint pollId, uint optionId)` - Get option details
- `getTotalVotes(uint pollId)` - Get total votes cast
- `getVoterChoice(uint pollId, address voter)` - Get voter's choice (admin only before reveal)
- `getPollEndTime(uint pollId)` - Get poll deadline

### Voting.sol
Main deployment contract that inherits all ElectionsManager functionality.

---

## 📚 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Hardhat
- MetaMask or similar Web3 wallet (for deployment)

---

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/soralank/votingsystem.git
   cd votingsystem
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile contracts**
   ```bash
   npx hardhat compile
   ```

---

## 💻 Usage

### Local Development

1. **Start Hardhat Network**
   ```bash
   npx hardhat node
   ```

2. **Deploy Contracts**
   ```bash
   npx hardhat ignition deploy ignition/modules/Voting.ts --network localhost
   ```

3. **Interact via Console**
   ```bash
   npx hardhat console --network localhost
   ```

### Example Interactions

```javascript
// Get contract instance
const Voting = await ethers.getContractFactory("Voting");
const voting = await Voting.attach("YOUR_CONTRACT_ADDRESS");

// Create a poll (owner only)
await voting.createPoll("Favorite Color?", "0xAdminAddress", 3600);

// Add options (admin only)
await voting.addOptionToPoll(1, "Red");
await voting.addOptionToPoll(1, "Blue");
await voting.addOptionToPoll(1, "Green");

// Authorize voters (admin only)
await voting.addAuthorizedVoter(1, "0xVoterAddress");

// Vote (authorized voter)
await voting.voteInPoll(1, 2); // Vote for option 2

// Reveal results (admin only)
await voting.revealPoll(1);

// Get results
const option = await voting.getOption(1, 2);
console.log(`Option: ${option.name}, Votes: ${option.votes}`);
```

---

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/voting.test.ts

# Run with coverage
npx hardhat coverage

# Run with gas reporting
REPORT_GAS=true npx hardhat test
```

### Test Coverage

The test suite covers:
- ✅ Poll creation and management
- ✅ Option addition and validation
- ✅ Voter authorization (single and batch)
- ✅ Voting process and validation
- ✅ Result revelation and privacy
- ✅ Access control and permissions
- ✅ Security limits (MAX_OPTIONS, MAX_VOTERS_BATCH)
- ✅ Timestamp manipulation prevention
- ✅ Duplicate prevention
- ✅ Ownership transfer (two-step process)
- ✅ Edge cases and error conditions

---

## 🌐 Deployment

### Local Network

```bash
# Terminal 1: Start node
npx hardhat node

# Terminal 2: Deploy
npx hardhat ignition deploy ignition/modules/Voting.ts --network localhost
```

### Testnet (Sepolia)

1. **Set up environment variables**
   Create `.env` file:
   ```env
   SEPOLIA_RPC_URL=your_rpc_url
   SEPOLIA_PRIVATE_KEY=your_private_key
   ```

2. **Deploy to Sepolia**
   ```bash
   npx hardhat ignition deploy ignition/modules/Voting.ts --network sepolia
   ```

### Mainnet

⚠️ **WARNING**: Deploying to mainnet costs real ETH. Ensure thorough testing first.

```bash
npx hardhat ignition deploy ignition/modules/Voting.ts --network mainnet
```

---

## 🔒 Security Features

### 1. **DoS Attack Prevention**
- Maximum 100 options per poll (`MAX_OPTIONS`)
- Maximum 50 voters per batch operation (`MAX_VOTERS_BATCH`)

### 2. **Timestamp Manipulation Mitigation**
- Minimum poll duration: 5 minutes (`MIN_POLL_DURATION`)
- 30-second time buffer for deadline checks (`TIME_BUFFER`)

### 3. **Vote Privacy**
- Vote counts hidden until admin reveals results
- Voter choices hidden from non-admin users
- Private mappings for sensitive data

### 4. **Access Control**
- Owner: Can create polls, transfer ownership
- Admin: Can manage specific poll, add options, authorize voters
- Voter: Can only vote in authorized polls

### 5. **Duplicate Prevention**
- No duplicate poll titles
- No duplicate option names within a poll

### 6. **Two-Step Ownership Transfer**
- Prevents accidental ownership loss
- New owner must explicitly accept

---

## 📁 Project Structure

```
votingsystem/
├── contracts/
│   ├── ElectionsManager.sol    # Core voting logic
│   ├── Ownable.sol              # Ownership management
│   └── Voting.sol               # Main contract
├── ignition/
│   └── modules/
│       └── Voting.ts            # Deployment script
├── scripts/
│   ├── check-contract-state.js # State verification
│   ├── check-polls.js           # Poll inspection
│   ├── deploy-elections.js     # Deployment helper
│   ├── test-create-poll.js     # Poll creation test
│   ├── test-getPollsCount.js   # Count verification
│   └── verify.ts                # Contract verification
├── test/
│   └── voting.test.ts           # Comprehensive tests
├── hardhat.config.ts            # Hardhat configuration
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
└── README.md                    # This file
```

---

## 🛠️ Development Tools

### Useful Scripts

```bash
# Compile contracts
npm run compile

# Run tests
npm run test

# Deploy to localhost
npm run deploy:local

# Verify contract on Etherscan
npm run verify

# Clean build artifacts
npm run clean
```

### Debugging

```bash
# Check contract state
npx hardhat run scripts/check-contract-state.js --network localhost

# View polls
npx hardhat run scripts/check-polls.js --network localhost

# Test poll creation
npx hardhat run scripts/test-create-poll.js --network localhost
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Standards
- Follow Solidity style guide
- Write comprehensive tests for new features
- Document all public functions with NatSpec comments
- Run `npx hardhat test` before submitting PR

---

## 📝 License

This project is licensed under the **ANKIT.SORAL** license.

---

## 📞 Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Contact: [Your contact information]

---

## 🎯 Roadmap

Future enhancements planned:
- [ ] Multi-choice voting support
- [ ] Weighted voting options
- [ ] Vote delegation
- [ ] Anonymous voting with zk-SNARKs
- [ ] IPFS integration for poll metadata
- [ ] Gasless voting via meta-transactions
- [ ] On-chain voting analytics

---

## ⚠️ Disclaimer

This software is provided "as is" without warranty. Use at your own risk. Always conduct thorough security audits before deploying to production.

---

**Built with ❤️ using Solidity, Hardhat, and Ethereum**