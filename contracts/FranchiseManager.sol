// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

/**
 * @title IElectionsManager
 * @notice Minimal interface for creating polls on ElectionsManager
 */
interface IElectionsManager {
    function createPoll(
        string calldata title,
        address admin,
        uint startTime,
        uint durationSeconds,
        bool enableTokenVoting,
        bool requireTokenVoting,
        address customTokenManager,
        address customVotingPaymaster
    ) external returns (uint);

    function changePollAdmin(uint pollId, address newAdmin) external;
}

/**
 * @title IVotingPaymasterAdmin
 * @notice Minimal interface to verify paymaster admin for consent checks
 */
interface IVotingPaymasterAdmin {
    function admin() external view returns (address);
}

/**
 * @title FranchiseManager
 * @notice Manages sub-admin franchises for the voting system
 * @dev Franchises are irrevocable time-limited licenses to create elections.
 *
 *      RULES:
 *      - Owner grants franchises with: time limit, max polls (≤100), fee per poll
 *      - Owner can add more polls to an active franchise (up to 100 cap)
 *      - Owner can grant a NEW franchise to the same address (supersedes the old one)
 *        — polls created under the old franchise remain on ElectionsManager
 *      - First election is free; subsequent elections cost the per-poll fee in ETH
 *      - Once granted, a franchise CANNOT be revoked — it ends only when:
 *          (a) the time limit expires, OR (b) all polls are used, OR (c) it is superseded
 *      - No time extensions are ever allowed
 *      - Franchisee can transfer their franchise to another address, but must:
 *          (a) pay the transfer fee in ETH, AND (b) get owner approval
 *      - Franchisees cannot create sub-franchises
 *      - After expiry, no more elections — even if unused polls remain
 *      - Franchisee becomes the poll admin and can manage their polls normally
 */
