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

describe("FranchiseManager", function () {
  let electionsManager: any;
  let tokenManager: any;
  let franchiseManager: any;
  let owner: any;
  let franchisee1: any;
  let franchisee2: any;
  let alice: any;
  let bob: any;
  let attacker: any;

  const ONE_ETH = ethers.parseEther("1.0");
  const HALF_ETH = ethers.parseEther("0.5");
  const FEE_PER_POLL = ethers.parseEther("0.1");
  const TRANSFER_FEE = ethers.parseEther("0.05");
  const ONE_DAY = 86400;
  const THIRTY_DAYS = 30 * ONE_DAY;

  beforeEach(async function () {
    [owner, franchisee1, franchisee2, alice, bob, attacker] =
      await ethers.getSigners();

    // Deploy ElectionsManager
    electionsManager = await ethers.deployContract("ElectionsManager");

    // Deploy TokenManager (needed for infra)
    const TokenManager = await ethers.getContractFactory("TokenManager");
    tokenManager = await TokenManager.deploy(electionsManager.target);

    // Configure infra
    await electionsManager.setTokenManager(tokenManager.target);

    // Deploy FranchiseManager
    const FranchiseManager = await ethers.getContractFactory("FranchiseManager");
    franchiseManager = await FranchiseManager.deploy(electionsManager.target);

    // Register FranchiseManager in ElectionsManager
    await electionsManager.setFranchiseManager(franchiseManager.target);

    // Set transfer fee
    await franchiseManager.setTransferFee(TRANSFER_FEE);
  });

  // ══════════════════════════════════════════════════════════════
  //  GRANTING FRANCHISES
  // ══════════════════════════════════════════════════════════════

  describe("Grant Franchise", function () {
    it("should grant a franchise successfully", async function () {
      const tx = await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        10,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );
      const receipt = await tx.wait();

      expect(bnToNumber(await franchiseManager.franchiseCount())).to.equal(1);

      const fid = bnToNumber(
        await franchiseManager.franchiseeToId(franchisee1.address)
      );
      expect(fid).to.equal(1);

      const f = await franchiseManager.getFranchise(1);
      expect(f.franchisee).to.equal(franchisee1.address);
      expect(bnToNumber(f.maxPolls)).to.equal(10);
      expect(bnToNumber(f.pollsUsed)).to.equal(0);
      expect(f.feePerPoll).to.equal(FEE_PER_POLL);
      expect(f.expired).to.be.false;
      expect(f.exhausted).to.be.false;
    });

    it("should emit FranchiseGranted event", async function () {
      await expect(
        franchiseManager.grantFranchise(
          franchisee1.address,
          THIRTY_DAYS,
          5,
          FEE_PER_POLL,
          tokenManager.target,
          ethers.ZeroAddress
        )
      ).to.emit(franchiseManager, "FranchiseGranted");
    });

    it("should revert if non-owner tries to grant", async function () {
      await expect(
        franchiseManager
          .connect(attacker)
          .grantFranchise(
            franchisee1.address,
            THIRTY_DAYS,
            10,
            FEE_PER_POLL,
            tokenManager.target,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("Only owner");
    });

    it("should revert for zero address", async function () {
      await expect(
        franchiseManager.grantFranchise(
          ethers.ZeroAddress,
          THIRTY_DAYS,
          10,
          FEE_PER_POLL,
          tokenManager.target,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Invalid address");
    });

    it("should revert if owner tries to franchise themselves", async function () {
      await expect(
        franchiseManager.grantFranchise(
          owner.address,
          THIRTY_DAYS,
          10,
          FEE_PER_POLL,
          tokenManager.target,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Owner cannot be franchisee");
    });

    it("should revert if maxPolls is 0", async function () {
      await expect(
        franchiseManager.grantFranchise(
          franchisee1.address,
          THIRTY_DAYS,
          0,
          FEE_PER_POLL,
          tokenManager.target,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Polls: 1-100");
    });

    it("should revert if maxPolls exceeds 100", async function () {
      await expect(
        franchiseManager.grantFranchise(
          franchisee1.address,
          THIRTY_DAYS,
          101,
          FEE_PER_POLL,
          tokenManager.target,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Polls: 1-100");
    });

    it("should revert if duration is 0", async function () {
      await expect(
        franchiseManager.grantFranchise(
          franchisee1.address,
          0,
          10,
          FEE_PER_POLL,
          tokenManager.target,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Duration must be > 0");
    });

    it("should supersede active franchise when re-granting to same address", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        10,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );

      // Re-grant to same address while still active — supersedes
      const tx = await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );

      // Old franchise (id=1) superseded, new franchise (id=2) active
      expect(bnToNumber(await franchiseManager.franchiseCount())).to.equal(2);
      const fid = bnToNumber(
        await franchiseManager.franchiseeToId(franchisee1.address)
      );
      expect(fid).to.equal(2);

      // Verify FranchiseSuperseded event
      await expect(tx)
        .to.emit(franchiseManager, "FranchiseSuperseded")
        .withArgs(1, 2, franchisee1.address);
    });

    it("should allow re-granting after franchise expires", async function () {
      // Grant with 1 second duration
      await franchiseManager.grantFranchise(
        franchisee1.address,
        1,
        10,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );

      // Fast forward 2 seconds
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine", []);

      // Should be able to re-grant
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );

      expect(bnToNumber(await franchiseManager.franchiseCount())).to.equal(2);
      const fid = bnToNumber(
        await franchiseManager.franchiseeToId(franchisee1.address)
      );
      expect(fid).to.equal(2);
    });

    it("should allow granting to multiple different addresses", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        10,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );
      await franchiseManager.grantFranchise(
        franchisee2.address,
        THIRTY_DAYS,
        20,
        HALF_ETH,
        tokenManager.target,
        ethers.ZeroAddress
      );

      expect(bnToNumber(await franchiseManager.franchiseCount())).to.equal(2);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  CREATING POLLS VIA FRANCHISE
  // ══════════════════════════════════════════════════════════════

  describe("Create Franchise Poll", function () {
    beforeEach(async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );
    });

    it("should create first poll for free", async function () {
      const now = await getCurrentTimestamp();
      const tx = await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("First Poll", now + 60, 3600, false, false);
      await tx.wait();

      // Verify poll was created in ElectionsManager
      const pollCount = bnToNumber(await electionsManager.pollsCount());
      expect(pollCount).to.equal(1);

      // Verify franchisee is the poll admin
      const poll = await electionsManager.polls(1);
      expect(poll.admin).to.equal(franchisee1.address);
      expect(poll.title).to.equal("First Poll");

      // Verify franchise state
      const f = await franchiseManager.getFranchise(1);
      expect(bnToNumber(f.pollsUsed)).to.equal(1);
    });

    it("should emit FranchisePollCreated event", async function () {
      const now = await getCurrentTimestamp();
      await expect(
        franchiseManager
          .connect(franchisee1)
          .createFranchisePoll("Event Poll", now + 60, 3600, false, false)
      ).to.emit(franchiseManager, "FranchisePollCreated");
    });

    it("should require fee for second poll onwards", async function () {
      const now = await getCurrentTimestamp();

      // First poll — free
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 1", now + 60, 3600, false, false);

      // Second poll — requires fee
      await expect(
        franchiseManager
          .connect(franchisee1)
          .createFranchisePoll("Poll 2", now + 60, 3600, false, false, {
            value: 0,
          })
      ).to.be.revertedWith("Insufficient fee");

      // Second poll — with fee
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 2", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      expect(bnToNumber(await electionsManager.pollsCount())).to.equal(2);
    });

    it("should refund excess ETH", async function () {
      const now = await getCurrentTimestamp();

      // First poll free
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 1", now + 60, 3600, false, false);

      // Send excess for second poll
      const balBefore = await ethers.provider.getBalance(franchisee1.address);
      const tx = await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 2", now + 60, 3600, false, false, {
          value: ONE_ETH, // Sending 1 ETH when fee is 0.1 ETH
        });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(franchisee1.address);

      // Should only have paid feePerPoll + gas
      const gasUsedBig = BigInt(receipt!.gasUsed) * BigInt(receipt!.gasPrice);
      const diff = balBefore - balAfter - gasUsedBig;
      expect(diff).to.equal(FEE_PER_POLL);
    });

    it("should refund ETH if sent for first free poll", async function () {
      const now = await getCurrentTimestamp();

      const balBefore = await ethers.provider.getBalance(franchisee1.address);
      const tx = await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Free Poll", now + 60, 3600, false, false, {
          value: ONE_ETH,
        });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(franchisee1.address);

      // Should only have paid gas (fee = 0 for first poll)
      const gasUsedBig = BigInt(receipt!.gasUsed) * BigInt(receipt!.gasPrice);
      const diff = balBefore - balAfter - gasUsedBig;
      expect(diff).to.equal(0n);
    });

    it("should revert if no franchise", async function () {
      const now = await getCurrentTimestamp();
      await expect(
        franchiseManager
          .connect(attacker)
          .createFranchisePoll("Bad Poll", now + 60, 3600, false, false)
      ).to.be.revertedWith("No franchise");
    });

    it("should revert if franchise expired", async function () {
      // Grant with very short duration
      await franchiseManager.grantFranchise(
        franchisee2.address,
        2, // 2 seconds
        10,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );

      // Fast forward past expiry
      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine", []);

      const now = await getCurrentTimestamp();
      await expect(
        franchiseManager
          .connect(franchisee2)
          .createFranchisePoll("Expired Poll", now + 60, 3600, false, false)
      ).to.be.revertedWith("Franchise expired");
    });

    it("should revert when max polls reached", async function () {
      // Grant with only 2 polls
      await franchiseManager.grantFranchise(
        franchisee2.address,
        THIRTY_DAYS,
        2,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const now = await getCurrentTimestamp();

      // 1st poll (free)
      await franchiseManager
        .connect(franchisee2)
        .createFranchisePoll("F2 Poll 1", now + 60, 3600, false, false);

      // 2nd poll (paid)
      await franchiseManager
        .connect(franchisee2)
        .createFranchisePoll("F2 Poll 2", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      // 3rd poll should fail
      await expect(
        franchiseManager
          .connect(franchisee2)
          .createFranchisePoll("F2 Poll 3", now + 60, 3600, false, false, {
            value: FEE_PER_POLL,
          })
      ).to.be.revertedWith("Max polls reached");
    });

    it("franchisee should be able to manage their poll as admin", async function () {
      const now = await getCurrentTimestamp();

      // Create poll via franchise
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Managed Poll", now + 120, 3600, false, false);

      const pollId = bnToNumber(await electionsManager.pollsCount());

      // Franchisee (as poll admin) adds options
      await electionsManager
        .connect(franchisee1)
        .addOptionToPoll(pollId, "Option A");
      await electionsManager
        .connect(franchisee1)
        .addOptionToPoll(pollId, "Option B");

      expect(bnToNumber(await electionsManager.getOptionsCount(pollId))).to.equal(2);

      // Franchisee adds voters
      await electionsManager
        .connect(franchisee1)
        .addVoters(pollId, [alice.address, bob.address]);

      expect(
        await electionsManager.authorizedVoters(pollId, alice.address)
      ).to.be.true;
    });

    it("should create poll with token voting enabled", async function () {
      const now = await getCurrentTimestamp();

      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Token Poll", now + 60, 3600, true, false);

      const poll = await electionsManager.polls(1);
      expect(poll.tokenVotingEnabled).to.be.true;
      expect(poll.tokenVotingRequired).to.be.false;
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  FRANCHISE TRANSFER
  // ══════════════════════════════════════════════════════════════

  describe("Franchise Transfer", function () {
    beforeEach(async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        10,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );
    });

    it("should submit transfer request", async function () {
      await franchiseManager
        .connect(franchisee1)
        .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE });

      const req = await franchiseManager.transferRequests(1);
      expect(req.newFranchisee).to.equal(franchisee2.address);
      expect(req.feePaid).to.equal(TRANSFER_FEE);
      expect(req.pending).to.be.true;
    });

    it("should emit TransferRequested event", async function () {
      await expect(
        franchiseManager
          .connect(franchisee1)
          .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE })
      ).to.emit(franchiseManager, "TransferRequested");
    });

    it("should approve transfer", async function () {
      await franchiseManager
        .connect(franchisee1)
        .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE });

      await expect(franchiseManager.approveTransfer(1)).to.emit(
        franchiseManager,
        "TransferApproved"
      );

      // Verify franchisee changed
      const f = await franchiseManager.getFranchise(1);
      expect(f.franchisee).to.equal(franchisee2.address);

      // Verify mappings
      expect(
        bnToNumber(await franchiseManager.franchiseeToId(franchisee2.address))
      ).to.equal(1);
      expect(
        bnToNumber(await franchiseManager.franchiseeToId(franchisee1.address))
      ).to.equal(0);
    });

    it("franchisee2 should be able to create polls after transfer", async function () {
      await franchiseManager
        .connect(franchisee1)
        .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE });
      await franchiseManager.approveTransfer(1);

      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee2)
        .createFranchisePoll("Transferred Poll", now + 60, 3600, false, false);

      const poll = await electionsManager.polls(
        bnToNumber(await electionsManager.pollsCount())
      );
      expect(poll.admin).to.equal(franchisee2.address);
    });

    it("franchisee1 should NOT be able to create polls after transfer", async function () {
      await franchiseManager
        .connect(franchisee1)
        .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE });
      await franchiseManager.approveTransfer(1);

      const now = await getCurrentTimestamp();
      await expect(
        franchiseManager
          .connect(franchisee1)
          .createFranchisePoll("Nope", now + 60, 3600, false, false)
      ).to.be.revertedWith("No franchise");
    });

    it("should reject transfer and refund fee", async function () {
      await franchiseManager
        .connect(franchisee1)
        .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE });

      const balBefore = await ethers.provider.getBalance(franchisee1.address);
      await franchiseManager.rejectTransfer(1);
      const balAfter = await ethers.provider.getBalance(franchisee1.address);

      // Franchisee1 should get refund
      expect(balAfter - balBefore).to.equal(TRANSFER_FEE);

      // Franchise unchanged
      const f = await franchiseManager.getFranchise(1);
      expect(f.franchisee).to.equal(franchisee1.address);

      // Request cleared
      const req = await franchiseManager.transferRequests(1);
      expect(req.pending).to.be.false;
    });

    it("should revert transfer if not franchisee", async function () {
      await expect(
        franchiseManager
          .connect(attacker)
          .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE })
      ).to.be.revertedWith("Not franchisee");
    });

    it("should revert transfer if insufficient fee", async function () {
      await expect(
        franchiseManager
          .connect(franchisee1)
          .requestTransfer(1, franchisee2.address, { value: 0 })
      ).to.be.revertedWith("Insufficient transfer fee");
    });

    it("should revert transfer if franchise expired", async function () {
      // Grant with short duration
      await franchiseManager.grantFranchise(
        franchisee2.address,
        2,
        10,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );

      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        franchiseManager
          .connect(franchisee2)
          .requestTransfer(2, alice.address, { value: TRANSFER_FEE })
      ).to.be.revertedWith("Franchise expired");
    });

    it("should revert if transfer already pending", async function () {
      await franchiseManager
        .connect(franchisee1)
        .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE });

      await expect(
        franchiseManager
          .connect(franchisee1)
          .requestTransfer(1, alice.address, { value: TRANSFER_FEE })
      ).to.be.revertedWith("Transfer pending");
    });

    it("should revert transfer to address with active franchise", async function () {
      await franchiseManager.grantFranchise(
        franchisee2.address,
        THIRTY_DAYS,
        10,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      await expect(
        franchiseManager
          .connect(franchisee1)
          .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE })
      ).to.be.revertedWith("Target has active franchise");
    });

    it("should revert transfer to zero address", async function () {
      await expect(
        franchiseManager
          .connect(franchisee1)
          .requestTransfer(1, ethers.ZeroAddress, { value: TRANSFER_FEE })
      ).to.be.revertedWith("Invalid address");
    });

    it("should revert transfer to owner", async function () {
      await expect(
        franchiseManager
          .connect(franchisee1)
          .requestTransfer(1, owner.address, { value: TRANSFER_FEE })
      ).to.be.revertedWith("Owner cannot be franchisee");
    });

    it("only owner can approve/reject transfers", async function () {
      await franchiseManager
        .connect(franchisee1)
        .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE });

      await expect(
        franchiseManager.connect(attacker).approveTransfer(1)
      ).to.be.revertedWith("Only owner");

      await expect(
        franchiseManager.connect(attacker).rejectTransfer(1)
      ).to.be.revertedWith("Only owner");
    });

    it("should revert approve/reject if no pending transfer", async function () {
      await expect(franchiseManager.approveTransfer(1)).to.be.revertedWith(
        "No pending transfer"
      );
      await expect(franchiseManager.rejectTransfer(1)).to.be.revertedWith(
        "No pending transfer"
      );
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  IRREVOCABILITY
  // ══════════════════════════════════════════════════════════════

  describe("Irrevocability", function () {
    it("franchise cannot be revoked — only expires or exhausts", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        10,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      // Verify franchise is active
      expect(await franchiseManager.isFranchiseActive(1)).to.be.true;

      // There's no revoke function — the franchise persists
      // The only way it becomes inactive is through expiry or exhaustion
      expect(bnToNumber(await franchiseManager.remainingPolls(1))).to.equal(10);
    });

    it("expired franchise returns 0 remaining polls", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        2,
        10,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine", []);

      expect(bnToNumber(await franchiseManager.remainingPolls(1))).to.equal(0);
      expect(await franchiseManager.isFranchiseActive(1)).to.be.false;
    });

    it("exhausted franchise returns 0 remaining polls", async function () {
      await franchiseManager.grantFranchise(
        franchisee2.address,
        THIRTY_DAYS,
        1, // only 1 poll
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee2)
        .createFranchisePoll("Only Poll", now + 60, 3600, false, false);

      expect(bnToNumber(await franchiseManager.remainingPolls(2))).to.equal(0);
      expect(await franchiseManager.isFranchiseActive(2)).to.be.false;
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  FEES & WITHDRAWALS
  // ══════════════════════════════════════════════════════════════

  describe("Fees and Withdrawals", function () {
    beforeEach(async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
    });

    it("should accumulate poll fees", async function () {
      const now = await getCurrentTimestamp();

      // First poll free
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 1", now + 60, 3600, false, false);

      // Second poll with fee
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 2", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      // Third poll with fee
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 3", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      const balance = await ethers.provider.getBalance(
        franchiseManager.target
      );
      expect(balance).to.equal(FEE_PER_POLL * 2n);
    });

    it("should withdraw fees to owner", async function () {
      const now = await getCurrentTimestamp();

      // Create 2 polls (1 free + 1 paid)
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 1", now + 60, 3600, false, false);
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 2", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      const ownerBalBefore = await ethers.provider.getBalance(owner.address);
      const tx = await franchiseManager.withdrawFees();
      const receipt = await tx.wait();
      const gasUsedBig = BigInt(receipt!.gasUsed) * BigInt(receipt!.gasPrice);
      const ownerBalAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalAfter - ownerBalBefore + gasUsedBig).to.equal(FEE_PER_POLL);
    });

    it("should emit FeesWithdrawn event", async function () {
      const now = await getCurrentTimestamp();

      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 1", now + 60, 3600, false, false);
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 2", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      await expect(franchiseManager.withdrawFees()).to.emit(
        franchiseManager,
        "FeesWithdrawn"
      );
    });

    it("should revert withdraw if no fees", async function () {
      await expect(franchiseManager.withdrawFees()).to.be.revertedWith(
        "No fees"
      );
    });

    it("only owner can withdraw", async function () {
      await expect(
        franchiseManager.connect(attacker).withdrawFees()
      ).to.be.revertedWith("Only owner");
    });

    it("should set and read transfer fee", async function () {
      const newFee = ethers.parseEther("0.2");
      await expect(franchiseManager.setTransferFee(newFee)).to.emit(
        franchiseManager,
        "TransferFeeSet"
      );
      expect(await franchiseManager.transferFee()).to.equal(newFee);
    });

    it("only owner can set transfer fee", async function () {
      await expect(
        franchiseManager.connect(attacker).setTransferFee(ONE_ETH)
      ).to.be.revertedWith("Only owner");
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  VIEW HELPERS
  // ══════════════════════════════════════════════════════════════

  describe("View Helpers", function () {
    it("remainingPolls returns correct count", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        3,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      expect(bnToNumber(await franchiseManager.remainingPolls(1))).to.equal(3);

      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 1", now + 60, 3600, false, false);

      expect(bnToNumber(await franchiseManager.remainingPolls(1))).to.equal(2);
    });

    it("isFranchiseActive returns true for active franchise", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        10,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      expect(await franchiseManager.isFranchiseActive(1)).to.be.true;
    });

    it("isFranchiseActive returns false for expired franchise", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        2,
        10,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine", []);

      expect(await franchiseManager.isFranchiseActive(1)).to.be.false;
    });

    it("isFranchiseActive returns false for non-existent franchise", async function () {
      expect(await franchiseManager.isFranchiseActive(999)).to.be.false;
    });

    it("getFranchise returns expired=true after expiry", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        2,
        10,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      await ethers.provider.send("evm_increaseTime", [5]);
      await ethers.provider.send("evm_mine", []);

      const f = await franchiseManager.getFranchise(1);
      expect(f.expired).to.be.true;
    });

    it("getFranchise returns exhausted=true when all polls used", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        1,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Only Poll", now + 60, 3600, false, false);

      const f = await franchiseManager.getFranchise(1);
      expect(f.exhausted).to.be.true;
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  SECURITY: NO SUB-FRANCHISES, NO SYSTEM DISRUPTION
  // ══════════════════════════════════════════════════════════════

  describe("Security Constraints", function () {
    it("franchisee cannot call setFranchiseManager on ElectionsManager", async function () {
      await expect(
        electionsManager
          .connect(franchisee1)
          .setFranchiseManager(attacker.address)
      ).to.be.revertedWith("Only owner can call");
    });

    it("franchisee cannot call setTokenManager", async function () {
      await expect(
        electionsManager
          .connect(franchisee1)
          .setTokenManager(attacker.address)
      ).to.be.revertedWith("Only owner can call");
    });

    it("franchisee cannot directly call createPoll on ElectionsManager", async function () {
      const now = await getCurrentTimestamp();
      await expect(
        electionsManager
          .connect(franchisee1)
          .createPoll("Direct Poll", franchisee1.address, now + 60, 3600, false, false, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Not authorized");
    });

    it("setFranchiseManager requires non-zero address", async function () {
      await expect(
        electionsManager.setFranchiseManager(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("setFranchiseManager emits event", async function () {
      const newAddr = franchisee1.address;
      await expect(electionsManager.setFranchiseManager(newAddr))
        .to.emit(electionsManager, "FranchiseManagerSet")
        .withArgs(newAddr);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  EDGE CASES
  // ══════════════════════════════════════════════════════════════

  describe("Edge Cases", function () {
    it("franchise with feePerPoll = 0 means all polls are free", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        0, // free polls
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const now = await getCurrentTimestamp();

      // All polls should be free
      for (let i = 1; i <= 3; i++) {
        await franchiseManager
          .connect(franchisee1)
          .createFranchisePoll(`Free Poll ${i}`, now + 60, 3600, false, false);
      }

      expect(bnToNumber(await electionsManager.pollsCount())).to.equal(3);
    });

    it("transfer preserves pollsUsed count", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const now = await getCurrentTimestamp();

      // Use 2 polls
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 1", now + 60, 3600, false, false);
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Poll 2", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      // Transfer
      await franchiseManager
        .connect(franchisee1)
        .requestTransfer(1, franchisee2.address, { value: TRANSFER_FEE });
      await franchiseManager.approveTransfer(1);

      // Verify pollsUsed carried over
      const f = await franchiseManager.getFranchise(1);
      expect(bnToNumber(f.pollsUsed)).to.equal(2);
      expect(bnToNumber(f.maxPolls)).to.equal(5);

      // New franchisee can still create 3 more polls
      // 3rd poll requires fee (pollsUsed is 2, > 0)
      await franchiseManager
        .connect(franchisee2)
        .createFranchisePoll("New Owner Poll", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      const fAfter = await franchiseManager.getFranchise(1);
      expect(bnToNumber(fAfter.pollsUsed)).to.equal(3);
    });

    it("re-grant after exhaustion creates independent franchise", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        1,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Only Poll", now + 60, 3600, false, false);

      // Exhausted — re-grant should work
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        3,
        HALF_ETH,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const fid = bnToNumber(
        await franchiseManager.franchiseeToId(franchisee1.address)
      );
      const f = await franchiseManager.getFranchise(fid);
      expect(bnToNumber(f.maxPolls)).to.equal(3);
      expect(bnToNumber(f.pollsUsed)).to.equal(0);
      expect(f.feePerPoll).to.equal(HALF_ETH);
    });

    it("franchise with maxPolls = 100 works", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        100,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const f = await franchiseManager.getFranchise(1);
      expect(bnToNumber(f.maxPolls)).to.equal(100);
      expect(bnToNumber(await franchiseManager.remainingPolls(1))).to.equal(100);
    });

    it("constructor rejects zero address for ElectionsManager", async function () {
      const FranchiseManager = await ethers.getContractFactory("FranchiseManager");
      await expect(
        FranchiseManager.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  ADD POLLS TO EXISTING FRANCHISE
  // ══════════════════════════════════════════════════════════════

  describe("Add Polls", function () {
    beforeEach(async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );
    });

    it("should add polls to an active franchise", async function () {
      await franchiseManager.addPolls(1, 10);
      const f = await franchiseManager.getFranchise(1);
      expect(bnToNumber(f.maxPolls)).to.equal(15);
    });

    it("should emit PollsAdded event", async function () {
      await expect(franchiseManager.addPolls(1, 10))
        .to.emit(franchiseManager, "PollsAdded")
        .withArgs(1, 10, 15);
    });

    it("should reflect in remainingPolls", async function () {
      expect(bnToNumber(await franchiseManager.remainingPolls(1))).to.equal(5);
      await franchiseManager.addPolls(1, 20);
      expect(bnToNumber(await franchiseManager.remainingPolls(1))).to.equal(25);
    });

    it("should revert if non-owner calls addPolls", async function () {
      await expect(
        franchiseManager.connect(franchisee1).addPolls(1, 5)
      ).to.be.revertedWith("Only owner");
    });

    it("should revert if franchise does not exist", async function () {
      await expect(
        franchiseManager.addPolls(999, 5)
      ).to.be.revertedWith("Franchise does not exist");
    });

    it("should revert if franchise is expired", async function () {
      // Grant with 1 second duration
      await franchiseManager.grantFranchise(
        franchisee2.address,
        1,
        5,
        FEE_PER_POLL,
        tokenManager.target,
        ethers.ZeroAddress
      );
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        franchiseManager.addPolls(2, 5)
      ).to.be.revertedWith("Franchise expired");
    });

    it("should allow adding polls to an exhausted franchise", async function () {
      // Grant with 1 poll
      await franchiseManager.grantFranchise(
        franchisee2.address,
        THIRTY_DAYS,
        1,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee2)
        .createFranchisePoll("Exhaust", now + 60, 3600, false, false);

      // addPolls should succeed even when franchise is exhausted
      await franchiseManager.addPolls(2, 5);
      const f = await franchiseManager.getFranchise(2);
      expect(bnToNumber(f.maxPolls)).to.equal(6);
    });

    it("should revert if additionalPolls is 0", async function () {
      await expect(
        franchiseManager.addPolls(1, 0)
      ).to.be.revertedWith("Must add > 0");
    });

    it("should revert if total exceeds 100", async function () {
      await expect(
        franchiseManager.addPolls(1, 96)
      ).to.be.revertedWith("Exceeds 100 poll cap");
    });

    it("should allow adding up to exactly 100", async function () {
      await franchiseManager.addPolls(1, 95); // 5 + 95 = 100
      const f = await franchiseManager.getFranchise(1);
      expect(bnToNumber(f.maxPolls)).to.equal(100);
    });

    it("should work after some polls are used", async function () {
      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("P1", now + 60, 3600, false, false);
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("P2", now + 60, 3600, false, false, {
          value: FEE_PER_POLL,
        });

      // 2 used out of 5, add 10 more -> 15 total, 13 remaining
      await franchiseManager.addPolls(1, 10);
      expect(bnToNumber(await franchiseManager.remainingPolls(1))).to.equal(13);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  FRANCHISE SUPERSEDE (RE-GRANT)
  // ══════════════════════════════════════════════════════════════

  describe("Franchise Supersede", function () {
    it("should supersede active franchise and preserve old polls", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      // Create a poll under franchise 1
      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Old Franchise Poll", now + 60, 3600, false, false);

      // Old poll exists on ElectionsManager
      const pollCountBefore = bnToNumber(await electionsManager.pollsCount());
      expect(pollCountBefore).to.be.greaterThan(0);

      // Supersede with new franchise
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        10,
        HALF_ETH,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      // Old poll still exists on ElectionsManager (NOT deleted)
      const poll = await electionsManager.polls(pollCountBefore);
      expect(poll.title).to.equal("Old Franchise Poll");
      expect(poll.admin).to.equal(franchisee1.address);
      expect(poll.exists).to.be.true;
    });

    it("should allow creating polls under new franchise after supersede", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      // Use a poll
      const now = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Pre-supersede", now + 60, 3600, false, false);

      // Supersede
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        3,
        HALF_ETH,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      // New franchise should start fresh (0 polls used, first free)
      const newFid = bnToNumber(
        await franchiseManager.franchiseeToId(franchisee1.address)
      );
      const f = await franchiseManager.getFranchise(newFid);
      expect(bnToNumber(f.pollsUsed)).to.equal(0);
      expect(bnToNumber(f.maxPolls)).to.equal(3);
      expect(f.feePerPoll).to.equal(HALF_ETH);

      // Create poll under new franchise (first is free)
      const now2 = await getCurrentTimestamp();
      await franchiseManager
        .connect(franchisee1)
        .createFranchisePoll("Post-supersede", now2 + 60, 3600, false, false);

      const fAfter = await franchiseManager.getFranchise(newFid);
      expect(bnToNumber(fAfter.pollsUsed)).to.equal(1);
    });

    it("should not allow old franchise to create polls after supersede", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      // Supersede with new franchise
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        3,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      // franchiseeToId now points to franchise 2
      // franchisee can only use the new one; old is orphaned
      const fid = bnToNumber(
        await franchiseManager.franchiseeToId(franchisee1.address)
      );
      expect(fid).to.equal(2);

      // Old franchise 1 still exists but is disconnected from the address
      const f1 = await franchiseManager.getFranchise(1);
      expect(f1.franchisee).to.equal(franchisee1.address); // record preserved
      expect(bnToNumber(f1.maxPolls)).to.equal(5); // untouched
    });

    it("should emit FranchiseSuperseded and FranchiseGranted events", async function () {
      await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        5,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      const tx = await franchiseManager.grantFranchise(
        franchisee1.address,
        THIRTY_DAYS,
        3,
        FEE_PER_POLL,
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );

      await expect(tx)
        .to.emit(franchiseManager, "FranchiseSuperseded")
        .withArgs(1, 2, franchisee1.address);
      await expect(tx)
        .to.emit(franchiseManager, "FranchiseGranted");
    });
  });
});
