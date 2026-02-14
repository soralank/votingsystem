# Solidity Contracts Documentation

Comprehensive documentation for all smart contracts in the Voting System v4.0.

---

## Contract Overview

| Contract | Size | Purpose |
|----------|------|---------|
| **ElectionsManager.sol** | 23,932 bytes | Main voting contract with all features |
| **FranchiseManager.sol** | ~4,320 bytes | Sub-admin franchise system |
| **SecretBallotManager.sol** | ~4,500 bytes | Commit-reveal voting for secret ballot |
| **TokenIntegratedVoting.sol** | (base) | Token integration + infrastructure lock |
| **TokenManager.sol** | ~6,000 bytes | Per-poll ERC20 token factory |
| **VotingPaymaster.sol** | ~5,500 bytes | Gas sponsorship via EIP-712 |
| **VotingToken.sol** | ~3,500 bytes | Non-transferable burnable ERC20 |
| **TimeValidator.sol** | (base) | Time validation rules |
| **Ownable.sol** | (base) | Two-step ownership |

---

## Inheritance Hierarchy

```
Ownable.sol
  └── TimeValidator.sol
        └── TokenIntegratedVoting.sol
              └── ElectionsManager.sol

Standalone:
  - SecretBallotManager.sol (interacts with ElectionsManager via IElectionsManager interface)
  - FranchiseManager.sol (creates polls via ElectionsManager.createPoll)
  - TokenManager.sol (called by ElectionsManager)
  - VotingPaymaster.sol (calls ElectionsManager)
  - VotingToken.sol (created by TokenManager)
```

---

## 1. ElectionsManager.sol

**Inherits**: TokenIntegratedVoting → TimeValidator → Ownable

The main contract (~841 lines, 24,411 bytes). Handles poll creation, voter authorization, voting, results, and all trust features.

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `MAX_OPTIONS` | 100 | Max options per poll (DoS prevention) |
| `MAX_VOTERS_BATCH` | 50 | Max voters per batch operation |
| `REVEAL_DURATION` | 1 hour | Duration of reveal window for secret ballot |

### State Variables

```solidity
uint public pollsCount;
mapping(string => bool) public pollTitles;           // Prevent duplicate titles
mapping(uint => Poll) public polls;                  // Poll data
mapping(uint => mapping(uint => Option)) private options;  // PRIVATE: vote counts
mapping(uint => mapping(address => uint)) private voterChoice;  // PRIVATE: individual votes
mapping(uint => mapping(address => bool)) public hasVoted;
mapping(uint => mapping(address => bool)) public authorizedVoters;
mapping(uint => bool) public secretBallot;           // Trust: secret ballot flag
address public secretBallotMgr;                      // Trust: SBM address
```

### Key Functions

#### Poll Management
- **`createPoll(title, admin, startTime, durationSeconds, enableTokenVoting, requireTokenVoting)`** — Creates a new poll. Calls `_lockInfrastructure()` to permanently lock contract addresses. Only owner.
- **`addOptionToPoll(pollId, optionName)`** — Add voting option before poll starts. Admin or owner.
- **`addVoters(pollId, voters[])`** — Authorize voters in batch. Admin or owner.
- **`addVotersWithTokens(pollId, voters[], tokensPerVoter)`** — Authorize voters and allocate tokens. Admin or owner.
- **`removeVoter(pollId, voter)`** — Remove voter authorization before poll starts.

#### Voting (all reject secret ballot polls)
- **`voteInPoll(pollId, optionId)`** — Traditional vote (voter pays gas).
- **`voteInPollWithToken(pollId, optionId, voter)`** — Token vote (burns token).
- **`voteMultiChoice(pollId, optionIds[])`** — Multi-choice vote.
- **`voteQuadratic(pollId, optionIds[], amounts[])`** — Quadratic vote.
- **`voteAsDelegate(pollId, optionId, delegator)`** — Vote on behalf of delegator.

#### Trust Features
- **`enableSecretBallot(pollId)`** — Enable commit-reveal for a poll. Before start, admin/owner.
- **`setSecretBallotManager(address)`** — Set SBM address. Only before infrastructure lock.
- **`revealResults(pollId)`** — Reveal results. **Anyone** can call after endTime + buffer + REVEAL_DURATION.
- **`recordSecretVote(pollId, voter, optionId, isToken)`** — Callback from SBM only.
- **`burnTokenForCommit(pollId, voter)`** — Callback from SBM for token commits.
- **`setPollMetadata(pollId, uri)`** — Set IPFS metadata. Only before poll startTime.