contract FranchiseManager {
    IElectionsManager public electionsManager;
    address public owner;

    struct Franchise {
        address franchisee;
        uint256 expiresAt;
        uint256 maxPolls;
        uint256 pollsUsed;
        uint256 feePerPoll; // wei — charged from the 2nd poll onward
        address tokenManager;
        address votingPaymaster;
    }

    struct TransferRequest {
        address newFranchisee;
        uint256 feePaid;
        bool pending;
    }

    uint256 public franchiseCount;
    mapping(uint256 => Franchise) public franchises;
    mapping(uint256 => TransferRequest) public transferRequests;
    mapping(address => uint256) public franchiseeToId; // 0 = no active franchise

    // Track poll IDs created by each franchise for admin transfer on ownership change
    mapping(uint256 => uint256[]) public franchisePollIds;

    uint256 public transferFee; // ETH required to request a transfer

    // SECURITY (H-5): Track pending refund amounts to prevent owner draining them
    uint256 public pendingRefunds;

    // ── Events ───────────────────────────────────────────────────
    event FranchiseGranted(
        uint256 indexed franchiseId,
        address indexed franchisee,
        uint256 expiresAt,
        uint256 maxPolls,
        uint256 feePerPoll
    );
    event FranchisePollCreated(
        uint256 indexed franchiseId,
        uint256 indexed pollId,
        uint256 feePaid
    );
    event TransferRequested(
        uint256 indexed franchiseId,
        address indexed from,
        address indexed to,
        uint256 feePaid
    );
    event TransferApproved(
        uint256 indexed franchiseId,
        address indexed oldFranchisee,
        address indexed newFranchisee
    );
    event TransferRejected(uint256 indexed franchiseId);
    event TransferFeeSet(uint256 fee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event PollsAdded(
        uint256 indexed franchiseId,
        uint256 additionalPolls,
        uint256 newMaxPolls
    );
    event FranchiseSuperseded(
        uint256 indexed oldFranchiseId,
        uint256 indexed newFranchiseId,
        address indexed franchisee
    );
    event PollAdminTransferFailed(uint256 indexed pollId);

    // ── Reentrancy Guard ─────────────────────────────────────
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "Reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ── Modifiers ────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────
    constructor(address _electionsManager) {
        require(_electionsManager != address(0), "Invalid address");
        electionsManager = IElectionsManager(_electionsManager);
        owner = msg.sender;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ══════════════════════════════════════════════════════════════
    //  OWNERSHIP TRANSFER
    // ══════════════════════════════════════════════════════════════

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    address public pendingOwner;

    /**
     * @notice Initiate 2-step ownership transfer
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        require(newOwner != owner, "Already owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /**
     * @notice Accept pending ownership transfer
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Only pending owner");
        address prev = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(prev, owner);
    }

    // ══════════════════════════════════════════════════════════════
    //  FRANCHISE GRANTING
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Grant a franchise to a new sub-admin
     * @param franchisee Address receiving the franchise
     * @param durationSeconds How long the franchise lasts (from now)
     * @param maxPolls Maximum elections allowed (1–100)
     * @param feePerPoll ETH fee per election (charged from the 2nd poll onward)
     * @return franchiseId The ID of the newly created franchise
     */
    function grantFranchise(
        address franchisee,
        uint256 durationSeconds,
        uint256 maxPolls,
        uint256 feePerPoll,
        address tokenManager,
        address votingPaymaster
    ) external onlyOwner returns (uint256) {
        require(franchisee != address(0), "Invalid address");
        require(franchisee != owner, "Owner cannot be franchisee");
        require(durationSeconds > 0, "Duration must be > 0");
        require(maxPolls > 0 && maxPolls <= 100, "Polls: 1-100");

        // Security: Verify paymaster admin consents — must be system owner or franchisee
        if (votingPaymaster != address(0)) {
            address paymasterAdmin = IVotingPaymasterAdmin(votingPaymaster).admin();
            require(
                paymasterAdmin == owner || paymasterAdmin == franchisee,
                "Paymaster admin must be owner or franchisee"
            );
        }

        // Allow re-granting: supersedes any existing franchise.
        // Polls created under the old franchise remain on ElectionsManager.
        uint256 existingId = franchiseeToId[franchisee];

        franchiseCount++;
        uint256 fid = franchiseCount;

        // Clear old mapping (old franchise record stays for history)
        if (existingId != 0) {
            franchiseeToId[franchisee] = 0;
            emit FranchiseSuperseded(existingId, fid, franchisee);
        }

        franchises[fid] = Franchise({
            franchisee: franchisee,
            expiresAt: block.timestamp + durationSeconds,
            maxPolls: maxPolls,
            pollsUsed: 0,
            feePerPoll: feePerPoll,
            tokenManager: tokenManager,
            votingPaymaster: votingPaymaster
        });

        franchiseeToId[franchisee] = fid;

        emit FranchiseGranted(
            fid,
            franchisee,
            block.timestamp + durationSeconds,
            maxPolls,
            feePerPoll
        );
        return fid;
    }

    /**
     * @notice Add more polls to an existing active franchise
     * @dev Owner-only. Total maxPolls cannot exceed 100.
     *      Only works on active (not expired / not exhausted) franchises.
     * @param franchiseId ID of the franchise to extend
     * @param additionalPolls Number of extra polls to add
     */
    function addPolls(
        uint256 franchiseId,
        uint256 additionalPolls
    ) external onlyOwner {
        Franchise storage f = franchises[franchiseId];
        require(f.franchisee != address(0), "Franchise does not exist");
        require(block.timestamp < f.expiresAt, "Franchise expired");
        require(additionalPolls > 0, "Must add > 0");
        require(f.maxPolls + additionalPolls <= 100, "Exceeds 100 poll cap");

        f.maxPolls += additionalPolls;
        emit PollsAdded(franchiseId, additionalPolls, f.maxPolls);
    }

    // ══════════════════════════════════════════════════════════════
    //  POLL CREATION BY FRANCHISEE
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Create a poll using a franchise allocation
     * @dev First poll is free. Subsequent polls require msg.value >= feePerPoll.
     *      Excess ETH is refunded. The franchisee becomes the poll admin.
     * @param title Poll title
     * @param startTime Unix timestamp (UTC) when voting opens
     * @param durationSeconds How long the poll stays open
     * @param enableTokenVoting Enable token-based voting?
     * @param requireTokenVoting Require token for voting?
     * @return pollId The ID of the created poll on ElectionsManager
     */
    function createFranchisePoll(
        string calldata title,
        uint256 startTime,
        uint256 durationSeconds,
        bool enableTokenVoting,
        bool requireTokenVoting
    ) external payable nonReentrant returns (uint256) {
        uint256 fid = franchiseeToId[msg.sender];
        require(fid != 0, "No franchise");

        Franchise storage f = franchises[fid];
        require(block.timestamp < f.expiresAt, "Franchise expired");
        require(f.pollsUsed < f.maxPolls, "Max polls reached");

        // First poll free, subsequent ones cost feePerPoll
        uint256 fee = f.pollsUsed == 0 ? 0 : f.feePerPoll;
        require(msg.value >= fee, "Insufficient fee");

        f.pollsUsed++;

        // Create poll — franchisee becomes the poll admin
        uint256 pollId = electionsManager.createPoll(
            title,
            msg.sender,
            startTime,
            durationSeconds,
            enableTokenVoting,
            requireTokenVoting,
            f.tokenManager,
            f.votingPaymaster
        );

        emit FranchisePollCreated(fid, pollId, msg.value);

        // Track poll ID for franchise transfer
        franchisePollIds[fid].push(pollId);

        // Refund excess ETH
        if (msg.value > fee) {
            uint256 excess = msg.value - fee;
            (bool sent, ) = msg.sender.call{value: excess}("");
            require(sent, "Refund failed");
        }

        return pollId;
    }

    // ══════════════════════════════════════════════════════════════
    //  FRANCHISE TRANSFER
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Request transfer of your franchise to another address
     * @dev Requires payment of the transferFee. Owner must approve.
     * @param franchiseId ID of the franchise to transfer
     * @param newFranchisee Address to receive the franchise
     */
    function requestTransfer(
        uint256 franchiseId,
        address newFranchisee
    ) external payable nonReentrant {
        Franchise storage f = franchises[franchiseId];
        require(msg.sender == f.franchisee, "Not franchisee");
        require(block.timestamp < f.expiresAt, "Franchise expired");
        require(f.pollsUsed < f.maxPolls, "Franchise exhausted");
        require(newFranchisee != address(0), "Invalid address");
        require(newFranchisee != msg.sender, "Cannot self-transfer");
        require(newFranchisee != owner, "Owner cannot be franchisee");
        require(
            franchiseeToId[newFranchisee] == 0 ||
                _isFranchiseInactive(franchiseeToId[newFranchisee]),
            "Target has active franchise"
        );
        require(!transferRequests[franchiseId].pending, "Transfer pending");
        require(msg.value >= transferFee, "Insufficient transfer fee");

        transferRequests[franchiseId] = TransferRequest({
            newFranchisee: newFranchisee,
            feePaid: msg.value,
            pending: true
        });

        // Track pending refund amount (H-5 fix)
        pendingRefunds += msg.value;

        emit TransferRequested(
            franchiseId,
            msg.sender,
            newFranchisee,
            msg.value
        );
    }

    /**
     * @notice Approve a pending franchise transfer
     * @param franchiseId ID of the franchise to transfer
     */
    function approveTransfer(uint256 franchiseId) external onlyOwner {
        TransferRequest storage req = transferRequests[franchiseId];
        require(req.pending, "No pending transfer");

        Franchise storage f = franchises[franchiseId];
        address oldFranchisee = f.franchisee;
        address newFranchisee = req.newFranchisee;

        // Release pending refund amount (transfer approved = fee kept)
        pendingRefunds -= req.feePaid;

        // Clear old mapping
        franchiseeToId[oldFranchisee] = 0;

        // If new franchisee had an old inactive franchise, clear that too
        uint256 oldId = franchiseeToId[newFranchisee];
        if (oldId != 0) {
            franchiseeToId[newFranchisee] = 0;
        }

        // Update franchise
        f.franchisee = newFranchisee;
        franchiseeToId[newFranchisee] = franchiseId;

        // Clear request
        delete transferRequests[franchiseId];

        // Transfer admin of all polls created under this franchise
        uint256[] storage pollIds = franchisePollIds[franchiseId];
        for (uint256 i = 0; i < pollIds.length; i++) {
            try electionsManager.changePollAdmin(pollIds[i], newFranchisee) {} catch {
                emit PollAdminTransferFailed(pollIds[i]);
            }
        }

        emit TransferApproved(franchiseId, oldFranchisee, newFranchisee);
    }

    /**
     * @notice Reject a pending franchise transfer and refund the fee
     * @param franchiseId ID of the franchise
     */
    function rejectTransfer(uint256 franchiseId) external onlyOwner nonReentrant {
        TransferRequest storage req = transferRequests[franchiseId];
        require(req.pending, "No pending transfer");

        uint256 refund = req.feePaid;
        address franchisee = franchises[franchiseId].franchisee;

        // Release pending refund tracking before external call
        pendingRefunds -= refund;

        delete transferRequests[franchiseId];

        emit TransferRejected(franchiseId);

        // Refund transfer fee to franchisee
        if (refund > 0) {
            (bool sent, ) = franchisee.call{value: refund}("");
            require(sent, "Refund failed");
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  OWNER ADMIN
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Set the transfer fee (ETH) required when transferring a franchise
     * @param _fee New transfer fee in wei
     */
    function setTransferFee(uint256 _fee) external onlyOwner {
        transferFee = _fee;
        emit TransferFeeSet(_fee);
    }

    /**
     * @notice Withdraw accumulated fees only (poll fees + approved transfer fees)
     * @dev SECURITY (H-5): Excludes pending transfer refunds to prevent stealing deposits
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        uint256 withdrawable = balance - pendingRefunds;
        require(withdrawable > 0, "No fees");
        (bool sent, ) = owner.call{value: withdrawable}("");
        require(sent, "Withdraw failed");
        emit FeesWithdrawn(owner, withdrawable);
    }

    // ══════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Get full franchise details
     * @param franchiseId ID of the franchise
     * @return franchisee Address of the franchisee
     * @return expiresAt Expiry timestamp
     * @return maxPolls Maximum polls allowed
     * @return pollsUsed Polls already created
     * @return feePerPoll Fee per poll in wei
     * @return expired Whether the franchise has expired
     * @return exhausted Whether all polls have been used
     */
    function getFranchise(
        uint256 franchiseId
    )
        external
        view
        returns (
            address franchisee,
            uint256 expiresAt,
            uint256 maxPolls,
            uint256 pollsUsed,
            uint256 feePerPoll,
            bool expired,
            bool exhausted
        )
    {
        Franchise storage f = franchises[franchiseId];
        return (
            f.franchisee,
            f.expiresAt,
            f.maxPolls,
            f.pollsUsed,
            f.feePerPoll,
            block.timestamp >= f.expiresAt,
            f.pollsUsed >= f.maxPolls
        );
    }

    /**
     * @notice Get remaining polls for a franchise
     * @param franchiseId ID of the franchise
     * @return Number of polls remaining (0 if expired or exhausted)
     */
    function remainingPolls(
        uint256 franchiseId
    ) external view returns (uint256) {
        Franchise storage f = franchises[franchiseId];
        if (block.timestamp >= f.expiresAt || f.pollsUsed >= f.maxPolls) {
            return 0;
        }
        return f.maxPolls - f.pollsUsed;
    }

    /**
     * @notice Check if a franchise is currently usable
     * @param franchiseId ID of the franchise
     * @return active True if franchise can still create polls
     */
    function isFranchiseActive(
        uint256 franchiseId
    ) external view returns (bool) {
        return !_isFranchiseInactive(franchiseId);
    }

    /**
     * @notice Get all poll IDs created under a franchise
     * @param franchiseId ID of the franchise
     * @return Array of poll IDs
     */
    function getFranchisePollIds(
        uint256 franchiseId
    ) external view returns (uint256[] memory) {
        return franchisePollIds[franchiseId];
    }

    // ── Internal ─────────────────────────────────────────────────

    function _isFranchiseInactive(
        uint256 franchiseId
    ) internal view returns (bool) {
        Franchise storage f = franchises[franchiseId];
        return
            f.franchisee == address(0) ||
            block.timestamp >= f.expiresAt ||
            f.pollsUsed >= f.maxPolls;
    }

    // ── Prevent accidental ETH sends ─────────────────────────────

    receive() external payable {
        revert("Use createFranchisePoll or requestTransfer");
    }

    fallback() external payable {
        revert("Unknown function");
    }
}
