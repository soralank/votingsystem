import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("VotingPaymaster - Gasless Voting with EIP-712", function () {
  let votingPaymaster: any;
  let tokenManager: any;
  let votingContract: any;
  let admin: any;
  let voter: any;
  let relayer: any;
  let attacker: any;

  let DOMAIN_SEPARATOR: string;
  let VOTE_TYPEHASH: string;

  beforeEach(async function () {
    [admin, votingContract,voter, relayer, attacker] = await ethers.getSigners();

    // Deploy mock TokenManager
    const TokenManager = await ethers.getContractFactory("TokenManager");
    tokenManager = await TokenManager.deploy(votingContract.address);

    // Deploy VotingPaymaster
    const VotingPaymaster = await ethers.getContractFactory("VotingPaymaster");
    votingPaymaster = await VotingPaymaster.deploy(
      votingContract.address,
      tokenManager.target,
      admin.address
    );

    DOMAIN_SEPARATOR = await votingPaymaster.getDomainSeparator();
    VOTE_TYPEHASH = await votingPaymaster.VOTE_TYPEHASH();
  });

  describe("Deployment", function () {
    it("should set correct addresses", async function () {
      expect(await votingPaymaster.votingContract()).to.equal(votingContract.address);
      expect(await votingPaymaster.tokenManager()).to.equal(tokenManager.target);
      expect(await votingPaymaster.admin()).to.equal(admin.address);
    });

    it("should set correct constants", async function () {
      expect(await votingPaymaster.GAS_LIMIT()).to.equal(200000);
    });

    it("should have valid DOMAIN_SEPARATOR", async function () {
      const domainSeparator = await votingPaymaster.getDomainSeparator();
      expect(domainSeparator).to.match(/^0x[0-9a-f]{64}$/i); // 32 bytes = 64 hex chars
    });

    it("should revert deployment with invalid addresses", async function () {
      const VotingPaymaster = await ethers.getContractFactory("VotingPaymaster");

      await expect(
        VotingPaymaster.deploy(ethers.ZeroAddress, tokenManager.target, admin.address)
      ).to.be.revertedWithCustomError(VotingPaymaster, "ZeroAddress");

      await expect(
        VotingPaymaster.deploy(votingContract.address, ethers.ZeroAddress, admin.address)
      ).to.be.revertedWithCustomError(VotingPaymaster, "ZeroAddress");

      await expect(
        VotingPaymaster.deploy(votingContract.address, tokenManager.target, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(VotingPaymaster, "ZeroAddress");
    });
  });

  describe("Funding", function () {
    it("should accept ETH via fund()", async function () {
      await votingPaymaster.connect(admin).fund({ value: ethers.parseEther("1") });

      expect(await votingPaymaster.getBalance()).to.equal(ethers.parseEther("1"));
      expect(await ethers.provider.getBalance(votingPaymaster.target)).to.equal(
        ethers.parseEther("1")
      );
    });

    it("should emit Funded event", async function () {
      await expect(
        votingPaymaster.connect(admin).fund({ value: ethers.parseEther("0.5") })
      )
        .to.emit(votingPaymaster, "Funded")
        .withArgs(admin.address, ethers.parseEther("0.5"));
    });

    it("should accept ETH via receive()", async function () {
      await admin.sendTransaction({
        to: votingPaymaster.target,
        value: ethers.parseEther("2"),
      });

      expect(await votingPaymaster.getBalance()).to.equal(ethers.parseEther("2"));
    });

    it("should emit Funded event on receive", async function () {
      await expect(
        admin.sendTransaction({
          to: votingPaymaster.target,
          value: ethers.parseEther("0.3"),
        })
      )
        .to.emit(votingPaymaster, "Funded")
        .withArgs(admin.address, ethers.parseEther("0.3"));
    });

    it("should revert fund() with zero ETH", async function () {
      await expect(
        votingPaymaster.connect(admin).fund({ value: 0 })
      ).to.be.revertedWithCustomError(votingPaymaster, "MustSendETH");
    });

    it("should allow anyone to fund", async function () {
      await votingPaymaster.connect(voter).fund({ value: ethers.parseEther("1") });
      await votingPaymaster.connect(relayer).fund({ value: ethers.parseEther("0.5") });

      expect(await votingPaymaster.getBalance()).to.equal(ethers.parseEther("1.5"));
    });
  });

  describe("Withdrawal", function () {
    beforeEach(async function () {
      await votingPaymaster.connect(admin).fund({ value: ethers.parseEther("5") });
    });

    it("should allow admin to withdraw", async function () {
      const balanceBefore = await ethers.provider.getBalance(admin.address);

      const tx = await votingPaymaster.connect(admin).withdraw(ethers.parseEther("2"));
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(admin.address);

      expect(await votingPaymaster.getBalance()).to.equal(ethers.parseEther("3"));
      expect(balanceAfter).to.equal(balanceBefore - gasCost + ethers.parseEther("2"));
    });

    it("should emit Withdrawn event", async function () {
      await expect(
        votingPaymaster.connect(admin).withdraw(ethers.parseEther("1"))
      )
        .to.emit(votingPaymaster, "Withdrawn")
        .withArgs(admin.address, ethers.parseEther("1"));
    });

    it("should revert if non-admin tries to withdraw", async function () {
      await expect(
        votingPaymaster.connect(attacker).withdraw(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(votingPaymaster, "Unauthorized");
    });

    it("should revert if insufficient balance", async function () {
      await expect(
        votingPaymaster.connect(admin).withdraw(ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(votingPaymaster, "InsufficientBalance");
    });
  });

  describe("Relayer Management", function () {
    it("should allow admin to add relayer", async function () {
      await votingPaymaster.connect(admin).addRelayer(relayer.address);

      expect(await votingPaymaster.isTrustedRelayer(relayer.address)).to.be.true;
    });

    it("should emit RelayerAdded event", async function () {
      await expect(
        votingPaymaster.connect(admin).addRelayer(relayer.address)
      )
        .to.emit(votingPaymaster, "RelayerAdded")
        .withArgs(relayer.address);
    });

    it("should allow admin to remove relayer", async function () {
      await votingPaymaster.connect(admin).addRelayer(relayer.address);
      await votingPaymaster.connect(admin).removeRelayer(relayer.address);

      expect(await votingPaymaster.isTrustedRelayer(relayer.address)).to.be.false;
    });

    it("should emit RelayerRemoved event", async function () {
      await votingPaymaster.connect(admin).addRelayer(relayer.address);

      await expect(
        votingPaymaster.connect(admin).removeRelayer(relayer.address)
      )
        .to.emit(votingPaymaster, "RelayerRemoved")
        .withArgs(relayer.address);
    });

    it("should revert if non-admin tries to add relayer", async function () {
      await expect(
        votingPaymaster.connect(attacker).addRelayer(relayer.address)
      ).to.be.revertedWithCustomError(votingPaymaster, "Unauthorized");
    });

    it("should revert adding zero address as relayer", async function () {
      await expect(
        votingPaymaster.connect(admin).addRelayer(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(votingPaymaster, "ZeroAddress");
    });
  });

  describe("EIP-712 Signature Verification", function () {
    const POLL_ID = 1;
    const OPTION_ID = 2;
    let deadline: number;
    let nonce: number;

    beforeEach(async function () {
      const block = await ethers.provider.getBlock("latest");
      deadline = block!.timestamp + 3600; // 1 hour from now
      nonce = 0;
    });

    async function signVote(
      signer: any,
      pollId: number,
      optionId: number,
      voterAddress: string,
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
        voter: voterAddress,
        nonce: nonceVal,
        deadline: deadlineVal,
      };

      const signature = await signer.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      return {
        v: sig.v,
        r: sig.r,
        s: sig.s,
      };
    }

    it("should verify valid signature", async function () {
      const sig = await signVote(voter, POLL_ID, OPTION_ID, voter.address, nonce, deadline);

      const isValid = await votingPaymaster.verifySignature(
        POLL_ID,
        OPTION_ID,
        voter.address,
        deadline,
        sig.v,
        sig.r,
        sig.s
      );

      expect(isValid).to.be.true;
    });

    it("should reject signature from wrong signer", async function () {
      const sig = await signVote(attacker, POLL_ID, OPTION_ID, voter.address, nonce, deadline);

      const isValid = await votingPaymaster.verifySignature(
        POLL_ID,
        OPTION_ID,
        voter.address,
        deadline,
        sig.v,
        sig.r,
        sig.s
      );

      expect(isValid).to.be.false;
    });

    it("should reject expired signature", async function () {
      const expiredDeadline = deadline - 7200; // 2 hours ago
      const sig = await signVote(
        voter,
        POLL_ID,
        OPTION_ID,
        voter.address,
        nonce,
        expiredDeadline
      );

      await expect(
        votingPaymaster.verifySignature(
          POLL_ID,
          OPTION_ID,
          voter.address,
          expiredDeadline,
          sig.v,
          sig.r,
          sig.s
        )
      ).to.be.revertedWithCustomError(votingPaymaster, "SignatureExpired");
    });

    it("should reject signature with wrong nonce", async function () {
      const sig = await signVote(voter, POLL_ID, OPTION_ID, voter.address, 5, deadline);

      const isValid = await votingPaymaster.verifySignature(
        POLL_ID,
        OPTION_ID,
        voter.address,
        deadline,
        sig.v,
        sig.r,
        sig.s
      );

      expect(isValid).to.be.false; // Nonce mismatch
    });

    it("should reject signature with tampered data", async function () {
      const sig = await signVote(voter, POLL_ID, OPTION_ID, voter.address, nonce, deadline);

      // Try to verify with different option ID
      const isValid = await votingPaymaster.verifySignature(
        POLL_ID,
        999, // Different option
        voter.address,
        deadline,
        sig.v,
        sig.r,
        sig.s
      );

      expect(isValid).to.be.false;
    });
  });

  describe("Nonce Management", function () {
    it("should start with nonce 0", async function () {
      expect(await votingPaymaster.getNonce(voter.address)).to.equal(0);
    });

    it("should track nonces per voter", async function () {
      expect(await votingPaymaster.getNonce(voter.address)).to.equal(0);
      expect(await votingPaymaster.getNonce(relayer.address)).to.equal(0);
      expect(await votingPaymaster.getNonce(attacker.address)).to.equal(0);
    });
  });

  describe("Admin Transfer", function () {
    it("should allow admin to transfer admin rights", async function () {
      await votingPaymaster.connect(admin).transferAdmin(relayer.address);

      expect(await votingPaymaster.admin()).to.equal(relayer.address);
    });

    it("should emit AdminTransferred event", async function () {
      await expect(
        votingPaymaster.connect(admin).transferAdmin(relayer.address)
      )
        .to.emit(votingPaymaster, "AdminTransferred")
        .withArgs(admin.address, relayer.address);
    });

    it("should allow new admin to perform admin actions", async function () {
      await votingPaymaster.connect(admin).transferAdmin(relayer.address);

      // New admin can add relayers
      await votingPaymaster.connect(relayer).addRelayer(voter.address);
      expect(await votingPaymaster.isTrustedRelayer(voter.address)).to.be.true;
    });

    it("should prevent old admin from performing admin actions", async function () {
      await votingPaymaster.connect(admin).transferAdmin(relayer.address);

      await expect(
        votingPaymaster.connect(admin).addRelayer(voter.address)
      ).to.be.revertedWithCustomError(votingPaymaster, "Unauthorized");
    });

    it("should revert if non-admin tries to transfer", async function () {
      await expect(
        votingPaymaster.connect(attacker).transferAdmin(attacker.address)
      ).to.be.revertedWithCustomError(votingPaymaster, "Unauthorized");
    });

    it("should revert transfer to zero address", async function () {
      await expect(
        votingPaymaster.connect(admin).transferAdmin(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(votingPaymaster, "ZeroAddress");
    });
  });

  describe("Gas Constants", function () {
    it("should have correct GAS_LIMIT", async function () {
      expect(await votingPaymaster.GAS_LIMIT()).to.equal(200000);
    });
  });
});
