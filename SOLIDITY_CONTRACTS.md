# Solidity Contract Reference

**Voting System v4.1** | **Compiler:** Solidity 0.8.28 | **Optimizer:** 100 runs, viaIR enabled

This document is the authoritative technical reference for every contract in the system. For design rationale, threat model, and economic model, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Inheritance & Deployment Topology

```
INHERITANCE CHAIN
─────────────────
  TimeValidator.sol
        │
  TokenIntegratedVoting.sol
        │
  ElectionsManager.sol
        │
  Voting.sol  ← deployment entry point


AUTO-DEPLOYED MODULES (constructor of ElectionsManager)
───────────────────────────────────────────────────────
  MultiChoiceVoting.sol     QuadraticVoting.sol
  DelegationVoting.sol      MetadataVoting.sol


STANDALONE CONTRACTS (deployed separately, linked via interfaces)
────────────────────────────────────────────────────────────────
  SecretBallotManager.sol   FranchiseManager.sol
  TokenManager.sol          VotingPaymaster.sol
  VotingToken.sol           VotingReader.sol
```

> `Ownable.sol` exists in the repository but is **deprecated and unused**. Ownership is implemented directly in `TokenIntegratedVoting.sol`.

---

## 1. ElectionsManager.sol

**Inherits:** TokenIntegratedVoting → TimeValidator
**Size:** ~23,932 bytes (near the 24,576-byte EIP-170 limit)

The core contract. Manages poll lifecycle, voter authorisation, voting (5 methods), result revelation, and orchestrates all module contracts.

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `MAX_OPTIONS` | 100 | Maximum options per poll (DoS prevention) |
| `MAX_VOTERS_BATCH` | 50 | Maximum voters per batch operation |

### State

```solidity
uint public pollsCount;

// Duplicate prevention
mapping(string => bool) public pollTitles;
mapping(uint => mapping(string => bool)) public pollOptionNames;

// Poll data
mapping(uint => Poll) public polls;
mapping(uint => mapping(uint => Option)) private options;         // vote counts (private)
mapping(uint => mapping(address => uint)) private voterChoice;    // individual votes (private)
mapping(uint => mapping(address => bool)) public hasVoted;
mapping(uint => mapping(address => bool)) public authorizedVoters;
mapping(uint256 => mapping(address => VoteMethod)) public voteMethod;

// Per-poll infrastructure
mapping(uint => address) public pollTokenManager;
mapping(uint => address) public pollVotingPaymaster;

// Trust features
mapping(uint => bool) public secretBallot;
mapping(uint => bool) public delegationEnabled;
address public secretBallotMgr;
address public franchiseMgr;

// Module contracts (auto-deployed)
MultiChoiceVoting public multiChoiceVoting;
QuadraticVoting public quadraticVoting;
DelegationVoting public delegationVoting;
MetadataVoting public metadataVoting;
```

> **Privacy note:** `options` and `voterChoice` are `private` to prevent access from other contracts. This does **not** encrypt data on-chain; raw values are readable via `eth_getStorageAt`. See [ARCHITECTURE.md §4.4](./ARCHITECTURE.md) for the full privacy disclosure.

### Poll Struct

```solidity
struct Poll {
    string title;
    address admin;
    uint startTime;              // Unix timestamp (UTC)
    uint endTime;                // Computed: startTime + durationSeconds
    bool revealed;
    bool ended;
    uint totalVotes;
    uint optionsCount;
    bool exists;
    bool tokenVotingEnabled;
    bool tokenVotingRequired;
}
```

### Functions — Poll Management

| Function | Access | Description |
|----------|--------|-------------|
| `createPoll(title, admin, startTime, durationSeconds, enableTokenVoting, requireTokenVoting, customTokenManager, customVotingPaymaster)` | Owner or FranchiseManager | Creates a poll. Locks infrastructure on first call. Pass `address(0)` for custom managers to use global defaults. |
| `addOptionToPoll(pollId, name)` | Admin or Owner | Add a voting option. Before start only. Rejects duplicate names. |
| `addVoter(pollId, voter)` | Admin or Owner | Authorise a single voter. Before start only. |
| `addVoters(pollId, voters[])` | Admin or Owner | Batch authorise (max 50). Before start only. Skips duplicates silently. |
| `addVotersWithTokens(pollId, voters[], tokensPerVoter)` | Admin or Owner | Authorise + allocate tokens. Before start only. |
| `removeVoter(pollId, voter)` | Admin or Owner | Revoke authorisation. Before start only. Cannot remove voters who already voted. |

