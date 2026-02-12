# System Architecture - Voting System v2.0

Complete technical architecture documentation for the production-grade blockchain voting platform with token-based gasless voting.

---

## 📋 Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Smart Contract Architecture](#smart-contract-architecture)
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

The Voting System v2.0 is a production-grade blockchain voting platform built on Ethereum with three distinct voting methods:
1. **Traditional Voting**: Voters pay gas fees directly
2. **Token-Based Voting**: Voters use allocated tokens (pay gas but token is burned)
3. **Gasless Voting**: Meta-transactions where admin sponsors gas fees

### Key Characteristics

- **Decentralized**: No single point of control
- **Transparent**: All votes verifiable on-chain
- **Immutable**: Votes cannot be altered
- **Flexible**: Multiple voting methods per poll
- **Upgradeable**: UUPS proxy pattern for future enhancements
- **Production-Grade Events**: Efficient indexed parameters for analytics
- **Comprehensive Error Handling**: 56+ documented error codes

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        VOTING SYSTEM v2.0 ARCHITECTURE                        │
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
│  │  • Block Production & Validation                                     │   │
│  │  • Transaction Processing                                            │   │
│  │  • State Management                                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ EVM Execution
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SMART CONTRACT LAYER                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     CORE VOTING CONTRACTS                             │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  ElectionsManager.sol (Main Contract)                       │    │   │
│  │  │  • Poll Creation & Management                               │    │   │
│  │  │  • Voter Authorization                                      │    │   │
│  │  │  • Vote Casting (3 methods)                                 │    │   │
│  │  │  • Results Revelation                                       │    │   │
│  │  │  • Production-Grade Events                                  │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                       │   │
│  │  ┌────────────────────────┐  ┌─────────────────────────────────┐   │   │
│  │  │  TokenManager.sol      │  │  VotingPaymaster.sol            │   │   │
│  │  │  • Token Factory        │  │  • Gas Sponsorship              │   │   │
│  │  │  • Allocation          │  │  • EIP-712 Signatures           │   │   │
│  │  │  • Burning             │  │  • Meta-Transactions            │   │   │
│  │  └────────────┬───────────┘  └─────────────────────────────────┘   │   │
│  │               │ creates                                              │   │
│  │               ▼                                                      │   │
│  │  ┌────────────────────────┐                                         │   │
│  │  │  VotingToken.sol       │                                         │   │
│  │  │  • ERC20-compatible    │                                         │   │
│  │  │  • Non-transferable    │                                         │   │
│  │  │  • Burnable            │                                         │   │
│  │  └────────────────────────┘                                         │   │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     BASE LAYER CONTRACTS                              │   │
│  │  ┌───────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │   │
│  │  │ TokenIntegrated   │  │  TimeValidator   │  │  Ownable         │ │   │
│  │  │ Voting            │  │  (Time Rules)    │  │  (Access Control)│ │   │
│  │  └───────────────────┘  └──────────────────┘  └──────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │               UPGRADEABLE CONTRACTS (Optional)                        │   │
│  │  ┌──────────────┐  ┌───────────────────────────────────────────┐   │   │
│  │  │ ERC1967Proxy │──│ ElectionsManagerUpgradeable V1/V2         │   │   │
│  │  │ (Storage)    │  │ • All Core Features + Upgrade Logic       │   │   │
│  │  │              │  │ • V2: Categories, Weights, Pause          │   │   │
│  │  └──────────────┘  └───────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ State Storage
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           STORAGE LAYER                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Ethereum State Database                                              │   │
│  │  • Polls Data (title, admin, times, options)                         │   │
│  │  • Votes (choice, method, timestamp)                                 │   │
│  │  • Authorizations (per-poll voter lists)                             │   │
│  │  • Token Balances (per-poll token amounts)                           │   │
│  │  • Events (indexed for efficient queries)                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
Traditional Vote:
User → MetaMask → ElectionsManager.voteInPoll() → State Update → Event Emitted

Token Vote (with gas):
User → MetaMask → ElectionsManager.voteInPollWithToken() → TokenManager.burn() → State Update → Event

