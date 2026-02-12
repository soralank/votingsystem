import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("TokenManager - Token Factory & Allocator", function () {
  let tokenManager: any;
  let votingContract: any;
  let alice: any;
  let bob: any;
  let charlie: any;
  let attacker: any;

  beforeEach(async function () {
    [votingContract, alice, bob, charlie, attacker] = await ethers.getSigners();

    // Deploy TokenManager
    const TokenManager = await ethers.getContractFactory("TokenManager");
    tokenManager = await TokenManager.connect(votingContract).deploy(votingContract.address);
  });

  describe("Deployment", function () {
    it("should set voting contract address", async function () {
      expect(await tokenManager.votingContract()).to.equal(votingContract.address);
    });

    it("should set correct TOKENS_PER_VOTE constant", async function () {
      expect(await tokenManager.TOKENS_PER_VOTE()).to.equal(1);
    });

    it("should revert deployment with zero address", async function () {
      const TokenManager = await ethers.getContractFactory("TokenManager");
      await expect(
        TokenManager.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid voting contract");
    });
  });

  describe("Token Creation", function () {
    it("should create token for poll", async function () {
      const tx = await tokenManager.connect(votingContract).createPollToken(
        1,
        "Vote-TestPoll",
        "VOTE1"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => {
        try {
          return tokenManager.interface.parseLog(log)?.name === "TokenCreated";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;

      const tokenAddress = await tokenManager.pollTokens(1);
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("should emit TokenCreated event", async function () {
      await expect(
        tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1", "VOTE1")
      ).to.emit(tokenManager, "TokenCreated");
    });

    it("should prevent duplicate token creation for same poll", async function () {
      await tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1", "VOTE1");

      await expect(
        tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1-Duplicate", "VOTE1DUP")
      ).to.be.revertedWith("Token already exists for this poll");
    });

    it("should allow creating tokens for different polls", async function () {
      await tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1", "VOTE1");
      await tokenManager.connect(votingContract).createPollToken(2, "Vote-Poll2", "VOTE2");
      await tokenManager.connect(votingContract).createPollToken(3, "Vote-Poll3", "VOTE3");

      expect(await tokenManager.pollTokens(1)).to.not.equal(ethers.ZeroAddress);
      expect(await tokenManager.pollTokens(2)).to.not.equal(ethers.ZeroAddress);
      expect(await tokenManager.pollTokens(3)).to.not.equal(ethers.ZeroAddress);

      // Each poll should have different token address
      const token1 = await tokenManager.pollTokens(1);
      const token2 = await tokenManager.pollTokens(2);
      const token3 = await tokenManager.pollTokens(3);

      expect(token1).to.not.equal(token2);
      expect(token2).to.not.equal(token3);
      expect(token1).to.not.equal(token3);
    });

    it("should revert if non-voting contract tries to create token", async function () {
      await expect(
        tokenManager.connect(attacker).createPollToken(1, "Malicious", "MAL")
      ).to.be.revertedWith("Only voting contract");
    });
  });

  describe("Token Allocation (Single)", function () {
    beforeEach(async function () {
      await tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1", "VOTE1");
    });

    it("should allocate tokens to voter", async function () {
      await tokenManager.connect(votingContract).allocateTokens(1, alice.address, 5);

      expect(await tokenManager.allocatedTokens(1, alice.address)).to.equal(5);
      expect(await tokenManager.getTokenBalance(1, alice.address)).to.equal(5);
    });

    it("should emit TokensAllocated event", async function () {
      await expect(
        tokenManager.connect(votingContract).allocateTokens(1, alice.address, 3)
      ).to.emit(tokenManager, "TokensAllocated")
        .withArgs(1, alice.address, 3);
    });

    it("should allow allocating to multiple voters", async function () {
      await tokenManager.connect(votingContract).allocateTokens(1, alice.address, 2);
      await tokenManager.connect(votingContract).allocateTokens(1, bob.address, 3);
      await tokenManager.connect(votingContract).allocateTokens(1, charlie.address, 1);

      expect(await tokenManager.getTokenBalance(1, alice.address)).to.equal(2);
      expect(await tokenManager.getTokenBalance(1, bob.address)).to.equal(3);
      expect(await tokenManager.getTokenBalance(1, charlie.address)).to.equal(1);
    });

    it("should accumulate allocations for same voter", async function () {
      await tokenManager.connect(votingContract).allocateTokens(1, alice.address, 2);
      await tokenManager.connect(votingContract).allocateTokens(1, alice.address, 3);

      expect(await tokenManager.allocatedTokens(1, alice.address)).to.equal(5);
      expect(await tokenManager.getTokenBalance(1, alice.address)).to.equal(5);
    });

    it("should revert if poll has no token", async function () {
      await expect(
        tokenManager.connect(votingContract).allocateTokens(99, alice.address, 5)
      ).to.be.revertedWith("No token for this poll");
    });

    it("should revert allocating to zero address", async function () {
      await expect(
        tokenManager.connect(votingContract).allocateTokens(1, ethers.ZeroAddress, 5)
      ).to.be.revertedWith("Invalid voter");
    });

    it("should revert allocating zero amount", async function () {
      await expect(
        tokenManager.connect(votingContract).allocateTokens(1, alice.address, 0)
      ).to.be.revertedWith("Amount must be positive");
    });

    it("should revert if non-voting contract tries to allocate", async function () {
      await expect(
        tokenManager.connect(attacker).allocateTokens(1, alice.address, 5)
      ).to.be.revertedWith("Only voting contract");
    });
  });

  describe("Token Allocation (Batch)", function () {
    beforeEach(async function () {
      await tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1", "VOTE1");
    });

    it("should batch allocate tokens to multiple voters", async function () {
      const voters = [alice.address, bob.address, charlie.address];
      const amounts = [2, 3, 1];

      await tokenManager.connect(votingContract).batchAllocateTokens(1, voters, amounts);

      expect(await tokenManager.getTokenBalance(1, alice.address)).to.equal(2);
      expect(await tokenManager.getTokenBalance(1, bob.address)).to.equal(3);
      expect(await tokenManager.getTokenBalance(1, charlie.address)).to.equal(1);
    });

    it("should emit TokensAllocated events for each voter", async function () {
      const voters = [alice.address, bob.address];
      const amounts = [5, 3];

      const tx = tokenManager.connect(votingContract).batchAllocateTokens(1, voters, amounts);

      await expect(tx).to.emit(tokenManager, "TokensAllocated").withArgs(1, alice.address, 5);
      await expect(tx).to.emit(tokenManager, "TokensAllocated").withArgs(1, bob.address, 3);
    });

    it("should revert if arrays have different lengths", async function () {
      const voters = [alice.address, bob.address];
      const amounts = [5]; // Mismatched length

      await expect(
        tokenManager.connect(votingContract).batchAllocateTokens(1, voters, amounts)
      ).to.be.revertedWith("Array length mismatch");
    });

    it("should revert if arrays are empty", async function () {
      await expect(
        tokenManager.connect(votingContract).batchAllocateTokens(1, [], [])
      ).to.be.revertedWith("Empty arrays");
    });

    it("should revert if any voter is zero address", async function () {
      const voters = [alice.address, ethers.ZeroAddress, bob.address];
      const amounts = [1, 1, 1];

      await expect(
        tokenManager.connect(votingContract).batchAllocateTokens(1, voters, amounts)
      ).to.be.revertedWith("Invalid voter");
    });

    it("should revert if any amount is zero", async function () {
      const voters = [alice.address, bob.address];
      const amounts = [5, 0];

      await expect(
        tokenManager.connect(votingContract).batchAllocateTokens(1, voters, amounts)
      ).to.be.revertedWith("Amount must be positive");
    });
  });

  describe("Token Burning", function () {
    beforeEach(async function () {
      await tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1", "VOTE1");
      await tokenManager.connect(votingContract).allocateTokens(1, alice.address, 5);
      await tokenManager.connect(votingContract).allocateTokens(1, bob.address, 3);
    });

    it("should burn tokens when voting", async function () {
      await tokenManager.connect(votingContract).burnTokensForVote(1, alice.address);

      expect(await tokenManager.getTokenBalance(1, alice.address)).to.equal(4); // 5 - 1
    });

    it("should emit TokensBurned event", async function () {
      await expect(
        tokenManager.connect(votingContract).burnTokensForVote(1, alice.address)
      ).to.emit(tokenManager, "TokensBurned")
        .withArgs(1, alice.address, 1); // TOKENS_PER_VOTE = 1
    });

    it("should allow multiple burns", async function () {
      await tokenManager.connect(votingContract).burnTokensForVote(1, alice.address);
      await tokenManager.connect(votingContract).burnTokensForVote(1, alice.address);
      await tokenManager.connect(votingContract).burnTokensForVote(1, bob.address);

      expect(await tokenManager.getTokenBalance(1, alice.address)).to.equal(3); // 5 - 2
      expect(await tokenManager.getTokenBalance(1, bob.address)).to.equal(2); // 3 - 1
    });

    it("should revert burning if insufficient tokens", async function () {
      // Bob has 3 tokens, burn 3 times
      await tokenManager.connect(votingContract).burnTokensForVote(1, bob.address);
      await tokenManager.connect(votingContract).burnTokensForVote(1, bob.address);
      await tokenManager.connect(votingContract).burnTokensForVote(1, bob.address);

      // 4th burn should fail
      await expect(
        tokenManager.connect(votingContract).burnTokensForVote(1, bob.address)
      ).to.be.revertedWith("Insufficient tokens");
    });

    it("should revert if poll has no token", async function () {
      await expect(
        tokenManager.connect(votingContract).burnTokensForVote(99, alice.address)
      ).to.be.revertedWith("No token for this poll");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1", "VOTE1");
      await tokenManager.connect(votingContract).allocateTokens(1, alice.address, 10);
      await tokenManager.connect(votingContract).allocateTokens(1, bob.address, 1);
    });

    it("should check if voter has vote tokens", async function () {
      expect(await tokenManager.hasVoteTokens(1, alice.address)).to.be.true;
      expect(await tokenManager.hasVoteTokens(1, bob.address)).to.be.true;
      expect(await tokenManager.hasVoteTokens(1, charlie.address)).to.be.false;
    });

    it("should return false for non-existent poll", async function () {
      expect(await tokenManager.hasVoteTokens(99, alice.address)).to.be.false;
    });

    it("should get token balance", async function () {
      expect(await tokenManager.getTokenBalance(1, alice.address)).to.equal(10);
      expect(await tokenManager.getTokenBalance(1, bob.address)).to.equal(1);
      expect(await tokenManager.getTokenBalance(1, charlie.address)).to.equal(0);
    });

    it("should return zero for non-existent poll", async function () {
      expect(await tokenManager.getTokenBalance(99, alice.address)).to.equal(0);
    });

    it("should get poll token address", async function () {
      const tokenAddress = await tokenManager.getPollToken(1);
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("should return zero address for non-existent poll token", async function () {
      expect(await tokenManager.getPollToken(99)).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Token Voting Enable/Disable", function () {
    beforeEach(async function () {
      await tokenManager.connect(votingContract).createPollToken(1, "Vote-Poll1", "VOTE1");
    });

    it("should enable token voting for poll", async function () {
      await tokenManager.connect(votingContract).enableTokenVoting(1);

      expect(await tokenManager.isTokenVotingEnabled(1)).to.be.true;
    });

    it("should emit TokenVotingEnabled event", async function () {
      await expect(
        tokenManager.connect(votingContract).enableTokenVoting(1)
      ).to.emit(tokenManager, "TokenVotingEnabled")
        .withArgs(1);
    });

    it("should disable token voting for poll", async function () {
      await tokenManager.connect(votingContract).enableTokenVoting(1);
      await tokenManager.connect(votingContract).disableTokenVoting(1);

      expect(await tokenManager.isTokenVotingEnabled(1)).to.be.false;
    });

    it("should emit TokenVotingDisabled event", async function () {
      await tokenManager.connect(votingContract).enableTokenVoting(1);

      await expect(
        tokenManager.connect(votingContract).disableTokenVoting(1)
      ).to.emit(tokenManager, "TokenVotingDisabled")
        .withArgs(1);
    });

    it("should revert enabling if poll has no token", async function () {
      await expect(
        tokenManager.connect(votingContract).enableTokenVoting(99)
      ).to.be.revertedWith("No token for this poll");
    });
  });
});