### Functions — Voting

All 5 vote functions reject secret ballot polls (must use SecretBallotManager commit-reveal flow).

| Function | Access | Description |
|----------|--------|-------------|
| `voteInPoll(pollId, optionId)` | Authorised Voter | Traditional vote. Voter pays gas. Reverts if `tokenVotingRequired == true`. |
| `voteInPollWithToken(pollId, optionId, voter)` | Voter or Paymaster | Token vote. Burns 1 token. Callable by voter directly or by paymaster on voter's behalf. |
| `voteMultiChoice(pollId, optionIds[])` | Authorised Voter | Multi-choice vote. Requires `setMaxChoices()` configured. Reverts if `tokenVotingRequired == true`. |
| `voteQuadratic(pollId, optionIds[], voteAmounts[])` | Authorised Voter | Quadratic vote. Cost = Σ(voteAmounts[i]²) tokens. Requires token-enabled poll. |
| `voteAsDelegate(pollId, optionId, delegator)` | Delegate | Vote on behalf of delegator. Requires delegation enabled and active delegation. |

### Functions — Trust & Configuration

| Function | Access | Description |
|----------|--------|-------------|
| `enableSecretBallot(pollId)` | Admin or Owner | Enable commit-reveal. Before start only. Requires `secretBallotMgr` to be set. |
| `setRevealDuration(pollId, duration)` | Admin or Owner | Set per-poll reveal duration (forwards to SBM). Min 1 minute; 0 = use default. |
| `setDefaultRevealDuration(duration)` | Owner | Set global default reveal duration (forwards to SBM). Min 1 minute. |
| `enableDelegation(pollId)` | Admin or Owner | Enable vote delegation. Before start only. Incompatible with token-enabled polls. |
| `setMaxChoices(pollId, maxChoices)` | Admin or Owner | Configure multi-choice (min 2). Before start only. |
| `enableQuadraticVoting(pollId)` | Admin or Owner | Enable quadratic voting. Requires token-enabled poll. Before start only. |
| `setPollMetadata(pollId, uri)` | Admin or Owner | Set IPFS metadata URI. Before start only. |
| `setSecretBallotManager(addr)` | Owner | Set SBM address. Before infrastructure lock only. |
| `setFranchiseManager(addr)` | Owner | Set franchise manager. Before infrastructure lock only. |
| `revealResults(pollId)` | **Anyone** | Reveal results after `endTime + TIME_BUFFER` (standard) or `endTime + TIME_BUFFER + revealDuration` (secret ballot). |
| `changePollAdmin(pollId, newAdmin)` | Admin, Owner, or FranchiseManager | Transfer poll admin. FranchiseManager can only change admin of polls it created. |

### Functions — View

| Function | Returns | Access Restriction |
|----------|---------|-------------------|
| `getOption(pollId, optionId)` | `(id, name, votes)` | Vote count is 0 until `revealed == true` |
| `getVoterChoice(pollId, voter)` | `uint optionId` | Requires `revealed == true` |
| `getWinner(pollId)` | `(optionId, name, votes)` | Requires `revealed == true` |
| `getVoterMultiChoices(pollId, voter)` | `uint[] optionIds` | Requires `revealed == true` |
| `getQuadraticVotes(pollId, voter, optionId)` | `uint votes` | Requires `revealed == true` |
| `getPollStatus(pollId)` | `(started, active, ended, revealed)` | Public |
| `getDelegationInfo(pollId, voter)` | `(delegatee, isDelegated, delegationsReceived)` | Public |
| `getPollMetadata(pollId)` | `string metadataURI` | Public |