Gasless Vote:
User → Sign EIP-712 → Relayer → VotingPaymaster.executeVote() → TokenManager.burn() → ElectionsManager → State
```

---

## 📐 Smart Contract Architecture

### Contract Hierarchy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    CONTRACT INHERITANCE TREE                              │
└──────────────────────────────────────────────────────────────────────────┘

                              Ownable.sol
                          (Ownership Management)
                                   │
                    ┌──────────────┴───────────────┐
                    │                              │
             TimeValidator.sol                     │
             (Time Validations)                    │
                    │                              │
                    ▼                              │
       TokenIntegratedVoting.sol                   │
       (Token System Integration)                  │
                    │                              │
       ┌────────────┴────────────┐                │
       │                         │                │
       ▼                         ▼                ▼
ElectionsManager.sol    TokenManager.sol    VotingPaymaster.sol
(Main Voting Logic)     (Token Factory)     (Gas Sponsorship)
       │
       │ creates
       ▼
VotingToken.sol
(Per-Poll ERC20)


UPGRADEABLE VERSION (UUPS):

Initializable + UUPSUpgradeable + OwnableUpgradeable
                    │
                    ▼
     ElectionsManagerUpgradeable (V1)
                    │
        inherits    │
                    ▼
     ElectionsManagerUpgradeableV2
     (V1 + Categories + Weights + Pause)
```

### Contract Responsibilities

| Contract | Purpose | Key Responsibilities |
|----------|---------|---------------------|
| **ElectionsManager** | Main voting logic | Poll lifecycle, voting, results |
| **TokenManager** | Token factory | Create tokens, allocate, burn |
| **VotingPaymaster** | Gas sponsorship | Meta-transactions, signature verification |
| **VotingToken** | Per-poll token | ERC20 interface, non-transferable |
| **TokenIntegratedVoting** | Integration layer | Connect token system to voting |
| **TimeValidator** | Time rules | Validate poll timing constraints |
| **Ownable** | Access control | Ownership management |

---

## 🪙 Token System Architecture

### Token Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                    TOKEN LIFECYCLE                                │
└──────────────────────────────────────────────────────────────────┘

1. Poll Creation (token voting enabled)
   ElectionsManager.createPoll() → TokenManager.createPollToken()
   └── Deploys new VotingToken contract

2. Token Allocation
   Admin → ElectionsManager.addVotersWithTokens()
         → TokenManager.batchAllocateTokens()
         → VotingToken.mint()

3. Voting (burns token)
   Voter → ElectionsManager.voteInPollWithToken()
         → TokenManager.burnTokensForVote()
         → VotingToken.burn()

4. Token Verification
   Frontend → TokenManager.hasVoteTokens(pollId, voter)
            ↓
   Returns: Does voter have >= TOKENS_PER_VOTE (1)?
```

### Token Isolation

```
Poll 1 → VotingToken_1 (0x123...)  ← Only works for Poll 1
Poll 2 → VotingToken_2 (0x456...)  ← Only works for Poll 2
Poll 3 → VotingToken_3 (0x789...)  ← Only works for Poll 3

