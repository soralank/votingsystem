// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

/**
 * @title IElectionsManager
 * @notice Minimal interface for SecretBallotManager to interact with ElectionsManager
 */
interface IElectionsManager {
    function secretBallot(uint pollId) external view returns (bool);
    function isVoterAuthorized(uint pollId, address voter) external view returns (bool);
    function hasVoterVoted(uint pollId, address voter) external view returns (bool);
    function isPollActive(uint pollId) external view returns (bool);
    function getPollEndTime(uint pollId) external view returns (uint);
    function getPollStartTime(uint pollId) external view returns (uint);
    function getOptionsCount(uint pollId) external view returns (uint);
    function hasVotedWithToken(uint pollId, address voter) external view returns (bool);
    function recordSecretVote(uint pollId, address voter, uint optionId, bool isToken) external;
    function burnTokenForCommit(uint pollId, address voter) external;
    // Poll struct access
    function polls(uint pollId) external view returns (
        string memory title, address admin, uint startTime, uint endTime,
        bool revealed, bool ended, uint totalVotes, uint optionsCount,
        bool exists, bool tokenVotingEnabled, bool tokenVotingRequired
    );
    function hasDelegated(uint pollId, address voter) external view returns (bool);
}

/**
 * @title SecretBallotManager
 * @notice Handles commit-reveal voting for the ElectionsManager system
 * @dev Deployed separately from ElectionsManager to stay under the 24KB contract size limit.
 *      Voters interact with this contract for secret ballot polls:
 *        Phase 1 (Commit): During voting period, submit a hash of your vote
 *        Phase 2 (Reveal): After voting ends, reveal your actual vote + salt
 *
 *      Commitment hash format:
 *        keccak256(abi.encodePacked(pollId, optionId, salt, voterAddress))
 *
 *      Frontend code example:
 *        const salt = ethers.randomBytes(32);
 *        const hash = ethers.solidityPackedKeccak256(
 *          ["uint256", "uint256", "bytes32", "address"],
 *          [pollId, optionId, salt, voterAddress]
 *        );
 *        await secretBallotManager.commitVote(pollId, hash);
 *        // ... after voting period ends (reveal phase) ...
 *        await secretBallotManager.revealVote(pollId, optionId, salt);
 *
 *      SECURITY NOTES:
 *        - optionId is NEVER sent during commit (preserves ballot secrecy)
 *        - Votes are counted ONLY during reveal (prevents double-counting)
 *        - Token is burned at commit to prevent double-commit
 */