### Events

```solidity
event PollCreated(uint indexed pollId, string title, address indexed admin,
                  uint startTime, uint endTime, bool tokenVotingEnabled, bool tokenVotingRequired);
event OptionAdded(uint indexed pollId, uint indexed optionId, string name);
event Voted(uint indexed pollId, address indexed voter, uint indexed optionId, VoteMethod method);
event ResultsRevealed(uint indexed pollId);
event VoterAuthorized(uint indexed pollId, address indexed voter);
event VoterUnauthorized(uint indexed pollId, address indexed voter);
event VotedMultiChoice(uint indexed pollId, address indexed voter, uint[] optionIds, VoteMethod method);
event PollMetadataSet(uint indexed pollId, string metadataURI);
event SecretBallotEnabled(uint indexed pollId);
event SecretBallotManagerSet(address indexed manager);
event FranchiseManagerSet(address indexed manager);
event DelegationEnabled(uint indexed pollId);
event PollAdminChanged(uint indexed pollId, address indexed oldAdmin, address indexed newAdmin);
```

Module events (`MultiChoiceConfigured`, `QuadraticVotingEnabled`, `VotedQuadratic`, `VoteDelegated`, `DelegationRemoved`, `VotedAsDelegate`) are emitted by the respective module contracts, not by ElectionsManager.

---

## 2. SecretBallotManager.sol

**Standalone.** Deployed separately due to the 24 KB contract size limit.
Handles commit-reveal voting via the `IElectionsManager` interface.

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `TIME_BUFFER` | 30 seconds | Buffer between poll end and reveal start (matches TimeValidator) |
| `MIN_REVEAL_DURATION` | 1 minute | Minimum configurable reveal duration |

### State

```solidity
IElectionsManager public electionsManager;
address public owner;
uint public defaultRevealDuration = 1 hours;
mapping(uint => uint) public pollRevealDuration;        // 0 = use default
mapping(uint => mapping(address => bytes32)) private voteCommitments;
mapping(uint => mapping(address => bool)) public hasCommitted;
mapping(uint => mapping(address => bool)) public hasRevealed;
mapping(uint => uint) public commitCount;
mapping(uint => uint) public revealCount;
```

### Commitment Hash

```solidity
keccak256(abi.encodePacked(pollId, optionId, salt, voterAddress))
```

The `optionId` is **never** sent during commit — only the hash. The actual vote is hidden until reveal.

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `commitVote(pollId, commitHash)` | Authorised Voter | Submit hash during voting period. Reverts if `tokenVotingRequired`. |
| `commitVoteWithToken(pollId, commitHash)` | Authorised Voter | Submit hash + burn token at commit time (prevents double-commit). |
| `revealVote(pollId, optionId, salt)` | Committer | Reveal during the window `[endTime + TIME_BUFFER, endTime + TIME_BUFFER + revealDuration]`. Calls `electionsManager.recordSecretVote()`. |
| `setDefaultRevealDuration(duration)` | Owner or EM | Global default. Min 1 minute. |
| `setRevealDuration(pollId, duration)` | Owner or EM | Per-poll override. 0 = use default. Before poll start only. |
| `getRevealDuration(pollId)` | Public | Returns effective duration (custom if set, else default). |
| `isInCommitPhase(pollId)` | Public | True if poll is active. |
| `isInRevealPhase(pollId)` | Public | True if in reveal window. |
| `getRevealDeadline(pollId)` | Public | `endTime + TIME_BUFFER + revealDuration`. |
| `getSecretBallotStatus(pollId)` | Public | Returns (commits, reveals, isSecretBallot, inCommitPhase, inRevealPhase). |

### Events

```solidity
event VoteCommitted(uint indexed pollId, address indexed voter);
event VoteRevealed(uint indexed pollId, address indexed voter, uint indexed optionId);
```

---

## 3. FranchiseManager.sol

**Standalone.** Creates polls via `ElectionsManager.createPoll()`.

### Design Rules

