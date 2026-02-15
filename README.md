# Voting System - Trustless Blockchain Polling Platform

A secure, trustless, decentralized voting system with **secret ballot (commit-reveal)**, **infrastructure lock**, **democratic reveal**, **token-based gasless voting**, **multi-choice & quadratic voting**, and **vote delegation**, built on Ethereum using Solidity smart contracts.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28+-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-3.1.3+-yellow.svg)](https://hardhat.org/)
[![Tests](https://img.shields.io/badge/Tests-396%20passing-brightgreen.svg)](./test)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-blue.svg)](./.github/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

---

## 📋 Table of Contents

- [Features](#features)
- [Trust Architecture](#trust-architecture)
- [Architecture](#architecture)
- [Smart Contracts](#smart-contracts)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
- [Testing](#testing)
- [Documentation](#documentation)
- [Security](#security)
- [Contributing](#contributing)

---

## ✨ Features

### 🔐 Trust Features (v4.0+)
- **Infrastructure Lock**: Token manager, paymaster, secret ballot manager, and franchise manager addresses are permanently locked after the first poll is created — no admin can swap critical contracts
- **Secret Ballot (Commit-Reveal)**: Voters commit a hash during voting, then reveal after voting ends — votes are completely hidden until the reveal phase
- **Democratic Reveal**: Anyone can call `revealResults()` after the poll ends + reveal window — no admin gatekeeping of results
- **Admin Bypass Removal**: Admin/owner cannot peek at `getOption`, `getVoterChoice`, `getWinner`, `getVoterMultiChoices`, or `getQuadraticVotes` before results are revealed
- **Metadata Lock**: `setPollMetadata()` is restricted to before poll start time — no mid-election narrative changes
- **Secret Ballot Guards**: All 5 vote functions (`voteInPoll`, `voteInPollWithToken`, `voteMultiChoice`, `voteQuadratic`, `voteAsDelegate`) reject direct voting on secret ballot polls, forcing use of the commit-reveal flow

### 🗳️ Core Voting Features
- **Multiple Voting Methods**: Gas payment, token-based, and gasless voting
- **Poll Management**: Time-bound polls with scheduled start/end times
- **Voter Authorization**: Granular per-poll voter control
- **Result Management**: Democratic result revelation with time buffers

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

### 🗂️ Multi-Choice Voting
- **Configurable Choices**: Set max choices per poll (1 = single-choice default)
- **Bulk Selection**: Voters pick multiple options in a single transaction
- **Per-Poll Config**: Each poll independently configures multi-choice
- **Backward Compatible**: Existing single-choice polls unaffected

### 📐 Quadratic Voting
- **Square-Root Cost**: Vote weight grows as √(tokens spent)
- **Multi-Option Allocation**: Distribute votes across options
- **Token-Integrated**: Uses poll tokens for quadratic cost calculation
- **Fair Representation**: Prevents plutocratic dominance

### 🤝 Vote Delegation
- **Delegate to Trusted Peer**: Transfer your voting power to someone else
- **Revocable**: Remove delegation before vote is cast
- **Delegate Voting**: Delegates vote on behalf of delegators
- **Chain Prevention**: No circular delegation chains

### 🌐 IPFS Poll Metadata
- **Off-Chain Storage**: Store rich poll descriptions on IPFS
- **On-Chain Reference**: `metadataURI` stored per poll via MetadataVoting module
- **Gas Efficient**: Reduces on-chain storage costs

### 🧩 Modular Composition (v4.1)
- **4 Module Contracts**: MultiChoiceVoting, QuadraticVoting, DelegationVoting, MetadataVoting
- **Auto-Deployed**: ElectionsManager deploys all 4 modules in its constructor
- **Per-Poll Managers**: Each poll can use a custom TokenManager and VotingPaymaster
- **Size Optimized**: Feature state extracted to keep ElectionsManager under 24KB limit

### 📊 Production-Grade Events
- **Indexed Parameters**: Efficient blockchain-level filtering
- **Complete Data**: All context included (no extra calls needed)
- **Vote Method Tracking**: Distinguish gas vs token votes
- **Frontend-Ready**: Analytics dashboards can query efficiently
- **Audit Trail**: Complete compliance-ready event history

### 📡 Subgraph Indexing (The Graph)
- **Real-Time Indexing**: All contract events indexed via subgraph
- **GraphQL API**: Query polls, votes, delegations, tokens efficiently
- **Multi-Contract**: ElectionsManager + TokenManager + VotingPaymaster + SecretBallotManager
- **Analytics-Ready**: PollStats and GlobalStats aggregation entities

### 🏢 Franchise System
- **Sub-Admin Rights**: Owner grants time-limited poll creation rights to franchisees
- **Pay-Per-Poll**: First election free, ETH fee required for additional polls
- **Non-Revocable**: Franchises cannot be revoked — expire by time or poll exhaustion only
- **Transferable**: Franchisees can transfer to others (requires ETH fee + owner approval)
- **Configurable Limits**: Max 100 polls per franchise, custom fee rates, custom durations
- **Full Feature Access**: Franchise polls support all voting methods, tokens, secret ballot, etc.

---

## 🔐 Trust Architecture

The system is designed to be **trustless** — voters do not need to trust the admin or owner to conduct a fair election.

### Infrastructure Lock
Once the first poll is created, `setTokenManager()`, `setVotingPaymaster()`, `setSecretBallotManager()`, and `setFranchiseManager()` are permanently disabled. This prevents an admin from swapping in a malicious contract mid-operation.

```
Deploy → Configure contracts → Create first poll → LOCKED FOREVER
```

### Secret Ballot (Commit-Reveal)
For secret ballot polls, votes go through a two-phase process via `SecretBallotManager`:

```
Phase 1 (Commit): During voting period
  commitHash = keccak256(abi.encodePacked(pollId, optionId, salt, voterAddress))
  voter → SecretBallotManager.commitVote(pollId, commitHash)

Phase 2 (Reveal): After voting ends (configurable window, default 1 hour)
  voter → SecretBallotManager.revealVote(pollId, optionId, salt)
  SecretBallotManager → ElectionsManager.recordSecretVote() (callback)
```

### Democratic Reveal
`revealResults(pollId)` can be called by **anyone** (not just admin) after:
- Poll end time + TIME_BUFFER (30s) + reveal duration (configurable per-poll, default 1 hour)

No admin can withhold or delay results once the reveal window passes.

### Admin Bypass Removal
Before results are revealed, **nobody** (including owner/admin) can access:
- `getOption()` (vote counts hidden)
- `getVoterChoice()` (individual votes hidden)
- `getWinner()` (winner hidden)
- `getVoterMultiChoices()` (multi-choice selections hidden)
- `getQuadraticVotes()` (quadratic allocations hidden)

---

## 🏗️ Architecture

### Contract Structure

```
┌──────────────────────────────────────────────────────────┐
│                    Voting System v4.1                     │
└──────────────────────────────────────────────────────────┘

                    Ownable.sol
                  (Ownership Base)
                        │
                 TimeValidator.sol
                 (Time Checks)
                        │
            TokenIntegratedVoting.sol
            (Token + Infrastructure Lock)
                        │
         ┌──────────────┴────────────┐
         │                           │
         ▼                           │
  ElectionsManager.sol               │
  (Main Contract)                    │
         │                           │
    ┌────┴────┐                      │
    │         │                      │
    ▼         ▼                      ▼
TokenManager  VotingPaymaster  SecretBallotManager
(Token Factory) (Gas Sponsor)  (Commit-Reveal)
    │
    ▼
VotingToken.sol
(Per-Poll Token)

  Module Contracts (auto-deployed by ElectionsManager):
  MultiChoiceVoting │ QuadraticVoting │ DelegationVoting │ MetadataVoting

  FranchiseManager.sol (Standalone — calls ElectionsManager.createPoll)
```

### Upgradeable Structure (Optional)

```
┌─────────────────────┐
│   ERC1967Proxy      │  ← Permanent Address
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

### Core Contracts (12)

| Contract | Purpose |
|----------|----------|
| **ElectionsManager.sol** | Main voting contract — polls, voting, results, trust features, per-poll managers |
| **MultiChoiceVoting.sol** | Module: multi-choice vote state (maxChoices, voter selections) |
| **QuadraticVoting.sol** | Module: quadratic vote state (enabled flag, vote amounts, costs) |
| **DelegationVoting.sol** | Module: delegation state (delegation pairs, delegation counts) |
| **MetadataVoting.sol** | Module: IPFS metadata URIs per poll |
| **FranchiseManager.sol** | Sub-admin franchise system — time-limited poll creation rights |
| **SecretBallotManager.sol** | Commit-reveal voting for secret ballot polls |
| **TokenManager.sol** | Creates and manages per-poll ERC20 voting tokens |
| **VotingPaymaster.sol** | Sponsors gas fees via EIP-712 meta-transactions |
| **VotingToken.sol** | Per-poll non-transferable burnable ERC20 token |
| **TokenIntegratedVoting.sol** | Integration layer — token system + infrastructure lock |
| **TimeValidator.sol** | Time validation rules for poll creation and voting |

### Key Functions

#### ElectionsManager
- `createPoll(title, admin, startTime, duration, tokenEnabled, tokenRequired, customTokenManager, customVotingPaymaster)` — Create poll (8 params; locks infrastructure on first call)
- `addOptionToPoll(pollId, optionName)` — Add voting option
- `addVotersWithTokens(pollId, voters[], tokensPerVoter)` — Authorize + allocate tokens
- `voteInPoll(pollId, optionId)` — Traditional vote (rejects secret ballot polls)
- `voteInPollWithToken(pollId, optionId, voter)` — Token vote
- `voteMultiChoice(pollId, optionIds[])` — Multi-choice vote
- `voteQuadratic(pollId, optionIds[], amounts[])` — Quadratic vote
- `voteAsDelegate(pollId, optionId, delegator)` — Delegate vote
- `enableSecretBallot(pollId)` — Enable commit-reveal for a poll (requires SBM to be set)
- `setRevealDuration(pollId, duration)` — Set per-poll reveal duration (admin/owner, forwards to SBM)
- `setDefaultRevealDuration(duration)` — Set default reveal duration for all polls (owner, forwards to SBM)
- `revealResults(pollId)` — Reveal results (anyone, after time expires)
- `setPollMetadata(pollId, uri)` — Set IPFS metadata (before start only)

#### FranchiseManager
- `grantFranchise(franchisee, duration, maxPolls, feePerPoll, tokenManager, votingPaymaster)` — Owner grants franchise (6 params; supersedes any existing)
- `addPolls(franchiseId, additionalPolls)` — Owner adds polls to active franchise (≤100 cap)
- `createFranchisePoll(title, startTime, duration, tokenEnabled, tokenRequired)` — Franchisee creates poll (1st free)
- `requestTransfer(franchiseId, newFranchisee)` — Request franchise transfer (requires fee)
- `approveTransfer(franchiseId)` / `rejectTransfer(franchiseId)` — Owner manages transfers
- `withdrawFees()` — Owner withdraws accumulated fees

#### SecretBallotManager
- `commitVote(pollId, commitHash)` — Submit hashed vote during voting period
- `commitVoteWithToken(pollId, commitHash)` — Commit + burn token
- `revealVote(pollId, optionId, salt)` — Reveal vote during reveal window
- `getSecretBallotStatus(pollId)` — Get commit/reveal stats and phase info

#### TokenManager
- `createPollToken(pollId, name, symbol)` — Create token for poll
- `allocateTokens(pollId, voter, amount)` — Allocate tokens
- `burnTokensForVote(pollId, voter)` — Burn token when voting

#### VotingPaymaster
- `fund()` — Admin funds paymaster with ETH
- `executeVoteWithToken(pollId, optionId, voter, deadline, v, r, s)` — Execute gasless vote
- `addRelayer(address)` / `removeRelayer(address)` — Manage relayers

### Upgradeable Contracts (Optional)
- **ElectionsManagerUpgradeable V1** — UUPS upgradeable version
- **ElectionsManagerUpgradeableV2** — Adds categories, weights, pause

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- npm
- Git

### Installation

```bash
git clone https://github.com/soralank/votingsystem.git
cd votingsystem
npm install
npx hardhat compile
```

### Local Testing

```bash
# Terminal 1: Start local blockchain
npx hardhat node

# Terminal 2: Deploy all contracts
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost

# Run tests
npx hardhat test
```

---

## 🎯 Deployment

### Networks Supported

| Network | Config Key | Type |
|---------|-----------|------|
| **Local (Hardhat)** | `hardhatMainnet` / `hardhatOp` | Built-in |
| **Sepolia Testnet** | `sepolia` | Testnet |
| **Ethereum Mainnet** | `mainnet` | Production |

### Environment Variables

Create a `.env` or use Hardhat config variables:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
SEPOLIA_PRIVATE_KEY=your_private_key
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
MAINNET_PRIVATE_KEY=your_private_key
```

### Deploy Commands

```bash
# Local
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost

# Sepolia Testnet
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network sepolia

# Ethereum Mainnet
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network mainnet
```

### What Gets Deployed

The `GaslessVoting` module deploys and configures:
1. **ElectionsManager** — Main voting contract (auto-deploys 4 module contracts: MultiChoiceVoting, QuadraticVoting, DelegationVoting, MetadataVoting in its constructor)
2. **TokenManager** — Token factory (linked to ElectionsManager)
3. **VotingPaymaster** — Gas sponsor (linked + funded with 1 ETH)
4. **SecretBallotManager** — Commit-reveal manager (linked to ElectionsManager)
5. **FranchiseManager** — Franchise system (linked to ElectionsManager)

All references are wired up automatically. Once you create the first poll, infrastructure is permanently locked.

### Upgradeable Deployment (Optional)

```bash
# Initial deployment (V1)
npx hardhat ignition deploy ignition/modules/UpgradeableVoting.ts --network <network>

# Upgrade to V2
npx hardhat ignition deploy ignition/modules/UpgradeToV2.ts \
  --parameters ignition/parameters/upgrade-v2.json \
  --network <network>
```

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed step-by-step instructions.

---

## 🧪 Testing

### Run All Tests

```bash
# All tests (396 passing)
npx hardhat test

# With gas reporting
REPORT_GAS=true npx hardhat test
```

### Test Suites

| Suite | Tests | File |
|-------|-------|------|
| Core Voting | 46 | `voting.test.ts` |
| Token Manager | 38 | `tokenManager.test.ts` |
| Voting Paymaster | 28 | `votingPaymaster.test.ts` |
| Token Integration | 13 | `electionsManager.token.test.ts` |
| Gasless E2E | 7 | `gaslessVoting.e2e.test.ts` |
| Upgradeable | 29 | `upgradeable.test.ts` |
| Error Codes | 32 | `errorCodes.verification.test.ts` |
| Event Verification | 14 | `events.production.test.ts` |
| Advanced Features | 35 | `advancedFeatures.test.ts` |
| Voting Token | 29 | `votingToken.test.ts` |
| Trust Features | 42 | `trustFeatures.test.ts` |
| Franchise Manager | 83 | `franchiseManager.test.ts` |

**396 tests passing** ✅

---

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Complete system architecture with trust features
- **[SOLIDITY_CONTRACTS.md](./SOLIDITY_CONTRACTS.md)** — Detailed contract documentation
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** — Step-by-step deployment for local/Sepolia/mainnet
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Quick deployment reference and gas costs
- **[ERROR_CODES.md](./docs/ERROR_CODES.md)** — 56+ documented error codes
- **[EVENT_AUDIT.md](./docs/EVENT_AUDIT.md)** — Production-grade events guide
- **[UPGRADEABLE_MODULE.md](./docs/UPGRADEABLE_MODULE.md)** — Upgrade system guide
- **[TEST_RESULTS.md](./docs/TEST_RESULTS.md)** — Complete test breakdown (396 tests)
- **[FRONTEND_INTEGRATION.md](./docs/FRONTEND_INTEGRATION.md)** — Complete frontend integration guide (ethers.js, events, flows)
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Contribution guidelines

---

## 🔒 Security

### Security Features
- ✅ **Infrastructure Lock** — Critical contract addresses permanently locked after first poll
- ✅ **Secret Ballot** — Commit-reveal ensures vote privacy during voting
- ✅ **Democratic Reveal** — Anyone can reveal results after time expires
- ✅ **No Admin Bypass** — Admin cannot peek at unrevealed votes
- ✅ **Metadata Lock** — Poll metadata locked after poll starts
- ✅ Reentrancy guards (custom nonReentrant modifier)
- ✅ Integer overflow protection (Solidity 0.8+)
- ✅ Access control (Owner/Admin/Voter roles)
- ✅ Input validation on all functions
- ✅ DoS attack prevention (batch limits: 100 options, 50 voters)
- ✅ Front-running mitigation (commit-reveal for secret ballots)
- ✅ Replay attack prevention (nonces)
- ✅ Safe ETH transfers (low-level call)
- ✅ Relayer whitelist enforcement
- ✅ Two-step ownership transfer
- ✅ CI/CD with Slither static analysis
- ✅ Comprehensive error handling (56+ error codes)

### Known Limitations
- Poll admin has full control over their poll configuration before it starts (by design)
- No vote modification after casting (permanent choice)
- Contract size is near the 24KB limit (managed via modular composition — advanced features extracted to 4 module contracts)

### Audit Status
- **Self-Audited**: ✅
- **Professional Audit**: Pending

### Report Security Issues
Please report vulnerabilities to: [security@example.com]

---

## 🗺️ Roadmap

### ✅ Completed (v4.1)
- [x] Core voting system
- [x] Token-based voting
- [x] Gasless voting (meta-transactions)
- [x] Upgradeable contracts (UUPS)
- [x] Production-grade events
- [x] Comprehensive error codes (56+)
- [x] Multi-choice voting (via MultiChoiceVoting module)
- [x] Quadratic voting (via QuadraticVoting module)
- [x] Vote delegation (via DelegationVoting module)
- [x] IPFS poll metadata (via MetadataVoting module)
- [x] Subgraph for event indexing (The Graph)
- [x] CI/CD pipeline (GitHub Actions + Slither)
- [x] Security hardening (ReentrancyGuard, relayer whitelist, safe transfers)
- [x] **Trust features: Infrastructure lock, secret ballot, democratic reveal**
- [x] **SecretBallotManager (commit-reveal) extracted contract**
- [x] **Admin bypass removal on all view functions**
- [x] **Metadata lock (before start only)**
- [x] **Modular composition: 4 lightweight module contracts auto-deployed**
- [x] **Per-poll custom TokenManager and VotingPaymaster**
- [x] **Franchise system with sub-admin poll creation**
- [x] 396 passing tests (12 test suites)

### 🚧 In Progress
- [ ] Frontend dApp (React + ethers.js) — separate repository
- [ ] Professional security audit

### 📋 Planned
- [ ] Anonymous voting (zk-SNARKs)
- [ ] DAO governance integration
- [ ] Cross-chain voting (bridge support)
- [ ] Formal verification

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create feature branch: `git checkout -b feature/AmazingFeature`
3. Make changes and add tests
4. Run test suite: `npx hardhat test` (all 396 must pass)
5. Commit and push
6. Open Pull Request

---

## 📊 Statistics

| Metric | Value |
|--------|-------|
| **Core Contracts** | 12 + 2 upgradeable |
| **Total Tests** | 396 passing |
| **Test Suites** | 12 |
| **Test Coverage** | 95%+ |
| **Optimizer** | Enabled (100 runs, viaIR) |
| **Contract Size** | 23,932 / 24,576 bytes |
| **Event Emissions** | Production-grade with indexing |
| **CI/CD** | GitHub Actions (compile → test → Slither → deploy check) |

---

## 📝 License

This project is licensed under the **MIT** license. See [LICENSE](./LICENSE) for details.

---

**Version**: 4.1.0
**Last Updated**: 2026-02-14
**Status**: Production-Ready ✅

**Built with ❤️ using Solidity, Hardhat, and Ethereum**
