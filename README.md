# 🗳️ Blockchain Voting System

A decentralized voting system application demonstrating blockchain capabilities using Solidity for the backend. This project showcases how blockchain technology can be used to create transparent, tamper-proof, and secure voting systems.

## 📋 Features

- **Decentralized Elections**: Create and manage elections on the blockchain
- **Candidate Management**: Add candidates to elections before they start
- **Voter Registration**: Secure voter registration system
- **Transparent Voting**: Cast votes that are recorded immutably on the blockchain
- **Result Verification**: Automatic winner determination after election ends
- **Security**: Prevents double voting and ensures only registered voters can participate
- **Time-based Elections**: Elections with configurable start and end times

## 🏗️ Architecture

### Smart Contract (Solidity)
The core of the system is a Solidity smart contract (`VotingSystem.sol`) that includes:
- Election creation and management
- Candidate registration
- Voter registration and authentication
- Vote casting with validation
- Result calculation and winner determination

### Frontend (HTML/JavaScript)
A web-based interface that allows users to:
- Connect their Web3 wallet (MetaMask)
- Interact with the deployed smart contract
- Create elections (owner only)
- Register voters (owner only)
- Cast votes
- View election results

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- MetaMask browser extension (for frontend)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/soralank/votingsystem.git
cd votingsystem
```

2. Install dependencies:
```bash
npm install
```

### Compilation

Compile the smart contracts:
```bash
npm run compile
```

### Testing

Run the test suite:
```bash
npm test
```

### Deployment

#### Local Development

1. Start a local Hardhat network:
```bash
npm run node
```

2. In a new terminal, deploy the contract:
```bash
npm run deploy
```

3. Note the deployed contract address from the console output.

#### Using the Frontend

1. Open `frontend/index.html` in a web browser
2. Connect your MetaMask wallet
3. Make sure MetaMask is connected to your local Hardhat network (http://localhost:8545, Chain ID: 1337)
4. Enter the deployed contract address
5. Start creating elections and voting!

## 📖 Smart Contract Functions

### Owner Functions (Only contract owner)

- `createElection(name, description, durationInDays)` - Create a new election
- `addCandidate(electionId, name)` - Add a candidate to an election
- `registerVoter(electionId, voterAddress)` - Register a voter for an election

### Public Functions

- `vote(electionId, candidateId)` - Cast a vote (for registered voters)
- `getElection(electionId)` - Get election details
- `getCandidate(electionId, candidateId)` - Get candidate information
- `hasVoted(electionId, voter)` - Check if an address has voted
- `isRegisteredVoter(electionId, voter)` - Check if an address is registered
- `getWinner(electionId)` - Get election winner (after election ends)

## 🔒 Security Features

- **Owner-only Functions**: Critical functions like creating elections and registering voters are restricted to the contract owner
- **Voter Registration**: Only registered voters can cast votes
- **Double Voting Prevention**: Each voter can only vote once per election
- **Time-based Validation**: Votes can only be cast during the election period
- **Immutable Records**: All votes are recorded on the blockchain and cannot be altered

## 🧪 Running Tests

The project includes comprehensive tests covering:
- Contract deployment
- Election creation
- Candidate management
- Voter registration
- Voting process
- Result determination

Run tests with:
```bash
npm test
```

## 📁 Project Structure

```
votingsystem/
├── contracts/           # Solidity smart contracts
│   └── VotingSystem.sol
├── scripts/            # Deployment scripts
│   └── deploy.js
├── test/               # Test files
│   └── VotingSystem.test.js
├── frontend/           # Web interface
│   └── index.html
├── hardhat.config.js   # Hardhat configuration
├── package.json        # Project dependencies
└── README.md          # This file
```

## 🛠️ Technology Stack

- **Blockchain Platform**: Ethereum
- **Smart Contract Language**: Solidity ^0.8.19
- **Development Framework**: Hardhat
- **Testing**: Chai, Mocha
- **Frontend**: HTML, JavaScript, Ethers.js
- **Wallet Integration**: MetaMask

## 📝 Example Usage

### Creating an Election

```javascript
// Connect to the contract
const votingSystem = await ethers.getContractAt("VotingSystem", contractAddress);

// Create an election (owner only)
await votingSystem.createElection(
    "Presidential Election 2024",
    "National presidential election",
    7  // Duration in days
);
```

### Adding Candidates

```javascript
// Add candidates (owner only, before election starts)
await votingSystem.addCandidate(1, "Candidate A");
await votingSystem.addCandidate(1, "Candidate B");
await votingSystem.addCandidate(1, "Candidate C");
```

### Registering Voters

```javascript
// Register voters (owner only)
await votingSystem.registerVoter(1, voterAddress1);
await votingSystem.registerVoter(1, voterAddress2);
```

### Casting a Vote

```javascript
// Vote (registered voters only, during election period)
await votingSystem.vote(1, 2); // Vote for candidate 2 in election 1
```

### Getting Results

```javascript
// Get winner (after election ends)
const [winnerId, winnerName, voteCount] = await votingSystem.getWinner(1);
console.log(`Winner: ${winnerName} with ${voteCount} votes`);
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🔗 Blockchain Benefits Demonstrated

1. **Transparency**: All votes are recorded on the blockchain and can be verified
2. **Immutability**: Once cast, votes cannot be altered or deleted
3. **Decentralization**: No central authority controls the voting process
4. **Security**: Cryptographic signatures ensure vote authenticity
5. **Auditability**: Complete voting history is available for verification
6. **Trust**: Smart contract logic is transparent and verifiable

## ⚠️ Disclaimer

This is a demonstration project for educational purposes. For production use in real elections, additional security audits, testing, and compliance with electoral laws would be required.