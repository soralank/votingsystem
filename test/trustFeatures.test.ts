import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

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

describe("Trust Features", function () {
  let em: any;
  let sbm: any;
  let tokenManager: any;
  let owner: any;
  let admin: any;
  let alice: any;
  let bob: any;
  let charlie: any;
  let attacker: any;

  beforeEach(async function () {
    [owner, admin, alice, bob, charlie, attacker] = await ethers.getSigners();

    // Deploy ElectionsManager
    em = await ethers.deployContract("ElectionsManager");

    // Deploy TokenManager
    const TokenManager = await ethers.getContractFactory("TokenManager");
    tokenManager = await TokenManager.deploy(em.target);

    // Deploy SecretBallotManager
    const SBM = await ethers.getContractFactory("SecretBallotManager");
    sbm = await SBM.deploy(em.target);

    // Configure
    await em.setTokenManager(tokenManager.target);
    await em.setSecretBallotManager(sbm.target);
  });

  // ── Infrastructure Lock ──────────────────────────────────────

  describe("Infrastructure Lock", function () {
    it("should lock infrastructure on first poll creation", async function () {
      expect(await em.infrastructureLocked()).to.equal(false);

      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("Poll1", admin.address, now + 10, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);

      expect(await em.infrastructureLocked()).to.equal(true);
    });

    it("should prevent changing TokenManager after lock", async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("Poll1", admin.address, now + 10, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);

      const TokenManager2 = await ethers.getContractFactory("TokenManager");
      const tm2 = await TokenManager2.deploy(em.target);

      await expect(em.connect(owner).setTokenManager(tm2.target))
        .to.be.revertedWith("Infra locked");
    });

    it("should prevent changing Paymaster after lock", async function () {
      const VotingPaymaster = await ethers.getContractFactory("VotingPaymaster");
      const vp = await VotingPaymaster.deploy(em.target, tokenManager.target, owner.address);
      await em.setVotingPaymaster(vp.target);

      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("Poll1", admin.address, now + 10, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);

      const vp2 = await VotingPaymaster.deploy(em.target, tokenManager.target, owner.address);
      await expect(em.connect(owner).setVotingPaymaster(vp2.target))
        .to.be.revertedWith("Infra locked");
    });

    it("should allow manual lockInfrastructure by owner", async function () {
      await expect(em.connect(owner).lockInfrastructure())
        .to.emit(em, "InfrastructureLocked");
      expect(await em.infrastructureLocked()).to.equal(true);
    });

    it("should not emit event when already locked", async function () {
      await em.connect(owner).lockInfrastructure();
      // Second call should not revert, but shouldn't emit (idempotent)
      const tx = await em.connect(owner).lockInfrastructure();
      const receipt = await tx.wait();
      // Filter InfrastructureLocked events
      const events = receipt.logs.filter((log: any) => {
        try { return em.interface.parseLog(log)?.name === "InfrastructureLocked"; }
        catch { return false; }
      });
      expect(events.length).to.equal(0);
    });

    it("should reject lockInfrastructure from non-owner", async function () {
      await expect(em.connect(attacker).lockInfrastructure())
        .to.be.revertedWith("Only owner can call");
    });
  });

  // ── Democratic Reveal (Anti-Suppression) ─────────────────────

  describe("Democratic Reveal", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("DemoReveal", admin.address, now + 10, 400, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await em.pollsCount());
      await em.connect(admin).addOptionToPoll(pollId, "Yes");
      await em.connect(admin).addOptionToPoll(pollId, "No");
      await em.connect(admin).addVoter(pollId, alice.address);

      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);
      await em.connect(alice).voteInPoll(pollId, 1);
    });

    it("should not allow reveal before poll ends", async function () {
      await expect(em.connect(admin).revealResults(pollId))
        .to.be.revertedWith("Poll not ended");
    });

    it("should allow ANYONE to reveal after time expires (not just admin)", async function () {
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
      await ethers.provider.send("evm_mine", []);

      // Attacker (non-admin) can reveal — democratic!
      await expect(em.connect(attacker).revealResults(pollId))
        .to.emit(em, "ResultsRevealed").withArgs(pollId);

      expect((await em.polls(pollId)).revealed).to.equal(true);
    });

    it("should allow admin to reveal after time expires", async function () {
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
      await ethers.provider.send("evm_mine", []);

      await em.connect(admin).revealResults(pollId);
      expect((await em.polls(pollId)).revealed).to.equal(true);
    });

    it("should reject double reveal", async function () {
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
      await ethers.provider.send("evm_mine", []);

      await em.connect(admin).revealResults(pollId);
      await expect(em.connect(admin).revealResults(pollId))
        .to.be.revertedWith("Already revealed.");
    });

    it("should hide vote counts before reveal, show after", async function () {
      // Before reveal: everyone sees 0
      const opt = await em.getOption(pollId, 1);
      expect(bnToNumber(opt[2])).to.equal(0);

      // Reveal
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
      await ethers.provider.send("evm_mine", []);
      await em.connect(admin).revealResults(pollId);

      // After reveal: see real counts
      const optAfter = await em.getOption(pollId, 1);
      expect(bnToNumber(optAfter[2])).to.equal(1);
    });
  });

  // ── Metadata Lock ────────────────────────────────────────────

  describe("Metadata Lock", function () {
    it("should allow setting metadata before poll starts", async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("MetaPoll", admin.address, now + 100, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await em.pollsCount());

      await expect(em.connect(admin).setPollMetadata(pollId, "ipfs://QmTest123"))
        .to.emit(em, "PollMetadataSet").withArgs(pollId, "ipfs://QmTest123");
    });

    it("should prevent setting metadata after poll starts", async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("MetaPoll", admin.address, now + 10, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await em.pollsCount());

      // Time-warp past start
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(em.connect(admin).setPollMetadata(pollId, "ipfs://tampered"))
        .to.be.revertedWith("Poll started");
    });
  });

  // ── Secret Ballot Guard ──────────────────────────────────────

  describe("Secret Ballot Guards", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("SecretPoll", admin.address, now + 60, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await em.pollsCount());
      await em.connect(admin).addOptionToPoll(pollId, "Opt1");
      await em.connect(admin).addOptionToPoll(pollId, "Opt2");
      await em.connect(admin).addVoter(pollId, alice.address);
      await em.connect(admin).enableSecretBallot(pollId);
    });

    it("should prevent direct voting when secret ballot is enabled", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(em.connect(alice).voteInPoll(pollId, 1))
        .to.be.revertedWith("Secret ballot enabled. Use commitVote().");
    });

    it("should prevent enableSecretBallot after poll starts", async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("Late", admin.address, now + 10, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pid2 = bnToNumber(await em.pollsCount());

      const startTime = bnToNumber(await em.getPollStartTime(pid2));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(em.connect(admin).enableSecretBallot(pid2))
        .to.be.revertedWith("Poll already started.");
    });

    it("should prevent double enableSecretBallot", async function () {
      await expect(em.connect(admin).enableSecretBallot(pollId))
        .to.be.revertedWith("Already enabled");
    });

    it("should emit SecretBallotEnabled event", async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("EventPoll", admin.address, now + 60, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pid = bnToNumber(await em.pollsCount());

      await expect(em.connect(admin).enableSecretBallot(pid))
        .to.emit(em, "SecretBallotEnabled").withArgs(pid);
    });
  });

  // ── Secret Ballot: Commit-Reveal Flow ────────────────────────

  describe("Secret Ballot: Commit-Reveal Flow", function () {
    let pollId: number;
    let salt: string;
    let commitHash: string;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("CommitReveal", admin.address, now + 60, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await em.pollsCount());
      await em.connect(admin).addOptionToPoll(pollId, "A");
      await em.connect(admin).addOptionToPoll(pollId, "B");
      await em.connect(admin).addVoter(pollId, alice.address);
      await em.connect(admin).addVoter(pollId, bob.address);
      await em.connect(admin).enableSecretBallot(pollId);

      // Generate commit hash for alice voting option 1
      salt = ethers.hexlify(ethers.randomBytes(32));
      commitHash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32", "address"],
        [pollId, 1, salt, alice.address]
      );
    });

    it("should allow commit during voting period", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(sbm.connect(alice).commitVote(pollId, commitHash))
        .to.emit(sbm, "VoteCommitted").withArgs(pollId, alice.address);

      expect(await sbm.hasCommitted(pollId, alice.address)).to.equal(true);
      expect(bnToNumber(await sbm.commitCount(pollId))).to.equal(1);
    });

    it("should reject commit from unauthorized voter", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(sbm.connect(attacker).commitVote(pollId, commitHash))
        .to.be.revertedWith("Not authorized.");
    });

    it("should reject double commit", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await sbm.connect(alice).commitVote(pollId, commitHash);
      await expect(sbm.connect(alice).commitVote(pollId, commitHash))
        .to.be.revertedWith("Already committed.");
    });

    it("should reject commit with zero hash", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(sbm.connect(alice).commitVote(pollId, ethers.ZeroHash))
        .to.be.revertedWith("Invalid commit hash.");
    });

    it("should allow reveal during reveal period with correct salt", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await sbm.connect(alice).commitVote(pollId, commitHash);

      // Advance to reveal period (endTime + TIME_BUFFER)
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31]);
      await ethers.provider.send("evm_mine", []);

      await expect(sbm.connect(alice).revealVote(pollId, 1, salt))
        .to.emit(sbm, "VoteRevealed").withArgs(pollId, alice.address, 1);

      // Vote should be recorded in ElectionsManager
      expect(await em.hasVoterVoted(pollId, alice.address)).to.equal(true);
      expect(bnToNumber(await sbm.revealCount(pollId))).to.equal(1);
    });

    it("should reject reveal with wrong salt", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await sbm.connect(alice).commitVote(pollId, commitHash);

      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31]);
      await ethers.provider.send("evm_mine", []);

      const wrongSalt = ethers.hexlify(ethers.randomBytes(32));
      await expect(sbm.connect(alice).revealVote(pollId, 1, wrongSalt))
        .to.be.revertedWith("Invalid reveal: hash mismatch.");
    });

    it("should reject reveal with wrong optionId", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await sbm.connect(alice).commitVote(pollId, commitHash);

      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31]);
      await ethers.provider.send("evm_mine", []);

      await expect(sbm.connect(alice).revealVote(pollId, 2, salt))
        .to.be.revertedWith("Invalid reveal: hash mismatch.");
    });

    it("should reject reveal before reveal period", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await sbm.connect(alice).commitVote(pollId, commitHash);

      // Still in commit phase
      await expect(sbm.connect(alice).revealVote(pollId, 1, salt))
        .to.be.revertedWith("Not in reveal period.");
    });

    it("should reject double reveal", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      await sbm.connect(alice).commitVote(pollId, commitHash);

      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31]);
      await ethers.provider.send("evm_mine", []);

      await sbm.connect(alice).revealVote(pollId, 1, salt);
      await expect(sbm.connect(alice).revealVote(pollId, 1, salt))
        .to.be.revertedWith("Already revealed.");
    });

    it("full commit-reveal-results flow", async function () {
      // Generate Bob's commitment (option 2)
      const bobSalt = ethers.hexlify(ethers.randomBytes(32));
      const bobHash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32", "address"],
        [pollId, 2, bobSalt, bob.address]
      );

      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      // Both commit
      await sbm.connect(alice).commitVote(pollId, commitHash);
      await sbm.connect(bob).commitVote(pollId, bobHash);
      expect(bnToNumber(await sbm.commitCount(pollId))).to.equal(2);

      // Advance to reveal period
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31]);
      await ethers.provider.send("evm_mine", []);

      // Both reveal
      await sbm.connect(alice).revealVote(pollId, 1, salt);
      await sbm.connect(bob).revealVote(pollId, 2, bobSalt);
      expect(bnToNumber(await sbm.revealCount(pollId))).to.equal(2);

      // Advance past reveal period + TIME_BUFFER + REVEAL_DURATION for results reveal
      // REVEAL_DURATION = 1 hour = 3600 seconds
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31 + 3600 + 1]);
      await ethers.provider.send("evm_mine", []);

      // Anyone can reveal results
      await em.connect(attacker).revealResults(pollId);

      // Check results
      const opt1 = await em.getOption(pollId, 1);
      const opt2 = await em.getOption(pollId, 2);
      expect(bnToNumber(opt1[2])).to.equal(1); // Alice's vote
      expect(bnToNumber(opt2[2])).to.equal(1); // Bob's vote
      expect(bnToNumber(await em.getTotalVotes(pollId))).to.equal(2);
    });
  });

  // ── Secret Ballot: Reveal Results Timing ─────────────────────

  describe("Secret Ballot: Reveal Results Timing", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("SecretTiming", admin.address, now + 60, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await em.pollsCount());
      await em.connect(admin).addOptionToPoll(pollId, "A");
      await em.connect(admin).addVoter(pollId, alice.address);
      await em.connect(admin).enableSecretBallot(pollId);
    });

    it("should prevent early results reveal (before reveal period ends)", async function () {
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      // Jump to right after poll ends but before reveal period ends
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
      await ethers.provider.send("evm_mine", []);

      await expect(em.connect(admin).revealResults(pollId))
        .to.be.revertedWith("Reveal period active");
    });

    it("should allow results reveal after reveal period ends", async function () {
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      // Jump past endTime + TIME_BUFFER + REVEAL_DURATION
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31 + 3600 + 1]);
      await ethers.provider.send("evm_mine", []);

      await em.connect(attacker).revealResults(pollId);
      expect((await em.polls(pollId)).revealed).to.equal(true);
    });
  });

  // ── SecretBallotManager View Functions ───────────────────────

  describe("SecretBallotManager View Functions", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("ViewTest", admin.address, now + 60, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await em.pollsCount());
      await em.connect(admin).addOptionToPoll(pollId, "A");
      await em.connect(admin).addVoter(pollId, alice.address);
      await em.connect(admin).enableSecretBallot(pollId);
    });

    it("isInCommitPhase should return true during voting", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await sbm.isInCommitPhase(pollId)).to.equal(true);
    });

    it("isInRevealPhase should return true during reveal period", async function () {
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31]);
      await ethers.provider.send("evm_mine", []);

      expect(await sbm.isInRevealPhase(pollId)).to.equal(true);
    });

    it("getRevealDeadline should return correct deadline", async function () {
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      const deadline = bnToNumber(await sbm.getRevealDeadline(pollId));
      // endTime + TIME_BUFFER(30) + REVEAL_DURATION(3600)
      expect(deadline).to.equal(endTime + 30 + 3600);
    });

    it("getSecretBallotStatus should return correct status", async function () {
      const status = await sbm.getSecretBallotStatus(pollId);
      expect(bnToNumber(status.commits)).to.equal(0);
      expect(bnToNumber(status.reveals)).to.equal(0);
      expect(status.isSecretBallot).to.equal(true);
    });
  });

  // ── SecretBallotManager: Access Control ──────────────────────

  describe("SecretBallotManager: Access Control", function () {
    it("should reject recordSecretVote from non-SBM", async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("ACL", admin.address, now + 10, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await em.pollsCount());

      await expect(em.connect(attacker).recordSecretVote(pollId, alice.address, 1, false))
        .to.be.revertedWith("Only SBM");
    });

    it("should reject burnTokenForCommit from non-SBM", async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("ACL2", admin.address, now + 10, 1000, true, true, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await em.pollsCount());

      await expect(em.connect(attacker).burnTokenForCommit(pollId, alice.address))
        .to.be.revertedWith("Only SBM");
    });

    it("should only allow owner to set SecretBallotManager", async function () {
      await expect(em.connect(attacker).setSecretBallotManager(attacker.address))
        .to.be.revertedWith("Only owner can call");
    });

    it("should reject zero address for SecretBallotManager", async function () {
      await expect(em.connect(owner).setSecretBallotManager(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid address");
    });

    it("should emit SecretBallotManagerSet event", async function () {
      const SBM2 = await ethers.getContractFactory("SecretBallotManager");
      const sbm2 = await SBM2.deploy(em.target);
      await expect(em.connect(owner).setSecretBallotManager(sbm2.target))
        .to.emit(em, "SecretBallotManagerSet").withArgs(sbm2.target);
    });
  });

  // ── Secret Ballot with Tokens ────────────────────────────────

  describe("Secret Ballot with Tokens", function () {
    let pollId: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("TokenSecret", admin.address, now + 60, 1000, true, true, ethers.ZeroAddress, ethers.ZeroAddress);
      pollId = bnToNumber(await em.pollsCount());
      await em.connect(admin).addOptionToPoll(pollId, "T1");
      await em.connect(admin).addOptionToPoll(pollId, "T2");
      await em.connect(admin).enableSecretBallot(pollId);

      // Add voter with tokens in one call
      await em.connect(admin).addVotersWithTokens(pollId, [alice.address], 10);
    });

    it("should reject commitVote for token-required poll", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      const salt = ethers.hexlify(ethers.randomBytes(32));
      const hash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32", "address"],
        [pollId, 1, salt, alice.address]
      );

      await expect(sbm.connect(alice).commitVote(pollId, hash))
        .to.be.revertedWith("Token-required: use commitVoteWithToken().");
    });

    it("should allow commitVoteWithToken and burn token", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      const salt = ethers.hexlify(ethers.randomBytes(32));
      const hash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32", "address"],
        [pollId, 1, salt, alice.address]
      );

      const balBefore = bnToNumber(await tokenManager.getTokenBalance(pollId, alice.address));
      await sbm.connect(alice).commitVoteWithToken(pollId, hash);
      const balAfter = bnToNumber(await tokenManager.getTokenBalance(pollId, alice.address));

      expect(balAfter).to.be.lessThan(balBefore);
      expect(await sbm.hasCommitted(pollId, alice.address)).to.equal(true);
      expect(await em.hasVotedWithToken(pollId, alice.address)).to.equal(true);
    });

    it("full token commit-reveal flow", async function () {
      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      const salt = ethers.hexlify(ethers.randomBytes(32));
      const hash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32", "address"],
        [pollId, 1, salt, alice.address]
      );

      await sbm.connect(alice).commitVoteWithToken(pollId, hash);

      // Advance to reveal period
      const endTime = bnToNumber(await em.getPollEndTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 31]);
      await ethers.provider.send("evm_mine", []);

      await sbm.connect(alice).revealVote(pollId, 1, salt);

      expect(await em.hasVoterVoted(pollId, alice.address)).to.equal(true);

      // Check vote method was recorded as Token
      const voteMethodVal = bnToNumber(await em.voteMethod(pollId, alice.address));
      expect(voteMethodVal).to.equal(1); // VoteMethod.Token = 1
    });
  });

  // ── Non-Secret Ballot: Commit Rejection ──────────────────────

  describe("Non-Secret Ballot: Commit Rejection", function () {
    it("should reject commit on non-secret ballot poll", async function () {
      const now = await getCurrentTimestamp();
      await em.connect(owner).createPoll("NormalPoll", admin.address, now + 60, 1000, false, false, ethers.ZeroAddress, ethers.ZeroAddress);
      const pollId = bnToNumber(await em.pollsCount());
      await em.connect(admin).addOptionToPoll(pollId, "X");
      await em.connect(admin).addVoter(pollId, alice.address);

      const startTime = bnToNumber(await em.getPollStartTime(pollId));
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine", []);

      const hash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32", "address"],
        [pollId, 1, ethers.randomBytes(32), alice.address]
      );

      await expect(sbm.connect(alice).commitVote(pollId, hash))
        .to.be.revertedWith("Secret ballot not enabled.");
    });
  });
});
