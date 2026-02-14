# Frontend Integration Guide — Voting System v4.1

Complete guide for frontend developers to integrate with the blockchain voting system smart contracts.

---

## Table of Contents

- [System Overview](#system-overview)
- [Contract Addresses & ABIs](#contract-addresses--abis)
- [Architecture: Modular Composition](#architecture-modular-composition)
- [Connection Setup (ethers.js)](#connection-setup-ethersjs)
- [Complete User Flows](#complete-user-flows)
  - [1. Create a Poll](#1-create-a-poll)
  - [2. Configure a Poll](#2-configure-a-poll)
  - [3. Authorize Voters](#3-authorize-voters)
  - [4. Traditional Voting](#4-traditional-voting)
  - [5. Token-Based Voting](#5-token-based-voting)
  - [6. Gasless Voting (Meta-Transactions)](#6-gasless-voting-meta-transactions)
  - [7. Multi-Choice Voting](#7-multi-choice-voting)
  - [8. Quadratic Voting](#8-quadratic-voting)
  - [9. Vote Delegation](#9-vote-delegation)
  - [10. Secret Ballot (Commit-Reveal)](#10-secret-ballot-commit-reveal)
  - [11. Reveal Results](#11-reveal-results)
  - [12. Franchise System](#12-franchise-system)
- [Reading Poll Data (View Functions)](#reading-poll-data-view-functions)
- [Event Listening & Filtering](#event-listening--filtering)
- [Per-Poll Managers](#per-poll-managers)
- [Error Handling](#error-handling)
- [Time & Timezone Handling](#time--timezone-handling)
- [Access Control Matrix](#access-control-matrix)
- [Complete Function Reference](#complete-function-reference)
- [Subgraph (GraphQL) Queries](#subgraph-graphql-queries)

---

## System Overview

The voting system consists of **12 contracts** deployed together:

| Contract | Role | Interaction |
|----------|------|-------------|
| **ElectionsManager** | Main contract — polls, voting, results | Direct calls from frontend |
| **TokenManager** | Per-poll ERC20 token factory | Called internally by ElectionsManager |
| **VotingPaymaster** | Gas sponsorship (gasless voting) | Called by relayer for gasless votes |
| **SecretBallotManager** | Commit-reveal voting | Called by voter for secret ballots |
| **FranchiseManager** | Sub-admin franchise system | Called by owner/franchisee |
| **VotingToken** | Per-poll soulbound ERC20 | Created automatically per poll |
| **MultiChoiceVoting** | Multi-choice vote state | Auto-deployed by ElectionsManager |
| **QuadraticVoting** | Quadratic vote state | Auto-deployed by ElectionsManager |
| **DelegationVoting** | Delegation state | Auto-deployed by ElectionsManager |
| **MetadataVoting** | IPFS metadata state | Auto-deployed by ElectionsManager |
| **TokenIntegratedVoting** | Base layer (inherited) | Not called directly |
| **TimeValidator** | Time rules (inherited) | Not called directly |

### What the Frontend Calls Directly

- **ElectionsManager** — 90% of interactions (create poll, vote, read data)
- **SecretBallotManager** — For secret ballot commit/reveal
- **VotingPaymaster** — For gasless voting (relayer calls this)
- **FranchiseManager** — For franchise management
- **TokenManager** — For reading token balances (view only)

### The Module Contracts (internal)

The 4 module contracts are **auto-deployed by ElectionsManager's constructor** and hold state for advanced features. The frontend does NOT need to call them directly — ElectionsManager exposes wrapper functions. However, their addresses are accessible if needed:

```javascript
const multiChoiceAddr = await electionsManager.multiChoiceVoting();
const quadraticAddr = await electionsManager.quadraticVoting();
const delegationAddr = await electionsManager.delegationVoting();
const metadataAddr = await electionsManager.metadataVoting();
```

---

## Contract Addresses & ABIs

After deployment with Hardhat Ignition, addresses are in:

```
ignition/deployments/chain-<chainId>/deployed_addresses.json
```

Example:
```json
{
  "GaslessVotingModule#ElectionsManager": "0x5FbDB...",
  "GaslessVotingModule#TokenManager": "0x9fE46...",
  "GaslessVotingModule#VotingPaymaster": "0xe7f17...",
  "GaslessVotingModule#SecretBallotManager": "0xCf7Ed...",
  "GaslessVotingModule#FranchiseManager": "0xDc64a..."
}
```

ABIs are in:
```
ignition/deployments/chain-<chainId>/artifacts/GaslessVotingModule#<ContractName>.json
```

Or compile fresh: `npx hardhat compile` → `artifacts/contracts/<Name>.sol/<Name>.json`

---

## Architecture: Modular Composition

```
┌─────────────────────────────────────────────────────────────────┐
│                    ElectionsManager (Main)                       │
│  ┌───────────┬───────────┬──────────────┬──────────────┐       │
│  │ MultiChoice│ Quadratic │  Delegation  │  Metadata    │       │
│  │  Voting    │  Voting   │   Voting     │   Voting     │       │
│  │ (module)   │ (module)  │  (module)    │  (module)    │       │
│  └───────────┴───────────┴──────────────┴──────────────┘       │
│                                                                  │
│  Per-Poll Managers:                                              │
│  ┌─────────────────────┐  ┌──────────────────────┐             │
│  │ pollTokenManager[id]│  │ pollVotingPaymaster[id]│            │
│  │ (address per poll)  │  │ (address per poll)    │             │
│  └─────────────────────┘  └──────────────────────┘             │
├──────────────────────────────────────────────────────────────────┤
│  External Contracts:                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐      │
│  │ TokenManager │ │VotingPaymaster│ │SecretBallotManager │      │
│  └──────────────┘ └──────────────┘ └────────────────────┘      │
│  ┌──────────────────┐                                           │
│  │FranchiseManager  │                                           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Connection Setup (ethers.js)

```javascript
import { ethers } from "ethers";
import ElectionsManagerABI from "./abis/ElectionsManager.json";
import SecretBallotManagerABI from "./abis/SecretBallotManager.json";
import VotingPaymasterABI from "./abis/VotingPaymaster.json";
import FranchiseManagerABI from "./abis/FranchiseManager.json";
import TokenManagerABI from "./abis/TokenManager.json";

// Connect to provider
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Contract instances
const electionsManager = new ethers.Contract(
  ELECTIONS_MANAGER_ADDRESS,
  ElectionsManagerABI,
  signer
);

const secretBallotManager = new ethers.Contract(
  SECRET_BALLOT_MANAGER_ADDRESS,
  SecretBallotManagerABI,
  signer
);

const votingPaymaster = new ethers.Contract(
  VOTING_PAYMASTER_ADDRESS,
  VotingPaymasterABI,
  signer
);

const franchiseManager = new ethers.Contract(
  FRANCHISE_MANAGER_ADDRESS,
  FranchiseManagerABI,
  signer
);

const tokenManager = new ethers.Contract(
  TOKEN_MANAGER_ADDRESS,
  TokenManagerABI,
  provider // read-only is fine for view calls
);
```

---

## Complete User Flows

### 1. Create a Poll

**Who**: Contract owner or franchise manager

```javascript
// createPoll has 8 parameters (updated in v4.1)
const now = Math.floor(Date.now() / 1000);
const startTime = now + 3600; // starts in 1 hour
const duration = 86400;       // lasts 24 hours

const tx = await electionsManager.createPoll(
  "Best Programming Language 2026",  // title (must be unique)
  adminAddress,                       // poll admin
  startTime,                          // UTC unix timestamp
  duration,                           // seconds
  true,                               // enableTokenVoting
  false,                              // requireTokenVoting
  ethers.ZeroAddress,                 // customTokenManager (0x0 = use global)
  ethers.ZeroAddress                  // customVotingPaymaster (0x0 = use global)
);
const receipt = await tx.wait();

// Get pollId from event
const event = receipt.logs.find(
  log => electionsManager.interface.parseLog(log)?.name === "PollCreated"
);
const pollId = electionsManager.interface.parseLog(event).args.pollId;
console.log("Created poll:", pollId.toString());
```

> **Important**: The first `createPoll()` call permanently locks infrastructure — `setTokenManager()`, `setVotingPaymaster()`, and `setSecretBallotManager()` will revert after this.

### 2. Configure a Poll

**Who**: Poll admin or owner. **When**: Before poll starts.

```javascript
// Add voting options
await electionsManager.connect(admin).addOptionToPoll(pollId, "JavaScript");
await electionsManager.connect(admin).addOptionToPoll(pollId, "Python");
await electionsManager.connect(admin).addOptionToPoll(pollId, "Rust");

// Enable multi-choice (max 2 selections)
await electionsManager.connect(admin).setMaxChoices(pollId, 2);

// Enable quadratic voting
await electionsManager.connect(admin).enableQuadraticVoting(pollId);

// Enable secret ballot (commit-reveal)
await electionsManager.connect(admin).enableSecretBallot(pollId);

// Configure reveal duration for this poll (optional, default is 1 hour)
// Must be set before poll starts. Minimum 1 minute.
await secretBallotManager.connect(owner).setRevealDuration(pollId, 10 * 60); // 10 minutes

// Or change the default for ALL future polls
await secretBallotManager.connect(owner).setDefaultRevealDuration(15 * 60); // 15 minutes

// Set IPFS metadata (before poll starts only!)
await electionsManager.connect(admin).setPollMetadata(
  pollId,
  "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
);
```

### 3. Authorize Voters

**Who**: Poll admin or owner. **When**: Before poll starts.

```javascript
// Add individual voter
await electionsManager.connect(admin).addVoter(pollId, voterAddress);

// Add multiple voters (batch, max 50 per call)
const voterAddresses = [alice.address, bob.address, charlie.address];
await electionsManager.connect(admin).addVoters(pollId, voterAddresses);

// Add voters AND allocate tokens (for token-based voting)
await electionsManager.connect(admin).addVotersWithTokens(
  pollId,
  voterAddresses,
  5  // tokens per voter
);

// Allocate tokens separately (flexible allocation modes)
// Mode 1: Empty amounts array → uses poll's tokensPerVoter config (or 1 if unset)
await electionsManager.connect(owner).allocateVotingTokens(pollId, voterAddresses, []);

// Mode 2: Single-element array → uniform amount for all voters
await electionsManager.connect(owner).allocateVotingTokens(pollId, voterAddresses, [10]);

// Mode 3: Per-voter amounts (arrays must be same length)
await electionsManager.connect(owner).allocateVotingTokens(
  pollId,
  [alice.address, bob.address, charlie.address],
  [5, 10, 3]  // alice=5, bob=10, charlie=3
);

// Remove a voter (before poll starts)
await electionsManager.connect(admin).removeVoter(pollId, voterAddress);
```

### 4. Traditional Voting

**Who**: Authorized voter. **When**: During voting period. **Cost**: Voter pays gas.

```javascript
// Check if voter can vote
const isAuthorized = await electionsManager.isVoterAuthorized(pollId, voterAddress);
const hasVoted = await electionsManager.hasVoterVoted(pollId, voterAddress);
const isActive = await electionsManager.isPollActive(pollId);

if (isAuthorized && !hasVoted && isActive) {
  const tx = await electionsManager.connect(voter).voteInPoll(pollId, optionId);
  await tx.wait();
}
```

### 5. Token-Based Voting

**Who**: Authorized voter with tokens. **When**: During voting period. **Cost**: Voter pays gas + 1 token burned.

```javascript
// Check token balance
const balance = await tokenManager.getTokenBalance(pollId, voterAddress);

if (balance >= 1n) {
  const tx = await electionsManager.connect(voter).voteInPollWithToken(
    pollId,
    optionId,
    voter.address  // voter address (can also be called by paymaster)
  );
  await tx.wait();

  // Verify token was burned
  const newBalance = await tokenManager.getTokenBalance(pollId, voterAddress);
  console.log(`Tokens: ${balance} → ${newBalance}`);
}
```

### 6. Gasless Voting (Meta-Transactions)

**Who**: Authorized voter with tokens. **Cost**: Zero for voter — relayer/paymaster pays gas.

```javascript
// === STEP 1: Voter signs off-chain (no gas needed) ===
const domain = {
  name: "VotingPaymaster",
  version: "1",
  chainId: (await provider.getNetwork()).chainId,
  verifyingContract: VOTING_PAYMASTER_ADDRESS,
};

const types = {
  VoteWithToken: [
    { name: "pollId", type: "uint256" },
    { name: "optionId", type: "uint256" },
    { name: "voter", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const nonce = await votingPaymaster.getNonce(voter.address);
const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

const value = {
  pollId: pollId,
  optionId: optionId,
  voter: voter.address,
  nonce: nonce,
  deadline: deadline,
};

// This opens MetaMask but does NOT cost gas
const signature = await voter.signTypedData(domain, types, value);
const sig = ethers.Signature.from(signature);

// === STEP 2: Send signature to relayer (off-chain) ===
// POST to your relayer API with: { pollId, optionId, voter, deadline, v, r, s }

// === STEP 3: Relayer submits on-chain (relayer pays gas) ===
const tx = await votingPaymaster.connect(relayer).executeVoteWithToken(
  pollId,
  optionId,
  voter.address,
  deadline,
  sig.v,
  sig.r,
  sig.s
);
await tx.wait();
```

### 7. Multi-Choice Voting

**Who**: Authorized voter. **When**: During voting period. **Requires**: `setMaxChoices()` configured.

```javascript
// Check max choices allowed
const multiChoiceVotingAddr = await electionsManager.multiChoiceVoting();
const multiChoiceVoting = new ethers.Contract(
  multiChoiceVotingAddr,
  ["function pollMaxChoices(uint) view returns (uint)"],
  provider
);
const maxChoices = await multiChoiceVoting.pollMaxChoices(pollId);

// Vote for multiple options (array of option IDs)
const selectedOptions = [1, 3]; // must be <= maxChoices
const tx = await electionsManager.connect(voter).voteMultiChoice(
  pollId,
  selectedOptions
);
await tx.wait();
```

### 8. Quadratic Voting

**Who**: Authorized voter with tokens. **When**: During voting period. **Requires**: `enableQuadraticVoting()`.

```javascript
// Quadratic cost: to cast N votes on an option, costs N² tokens
// Example: 2 votes on option 1, 1 vote on option 2 = 4 + 1 = 5 tokens

const optionIds = [1, 2];
const voteAmounts = [2, 1]; // votes per option

const tx = await electionsManager.connect(voter).voteQuadratic(
  pollId,
  optionIds,
  voteAmounts
);
await tx.wait();
```

### 9. Vote Delegation

**Who**: Authorized voter (for delegation) / Delegate (for voting).

```javascript
// === Delegator: Delegate your vote ===
await electionsManager.connect(delegator).delegateVote(pollId, delegatee.address);

// === Delegator: Remove delegation (before delegate votes) ===
await electionsManager.connect(delegator).removeDelegation(pollId);

// === Delegate: Vote on behalf of delegator ===
await electionsManager.connect(delegate).voteAsDelegate(
  pollId,
  optionId,
  delegator.address  // who delegated to you
);

// Check delegation info
const [delegateeAddr, isDelegated, delegationsReceived] =
  await electionsManager.getDelegationInfo(pollId, voter.address);
```

### 10. Secret Ballot (Commit-Reveal)

**Who**: Authorized voter on a secret-ballot-enabled poll.

```javascript
// === PHASE 1: COMMIT (during voting period) ===
// Generate random salt — SAVE THIS! You need it for reveal.
const salt = ethers.randomBytes(32);

// Compute commitment hash
const commitHash = ethers.solidityPackedKeccak256(
  ["uint256", "uint256", "bytes32", "address"],
  [pollId, optionId, salt, voter.address]
);

// Submit hash (nobody can see your vote)
await secretBallotManager.connect(voter).commitVote(pollId, commitHash);
// OR with token: await secretBallotManager.connect(voter).commitVoteWithToken(pollId, commitHash);

// IMPORTANT: Save salt to localStorage or your backend!
localStorage.setItem(`vote-salt-${pollId}`, ethers.hexlify(salt));

// === PHASE 2: REVEAL (after endTime + 30s buffer, within reveal window) ===
// The reveal window duration is configurable per-poll (default: 1 hour)
const revealDuration = await secretBallotManager.getRevealDuration(pollId);
console.log(`Reveal window: ${revealDuration / 60} minutes`);
const savedSalt = localStorage.getItem(`vote-salt-${pollId}`);

// Check if in reveal phase
const inRevealPhase = await secretBallotManager.isInRevealPhase(pollId);

if (inRevealPhase) {
  await secretBallotManager.connect(voter).revealVote(pollId, optionId, savedSalt);
}

// Check status
const status = await secretBallotManager.getSecretBallotStatus(pollId);
// Returns: [commits, reveals, isSecretBallot, inCommitPhase, inRevealPhase]
```

> **Critical**: If the voter loses their `salt`, they cannot reveal their vote. Store it securely!

### 11. Reveal Results

**Who**: **Anyone** — this is democratic reveal.

```javascript
// Check poll status
const [started, active, ended, revealed] =
  await electionsManager.getPollStatus(pollId);

// For secret ballot: wait until reveal window closes
const revealDeadline = await secretBallotManager.getRevealDeadline(pollId);

// For non-secret ballot: wait until endTime + 30s buffer
const endTime = await electionsManager.getPollEndTime(pollId);

// Reveal (can be called by ANYONE — not just admin)
if (ended && !revealed) {
  const tx = await electionsManager.revealResults(pollId);
  await tx.wait();
}

// Now read results
const [winnerId, winnerName, winnerVotes] = await electionsManager.getWinner(pollId);
```

### 12. Franchise System

**Who**: Owner grants franchises; Franchisees create polls.

```javascript
// === Owner: Grant franchise (6 parameters in v4.1) ===
const tx = await franchiseManager.grantFranchise(
  franchiseeAddress,    // who gets the franchise
  30 * 86400,           // 30 days duration
  10,                   // max 10 polls
  ethers.parseEther("0.1"),  // fee per poll (1st is free)
  ethers.ZeroAddress,   // tokenManager (0x0 = use global)
  ethers.ZeroAddress    // votingPaymaster (0x0 = use global)
);

// === Franchisee: Create a poll ===
const pollTx = await franchiseManager.connect(franchisee).createFranchisePoll(
  "Community Vote",
  startTime,
  3600,   // 1 hour
  true,   // enable tokens
  false,  // don't require tokens
  { value: ethers.parseEther("0.1") }  // fee (1st poll is free)
);

// === Franchisee: Check remaining polls ===
const franchiseId = await franchiseManager.franchiseeToId(franchisee.address);
const remaining = await franchiseManager.remainingPolls(franchiseId);
const isActive = await franchiseManager.isFranchiseActive(franchiseId);
```

---

## Reading Poll Data (View Functions)

### Poll Info

```javascript
// Basic poll data (11 fields from struct)
const poll = await electionsManager.polls(pollId);
// Returns: [title, admin, startTime, endTime, revealed, ended,
//           totalVotes, optionsCount, exists, tokenVotingEnabled, tokenVotingRequired]

// Struct field indices (for destructuring):
// poll[0]  → title               (string)
// poll[1]  → admin               (address)
// poll[2]  → startTime           (uint256 — unix timestamp)
// poll[3]  → endTime             (uint256 — unix timestamp)
// poll[4]  → revealed            (bool)
// poll[5]  → ended               (bool)
// poll[6]  → totalVotes          (uint256)
// poll[7]  → optionsCount        (uint256)
// poll[8]  → exists              (bool)
// poll[9]  → tokenVotingEnabled  (bool)
// poll[10] → tokenVotingRequired (bool)

// Convenience getters
const count = await electionsManager.pollsCount();
const totalVotes = await electionsManager.getTotalVotes(pollId);
const optionsCount = await electionsManager.getOptionsCount(pollId);
const isActive = await electionsManager.isPollActive(pollId);
const isStarted = await electionsManager.isPollStarted(pollId);
const isEnded = await electionsManager.isPollEnded(pollId);
const [started, active, ended, revealed] = await electionsManager.getPollStatus(pollId);

// Metadata
const metadataURI = await electionsManager.getPollMetadata(pollId);
```

### Options & Results (require revealed == true for vote counts)

```javascript
// Get option: returns [id, name, voteCount]
// BEFORE reveal: voteCount is always 0 (privacy protection)
// AFTER reveal:  voteCount shows actual votes
const [optId, optName, votes] = await electionsManager.getOption(pollId, 1);

// Get winner (REQUIRES revealed)
const [winnerId, winnerName, winnerVotes] = await electionsManager.getWinner(pollId);

// Get voter's choice (REQUIRES revealed)
const choice = await electionsManager.getVoterChoice(pollId, voter.address);

// Get multi-choice selections (REQUIRES revealed)
const selections = await electionsManager.getVoterMultiChoices(pollId, voter.address);

// Get quadratic vote allocation (REQUIRES revealed)
const qVotes = await electionsManager.getQuadraticVotes(pollId, voter.address, optionId);
```

### Voter Info

```javascript
const isAuth = await electionsManager.isVoterAuthorized(pollId, voterAddr);
const voted = await electionsManager.hasVoterVoted(pollId, voterAddr);
const method = await electionsManager.voteMethod(pollId, voterAddr); // 0=Gas, 1=Token
const hasDel = await electionsManager.hasDelegated(pollId, voterAddr);
const [delegatee, isDelegated, delegationsReceived] =
  await electionsManager.getDelegationInfo(pollId, voterAddr);
```

### Token Info

```javascript
const tokenBalance = await tokenManager.getTokenBalance(pollId, voterAddr);
const hasTokens = await tokenManager.hasVoteTokens(pollId, voterAddr);
const tokenAddr = await tokenManager.getPollToken(pollId);
```

---

## Event Listening & Filtering

### Listen for Real-Time Events

```javascript
// New poll created
electionsManager.on("PollCreated", (pollId, title, admin, start, end, tokenEnabled, tokenRequired) => {
  console.log(`New poll #${pollId}: ${title}`);
});

// Vote cast
electionsManager.on("Voted", (pollId, voter, optionId, method) => {
  const methodName = method === 0n ? "Gas" : "Token";
  console.log(`Vote on poll #${pollId} by ${voter} for option ${optionId} (${methodName})`);
});

// Results revealed
electionsManager.on("ResultsRevealed", (pollId) => {
  console.log(`Poll #${pollId} results are now public!`);
});

// Secret ballot commit
secretBallotManager.on("VoteCommitted", (pollId, voter) => {
  console.log(`Secret vote committed on poll #${pollId} by ${voter}`);
});
```

### Query Historical Events

```javascript
// Get all polls created by a specific admin
const adminPolls = await electionsManager.queryFilter(
  electionsManager.filters.PollCreated(null, null, adminAddress)
);

// Get all votes on a specific poll
const pollVotes = await electionsManager.queryFilter(
  electionsManager.filters.Voted(pollId)
);

// Get all voter authorizations for a poll
const authorized = await electionsManager.queryFilter(
  electionsManager.filters.VoterAuthorized(pollId)
);

// Get gasless vote sponsorships
const sponsorships = await votingPaymaster.queryFilter(
  votingPaymaster.filters.GasSponsored(pollId)
);
```

### All Events by Contract

**ElectionsManager:**
| Event | Parameters |
|-------|-----------|
| `PollCreated` | `pollId↑, title, admin↑, startTime, endTime, tokenVotingEnabled, tokenVotingRequired` |
| `OptionAdded` | `pollId↑, optionId↑, name` |
| `Voted` | `pollId↑, voter↑, optionId↑, method` |
| `VotedMultiChoice` | `pollId↑, voter↑, optionIds[], method` |
| `VotedWithToken` | `pollId↑, voter↑, optionId↑` |
| `ResultsRevealed` | `pollId↑` |
| `VoterAuthorized` | `pollId↑, voter↑` |
| `VoterUnauthorized` | `pollId↑, voter↑` |
| `PollMetadataSet` | `pollId↑, metadataURI` |
| `SecretBallotEnabled` | `pollId↑` |
| `SecretBallotManagerSet` | `manager↑` |
| `FranchiseManagerSet` | `manager↑` |
| `TokenManagerSet` | `tokenManager↑` |
| `PaymasterSet` | `paymaster↑` |
| `InfrastructureLocked` | _(none)_ |
| `OwnershipTransferred` | `previousOwner↑, newOwner↑` |

**SecretBallotManager:**
| Event | Parameters |
|-------|-----------|
| `VoteCommitted` | `pollId↑, voter↑` |
| `VoteRevealed` | `pollId↑, voter↑, optionId↑` |

**VotingPaymaster:**
| Event | Parameters |
|-------|-----------|
| `Funded` | `funder↑, amount` |
| `Withdrawn` | `recipient↑, amount` |
| `GasSponsored` | `pollId↑, voter↑, gasUsed, gasPrice` |
| `RelayerAdded` | `relayer↑` |
| `RelayerRemoved` | `relayer↑` |
| `RelayerWhitelistToggled` | `enabled` |
| `AdminTransferred` | `previousAdmin↑, newAdmin↑` |

**FranchiseManager:**
| Event | Parameters |
|-------|-----------|
| `FranchiseGranted` | `franchiseId↑, franchisee↑, expiresAt, maxPolls, feePerPoll` |
| `FranchisePollCreated` | `franchiseId↑, pollId↑, feePaid` |
| `PollsAdded` | `franchiseId↑, additionalPolls, newMaxPolls` |
| `FranchiseSuperseded` | `oldFranchiseId↑, newFranchiseId↑, franchisee↑` |
| `TransferRequested` | `franchiseId↑, from↑, to↑, feePaid` |
| `TransferApproved` | `franchiseId↑, oldFranchisee↑, newFranchisee↑` |
| `TransferRejected` | `franchiseId↑` |
| `TransferFeeSet` | `fee` |
| `FeesWithdrawn` | `to↑, amount` |

**Module Events** (emitted from module contracts, not ElectionsManager):
| Contract | Event | Parameters |
|----------|-------|-----------|
| MultiChoiceVoting | `MultiChoiceConfigured` | `pollId↑, maxChoices` |
| QuadraticVoting | `QuadraticVotingEnabled` | `pollId↑` |
| QuadraticVoting | `VotedQuadratic` | `pollId↑, voter↑, optionIds[], voteAmounts[], totalCost` |
| DelegationVoting | `VoteDelegated` | `pollId↑, delegator↑, delegatee↑` |
| DelegationVoting | `DelegationRemoved` | `pollId↑, delegator↑, previousDelegatee↑` |
| DelegationVoting | `VotedAsDelegate` | `pollId↑, delegate↑, delegator↑, optionId` |
| MetadataVoting | `PollMetadataSet` | `pollId↑, metadataURI` |

> ↑ = indexed parameter (filterable)

---

## Per-Poll Managers

Each poll can use a **custom TokenManager and VotingPaymaster**, or fall back to global defaults:

```javascript
// Read per-poll managers
const pollTM = await electionsManager.pollTokenManager(pollId);   // TokenManager for this poll
const pollPM = await electionsManager.pollVotingPaymaster(pollId); // Paymaster for this poll

// When creating a poll with custom managers:
await electionsManager.createPoll(
  "Custom Managers Poll",
  admin,
  startTime,
  duration,
  true,
  false,
  customTokenManagerAddress,    // custom TokenManager for this poll
  customVotingPaymasterAddress  // custom VotingPaymaster for this poll
);

// Passing ethers.ZeroAddress uses the global default:
await electionsManager.createPoll(title, admin, start, dur, true, false,
  ethers.ZeroAddress,  // → uses global tokenManager
  ethers.ZeroAddress   // → uses global votingPaymaster
);
```

---

## Error Handling

### Common Revert Reasons

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `"Not authorized"` | Caller is not owner/franchiseMgr | Use owner account |
| `"admin zero"` | Zero address passed as admin | Pass valid address |
| `"Poll title already exists."` | Duplicate poll title | Use unique title |
| `"Poll does not exist."` | Invalid pollId | Check `pollsCount` |
| `"Poll started"` | Changing config after start | Configure before start |
| `"Poll not active for voting."` | Voting outside window | Check `isPollActive()` |
| `"Not authorized to vote in this poll."` | Voter not authorized | Use `addVoter()` first |
| `"Already voted."` | Double voting attempt | Check `hasVoterVoted()` |
| `"Invalid option."` | optionId out of range | 1 to `optionsCount` |
| `"Secret ballot: use SBM"` | Direct vote on secret poll | Use SecretBallotManager |
| `"Infra locked"` | Changing config after lock | Cannot change after first poll |
| `"Token voting not enabled"` | Token vote on non-token poll | Enable in `createPoll()` |
| `"Insufficient tokens"` | No tokens for voting | Allocate tokens first |
| `"Voter has delegated their vote."` | Delegated voter trying to vote | Remove delegation first |
| `"Poll not revealed"` | Reading results before reveal | Call `revealResults()` first |
| `"Invalid signature"` | Bad gasless vote signature | Check EIP-712 params |
| `"Deadline expired."` | Gasless vote deadline passed | Use fresh deadline |

### Error Handling Pattern

```javascript
try {
  const tx = await electionsManager.connect(voter).voteInPoll(pollId, optionId);
  await tx.wait();
} catch (error) {
  // Parse revert reason
  const reason = error.reason || error.message;

  if (reason.includes("Already voted")) {
    showError("You have already voted in this poll");
  } else if (reason.includes("Not authorized")) {
    showError("You are not authorized to vote in this poll");
  } else if (reason.includes("Poll not active")) {
    showError("This poll is not currently accepting votes");
  } else if (reason.includes("Secret ballot")) {
    showError("This poll uses secret ballot — use the commit-reveal flow");
  } else {
    showError(`Transaction failed: ${reason}`);
  }
}
```

---

## Time & Timezone Handling

All timestamps are **UTC Unix timestamps** (seconds since epoch).

```javascript
// Convert local time to UTC timestamp for createPoll
const localDate = new Date("2026-03-01T15:00:00"); // user's local time
const utcTimestamp = Math.floor(localDate.getTime() / 1000);

// Display blockchain timestamp in user's local time
const startTime = await electionsManager.getPollStartTime(pollId);
const localString = new Date(Number(startTime) * 1000).toLocaleString();

// Time constants
const TIME_BUFFER = 30;          // seconds between end and reveal start
const MIN_REVEAL_DURATION = 60;  // 1 minute minimum reveal window
const MIN_POLL_DURATION = 300;   // 5 minutes minimum
const MAX_FUTURE_START = 30 * 86400; // 30 days max future start

// Reveal duration is configurable per-poll (read from SecretBallotManager)
const revealDuration = await secretBallotManager.getRevealDuration(pollId);
// Default: 3600 (1 hour), configurable via setRevealDuration()
```

### Poll Lifecycle Timeline

```
          ↓ createPoll
  ──────────────┬──────────────┬────────┬──────────────────────┬──────────
                │              │        │                      │
             startTime      endTime  +30s    +30s+revealDuration (configurable)
                │              │        │                      │
                ├──── Active ──┤        │                      │
                │  (voting OK) │ Buffer │    Reveal Phase      │
                │              │        │    (SBM only)        │
                │              │        │                      ├── revealResults()
                                                                 (anyone can call)

Reveal duration defaults to 1 hour. Configurable per-poll via:
  secretBallotManager.setRevealDuration(pollId, seconds)
```

---

## Access Control Matrix

| Function | Owner | Admin | Voter | Franchisee | Anyone |
|----------|:-----:|:-----:|:-----:|:----------:|:------:|
| `createPoll` | ✅ | | | ✅* | |
| `addOptionToPoll` | ✅ | ✅ | | | |
| `addVoter` / `addVoters` | ✅ | ✅ | | | |
| `addVotersWithTokens` | ✅ | ✅ | | | |
| `removeVoter` | ✅ | ✅ | | | |
| `setMaxChoices` | ✅ | ✅ | | | |
| `enableQuadraticVoting` | ✅ | ✅ | | | |
| `enableSecretBallot` | ✅ | ✅ | | | |
| `setPollMetadata` | ✅ | ✅ | | | |
| `voteInPoll` | | | ✅ | | |
| `voteInPollWithToken` | | | ✅ | | |
| `voteMultiChoice` | | | ✅ | | |
| `voteQuadratic` | | | ✅ | | |
| `voteAsDelegate` | | | ✅ | | |
| `delegateVote` | | | ✅ | | |
| `commitVote` (SBM) | | | ✅ | | |
| `revealVote` (SBM) | | | ✅ | | |
| `revealResults` | ✅ | ✅ | ✅ | ✅ | **✅** |
| View functions (pre-reveal) | ❌ | ❌ | ❌ | ❌ | ❌ |
| View functions (post-reveal) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `setTokenManager` | ✅† | | | | |
| `setVotingPaymaster` | ✅† | | | | |
| `setSecretBallotManager` | ✅† | | | | |
| `setFranchiseManager` | ✅† | | | | |
| `grantFranchise` | ✅ | | | | |

\* Franchisee creates polls via FranchiseManager.createFranchisePoll()
† Only before infrastructure is locked (first poll)

---

## Complete Function Reference

### ElectionsManager — Write Functions

| Function | Signature |
|----------|-----------|
| `createPoll` | `(string title, address admin, uint startTime, uint durationSeconds, bool enableTokenVoting, bool requireTokenVoting, address customTokenManager, address customVotingPaymaster) → uint` |
| `addOptionToPoll` | `(uint pollId, string name)` |
| `addVoter` | `(uint pollId, address voter)` |
| `addVoters` | `(uint pollId, address[] voters)` |
| `addVotersWithTokens` | `(uint pollId, address[] voters, uint tokensPerVoter)` |
| `allocateVotingTokens` | `(uint pollId, address[] voters, uint[] amounts)` — owner only, 3 modes: empty=[config default], single=[uniform], full=[per-voter] |
| `removeVoter` | `(uint pollId, address voter)` |
| `voteInPoll` | `(uint pollId, uint optionId)` |
| `voteInPollWithToken` | `(uint pollId, uint optionId, address voter)` |
| `voteMultiChoice` | `(uint pollId, uint[] optionIds)` |
| `voteQuadratic` | `(uint pollId, uint[] optionIds, uint[] voteAmounts)` |
| `delegateVote` | `(uint pollId, address delegatee)` |
| `removeDelegation` | `(uint pollId)` |
| `voteAsDelegate` | `(uint pollId, uint optionId, address delegator)` |
| `setMaxChoices` | `(uint pollId, uint maxChoices)` |
| `enableQuadraticVoting` | `(uint pollId)` |
| `enableSecretBallot` | `(uint pollId)` |
| `setPollMetadata` | `(uint pollId, string metadataURI)` |
| `revealResults` | `(uint pollId)` |
| `setTokenManager` | `(address)` |
| `setVotingPaymaster` | `(address payable)` |
| `setSecretBallotManager` | `(address)` |
| `setFranchiseManager` | `(address)` |
| `transferOwnership` | `(address newOwner)` |
| `acceptOwnership` | `()` |

### ElectionsManager — View Functions

| Function | Returns |
|----------|---------|
| `pollsCount()` | `uint` |
| `polls(uint pollId)` | `(string title, address admin, uint startTime, uint endTime, bool revealed, bool ended, uint totalVotes, uint optionsCount, bool exists, bool tokenVotingEnabled, bool tokenVotingRequired)` — indices: [0]=title, [1]=admin, [2]=startTime, [3]=endTime, [4]=revealed, [5]=ended, [6]=totalVotes, [7]=optionsCount, [8]=exists, [9]=tokenVotingEnabled, [10]=tokenVotingRequired |
| `getOption(uint pollId, uint optionId)` | `(uint id, string name, uint votes)` — votes=0 if !revealed |
| `getWinner(uint pollId)` | `(uint id, string name, uint votes)` — requires revealed |
| `getVoterChoice(uint pollId, address)` | `uint` — requires revealed |
| `getVoterMultiChoices(uint pollId, address)` | `uint[]` — requires revealed |
| `getQuadraticVotes(uint pollId, address, uint optionId)` | `uint` — requires revealed |
| `getTotalVotes(uint pollId)` | `uint` |
| `getOptionsCount(uint pollId)` | `uint` |
| `getPollStartTime(uint pollId)` | `uint` |
| `getPollEndTime(uint pollId)` | `uint` |
| `getPollStatus(uint pollId)` | `(bool started, bool active, bool ended, bool revealed)` |
| `hasVoterVoted(uint pollId, address)` | `bool` |
| `isVoterAuthorized(uint pollId, address)` | `bool` |
| `isPollActive(uint pollId)` | `bool` |
| `isPollStarted(uint pollId)` | `bool` |
| `isPollEnded(uint pollId)` | `bool` |
| `hasDelegated(uint pollId, address)` | `bool` |
| `getDelegationInfo(uint pollId, address)` | `(address delegatee, bool isDelegated, uint delegationsReceived)` |
| `getPollMetadata(uint pollId)` | `string` |
| `pollTokenManager(uint pollId)` | `address` |
| `pollVotingPaymaster(uint pollId)` | `address` |
| `secretBallot(uint pollId)` | `bool` |
| `voteMethod(uint pollId, address)` | `uint (0=Gas, 1=Token)` |
| `infrastructureLocked()` | `bool` |
| `owner()` | `address` |
| `multiChoiceVoting()` | `address` |
| `quadraticVoting()` | `address` |
| `delegationVoting()` | `address` |
| `metadataVoting()` | `address` |

### SecretBallotManager

| Function | Type | Signature |
|----------|------|-----------|
| `commitVote` | write | `(uint pollId, bytes32 commitHash)` |
| `commitVoteWithToken` | write | `(uint pollId, bytes32 commitHash)` |
| `revealVote` | write | `(uint pollId, uint optionId, bytes32 salt)` |
| `setDefaultRevealDuration` | write | `(uint duration)` — owner only, min 1 min |
| `setRevealDuration` | write | `(uint pollId, uint duration)` — owner only, before poll starts, 0=default |
| `isInCommitPhase` | view | `(uint pollId) → bool` |
| `isInRevealPhase` | view | `(uint pollId) → bool` |
| `getRevealDeadline` | view | `(uint pollId) → uint` |
| `getRevealDuration` | view | `(uint pollId) → uint` — effective duration for this poll |
| `defaultRevealDuration` | view | `() → uint` — current default (initially 1 hour) |
| `getSecretBallotStatus` | view | `(uint pollId) → (uint commits, uint reveals, bool isSecret, bool inCommit, bool inReveal)` |
| `hasCommitted` | view | `(uint pollId, address) → bool` |
| `hasRevealed` | view | `(uint pollId, address) → bool` |

### VotingPaymaster

| Function | Type | Signature |
|----------|------|-----------|
| `fund` | write (payable) | `()` |
| `withdraw` | write | `(uint amount)` |
| `executeVoteWithToken` | write | `(uint pollId, uint optionId, address voter, uint deadline, uint8 v, bytes32 r, bytes32 s) → bool` |
| `addRelayer` | write | `(address)` |
| `removeRelayer` | write | `(address)` |
| `setRelayerWhitelistEnabled` | write | `(bool enabled)` |
| `transferAdmin` | write | `(address newAdmin)` |
| `verifySignature` | view | `(uint pollId, uint optionId, address voter, uint deadline, uint8 v, bytes32 r, bytes32 s) → bool` |
| `getNonce` | view | `(address voter) → uint` |
| `getBalance` | view | `() → uint` |
| `isTrustedRelayer` | view | `(address) → bool` |
| `getDomainSeparator` | view | `() → bytes32` |

### FranchiseManager

| Function | Type | Signature |
|----------|------|-----------|
| `grantFranchise` | write | `(address franchisee, uint durationSeconds, uint maxPolls, uint feePerPoll, address tokenManager, address votingPaymaster) → uint` |
| `addPolls` | write | `(uint franchiseId, uint additionalPolls)` |
| `createFranchisePoll` | write (payable) | `(string title, uint startTime, uint durationSeconds, bool enableTokenVoting, bool requireTokenVoting) → uint` |
| `requestTransfer` | write (payable) | `(uint franchiseId, address newFranchisee)` |
| `approveTransfer` | write | `(uint franchiseId)` |
| `rejectTransfer` | write | `(uint franchiseId)` |
| `setTransferFee` | write | `(uint fee)` |
| `withdrawFees` | write | `()` |
| `getFranchise` | view | `(uint id) → (address, uint, uint, uint, uint, bool expired, bool exhausted)` |
| `remainingPolls` | view | `(uint id) → uint` |
| `isFranchiseActive` | view | `(uint id) → bool` |
| `franchiseeToId` | view | `(address) → uint` |

---

## Subgraph (GraphQL) Queries

If The Graph subgraph is deployed, you can query:

```graphql
# Get all active polls
{
  polls(where: { ended: false }) {
    id
    title
    admin
    startTime
    endTime
    totalVotes
    tokenVotingEnabled
    options {
      optionId
      name
      voteCount
    }
  }
}

# Get votes for a specific poll
{
  votes(where: { poll: "1" }) {
    voter
    optionId
    method
    timestamp
  }
}

# Get voter info across polls
{
  voters(where: { address: "0x..." }) {
    poll { title }
    hasVoted
    hasDelegated
    tokenBalance
  }
}

# Get global statistics
{
  globalStats(id: "global") {
    totalPolls
    totalVotes
    totalVoters
    totalGasSponsored
  }
}
```

### Available GraphQL Entities

| Entity | Description |
|--------|-------------|
| `Poll` | Full poll data with relations to options, votes, voters |
| `Option` | Voting options with vote counts |
| `Vote` | Individual vote records with method tracking |
| `Voter` | Per-poll voter state (authorized, voted, delegated, tokens) |
| `Delegation` | Active/removed delegation pairs |
| `TokenAllocation` | Token allocation events |
| `TokenBurn` | Token burn events |
| `PollToken` | Token contract per poll |
| `GasSponsorship` | Gas sponsorship records |
| `PaymasterFunding` | Paymaster funding events |
| `PollStats` | Aggregated poll statistics |
| `GlobalStats` | System-wide aggregated statistics |

---

**Version**: 4.1.0
**Last Updated**: 2026-02-14
**Solidity**: ^0.8.20 (compiled with 0.8.28)
**Hardhat**: 3.1.3+
**ethers.js**: v6