Each token contract:
- Has immutable pollId
- Only callable by TokenManager
- Cannot be transferred between users
- Destroyed when used to vote
```

---

## ⛽ Gasless Voting Architecture

### EIP-712 Meta-Transaction Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                  GASLESS VOTING FLOW (EIP-712)                        │
└──────────────────────────────────────────────────────────────────────┘

Step 1: Voter Creates Signature (Off-Chain)
┌────────────────────────────────────────────────────────────────┐
│  Voter's Browser/Wallet                                        │
│  1. Construct typed data structure:                            │
│     {                                                           │
│       pollId: 1,                                               │
│       optionId: 2,                                             │
│       voter: 0xVoter...,                                       │
│       nonce: 0,                                                │
│       deadline: 1234567890                                     │
│     }                                                           │
│                                                                 │
│  2. Sign with EIP-712:                                         │
│     signature = wallet._signTypedData(domain, types, value)    │
│                                                                 │
│  3. Send to relayer/backend:                                   │
│     POST /api/gasless-vote { pollId, optionId, voter, deadline, signature }
│                                                                 │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ Off-chain transmission
                              ▼
Step 2: Relayer Submits Transaction (On-Chain)
┌────────────────────────────────────────────────────────────────┐
│  Relayer (Admin/Backend)                                        │
│                                                                 │
│  1. Extract signature components:                              │
│     const { v, r, s } = ethers.utils.splitSignature(sig);     │
│                                                                 │
│  2. Call paymaster (relayer pays gas):                         │
│     await paymaster.executeVoteWithToken(                      │
│       pollId, optionId, voter, deadline, v, r, s              │
│     );                                                          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ Blockchain transaction
                              ▼
Step 3: Paymaster Verifies & Executes
┌────────────────────────────────────────────────────────────────┐
│  VotingPaymaster Contract                                       │
│                                                                 │
│  1. Verify signature:                                          │
│     - Reconstruct EIP-712 hash                                 │
│     - ecrecover(hash, v, r, s) == voter?                      │
│     - deadline not passed?                                     │
│     - nonce correct?                                           │
│                                                                 │
│  2. Increment nonce (prevent replay)                           │
│                                                                 │
│  3. Check voter has tokens                                     │
│                                                                 │
│  4. Call ElectionsManager.voteInPollWithToken()                │
│                                                                 │
│  5. Gas paid by paymaster (pre-funded by admin)                │
│                                                                 │
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
┌──────────────────────────────────────────────────────────────────────┐
│                    UUPS UPGRADEABLE PATTERN                           │
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ERC1967Proxy                       │  ← Users interact with this address
│  - Address: 0x1234... (PERMANENT)   │     (never changes!)
│  - Contains ALL storage              │
│  - Delegates calls to implementation │
│                                      │
│  Storage:                            │
│  - pollsCount                        │
│  - polls mapping                     │
│  - votes mapping                     │
│  - authorizedVoters mapping          │
│  - implementation address pointer    │
│                                      │
└───────────────┬─────────────────────┘
                │ delegatecall
                ▼
┌─────────────────────────────────────┐
│  ElectionsManagerUpgradeable V1     │  ← Can be replaced!
│  - Address: 0x5678... (changeable)  │
│  - Contains LOGIC ONLY (no storage) │
│  - Has _authorizeUpgrade()          │
│                                      │
│  Functions:                          │
│  - createPoll()                      │
│  - voteInPoll()                      │
│  - revealResults()                   │
│  - ...all voting logic                │
│                                      │
└─────────────────────────────────────┘

Upgrade Process:
┌──────────────────┐      ┌──────────────────┐
│ Deploy V2 Impl   │──1──►│ Verify V2 Works  │
└──────────────────┘      └────────┬─────────┘
                                    │
                          2. Call proxy.upgradeToAndCall(v2Impl, initData)
                                    │
                                    ▼
┌─────────────────────────────────────┐
│  ERC1967Proxy (SAME ADDRESS)        │
│  - Now points to V2 implementation  │
│  - ALL storage preserved!           │
│  - Users don't notice anything      │
└───────────────┬─────────────────────┘
                │ delegatecall
                ▼
┌─────────────────────────────────────┐
│  ElectionsManagerUpgradeable V2     │  ← NEW implementation
│  - Inherits from V1                 │
│  - Adds new state variables (uses gap) │
│  - New features:                     │
│    • Poll categories                 │
│    • Vote weights                    │
│    • Pause functionality             │
│    • Enhanced statistics             │
└─────────────────────────────────────┘
```

### Storage Gap System

```solidity
// V1: 50 slots reserved for future use
contract ElectionsManagerUpgradeable {
    // ... state variables ...
    uint256[50] private __gap;  // ← Reserve space
}

// V2: Uses 4 gap slots, 46 remaining
contract ElectionsManagerUpgradeableV2 is ElectionsManagerUpgradeable {
    mapping(uint => string) public pollCategories;              // ← Slot 1
    mapping(uint => mapping(address => uint)) public voteWeight; // ← Slot 2
    mapping(uint => bool) public pollPaused;                    // ← Slot 3
    // ... more features ...

    uint256[46] private __gapV2;  // ← 50 - 4 = 46 slots left
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
    bool ended;                 // Has poll been manually ended?
    uint totalVotes;            // Total votes cast
    uint optionsCount;          // Number of voting options
    bool exists;                // Existence flag (prevent default confusion)
    bool tokenVotingEnabled;    // Is token voting available?
    bool tokenVotingRequired;   // Must voters use tokens?
}
```

### Vote Method Tracking

```solidity
enum VoteMethod {
    GasPayment,  // 0: Traditional vote (voter paid gas)
    Token        // 1: Token vote (token burned, voter or admin paid gas)
}

mapping(uint256 => mapping(address => VoteMethod)) public voteMethod;
```

