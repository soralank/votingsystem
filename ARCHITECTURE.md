# System Architecture - Voting System v4.0

Complete technical architecture documentation for the trustless blockchain voting platform with secret ballot, infrastructure lock, democratic reveal, and token-based gasless voting.

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

The Voting System v4.0 is a **trustless** blockchain voting platform built on Ethereum. "Trustless" means voters do not need to trust the admin or contract owner to conduct a fair election — the protocol enforces fairness through smart contract logic.

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
     Before reveal, these revert for everyone (including owner/admin):
     ✗ getOption()        — vote counts hidden
     ✗ getVoterChoice()   — individual votes hidden
     ✗ getWinner()        — winner hidden
     ✗ getVoterMultiChoices() — multi-choice hidden
     ✗ getQuadraticVotes()    — quadratic hidden

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
              └──────────────────────┘
```

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        VOTING SYSTEM v4.0 ARCHITECTURE                        │
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
  User → Sign EIP-712 → Relayer → VotingPaymaster.executeVote() → TokenManager.burn() → Event

Secret Ballot Vote:
  Phase 1: User → SecretBallotManager.commitVote(hash) → Store commitment
  Phase 2: User → SecretBallotManager.revealVote(optionId, salt)
            → Verify hash → ElectionsManager.recordSecretVote() → State Update → Event

Democratic Reveal:
  Anyone → ElectionsManager.revealResults(pollId) → (after endTime + buffer + 1hr)
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
| **ElectionsManager** | Main voting logic | Poll lifecycle, voting, results, trust features |
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
Global State:
├── owner: address
├── pollsCount: uint
├── tokenManager: TokenManager
├── votingPaymaster: VotingPaymaster
├── secretBallotMgr: address
├── infrastructureLocked: bool          ← TRUST: permanent lock
├── pollTitles: mapping(string => bool)

Per-Poll State:
├── polls: mapping(uint => Poll)
├── options: mapping(uint => mapping(uint => Option))   ← PRIVATE
├── authorizedVoters: mapping(uint => mapping(address => bool))
├── hasVoted: mapping(uint => mapping(address => bool))
├── voterChoice: mapping(uint => mapping(address => uint))  ← PRIVATE
├── voteMethod: mapping(uint => mapping(address => VoteMethod))
├── secretBallot: mapping(uint => bool)                 ← TRUST: commit-reveal flag
├── pollMaxChoices: mapping(uint => uint)
├── quadraticVotingEnabled: mapping(uint => bool)
├── voteDelegation: mapping(uint => mapping(address => address))
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
| createPoll | ✅ | ❌ | ❌ | ❌ |
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
| transferOwnership | ✅ | ❌ | ❌ | ❌ |

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
event ResultsRevealed(uint indexed pollId);
event VoterAuthorized(uint indexed pollId, address indexed voter);
event VoterUnauthorized(uint indexed pollId, address indexed voter);
event SecretBallotEnabled(uint indexed pollId);
event SecretBallotManagerSet(address indexed manager);
event InfrastructureLocked();
event PollMetadataSet(uint indexed pollId, string metadataURI);

// SecretBallotManager Events
event VoteCommitted(uint indexed pollId, address indexed voter);
event VoteRevealed(uint indexed pollId, address indexed voter, uint indexed optionId);

// TokenManager Events
event TokenCreated(uint256 indexed pollId, address indexed tokenAddress, string name, string symbol);

// VotingPaymaster Events
event VotedWithToken(uint256 indexed pollId, address indexed voter, uint256 indexed optionId);
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

---

## 📖 References

- [EIP-712: Typed Structured Data](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-1967: Proxy Storage Slots](https://eips.ethereum.org/EIPS/eip-1967)
- [UUPS Proxies](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)

---

**Version**: 4.0.0
**Last Updated**: 2026-02-13
**Author**: soralank
**Status**: Production-Ready ✅
