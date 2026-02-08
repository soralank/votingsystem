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
    const txCreate = await voting.connect(owner).createPoll("What's 2+2?", admin.address, 1000);
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
    const opt1 = await voting.getOption(pollId, 1);
    expect(bnToNumber(opt1[0])).to.equal(1);
    expect(opt1[1]).to.equal("3");
    expect(bnToNumber(opt1[2])).to.equal(0);

    // public voting (ensure votes happen before any warp)
    await (await voting.connect(alice).voteInPoll(pollId, 2)).wait(); // votes "4"
    await (await voting.connect(bob).voteInPoll(pollId, 2)).wait();   // votes "4"

    // totals and option counts
    expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(2);
    const opt2 = await voting.getOption(pollId, 2);
    expect(bnToNumber(opt2[2])).to.equal(2);

    // one person can only vote on a poll once -> double vote should revert
    await expect(voting.connect(alice).voteInPoll(pollId, 1)).to.be.revertedWith("You have already voted.");
  });

  it("admin-only actions and permission checks for a poll", async function () {
    await (await voting.connect(owner).createPoll("Q", admin.address, 1000)).wait();
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
    const shortDuration = 60; // use a larger duration to avoid timing flakiness
    await (await voting.connect(owner).createPoll("TimePoll", admin.address, shortDuration)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "A")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "B")).wait();

    // admin authorizes alice and bob to vote
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();
    await (await voting.connect(admin).addVoter(pollId, bob.address)).wait();

    // alice votes for 1 BEFORE time warp
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();

    // admin can read voter choice even before reveal (admin allowed)
    const adminChoiceBefore = bnToNumber(await voting.getVoterChoice(pollId, alice.address));
    expect(adminChoiceBefore).to.equal(1);

    // others cannot read voter choice before reveal
    await expect(voting.connect(attacker).getVoterChoice(pollId, alice.address)).to.be.revertedWith(
      "Results not revealed."
    );

    // advance time beyond endTime (use contract-provided endTime to avoid flakiness)
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // attempting to vote after time should revert
    await expect(voting.connect(bob).voteInPoll(pollId, 2)).to.be.revertedWith("Poll time over.");

    // reveal now allowed (time has passed)
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
    const mediumDuration = 60;
    await (await voting.connect(owner).createPoll("Short2", admin.address, mediumDuration)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // Cannot end before endTime
    await expect(voting.connect(admin).endPoll(pollId)).to.be.revertedWith("Cannot end before end time.");

    // Cannot reveal before endTime
    await expect(voting.connect(admin).revealResults(pollId)).to.be.revertedWith("Cannot reveal before poll end.");
  });

  it("ownership transfer: new owner can create polls; old owner can't", async function () {
    await (await voting.connect(owner).transferOwnership(newOwner.address)).wait();

    // old owner cannot create
    await expect(voting.connect(owner).createPoll("ShouldFail", admin.address, 1000)).to.be.revertedWith(
      "Only owner can perform this action."
    );

    // new owner can create
    await (await voting.connect(newOwner).createPoll("ByNewOwner", admin.address, 1000)).wait();
    const pollId = bnToNumber(await voting.pollsCount());
    expect(pollId).to.be.greaterThan(0);
  });

  // New tests updated to poll wording
  it("misc getters return zero before options/votes and admin sees no-vote as 0 for poll", async function () {
    await (await voting.connect(owner).createPoll("EmptyPoll", admin.address, 1000)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // no options yet
    expect(bnToNumber(await voting.getOptionsCount(pollId))).to.equal(0);
    // no votes yet
    expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(0);
    // admin querying a non-voter should see 0 (no choice)
    expect(bnToNumber(await voting.getVoterChoice(pollId, alice.address))).to.equal(0);
  });

  it("creating multiple polls increments pollsCount", async function () {
    await (await voting.connect(owner).createPoll("Multi1", admin.address, 1000)).wait();
    await (await voting.connect(owner).createPoll("Multi2", admin.address, 1000)).wait();
    expect(bnToNumber(await voting.pollsCount())).to.equal(2);
  });

  it("owner (as allowed role) can add options to a poll", async function () {
    await (await voting.connect(owner).createPoll("OwnerAdd", admin.address, 1000)).wait();
    const pollId = bnToNumber(await voting.pollsCount());
    // owner should be allowed (owner or admin allowed) to add options to the poll
    await (await voting.connect(owner).addOptionToPoll(pollId, "OwnerOpt")).wait();
    expect(bnToNumber(await voting.getOptionsCount(pollId))).to.equal(1);
  });

  it("voter authorization: single voter add and vote", async function () {
    await (await voting.connect(owner).createPoll("AuthTest", admin.address, 1000)).wait();
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

    // now alice can vote
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();
    expect(await voting.hasVoterVoted(pollId, alice.address)).to.be.true;
  });

  it("voter authorization: batch voter add", async function () {
    await (await voting.connect(owner).createPoll("BatchTest", admin.address, 1000)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();

    // add multiple voters at once
    await (await voting.connect(admin).addVoters(pollId, [alice.address, bob.address, attacker.address])).wait();

    expect(await voting.isVoterAuthorized(pollId, alice.address)).to.be.true;
    expect(await voting.isVoterAuthorized(pollId, bob.address)).to.be.true;
    expect(await voting.isVoterAuthorized(pollId, attacker.address)).to.be.true;

    // all can vote
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();
    await (await voting.connect(bob).voteInPoll(pollId, 1)).wait();
    await (await voting.connect(attacker).voteInPoll(pollId, 1)).wait();

    expect(bnToNumber(await voting.getTotalVotes(pollId))).to.equal(3);
  });

  it("voter authorization: remove voter before voting", async function () {
    await (await voting.connect(owner).createPoll("RemoveTest", admin.address, 1000)).wait();
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

  it("voter authorization: cannot remove voter after they voted", async function () {
    await (await voting.connect(owner).createPoll("RemoveAfterVote", admin.address, 1000)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Option1")).wait();
    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();
    await (await voting.connect(alice).voteInPoll(pollId, 1)).wait();

    // cannot remove alice after she voted
    await expect(voting.connect(admin).removeVoter(pollId, alice.address)).to.be.revertedWith(
      "Cannot remove voter who already voted."
    );
  });

  it("helper functions: isPollActive returns correct status", async function () {
    const shortDuration = 60;
    await (await voting.connect(owner).createPoll("ActiveTest", admin.address, shortDuration)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // poll is active initially
    expect(await voting.isPollActive(pollId)).to.be.true;

    // advance time beyond endTime
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // poll is no longer active
    expect(await voting.isPollActive(pollId)).to.be.false;
  });

  it("helper functions: getWinner returns correct winner", async function () {
    await (await voting.connect(owner).createPoll("WinnerTest", admin.address, 1000)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addOptionToPoll(pollId, "Alice")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "Bob")).wait();
    await (await voting.connect(admin).addOptionToPoll(pollId, "Charlie")).wait();

    await (await voting.connect(admin).addVoters(pollId, [alice.address, bob.address, attacker.address])).wait();

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

    // advance time and reveal
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
    await ethers.provider.send("evm_mine", []);
    await (await voting.connect(admin).revealResults(pollId)).wait();

    // now anyone can see winner
    const [winnerId2, winnerName2, winnerVotes2] = await voting.connect(attacker).getWinner(pollId);
    expect(bnToNumber(winnerId2)).to.equal(2);
    expect(winnerName2).to.equal("Bob");
    expect(bnToNumber(winnerVotes2)).to.equal(2);
  });

  it("cannot add voters after poll ended", async function () {
    const shortDuration = 60;
    await (await voting.connect(owner).createPoll("EndedPoll", admin.address, shortDuration)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    // advance time and end poll
    const endTime = bnToNumber(await voting.getPollEndTime(pollId));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
    await ethers.provider.send("evm_mine", []);
    await (await voting.connect(admin).endPoll(pollId)).wait();

    // cannot add voters after poll ended
    await expect(voting.connect(admin).addVoter(pollId, alice.address)).to.be.revertedWith(
      "Poll ended; cannot add voters."
    );
  });

  it("cannot add duplicate voter", async function () {
    await (await voting.connect(owner).createPoll("DupVoter", admin.address, 1000)).wait();
    const pollId = bnToNumber(await voting.pollsCount());

    await (await voting.connect(admin).addVoter(pollId, alice.address)).wait();

    // adding alice again should revert
    await expect(voting.connect(admin).addVoter(pollId, alice.address)).to.be.revertedWith(
      "Voter already authorized."
    );
  });

  it("getPollsCount() returns correct count as polls are created", async function () {
    // Initially should be 0
    let count = bnToNumber(await voting.getPollsCount());
    expect(count).to.equal(0);

    // Create first poll
    await (await voting.connect(owner).createPoll("Poll 1", admin.address, 1000)).wait();
    count = bnToNumber(await voting.getPollsCount());
    expect(count).to.equal(1);

    // Create second poll
    await (await voting.connect(owner).createPoll("Poll 2", admin.address, 1000)).wait();
    count = bnToNumber(await voting.getPollsCount());
    expect(count).to.equal(2);

    // Create third poll
    await (await voting.connect(owner).createPoll("Poll 3", admin.address, 1000)).wait();
    count = bnToNumber(await voting.getPollsCount());
    expect(count).to.equal(3);

    // Verify pollsCount (old way) matches getPollsCount (new way)
    const oldWay = bnToNumber(await voting.pollsCount());
    const newWay = bnToNumber(await voting.getPollsCount());
    expect(oldWay).to.equal(newWay);
    expect(newWay).to.equal(3);
  });
});