### State Mappings

```
Global State:
├── owner: address
├── pollsCount: uint
├── tokenManager: TokenManager
├── votingPaymaster: VotingPaymaster
└── pollTitles: mapping(string => bool)

Per-Poll State:
├── polls: mapping(uint => Poll)
├── pollOptions: mapping(uint => mapping(uint => string))
├── votesCount: mapping(uint => mapping(uint => uint))
├── authorizedVoters: mapping(uint => mapping(address => bool))
├── hasVoted: mapping(uint => mapping(address => bool))
├── voterChoice: mapping(uint => mapping(address => uint))
└── voteMethod: mapping(uint => mapping(address => VoteMethod))

Token System:
├── pollTokens: mapping(uint => address)  // pollId => VotingToken
├── allocatedTokens: mapping(uint => mapping(address => uint))
└── VotingToken per poll with balanceOf mapping
```

---

## 🔒 Security Architecture

### Access Control Matrix

| Function | Owner | Poll Admin | Authorized Voter | Anyone |
|----------|-------|------------|------------------|--------|
| createPoll | ✅ | ❌ | ❌ | ❌ |
| addOptionToPoll | ✅ | ✅ | ❌ | ❌ |
| addVoters | ✅ | ✅ | ❌ | ❌ |
| addVotersWithTokens | ✅ | ✅ | ❌ | ❌ |
| voteInPoll | ❌ | ❌ | ✅ | ❌ |
| voteInPollWithToken | ❌ | ❌ | ✅ | ❌ |
| revealResults | ✅ | ✅ | ❌ | ❌ |
| endPoll | ✅ | ✅ | ❌ | ❌ |
| View Functions (pre-reveal) | ✅ | ✅ | Limited | Limited |
| View Functions (post-reveal) | ✅ | ✅ | ✅ | ✅ |

### Security Layers

```
┌──────────────────────────────────────────────────────────┐
│              SECURITY LAYER ARCHITECTURE                  │
└──────────────────────────────────────────────────────────┘

Layer 1: Input Validation
├── Zero address checks
├── Existence checks
├── Numeric range validation
└── String length limits

Layer 2: Access Control
├── Owner-only functions (onlyOwner)
├── Admin-or-owner functions (onlyAdminOrOwner)
└── Voter authorization checks

Layer 3: State Validation
├── Poll lifecycle checks
├── Time window validation
├── Double-voting prevention
└── Token balance verification

Layer 4: DoS Prevention
├── MAX_OPTIONS = 100
├── MAX_VOTERS_BATCH = 50
├── MIN_POLL_DURATION = 300s
└── MAX_FUTURE_START = 30 days

Layer 5: Attack Mitigation
├── Reentrancy: CEI pattern
├── Integer overflow: Solidity 0.8+
├── Replay attacks: Nonces
├── Signature expiry: Deadlines
└── Front-running: Hidden votes
```

---

## 📡 Event Architecture

### Production-Grade Events

All events use **indexed parameters** for efficient filtering:

```solidity
// ✅ GOOD: Admin indexed, token flags included
event PollCreated(
    uint indexed pollId,
    string title,
    address indexed admin,  // ← Can filter by admin
    uint startTime,
    uint endTime,
    bool tokenVotingEnabled,    // ← Frontend doesn't need extra call
    bool tokenVotingRequired
);

// ✅ GOOD: All 3 slots indexed, VoteMethod included
event Voted(
    uint indexed pollId,        // ← Filter by poll
    address indexed voter,      // ← Filter by voter
    uint indexed optionId,      // ← Filter by option
    VoteMethod method           // ← Distinguish gas vs token
);
```

### Event Filtering Examples

```javascript
// Get all polls created by specific admin
const adminPolls = await contract.queryFilter(
    contract.filters.PollCreated(null, null, adminAddress)
);

// Get all votes by specific user
const userVotes = await contract.queryFilter(
    contract.filters.Voted(null, voterAddress)
);

// Get all votes on specific option in specific poll
const optionVotes = await contract.queryFilter(
    contract.filters.Voted(pollId, null, optionId)
);

// Count vote methods for analytics
const pollVotes = await contract.queryFilter(contract.filters.Voted(pollId));
const methodCounts = pollVotes.reduce((acc, event) => {
    acc[event.args.method === 0 ? 'gas' : 'token']++;
    return acc;
}, { gas: 0, token: 0 });
```

