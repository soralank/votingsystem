# Voting System - Production-Grade Blockchain Polling Platform

A secure, decentralized voting system with **token-based gasless voting**, built on Ethereum using Solidity smart contracts. Features include traditional gas-paying votes, token-sponsored votes, and fully gasless meta-transactions with comprehensive event tracking.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20+-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-3.1.3+-yellow.svg)](https://hardhat.org/)
[![Tests](https://img.shields.io/badge/Tests-188%20passing-brightgreen.svg)](./test)
[![License](https://img.shields.io/badge/License-ANKIT.SORAL-red.svg)](./LICENSE)

---

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Smart Contracts](#smart-contracts)
- [Quick Start](#quick-start)
- [Deployment Options](#deployment-options)
- [Testing](#testing)
- [Documentation](#documentation)
- [Security](#security)
- [Contributing](#contributing)

---

## ✨ Features

### 🗳️ Core Voting Features
- **Multiple Voting Methods**: Gas payment, token-based, and gasless voting
- **Poll Management**: Time-bound polls with scheduled start/end times
- **Voter Authorization**: Granular per-poll voter control
- **Secret Ballot**: Vote privacy until admin reveals results
- **Result Management**: Admin-controlled revelation with time buffers

### 🪙 Token-Based Voting
- **Per-Poll Tokens**: Each poll has isolated ERC20-compatible tokens
- **Admin Allocation**: Poll admins distribute tokens to voters
- **Token Burning**: One-time use tokens consumed when voting
- **Non-Transferable**: Tokens cannot be traded (soulbound)
- **Flexible Modes**: Optional or required token voting per poll

### ⛽ Gasless Voting (Meta-Transactions)
- **Zero Gas for Voters**: Admin pre-funds paymaster to sponsor gas
- **EIP-712 Signatures**: Voters sign off-chain, relayer submits
- **Replay Protection**: Nonce-based signature validation
- **Deadline Enforcement**: Time-limited signatures
- **Relayer Management**: Optional whitelist for trusted relayers

### 🔄 Upgradeable Contracts (UUPS)
- **Data Preservation**: Upgrade without losing polls/votes
- **Bug Fixes**: Patch issues in production
- **Feature Addition**: Add functionality post-deployment
- **Same Address Forever**: Users interact with unchanging proxy
- **V2 Features**: Pause polls, weighted votes, categories

### 📊 Production-Grade Events
- **Indexed Parameters**: Efficient blockchain-level filtering
- **Complete Data**: All context included (no extra calls needed)
- **Vote Method Tracking**: Distinguish gas vs token votes
- **Frontend-Ready**: Analytics dashboards can query efficiently
- **Audit Trail**: Complete compliance-ready event history

### 🔒 Security Features
- **DoS Prevention**: Limits on options (100) and batch operations (50)
- **Time Validation**: Minimum poll duration (5min), future start limit (30 days)
- **Duplicate Prevention**: Unique poll titles and option names
- **Access Control**: Owner, Admin, and Voter roles with strict permissions
- **Two-Step Ownership**: Safe ownership transfer with acceptance
- **Comprehensive Error Handling**: 56+ documented error codes

---

## 🏗️ Architecture

### Contract Structure

```
┌──────────────────────────────────────────────────────────┐
│                    Voting System v2.0                     │
└──────────────────────────────────────────────────────────┘

                    Ownable.sol
                  (Ownership Base)
                        │
                        ├─────────────────┐
                        │                 │
                 TimeValidator.sol        │
                 (Time Checks)            │
                        │                 │
                        ▼                 │
            TokenIntegratedVoting.sol     │
            (Token Integration Layer)     │
                        │                 │
         ┌──────────────┴────────┐       │
         │                       │       │
         ▼                       ▼       ▼
  ElectionsManager.sol    TokenManager.sol    VotingPaymaster.sol
  (Main Contract)         (Token Factory)     (Gas Sponsor)
         │
         │ creates
         ▼
   VotingToken.sol
   (Per-Poll Token)
```

### Upgradeable Structure (Optional)

```
┌─────────────────────┐
│   ERC1967Proxy      │  ← Permanent Address (Users interact here)
│   (Storage Only)    │
└─────────┬───────────┘
          │ delegatecall
          ▼
┌─────────────────────┐
│ ElectionsManager    │  ← Can be swapped (V1 → V2 → V3...)
│ Upgradeable V1/V2   │
└─────────────────────┘
```

---

## 📜 Smart Contracts

### Core Contracts

#### 1. **ElectionsManager.sol** (Main Contract)
The primary voting contract with all features.

**Key Functions:**
- `createPoll(title, admin, startTime, duration, tokenEnabled, tokenRequired)` - Create poll
- `addOptionToPoll(pollId, optionName)` - Add voting option
- `addVotersWithTokens(pollId, voters[], tokensPerVoter)` - Authorize + allocate tokens
- `voteInPoll(pollId, optionId)` - Traditional vote (pays gas)
- `voteInPollWithToken(pollId, optionId, voter)` - Token vote
- `revealResults(pollId)` - Reveal poll results
- `endPoll(pollId)` - End poll manually

#### 2. **TokenManager.sol** (Token Factory)
Creates and manages per-poll voting tokens.

**Key Functions:**
- `createPollToken(pollId, name, symbol)` - Create token for poll
- `allocateTokens(pollId, voter, amount)` - Allocate tokens to voter
- `batchAllocateTokens(pollId, voters[], amounts[])` - Batch allocation
- `burnTokensForVote(pollId, voter)` - Burn token when voting
- `getTokenBalance(pollId, voter)` - Check voter's token balance

#### 3. **VotingPaymaster.sol** (Gas Sponsor)
Pays gas fees for voters via meta-transactions.

**Key Functions:**
- `fund()` - Admin funds paymaster with ETH
- `withdraw(amount)` - Admin withdraws unused funds
- `executeVoteWithToken(pollId, optionId, voter, deadline, v, r, s)` - Execute gasless vote
- `verifySignature(...)` - Verify EIP-712 signature
- `addRelayer(address)` / `removeRelayer(address)` - Manage relayers

#### 4. **VotingToken.sol** (Per-Poll Token)
ERC20-compatible non-transferable token for specific poll.

**Key Features:**
- Minted by TokenManager
- Burnable (destroyed on vote)
- Non-transferable (cannot trade)
- Approve/allowance for paymaster

#### 5. **TokenIntegratedVoting.sol** (integration Layer)
Base contract connecting token system to voting logic.

#### 6. **TimeValidator.sol** (Time Validation)
Enforces time-based rules for poll creation and voting.

### Upgradeable Contracts (Optional)

#### **ElectionsManagerUpgradeable V1**
UUPS upgradeable version with all core features.

#### **ElectionsManagerUpgradeableV2**
Adds:
- Poll categories
- Vote weight multipliers (VIP voting)
- Pause/unpause polls
- Enhanced statistics (participation rate, vote diversity)
- Category-based queries

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- npm or yarn
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/soralank/votingsystem.git
cd votingsystem

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

### Local Testing

```bash
# Terminal 1: Start local blockchain
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost

# Run tests
npx hardhat test
```

---

## 🎯 Deployment Options

### Option 1: Standard (Non-Upgradeable)
**Best for**: Local testing, rapid development

```bash
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network <network>
```

**Deploys:**
- ElectionsManager
- TokenManager
- VotingPaymaster (pre-funded with 1 ETH)

### Option 2: Upgradeable (UUPS Proxy)
**Best for**: Production, mainnet deployment

```bash
# Initial deployment (V1)
npx hardhat ignition deploy ignition/modules/UpgradeableVoting.ts --network <network>

# Later: Upgrade to V2
npx hardhat ignition deploy ignition/modules/UpgradeToV2.ts \
  --parameters ignition/parameters/upgrade-v2.json \
  --network <network>
```

**Deploys:**
- ERC1967Proxy (your permanent address)
- ElectionsManagerUpgradeable V1 (implementation)
- TokenManager
- VotingPaymaster

**Save the proxy address** - this is your main contract address!

---

## 🧪 Testing

### Run All Tests

```bash
# All tests (188 passing)
npx hardhat test

# Specific test suites
npx hardhat test test/voting.test.ts                    # Core voting (46 tests)
npx hardhat test test/tokenManager.test.ts              # Token management (38 tests)
npx hardhat test test/votingPaymaster.test.ts           # Paymaster (28 tests)
npx hardhat test test/electionsManager.token.test.ts    # Token integration (13 tests)
npx hardhat test test/gaslessVoting.e2e.test.ts         # Gasless E2E (7 tests)
npx hardhat test test/upgradeable.test.ts               # Upgradeable (29 tests)
npx hardhat test test/errorCodes.verification.test.ts   # Error codes (32 tests)
npx hardhat test test/events.production.test.ts         # Event verification (14 tests)

# With gas reporting
REPORT_GAS=true npx hardhat test

# With coverage
npx hardhat coverage
```

### Test Coverage

**134/134 core tests passing** ✅
- Traditional voting: ✅
- Token voting: ✅
- Gasless voting (meta-transactions): ✅
- Upgradeable contracts (V1 → V2): ✅
- Event verification: ✅
- Error code validation: ✅
- Security features: ✅
- Edge cases: ✅

---

## 📚 Documentation

### Comprehensive Guides

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system architecture
- **[ERROR_CODES.md](./docs/ERROR_CODES.md)** - 56+ documented error codes
- **[EVENT_AUDIT.md](./docs/EVENT_AUDIT.md)** - Production-grade events guide
- **[UPGRADEABLE_MODULE.md](./docs/UPGRADEABLE_MODULE.md)** - Upgrade system guide
- **[TEST_RESULTS.md](./docs/TEST_RESULTS.md)** - Complete test breakdown
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines

### Quick References

#### Create Poll with Token Voting

```javascript
const tx = await electionsManager.createPoll(
  "Board Elections 2024",           // title
  adminAddress,                      // admin
  startTimestamp,                    // startTime (UTC)
  3600,                              // duration (1 hour)
  true,                              // enableTokenVoting
  false                              // tokenVotingRequired (optional)
);
```

#### Add Options and Voters with Tokens

```javascript
// Add voting options
await electionsManager.connect(admin).addOptionToPoll(1, "Alice");
await electionsManager.connect(admin).addOptionToPoll(1, "Bob");

// Authorize voters and allocate tokens in one transaction
await electionsManager.connect(admin).addVotersWithTokens(
  1,                                 // pollId
  [voter1, voter2, voter3],          // voters
  5                                  // tokens per voter
);
```

#### Vote Methods

```javascript
// Method 1: Traditional (voter pays gas)
await electionsManager.connect(voter).voteInPoll(1, 2);

// Method 2: Token-based (voter pays gas, token burned)
await electionsManager.connect(voter).voteInPollWithToken(1, 2, voter.address);

// Method 3: Gasless (admin pays via paymaster)
// Voter signs off-chain
const domain = {
  name: "VotingPaymaster",
  version: "1",
  chainId: await ethers.provider.getNetwork().then(n => n.chainId),
  verifyingContract: paymasterAddress
};

const types = {
  VoteWithToken: [
    { name: "pollId", type: "uint256" },
    { name: "optionId", type: "uint256" },
    { name: "voter", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

const value = {
  pollId: 1,
  optionId: 2,
  voter: voterAddress,
  nonce: await paymaster.nonces(voterAddress),
  deadline: Math.floor(Date.now() / 1000) + 3600
};

const signature = await voter._signTypedData(domain, types, value);
const { v, r, s } = ethers.utils.splitSignature(signature);

// Relayer submits (voter pays nothing!)
await paymaster.executeVoteWithToken(1, 2, voterAddress, deadline, v, r, s);
```

---

## 🔒 Security

### Audit Status
- **Self-Audited**: ✅
- **Professional Audit**: Pending
- **Bug Bounty**: Not yet active

### Security Features
- ✅ Reentrancy protection (CEI pattern)
- ✅ Integer overflow protection (Solidity 0.8+)
- ✅ Access control (Owner/Admin/Voter roles)
- ✅ Input validation on all functions
- ✅ DoS attack prevention (batch limits)
- ✅ Front-running mitigation (hidden votes)
- ✅ Replay attack prevention (nonces)
- ✅ Comprehensive error messages

### Known Limitations
- Poll admin has full control over their poll (by design)
- Results can be revealed early by admin (intentional)
- No vote modification after casting (permanent choice)

### Report Security Issues
Please report vulnerabilities to: [security@example.com]

---

## 🗺️ Roadmap

### ✅ Completed (v2.0)
- [x] Core voting system
- [x] Token-based voting
- [x] Gasless voting (meta-transactions)
- [x] Upgradeable contracts (UUPS)
- [x] Production-grade events
- [x] Comprehensive error codes
- [x] 188 passing tests

### 🚧 In Progress
- [ ] Frontend dApp (React + ethers.js)
- [ ] Subgraph for event indexing
- [ ] Professional security audit

### 📋 Planned
- [ ] Multi-choice voting
- [ ] Quadratic voting
- [ ] Vote delegation
- [ ] Anonymous voting (zk-SNARKs)
- [ ] IPFS integration for poll metadata
- [ ] DAO governance integration

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Quick Contribution Guide

1. Fork the repository
2. Create feature branch: `git checkout -b feature/AmazingFeature`
3. Make changes and add tests
4. Run test suite: `npx hardhat test`
5. Commit: `git commit -m 'Add AmazingFeature'`
6. Push: `git push origin feature/AmazingFeature`
7. Open Pull Request

### Code Standards
- Solidity 0.8.20+
- NatSpec comments for all public functions
- Comprehensive tests (>95% coverage)
- Gas-optimized code
- Security-first mindset

---

## 📊 Statistics

- **Total Contracts**: 6 core + 2 upgradeable
- **Total Tests**: 188 passing
- **Test Coverage**: 95%+
- **Lines of Code**: ~3,500
- **Gas Optimization**: Enabled (200 runs)
- **Event Emissions**: Production-grade with indexing

---

## 📝 License

This project is licensed under the **ANKIT.SORAL** license. See [LICENSE](./LICENSE) for details.

---

## 📞 Support & Community

- **GitHub Issues**: https://github.com/soralank/votingsystem/issues
- **Discussions**: Use GitHub Discussions for Q&A
- **Twitter**: [@soralank]
- **Discord**: [Join our community]

---

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk. Always conduct thorough testing and security audits before deploying to production.

---

## 🙏 Acknowledgments

Built with:
- [Hardhat](https://hardhat.org/) - Ethereum development environment
- [OpenZeppelin](https://openzeppelin.com/) - Secure smart contract library
- [ethers.js](https://docs.ethers.org/) - Ethereum library
- [Solidity](https://soliditylang.org/) - Smart contract language

---

**Version**: 2.0.0
**Last Updated**: 2026-02-12
**Status**: Production-Ready ✅

**Built with ❤️ using Solidity, Hardhat, and Ethereum**
