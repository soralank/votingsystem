// SPDX-License-Identifier: ANKIT.SORAL
pragma solidity ^0.8.20;

import "./TimeValidator.sol";

/**
 * @title ElectionsManager
 * @notice Decentralized voting system with scheduled polls
 * @dev TIMEZONE & TIME CALCULATION:
 *      ALL timestamps are Unix timestamps in UTC (seconds since epoch)
 *      - startTime: Unix timestamp when voting begins (UTC)
 *      - endTime: Automatically calculated as startTime + durationSeconds (UTC)
 *      - Current time: block.timestamp (always UTC, set by miners)
 *      
 *      FRONTEND INTEGRATION:
 *      To create a poll starting at specific local time:
 *        1. Convert local time to UTC Unix timestamp
 *        2. Pass as startTime parameter
 *        3. Example (JavaScript):
 *           const localTime = new Date('2026-03-01T15:00:00'); // Your local time
 *           const utcTimestamp = Math.floor(localTime.getTime() / 1000);
 *           await contract.createPoll(title, admin, utcTimestamp, durationInSeconds);
 *      
 *      To display times to users:
 *        const date = new Date(startTime * 1000);
 *        const localString = date.toLocaleString(); // Converts UTC to user's timezone
 */
contract ElectionsManager is TimeValidator {
    address public owner;
    address public pendingOwner;
    uint public pollsCount;

    // Security limits to prevent DoS attacks
    uint public constant MAX_OPTIONS = 100;
    uint public constant MAX_VOTERS_BATCH = 50;

    // NEW: prevent duplicate poll titles
    mapping(string => bool) public pollTitles;

    // NEW: prevent duplicate option names within a poll
    mapping(uint => mapping(string => bool)) public pollOptionNames;

    struct Option {
        uint id;
        string name;
        uint votes;
    }

    struct Poll {
        string title;
        address admin;
        uint startTime;
        uint endTime;
        bool revealed;
        bool ended;
        uint totalVotes;
        uint optionsCount;
        bool exists;
    }

    // pollId => Poll
    mapping(uint => Poll) public polls;
    // pollId => optionId => Option (private to hide vote counts until reveal)
    mapping(uint => mapping(uint => Option)) private options;
    // pollId => voter => choice (private to protect vote privacy)
    mapping(uint => mapping(address => uint)) private voterChoice;
    // pollId => voter => has voted
    mapping(uint => mapping(address => bool)) public hasVoted;
    // pollId => voter => is authorized to vote
    mapping(uint => mapping(address => bool)) public authorizedVoters;

    event PollCreated(uint indexed pollId, string title, address admin, uint startTime, uint endTime);
    event OptionAdded(uint indexed pollId, uint indexed optionId, string name);
    event Voted(uint indexed pollId, address voter, uint optionId);
    event Revealed(uint indexed pollId);
    event Ended(uint indexed pollId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event VoterAdded(uint indexed pollId, address voter);
    event VoterRemoved(uint indexed pollId, address voter);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action.");
        _;
    }

    modifier onlyAdminOrOwner(uint pollId) {
        require(msg.sender == polls[pollId].admin || msg.sender == owner, "Only poll admin or owner allowed.");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "new owner is zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Only pending owner can accept.");
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    function cancelOwnershipTransfer() external onlyOwner {
        require(pendingOwner != address(0), "No pending transfer.");
        pendingOwner = address(0);
    }

    function renounceOwnership() external onlyOwner {
        address previous = owner;
        owner = address(0);
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, address(0));
    }

    function createPoll(string calldata title, address admin, uint startTime, uint durationSeconds) external onlyOwner returns (uint) {
        require(admin != address(0), "admin zero");
        // NEW: check for duplicate title
        require(!pollTitles[title], "Poll title already exists.");
        
        // Validate time range using TimeValidator
        _validateTimeRange(startTime, durationSeconds);
        
        pollsCount += 1;
        uint pid = pollsCount;
        Poll storage p = polls[pid];
        p.title = title;
        p.admin = admin;
        p.startTime = startTime;
        p.endTime = startTime + durationSeconds;
        p.revealed = false;
        p.ended = false;
        p.totalVotes = 0;
        p.optionsCount = 0;
        p.exists = true;
        // NEW: mark title as used
        pollTitles[title] = true;

        emit PollCreated(pid, title, admin, startTime, p.endTime);
        return pid;
    }

    function addOptionToPoll(uint pollId, string calldata name) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!polls[pollId].ended, "Poll ended; cannot add options.");
        require(msg.sender == polls[pollId].admin || msg.sender == owner, "Only poll admin or owner allowed.");
        require(!_hasStarted(polls[pollId].startTime), "Poll already started; cannot add options.");
        // NEW: check for duplicate option name in this poll
        require(!pollOptionNames[pollId][name], "Option name already exists in this poll.");

        Poll storage p = polls[pollId];
        require(p.optionsCount < MAX_OPTIONS, "Maximum options limit reached.");
        p.optionsCount += 1;
        uint oid = p.optionsCount;
        options[pollId][oid] = Option({ id: oid, name: name, votes: 0 });
        // NEW: mark option name as used in this poll
        pollOptionNames[pollId][name] = true;

        emit OptionAdded(pollId, oid, name);
    }

    function addVoter(uint pollId, address voter) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!polls[pollId].ended, "Poll ended; cannot add voters.");
        require(!_hasStarted(polls[pollId].startTime), "Poll already started; cannot add voters.");
        require(voter != address(0), "Invalid voter address.");
        require(!authorizedVoters[pollId][voter], "Voter already authorized.");

        authorizedVoters[pollId][voter] = true;
        emit VoterAdded(pollId, voter);
    }

    function addVoters(uint pollId, address[] calldata voters) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!polls[pollId].ended, "Poll ended; cannot add voters.");
        require(!_hasStarted(polls[pollId].startTime), "Poll already started; cannot add voters.");
        require(voters.length <= MAX_VOTERS_BATCH, "Batch size exceeds maximum limit.");

        for(uint i = 0; i < voters.length; i++) {
            address voter = voters[i];
            require(voter != address(0), "Invalid voter address.");
            if (!authorizedVoters[pollId][voter]) {
                authorizedVoters[pollId][voter] = true;
                emit VoterAdded(pollId, voter);
            }
        }
    }

    function removeVoter(uint pollId, address voter) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!polls[pollId].ended, "Poll ended; cannot remove voters.");
        require(!_hasStarted(polls[pollId].startTime), "Poll already started; cannot remove voters.");
        require(authorizedVoters[pollId][voter], "Voter not authorized.");
        require(!hasVoted[pollId][voter], "Cannot remove voter who already voted.");

        authorizedVoters[pollId][voter] = false;
        emit VoterRemoved(pollId, voter);
    }

    function getPollsCount() external view returns (uint) {
        return pollsCount;
    }

    function getOptionsCount(uint pollId) external view returns (uint) {
        return polls[pollId].optionsCount;
    }

    function getOption(uint pollId, uint optionId) external view returns (uint, string memory, uint) {
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        Option storage o = options[pollId][optionId];
        
        // Only show vote counts after reveal or to admin/owner
        if (!p.revealed && msg.sender != p.admin && msg.sender != owner) {
            return (o.id, o.name, 0);
        }
        return (o.id, o.name, o.votes);
    }

    function voteInPoll(uint pollId, uint optionId) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(authorizedVoters[pollId][msg.sender], "Not authorized to vote in this poll.");
        Poll storage p = polls[pollId];
        require(_isWithinVotingPeriod(p.startTime, p.endTime), "Poll not active for voting.");
        require(!p.ended, "Poll ended; cannot vote.");
        require(optionId > 0 && optionId <= p.optionsCount, "Invalid option.");
        require(!hasVoted[pollId][msg.sender], "You have already voted.");

        hasVoted[pollId][msg.sender] = true;
        voterChoice[pollId][msg.sender] = optionId;
        options[pollId][optionId].votes += 1;
        p.totalVotes += 1;

        emit Voted(pollId, msg.sender, optionId);
    }

    function getTotalVotes(uint pollId) external view returns (uint) {
        return polls[pollId].totalVotes;
    }

    function getVoterChoice(uint pollId, address voter) external view returns (uint) {
        Poll storage p = polls[pollId];
        if (!p.revealed) {
            if (msg.sender != p.admin && msg.sender != owner) {
                revert("Results not revealed.");
            }
        }
        return voterChoice[pollId][voter];
    }

    function getPollEndTime(uint pollId) external view returns (uint) {
        return polls[pollId].endTime;
    }

    function getPollStartTime(uint pollId) external view returns (uint) {
        return polls[pollId].startTime;
    }

    function hasVoterVoted(uint pollId, address voter) external view returns (bool) {
        return hasVoted[pollId][voter];
    }

    function isVoterAuthorized(uint pollId, address voter) external view returns (bool) {
        return authorizedVoters[pollId][voter];
    }

    function isPollActive(uint pollId) external view returns (bool) {
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        return !p.ended && _isWithinVotingPeriod(p.startTime, p.endTime);
    }

    function isPollStarted(uint pollId) external view returns (bool) {
        require(polls[pollId].exists, "Poll does not exist.");
        return block.timestamp >= polls[pollId].startTime;
    }

    function isPollEnded(uint pollId) external view returns (bool) {
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        return p.ended || _hasEnded(p.endTime);
    }

    function getPollStatus(uint pollId) external view returns (bool started, bool active, bool ended, bool revealed) {
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        
        started = block.timestamp >= p.startTime;
        active = !p.ended && _isWithinVotingPeriod(p.startTime, p.endTime);
        ended = p.ended || _hasEnded(p.endTime);
        revealed = p.revealed;
    }

    function getWinner(uint pollId) external view returns (uint winningOptionId, string memory winningOptionName, uint winningVotes) {
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        require(p.revealed || msg.sender == p.admin || msg.sender == owner, "Results not revealed.");

        uint maxVotes = 0;
        uint winnerId = 0;

        for(uint i = 1; i <= p.optionsCount; i++) {
            if(options[pollId][i].votes > maxVotes) {
                maxVotes = options[pollId][i].votes;
                winnerId = i;
            }
        }

        if(winnerId > 0) {
            return (winnerId, options[pollId][winnerId].name, maxVotes);
        }

        return (0, "", 0);
    }

    function revealResults(uint pollId) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(msg.sender == polls[pollId].admin || msg.sender == owner, "Only poll admin or owner allowed.");
        require(_hasEnded(polls[pollId].endTime), "Cannot reveal before poll end plus buffer.");
        polls[pollId].revealed = true;
        emit Revealed(pollId);
    }

    function endPoll(uint pollId) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(msg.sender == polls[pollId].admin || msg.sender == owner, "Only poll admin or owner allowed.");
        require(_hasEnded(polls[pollId].endTime), "Cannot end before end time plus buffer.");
        polls[pollId].ended = true;
        emit Ended(pollId);
    }

    // clear revert reasons for unsupported interactions (helps debugging / tooling)
    receive() external payable {
        revert("Contract does not accept plain ether.");
    }

    fallback() external payable {
        revert("Unknown function called.");
    }
}
