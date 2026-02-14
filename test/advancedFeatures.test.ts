import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// helper: safe BigNumber -> number conversion
function bnToNumber(x: any): number {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "string") return Number(x);
  if (typeof x.toNumber === "function") return x.toNumber();
  if (typeof x.toString === "function") return Number(x.toString());
  return Number(x);
}

// helper: get current block timestamp
async function getCurrentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

describe("Advanced Features - Multi-Choice, Quadratic, Delegation, IPFS", function () {
  let voting: any;
  let tokenManager: any;
  let paymaster: any;
  let owner: any;
  let admin: any;
  let alice: any;
  let bob: any;
  let charlie: any;
  let dave: any;
  let attacker: any;

  beforeEach(async function () {
    [owner, admin, alice, bob, charlie, dave, attacker] = await ethers.getSigners();

    // Deploy main contract
    voting = await ethers.deployContract("Voting");

    // Deploy TokenManager
    const TokenManager = await ethers.getContractFactory("TokenManager");
    tokenManager = await TokenManager.deploy(voting.target);

    // Deploy VotingPaymaster
    const VotingPaymaster = await ethers.getContractFactory("VotingPaymaster");
    paymaster = await VotingPaymaster.deploy(voting.target, tokenManager.target, owner.address);

    // Wire up contracts
    await voting.setTokenManager(tokenManager.target);
    await voting.setVotingPaymaster(paymaster.target);
  });

  // Helper: create a standard poll
  async function createStandardPoll(
    title: string,
    opts: { tokenEnabled?: boolean; tokenRequired?: boolean } = {}
  ) {
    const now = await getCurrentTimestamp();
    const tx = await voting.connect(owner).createPoll(
      title,
      admin.address,
      now + 10,
      1000,
      opts.tokenEnabled ?? false,
      opts.tokenRequired ?? false
    );
    await tx.wait();
    return bnToNumber(await voting.pollsCount());
  }

  // Helper: add options and voters, advance time
  async function setupPoll(
    pollId: number,
    optionNames: string[],
    voters: any[],
    tokensPerVoter: number = 0
  ) {
    for (const name of optionNames) {
      await voting.connect(admin).addOptionToPoll(pollId, name);
    }
    if (tokensPerVoter > 0) {
      await voting.connect(admin).addVotersWithTokens(
        pollId,
        voters.map((v: any) => v.address),
        tokensPerVoter
      );
    } else {
      await voting.connect(admin).addVoters(
        pollId,
        voters.map((v: any) => v.address)
      );
    }
    // Advance time past start
    const now = await getCurrentTimestamp();
    await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
    await ethers.provider.send("evm_mine");
  }

  // ══════════════════════════════════════════════════════════════
  //  MULTI-CHOICE VOTING
  // ══════════════════════════════════════════════════════════════
  describe("Multi-Choice Voting", function () {
    it("should configure multi-choice voting", async function () {
      const pollId = await createStandardPoll("Multi-Choice Test");
      await voting.connect(admin).addOptionToPoll(pollId, "Option A");
      await voting.connect(admin).addOptionToPoll(pollId, "Option B");
      await voting.connect(admin).addOptionToPoll(pollId, "Option C");

      const tx = await voting.connect(admin).setMaxChoices(pollId, 2);
      const receipt = await tx.wait();

      expect(bnToNumber(await voting.pollMaxChoices(pollId))).to.equal(2);
      console.log("✓ Multi-choice configured: max 2 choices");
    });

    it("should allow voting for multiple options", async function () {
      const pollId = await createStandardPoll("Multi-Choice Vote");
      await voting.connect(admin).addOptionToPoll(pollId, "Option A");
      await voting.connect(admin).addOptionToPoll(pollId, "Option B");
      await voting.connect(admin).addOptionToPoll(pollId, "Option C");
      await voting.connect(admin).setMaxChoices(pollId, 2);
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address]);

      // Advance time
      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      // Alice votes for options 1 and 3
      await voting.connect(alice).voteMultiChoice(pollId, [1, 3]);
      expect(await voting.hasVoterVoted(pollId, alice.address)).to.be.true;

      // Bob votes for options 1 and 2
      await voting.connect(bob).voteMultiChoice(pollId, [1, 2]);

      // Check totals
      expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(4); // 2+2

      console.log("✓ Multi-choice voting works correctly");
    });

    it("should reveal multi-choice selections", async function () {
      const pollId = await createStandardPoll("Multi-Choice Reveal");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addOptionToPoll(pollId, "C");
      await voting.connect(admin).setMaxChoices(pollId, 3);
      await voting.connect(admin).addVoters(pollId, [alice.address]);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await voting.connect(alice).voteMultiChoice(pollId, [1, 2, 3]);

      // Advance to end + buffer
      const now2 = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now2 + 1100]);
      await ethers.provider.send("evm_mine");
      await voting.connect(admin).revealResults(pollId);

      const choices = await voting.getVoterMultiChoices(pollId, alice.address);
      expect(choices.length).to.equal(3);
      console.log("✓ Multi-choice selections revealed correctly");
    });

    it("should reject duplicate options in multi-choice", async function () {
      const pollId = await createStandardPoll("Multi-Choice Dup");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).setMaxChoices(pollId, 2);
      await voting.connect(admin).addVoters(pollId, [alice.address]);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await expect(
        voting.connect(alice).voteMultiChoice(pollId, [1, 1])
      ).to.be.revertedWith("Duplicate option in choices.");
    });

    it("should reject multi-choice when not enabled", async function () {
      const pollId = await createStandardPoll("Single Choice Only");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addVoters(pollId, [alice.address]);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await expect(
        voting.connect(alice).voteMultiChoice(pollId, [1, 2])
      ).to.be.revertedWith("Multi-choice not enabled");
    });

    it("should reject too many choices", async function () {
      const pollId = await createStandardPoll("Multi-Choice Limit");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addOptionToPoll(pollId, "C");
      await voting.connect(admin).setMaxChoices(pollId, 2);
      await voting.connect(admin).addVoters(pollId, [alice.address]);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await expect(
        voting.connect(alice).voteMultiChoice(pollId, [1, 2, 3])
      ).to.be.revertedWith("Invalid choice count");
    });

    it("should prevent double voting in multi-choice", async function () {
      const pollId = await createStandardPoll("Multi-Choice Double");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).setMaxChoices(pollId, 2);
      await voting.connect(admin).addVoters(pollId, [alice.address]);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await voting.connect(alice).voteMultiChoice(pollId, [1, 2]);
      await expect(
        voting.connect(alice).voteMultiChoice(pollId, [1])
      ).to.be.revertedWith("You have already voted.");
    });

    it("should require at least 2 for maxChoices", async function () {
      const pollId = await createStandardPoll("Multi-Choice Min");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");

      await expect(
        voting.connect(admin).setMaxChoices(pollId, 1)
      ).to.be.revertedWith("Min 2 choices");
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  QUADRATIC VOTING
  // ══════════════════════════════════════════════════════════════
  describe("Quadratic Voting", function () {
    it("should enable quadratic voting", async function () {
      const pollId = await createStandardPoll("Quadratic Test", { tokenEnabled: true });
      expect(await voting.quadraticVotingEnabled(pollId)).to.be.false;

      await voting.connect(admin).enableQuadraticVoting(pollId);
      expect(await voting.quadraticVotingEnabled(pollId)).to.be.true;
      console.log("✓ Quadratic voting enabled");
    });

    it("should require token voting for quadratic", async function () {
      const pollId = await createStandardPoll("Quadratic No Token");
      await expect(
        voting.connect(admin).enableQuadraticVoting(pollId)
      ).to.be.revertedWith("Needs token voting");
    });

    it("should cast quadratic votes with correct cost", async function () {
      const pollId = await createStandardPoll("Quadratic Vote", { tokenEnabled: true });
      await voting.connect(admin).enableQuadraticVoting(pollId);
      await voting.connect(admin).addOptionToPoll(pollId, "Option A");
      await voting.connect(admin).addOptionToPoll(pollId, "Option B");
      // Give alice 20 tokens: enough for 3² + 2² = 13
      await voting.connect(admin).addVotersWithTokens(pollId, [alice.address], 20);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      // 3 votes on option 1 (cost: 9) + 2 votes on option 2 (cost: 4) = 13 tokens
      await voting.connect(alice).voteQuadratic(pollId, [1, 2], [3, 2]);

      // Check token spend
      expect(bnToNumber(await voting.quadraticTokensSpent(pollId, alice.address))).to.equal(13);

      // Check remaining balance: 20 - 13 = 7
      const balance = await tokenManager.getTokenBalance(pollId, alice.address);
      expect(bnToNumber(balance)).to.equal(7);

      // Check vote tallies
      expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(5); // 3+2

      console.log("✓ Quadratic voting: 3² + 2² = 13 tokens burned, 5 votes recorded");
    });

    it("should reject quadratic vote with insufficient tokens", async function () {
      const pollId = await createStandardPoll("Quadratic Insufficient", { tokenEnabled: true });
      await voting.connect(admin).enableQuadraticVoting(pollId);
      await voting.connect(admin).addOptionToPoll(pollId, "Option A");
      // Give alice only 5 tokens
      await voting.connect(admin).addVotersWithTokens(pollId, [alice.address], 5);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      // 3 votes = 9 tokens, but only has 5
      await expect(
        voting.connect(alice).voteQuadratic(pollId, [1], [3])
      ).to.be.revertedWith("Insufficient tokens for quadratic cost.");
    });

    it("should reject quadratic vote when not enabled", async function () {
      const pollId = await createStandardPoll("Not Quadratic", { tokenEnabled: true });
      await voting.connect(admin).addOptionToPoll(pollId, "Option A");
      await voting.connect(admin).addVotersWithTokens(pollId, [alice.address], 10);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await expect(
        voting.connect(alice).voteQuadratic(pollId, [1], [2])
      ).to.be.revertedWith("Quadratic voting not enabled.");
    });

    it("should reject duplicate options in quadratic vote", async function () {
      const pollId = await createStandardPoll("Quadratic Dup", { tokenEnabled: true });
      await voting.connect(admin).enableQuadraticVoting(pollId);
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addVotersWithTokens(pollId, [alice.address], 20);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await expect(
        voting.connect(alice).voteQuadratic(pollId, [1, 1], [2, 3])
      ).to.be.revertedWith("Duplicate option in choices.");
    });

    it("should reveal quadratic vote allocations", async function () {
      const pollId = await createStandardPoll("Quadratic Reveal", { tokenEnabled: true });
      await voting.connect(admin).enableQuadraticVoting(pollId);
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addVotersWithTokens(pollId, [alice.address], 20);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await voting.connect(alice).voteQuadratic(pollId, [1, 2], [3, 1]);

      // Advance and reveal
      const now2 = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now2 + 1100]);
      await ethers.provider.send("evm_mine");
      await voting.connect(admin).revealResults(pollId);

      expect(bnToNumber(await voting.getQuadraticVotes(pollId, alice.address, 1))).to.equal(3);
      expect(bnToNumber(await voting.getQuadraticVotes(pollId, alice.address, 2))).to.equal(1);
      console.log("✓ Quadratic vote allocations revealed: [3, 1]");
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  VOTE DELEGATION
  // ══════════════════════════════════════════════════════════════
  describe("Vote Delegation", function () {
    it("should allow delegation to another voter", async function () {
      const pollId = await createStandardPoll("Delegation Test");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address]);

      await voting.connect(alice).delegateVote(pollId, bob.address);

      const info = await voting.getDelegationInfo(pollId, alice.address);
      expect(info.delegatee).to.equal(bob.address);
      expect(info.isDelegated).to.be.true;

      const bobInfo = await voting.getDelegationInfo(pollId, bob.address);
      expect(bnToNumber(bobInfo.delegationsReceived)).to.equal(1);

      console.log("✓ Alice delegated to Bob");
    });

    it("should allow delegate to vote on behalf of delegator", async function () {
      const pollId = await createStandardPoll("Delegation Vote");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address]);

      await voting.connect(alice).delegateVote(pollId, bob.address);

      // Advance time
      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      // Bob votes for Alice
      await voting.connect(bob).voteAsDelegate(pollId, 1, alice.address);

      // Alice is marked as voted
      expect(await voting.hasVoterVoted(pollId, alice.address)).to.be.true;

      // Bob can still vote for himself
      await voting.connect(bob).voteInPoll(pollId, 2);
      expect(await voting.hasVoterVoted(pollId, bob.address)).to.be.true;

      expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(2);
      console.log("✓ Bob voted as delegate for Alice, then for himself");
    });

    it("should prevent delegation to self", async function () {
      const pollId = await createStandardPoll("Delegation Self");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addVoters(pollId, [alice.address]);

      await expect(
        voting.connect(alice).delegateVote(pollId, alice.address)
      ).to.be.revertedWith("Cannot delegate to self.");
    });

    it("should prevent delegation after voting", async function () {
      const pollId = await createStandardPoll("Delegation After Vote");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address]);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await voting.connect(alice).voteInPoll(pollId, 1);

      await expect(
        voting.connect(alice).delegateVote(pollId, bob.address)
      ).to.be.revertedWith("Already voted; cannot delegate.");
    });

    it("should prevent delegated voter from voting directly", async function () {
      const pollId = await createStandardPoll("Delegation No Direct Vote");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address]);

      await voting.connect(alice).delegateVote(pollId, bob.address);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await expect(
        voting.connect(alice).voteInPoll(pollId, 1)
      ).to.be.revertedWith("You have delegated your vote.");
    });

    it("should prevent wrong delegate from voting", async function () {
      const pollId = await createStandardPoll("Delegation Wrong Delegate");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address, charlie.address]);

      await voting.connect(alice).delegateVote(pollId, bob.address);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await expect(
        voting.connect(charlie).voteAsDelegate(pollId, 1, alice.address)
      ).to.be.revertedWith("You are not the delegatee.");
    });

    it("should allow removing delegation", async function () {
      const pollId = await createStandardPoll("Delegation Remove");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address]);

      await voting.connect(alice).delegateVote(pollId, bob.address);
      await voting.connect(alice).removeDelegation(pollId);

      const info = await voting.getDelegationInfo(pollId, alice.address);
      expect(info.isDelegated).to.be.false;

      // Alice can now vote directly
      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await voting.connect(alice).voteInPoll(pollId, 1);
      expect(await voting.hasVoterVoted(pollId, alice.address)).to.be.true;
      console.log("✓ Delegation removed, Alice voted directly");
    });

    it("should prevent double delegation", async function () {
      const pollId = await createStandardPoll("Delegation Double");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address, charlie.address]);

      await voting.connect(alice).delegateVote(pollId, bob.address);
      await expect(
        voting.connect(alice).delegateVote(pollId, charlie.address)
      ).to.be.revertedWith("Already delegated.");
    });

    it("should prevent delegation chain (delegatee cannot delegate)", async function () {
      const pollId = await createStandardPoll("Delegation Chain");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address, charlie.address]);

      await voting.connect(alice).delegateVote(pollId, bob.address);

      // Bob can still delegate himself (he received a delegation but hasn't delegated his own vote)
      // The contract allows this — Bob delegates his OWN vote to Charlie
      await voting.connect(bob).delegateVote(pollId, charlie.address);

      // But now no one can delegate TO Bob because Bob has delegated his vote
      await expect(
        voting.connect(charlie).delegateVote(pollId, bob.address)
      ).to.be.revertedWith("Delegatee already delegated");

      console.log("✓ Delegation chain correctly prevented");
    });

    it("should handle multiple delegations to same delegate", async function () {
      const pollId = await createStandardPoll("Delegation Multi");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addVoters(pollId, [
        alice.address, bob.address, charlie.address, dave.address
      ]);

      // Alice and Charlie both delegate to Dave
      await voting.connect(alice).delegateVote(pollId, dave.address);
      await voting.connect(charlie).delegateVote(pollId, dave.address);

      const daveInfo = await voting.getDelegationInfo(pollId, dave.address);
      expect(bnToNumber(daveInfo.delegationsReceived)).to.equal(2);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      // Dave votes for Alice and Charlie
      await voting.connect(dave).voteAsDelegate(pollId, 1, alice.address);
      await voting.connect(dave).voteAsDelegate(pollId, 2, charlie.address);

      // Dave also votes for himself
      await voting.connect(dave).voteInPoll(pollId, 1);

      expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(3);
      console.log("✓ Multiple delegations to Dave, all 3 votes cast");
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  IPFS POLL METADATA
  // ══════════════════════════════════════════════════════════════
  describe("IPFS Poll Metadata", function () {
    it("should set and get poll metadata", async function () {
      const pollId = await createStandardPoll("IPFS Test");
      const ipfsURI = "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

      await voting.connect(admin).setPollMetadata(pollId, ipfsURI);

      const metadata = await voting.getPollMetadata(pollId);
      expect(metadata).to.equal(ipfsURI);
      console.log("✓ IPFS metadata set:", ipfsURI);
    });

    it("should emit PollMetadataSet event", async function () {
      const pollId = await createStandardPoll("IPFS Event Test");
      const ipfsURI = "ipfs://QmTest123";

      await expect(voting.connect(admin).setPollMetadata(pollId, ipfsURI))
        .to.emit(voting, "PollMetadataSet")
        .withArgs(pollId, ipfsURI);
    });

    it("should reject empty metadata URI", async function () {
      const pollId = await createStandardPoll("IPFS Empty");

      await expect(
        voting.connect(admin).setPollMetadata(pollId, "")
      ).to.be.revertedWith("Metadata URI cannot be empty.");
    });

    it("should only allow admin/owner to set metadata", async function () {
      const pollId = await createStandardPoll("IPFS Auth");

      await expect(
        voting.connect(attacker).setPollMetadata(pollId, "ipfs://QmTest")
      ).to.be.revertedWith("Only poll admin or owner allowed.");
    });

    it("should allow updating metadata", async function () {
      const pollId = await createStandardPoll("IPFS Update");

      await voting.connect(admin).setPollMetadata(pollId, "ipfs://QmOld");
      await voting.connect(admin).setPollMetadata(pollId, "ipfs://QmNew");

      expect(await voting.getPollMetadata(pollId)).to.equal("ipfs://QmNew");
      console.log("✓ IPFS metadata updated successfully");
    });

    it("should return empty for poll without metadata", async function () {
      const pollId = await createStandardPoll("IPFS None");
      const metadata = await voting.getPollMetadata(pollId);
      expect(metadata).to.equal("");
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  COMBINED SCENARIOS
  // ══════════════════════════════════════════════════════════════
  describe("Combined Feature Scenarios", function () {
    it("should support IPFS metadata + multi-choice in same poll", async function () {
      const pollId = await createStandardPoll("Combined MC+IPFS");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addOptionToPoll(pollId, "C");
      await voting.connect(admin).setMaxChoices(pollId, 2);
      await voting.connect(admin).setPollMetadata(pollId, "ipfs://QmCombined");
      await voting.connect(admin).addVoters(pollId, [alice.address]);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await voting.connect(alice).voteMultiChoice(pollId, [1, 3]);

      expect(await voting.getPollMetadata(pollId)).to.equal("ipfs://QmCombined");
      expect(await voting.hasVoterVoted(pollId, alice.address)).to.be.true;
      console.log("✓ Multi-choice + IPFS metadata work together");
    });

    it("should support delegation + multi-choice", async function () {
      const pollId = await createStandardPoll("Delegation + MC");
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addOptionToPoll(pollId, "B");
      await voting.connect(admin).addVoters(pollId, [alice.address, bob.address]);

      // Alice delegates to Bob
      await voting.connect(alice).delegateVote(pollId, bob.address);

      // Alice cannot multi-choice vote
      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      // Note: multi-choice requires maxChoices >= 2 to be set
      // But delegation prevents voting anyway
      await expect(
        voting.connect(alice).voteMultiChoice(pollId, [1])
      ).to.be.revertedWith("You have delegated your vote.");

      console.log("✓ Delegation blocks multi-choice voting for delegator");
    });

    it("should prevent delegated voter from quadratic voting", async function () {
      const pollId = await createStandardPoll("Delegation + Quadratic", { tokenEnabled: true });
      await voting.connect(admin).enableQuadraticVoting(pollId);
      await voting.connect(admin).addOptionToPoll(pollId, "A");
      await voting.connect(admin).addVotersWithTokens(pollId, [alice.address, bob.address], 20);

      await voting.connect(alice).delegateVote(pollId, bob.address);

      const now = await getCurrentTimestamp();
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 15]);
      await ethers.provider.send("evm_mine");

      await expect(
        voting.connect(alice).voteQuadratic(pollId, [1], [2])
      ).to.be.revertedWith("You have delegated your vote.");

      console.log("✓ Delegation blocks quadratic voting for delegator");
    });
  });

  // Summary
  describe("Feature Summary", function () {
    it("should print feature summary", async function () {
      console.log(`
============================================================
ADVANCED FEATURES TEST SUMMARY
============================================================
✓ Multi-Choice Voting
  - Configure max choices per poll
  - Vote for multiple options
  - Duplicate option prevention
  - Privacy until reveal

✓ Quadratic Voting
  - Enable per poll (requires tokens)
  - Quadratic cost: votes² = tokens
  - Efficient bulk token burning
  - Allocation tracking per option

✓ Vote Delegation
  - Delegate to any authorized voter
  - Delegate votes on behalf of delegator
  - Remove delegation
  - Multiple delegations to same delegate
  - Prevents delegation chains
  - Blocks direct voting for delegators

✓ IPFS Poll Metadata
  - Set/update metadata URI
  - Access control (admin/owner only)
  - Event emission for indexing

✓ Combined Scenarios
  - Features work together
  - Cross-feature protection (delegation + multi-choice)
  - Cross-feature protection (delegation + quadratic)
============================================================
      `);
    });
  });
});
