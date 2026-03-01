# Test Scripts

Collection of test scripts to verify your voting system deployment.

## Prerequisites

Make sure you have deployed the contracts first:

```bash
# Terminal 1: Start local blockchain
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat ignition deploy ignition/modules/GaslessVoting.ts --network localhost
```

## Quick Test

Simple test to verify deployment is working:

```bash
npx hardhat run scripts/quickTest.js --network localhost
```

**What it does:**
- Creates a poll with optional token voting
- Adds voting options
- Authorizes voters
- Demonstrates traditional voting (voter pays gas)

**Time:** ~30 seconds

## Comprehensive Test

Full test of all three voting methods:

```bash
npx hardhat run scripts/testAllVotingMethods.js --network localhost
```

**What it does:**
1. **Traditional Voting** - Alice votes paying her own gas
2. **Token-Based Voting** - Bob votes using tokens (pays gas + token burned)
3. **Gasless Voting** - Charlie signs off-chain, paymaster pays gas (EIP-712)

**Features demonstrated:**
- Poll creation with token voting enabled
- Token allocation to voters
- All three voting methods
- Gas cost comparison
- Vote method tracking
- Complete vote tallying

**Time:** ~1 minute

## Manual Testing in Hardhat Console

You can also test interactively:

```bash
npx hardhat console --network localhost
```

Then run commands:

```javascript
// Get signers
const [owner, admin, voter] = await ethers.getSigners();

// Connect to contract
const em = await ethers.getContractAt("ElectionsManager", "0x5FbDB2315678afecb367f032d93F642f64180aa3");

// Create poll (optional token voting)
const now = (await ethers.provider.getBlock("latest")).timestamp;
await em.createPoll("Test", admin.address, now + 100, 3600, true, false);

// Add options
await em.connect(admin).addOptionToPoll(1, "Yes");
await em.connect(admin).addOptionToPoll(1, "No");

// Authorize voter
await em.connect(admin).addVoters(1, [voter.address]);

// Wait for poll to start (fast forward time)
await ethers.provider.send("evm_setNextBlockTimestamp", [now + 110]);
await ethers.provider.send("evm_mine");

// Vote
await em.connect(voter).voteInPoll(1, 1);

// Check results
await em.polls(1);
await em.options(1, 1);
```

## Troubleshooting

### Error: "Start time cannot be in the past"

Use a larger buffer when setting start time:
```javascript
const now = (await ethers.provider.getBlock("latest")).timestamp;
const startTime = now + 100; // 100 seconds in future (safe buffer)
await em.createPoll("Title", admin, startTime, duration, true, false);
```

### Error: "This poll requires token-based voting"

Your poll was created with `tokenVotingRequired = true`. Either:

**Option A:** Allocate tokens and vote with tokens:
```javascript
await em.connect(admin).addVotersWithTokens(pollId, [voter.address], 5);
await em.connect(voter).voteInPollWithToken(pollId, optionId, voter.address);
```

**Option B:** Create a new poll with `tokenVotingRequired = false`:
```javascript
await em.createPoll("Title", admin, startTime, duration, true, false);
//                                                         ^^^^  ^^^^
//                                                         |      |
//                                   tokenEnabled = true --+      +-- tokenRequired = false
```

### Error: "Poll hasn't started yet"

Wait for the start time:
```javascript
const poll = await em.polls(pollId);
const startTime = poll.startTime;
await ethers.provider.send("evm_setNextBlockTimestamp", [Number(startTime) + 10]);
await ethers.provider.send("evm_mine");
```

### Error: "Voter not authorized"

Authorize the voter first:
```javascript
await em.connect(admin).addVoter(pollId, voter.address);
```

## Contract Addresses (Localhost)

After deployment with `GaslessVoting.ts`, you'll have:

- **ElectionsManager:** `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- **TokenManager:** `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
- **VotingPaymaster:** `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`

These are deterministic Hardhat addresses. Update the scripts if your addresses differ.

## Need More Help?

Check the main documentation:
- [README.md](../README.md) - Usage examples
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [docs/ERROR_CODES.md](../docs/ERROR_CODES.md) - Error reference

Or run the test suite:
```bash
npx hardhat test
```