- First poll is free; subsequent polls cost `feePerPoll` in ETH
- Franchises are **irrevocable** — they end only by: time expiry, poll exhaustion, or supersede
- Owner can add polls to an active franchise (up to 100 cap) but **cannot extend time**
- Franchisees cannot create sub-franchises
- Transfer requires ETH fee + owner approval; `pendingRefunds` tracking prevents owner from draining deposits

### Franchise Struct

```solidity
struct Franchise {
    address franchisee;
    uint256 expiresAt;
    uint256 maxPolls;           // 1–100
    uint256 pollsUsed;
    uint256 feePerPoll;         // wei (charged from 2nd poll onward)
    address tokenManager;       // custom or address(0) for global
    address votingPaymaster;    // custom or address(0) for global
}
```

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `grantFranchise(franchisee, durationSeconds, maxPolls, feePerPoll, tokenManager, votingPaymaster)` | Owner | Grant franchise. Supersedes any existing franchise for the same address. |
| `addPolls(franchiseId, additionalPolls)` | Owner | Increase maxPolls on active franchise (capped at 100). |
| `createFranchisePoll(title, startTime, durationSeconds, enableTokenVoting, requireTokenVoting)` | Franchisee | Create poll (1st free, fee required after). Excess ETH refunded. |
| `requestTransfer(franchiseId, newFranchisee)` | Franchisee | Pay `transferFee` and request transfer. |
| `approveTransfer(franchiseId)` | Owner | Approve pending transfer. Transfers admin of all franchise polls. |
| `rejectTransfer(franchiseId)` | Owner | Reject and refund transfer fee. |
| `withdrawFees()` | Owner | Withdraw accumulated fees (`balance - pendingRefunds`). |
| `setTransferFee(fee)` | Owner | Set transfer fee in wei. |

### Events

```solidity
event FranchiseGranted(uint256 indexed franchiseId, address indexed franchisee,
                       uint256 expiresAt, uint256 maxPolls, uint256 feePerPoll);
event FranchisePollCreated(uint256 indexed franchiseId, uint256 indexed pollId, uint256 feePaid);
event TransferRequested(uint256 indexed franchiseId, address indexed from,
                        address indexed to, uint256 feePaid);
event TransferApproved(uint256 indexed franchiseId, address indexed oldFranchisee,
                       address indexed newFranchisee);
event TransferRejected(uint256 indexed franchiseId);
event FranchiseSuperseded(uint256 indexed oldFranchiseId, uint256 indexed newFranchiseId,
                          address indexed franchisee);
event PollsAdded(uint256 indexed franchiseId, uint256 additionalPolls, uint256 newMaxPolls);
event FeesWithdrawn(address indexed to, uint256 amount);
event PollAdminTransferFailed(uint256 indexed pollId);
```

---

## 4. Module Contracts

Auto-deployed by ElectionsManager's constructor. Each is owned by ElectionsManager and accepts calls only via the `onlyElectionsManager` modifier.

### 4a. MultiChoiceVoting.sol

```solidity
mapping(uint => uint) public pollMaxChoices;
mapping(uint => mapping(address => uint[])) private voterMultiChoices;
```

| Function | Description |
|----------|-------------|
| `configureMultiChoice(pollId, maxChoices, optionsCount)` | Configure max selections (min 2). |
| `recordMultiChoiceVote(pollId, voter, optionIds, optionsCount)` | Validate choices (no duplicates) and record. |
| `getVoterMultiChoices(pollId, voter)` | Return voter's selections. |

### 4b. QuadraticVoting.sol

```solidity
mapping(uint => bool) public quadraticVotingEnabled;
mapping(uint => mapping(address => mapping(uint => uint))) public quadraticVoteAllocation;
mapping(uint => mapping(address => uint)) public quadraticTokensSpent;
```

| Function | Description |
|----------|-------------|
| `setQuadraticVotingEnabled(pollId, enabled)` | Toggle quadratic voting. |
| `recordQuadraticVotes(pollId, voter, optionIds, voteAmounts, optionsCount)` | Validate, compute cost (Σ v²), record. Returns `(totalCost, totalVotes)`. |
| `getQuadraticVotes(pollId, voter, optionId)` | Return vote allocation. |

