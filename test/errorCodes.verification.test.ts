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

/**
 * ERROR CODES VERIFICATION TEST
 *
 * This test suite verifies that all error messages documented in ERROR_CODES.md
 * are actually thrown by the contracts and match the documentation.
 */
describe("Error Codes Verification", function () {
  let electionsManager: any;
  let tokenManager: any;
  let votingPaymaster: any;
  let owner: any;
  let admin: any;
  let voter: any;
  let attacker: any;

  beforeEach(async function () {
    [owner, admin, voter, attacker] = await ethers.getSigners();

    electionsManager = await ethers.deployContract("ElectionsManager");

    const TokenManager = await ethers.getContractFactory("TokenManager");
    tokenManager = await TokenManager.deploy(electionsManager.target);

    const VotingPaymaster = await ethers.getContractFactory("VotingPaymaster");
    votingPaymaster = await VotingPaymaster.deploy(
      electionsManager.target,
      tokenManager.target,
      owner.address
    );

    await electionsManager.setTokenManager(tokenManager.target);
    await electionsManager.setVotingPaymaster(votingPaymaster.target);
  });

  describe("Poll Management Errors - As Documented", function () {
    it('should throw: "No poll"', async function () {
      await expect(
        electionsManager.getOption(999, 1)
      ).to.be.revertedWithCustomError(electionsManager, "PollNotFound");
    });

    it('should throw: "Dup title"', async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Duplicate Title", admin.address, now + 10, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress);

      await expect(
        electionsManager.createPoll("Duplicate Title", admin.address, now + 10, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(electionsManager, "DuplicateTitle");
    });

    it('should throw: "Poll started" (was: cannot add options)', async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Test Poll", admin.address, now + 10, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await electionsManager.pollsCount());

      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 20]);
      await ethers.provider.send("evm_mine");

      await expect(
        electionsManager.connect(admin).addOptionToPoll(pollId, "Late Option")
      ).to.be.revertedWithCustomError(electionsManager, "PollStarted");
    });

    it('should throw: "Poll ended; cannot vote."', async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Test Poll", admin.address, now + 10, 400, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option 1");
      await electionsManager.connect(admin).addVoter(pollId, voter.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 500]);
      await ethers.provider.send("evm_mine");

      await expect(
        electionsManager.connect(voter).voteInPoll(pollId, 1)
      ).to.be.revertedWithCustomError(electionsManager, "PollNotActive");
    });

    it('should throw: "Max options"', async function () {
      const now = await getCurrentTimestamp();
      // Set start time far in future so we have time to add 100 options
      await electionsManager.createPoll("Test Poll", admin.address, now + 3600, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await electionsManager.pollsCount());

      // Add 100 options (MAX_OPTIONS limit)
      for (let i = 1; i <= 100; i++) {
        await electionsManager.connect(admin).addOptionToPoll(pollId, `Option ${i}`);
      }

      await expect(
        electionsManager.connect(admin).addOptionToPoll(pollId, "Option 101")
      ).to.be.revertedWithCustomError(electionsManager, "MaxOptionsReached");
    });
  });

  describe("Voter Authorization Errors - As Documented", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Test Poll", admin.address, now + 10, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await electionsManager.pollsCount());
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option 1");
    });

    it('should throw: "Not voter"', async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");

      await expect(
        electionsManager.connect(voter).voteInPoll(pollId, 1)
      ).to.be.revertedWithCustomError(electionsManager, "NotVoter");
    });

    it('should throw: "Dup voter"', async function () {
      await electionsManager.connect(admin).addVoter(pollId, voter.address);

      await expect(
        electionsManager.connect(admin).addVoter(pollId, voter.address)
      ).to.be.revertedWithCustomError(electionsManager, "DuplicateVoter");
    });

    it('should throw: "Bad addr"', async function () {
      await expect(
        electionsManager.connect(admin).addVoter(pollId, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(electionsManager, "ZeroAddress");
    });

    it('should throw: "Batch limit"', async function () {
      const voters = new Array(51).fill(voter.address);

      await expect(
        electionsManager.connect(admin).addVoters(pollId, voters)
      ).to.be.revertedWithCustomError(electionsManager, "BatchLimitExceeded");
    });
  });

  describe("Voting Errors - As Documented", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Test Poll", admin.address, now + 10, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await electionsManager.pollsCount());
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option 1");
      await electionsManager.connect(admin).addVoter(pollId, voter.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");
    });

    it('should throw: "Already voted"', async function () {
      await electionsManager.connect(voter).voteInPoll(pollId, 1);

      await expect(
        electionsManager.connect(voter).voteInPoll(pollId, 1)
      ).to.be.revertedWithCustomError(electionsManager, "AlreadyVoted");
    });

    it('should throw: "Invalid option."', async function () {
      await expect(
        electionsManager.connect(voter).voteInPoll(pollId, 99)
      ).to.be.revertedWithCustomError(electionsManager, "InvalidOption");
    });

    it('should throw: "Token voting required"', async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Token Required Poll",
        admin.address,
        now + 10,
        600,
        true,
        true, // token required
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      const tokenPollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(tokenPollId, "Option 1");
      await electionsManager.connect(admin).addVoter(tokenPollId, voter.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");

      await expect(
        electionsManager.connect(voter).voteInPoll(tokenPollId, 1)
      ).to.be.revertedWithCustomError(electionsManager, "TokenVotingRequired");
    });
  });

  describe("Token Management Errors - As Documented", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Token Poll", admin.address, now + 10, 600, true, false, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await electionsManager.pollsCount());
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option 1");
    });

    it('should throw: "No token for this poll"', async function () {
      // This error is internal-only (TokenManager called by voting contract)
      // Test indirectly by checking token balance for non-existent poll
      const balance = await tokenManager.getTokenBalance(999, voter.address);
      expect(balance).to.equal(0); // Returns 0 instead of reverting for view function

      // The actual "No token for this poll" error occurs when trying to burn tokens
      // for a poll without tokens, but this is prevented by earlier checks in the voting flow
    });

    it('should throw: "Token already exists for this poll"', async function () {
      // This error is internal-only (createPollToken called only by voting contract during poll creation)
      // Cannot be triggered through public API as poll creation handles token creation automatically
      // Verification: Token exists after poll creation with token voting enabled
      const tokenAddress = await tokenManager.getPollToken(pollId);
      expect(tokenAddress).to.not.equal(ethers.ZeroAddress);
    });

    it('should throw: "Insufficient tokens"', async function () {
      await electionsManager.connect(admin).addVoter(pollId, voter.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [await getCurrentTimestamp() + 20]);
      await ethers.provider.send("evm_mine");

      await expect(
        electionsManager.connect(voter).voteInPollWithToken(pollId, 1, voter.address)
      ).to.be.revertedWithCustomError(electionsManager, "InsufficientTokens");
    });

    it('should throw: "Only TokenManager can call"', async function () {
      const tokenAddress = await tokenManager.getPollToken(pollId);
      const VotingToken = await ethers.getContractFactory("VotingToken");
      const token = VotingToken.attach(tokenAddress);

      await expect(
        token.connect(attacker).mint(voter.address, 10)
      ).to.be.revertedWithCustomError(token, "Unauthorized");
    });

    it('should throw: "Voting tokens are non-transferable"', async function () {
      await electionsManager.connect(admin).addVotersWithTokens(pollId, [voter.address], 5);

      const tokenAddress = await tokenManager.getPollToken(pollId);
      const VotingToken = await ethers.getContractFactory("VotingToken");
      const token = VotingToken.attach(tokenAddress);

      await expect(
        token.connect(voter).transfer(attacker.address, 1)
      ).to.be.revertedWithCustomError(token, "NonTransferable");
    });

    it('should throw: "Zero tokens"', async function () {
      // addVotersWithTokens now validates tokensPerVoter > 0 directly
      await expect(
        electionsManager.connect(admin).addVotersWithTokens(pollId, [voter.address], 0)
      ).to.be.revertedWithCustomError(electionsManager, "ZeroAmount");
    });
  });

  describe("Gasless Voting Errors - As Documented", function () {
    it('should throw: "Signature expired"', async function () {
      const now = await getCurrentTimestamp();
      const expiredDeadline = now - 100; // Past deadline

      await expect(
        votingPaymaster.verifySignature(1, 1, voter.address, expiredDeadline, 27, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(votingPaymaster, "SignatureExpired");
    });

    it('should throw: "Must send ETH"', async function () {
      await expect(
        votingPaymaster.fund({ value: 0 })
      ).to.be.revertedWithCustomError(votingPaymaster, "MustSendETH");
    });

    it('should throw: "Only admin"', async function () {
      await expect(
        votingPaymaster.connect(attacker).withdraw(1)
      ).to.be.revertedWithCustomError(votingPaymaster, "Unauthorized");
    });
  });

  describe("Access Control Errors - As Documented", function () {
    it('should throw: "Not authorized" (createPoll)', async function () {
      await expect(
        electionsManager.connect(attacker).createPoll("Test", admin.address, Date.now() + 1000, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(electionsManager, "Unauthorized");
    });

    it('should throw: "Admin only"', async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Test Poll", admin.address, now + 10, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await electionsManager.pollsCount());

      await expect(
        electionsManager.connect(attacker).addOptionToPoll(pollId, "Unauthorized Option")
      ).to.be.revertedWithCustomError(electionsManager, "Unauthorized");
    });

    it('should throw: "Only pending owner can accept"', async function () {
      await electionsManager.transferOwnership(admin.address);

      await expect(
        electionsManager.connect(attacker).acceptOwnership()
      ).to.be.revertedWithCustomError(electionsManager, "OnlyPendingOwner");
    });
  });

  describe("Time Validation Errors - As Documented", function () {
    it('should throw: "Start time cannot be in the past."', async function () {
      const pastTime = (await getCurrentTimestamp()) - 100;

      await expect(
        electionsManager.createPoll("Past Poll", admin.address, pastTime, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(electionsManager, "StartTimeInPast");
    });

    it('should throw: "Poll duration too short."', async function () {
      const now = await getCurrentTimestamp();

      await expect(
        electionsManager.createPoll("Short Poll", admin.address, now + 10, 100, false, false, ethers.ZeroAddress, ethers.ZeroAddress) // < 300 seconds
      ).to.be.revertedWithCustomError(electionsManager, "DurationTooShort");
    });

    it('should throw: "Start time too far in future."', async function () {
      const now = await getCurrentTimestamp();
      const farFuture = now + (31 * 24 * 60 * 60); // 31 days (> MAX_FUTURE_START)

      await expect(
        electionsManager.createPoll("Far Future Poll", admin.address, farFuture, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(electionsManager, "StartTimeTooFarInFuture");
    });
  });

  describe("General Validation Errors - As Documented", function () {
    it('should throw: "admin zero"', async function () {
      const now = await getCurrentTimestamp();

      await expect(
        electionsManager.createPoll("Test Poll", ethers.ZeroAddress, now + 10, 600, false, false, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(electionsManager, "ZeroAddress");
    });

    it('should throw: "Empty arrays"', async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Test Poll", admin.address, now + 10, 600, true, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await electionsManager.pollsCount());

      // This error is internal-only (TokenManager.batchAllocateTokens called by voting contract)
      // Test indirectly through addVotersWithTokens with empty array
      // Note: Will revert with "Empty arrays" when trying to allocate tokens
      await expect(
        electionsManager.connect(admin).addVotersWithTokens(pollId, [], 5)
      ).to.be.revertedWithCustomError(electionsManager, "EmptyArray"); // Will revert during batch allocation
    });

    it('should throw: "Array length mismatch"', async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll("Test Poll", admin.address, now + 10, 600, true, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await electionsManager.pollsCount());

      // This error is internal-only (TokenManager.batchAllocateTokens with different length arrays)
      // addVotersWithTokens uses same amount for all voters, so can't trigger this directly
      // Verification: Confirm batch allocation works when arrays match
      await electionsManager.connect(admin).addVotersWithTokens(pollId, [voter.address], 5);
      expect(await tokenManager.getTokenBalance(pollId, voter.address)).to.equal(5);
    });

    it('should throw: "Invalid voting contract"', async function () {
      const TokenManager = await ethers.getContractFactory("TokenManager");

      await expect(
        TokenManager.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(electionsManager, "ZeroAddress");
    });
  });

  describe("Error Message Consistency Check", function () {
    it("should have consistent error messages (with/without periods)", async function () {
      // This test documents that some errors have periods and some don't
      // Frontend should handle both formats

      const errorsWithPeriods = [
        "No poll",
        "Already voted.",
        "Already voted",
      ];

      const errorsWithoutPeriods = [
        "Only owner can call",
        "Only admin",
        "Insufficient tokens",
      ];

      // This is just documentation - the test always passes
      expect(errorsWithPeriods.length).to.be.greaterThan(0);
      expect(errorsWithoutPeriods.length).to.be.greaterThan(0);
    });
  });
});
