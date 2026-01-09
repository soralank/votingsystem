const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VotingSystem", function () {
  let votingSystem;
  let owner;
  let voter1;
  let voter2;
  let voter3;

  // Test constants
  const IMMEDIATE_START = 0;
  const ONE_HOUR_START = 1;
  const ONE_DAY_START = 24;
  const DEFAULT_DURATION = 7;
  const ONE_DAY_DURATION = 1;

  beforeEach(async function () {
    [owner, voter1, voter2, voter3] = await ethers.getSigners();
    
    const VotingSystem = await ethers.getContractFactory("VotingSystem");
    votingSystem = await VotingSystem.deploy();
    await votingSystem.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await votingSystem.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero elections", async function () {
      expect(await votingSystem.electionCount()).to.equal(0);
    });
  });

  describe("Election Creation", function () {
    it("Should create an election successfully", async function () {
      const tx = await votingSystem.createElection(
        "Presidential Election",
        "Choose the next president",
        ONE_DAY_START,
        DEFAULT_DURATION
      );
      
      const receipt = await tx.wait();
      expect(await votingSystem.electionCount()).to.equal(1);
    });

    it("Should fail to create election with empty name", async function () {
      await expect(
        votingSystem.createElection("", "Description", ONE_DAY_START, DEFAULT_DURATION)
      ).to.be.revertedWith("Election name cannot be empty");
    });

    it("Should fail to create election with zero duration", async function () {
      await expect(
        votingSystem.createElection("Election", "Description", ONE_DAY_START, 0)
      ).to.be.revertedWith("Duration must be greater than 0");
    });

    it("Should only allow owner to create elections", async function () {
      await expect(
        votingSystem.connect(voter1).createElection("Election", "Description", ONE_DAY_START, DEFAULT_DURATION)
      ).to.be.revertedWith("Only owner can call this function");
    });
  });

  describe("Candidate Management", function () {
    beforeEach(async function () {
      // Create election that starts in 1 hour (allows adding candidates)
      await votingSystem.createElection("Test Election", "Description", ONE_HOUR_START, DEFAULT_DURATION);
    });

    it("Should add a candidate successfully", async function () {
      const tx = await votingSystem.addCandidate(1, "Candidate A");
      
      await expect(tx)
        .to.emit(votingSystem, "CandidateAdded")
        .withArgs(1, 1, "Candidate A");
    });

    it("Should fail to add candidate with empty name", async function () {
      await expect(
        votingSystem.addCandidate(1, "")
      ).to.be.revertedWith("Candidate name cannot be empty");
    });

    it("Should fail to add candidate to non-existent election", async function () {
      await expect(
        votingSystem.addCandidate(999, "Candidate")
      ).to.be.revertedWith("Election does not exist");
    });

    it("Should only allow owner to add candidates", async function () {
      await expect(
        votingSystem.connect(voter1).addCandidate(1, "Candidate")
      ).to.be.revertedWith("Only owner can call this function");
    });
  });

  describe("Voter Registration", function () {
    beforeEach(async function () {
      await votingSystem.createElection("Test Election", "Description", ONE_DAY_START, DEFAULT_DURATION);
    });

    it("Should register a voter successfully", async function () {
      const tx = await votingSystem.registerVoter(1, voter1.address);
      
      await expect(tx)
        .to.emit(votingSystem, "VoterRegistered")
        .withArgs(1, voter1.address);

      expect(await votingSystem.isRegisteredVoter(1, voter1.address)).to.be.true;
    });

    it("Should fail to register zero address", async function () {
      await expect(
        votingSystem.registerVoter(1, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid voter address");
    });

    it("Should fail to register voter twice", async function () {
      await votingSystem.registerVoter(1, voter1.address);
      
      await expect(
        votingSystem.registerVoter(1, voter1.address)
      ).to.be.revertedWith("Voter already registered");
    });

    it("Should only allow owner to register voters", async function () {
      await expect(
        votingSystem.connect(voter1).registerVoter(1, voter2.address)
      ).to.be.revertedWith("Only owner can call this function");
    });
  });

  describe("Voting", function () {
    beforeEach(async function () {
      // Create election that starts immediately (0 hours offset)
      await votingSystem.createElection("Test Election", "Description", IMMEDIATE_START, DEFAULT_DURATION);
      
      // Add candidates
      await votingSystem.addCandidate(1, "Candidate A");
      await votingSystem.addCandidate(1, "Candidate B");
      
      // Register voters
      await votingSystem.registerVoter(1, voter1.address);
      await votingSystem.registerVoter(1, voter2.address);
    });

    it("Should cast a vote successfully", async function () {
      const tx = await votingSystem.connect(voter1).vote(1, 1);
      
      await expect(tx)
        .to.emit(votingSystem, "VoteCasted")
        .withArgs(1, voter1.address, 1);
      
      expect(await votingSystem.hasVoted(1, voter1.address)).to.be.true;
      
      const candidate = await votingSystem.getCandidate(1, 1);
      expect(candidate.voteCount).to.equal(1);
    });

    it("Should fail if voter is not registered", async function () {
      await expect(
        votingSystem.connect(voter3).vote(1, 1)
      ).to.be.revertedWith("You are not registered to vote in this election");
    });

    it("Should fail if voter already voted", async function () {
      await votingSystem.connect(voter1).vote(1, 1);
      
      await expect(
        votingSystem.connect(voter1).vote(1, 2)
      ).to.be.revertedWith("You have already voted in this election");
    });
  });

  describe("Election Queries", function () {
    beforeEach(async function () {
      await votingSystem.createElection("Test Election", "Test Description", ONE_DAY_START, DEFAULT_DURATION);
    });

    it("Should get election details", async function () {
      const election = await votingSystem.getElection(1);
      
      expect(election.id).to.equal(1);
      expect(election.name).to.equal("Test Election");
      expect(election.description).to.equal("Test Description");
      expect(election.candidateCount).to.equal(0);
    });

    it("Should fail to get non-existent election", async function () {
      await expect(
        votingSystem.getElection(999)
      ).to.be.revertedWith("Election does not exist");
    });

    it("Should check if voter has voted", async function () {
      await votingSystem.registerVoter(1, voter1.address);
      
      expect(await votingSystem.hasVoted(1, voter1.address)).to.be.false;
    });
  });

  describe("Winner Determination", function () {
    it("Should fail to get winner before election ends", async function () {
      await votingSystem.createElection("Test Election", "Description", IMMEDIATE_START, DEFAULT_DURATION);
      
      await expect(
        votingSystem.getWinner(1)
      ).to.be.revertedWith("Election is still ongoing");
    });

    it("Should determine winner after election ends", async function () {
      await votingSystem.createElection("Test Election", "Description", IMMEDIATE_START, ONE_DAY_DURATION);
      
      // Fast forward time past election end
      await time.increase(2 * 24 * 60 * 60); // 2 days
      
      const winner = await votingSystem.getWinner(1);
      expect(winner.winnerId).to.equal(0); // No candidates, so no winner
      expect(winner.winnerName).to.equal("No winner");
    });
  });
});
