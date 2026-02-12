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

describe("Gasless Voting - End-to-End Integration", function () {
  let electionsManager: any;
  let tokenManager: any;
  let votingPaymaster: any;
  let owner: any;
  let admin: any;
  let voter1: any;
  let voter2: any;
  let voter3: any;
  let relayer: any;

  beforeEach(async function () {
    [owner, admin, voter1, voter2, voter3, relayer] = await ethers.getSigners();

    // Deploy complete system
    electionsManager = await ethers.deployContract("ElectionsManager");

    const TokenManager = await ethers.getContractFactory("TokenManager");
    tokenManager = await TokenManager.deploy(electionsManager.target);

    const VotingPaymaster = await ethers.getContractFactory("VotingPaymaster");
    votingPaymaster = await VotingPaymaster.deploy(
      electionsManager.target,
      tokenManager.target,
      owner.address
    );

    // Configure system
    await electionsManager.setTokenManager(tokenManager.target);
    await electionsManager.setVotingPaymaster(votingPaymaster.target);

    // Fund paymaster
    await votingPaymaster.fund({ value: ethers.parseEther("10") });

    // Add relayer
    await votingPaymaster.addRelayer(relayer.address);
  });

  async function signVote(
    signer: any,
    pollId: number,
    optionId: number,
    nonceVal: number,
    deadlineVal: number
  ) {
    const domain = {
      name: "VotingPaymaster",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: votingPaymaster.target,
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

    const value = {
      pollId,
      optionId,
      voter: signer.address,
      nonce: nonceVal,
      deadline: deadlineVal,
    };

    const signature = await signer.signTypedData(domain, types, value);
    const sig = ethers.Signature.from(signature);

    return { v: sig.v, r: sig.r, s: sig.s };
  }

  describe("Complete Gasless Voting Flow", function () {
    it("should complete full gasless voting journey", async function () {
      // Step 1: Create poll with token voting
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Gasless Poll",
        admin.address,
        now + 10,
        3600, // 1 hour
        true, // enable tokens
        false // not required
      );

      const pollId = bnToNumber(await electionsManager.pollsCount());
      console.log(`✓ Created poll ${pollId} with token voting enabled`);

      // Step 2: Add options
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Alice");
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Bob");
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Charlie");
      console.log("✓ Added 3 options to poll");

      // Step 3: Allocate tokens to voters
      const voters = [voter1.address, voter2.address, voter3.address];
      await electionsManager.connect(admin).addVotersWithTokens(pollId, voters, 5);
      console.log("✓ Allocated 5 tokens to 3 voters");

      // Verify token balances
      expect(await tokenManager.getTokenBalance(pollId, voter1.address)).to.equal(5);
      expect(await tokenManager.getTokenBalance(pollId, voter2.address)).to.equal(5);
      expect(await tokenManager.getTokenBalance(pollId, voter3.address)).to.equal(5);

      // Step 4: Start poll
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 20]);
      await ethers.provider.send("evm_mine");
      console.log("✓ Poll started");

      // Step 5: Voter 1 votes traditionally (pays gas)
      const voter1BalanceBefore = await ethers.provider.getBalance(voter1.address);
      const tx1 = await electionsManager.connect(voter1).voteInPoll(pollId, 1);
      const receipt1 = await tx1.wait();
      const gasCost1 = receipt1.gasUsed * receipt1.gasPrice;
      const voter1BalanceAfter = await ethers.provider.getBalance(voter1.address);

      console.log(`✓ Voter 1 voted traditionally (paid ${ethers.formatEther(gasCost1)} ETH gas)`);
      expect(voter1BalanceAfter).to.be.lt(voter1BalanceBefore); // Paid gas

      // Step 6: Voter 2 votes with token (pays gas)
      const voter2BalanceBefore = await ethers.provider.getBalance(voter2.address);
      const tx2 = await electionsManager
        .connect(voter2)
        .voteInPollWithToken(pollId, 2, voter2.address);
      const receipt2 = await tx2.wait();
      const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
      const voter2BalanceAfter = await ethers.provider.getBalance(voter2.address);

      console.log(`✓ Voter 2 voted with token (paid ${ethers.formatEther(gasCost2)} ETH gas)`);
      expect(voter2BalanceAfter).to.be.lt(voter2BalanceBefore); // Paid gas
      expect(await tokenManager.getTokenBalance(pollId, voter2.address)).to.equal(4); // Token burnt

      // Step 7: Voter 3 votes gasless (signs off-chain, relayer submits)
      const voter3BalanceBefore = await ethers.provider.getBalance(voter3.address);
      const paymasterBalanceBefore = await ethers.provider.getBalance(votingPaymaster.target);

      const nonce = bnToNumber(await votingPaymaster.getNonce(voter3.address));
      const deadline = (await getCurrentTimestamp()) + 3600;
      const sig = await signVote(voter3, pollId, 3, nonce, deadline);

      // Relayer submits transaction (paymaster pays gas)
      const tx3 = await votingPaymaster
        .connect(relayer)
        .executeVoteWithToken(pollId, 3, voter3.address, deadline, sig.v, sig.r, sig.s);
      await tx3.wait();

      const voter3BalanceAfter = await ethers.provider.getBalance(voter3.address);

      console.log("✓ Voter 3 voted gasless (relayer paid gas, voter paid nothing)");
      expect(voter3BalanceAfter).to.equal(voter3BalanceBefore); // Voter paid no gas
      expect(await tokenManager.getTokenBalance(pollId, voter3.address)).to.equal(4); // Token burnt

      // Step 8: Verify all votes recorded
      expect(await electionsManager.hasVoterVoted(pollId, voter1.address)).to.be.true;
      expect(await electionsManager.hasVoterVoted(pollId, voter2.address)).to.be.true;
      expect(await electionsManager.hasVoterVoted(pollId, voter3.address)).to.be.true;
      expect(await electionsManager.getTotalVotes(pollId)).to.equal(3);
      console.log("✓ All 3 votes recorded successfully");

      // Step 9: Check vote methods
      expect(await electionsManager.voteMethod(pollId, voter1.address)).to.equal(0); // GasPayment
      expect(await electionsManager.voteMethod(pollId, voter2.address)).to.equal(1); // Token
      expect(await electionsManager.voteMethod(pollId, voter3.address)).to.equal(1); // Token
      console.log("✓ Vote methods tracked correctly");

      // Step 10: End poll and reveal results
      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 3700]); // After poll ends
      await ethers.provider.send("evm_mine");

      await electionsManager.connect(admin).revealResults(pollId);
      await electionsManager.connect(admin).endPoll(pollId);
      console.log("✓ Poll ended and results revealed");

      // Step 11: Verify winner
      const [winnerId, winnerName] = await electionsManager.getWinner(pollId);
      console.log(`✓ Winner: Option ${bnToNumber(winnerId)} - ${winnerName}`);

      expect(bnToNumber(winnerId)).to.be.greaterThan(0);
      console.log("\n🎉 Complete gasless voting flow successful!");
    });
  });

  describe("Gasless Voting Edge Cases", function () {
    let pollId: number;
    let deadline: number;

    beforeEach(async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Test Poll",
        admin.address,
        now + 10,
        1000,
        true,
        false
      );
      pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(pollId, "Yes");
      await electionsManager.connect(admin).addOptionToPoll(pollId, "No");
      await electionsManager.connect(admin).addVotersWithTokens(pollId, [voter1.address], 3);

      // Add voter2 without tokens (for testing token requirement)
      await electionsManager.connect(admin).addVoter(pollId, voter2.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 20]);
      await ethers.provider.send("evm_mine");

      deadline = (await getCurrentTimestamp()) + 3600;
    });

    it("should prevent replay attacks with nonce", async function () {
      const nonce = bnToNumber(await votingPaymaster.getNonce(voter1.address));
      const sig = await signVote(voter1, pollId, 1, nonce, deadline);

      // First vote succeeds
      await votingPaymaster
        .connect(relayer)
        .executeVoteWithToken(pollId, 1, voter1.address, deadline, sig.v, sig.r, sig.s);

      // Try to replay same signature (should fail - nonce increased)
      await expect(
        votingPaymaster
          .connect(relayer)
          .executeVoteWithToken(pollId, 1, voter1.address, deadline, sig.v, sig.r, sig.s)
      ).to.be.revertedWith("Invalid signature");
    });

    it("should reject expired signatures", async function () {
      const expiredDeadline = (await getCurrentTimestamp()) - 100; // Past deadline
      const nonce = bnToNumber(await votingPaymaster.getNonce(voter1.address));
      const sig = await signVote(voter1, pollId, 1, nonce, expiredDeadline);

      await expect(
        votingPaymaster
          .connect(relayer)
          .executeVoteWithToken(pollId, 1, voter1.address, expiredDeadline, sig.v, sig.r, sig.s)
      ).to.be.revertedWith("Signature expired");
    });

    it("should prevent voting without tokens via paymaster", async function () {
      // voter2 has no tokens (added in beforeEach without tokens)
      const nonce = bnToNumber(await votingPaymaster.getNonce(voter2.address));
      const sig = await signVote(voter2, pollId, 1, nonce, deadline);

      await expect(
        votingPaymaster
          .connect(relayer)
          .executeVoteWithToken(pollId, 1, voter2.address, deadline, sig.v, sig.r, sig.s)
      ).to.be.revertedWith("Insufficient vote tokens");
    });

    it("should track gas consumption", async function () {
      const nonce = bnToNumber(await votingPaymaster.getNonce(voter1.address));
      const sig = await signVote(voter1, pollId, 1, nonce, deadline);

      const tx = votingPaymaster
        .connect(relayer)
        .executeVoteWithToken(pollId, 1, voter1.address, deadline, sig.v, sig.r, sig.s);

      await expect(tx).to.emit(votingPaymaster, "GasSponsored");
    });
  });

  describe("Multi-Voter Gasless Scenario", function () {
    it("should handle multiple gasless voters efficiently", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Large Poll",
        admin.address,
        now + 10,
        1000,
        true,
        false
      );
      const pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option A");
      await electionsManager.connect(admin).addOptionToPoll(pollId, "Option B");

      // Add 3 voters with tokens
      const voters = [voter1.address, voter2.address, voter3.address];
      await electionsManager.connect(admin).addVotersWithTokens(pollId, voters, 2);

      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 20]);
      await ethers.provider.send("evm_mine");

      const deadline = (await getCurrentTimestamp()) + 3600;

      // All vote gasless
      for (let i = 0; i < voters.length; i++) {
        const voterSigner = [voter1, voter2, voter3][i];
        const nonce = bnToNumber(await votingPaymaster.getNonce(voterSigner.address));
        const optionId = (i % 2) + 1; // Alternate between option 1 and 2
        const sig = await signVote(voterSigner, pollId, optionId, nonce, deadline);

        await votingPaymaster
          .connect(relayer)
          .executeVoteWithToken(pollId, optionId, voterSigner.address, deadline, sig.v, sig.r, sig.s);
      }

      expect(await electionsManager.getTotalVotes(pollId)).to.equal(3);
      console.log("✓ All 3 voters voted gasless successfully");
    });
  });

  describe("Token Exhaustion", function () {
    it("should prevent voting after tokens exhausted", async function () {
      const now = await getCurrentTimestamp();
      await electionsManager.createPoll(
        "Token Test Poll",
        admin.address,
        now + 10,
        1000,
        true,
        false
      );
      const pollId = bnToNumber(await electionsManager.pollsCount());

      await electionsManager.connect(admin).addOptionToPoll(pollId, "Yes");
      await electionsManager.connect(admin).addVotersWithTokens(pollId, [voter1.address], 1);

      await ethers.provider.send("evm_setNextBlockTimestamp", [now + 20]);
      await ethers.provider.send("evm_mine");

      // Vote once (uses the only token)
      await electionsManager.connect(voter1).voteInPollWithToken(pollId, 1, voter1.address);

      expect(await tokenManager.getTokenBalance(pollId, voter1.address)).to.equal(0);
      expect(await electionsManager.canVoteWithToken(pollId, voter1.address)).to.be.false;
    });
  });
});
