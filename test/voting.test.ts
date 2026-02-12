import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

// helper: safe BigNumber -> number conversion
function bnToNumber(x: any): number {
  // null/undefined
  if (x === null || x === undefined) return 0;
  // already number
  if (typeof x === "number") return x;
  // string numeric
  if (typeof x === "string") return Number(x);
  // ethers BigNumber
  if (typeof x.toNumber === "function") return x.toNumber();
  // fallback to string -> number
  if (typeof x.toString === "function") return Number(x.toString());
  return Number(x);
}

// helper: get current block timestamp
async function getCurrentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

describe("Voting (TS tests) - Voting title (poll) mode", function () {
  let voting: any;
  let owner: any;
  let alice: any;
  let bob: any;
  let admin: any;
  let attacker: any;
  let newOwner: any;

  beforeEach(async function () {
    [owner, alice, bob, admin, attacker, , , , newOwner] = await ethers.getSigners();

    // use a stable deploy pattern
    voting = await ethers.deployContract("Voting");
  });

  it("createPoll -> add options -> votes -> totals and double-vote revert", async function () {
    const now = await getCurrentTimestamp();
    const txCreate = await voting.connect(owner).createPoll("What's 2+2?",  admin.address,  now + 10,  1000, false, false);
    await txCreate.wait();
    const pidBN = await voting.pollsCount();
    const pollId = bnToNumber(pidBN);

    expect(pollId).to.be.greaterThan(0);

    // admin adds options for the poll
    await (await voting.connect(admin).addOptionToPoll(pollId, "3")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "4")).wait();

    // admin adds voters
    await (await voting.connect(admin).addVoters(pollId, [alice.address, bob.address])).wait();

    expect(bnToNumber(await voting.getOptionsCount(pollId))).to.equal(2);
    // Votes are hidden before reveal (returns 0) - admin can see them
    const opt1 = await voting.connect(admin).getOption(pollId, 1);
    expect(bnToNumber(opt1[0])).to.equal(1);
    expect(opt1[1]).to.equal("3");
    expect(bnToNumber(opt1[2])).to.equal(0);

    // time-warp to start time so voting is active
    const startTime = bnToNumber(await voting.getPollStartTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // public voting
    await (await voting.connect(alice).voteInPoll(pollId, 2)).wait(); // votes "4"
    await (await voting.connect(bob).voteInPoll(pollId, 2)).wait();   // votes "4"

    // totals and option counts
    expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(2);
    // Admin can see vote counts before reveal
    const opt2 = await voting.connect(admin).getOption(pollId, 2);
    expect(bnToNumber(opt2[2])).to.equal(2);

    // one person can only vote on a poll once -> double vote should revert
    await expect(voting.connect(alice).voteInPoll(pollId, 1)).to.be.revertedWith("You have already voted.");
  });

  it("admin-only actions and permission checks for a poll", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("Q",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // non-admin cannot add options to the poll
    await expect(voting.connect(attacker).addOptionToPoll(pollId, "X")).to.be.revertedWith(
      "Only poll admin or owner allowed."
    );

    // admin can add option
    await (await voting.connect(admin).addOptionToPoll(pollId, "Opt")).wait();

    // non-admin/non-owner cannot add voters
    await expect(voting.connect(attacker).addVoter(pollId, alice.address)).to.be.revertedWith(
      "Only poll admin or owner allowed."
    );

    // unauthorized voter cannot vote
    await expect(voting.connect(attacker).voteInPoll(pollId, 1)).to.be.revertedWith(
      "Not authorized to vote in this poll."
    );

    // non-admin/non-owner cannot reveal (before end)
    await expect(voting.connect(attacker).revealResults(pollId)).to.be.revertedWith(
      "Only poll admin or owner allowed."
    );
  });

  it("time limits, reveal and end behavior, and getVoterChoice access control for a poll", async function () {
    const now = await getCurrentTimestamp();
    const shortDuration = 400; // Must be >= MIN_POLL_DURATION (300)
    await (await voting.connect(owner).createPoll("TimePoll",  admin.address,  now + 10,  shortDuration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "A")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "B")).wait();

    // admin authorizes alice and bob to vote
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();
    await (await voting.connect(admin).addVoter(pollId, bob.address)).wait();

    // time-warp to start time so voting is active
    const startTime = bnToNumber(await voting.getPollStartTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // alice votes for 1
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();

    // admin can read voter choice even before reveal (admin allowed)
    const adminChoiceBefore = bnToNumber(await voting.getVoterChoice(pollId, alice.address));
    expect(adminChoiceBefore).to.equal(1);

    // others cannot read voter choice before reveal
    await expect(voting.connect(attacker).getVoterChoice(pollId, alice.address)).to.be.revertedWith(
      "Results not revealed."
    );

    // advance time beyond endTime + TIME_BUFFER (use contract-provided endTime to avoid flakiness)
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
    await ethers.provider.send("evm_mine", []);

    // attempting to vote after time should revert (already past endTime + buffer)
    await expect(voting.connect(bob).voteInPoll(pollId, 2)).to.be.revertedWith("Poll not active for voting.");

    // reveal now allowed (time has passed + TIME_BUFFER)
    await (await voting.connect(admin).revealResults(pollId)).wait();

    // after reveal, anyone can read voter choice
    const choiceAfterReveal = bnToNumber(await voting.getVoterChoice(pollId, alice.address));
    expect(choiceAfterReveal).to.equal(1);

    // endPoll allowed after time
    await (await voting.connect(admin).endPoll(pollId)).wait();

    // after explicit end, adding option should revert
    await expect(voting.connect(admin).addOptionToPoll(pollId, "LateOpt")).to.be.revertedWith(
      "Poll ended; cannot add options."
    );
  });

  it("end before endTime and reveal before endTime revert appropriately for a poll", async function () {
    const now = await getCurrentTimestamp();
    const mediumDuration = 400; // Must be >= MIN_POLL_DURATION (300)
    await (await voting.connect(owner).createPoll("Short2",  admin.address,  now + 10,  mediumDuration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // Cannot end before endTime + TIME_BUFFER
    await expect(voting.connect(admin).endPoll(pollId)).to.be.revertedWith("Cannot end before end time plus buffer.");

    // Cannot reveal before endTime + TIME_BUFFER
    await expect(voting.connect(admin).revealResults(pollId)).to.be.revertedWith("Cannot reveal before poll end plus buffer.");
  });

  it("ownership transfer: new owner can create polls; old owner can't (2-step process)", async function () {
    let now = await getCurrentTimestamp();
    // Step 1: Current owner proposes transfer
    await (await voting.connect(owner).transferOwnership(newOwner.address)).wait();

    // Old owner can still create (transfer not complete yet)
    await (await voting.connect(owner).createPoll("StillOwner",  admin.address,  now + 2,  1000, false, false)).wait();

    // Step 2: New owner accepts ownership
    await (await voting.connect(newOwner).acceptOwnership()).wait();

    // Refresh timestamp for new poll
    now = await getCurrentTimestamp();

    // Now old owner cannot create
    await expect(voting.connect(owner).createPoll("ShouldFail",  admin.address,  now + 2,  1000, false, false)).to.be.revertedWith(
      "Only owner can call"
    );

    // Refresh timestamp again for final poll
    now = await getCurrentTimestamp();
    
    // New owner can create
    await (await voting.connect(newOwner).createPoll("ByNewOwner",  admin.address,  now + 2,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());
    expect(pollId).to.be.greaterThan(1); // Should be > 1 since old owner created one
  });

  // New tests updated to poll wording
  it("misc getters return zero before options/votes and admin sees no-vote as 0 for poll", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("EmptyPoll",  admin.address,  now + 2,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // no options yet
    expect(bnToNumber(await voting.getOptionsCount(pollId))).to.equal(0);
    // no votes yet
    expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(0);
    // admin querying a non-voter should see 0 (no choice)
    expect(bnToNumber(await voting.getVoterChoice(pollId, alice.address))).to.equal(0);
  });

  it("creating multiple polls increments pollsCount", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("Multi1",  admin.address,  now + 2,  1000, false, false)).wait();
    await (await voting.connect(owner).createPoll("Multi2",  admin.address,  now + 2,  1000, false, false)).wait();
    expect(bnToNumber(await voting.pollsCount())).to.equal(2);
  });

  it("owner (as allowed role) can add options to a poll", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("OwnerAdd",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());
    // owner should be allowed (owner or admin allowed) to add options to the poll
    await (await voting.connect(owner).addOptionToPoll(pollId, "OwnerOpt")).wait();
    expect(bnToNumber(await voting.getOptionsCount(pollId))).to.equal(1);
  });

  it("voter authorization: single voter add and vote", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("AuthTest",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Yes")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "No")).wait();

    // alice is not authorized yet
    expect(await voting.isVoterAuthorized(pollId, alice.address)).to.be.false;
    await expect(voting.connect(alice).voteInPoll(pollId, 1)).to.be.revertedWith(
      "Not authorized to vote in this poll."
    );

    // admin authorizes alice
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();
    expect(await voting.isVoterAuthorized(pollId, alice.address)).to.be.true;

    // time-warp to start time so voting is active
    const startTime = bnToNumber(await voting.getPollStartTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // now alice can vote
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();
    expect(await voting.hasVoterVoted(pollId, alice.address)).to.be.true;
  });

  it("voter authorization: batch voter add", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("BatchTest",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();

    // add multiple voters at once
    await (await voting.connect(admin).addVoters(pollId, [alice.address, bob.address, attacker.address])).wait();

    expect(await voting.isVoterAuthorized(pollId, alice.address)).to.be.true;
    expect(await voting.isVoterAuthorized(pollId, bob.address)).to.be.true;
    expect(await voting.isVoterAuthorized(pollId, attacker.address)).to.be.true;

    // time-warp to start time so voting is active
    const startTime = bnToNumber(await voting.getPollStartTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // all can vote
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();
    await (await voting.connect(bob).voteInPoll(pollId, 1)).wait();
    await (await voting.connect(attacker).voteInPoll(pollId, 1)).wait();

    expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(3);
  });

  it("voter authorization: remove voter before voting", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("RemoveTest",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();

    // alice is authorized
    expect(await voting.isVoterAuthorized(pollId, alice.address)).to.be.true;

    // admin removes alice
    await (await voting.connect(admin).removeVoter(pollId, alice.address)).wait();
    expect(await voting.isVoterAuthorized(pollId, alice.address)).to.be.false;

    // alice cannot vote
    await expect(voting.connect(alice).voteInPoll(pollId, 1)).to.be.revertedWith(
      "Not authorized to vote in this poll."
    );
  });

  it("voter authorization: cannot remove voter after poll starts", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("RemoveAfterStart",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();
    
    // time-warp to start time so poll is active
    const startTime = bnToNumber(await voting.getPollStartTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);
    
    // cannot remove alice after poll started (even before she votes)
    await expect(voting.connect(admin).removeVoter(pollId, alice.address)).to.be.revertedWith(
      "Poll already started; cannot remove voters."
    );
  });

  it("helper functions: isPollActive returns correct status", async function () {
    const now = await getCurrentTimestamp();
    const shortDuration = 400; // Must be >= MIN_POLL_DURATION (300)
    await (await voting.connect(owner).createPoll("ActiveTest",  admin.address,  now + 10,  shortDuration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // time-warp to start time
    const startTime = bnToNumber(await voting.getPollStartTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // poll is active now
    expect(await voting.isPollActive(pollId)).to.be.true;

    // advance time beyond endTime
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // poll is no longer active
    expect(await voting.isPollActive(pollId)).to.be.false;
  });

  it("helper functions: getWinner returns correct winner", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("WinnerTest",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Alice")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "Bob")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "Charlie")).wait();

    await (await voting.connect(admin).addVoters(pollId, [alice.address, bob.address, attacker.address])).wait();

    // time-warp to start time so voting is active
    const startTime = bnToNumber(await voting.getPollStartTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // vote: Alice=1, Bob=2, Charlie=0
    await (await voting.connect(alice).voteInPoll(pollId, 2)).wait();  // votes for Bob
    await (await voting.connect(bob).voteInPoll(pollId, 2)).wait();    // votes for Bob
    await (await voting.connect(attacker).voteInPoll(pollId, 1)).wait(); // votes for Alice

    // admin can see winner before reveal
    const [winnerId, winnerName, winnerVotes] = await voting.connect(admin).getWinner(pollId);
    expect(bnToNumber(winnerId)).to.equal(2);
    expect(winnerName).to.equal("Bob");
    expect(bnToNumber(winnerVotes)).to.equal(2);

    // non-admin cannot see winner before reveal
    await expect(voting.connect(attacker).getWinner(pollId)).to.be.revertedWith("Results not revealed.");

    // advance time and reveal (need TIME_BUFFER after endTime)
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
    await ethers.provider.send("evm_mine", []);
    await (await voting.connect(admin).revealResults(pollId)).wait();

    // now anyone can see winner
    const [winnerId2, winnerName2, winnerVotes2] = await voting.connect(attacker).getWinner(pollId);
    expect(bnToNumber(winnerId2)).to.equal(2);
    expect(winnerName2).to.equal("Bob");
    expect(bnToNumber(winnerVotes2)).to.equal(2);
  });

  it("cannot add voters after poll ended", async function () {
    const now = await getCurrentTimestamp();
    const shortDuration = 400; // Must be >= MIN_POLL_DURATION (300)
    await (await voting.connect(owner).createPoll("EndedPoll",  admin.address,  now + 2,  shortDuration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // advance time and end poll (need TIME_BUFFER after endTime)
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
    await ethers.provider.send("evm_mine", []);
    await (await voting.connect(admin).endPoll(pollId)).wait();

    // cannot add voters after poll ended
    await expect(voting.connect(admin).addVoter(pollId, alice.address)).to.be.revertedWith(
      "Poll ended; cannot add voters."
    );
  });

  it("cannot add duplicate voter", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("DupVoter",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();

    // adding alice again should revert
    await expect(voting.connect(admin).addVoter(pollId, alice.address)).to.be.revertedWith(
      "Voter already authorized."
    );
  });

  it("getPollsCount() returns correct count as polls are created", async function () {
    let now = await getCurrentTimestamp();
    // Initially should be 0
    let count = bnToNumber(await voting.getPollsCount());
    expect(count).to.equal(0);

    // Create first poll
    await (await voting.connect(owner).createPoll("Poll 1",  admin.address,  now + 2,  1000, false, false)).wait();
    count = bnToNumber(await voting.getPollsCount());
    expect(count).to.equal(1);

    // Refresh timestamp for second poll
    now = await getCurrentTimestamp();
    // Create second poll
    await (await voting.connect(owner).createPoll("Poll 2",  admin.address,  now + 2,  1000, false, false)).wait();
    count = bnToNumber(await voting.getPollsCount());
    expect(count).to.equal(2);

    // Refresh timestamp for third poll
    now = await getCurrentTimestamp();
    // Create third poll
    await (await voting.connect(owner).createPoll("Poll 3",  admin.address,  now + 2,  1000, false, false)).wait();
    count = bnToNumber(await voting.getPollsCount());
    expect(count).to.equal(3);

    // Verify pollsCount (old way) matches getPollsCount (new way)
    const oldWay = bnToNumber(await voting.pollsCount());
    const newWay = bnToNumber(await voting.getPollsCount());
    expect(oldWay).to.equal(newWay);
    expect(newWay).to.equal(3);
  });

  // Security Enhancement Tests
  it("security: MIN_POLL_DURATION - cannot create poll with duration < 300 seconds", async function () {
    const now = await getCurrentTimestamp();
    await expect(
      voting.connect(owner).createPoll("TooShort",  admin.address,  now + 2,  299, false, false)
    ).to.be.revertedWith("Poll duration too short.");

    await expect(
      voting.connect(owner).createPoll("TooShort2",  admin.address,  now + 2,  100, false, false)
    ).to.be.revertedWith("Poll duration too short.");

    // 300 seconds should work
    await (await voting.connect(owner).createPoll("JustRight",  admin.address,  now + 2,  300, false, false)).wait();
    expect(bnToNumber(await voting.pollsCount())).to.equal(1);
  });

  it("security: MAX_OPTIONS - cannot add more than 100 options to a poll", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("LotsOfOptions",  admin.address,  now + 300,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // Add 100 options (should work)
    for (let i = 1; i <= 100; i++) {
      await (await voting.connect(admin).addOptionToPoll(pollId, `Option${i}`)).wait();
    }

    expect(bnToNumber(await voting.getOptionsCount(pollId))).to.equal(100);

    // 101st option should fail
    await expect(
      voting.connect(admin).addOptionToPoll(pollId, "Option101")
    ).to.be.revertedWith("Maximum options limit reached.");
  });

  it("security: MAX_VOTERS_BATCH - cannot add more than 50 voters in one batch", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("LotsOfVoters",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // Create array of 51 addresses (one more than limit)
    const voters51: string[] = [];
    for (let i = 0; i < 51; i++) {
      // Generate unique addresses
      voters51.push(ethers.Wallet.createRandom().address);
    }
    
    await expect(
      voting.connect(admin).addVoters(pollId, voters51)
    ).to.be.revertedWith("Batch size exceeds maximum limit.");

    // 50 voters should work
    const voters50 = voters51.slice(0, 50);
    await (await voting.connect(admin).addVoters(pollId, voters50)).wait();
  });

  it("security: vote privacy - non-admin cannot see vote counts before reveal", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("PrivacyTest",  admin.address,  now + 10,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Secret1")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "Secret2")).wait();
    await (await voting.connect(admin).addVoters(pollId, [alice.address, bob.address])).wait();

    // time-warp to start time so voting is active
    const startTime = bnToNumber(await voting.getPollStartTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // Alice and Bob vote
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();
    await (await voting.connect(bob).voteInPoll(pollId, 1)).wait();

    // Admin can see vote counts
    const adminView = await voting.connect(admin).getOption(pollId, 1);
    expect(bnToNumber(adminView[2])).to.equal(2);

    // Attacker (non-admin) sees 0 votes
    const attackerView = await voting.connect(attacker).getOption(pollId, 1);
    expect(bnToNumber(attackerView[2])).to.equal(0);

    // After reveal, everyone can see
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
    await ethers.provider.send("evm_mine", []);
    await (await voting.connect(admin).revealResults(pollId)).wait();

    const publicView = await voting.connect(attacker).getOption(pollId, 1);
    expect(bnToNumber(publicView[2])).to.equal(2);
  });

  it("security: TIME_BUFFER - cannot vote in last 30 seconds of poll", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).createPoll("BufferTest",  admin.address,  now + 10,  400, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();

    // Get endTime
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));

    // Try to vote at endTime - 25 seconds (within buffer) - should fail
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime - 25]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      voting.connect(alice).voteInPoll(pollId, 1)
    ).to.be.revertedWith("Poll not active for voting.");
  });

  it("ownership: 2-step transfer - cancelOwnershipTransfer", async function () {
    let now = await getCurrentTimestamp();
    // Propose transfer
    await (await voting.connect(owner).transferOwnership(attacker.address)).wait();

    // Owner changes mind and cancels
    await (await voting.connect(owner).cancelOwnershipTransfer()).wait();

    // Attacker cannot accept (no pending transfer)
    await expect(
      voting.connect(attacker).acceptOwnership()
    ).to.be.revertedWith("Only pending owner can accept");

    // Refresh timestamp
    now = await getCurrentTimestamp();
    // Owner still has control
    await (await voting.connect(owner).createPoll("OwnerStillInControl",  admin.address,  now + 2,  1000, false, false)).wait();
    expect(bnToNumber(await voting.pollsCount())).to.equal(1);
  });

  it("ownership: 2-step transfer - only pending owner can accept", async function () {
    let now = await getCurrentTimestamp();
    // Propose transfer to newOwner
    await (await voting.connect(owner).transferOwnership(newOwner.address)).wait();

    // Attacker tries to accept (should fail)
    await expect(
      voting.connect(attacker).acceptOwnership()
    ).to.be.revertedWith("Only pending owner can accept");

    // Correct pending owner accepts
    await (await voting.connect(newOwner).acceptOwnership()).wait();

    // Refresh timestamp
    now = await getCurrentTimestamp();
    // Verify newOwner has control
    await (await voting.connect(newOwner).createPoll("NewOwnerPoll",  admin.address,  now + 2,  1000, false, false)).wait();
    expect(bnToNumber(await voting.pollsCount())).to.equal(1);
  });

  it("ownership: renounceOwnership - makes contract ownerless", async function () {
    const now = await getCurrentTimestamp();
    await (await voting.connect(owner).renounceOwnership()).wait();

    // No one can create polls now
    await expect(
      voting.connect(owner).createPoll("Fail",  admin.address,  now + 2,  1000, false, false)
    ).to.be.revertedWith("Only owner can call");

    await expect(
      voting.connect(newOwner).createPoll("Fail2",  admin.address,  now + 2,  1000, false, false)
    ).to.be.revertedWith("Only owner can call");
  });

  // Scheduled Voting Tests
  it("scheduled poll: cannot vote before start time", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 200; // Poll starts 200 seconds in future
    const duration = 600;
    await (await voting.connect(owner).createPoll("FuturePoll",  admin.address,  startTime,  duration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Yes")).wait();
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();

    // Try to vote before start time (should fail)
    await expect(voting.connect(alice).voteInPoll(pollId, 1)).to.be.revertedWith("Poll not active for voting.");
  });

  it("scheduled poll: can add options and voters before start time", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 200;
    const duration = 600;
    await (await voting.connect(owner).createPoll("PrepPoll",  admin.address,  startTime,  duration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // Can add options before poll starts
    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "Option2")).wait();
    expect(bnToNumber(await voting.getOptionsCount(pollId))).to.equal(2);

    // Can add voters before poll starts
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();
    expect(await voting.isVoterAuthorized(pollId, alice.address)).to.be.true;
  });

  it("scheduled poll: cannot add options after poll starts", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 10; // Give time to add option before start
    const duration = 600;
    await (await voting.connect(owner).createPoll("StartedPoll",  admin.address,  startTime,  duration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // Add option before start
    await (await voting.connect(admin).addOptionToPoll(pollId, "EarlyOption")).wait();

    // Wait for poll to start
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // Cannot add option after start
    await expect(voting.connect(admin).addOptionToPoll(pollId, "LateOption")).to.be.revertedWith(
      "Poll already started; cannot add options."
    );
  });

  it("scheduled poll: cannot add voters after poll starts", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 10; // Give time to add option before start
    const duration = 600;
    await (await voting.connect(owner).createPoll("StartedPoll2",  admin.address,  startTime,  duration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();

    // Wait for poll to start
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // Cannot add voter after start
    await expect(voting.connect(admin).addVoter(pollId, alice.address)).to.be.revertedWith(
      "Poll already started; cannot add voters."
    );
  });

  it("scheduled poll: cannot remove voters after poll starts", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 20;
    const duration = 600;
    await (await voting.connect(owner).createPoll("RemoveStarted",  admin.address,  startTime,  duration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();

    // Wait for poll to start
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // Cannot remove voter after start
    await expect(voting.connect(admin).removeVoter(pollId, alice.address)).to.be.revertedWith(
      "Poll already started; cannot remove voters."
    );
  });

  it("scheduled poll: voting works during active period", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 10; // Give time to add option/voter before start
    const duration = 600;
    await (await voting.connect(owner).createPoll("ActiveVoting",  admin.address,  startTime,  duration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Yes")).wait();
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();

    // Wait for poll to start
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 10]);
    await ethers.provider.send("evm_mine", []);

    // Can vote during active period
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();
    expect(await voting.hasVoterVoted(pollId, alice.address)).to.be.true;
  });

  it("time validation: cannot create poll with start time in the past", async function () {
    const now = await getCurrentTimestamp();
    const pastTime = now - 100;
    await expect(
      voting.connect(owner).createPoll("PastPoll",  admin.address,  pastTime,  600, false, false)
    ).to.be.revertedWith("Start time cannot be in the past.");
  });

  it("time validation: cannot create poll with start time too far in future", async function () {
    const now = await getCurrentTimestamp();
    const farFuture = now + (31 * 24 * 60 * 60); // 31 days
    await expect(
      voting.connect(owner).createPoll("TooFar",  admin.address,  farFuture,  600, false, false)
    ).to.be.revertedWith("Start time too far in future.");
  });

  it("time validation: can create poll exactly at MAX_FUTURE_START boundary", async function () {
    const now = await getCurrentTimestamp();
    const maxFuture = now + (30 * 24 * 60 * 60); // Exactly 30 days
    await (await voting.connect(owner).createPoll("MaxFuture",  admin.address,  maxFuture,  600, false, false)).wait();
    expect(bnToNumber(await voting.pollsCount())).to.equal(1);
  });

  it("helper functions: getPollStartTime returns correct start time", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 100;
    await (await voting.connect(owner).createPoll("StartTimePoll",  admin.address,  startTime,  1000, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    const returnedStartTime = bnToNumber(await voting.getPollStartTime(pollId));
    expect(returnedStartTime).to.equal(startTime);
  });

  it("helper functions: isPollStarted works correctly", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 50;
    await (await voting.connect(owner).createPoll("StartCheck",  admin.address,  startTime,  600, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // Before start time
    expect(await voting.isPollStarted(pollId)).to.be.false;

    // After start time
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 10]);
    await ethers.provider.send("evm_mine", []);
    expect(await voting.isPollStarted(pollId)).to.be.true;
  });

  it("helper functions: isPollEnded works correctly", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 2;
    const duration = 400;
    await (await voting.connect(owner).createPoll("EndCheck",  admin.address,  startTime,  duration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // Before end time
    expect(await voting.isPollEnded(pollId)).to.be.false;

    // After end time + buffer
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
    await ethers.provider.send("evm_mine", []);
    expect(await voting.isPollEnded(pollId)).to.be.true;
  });

  it("helper functions: getPollStatus shows all states correctly", async function () {
    const now = await getCurrentTimestamp();
    const startTime = now + 50;
    const duration = 400;
    await (await voting.connect(owner).createPoll("StatusPoll",  admin.address,  startTime,  duration, false, false)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // State 1: Scheduled (not started)
    let status = await voting.getPollStatus(pollId);
    expect(status.started).to.be.false;
    expect(status.active).to.be.false;
    expect(status.ended).to.be.false;
    expect(status.revealed).to.be.false;

    // State 2: Active (started, voting open)
    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 10]);
    await ethers.provider.send("evm_mine", []);
    status = await voting.getPollStatus(pollId);
    expect(status.started).to.be.true;
    expect(status.active).to.be.true;
    expect(status.ended).to.be.false;
    expect(status.revealed).to.be.false;

    // State 3: Ended (voting closed)
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 35]);
    await ethers.provider.send("evm_mine", []);
    status = await voting.getPollStatus(pollId);
    expect(status.started).to.be.true;
    expect(status.active).to.be.false;
    expect(status.ended).to.be.true;
    expect(status.revealed).to.be.false;

    // State 4: Revealed (results public)
    await (await voting.connect(admin).revealResults(pollId)).wait();
    status = await voting.getPollStatus(pollId);
    expect(status.started).to.be.true;
    expect(status.active).to.be.false;
    expect(status.ended).to.be.true;
    expect(status.revealed).to.be.true;
  });
});