#### View Functions (all require `revealed == true`)
- **`getOption(pollId, optionId)`** — Get option name and vote count.
- **`getVoterChoice(pollId, voter)`** — Get voter's choice.
- **`getWinner(pollId)`** — Get winning option.
- **`getVoterMultiChoices(pollId, voter)`** — Get multi-choice selections.
- **`getQuadraticVotes(pollId, voter, optionId)`** — Get quadratic allocation.

### Events

```solidity
event PollCreated(uint indexed pollId, string title, address indexed admin, uint startTime, uint endTime, bool tokenVotingEnabled, bool tokenVotingRequired);
event OptionAdded(uint indexed pollId, uint indexed optionId, string name);
event Voted(uint indexed pollId, address indexed voter, uint indexed optionId, VoteMethod method);
event ResultsRevealed(uint indexed pollId);
event VoterAuthorized(uint indexed pollId, address indexed voter);
event VoterUnauthorized(uint indexed pollId, address indexed voter);
event MultiChoiceConfigured(uint indexed pollId, uint maxChoices);
event VotedMultiChoice(uint indexed pollId, address indexed voter, uint[] optionIds, VoteMethod method);
event QuadraticVotingEnabled(uint indexed pollId);
event VotedQuadratic(uint indexed pollId, address indexed voter, uint[] optionIds, uint[] voteAmounts, uint totalCost);
event VoteDelegated(uint indexed pollId, address indexed delegator, address indexed delegatee);
event DelegationRemoved(uint indexed pollId, address indexed delegator, address indexed previousDelegatee);
event VotedAsDelegate(uint indexed pollId, address indexed delegate, address indexed delegator, uint optionId);
event PollMetadataSet(uint indexed pollId, string metadataURI);
event SecretBallotEnabled(uint indexed pollId);
event SecretBallotManagerSet(address indexed manager);
```

---

## 2. SecretBallotManager.sol

**Standalone** (interacts with ElectionsManager via `IElectionsManager` interface)

Handles the commit-reveal voting mechanism. Deployed separately to keep ElectionsManager under the 24KB contract size limit.

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `REVEAL_DURATION` | 1 hour | Reveal window duration |
| `TIME_BUFFER` | 30 seconds | Buffer between end and reveal start |

### State Variables

```solidity
IElectionsManager public electionsManager;
address public owner;
mapping(uint => mapping(address => bytes32)) private voteCommitments;  // PRIVATE
mapping(uint => mapping(address => bool)) public hasCommitted;
mapping(uint => mapping(address => bool)) public hasRevealed;
mapping(uint => uint) public commitCount;
mapping(uint => uint) public revealCount;
```

### Functions

- **`commitVote(pollId, commitHash)`** — Commit a vote hash during voting period. Validates: secret ballot enabled, voter authorized, poll active, not already committed.
- **`commitVoteWithToken(pollId, commitHash)`** — Commit + burn token at commit time via `ElectionsManager.burnTokenForCommit()`.
- **`revealVote(pollId, optionId, salt)`** — Reveal vote in the reveal window. Verifies `keccak256(pollId, optionId, salt, msg.sender) == stored hash`. Calls `ElectionsManager.recordSecretVote()`.
- **`isInCommitPhase(pollId)`** — Returns true if poll is currently active.
- **`isInRevealPhase(pollId)`** — Returns true if in `[endTime + buffer, endTime + buffer + REVEAL_DURATION]`.
- **`getRevealDeadline(pollId)`** — Returns `endTime + TIME_BUFFER + REVEAL_DURATION`.
- **`getSecretBallotStatus(pollId)`** — Returns (commits, reveals, isSecretBallot, inCommitPhase, inRevealPhase).

### Commitment Hash Format

```solidity
keccak256(abi.encodePacked(pollId, optionId, salt, voterAddress))
```

Frontend example:
```javascript
const salt = ethers.randomBytes(32);
const hash = ethers.solidityPackedKeccak256(
  ["uint256", "uint256", "bytes32", "address"],
  [pollId, optionId, salt, voterAddress]
);
await secretBallotManager.commitVote(pollId, hash);
```

### Events

```solidity
event VoteCommitted(uint indexed pollId, address indexed voter);
event VoteRevealed(uint indexed pollId, address indexed voter, uint indexed optionId);
```

---

## 3. FranchiseManager.sol

**Standalone** (creates polls via `ElectionsManager.createPoll`)

Manages time-limited sub-admin franchises. Franchise holders can create polls on behalf of the system owner, subject to configurable limits.

### Key Rules

