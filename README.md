# Voting System — Trustless Blockchain Polling Platform

A production-grade, trustless decentralized voting system built on Ethereum. The system enforces election integrity through on-chain mechanisms — infrastructure locking, commit-reveal secret ballots, democratic result revelation, and zero admin bypass — eliminating the need for voters to trust any administrator.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-3.1.3-yellow.svg)](https://hardhat.org/)
[![Tests](https://img.shields.io/badge/Tests-396%20passing-brightgreen.svg)](./test)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-blue.svg)](./.github/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Custom-blue.svg)](./LICENSE)

---

## Design Principles

| Principle | Enforcement |
|-----------|-------------|
| **Trustlessness** | No actor — including the owner — can observe, alter, or suppress votes before reveal |
| **Temporal Integrity** | Poll lifecycle governed exclusively by on-chain time; no human override |
| **Composable Isolation** | Each poll has its own token economy, voter registry, and configuration |

For the complete design rationale, threat model, economic model, and invariant specification, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Capabilities

### Trust & Integrity
- **Infrastructure Lock** — Contract references (TokenManager, Paymaster, SecretBallotManager, FranchiseManager) are permanently locked after the first poll is created
- **Secret Ballot** — Commit-reveal scheme: voters submit a hash during voting, reveal after voting closes
- **Democratic Reveal** — Anyone can call `revealResults()` after the time window passes; no admin gatekeeping
- **Admin Bypass Removal** — `getOption()`, `getVoterChoice()`, `getWinner()`, `getVoterMultiChoices()`, `getQuadraticVotes()` all require `revealed == true` for everyone, including the owner
- **Metadata Lock** — `setPollMetadata()` restricted to before poll start time

### Voting Methods
- **Traditional Voting** — Voter pays gas, one vote per authorised address
- **Token-Based Voting** — Per-poll soulbound ERC20 tokens; burned on vote (optional or required per poll)
- **Gasless Voting** — EIP-712 meta-transactions via VotingPaymaster; admin sponsors gas
- **Multi-Choice Voting** — Configurable max selections per poll
- **Quadratic Voting** — Cost = sum of squares of vote amounts; prevents plutocratic dominance
- **Vote Delegation** — Delegate to a trusted peer; revocable before the delegate votes

### System Features
- **Franchise System** — Time-limited sub-admin licences with pay-per-poll economics (first poll free)
- **Modular Composition** — 4 feature modules auto-deployed by ElectionsManager to stay within 24 KB
- **Per-Poll Managers** — Each poll can use a custom TokenManager and VotingPaymaster
- **IPFS Metadata** — Off-chain poll descriptions via on-chain URI reference
- **Upgradeable Path** — Optional UUPS proxy with V2 (categories, weights, pause)
- **Subgraph Indexing** — GraphQL API via The Graph for real-time event queries

---

## Contract Overview

| Contract | Role |
|----------|------|
| **Voting.sol** | Deployment entry point (inherits ElectionsManager) |
| **ElectionsManager.sol** | Core: polls, voting, results, trust features, module orchestration |
| **TokenIntegratedVoting.sol** | Token integration layer + infrastructure lock + ownership |
| **TimeValidator.sol** | Time validation (min duration, max future start, buffer) |
| **SecretBallotManager.sol** | Commit-reveal voting (standalone, linked via interface) |
| **FranchiseManager.sol** | Sub-admin franchise system |
| **TokenManager.sol** | Per-poll ERC20 token factory |
| **VotingPaymaster.sol** | Gas sponsorship via EIP-712 signatures |
| **VotingToken.sol** | Per-poll soulbound burnable ERC20 |
| **VotingReader.sol** | Read-only aggregator for frontend queries |
| **MultiChoiceVoting.sol** | Module: multi-choice state |
| **QuadraticVoting.sol** | Module: quadratic vote state |
| **DelegationVoting.sol** | Module: delegation state |
| **MetadataVoting.sol** | Module: IPFS metadata |

For detailed contract documentation, see [SOLIDITY_CONTRACTS.md](SOLIDITY_CONTRACTS.md).

---

## Quick Start

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

### Run Tests

```bash
npx hardhat test                    # 396 tests, 12 suites
REPORT_GAS=true npx hardhat test    # with gas reporting
```

### Deploy Locally

```bash
# Terminal 1
npx hardhat node

# Terminal 2
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost
```

This deploys and auto-wires: ElectionsManager, TokenManager, VotingPaymaster, SecretBallotManager, and FranchiseManager. Once you create the first poll, infrastructure is permanently locked.

---

## Deployment

| Network | Command |
|---------|---------|
| **Local** | `npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost` |
| **Sepolia** | `npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network sepolia` |
| **Mainnet** | `npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network mainnet` |
| **Upgradeable** | `npx hardhat ignition deploy ignition/modules/UpgradeableVoting.ts --network <network>` |

For step-by-step instructions, gas estimates, and post-deployment verification, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

---

## Testing

**396 tests passing** across 12 suites:

| Suite | Tests | Focus |
|-------|-------|-------|
| Franchise Manager | 83 | Grant, create polls, transfer, irrevocability, fees, supersede |
| Core Voting | 46 | Poll lifecycle, voter auth, voting, reveal, scheduled polls |
| Trust Features | 42 | Infrastructure lock, secret ballot, democratic reveal, admin bypass |
| Token Manager | 38 | Token creation, allocation, burning, multi-poll isolation |
| Advanced Features | 35 | Multi-choice, quadratic, delegation, IPFS metadata |
| Upgradeable | 37 | V1 deploy, V2 upgrade, data preservation, storage safety |
| Error Codes | 32 | All 56+ error messages verified against contract behaviour |
| Voting Token | 29 | ERC20 compat, soulbound, mint/burn, approve |
| Voting Paymaster | 28 | EIP-712 sigs, funding, relayer management, nonces |
| Event Verification | 14 | Production-grade indexed events |
| Token Integration | 13 | Token creation on poll, mixed voting methods |
| Gasless E2E | 7 | Full signature → relay → vote flow |

---

## Security

### Implemented Protections

- **Reentrancy guards** — Custom `nonReentrant` modifier + CEI pattern on all state-changing vote functions
- **Infrastructure lock** — Critical contract addresses permanently frozen after first poll
- **Commit-reveal** — Front-running mitigation for secret ballot polls
- **EIP-712 signatures** — Replay protection (nonces), deadline enforcement, malleable signature rejection
- **Access control** — Owner / poll admin / voter role separation with strict modifier enforcement
- **DoS prevention** — Batch limits (50 voters, 100 options)
- **Two-step ownership** — `transferOwnership()` → `acceptOwnership()` prevents accidental transfers
- **Safe ETH transfers** — Low-level `call` with success check
- **Integer overflow** — Solidity 0.8+ built-in protection

### Formal Threat Model

A full STRIDE-based threat analysis, attack classification table, privacy disclosure, timestamp dependence analysis, and documented invariants are available in [ARCHITECTURE.md](ARCHITECTURE.md). Operational playbooks and monitoring guidance are in ARCHITECTURE.md §11–12.

### Audit Status

- **Self-audited:** Comprehensive
- **CI/CD:** GitHub Actions (compile → test → Slither static analysis → deploy check)
- **Professional audit:** Pending

### Report Vulnerabilities

ankit.soral@outlook.com

---

## Documentation

| Document | Content |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Design intent, trade-offs, threat model, attack classification, economic model, failure modes, governance hardening (upgrade risk matrix, emergency migration, key rotation), invariants, monitoring guide (Grafana queries, Graph queries, maturity model), operational playbooks, V2 delta, formal verification roadmap (Certora/Echidna/Slither), threat simulation appendix |
| [SOLIDITY_CONTRACTS.md](SOLIDITY_CONTRACTS.md) | Detailed contract documentation — functions, state, events, modifiers |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Step-by-step deployment for local, Sepolia, and mainnet |
| [docs/ERROR_CODES.md](docs/ERROR_CODES.md) | 56+ error codes with frontend handling guidance |
| [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md) | Complete ethers.js integration guide with all user flows |
| [docs/UPGRADEABLE_MODULE.md](docs/UPGRADEABLE_MODULE.md) | UUPS upgrade guide with V1→V2 example |
| [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) | Full test breakdown (396 tests, 12 suites) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines and coding standards |

---

## Project Statistics

| Metric | Value |
|--------|-------|
| Core Contracts | 14 (+ 2 upgradeable variants) |
| Tests | 396 passing |
| Test Suites | 12 |
| Contract Size | 23,932 / 24,576 bytes (ElectionsManager) |
| Optimizer | 100 runs, viaIR enabled |
| CI/CD | GitHub Actions (compile → test → Slither → deploy check) |

---

## License

This project is licensed under a custom license by Ankit Soral. See [LICENSE](LICENSE) for details.

---

**Version:** 4.1.0 | **Last Updated:** 2026-02-22 | **Status:** Production-Ready

**Built by Ankit Soral — Solidity, Hardhat, Ethereum**