contract SecretBallotManager {
    // ── Constants ────────────────────────────────────────────────
    uint public constant TIME_BUFFER = 30; // Must match TimeValidator.TIME_BUFFER
    uint public constant MIN_REVEAL_DURATION = 1 minutes;

    // ── State ────────────────────────────────────────────────────
    IElectionsManager public electionsManager;
    address public owner;
    uint public defaultRevealDuration = 1 hours;
    mapping(uint => uint) public pollRevealDuration; // pollId => custom duration (0 = use default)

    // pollId => voter => keccak256 commitment hash
    mapping(uint => mapping(address => bytes32)) private voteCommitments;
    // pollId => voter => has committed
    mapping(uint => mapping(address => bool)) public hasCommitted;
    // pollId => voter => has revealed individual vote
    mapping(uint => mapping(address => bool)) public hasRevealed;
    // pollId => total commits
    mapping(uint => uint) public commitCount;
    // pollId => total reveals
    mapping(uint => uint) public revealCount;

    // ── Events ───────────────────────────────────────────────────
    event VoteCommitted(uint indexed pollId, address indexed voter);
    event VoteRevealed(uint indexed pollId, address indexed voter, uint indexed optionId);

    // ── Modifiers ────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOwnerOrElectionsManager() {
        require(
            msg.sender == owner || msg.sender == address(electionsManager),
            "Only owner or EM"
        );
        _;
    }

    // ── Constructor ──────────────────────────────────────────────
    constructor(address _electionsManager) {
        require(_electionsManager != address(0), "Invalid address");
        electionsManager = IElectionsManager(_electionsManager);
        owner = msg.sender;
    }

    // ── Ownership Transfer ───────────────────────────────────────

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event DefaultRevealDurationSet(uint256 oldDuration, uint256 newDuration);
    event RevealDurationSet(uint indexed pollId, uint256 duration);

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

    // ── Reveal Duration Configuration ────────────────────────────

    /**
     * @notice Set the default reveal duration for new polls
     * @param duration Duration in seconds (minimum 1 minute)
     */
    function setDefaultRevealDuration(uint duration) external onlyOwnerOrElectionsManager {
        require(duration >= MIN_REVEAL_DURATION, "Reveal duration too short");
        uint oldDuration = defaultRevealDuration;
        defaultRevealDuration = duration;
        emit DefaultRevealDurationSet(oldDuration, duration);
    }

    /**
     * @notice Set reveal duration for a specific poll (before poll starts)
     * @param pollId Poll ID
     * @param duration Duration in seconds (minimum 1 minute, 0 = use default)
     */
    function setRevealDuration(uint pollId, uint duration) external onlyOwnerOrElectionsManager {
        require(duration == 0 || duration >= MIN_REVEAL_DURATION, "Reveal duration too short");
        uint startTime = electionsManager.getPollStartTime(pollId);
        require(block.timestamp < startTime, "Poll already started");
        pollRevealDuration[pollId] = duration;
        emit RevealDurationSet(pollId, duration);
    }

    /**
     * @notice Get the effective reveal duration for a poll
     * @param pollId Poll ID
     * @return The reveal duration in seconds
     */
    function getRevealDuration(uint pollId) public view returns (uint) {
        uint duration = pollRevealDuration[pollId];
        return duration > 0 ? duration : defaultRevealDuration;
    }

    // ── Commit Phase ─────────────────────────────────────────────

    /**
     * @notice Commit a vote hash (secret ballot Phase 1)
     * @dev commitHash = keccak256(abi.encodePacked(pollId, optionId, salt, msg.sender))
     *      Only the hash is stored — the actual vote (optionId) is hidden until reveal.
     *      SECURITY: optionId is NOT passed during commit to preserve ballot secrecy.
     * @param pollId Poll ID
     * @param commitHash The keccak256 commitment hash
     */
    function commitVote(uint pollId, bytes32 commitHash) external {
        _validateCommit(pollId, commitHash);

        (,,,,,,,,,, bool tokenVotingRequired) = electionsManager.polls(pollId);

        if (tokenVotingRequired) {
            revert("Token-required: use commitVoteWithToken().");
        }

        hasCommitted[pollId][msg.sender] = true;
        voteCommitments[pollId][msg.sender] = commitHash;
        commitCount[pollId] += 1;

        // Vote is NOT recorded here — only at reveal (prevents double-counting)

        emit VoteCommitted(pollId, msg.sender);
    }

    /**
     * @notice Commit a vote hash with token burn (secret ballot + token voting)
     * @dev Token is burned at commit time to prevent double-commit.
     *      The actual vote (optionId) is hidden until the reveal phase.
     *      SECURITY: optionId is NOT passed during commit to preserve ballot secrecy.
     * @param pollId Poll ID
     * @param commitHash The keccak256 commitment hash
     */
    function commitVoteWithToken(uint pollId, bytes32 commitHash) external {
        _validateCommit(pollId, commitHash);

        (,,,,,,,,, bool tokenVotingEnabled,) = electionsManager.polls(pollId);
        require(tokenVotingEnabled, "Token voting not enabled.");

        // Burn token at commit time via ElectionsManager callback
        electionsManager.burnTokenForCommit(pollId, msg.sender);

        hasCommitted[pollId][msg.sender] = true;
        voteCommitments[pollId][msg.sender] = commitHash;
        commitCount[pollId] += 1;

        // Vote is NOT recorded here — only at reveal (prevents double-counting)

        emit VoteCommitted(pollId, msg.sender);
    }

    // ── Reveal Phase ─────────────────────────────────────────────

    /**
     * @notice Reveal a committed vote (secret ballot Phase 2)
     * @dev Must provide the same optionId and salt used to create the commitment.
     * @param pollId Poll ID
     * @param optionId The option that was committed
     * @param salt Random bytes32 used when committing
     */
    function revealVote(uint pollId, uint optionId, bytes32 salt) external {
        require(electionsManager.secretBallot(pollId), "Not a secret ballot poll.");
        require(hasCommitted[pollId][msg.sender], "No commitment found.");
        require(!hasRevealed[pollId][msg.sender], "Already revealed.");

        uint endTime = electionsManager.getPollEndTime(pollId);
        require(_isInRevealPeriod(endTime, pollId), "Not in reveal period.");

        uint optionsCount = electionsManager.getOptionsCount(pollId);
        require(optionId > 0 && optionId <= optionsCount, "Invalid option.");

        // Verify commitment: hash must match exactly
        bytes32 expectedHash = keccak256(abi.encodePacked(pollId, optionId, salt, msg.sender));
        require(voteCommitments[pollId][msg.sender] == expectedHash, "Invalid reveal: hash mismatch.");

        // Mark as revealed
        hasRevealed[pollId][msg.sender] = true;
        revealCount[pollId] += 1;

        // Record the vote in ElectionsManager via callback
        bool isToken = electionsManager.hasVotedWithToken(pollId, msg.sender);
        electionsManager.recordSecretVote(pollId, msg.sender, optionId, isToken);

        emit VoteRevealed(pollId, msg.sender, optionId);
    }

    // ── View Functions ───────────────────────────────────────────

    /**
     * @notice Check if poll is in the commit (voting) phase
     * @param pollId Poll ID
     */
    function isInCommitPhase(uint pollId) external view returns (bool) {
        return electionsManager.isPollActive(pollId);
    }

    /**
     * @notice Check if poll is in the reveal phase (secret ballot only)
     * @param pollId Poll ID
     */
    function isInRevealPhase(uint pollId) external view returns (bool) {
        uint endTime = electionsManager.getPollEndTime(pollId);
        return _isInRevealPeriod(endTime, pollId);
    }

    /**
     * @notice Get the reveal period deadline
     * @param pollId Poll ID
     */
    function getRevealDeadline(uint pollId) external view returns (uint) {
        return electionsManager.getPollEndTime(pollId) + TIME_BUFFER + getRevealDuration(pollId);
    }

    /**
     * @notice Get commit/reveal stats for a secret ballot poll
     * @param pollId Poll ID
     * @return commits Total commitments
     * @return reveals Total reveals
     * @return isSecretBallot Whether secret ballot is enabled
     * @return inCommitPhase Currently in commit phase
     * @return inRevealPhase Currently in reveal phase
     */
    function getSecretBallotStatus(uint pollId) external view returns (
        uint commits,
        uint reveals,
        bool isSecretBallot,
        bool inCommitPhase,
        bool inRevealPhase
    ) {
        uint endTime = electionsManager.getPollEndTime(pollId);
        return (
            commitCount[pollId],
            revealCount[pollId],
            electionsManager.secretBallot(pollId),
            electionsManager.isPollActive(pollId),
            _isInRevealPeriod(endTime, pollId)
        );
    }

    // ── Internal Helpers ─────────────────────────────────────────

    /**
     * @dev Validate a commit (shared between commitVote and commitVoteWithToken)
     */
    function _validateCommit(uint pollId, bytes32 commitHash) internal view {
        require(electionsManager.secretBallot(pollId), "Secret ballot not enabled.");
        require(electionsManager.isVoterAuthorized(pollId, msg.sender), "Not authorized.");
        require(electionsManager.isPollActive(pollId), "Not in commit phase.");
        require(!hasCommitted[pollId][msg.sender], "Already committed.");
        require(!electionsManager.hasDelegated(pollId, msg.sender), "Delegated vote.");
        require(commitHash != bytes32(0), "Invalid commit hash.");
    }

    /**
     * @dev Check if current time is within the reveal period
     * @param endTime Poll end time
     * @param pollId Poll ID (for configurable reveal duration)
     * @return True if in [endTime + TIME_BUFFER, endTime + TIME_BUFFER + revealDuration]
     */
    function _isInRevealPeriod(uint endTime, uint pollId) internal view returns (bool) {
        uint revealStart = endTime + TIME_BUFFER;
        uint revealEnd = revealStart + getRevealDuration(pollId);
        return block.timestamp >= revealStart && block.timestamp <= revealEnd;
    }
}