- **1st poll free**, subsequent polls require ETH fee payment
- **Non-revocable**: Franchises end only by time expiry or poll exhaustion
- **Transferable**: Franchisee can request transfer (requires ETH fee + owner approval)
- **No extensions**: Cannot increase max polls or extend time after grant
- **No sub-franchises**: Franchisees cannot create sub-franchises
- **Max 100 polls** per franchise

### State Variables

```solidity
uint public franchiseCount;                           // Total franchises ever granted
uint public transferFee;                              // ETH fee for franchise transfers
mapping(uint => Franchise) public franchises;         // franchiseId => Franchise
mapping(address => uint) public franchiseeToId;       // franchisee address => active ID
mapping(uint => TransferRequest) public transferRequests;  // pending transfer requests
```

### Franchise Struct

```solidity
struct Franchise {
    address franchisee;    // Current franchise holder
    uint expiresAt;        // Unix timestamp when franchise expires
    uint maxPolls;         // Maximum polls allowed (1-100)
    uint pollsUsed;        // Polls created so far
    uint feePerPoll;       // ETH fee per poll (first poll always free)
}
```

### Key Functions

- **`grantFranchise(franchisee, durationSeconds, maxPolls, feePerPoll)`** — Owner grants a new franchise. Emits `FranchiseGranted`.
- **`createFranchisePoll(title, startTime, duration, enableTokenVoting, requireTokenVoting)`** — Franchisee creates a poll (1st free, fee required after). Emits `FranchisePollCreated`.
- **`requestTransfer(franchiseId, newFranchisee)`** — Franchisee requests transfer (must pay transfer fee). Emits `TransferRequested`.
- **`approveTransfer(franchiseId)`** — Owner approves pending transfer. Emits `TransferApproved`.
- **`rejectTransfer(franchiseId)`** — Owner rejects transfer (refunds fee). Emits `TransferRejected`.
- **`withdrawFees()`** — Owner withdraws accumulated fees. Emits `FeesWithdrawn`.
- **`setTransferFee(fee)`** — Owner sets transfer fee. Emits `TransferFeeSet`.
- **`getFranchise(id)`** — View: returns franchise details + `expired` and `exhausted` booleans.
- **`isFranchiseActive(id)`** — View: returns true if franchise is not expired and not exhausted.
- **`remainingPolls(id)`** — View: returns remaining polls (0 if expired).

---

## 4. TokenIntegratedVoting.sol

**Inherits**: TimeValidator → Ownable

Integration layer connecting the token system to the voting logic. Also implements the **infrastructure lock**.

### Key State Variables

```solidity
TokenManager public tokenManager;
VotingPaymaster public votingPaymaster;
bool public infrastructureLocked;        // Trust: permanent lock
address public owner;
address public pendingOwner;
```

### Key Functions

- **`setTokenManager(address)`** — Set token manager. Requires `!infrastructureLocked`.
- **`setVotingPaymaster(address)`** — Set paymaster. Requires `!infrastructureLocked`.
- **`lockInfrastructure()`** — External lock function. Also called internally by `_lockInfrastructure()`.
- **`_lockInfrastructure()`** — Internal. Called by `createPoll()` in ElectionsManager. Sets `infrastructureLocked = true` permanently.
- **`transferOwnership(newOwner)`** — Initiate two-step transfer.
- **`acceptOwnership()`** — Accept pending ownership.

### Events

```solidity
event TokenManagerSet(address indexed tokenManager);
event PaymasterSet(address indexed paymaster);
event InfrastructureLocked();
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
```

---

## 5. TokenManager.sol

Manages per-poll ERC20 voting tokens. Called by ElectionsManager.

### Functions

- **`createPollToken(pollId, name, symbol)`** — Deploy new VotingToken for a poll.
- **`allocateTokens(pollId, voter, amount)`** — Mint tokens to voter.
- **`batchAllocateTokens(pollId, voters[], amounts[])`** — Batch allocation.
- **`burnTokensForVote(pollId, voter)`** — Burn 1 token (called during voting).
- **`burnTokens(pollId, voter, amount)`** — Burn arbitrary amount (quadratic voting).
- **`hasVoteTokens(pollId, voter)`** — Check if voter has >= 1 token.
- **`getTokenBalance(pollId, voter)`** — Get token balance.
- **`getPollToken(pollId)`** — Get token contract address.

### Events

```solidity
event TokenCreated(uint256 indexed pollId, address indexed tokenAddress, string name, string symbol);
```

---

## 6. VotingPaymaster.sol

Sponsors gas fees for voters via EIP-712 meta-transactions.

### Functions

