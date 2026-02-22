import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("VotingToken - Per-Poll ERC20-Compatible Token", function () {
  let votingToken: any;
  let tokenManager: any;
  let alice: any;
  let bob: any;
  let charlie: any;

  const POLL_ID = 1;
  const TOKEN_NAME = "Vote-TestPoll";
  const TOKEN_SYMBOL = "VOTE1";

  beforeEach(async function () {
    [tokenManager, alice, bob, charlie] = await ethers.getSigners();

    // Deploy VotingToken (simulating TokenManager deployment)
    const VotingToken = await ethers.getContractFactory("VotingToken");
    votingToken = await VotingToken.connect(tokenManager).deploy(
      POLL_ID,
      TOKEN_NAME,
      TOKEN_SYMBOL
    );
  });

  describe("Deployment", function () {
    it("should set correct token metadata", async function () {
      expect(await votingToken.name()).to.equal(TOKEN_NAME);
      expect(await votingToken.symbol()).to.equal(TOKEN_SYMBOL);
      expect(await votingToken.decimals()).to.equal(0);
      expect(await votingToken.pollId()).to.equal(POLL_ID);
      expect(await votingToken.tokenManager()).to.equal(tokenManager.address);
      expect(await votingToken.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("should allow TokenManager to mint tokens", async function () {
      await votingToken.connect(tokenManager).mint(alice.address, 5);

      expect(await votingToken.balanceOf(alice.address)).to.equal(5);
      expect(await votingToken.totalSupply()).to.equal(5);
    });

    it("should emit Transfer event on mint", async function () {
      await expect(votingToken.connect(tokenManager).mint(alice.address, 3))
        .to.emit(votingToken, "Transfer")
        .withArgs(ethers.ZeroAddress, alice.address, 3);
    });

    it("should allow minting to multiple users", async function () {
      await votingToken.connect(tokenManager).mint(alice.address, 2);
      await votingToken.connect(tokenManager).mint(bob.address, 3);
      await votingToken.connect(tokenManager).mint(charlie.address, 1);

      expect(await votingToken.balanceOf(alice.address)).to.equal(2);
      expect(await votingToken.balanceOf(bob.address)).to.equal(3);
      expect(await votingToken.balanceOf(charlie.address)).to.equal(1);
      expect(await votingToken.totalSupply()).to.equal(6);
    });

    it("should revert if non-TokenManager tries to mint", async function () {
      await expect(
        votingToken.connect(alice).mint(bob.address, 5)
      ).to.be.revertedWithCustomError(votingToken, "Unauthorized");
    });

    it("should revert minting to zero address", async function () {
      await expect(
        votingToken.connect(tokenManager).mint(ethers.ZeroAddress, 5)
      ).to.be.revertedWithCustomError(votingToken, "ZeroAddress");
    });

    it("should revert minting zero amount", async function () {
      await expect(
        votingToken.connect(tokenManager).mint(alice.address, 0)
      ).to.be.revertedWithCustomError(votingToken, "ZeroAmount");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      // Mint some tokens first
      await votingToken.connect(tokenManager).mint(alice.address, 10);
      await votingToken.connect(tokenManager).mint(bob.address, 5);
    });

    it("should allow TokenManager to burn tokens", async function () {
      await votingToken.connect(tokenManager).burn(alice.address, 3);

      expect(await votingToken.balanceOf(alice.address)).to.equal(7);
      expect(await votingToken.totalSupply()).to.equal(12); // 10 - 3 + 5
    });

    it("should emit Transfer and VoteTokenBurned events on burn", async function () {
      const tx = votingToken.connect(tokenManager).burn(alice.address, 2);

      await expect(tx)
        .to.emit(votingToken, "Transfer")
        .withArgs(alice.address, ethers.ZeroAddress, 2);

      await expect(tx)
        .to.emit(votingToken, "VoteTokenBurned")
        .withArgs(alice.address, 2);
    });

    it("should revert if non-TokenManager tries to burn", async function () {
      await expect(
        votingToken.connect(alice).burn(bob.address, 2)
      ).to.be.revertedWithCustomError(votingToken, "Unauthorized");
    });

    it("should revert burning more than balance", async function () {
      await expect(
        votingToken.connect(tokenManager).burn(alice.address, 11)
      ).to.be.revertedWithCustomError(votingToken, "InsufficientBalance");
    });
  });

  describe("Approve & Allowance", function () {
    beforeEach(async function () {
      await votingToken.connect(tokenManager).mint(alice.address, 10);
    });

    it("should allow users to approve spenders", async function () {
      await votingToken.connect(alice).approve(bob.address, 5);

      expect(await votingToken.allowance(alice.address, bob.address)).to.equal(5);
    });

    it("should emit Approval event", async function () {
      await expect(votingToken.connect(alice).approve(bob.address, 3))
        .to.emit(votingToken, "Approval")
        .withArgs(alice.address, bob.address, 3);
    });

    it("should allow updating approval amount", async function () {
      await votingToken.connect(alice).approve(bob.address, 5);
      await votingToken.connect(alice).approve(bob.address, 8);

      expect(await votingToken.allowance(alice.address, bob.address)).to.equal(8);
    });
  });

  describe("Transfer (Non-Transferable)", function () {
    beforeEach(async function () {
      await votingToken.connect(tokenManager).mint(alice.address, 10);
    });

    it("should revert any direct transfer", async function () {
      await expect(
        votingToken.connect(alice).transfer(bob.address, 5)
      ).to.be.revertedWithCustomError(votingToken, "NonTransferable");
    });

    it("should prevent token trading", async function () {
      await expect(
        votingToken.connect(alice).transfer(charlie.address, 1)
      ).to.be.revertedWithCustomError(votingToken, "NonTransferable");
    });
  });

  describe("TransferFrom (Burn-Only)", function () {
    beforeEach(async function () {
      await votingToken.connect(tokenManager).mint(alice.address, 10);
      await votingToken.connect(alice).approve(bob.address, 5);
    });

    it("should allow transferFrom to burn (address(0))", async function () {
      await votingToken.connect(bob).transferFrom(alice.address, ethers.ZeroAddress, 3);

      expect(await votingToken.balanceOf(alice.address)).to.equal(7);
      expect(await votingToken.allowance(alice.address, bob.address)).to.equal(2);
      expect(await votingToken.totalSupply()).to.equal(7);
    });

    it("should emit events on transferFrom burn", async function () {
      const tx = votingToken.connect(bob).transferFrom(alice.address, ethers.ZeroAddress, 2);

      await expect(tx)
        .to.emit(votingToken, "Transfer")
        .withArgs(alice.address, ethers.ZeroAddress, 2);

      await expect(tx)
        .to.emit(votingToken, "VoteTokenBurned")
        .withArgs(alice.address, 2);
    });

    it("should revert transferFrom to non-zero address", async function () {
      await expect(
        votingToken.connect(bob).transferFrom(alice.address, charlie.address, 2)
      ).to.be.revertedWithCustomError(votingToken, "OnlyBurningAllowed");
    });

    it("should revert if allowance insufficient", async function () {
      await expect(
        votingToken.connect(bob).transferFrom(alice.address, ethers.ZeroAddress, 6)
      ).to.be.revertedWithCustomError(votingToken, "InsufficientAllowance");
    });

    it("should revert if balance insufficient", async function () {
      await votingToken.connect(alice).approve(bob.address, 20);

      await expect(
        votingToken.connect(bob).transferFrom(alice.address, ethers.ZeroAddress, 11)
      ).to.be.revertedWithCustomError(votingToken, "InsufficientBalance");
    });
  });

  describe("ERC20 Compatibility", function () {
    it("should have correct ERC20 view functions", async function () {
      await votingToken.connect(tokenManager).mint(alice.address, 100);
      await votingToken.connect(alice).approve(bob.address, 50);

      // Standard ERC20 view functions
      expect(await votingToken.name()).to.be.a("string");
      expect(await votingToken.symbol()).to.be.a("string");
      expect(await votingToken.decimals()).to.equal(0);
      expect(await votingToken.totalSupply()).to.equal(100);
      expect(await votingToken.balanceOf(alice.address)).to.equal(100);
      expect(await votingToken.allowance(alice.address, bob.address)).to.equal(50);
    });
  });
});