---

## ⚡ Gas Optimization

### Optimization Techniques

#### 1. Storage Packing
```solidity
struct Poll {
    string title;           // Dynamic
    address admin;          // 20 bytes
    uint startTime;         // 32 bytes
    uint endTime;           // 32 bytes
    bool revealed;          // 1 byte  ┐
    bool ended;             // 1 byte  │ Packed into
    bool exists;            // 1 byte  │ same slot
    bool tokenVotingEnabled;// 1 byte  │
    bool tokenVotingRequired;// 1 byte ┘
    uint totalVotes;        // 32 bytes
    uint optionsCount;      // 32 bytes
}
```

#### 2. Batch Operations
```solidity
// ✅ GOOD: Add multiple voters in one transaction
function addVoters(uint pollId, address[] calldata voters) public {
    for(uint i = 0; i < voters.length; i++) {
        authorizedVoters[pollId][voters[i]] = true;
    }
}

// ❌ BAD: Would require N separate transactions
```

#### 3. calldata vs memory
```solidity
// ✅ GOOD: calldata for external functions (saves gas)
function createPoll(string calldata title, ...) external {
    // Implementation
}

// ❌ BAD: memory for external would copy data
```

#### 4. Short-Circuit Evaluation
```solidity
require(msg.sender == admin || msg.sender == owner, "Not authorized");
// ↑ Stops at first true condition
```

### Gas Cost Breakdown

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| Deploy ElectionsManager | ~2,800,000 | Main contract |
| Deploy TokenManager | ~1,500,000 | Token factory |
| Deploy VotingPaymaster | ~1,200,000 | Paymaster |
| Deploy VotingToken | ~800,000 | Per poll (if token enabled) |
| Create Poll (no token) | ~200,000 | Basic poll |
| Create Poll (with token) | ~1,000,000 | Includes token deployment |
| Add Option | ~100,000 | Per option |
| Add Voter | ~50,000 | Single voter |
| Add 10 Voters (batch) | ~200,000 | Batch operation |
| Vote (traditional) | ~80,000 | Voter pays |
| Vote (with token) | ~120,000 | Token burn included |
| Vote (gasless) | ~150,000 | Paymaster pays |
| Reveal Results | ~50,000 | One-time per poll |

---

## 🎨 Design Patterns

### 1. Proxy Pattern (UUPS)
**Purpose**: Upgradeable contracts without losing data
**Implementation**: ERC1967Proxy + UUPSUpgradeable

### 2. Factory Pattern
**Purpose**: Create multiple token contracts
**Implementation**: TokenManager creates VotingToken instances

### 3. Meta-Transaction Pattern
**Purpose**: Gasless voting
**Implementation**: EIP-712 signatures + VotingPaymaster

### 4. Access Control Pattern
**Purpose**: Role-based permissions
**Implementation**: onlyOwner, onlyAdminOrOwner modifiers

### 5. Checks-Effects-Interactions
**Purpose**: Prevent reentrancy
**Pattern**: Always validate → update state → external calls

```solidity
function voteInPoll(uint pollId, uint optionId) external {
    // 1. CHECKS
    require(polls[pollId].exists, "Poll does not exist.");
    require(!hasVoted[pollId][msg.sender], "Already voted.");

    // 2. EFFECTS
    hasVoted[pollId][msg.sender] = true;
    voterChoice[pollId][msg.sender] = optionId;
    options[pollId][optionId].votes += 1;

    // 3. INTERACTIONS
    emit Voted(pollId, msg.sender, optionId, VoteMethod.GasPayment);
}
```

### 6. Event Pattern
**Purpose**: Off-chain notification
**Implementation**: Production-grade indexed events

### 7. State Machine Pattern
**Purpose**: Poll lifecycle management
**States**: Not Started → Active → Ended → Revealed

---

## 📖 References

- [EIP-712: Typed Structured Data](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-1967: Proxy Storage Slots](https://eips.ethereum.org/EIPS/eip-1967)
- [UUPS Proxies](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)

---

**Version**: 2.0.0
**Last Updated**: 2026-02-12
**Author**: soralank
**Status**: Production-Ready ✅