### 4c. DelegationVoting.sol

```solidity
mapping(uint => mapping(address => address)) public voteDelegation;
mapping(uint => mapping(address => uint)) public delegationCount;
mapping(uint => mapping(address => bool)) public hasDelegated;
```

| Function | Description |
|----------|-------------|
| `recordDelegation(pollId, delegator, delegatee)` | Record delegation. Prevents self-delegation and chain delegation. |
| `removeDelegation(pollId, delegator)` | Remove active delegation. |
| `recordDelegateVote(pollId, delegate, delegator, optionId)` | Validate delegation and emit event. |
| `getDelegationInfo(pollId, voter)` | Return `(delegatee, isDelegated, delegationsReceived)`. |

### 4d. MetadataVoting.sol

```solidity
mapping(uint => string) public pollMetadataURI;
```

| Function | Description |
|----------|-------------|
| `setPollMetadata(pollId, metadataURI)` | Store IPFS URI. Rejects empty strings. |
| `getPollMetadata(pollId)` | Return URI. |

---

## 5. TokenIntegratedVoting.sol

**Inherits:** TimeValidator

Integration layer that connects the token system and implements infrastructure locking and ownership.

### Key State

```solidity
TokenManager public tokenManager;
VotingPaymaster public votingPaymaster;
bool public infrastructureLocked;    // Permanent after first poll
address public owner;
address public pendingOwner;
```

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `setTokenManager(addr)` | Owner | Set TokenManager. Reverts if `infrastructureLocked`. |
| `setVotingPaymaster(addr)` | Owner | Set Paymaster. Reverts if `infrastructureLocked`. |
| `lockInfrastructure()` | Owner | Manual lock. Also called automatically by `createPoll()`. |
| `configureTokenVoting(pollId, enabled, tokenRequired, tokensPerVoter, allowGaslessVoting)` | Owner | Configure token settings for a poll. |
| `allocateVotingTokens(pollId, voters[], amounts[])` | Owner | Allocate tokens. 3 modes: empty=default, single=uniform, full=per-voter. |
| `voteInPollWithToken(pollId, optionId, voter)` | Virtual | Base implementation. Overridden by ElectionsManager. |
| `transferOwnership(newOwner)` | Owner | Step 1: set `pendingOwner`. |
| `acceptOwnership()` | Pending Owner | Step 2: become owner. |
| `cancelOwnershipTransfer()` | Owner | Cancel pending transfer. |
| `renounceOwnership()` | Owner | Permanently remove owner. |

---

## 6. TokenManager.sol

Factory for per-poll ERC20 voting tokens. Called by ElectionsManager.

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `createPollToken(pollId, name, symbol)` | Voting Contract | Deploy a new `VotingToken`. |
| `allocateTokens(pollId, voter, amount)` | Voting Contract | Mint tokens to a voter. |
| `batchAllocateTokens(pollId, voters[], amounts[])` | Voting Contract | Batch mint. |
| `burnTokensForVote(pollId, voter)` | Voting Contract | Burn 1 token (standard vote). |
| `burnTokens(pollId, voter, amount)` | Voting Contract | Burn N tokens (quadratic vote). |
| `hasVoteTokens(pollId, voter)` | Public | Check ≥ 1 token. |
| `getTokenBalance(pollId, voter)` | Public | Get token balance. |
| `getPollToken(pollId)` | Public | Get token contract address. |

---

## 7. VotingPaymaster.sol

Gas sponsorship via EIP-712 meta-transactions.

### EIP-712 Domain

```solidity
EIP712Domain {
    name: "VotingPaymaster",
    version: "1",
    chainId: block.chainid,
    verifyingContract: address(this)
}
```

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `fund()` | Anyone (payable) | Deposit ETH for gas sponsorship. |
| `withdraw(amount)` | Admin | Withdraw ETH. |
| `executeVoteWithToken(pollId, optionId, voter, deadline, v, r, s)` | Relayer | Verify EIP-712 sig, increment nonce, forward vote. Gas limit: 200,000. |
| `verifySignature(pollId, optionId, voter, deadline, v, r, s)` | Public | Verify and recover signer. Rejects malleable signatures. |
| `addRelayer(addr)` / `removeRelayer(addr)` | Admin | Manage relayer whitelist. |
| `setRelayerWhitelistEnabled(enabled)` | Admin | Toggle whitelist enforcement. |
| `transferAdmin(newAdmin)` | Admin | Transfer admin rights. |

