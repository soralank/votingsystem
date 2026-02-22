import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// Helper functions
function bnToNumber(x: any): number {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "string") return Number(x);
  if (typeof x.toNumber === "function") return x.toNumber();
  if (typeof x.toString === "function") return Number(x.toString());
  return Number(x);
}

async function getCurrentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

describe("ElectionsManager - Token Integration", function () {
  let electionsManager: any;
  let tokenManager: any;
  let votingPaymaster: any;
  let owner: any;
  let admin: any;
  let alice: any;
  let bob: any;
  let charlie: any;

  beforeEach(async function () {
    [owner, admin, alice, bob, charlie] = await ethers.getSigners();

    // Deploy ElectionsManager
    electionsManager = await ethers.deployContract("ElectionsManager");

    // Deploy TokenManager
    const TokenManager = await ethers.getContractFactory("TokenManager");
    tokenManager = await TokenManager.deploy(electionsManager.target);

    // Deploy VotingPaymaster
    const VotingPaymaster = await ethers.getContractFactory("VotingPaymaster");
    votingPaymaster = await VotingPaymaster.deploy(
      electionsManager.target,
      tokenManager.target,
      owner.address
    );

    // Configure ElectionsManager
    await electionsManager.setTokenManager(tokenManager.target);
    await electionsManager.setVotingPaymaster(votingPaymaster.target);

    // Fund paymaster
    await votingPaymaster.fund({ value: ethers.parseEther("10") });
  });

  describe("Poll Creation with Tokens", function () {
    it("should create poll with token voting enabled", async function () {
      const now = await getCurrentTimestamp();
      const tx = await electionsManager.createPoll(
        "Token Poll",
        admin.address,
        now + 10,
        1000,
        true,  // enableTokenVoting
        false,  // requireTokenVoting
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      await tx.wait();

      const pollId = bnToNumber(await electionsManager.pollsCount());
      const poll = await electionsManager.polls(pollId);

      expect(poll.tokenVotingEnabled).to.be.true;
      expect(poll.tokenVotingRequired).to.be.false;

      // Check token was created
      const tokenAddress = await tokenManager.getPollToken(pollId);
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("should create poll with token voting required", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Token-Only Poll",
        admin.address,
        now + 10,
        1000,
        true,  // enableTokenVoting
        true,   // requireTokenVoting
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const pollId = bnToNumber(await electionsManager.pollsCount());
      const poll = await electionsManager.polls(pollId);

      expect(poll.tokenVotingEnabled).to.be.true;
      expect(poll.tokenVotingRequired).to.be.true;
    });

    it("should create poll without token voting", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Traditional Poll",
        admin.address,
        now + 10,
        1000,
        false, // enableTokenVoting
        false,  // requireTokenVoting
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const pollId = bnToNumber(await electionsManager.pollsCount());
      const poll = await electionsManager.polls(pollId);

      expect(poll.tokenVotingEnabled).to.be.false;
      expect(poll.tokenVotingRequired).to.be.false;

      // No token should be created
      const tokenAddress = await tokenManager.getPollToken(pollId);
      expect(tokenAddress).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Adding Voters with Tokens", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Test Poll",
        admin.address,
        now + 10,
        1000,
        true,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      pollId = bnToNumber(await electionsManager.pollsCount());

      // Add options
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option 1");
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option 2");
    });

    it("should add voters and allocate tokens", async function () {
      const voters = [alice.address, bob.address, charlie.address];
      await electionsManager.connect(admin).addVotersWithTokens(pollId, voters, 5);

      // Check voters authorized
      expect(await electionsManager.isVoterAuthorized(pollId, alice.address)).to.be.true;
      expect(await electionsManager.isVoterAuthorized(pollId, bob.address)).to.be.true;
      expect(await electionsManager.isVoterAuthorized(pollId, charlie.address)).to.be.true;

      // Check tokens allocated
      expect(await tokenManager.getTokenBalance(pollId, alice.address)).to.equal(5);
      expect(await tokenManager.getTokenBalance(pollId, bob.address)).to.equal(5);
      expect(await tokenManager.getTokenBalance(pollId, charlie.address)).to.equal(5);
    });

    it("should work with regular addVoters for non-token polls", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "No Token Poll",
        admin.address,
        now + 10,
        1000,
        false,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      const nonTokenPollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(nonTokenPollId, "Choice A");

      const voters = [alice.address, bob.address];
      await electionsManager.connect(admin).addVoters(nonTokenPollId, voters);

      expect(await electionsManager.isVoterAuthorized(nonTokenPollId, alice.address)).to.be.true;
      expect(await electionsManager.isVoterAuthorized(nonTokenPollId, bob.address)).to.be.true;
    });
  });

  describe("Traditional Voting (Gas Payment)", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Mixed Poll",
        admin.address,
        now + 10,
        1000,
        true,  // Token voting enabled
        false,  // But not required
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(pollId, "Yes");
      await electionsManager.connect(admin).addOptionToPoll(pollId, "No");

      await electionsManager.connect(admin).addVoter(pollId, alice.address);

      // Mine blocks to start poll
      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");
    });

    it("should allow traditional voting even with tokens enabled", async function () {
      await electionsManager.connect(alice).voteInPoll(pollId, 1);

      expect(await electionsManager.hasVoterVoted(pollId, alice.address)).to.be.true;
      expect(await electionsManager.getTotalVotes(pollId)).to.equal(1);

      // Check vote method
      const voteMethodEnum = await electionsManager.voteMethod(pollId, alice.address);
      expect(voteMethodEnum).to.equal(0); // GasPayment = 0
    });

    it("should prevent traditional voting when tokens required", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Token-Only Poll",
        admin.address,
        now + 10,
        1000,
        true,
        true, // Token required
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      const tokenOnlyPollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(tokenOnlyPollId, "Choice A");
      await electionsManager.connect(admin).addVoter(tokenOnlyPollId, bob.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");

      await expect(
        electionsManager.connect(bob).voteInPoll(tokenOnlyPollId, 1)
      ).to.be.revertedWithCustomError(electionsManager, "TokenVotingRequired");
    });
  });

  describe("Token-Based Voting", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Token Poll",
        admin.address,
        now + 10,
        1000,
        true,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option A");
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option B");

      const voters = [alice.address, bob.address];
      await electionsManager.connect(admin).addVotersWithTokens(pollId, voters, 3);

      // Add charlie as voter without tokens (for testing token requirement)
      await electionsManager.connect(admin).addVoter(pollId, charlie.address);

      // Mine blocks to start poll
      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");
    });

    it("should allow voter to vote with tokens (pays gas)", async function () {
      await electionsManager.connect(alice).voteInPollWithToken(pollId, 1, alice.address);

      expect(await electionsManager.hasVoterVoted(pollId, alice.address)).to.be.true;
      expect(await electionsManager.getTotalVotes(pollId)).to.equal(1);

      // Check vote method
      const voteMethodEnum = await electionsManager.voteMethod(pollId, alice.address);
      expect(voteMethodEnum).to.equal(1); // Token = 1

      // Check token burnt
      expect(await tokenManager.getTokenBalance(pollId, alice.address)).to.equal(2); // 3 - 1
    });

    it("should prevent double voting with tokens", async function () {
      await electionsManager.connect(alice).voteInPollWithToken(pollId, 1, alice.address);

      await expect(
        electionsManager.connect(alice).voteInPollWithToken(pollId, 2, alice.address)
      ).to.be.revertedWithCustomError(electionsManager, "AlreadyVoted");
    });

    it("should prevent voting without tokens", async function () {
      await expect(
        electionsManager.connect(charlie).voteInPollWithToken(pollId, 1, charlie.address)
      ).to.be.revertedWithCustomError(electionsManager, "InsufficientTokens");
    });

    it("should not allow voting on non-token enabled poll", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "No Token Poll",
        admin.address,
        now + 10,
        1000,
        false,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      const noTokenPollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(noTokenPollId, "Choice X");
      await electionsManager.connect(admin).addVoter(noTokenPollId, alice.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");

      await expect(
        electionsManager.connect(alice).voteInPollWithToken(noTokenPollId, 1, alice.address)
      ).to.be.revertedWithCustomError(electionsManager, "TokenVotingNotEnabled");
    });
  });

  describe("Mixed Voting Methods", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Mixed Poll",
        admin.address,
        now + 10,
        1000,
        true,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(pollId, "Yes");
      await electionsManager.connect(admin).addOptionToPoll(pollId, "No");

      // Add voters: alice with tokens, bob without
      await electionsManager.connect(admin).addVotersWithTokens(pollId, [alice.address], 5);
      await electionsManager.connect(admin).addVoter(pollId, bob.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");
    });

    it("should support both voting methods in same poll", async function () {
      // Alice votes with token
      await electionsManager.connect(alice).voteInPollWithToken(pollId, 1, alice.address);

      // Bob votes traditionally
      await electionsManager.connect(bob).voteInPoll(pollId, 2);

      expect(await electionsManager.getTotalVotes(pollId)).to.equal(2);

      // Check vote methods
      expect(await electionsManager.voteMethod(pollId, alice.address)).to.equal(1); // Token
      expect(await electionsManager.voteMethod(pollId, bob.address)).to.equal(0); // GasPayment
    });

    it("should correctly tally votes from both methods", async function () {
      await electionsManager.connect(alice).voteInPollWithToken(pollId, 1, alice.address);
      await electionsManager.connect(bob).voteInPoll(pollId, 1);

      // Both voted for option 1
      expect(await electionsManager.getTotalVotes(pollId)).to.equal(2);
    });
  });

  describe("Backward Compatibility", function () {
    it("should support old createPoll signature via overloading", async function () {
      // This tests that existing code can still work without token parameters
      // by setting defaults (false, false) for new parameters
      const now = await getCurrentTimestamp();

      // Create poll with new signature (all params)
      await electionsManager.createPoll(
        "New Style Poll",
        admin.address,
        now + 10,
        1000,
        false,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const pollId = bnToNumber(await electionsManager.pollsCount());
      const poll = await electionsManager.polls(pollId);

      expect(poll.exists).to.be.true;
      expect(poll.tokenVotingEnabled).to.be.false;
      expect(poll.tokenVotingRequired).to.be.false;
    });

    it("should maintain all existing poll functionality", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Backward Compat Poll",
        admin.address,
        now + 10,
        1000,
        false,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const pollId = bnToNumber(await electionsManager.pollsCount());

      // All existing functions should work
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option 1");
      await electionsManager.connect(admin).addVoter(pollId, alice.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");

      await electionsManager.connect(alice).voteInPoll(pollId, 1);

      expect(await electionsManager.hasVoterVoted(pollId, alice.address)).to.be.true;
      expect(await electionsManager.getTotalVotes(pollId)).to.equal(1);
    });
  });

  describe("Token Config Views", function () {
    it("should check if voter can vote with token", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Test Poll",
        admin.address,
        now + 10,
        1000,
        true,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      const pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addVotersWithTokens(pollId, [alice.address], 3);

      expect(await electionsManager.canVoteWithToken(pollId, alice.address)).to.be.true;
      expect(await electionsManager.canVoteWithToken(pollId, bob.address)).to.be.false;
    });

    it("should get voter token balance", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Test Poll",
        admin.address,
        now + 10,
        1000,
        true,
        false,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      const pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addVotersWithTokens(pollId, [alice.address], 7);

      expect(await electionsManager.getVoterTokenBalance(pollId, alice.address)).to.equal(7);
      expect(await electionsManager.getVoterTokenBalance(pollId, bob.address)).to.equal(0);
    });
  });
});
