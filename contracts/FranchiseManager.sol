// SPDX-License-Identifier: ANKIT.SORAL
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
        bool requireTokenVoting
    ) external returns (uint);
}

/**
 * @title FranchiseManager
 * @notice Manages sub-admin franchises for the voting system
 * @dev Franchises are irrevocable time-limited licenses to create elections.
 *
 *      RULES:
 *      - Owner grants franchises with: time limit, max polls (≤100), fee per poll
 *      - First election is free; subsequent elections cost the per-poll fee in ETH
 *      - Once granted, a franchise CANNOT be revoked — it ends only when:
 *          (a) the time limit expires, OR (b) all polls are used
 *      - No time extensions or poll count increases are ever allowed
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

    uint256 public transferFee; // ETH required to request a transfer

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
        uint256 feePerPoll
    ) external onlyOwner returns (uint256) {
        require(franchisee != address(0), "Invalid address");
        require(franchisee != owner, "Owner cannot be franchisee");
        require(durationSeconds > 0, "Duration must be > 0");
        require(maxPolls > 0 && maxPolls <= 100, "Polls: 1-100");

        // Allow re-granting only if previous franchise is expired or exhausted
        uint256 existingId = franchiseeToId[franchisee];
        if (existingId != 0) {
            Franchise storage existing = franchises[existingId];
            require(
                block.timestamp >= existing.expiresAt ||
                    existing.pollsUsed >= existing.maxPolls,
                "Active franchise exists"
            );
            // Clear old mapping
            franchiseeToId[franchisee] = 0;
        }

        franchiseCount++;
        uint256 fid = franchiseCount;

        franchises[fid] = Franchise({
            franchisee: franchisee,
            expiresAt: block.timestamp + durationSeconds,
            maxPolls: maxPolls,
            pollsUsed: 0,
            feePerPoll: feePerPoll
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
    ) external payable returns (uint256) {
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
            requireTokenVoting
        );

        emit FranchisePollCreated(fid, pollId, msg.value);

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
    ) external payable {
        Franchise storage f = franchises[franchiseId];
        require(msg.sender == f.franchisee, "Not franchisee");
        require(block.timestamp < f.expiresAt, "Franchise expired");
        require(f.pollsUsed < f.maxPolls, "Franchise exhausted");
        require(newFranchisee != address(0), "Invalid address");
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

        emit TransferApproved(franchiseId, oldFranchisee, newFranchisee);
    }

    /**
     * @notice Reject a pending franchise transfer and refund the fee
     * @param franchiseId ID of the franchise
     */
    function rejectTransfer(uint256 franchiseId) external onlyOwner {
        TransferRequest storage req = transferRequests[franchiseId];
        require(req.pending, "No pending transfer");

        uint256 refund = req.feePaid;
        address franchisee = franchises[franchiseId].franchisee;

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
     * @notice Withdraw all accumulated fees (poll fees + transfer fees)
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees");
        (bool sent, ) = owner.call{value: balance}("");
        require(sent, "Withdraw failed");
        emit FeesWithdrawn(owner, balance);
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
}
