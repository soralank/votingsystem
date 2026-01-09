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

describe("Voting (TS tests) - Quiz mode", function () {
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

  it("createQuiz -> add options -> votes -> totals and double-vote revert", async function () {
    const txCreate = await voting.connect(owner).createQuiz("What's 2+2?", admin.address, 1000);
    await txCreate.wait();
    const qidBN = await voting.quizzesCount();
    const qid = bnToNumber(qidBN);

    expect(qid).to.be.greaterThan(0);

    // admin adds options
    await (await voting.connect(admin).addOptionToQuiz(qid, "3")).wait();
    await (await voting.connect(admin).addOptionToQuiz(qid, "4")).wait();

    expect(bnToNumber(await voting.getOptionsCount(qid))).to.equal(2);
    const opt1 = await voting.getOption(qid, 1);
    expect(bnToNumber(opt1[0])).to.equal(1);
    expect(opt1[1]).to.equal("3");
    expect(bnToNumber(opt1[2])).to.equal(0);

    // public voting (ensure votes happen before any warp)
    await (await voting.connect(alice).voteInQuiz(qid, 2)).wait(); // votes "4"
    await (await voting.connect(bob).voteInQuiz(qid, 2)).wait();   // votes "4"

    // totals and option counts
    expect(bnToNumber(await voting.getTotalVotes(qid))).to.equal(2);
    const opt2 = await voting.getOption(qid, 2);
    expect(bnToNumber(opt2[2])).to.equal(2);

    // double vote should revert
    await expect(voting.connect(alice).voteInQuiz(qid, 1)).to.be.revertedWith("You have already voted.");
  });

  it("admin-only actions and permission checks", async function () {
    await (await voting.connect(owner).createQuiz("Q", admin.address, 1000)).wait();
    const qid = bnToNumber(await voting.quizzesCount());

    // non-admin cannot add options
    await expect(voting.connect(attacker).addOptionToQuiz(qid, "X")).to.be.revertedWith(
      "Only quiz admin or owner allowed."
    );

    // admin can add option
    await (await voting.connect(admin).addOptionToQuiz(qid, "Opt")).wait();

    // non-admin/non-owner cannot reveal (before end)
    await expect(voting.connect(attacker).revealResults(qid)).to.be.revertedWith(
      "Only quiz admin or owner allowed."
    );
  });

  it("time limits, reveal and end behavior, and getVoterChoice access control", async function () {
    const shortDuration = 60; // use a larger duration to avoid timing flakiness
    await (await voting.connect(owner).createQuiz("TimeQ", admin.address, shortDuration)).wait();
    const qid = bnToNumber(await voting.quizzesCount());

    await (await voting.connect(admin).addOptionToQuiz(qid, "A")).wait();
    await (await voting.connect(admin).addOptionToQuiz(qid, "B")).wait();

    // alice votes for 1 BEFORE time warp
    await (await voting.connect(alice).voteInQuiz(qid, 1)).wait();

    // admin can read voter choice even before reveal (admin allowed)
    const adminChoiceBefore = bnToNumber(await voting.getVoterChoice(qid, alice.address));
    expect(adminChoiceBefore).to.equal(1);

    // others cannot read voter choice before reveal
    await expect(voting.connect(attacker).getVoterChoice(qid, alice.address)).to.be.revertedWith(
      "Results not revealed."
    );

    // advance time beyond endTime (use contract-provided endTime to avoid flakiness)
    const endTime = bnToNumber(await voting.getQuizEndTime(qid));
    await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
    await ethers.provider.send("evm_mine", []);

    // attempting to vote after time should revert
    await expect(voting.connect(bob).voteInQuiz(qid, 2)).to.be.revertedWith("Quiz time over.");

    // reveal now allowed (time has passed)
    await (await voting.connect(admin).revealResults(qid)).wait();

    // after reveal, anyone can read voter choice
    const choiceAfterReveal = bnToNumber(await voting.getVoterChoice(qid, alice.address));
    expect(choiceAfterReveal).to.equal(1);

    // endQuiz allowed after time
    await (await voting.connect(admin).endQuiz(qid)).wait();

    // after explicit end, adding option should revert
    await expect(voting.connect(admin).addOptionToQuiz(qid, "LateOpt")).to.be.revertedWith(
      "Quiz ended; cannot add options."
    );
  });

  it("endQuiz before endTime and reveal before endTime revert appropriately", async function () {
    const mediumDuration = 60;
    await (await voting.connect(owner).createQuiz("Short2", admin.address, mediumDuration)).wait();
    const qid = bnToNumber(await voting.quizzesCount());

    // Cannot end before endTime
    await expect(voting.connect(admin).endQuiz(qid)).to.be.revertedWith("Cannot end before end time.");

    // Cannot reveal before endTime
    await expect(voting.connect(admin).revealResults(qid)).to.be.revertedWith("Cannot reveal before quiz end.");
  });

  it("ownership transfer: new owner can create quizzes; old owner can't", async function () {
    await (await voting.connect(owner).transferOwnership(newOwner.address)).wait();

    // old owner cannot create
    await expect(voting.connect(owner).createQuiz("ShouldFail", admin.address, 1000)).to.be.revertedWith(
      "Only owner can perform this action."
    );

    // new owner can create
    await (await voting.connect(newOwner).createQuiz("ByNewOwner", admin.address, 1000)).wait();
    const qid = bnToNumber(await voting.quizzesCount());
    expect(qid).to.be.greaterThan(0);
  });

  // New tests to increase coverage (non-invasive, low-risk)
  it("misc getters return zero before options/votes and admin sees no-vote as 0", async function () {
    await (await voting.connect(owner).createQuiz("EmptyQ", admin.address, 1000)).wait();
    const qid = bnToNumber(await voting.quizzesCount());

    // no options yet
    expect(bnToNumber(await voting.getOptionsCount(qid))).to.equal(0);
    // no votes yet
    expect(bnToNumber(await voting.getTotalVotes(qid))).to.equal(0);
    // admin querying a non-voter should see 0 (no choice)
    expect(bnToNumber(await voting.getVoterChoice(qid, alice.address))).to.equal(0);
  });

  it("creating multiple quizzes increments quizzesCount", async function () {
    await (await voting.connect(owner).createQuiz("Multi1", admin.address, 1000)).wait();
    await (await voting.connect(owner).createQuiz("Multi2", admin.address, 1000)).wait();
    expect(bnToNumber(await voting.quizzesCount())).to.equal(2);
  });

  it("owner (as allowed role) can add options to a quiz", async function () {
    await (await voting.connect(owner).createQuiz("OwnerAdd", admin.address, 1000)).wait();
    const qid = bnToNumber(await voting.quizzesCount());
    // owner should be allowed (owner or admin allowed) to add options
    await (await voting.connect(owner).addOptionToQuiz(qid, "OwnerOpt")).wait();
    expect(bnToNumber(await voting.getOptionsCount(qid))).to.equal(1);
  });
});
