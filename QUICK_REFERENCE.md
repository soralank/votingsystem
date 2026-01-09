# Quick Reference Guide

## Quick Start

```bash
# Install
npm install

# Compile
npm run compile

# Test
npm test

# Start local blockchain
npm run node

# Deploy (in another terminal)
npm run deploy

# Run demo
npm run demo
```

## Smart Contract Functions

### Owner Functions

```solidity
// Create a new election
createElection(
    string memory _name,
    string memory _description,
    uint256 _durationInDays
) returns (uint256)

// Add a candidate to an election
addCandidate(
    uint256 _electionId,
    string memory _name
)

// Register a voter for an election
registerVoter(
    uint256 _electionId,
    address _voter
)
```

### Public Functions

```solidity
// Cast a vote
vote(
    uint256 _electionId,
    uint256 _candidateId
)

// Get election details
getElection(uint256 _electionId) view returns (
    uint256 id,
    string memory name,
    string memory description,
    uint256 startTime,
    uint256 endTime,
    uint256 candidateCount
)

// Get candidate details
getCandidate(
    uint256 _electionId,
    uint256 _candidateId
) view returns (
    uint256 id,
    string memory name,
    uint256 voteCount
)

// Check if an address has voted
hasVoted(
    uint256 _electionId,
    address _voter
) view returns (bool)

// Check if an address is registered
isRegisteredVoter(
    uint256 _electionId,
    address _voter
) view returns (bool)

// Get the winner of an election
getWinner(uint256 _electionId) view returns (
    uint256 winnerId,
    string memory winnerName,
    uint256 winningVoteCount
)
```

## JavaScript/Ethers.js Usage

### Connect to Contract

```javascript
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();
const contract = new ethers.Contract(contractAddress, ABI, signer);
```

### Create Election

```javascript
const tx = await contract.createElection(
    "Election Name",
    "Description",
    7  // duration in days
);
await tx.wait();  // Wait for confirmation
```

### Add Candidate

```javascript
const tx = await contract.addCandidate(1, "Candidate Name");
await tx.wait();
```

### Register Voter

```javascript
const tx = await contract.registerVoter(1, "0x...");
await tx.wait();
```

### Cast Vote

```javascript
const tx = await contract.vote(1, 1);  // election 1, candidate 1
await tx.wait();
```

### Read Data (No gas cost)

```javascript
// Get election details
const election = await contract.getElection(1);
console.log(election.name);

// Get candidate
const candidate = await contract.getCandidate(1, 1);
console.log(candidate.name, candidate.voteCount.toString());

// Check if voted
const voted = await contract.hasVoted(1, address);
console.log(voted);

// Get winner
const [winnerId, winnerName, voteCount] = await contract.getWinner(1);
console.log(`Winner: ${winnerName} with ${voteCount} votes`);
```

### Listen to Events

```javascript
// Listen for new elections
contract.on("ElectionCreated", (electionId, name, startTime, endTime) => {
    console.log(`New election created: ${name}`);
});

// Listen for votes
contract.on("VoteCasted", (electionId, voter, candidateId) => {
    console.log(`Vote cast by ${voter} for candidate ${candidateId}`);
});
```

## Hardhat Console Commands

```bash
# Start console
npx hardhat console --network localhost

# In console:
const VotingSystem = await ethers.getContractFactory("VotingSystem");
const votingSystem = await VotingSystem.attach("CONTRACT_ADDRESS");

# Get signers
const [owner, voter1, voter2] = await ethers.getSigners();

# Create election
const tx = await votingSystem.createElection("Test", "Desc", 7);
await tx.wait();

# Get election count
const count = await votingSystem.electionCount();
console.log(count.toString());

# Register voter
await votingSystem.registerVoter(1, voter1.address);

# Vote (from voter1)
const votingSystemAsVoter = votingSystem.connect(voter1);
await votingSystemAsVoter.vote(1, 1);
```

## Time Manipulation (Testing)

```javascript
// In Hardhat console or test
await network.provider.send("evm_increaseTime", [86400]); // Add 1 day
await network.provider.send("evm_mine"); // Mine a block

// Now test time-dependent features
```

## Testing Patterns

```javascript
describe("VotingSystem", function () {
    let votingSystem;
    let owner, voter1;

    beforeEach(async function () {
        [owner, voter1] = await ethers.getSigners();
        const VotingSystem = await ethers.getContractFactory("VotingSystem");
        votingSystem = await VotingSystem.deploy();
        await votingSystem.waitForDeployment();
    });

    it("Should create election", async function () {
        await votingSystem.createElection("Test", "Description", 7);
        expect(await votingSystem.electionCount()).to.equal(1);
    });
});
```

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Only owner can call this function" | Not contract owner | Use owner account |
| "Election does not exist" | Invalid election ID | Check election count |
| "You are not registered to vote" | Voter not registered | Register voter first |
| "You have already voted" | Double voting attempt | Can only vote once |
| "Election has not started yet" | Too early | Wait for start time |
| "Election has ended" | Too late | Election period over |
| "Cannot add candidates after election starts" | Adding candidates late | Add before start time |

## MetaMask Setup

### Add Local Network
- Network Name: Hardhat Local
- RPC URL: http://127.0.0.1:8545
- Chain ID: 1337
- Currency: ETH

### Import Account
1. Copy private key from Hardhat node output
2. MetaMask → Import Account → Paste key

## Gas Estimates

| Function | Approximate Gas |
|----------|----------------|
| createElection | ~200,000 |
| addCandidate | ~100,000 |
| registerVoter | ~50,000 |
| vote | ~70,000 |
| getElection | 0 (view) |
| getCandidate | 0 (view) |

## Useful Links

- Hardhat Docs: https://hardhat.org/
- Ethers.js Docs: https://docs.ethers.org/
- Solidity Docs: https://docs.soliditylang.org/
- OpenZeppelin: https://docs.openzeppelin.com/

## Troubleshooting

### Cannot compile
```bash
# Clear cache and reinstall
rm -rf artifacts cache node_modules
npm install
npm run compile
```

### Tests failing
```bash
# Run specific test
npx hardhat test test/VotingSystem.test.js

# Enable stack traces
npx hardhat test --verbose
```

### Contract deployment failed
- Check network connection
- Ensure sufficient ETH in account
- Verify Hardhat node is running
- Check for compilation errors

## Best Practices

1. **Always wait for transactions**: `await tx.wait()`
2. **Use view functions for reading**: No gas cost
3. **Test on local network first**: Before testnet/mainnet
4. **Keep private keys secure**: Never commit to git
5. **Verify contracts**: Verify on block explorer
6. **Monitor gas prices**: Use gas estimation
7. **Handle errors gracefully**: Try-catch blocks
8. **Document your code**: Comments and NatSpec

## Security Checklist

- [ ] Input validation on all functions
- [ ] Access control properly implemented
- [ ] No reentrancy vulnerabilities
- [ ] Integer overflow/underflow handled (Solidity 0.8+)
- [ ] Events emitted for important state changes
- [ ] Gas limits considered
- [ ] Time manipulation resistant
- [ ] No front-running vulnerabilities
- [ ] Private keys secured
- [ ] Contract verified on explorer