- **`fund()`** — Fund paymaster with ETH (payable).
- **`withdraw(amount)`** — Withdraw unused ETH.
- **`executeVoteWithToken(pollId, optionId, voter, deadline, v, r, s)`** — Verify EIP-712 signature and execute gasless vote.
- **`verifySignature(...)`** — Verify and recover signer from EIP-712 signature.
- **`addRelayer(address)`** — Add trusted relayer.
- **`removeRelayer(address)`** — Remove relayer.
- **`nonces(address)`** — Get current nonce for voter (replay prevention).

### EIP-712 Domain

```solidity
EIP712Domain {
    name: "VotingPaymaster",
    version: "1",
    chainId: block.chainid,
    verifyingContract: address(this)
}
```

---

## 7. VotingToken.sol

Per-poll non-transferable burnable ERC20 token.

### Characteristics
- **Soulbound**: `transfer()` always reverts
- **Burnable**: Only via `transferFrom` to `address(0)` (used by TokenManager)
- **Approvable**: Standard `approve()` / `allowance()` for paymaster integration
- **Minting**: Only by TokenManager (the creator)

### Functions
Standard ERC20 view functions (`name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`) plus:
- **`approve(spender, amount)`** — Standard approve
- **`transfer(to, amount)`** — Always reverts (non-transferable)
- **`transferFrom(from, to, amount)`** — Only works when `to == address(0)` (burn)
- **`mint(to, amount)`** — Only callable by TokenManager

---

## 8. TimeValidator.sol

Enforces time-based rules for poll creation.

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `MIN_POLL_DURATION` | 300 seconds (5 min) | Minimum poll duration |
| `MAX_FUTURE_START` | 30 days | Maximum future start time |
| `TIME_BUFFER` | 30 seconds | Buffer for blockchain time variance |

### Functions

- **`_validateTimeRange(startTime, durationSeconds)`** — Internal. Validates start time and duration constraints.

---

## 9. Ownable.sol

Two-step ownership management.

### Functions
- **`transferOwnership(newOwner)`** — Set `pendingOwner`.
- **`acceptOwnership()`** — `pendingOwner` accepts and becomes `owner`.

---

## Modifiers

| Modifier | Contract | Purpose |
|----------|----------|---------|
| `onlyOwner` | TokenIntegratedVoting | Restrict to contract owner |
| `onlyAdminOrOwner(pollId)` | ElectionsManager | Restrict to poll admin or owner |
| `nonReentrant` | TokenIntegratedVoting | Prevent reentrancy attacks |

---

## Error Messages (Key Trust-Related)

| Error | Context |
|-------|---------|
| `"Infra locked"` | setTokenManager/setVotingPaymaster/setSecretBallotManager after lock |
| `"Secret ballot: use SBM"` | Direct vote on secret ballot poll |
| `"Poll not revealed"` | View functions before reveal |
| `"Poll not ended"` | revealResults before endTime + buffer |
| `"Reveal window active"` | revealResults during reveal window |
| `"Only SBM"` | recordSecretVote/burnTokenForCommit from non-SBM address |
| `"Poll already started"` | setPollMetadata after startTime |
| `"Secret ballot not enabled."` | commitVote on non-secret-ballot poll |
| `"Not in reveal period."` | revealVote outside reveal window |
| `"Invalid reveal: hash mismatch."` | Wrong optionId or salt during reveal |

See [docs/ERROR_CODES.md](./docs/ERROR_CODES.md) for the complete list of 56+ error codes.

---

## Gas Optimization Techniques

- **`viaIR: true`** with optimizer runs=100 (keeps ElectionsManager under 24KB)
- **Storage packing**: Bool fields in Poll struct packed into same slot
- **`calldata`** for external function parameters
- **Batch operations**: `addVoters`, `addVotersWithTokens`, `batchAllocateTokens`
- **Short-circuit evaluation**: `require(A || B)` stops at first true
- **Private mappings**: `options`, `voterChoice` use `private` visibility

---

## Security Considerations

- **Reentrancy**: `nonReentrant` modifier on all state-changing voting functions + CEI pattern
- **Access Control**: Owner, Admin, Voter roles with strict permission checks
- **Infrastructure Lock**: Prevents swapping critical contracts after first poll
- **Commit-Reveal**: Prevents vote front-running and premature disclosure
- **Time Validation**: Minimum duration, maximum future start, buffer periods
- **DoS Prevention**: Limits on options (100) and batch sizes (50)
- **Two-Step Ownership**: Prevents accidental ownership transfer
- **No Admin Bypass**: View functions require `revealed == true` for everyone

---

**Version**: 4.0.0
**Solidity**: ^0.8.20 (compiled with 0.8.28)
**Optimizer**: 100 runs, viaIR enabled