---

## 8. VotingToken.sol

Per-poll soulbound ERC20 token.

| Property | Value |
|----------|-------|
| Decimals | 0 (whole units) |
| Transferable | **No** — `transfer()` always reverts |
| Burnable | Only via TokenManager (`burn()` restricted to `onlyTokenManager`) |
| Creator | TokenManager (set as `tokenManager` in constructor) |

Standard ERC20 view functions (`name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`) plus `approve()` and `allowance()` for paymaster integration.

---

## 9. VotingReader.sol

Read-only aggregator deployed alongside the voting system. Provides single-call access to data spread across ElectionsManager and its modules. Holds no state.

### Functions

| Function | Returns |
|----------|---------|
| `isQuadraticVotingEnabled(pollId)` | `bool` |
| `getPollMaxChoices(pollId)` | `uint` |
| `isDelegationEnabled(pollId)` | `bool` |
| `isDelegated(pollId, voter)` | `bool` |
| `getDelegatee(pollId, voter)` | `address` |
| `getPollFeatures(pollId)` | `(isQuadratic, maxChoices, isDelegation, isSecret, started, active, ended, revealed)` |
| `getVoterStatus(pollId, voter)` | `(authorized, voted, delegated, delegatee, votedWithToken)` |

---

## 10. TimeValidator.sol

Time validation rules inherited by all voting contracts.

| Constant | Value | Purpose |
|----------|-------|---------|
| `MIN_POLL_DURATION` | 300 seconds (5 min) | Minimum poll duration |
| `MAX_FUTURE_START` | 30 days (2,592,000 s) | Maximum future start time |
| `TIME_BUFFER` | 30 seconds | Buffer for block timestamp variance |

### Internal Functions

| Function | Description |
|----------|-------------|
| `_validateTimeRange(startTime, duration)` | Validate start not in past, not too far future, duration ≥ 5 min |
| `_isWithinVotingPeriod(startTime, endTime)` | `block.timestamp ≥ startTime && block.timestamp + 30 ≤ endTime` |
| `_hasStarted(startTime)` | `block.timestamp ≥ startTime` |
| `_hasEnded(endTime)` | `block.timestamp ≥ endTime + 30` |

---

## Modifiers Reference

| Modifier | Contract | Restricts To |
|----------|----------|-------------|
| `onlyOwner` | TokenIntegratedVoting | Contract owner |
| `onlyAdminOrOwner(pollId)` | ElectionsManager | Poll admin or contract owner |
| `nonReentrant` | TokenIntegratedVoting, FranchiseManager | Prevents reentrancy |
| `onlyVotingContract` | TokenManager, VotingPaymaster | ElectionsManager only |
| `onlyElectionsManager` | All 4 module contracts | ElectionsManager only |
| `onlyAdmin` | VotingPaymaster | Paymaster admin |
| `onlyOwnerOrElectionsManager` | SecretBallotManager | Owner or ElectionsManager |

---

## Gas Optimization Techniques

| Technique | Where Applied |
|-----------|---------------|
| `viaIR: true` with 100 runs | Hardhat config — minimises bytecode size |
| `calldata` parameters | All external functions |
| Batch operations | `addVoters`, `addVotersWithTokens`, `batchAllocateTokens` |
| Private mappings | `options`, `voterChoice` — reduces ABI surface |
| Short-circuit `require` | `require(A \|\| B)` evaluations |
| Struct packing | Bool fields in `Poll` share storage slots |

---

**Version:** 4.1.0 | **Solidity:** ^0.8.20 (compiled with 0.8.28) | **License:** LicenseRef-ANKIT-SORAL
