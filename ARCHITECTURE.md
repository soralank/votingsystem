# System Architecture - Voting System v4.1

Complete technical architecture documentation for the trustless blockchain voting platform with secret ballot, infrastructure lock, democratic reveal, token-based gasless voting, and **modular composition** (multi-choice, quadratic, delegation, and metadata modules).

---

## 📋 Table of Contents

- [Overview](#overview)
- [Trust Architecture](#trust-architecture)
- [System Architecture](#system-architecture)
- [Smart Contract Architecture](#smart-contract-architecture)
- [Secret Ballot Architecture](#secret-ballot-architecture)
- [Token System Architecture](#token-system-architecture)
- [Gasless Voting Architecture](#gasless-voting-architecture)
- [Upgradeable Architecture](#upgradeable-architecture)
- [Data Models](#data-models)
- [Security Architecture](#security-architecture)
- [Event Architecture](#event-architecture)
- [Gas Optimization](#gas-optimization)
- [Design Patterns](#design-patterns)

---

## 🎯 Overview

The Voting System v4.1 is a **trustless** blockchain voting platform built on Ethereum. "Trustless" means voters do not need to trust the admin or contract owner to conduct a fair election — the protocol enforces fairness through smart contract logic.

### Key Characteristics

- **Trustless**: Infrastructure lock, democratic reveal, no admin bypass
- **Private**: Secret ballot via commit-reveal (votes hidden during voting)
- **Decentralized**: No single point of control over results
- **Transparent**: All votes verifiable on-chain after reveal
- **Immutable**: Votes cannot be altered once cast
- **Flexible**: 3 voting methods, multi-choice, quadratic, delegation
- **Upgradeable**: UUPS proxy pattern for future enhancements
- **Production-Grade Events**: Efficient indexed parameters for analytics

### Voting Methods

1. **Traditional Voting**: Voters pay gas fees directly
2. **Token-Based Voting**: Voters use allocated tokens (pay gas but token is burned)
3. **Gasless Voting**: Meta-transactions where admin sponsors gas fees

---

## 🔐 Trust Architecture

### Trust Model

The system ensures election integrity through five key mechanisms:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        TRUST ARCHITECTURE                                     │
└──────────────────────────────────────────────────────────────────────────────┘

  1. INFRASTRUCTURE LOCK
     Deploy → Configure → Create first poll → PERMANENTLY LOCKED
     ✗ Cannot change TokenManager
     ✗ Cannot change VotingPaymaster
     ✗ Cannot change SecretBallotManager
     ✗ Cannot change FranchiseManager

  2. SECRET BALLOT (Commit-Reveal)
     Voting period: Voters submit keccak256(pollId, optionId, salt, voter)
     Reveal period: Voters reveal optionId + salt → hash verified on-chain
     ✗ Nobody can see votes during voting
     ✗ All 5 vote functions reject secret ballot polls (must use SBM)

  3. DEMOCRATIC REVEAL
     After: endTime + 30s (TIME_BUFFER) + 1 hour (REVEAL_DURATION)
     ✓ Anyone can call revealResults(pollId)
     ✗ Admin cannot withhold results

  4. ADMIN BYPASS REMOVAL
     Before reveal, these return zero/empty for everyone (including owner/admin):
     • getOption()        — returns (id, name, 0) — vote counts hidden
     • getVoterChoice()   — requires revealed, reverts otherwise
     • getWinner()        — requires revealed, reverts otherwise
     • getVoterMultiChoices() — requires revealed, reverts otherwise
     • getQuadraticVotes()    — requires revealed, reverts otherwise

  5. METADATA LOCK
     setPollMetadata() only works before poll startTime
     ✗ Cannot change poll description mid-election
```

### Infrastructure Lock Flow

```
                 ┌─────────────┐
                 │   Deploy     │
                 │  Contracts   │
                 └──────┬──────┘
                        │
                        ▼
              ┌──────────────────────┐
              │  setTokenManager()   │ ← Only works before lock
              │  setVotingPaymaster()│
              │  setSecretBallotMgr()│
              │  setFranchiseManager()│
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   createPoll()       │ ← Calls _lockInfrastructure()
              │   (First Poll)       │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  infrastructureLocked│ = true (PERMANENT)
              │                      │
              │  setTokenManager()   │ → reverts "Infra locked"
              │  setVotingPaymaster()│ → reverts "Infra locked"
              │  setSecretBallotMgr()│ → reverts "Infra locked"
              │  setFranchiseManager()│ → reverts "Infra locked"
              └──────────────────────┘
```

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        VOTING SYSTEM v4.1 ARCHITECTURE                        │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND LAYER (Future)                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │   React UI  │──│  ethers.js   │──│  MetaMask   │──│  Event Listeners │  │
│  │   Dashboard │  │  Integration │  │  Connector  │  │  & Analytics     │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────────┘  │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ JSON-RPC / Web3
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            BLOCKCHAIN LAYER                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Ethereum Node (Geth/Hardhat/Infura)                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ EVM Execution
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SMART CONTRACT LAYER                                   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  ElectionsManager.sol (Main Contract - 24,411 bytes)                 │   │
│  │  • Poll Creation & Management    • Infrastructure Lock               │   │
│  │  • Voter Authorization           • Secret Ballot Enable              │   │
│  │  • Vote Casting (3 methods)      • Democratic Reveal                 │   │
│  │  • Multi-Choice & Quadratic      • Admin Bypass Removed              │   │
│  │  • Vote Delegation               • Metadata Lock                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────────┐  │
│  │ SecretBallotMgr    │ │ TokenManager.sol    │ │ VotingPaymaster.sol    │  │
│  │ • Commit votes     │ │ • Token Factory     │ │ • Gas Sponsorship      │  │
│  │ • Reveal votes     │ │ • Allocation         │ │ • EIP-712 Signatures   │  │
│  │ • Phase tracking   │ │ • Burning            │ │ • Meta-Transactions    │  │
│  └────────────────────┘ └─────────┬────────────┘ └────────────────────────┘  │
│                                   │ creates                                  │
│                                   ▼                                          │
│                         ┌────────────────────┐                               │
│                         │ VotingToken.sol     │                               │
│                         │ • ERC20 (soulbound) │                               │
│                         │ • Burnable           │                               │
│                         └────────────────────┘                               │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  BASE LAYER: Ownable → TimeValidator → TokenIntegratedVoting        │   │
│  │  (Ownership)   (Time Rules)   (Token Integration + Infra Lock)      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  UPGRADEABLE (Optional): ERC1967Proxy → ElectionsManagerUpgradeable │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flows

```
Traditional Vote:
  User → MetaMask → ElectionsManager.voteInPoll() → State Update → Event

Token Vote (with gas):
  User → MetaMask → ElectionsManager.voteInPollWithToken() → TokenManager.burn() → Event

Gasless Vote:
  User → Sign EIP-712 → Relayer → VotingPaymaster.executeVoteWithToken() → TokenManager.burn() → Event

Multi-Choice Vote:
  User → MetaMask → ElectionsManager.voteMultiChoice(optionIds[]) → MultiChoiceVoting state → Event

Quadratic Vote:
  User → MetaMask → ElectionsManager.voteQuadratic(optionIds[], amounts[]) → QuadraticVoting state → Token burn → Event

Delegated Vote:
  Delegator → ElectionsManager.delegateVote() → DelegationVoting state
  Delegate → ElectionsManager.voteAsDelegate() → State Update → Event

Secret Ballot Vote:
  Phase 1: User → SecretBallotManager.commitVote(hash) → Store commitment
  Phase 2: User → SecretBallotManager.revealVote(optionId, salt)
            → Verify hash → ElectionsManager.recordSecretVote() → State Update → Event

Democratic Reveal:
  Anyone → ElectionsManager.revealResults(pollId) → (after endTime + buffer + 1hr)

Franchise Poll Creation:
  Franchisee → FranchiseManager.createFranchisePoll() → ElectionsManager.createPoll() → Event
```

---

## 📐 Smart Contract Architecture

### Contract Hierarchy

```
                              Ownable.sol
                          (Ownership Management)
                                   │
                            TimeValidator.sol
                            (Time Validations)
                                   │
                      TokenIntegratedVoting.sol
                      (Token System + Infra Lock)
                                   │
                      ┌────────────┴────────────┐
                      │                         │
                      ▼                         │
               ElectionsManager.sol             │
               (Main Voting Logic)              │
                      │                         │
         ┌────────────┼────────────┐            │
         │            │            │            │
         ▼            ▼            ▼            ▼
  TokenManager  VotingPaymaster  SecretBallot  VotingToken
  (Token Factory) (Gas Sponsor)  Manager       (Per-Poll ERC20)
                                 (Commit-Reveal)

  Module Contracts (auto-deployed by ElectionsManager constructor):
  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌───────────────┐
  │ MultiChoiceVoting│ │ QuadraticVoting   │ │ DelegationVoting  │ │MetadataVoting │
  │ (Max choices,    │ │ (Quadratic costs, │ │ (Delegation pairs,│ │(IPFS URIs)    │
  │  voter selections)│ │  vote amounts)    │ │  delegation count)│ │               │
  └─────────────────┘ └──────────────────┘ └──────────────────┘ └───────────────┘

  FranchiseManager.sol (Standalone)
  (Sub-Admin Franchise System → calls ElectionsManager.createPoll)


UPGRADEABLE VERSION (UUPS):

  Initializable + UUPSUpgradeable + OwnableUpgradeable
                      │
                      ▼
       ElectionsManagerUpgradeable (V1)
                      │
                      ▼
       ElectionsManagerUpgradeableV2
       (V1 + Categories + Weights + Pause)
```

### Contract Responsibilities

| Contract | Purpose | Key Responsibilities |
|----------|---------|---------------------|
| **ElectionsManager** | Main voting logic | Poll lifecycle, voting, results, trust features, per-poll managers |
| **MultiChoiceVoting** | Module: multi-choice | Store maxChoices, voter selections per poll |
| **QuadraticVoting** | Module: quadratic | Store quadratic enabled flag, vote amounts, costs |
| **DelegationVoting** | Module: delegation | Store delegation pairs, delegation counts |
| **MetadataVoting** | Module: metadata | Store IPFS metadata URIs per poll |
| **FranchiseManager** | Franchise system | Grant franchises, create polls, transfers |
| **SecretBallotManager** | Commit-reveal | Commit hashes, verify reveals, phase tracking |
| **TokenManager** | Token factory | Create tokens, allocate, burn |
| **VotingPaymaster** | Gas sponsorship | Meta-transactions, signature verification |
| **VotingToken** | Per-poll token | ERC20 interface, non-transferable, burnable |
| **TokenIntegratedVoting** | Integration layer | Connect token system, infrastructure lock |
| **TimeValidator** | Time rules | Validate poll timing constraints |
| **Ownable** | Access control | Two-step ownership management |

---

## 🗳️ Secret Ballot Architecture

### Commit-Reveal Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    SECRET BALLOT (COMMIT-REVEAL) FLOW                         │
└──────────────────────────────────────────────────────────────────────────────┘

Timeline:
  |-------- Voting Period --------|-- 30s --|---- 1 hour Reveal ----|
  startTime                     endTime  +buffer  revealDeadline

PHASE 1: COMMIT (during voting period)
┌────────────────────────────────────────────────────────────────────────┐
│  Voter's Browser                                                       │
│  1. Generate random salt: salt = ethers.randomBytes(32)               │
│  2. Compute hash:                                                      │
│     hash = keccak256(abi.encodePacked(pollId, optionId, salt, voter)) │
│  3. SAVE salt locally (needed for reveal!)                            │
│  4. Call: SecretBallotManager.commitVote(pollId, hash)                │
│     OR:   SecretBallotManager.commitVoteWithToken(pollId, hash)       │
│           (burns token at commit time)                                 │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  SecretBallotManager Contract                                          │
│  • Validates: secret ballot enabled, voter authorized, poll active    │
│  • Stores: voteCommitments[pollId][voter] = hash                      │
│  • Emits: VoteCommitted(pollId, voter)                                │
│  • Nobody can see the actual vote from the hash                       │
└────────────────────────────────────────────────────────────────────────┘

PHASE 2: REVEAL (after endTime + 30s buffer, within 1 hour window)
┌────────────────────────────────────────────────────────────────────────┐
│  Voter's Browser                                                       │
│  1. Retrieve saved salt and optionId                                  │
│  2. Call: SecretBallotManager.revealVote(pollId, optionId, salt)      │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  SecretBallotManager Contract                                          │
│  1. Verify: keccak256(pollId, optionId, salt, msg.sender) == stored   │
│  2. Mark: hasRevealed[pollId][voter] = true                           │
│  3. Callback: ElectionsManager.recordSecretVote(pollId, voter, optId) │
│  4. Emit: VoteRevealed(pollId, voter, optionId)                       │
└────────────────────────────────────────────────────────────────────────┘

PHASE 3: DEMOCRATIC REVEAL (after reveal window ends)
┌────────────────────────────────────────────────────────────────────────┐
│  Anyone (voter, admin, or third party)                                 │
│  Call: ElectionsManager.revealResults(pollId)                          │
│  • No access restriction — anyone can trigger                         │
│  • Results now publicly visible via getOption(), getWinner(), etc.    │
└────────────────────────────────────────────────────────────────────────┘
```

### Secret Ballot Guards

All 5 standard vote functions reject secret ballot polls:

```solidity
// In ElectionsManager — each vote function checks:
require(!secretBallot[pollId], "Secret ballot: use SBM");
```

Functions guarded:
- `voteInPoll()` 
- `voteInPollWithToken()`
- `voteMultiChoice()`
- `voteQuadratic()`
- `voteAsDelegate()`

For secret ballot polls, voters **must** use `SecretBallotManager.commitVote()` + `revealVote()`.

---

## 🪙 Token System Architecture

### Token Lifecycle

```
1. Poll Creation (token voting enabled)
   ElectionsManager.createPoll() → TokenManager.createPollToken()
   └── Deploys new VotingToken contract

2. Token Allocation
   Admin → ElectionsManager.addVotersWithTokens()
         → TokenManager.batchAllocateTokens()
         → VotingToken.mint()

3. Voting (burns token)
   Normal:        ElectionsManager.voteInPollWithToken() → TokenManager.burn()
   Secret Ballot: SecretBallotManager.commitVoteWithToken() → ElectionsManager.burnTokenForCommit() → TokenManager.burn()

4. Token Verification
   Frontend → TokenManager.hasVoteTokens(pollId, voter) → bool
```

### Token Isolation

```
Poll 1 → VotingToken_1 (0x123...)  ← Only works for Poll 1
Poll 2 → VotingToken_2 (0x456...)  ← Only works for Poll 2

Each token contract:
- Has immutable pollId
- Only callable by TokenManager
- Cannot be transferred between users (soulbound)
- Destroyed when used to vote
```

---

## ⛽ Gasless Voting Architecture

### EIP-712 Meta-Transaction Flow

```
Step 1: Voter Creates Signature (Off-Chain)
┌────────────────────────────────────────────────────────────────┐
│  Voter's Browser/Wallet                                        │
│  1. Construct typed data:                                      │
│     { pollId, optionId, voter, nonce, deadline }               │
│  2. Sign with EIP-712:                                         │
│     signature = wallet._signTypedData(domain, types, value)    │
│  3. Send to relayer:                                           │
│     POST /api/gasless-vote { pollId, optionId, voter, ... }   │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
Step 2: Relayer Submits (On-Chain)
┌────────────────────────────────────────────────────────────────┐
│  Relayer (pays gas)                                            │
│  → paymaster.executeVoteWithToken(pollId, optionId, voter,    │
│                                    deadline, v, r, s)          │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
Step 3: Paymaster Verifies & Executes
┌────────────────────────────────────────────────────────────────┐
│  VotingPaymaster Contract                                      │
│  1. Verify: ecrecover(hash, v, r, s) == voter                │
│  2. Check: deadline, nonce, token balance                     │
│  3. Increment nonce                                           │
│  4. Call: ElectionsManager.voteInPollWithToken()              │
│  5. Gas paid from paymaster's ETH balance                     │
└────────────────────────────────────────────────────────────────┘
```

### Security Mechanisms

| Mechanism | Purpose | Implementation |
|-----------|---------|----------------|
| **Nonce** | Prevent replay attacks | Auto-incremented per voter |
| **Deadline** | Time-limit signatures | Reject if block.timestamp > deadline |
| **EIP-712** | Structured signing | Prevents signature reuse across contracts |
| **Relayer Whitelist** | Optional access control | Only trusted addresses can relay |
| **Gas Limit** | Prevent griefing | max 200K gas per transaction |

---

## 🔄 Upgradeable Architecture (UUPS)

### Proxy Pattern Structure

```
┌─────────────────────────────────────┐
│  ERC1967Proxy                       │  ← Users interact with this address
│  - Address: 0x1234... (PERMANENT)   │     (never changes!)
│  - Contains ALL storage             │
│  - Delegates calls to implementation│
└───────────────┬─────────────────────┘
                │ delegatecall
                ▼
┌─────────────────────────────────────┐
│  ElectionsManagerUpgradeable V1     │  ← Can be replaced!
│  - Contains LOGIC ONLY (no storage) │
│  - Has _authorizeUpgrade()          │
└─────────────────────────────────────┘

Upgrade → Deploy V2 → proxy.upgradeToAndCall(v2, data)

┌─────────────────────────────────────┐
│  ERC1967Proxy (SAME ADDRESS)        │
│  - Now points to V2 implementation  │
│  - ALL storage preserved!           │
└───────────────┬─────────────────────┘
                │ delegatecall
                ▼
┌─────────────────────────────────────┐
│  ElectionsManagerUpgradeable V2     │  ← NEW
│  - Inherits from V1                 │
│  - Categories, Weights, Pause       │
└─────────────────────────────────────┘
```

### Storage Gap System

```solidity
// V1: 50 slots reserved
contract ElectionsManagerUpgradeable {
    uint256[50] private __gap;
}

// V2: Uses 4 gap slots, 46 remaining
contract ElectionsManagerUpgradeableV2 is ElectionsManagerUpgradeable {
    mapping(uint => string) public pollCategories;
    mapping(uint => mapping(address => uint)) public voteWeight;
    mapping(uint => bool) public pollPaused;
    uint256[46] private __gapV2;
}
```

---

## 📊 Data Models

### Poll Structure

```solidity
struct Poll {
    string title;               // Unique poll title
    address admin;              // Poll administrator
    uint startTime;             // Unix timestamp (UTC) when voting starts
    uint endTime;               // Unix timestamp (UTC) when voting ends
    bool revealed;              // Have results been revealed?
    bool ended;                 // Has poll ended by time?
    uint totalVotes;            // Total votes cast
    uint optionsCount;          // Number of voting options
    bool exists;                // Existence flag
    bool tokenVotingEnabled;    // Is token voting available?
    bool tokenVotingRequired;   // Must voters use tokens?
}
```

### Vote Method Tracking

```solidity
enum VoteMethod {
    GasPayment,  // 0: Traditional vote (voter paid gas)
    Token        // 1: Token vote (token burned)
}
```

### State Mappings

```
Global State (ElectionsManager):
├── owner: address
├── pollsCount: uint
├── tokenManager: TokenManager
├── votingPaymaster: VotingPaymaster
├── secretBallotMgr: address
├── franchiseMgr: address                ← FranchiseManager address
├── infrastructureLocked: bool           ← TRUST: permanent lock
├── pollTitles: mapping(string => bool)
├── multiChoiceVoting: MultiChoiceVoting ← module contract address
├── quadraticVoting: QuadraticVoting     ← module contract address
├── delegationVoting: DelegationVoting   ← module contract address
└── metadataVoting: MetadataVoting       ← module contract address

Per-Poll State (ElectionsManager):
├── polls: mapping(uint => Poll)
├── options: mapping(uint => mapping(uint => Option))   ← PRIVATE
├── pollOptionNames: mapping(uint => mapping(uint => string))
├── authorizedVoters: mapping(uint => mapping(address => bool))
├── hasVoted: mapping(uint => mapping(address => bool))
├── voterChoice: mapping(uint => mapping(address => uint))  ← PRIVATE
├── voteMethod: mapping(uint => mapping(address => VoteMethod))
├── secretBallot: mapping(uint => bool)                 ← TRUST: commit-reveal flag
├── pollTokenManager: mapping(uint => address)           ← per-poll custom TokenManager
└── pollVotingPaymaster: mapping(uint => address)        ← per-poll custom Paymaster

Module Contract State (auto-deployed, owned by ElectionsManager):
├── MultiChoiceVoting:
│   ├── pollMaxChoices: mapping(uint => uint)
│   └── voterMultiChoices: mapping(uint => mapping(address => uint[]))
├── QuadraticVoting:
│   ├── quadraticVotingEnabled: mapping(uint => bool)
│   └── quadraticVotes: mapping(uint => mapping(address => mapping(uint => uint)))
├── DelegationVoting:
│   ├── voteDelegation: mapping(uint => mapping(address => address))
│   └── delegationCount: mapping(uint => mapping(address => uint))
└── MetadataVoting:
    └── pollMetadataURI: mapping(uint => string)

SecretBallotManager State:
├── voteCommitments: mapping(uint => mapping(address => bytes32))  ← PRIVATE
├── hasCommitted: mapping(uint => mapping(address => bool))
├── hasRevealed: mapping(uint => mapping(address => bool))
├── commitCount: mapping(uint => uint)
└── revealCount: mapping(uint => uint)
```

---

## 🔒 Security Architecture

### Access Control Matrix

| Function | Owner | Poll Admin | Authorized Voter | Anyone |
|----------|-------|------------|------------------|--------|
| createPoll | ✅ | ❌ | ❌ | ❌* |
| addOptionToPoll | ✅ | ✅ | ❌ | ❌ |
| addVoters / addVotersWithTokens | ✅ | ✅ | ❌ | ❌ |
| enableSecretBallot | ✅ | ✅ | ❌ | ❌ |
| setPollMetadata (before start) | ✅ | ✅ | ❌ | ❌ |
| voteInPoll | ❌ | ❌ | ✅ | ❌ |
| voteInPollWithToken | ❌ | ❌ | ✅ | ❌ |
| voteMultiChoice | ❌ | ❌ | ✅ | ❌ |
| voteQuadratic | ❌ | ❌ | ✅ | ❌ |
| commitVote (SBM) | ❌ | ❌ | ✅ | ❌ |
| revealVote (SBM) | ❌ | ❌ | ✅ | ❌ |
| **revealResults** | ✅ | ✅ | ✅ | **✅** |
| View Functions (pre-reveal) | **❌** | **❌** | **❌** | **❌** |
| View Functions (post-reveal) | ✅ | ✅ | ✅ | ✅ |
| setTokenManager (before lock) | ✅ | ❌ | ❌ | ❌ |
| setVotingPaymaster (before lock) | ✅ | ❌ | ❌ | ❌ |
| setSecretBallotManager (before lock) | ✅ | ❌ | ❌ | ❌ |
| setFranchiseManager (before lock) | ✅ | ❌ | ❌ | ❌ |
| transferOwnership | ✅ | ❌ | ❌ | ❌ |

\*createPoll: Also callable by registered FranchiseManager (via `createFranchisePoll()`)

**Key trust changes from v3.0:**
- `revealResults` → **Anyone** (was admin-only)
- `endPoll` → **Removed** (time-based only)
- View functions (pre-reveal) → **Nobody** (was admin/owner bypass)
- Infrastructure setters → **Disabled after first poll** (was always available)

### Security Layers

```
Layer 1: Trust Enforcement
├── Infrastructure lock (permanent after first poll)
├── Secret ballot guards (commit-reveal required)
├── Democratic reveal (anyone can trigger)
├── Admin bypass removal (no privileged view access)
└── Metadata lock (before start only)

Layer 2: Input Validation
├── Zero address checks
├── Existence checks
├── Numeric range validation
└── Duplicate prevention (titles, options)

Layer 3: Access Control
├── Owner-only functions (onlyOwner)
├── Admin-or-owner functions (onlyAdminOrOwner)
└── Voter authorization checks

Layer 4: State Validation
├── Poll lifecycle checks
├── Time window validation
├── Double-voting prevention
└── Token balance verification

Layer 5: DoS Prevention
├── MAX_OPTIONS = 100
├── MAX_VOTERS_BATCH = 50
├── MIN_POLL_DURATION = 300s
└── MAX_FUTURE_START = 30 days

Layer 6: Attack Mitigation
├── Reentrancy: nonReentrant modifier + CEI pattern
├── Integer overflow: Solidity 0.8+
├── Front-running: Commit-reveal (secret ballot)
├── Replay attacks: Nonces (gasless voting)
├── Signature expiry: Deadlines
└── Safe ETH transfers: Low-level call
```

---

## 📡 Event Architecture

### Production-Grade Events

All events use **indexed parameters** for efficient filtering:

```solidity
// ElectionsManager Events
event PollCreated(uint indexed pollId, string title, address indexed admin, uint startTime, uint endTime, bool tokenVotingEnabled, bool tokenVotingRequired);
event OptionAdded(uint indexed pollId, uint indexed optionId, string name);
event Voted(uint indexed pollId, address indexed voter, uint indexed optionId, VoteMethod method);
event VotedMultiChoice(uint indexed pollId, address indexed voter, uint[] optionIds, VoteMethod method);
event VotedWithToken(uint indexed pollId, address indexed voter, uint indexed optionId);
event ResultsRevealed(uint indexed pollId);
event VoterAuthorized(uint indexed pollId, address indexed voter);
event VoterUnauthorized(uint indexed pollId, address indexed voter);
event SecretBallotEnabled(uint indexed pollId);
event SecretBallotManagerSet(address indexed manager);
event FranchiseManagerSet(address indexed manager);
event TokenManagerSet(address indexed tokenManager);
event PaymasterSet(address indexed paymaster);
event InfrastructureLocked();
event PollMetadataSet(uint indexed pollId, string metadataURI);

// Module Contract Events (emitted from module contracts)
event MultiChoiceConfigured(uint indexed pollId, uint maxChoices);              // MultiChoiceVoting
event QuadraticVotingEnabled(uint indexed pollId);                              // QuadraticVoting
event VotedQuadratic(uint indexed pollId, address indexed voter, uint[] optionIds, uint[] voteAmounts, uint totalCost); // QuadraticVoting
event VoteDelegated(uint indexed pollId, address indexed delegator, address indexed delegatee);   // DelegationVoting
event DelegationRemoved(uint indexed pollId, address indexed delegator, address indexed previousDelegatee); // DelegationVoting
event VotedAsDelegate(uint indexed pollId, address indexed delegate, address indexed delegator, uint optionId); // DelegationVoting
event PollMetadataSet(uint indexed pollId, string metadataURI);                 // MetadataVoting (also re-emitted by EM)

// SecretBallotManager Events
event VoteCommitted(uint indexed pollId, address indexed voter);
event VoteRevealed(uint indexed pollId, address indexed voter, uint indexed optionId);

// TokenManager Events
event TokenCreated(uint256 indexed pollId, address indexed tokenAddress, string name, string symbol);

// VotingPaymaster Events
event Funded(address indexed funder, uint amount);
event Withdrawn(address indexed recipient, uint amount);
event GasSponsored(uint indexed pollId, address indexed voter, uint gasUsed, uint gasPrice);
event RelayerAdded(address indexed relayer);
event RelayerRemoved(address indexed relayer);
event RelayerWhitelistToggled(bool enabled);
event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

// FranchiseManager Events
event FranchiseGranted(uint indexed franchiseId, address indexed franchisee, uint expiresAt, uint maxPolls, uint feePerPoll);
event FranchisePollCreated(uint indexed franchiseId, uint indexed pollId, uint feePaid);
event PollsAdded(uint indexed franchiseId, uint additionalPolls, uint newMaxPolls);
event FranchiseSuperseded(uint indexed oldFranchiseId, uint indexed newFranchiseId, address indexed franchisee);
event TransferRequested(uint indexed franchiseId, address indexed from, address indexed to, uint feePaid);
event TransferApproved(uint indexed franchiseId, address indexed oldFranchisee, address indexed newFranchisee);
event TransferRejected(uint indexed franchiseId);
event TransferFeeSet(uint fee);
event FeesWithdrawn(address indexed to, uint amount);
```

### Event Filtering Examples

```javascript
// Get all polls by admin
const adminPolls = await contract.queryFilter(
    contract.filters.PollCreated(null, null, adminAddress)
);

// Get all votes by specific user
const userVotes = await contract.queryFilter(
    contract.filters.Voted(null, voterAddress)
);

// Track secret ballot commitments
const commits = await sbm.queryFilter(
    sbm.filters.VoteCommitted(pollId)
);
```

---

## ⚡ Gas Optimization

### Techniques Used
- **Storage Packing**: Bool fields in Poll struct packed into same slot
- **Batch Operations**: `addVoters()`, `addVotersWithTokens()` for bulk operations
- **calldata**: External functions use `calldata` instead of `memory`
- **Short-Circuit**: `require(A || B)` stops at first true
- **Optimizer**: 100 runs with `viaIR: true`

### Gas Cost Estimates

| Operation | Estimated Gas | Notes |
|-----------|---------------|-------|
| Deploy ElectionsManager | ~2,800,000 | Main contract |
| Deploy SecretBallotManager | ~800,000 | Commit-reveal |
| Deploy TokenManager | ~1,500,000 | Token factory |
| Deploy VotingPaymaster | ~1,200,000 | Paymaster |
| Create Poll (no token) | ~200,000 | Locks infrastructure on first call |
| Create Poll (with token) | ~1,000,000 | Includes token deployment |
| Add Option | ~100,000 | Per option |
| Vote (traditional) | ~80,000 | Direct vote |
| Vote (with token) | ~120,000 | Token burn included |
| Vote (gasless) | ~150,000 | Paymaster pays |
| Commit Vote (secret) | ~80,000 | Hash storage |
| Reveal Vote (secret) | ~100,000 | Hash verification + callback |
| Reveal Results | ~50,000 | Anyone can call |

---

## 🎨 Design Patterns

### 1. Commit-Reveal Pattern
**Purpose**: Vote privacy during election
**Implementation**: `SecretBallotManager` with keccak256 hash commitments

### 2. Infrastructure Lock Pattern
**Purpose**: Prevent admin malice after deployment
**Implementation**: `_lockInfrastructure()` called in `createPoll()`

### 3. Democratic Reveal Pattern
**Purpose**: Prevent admin from withholding results
**Implementation**: Time-based access in `revealResults()`

### 4. Proxy Pattern (UUPS)
**Purpose**: Upgradeable contracts without losing data
**Implementation**: ERC1967Proxy + UUPSUpgradeable

### 5. Factory Pattern
**Purpose**: Create multiple token contracts
**Implementation**: TokenManager creates VotingToken instances

### 6. Meta-Transaction Pattern
**Purpose**: Gasless voting
**Implementation**: EIP-712 signatures + VotingPaymaster

### 7. Checks-Effects-Interactions (CEI)
**Purpose**: Prevent reentrancy
**Pattern**: Validate → Update state → External calls

### 8. State Machine Pattern
**Purpose**: Poll lifecycle management
**States**: Not Started → Active → Ended → (Reveal Window) → Revealed

### 9. Modular Composition Pattern (NEW in v4.1)
**Purpose**: Separate advanced voting features into lightweight, independently-deployable modules
**Implementation**: ElectionsManager auto-deploys 4 module contracts in its constructor. Each module is owned by ElectionsManager and stores feature-specific state. ElectionsManager exposes wrapper functions that delegate to modules.
**Benefits**:
- Keeps ElectionsManager under Ethereum's 24KB contract size limit
- Each module can be audited independently
- State isolation — module failures don't corrupt core voting state
- Per-poll custom TokenManager/VotingPaymaster via `pollTokenManager[pollId]` and `pollVotingPaymaster[pollId]`

---

## 📖 References

- [EIP-712: Typed Structured Data](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-1967: Proxy Storage Slots](https://eips.ethereum.org/EIPS/eip-1967)
- [UUPS Proxies](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)

---

**Version**: 4.1.0
**Last Updated**: 2026-02-14
**Author**: soralank
**Status**: Production-Ready ✅
