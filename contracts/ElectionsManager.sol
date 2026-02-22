// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

import "./TokenIntegratedVoting.sol";
import "./modules/MultiChoiceVoting.sol";
import "./modules/QuadraticVoting.sol";
import "./modules/DelegationVoting.sol";
import "./modules/MetadataVoting.sol";
import "./VotingErrors.sol";

/**
 * @title ISecretBallotManager
 * @notice Interface for ElectionsManager to interact with SecretBallotManager
 */
interface ISecretBallotManager {
    function getRevealDuration(uint pollId) external view returns (uint);
    function setRevealDuration(uint pollId, uint duration) external;
    function setDefaultRevealDuration(uint duration) external;
}

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
contract ElectionsManager is TokenIntegratedVoting {
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
        // Token voting fields
        bool tokenVotingEnabled;
        bool tokenVotingRequired;
    }

    // Vote method tracking
    enum VoteMethod { GasPayment, Token }
    mapping(uint256 => mapping(address => VoteMethod)) public voteMethod;

    // pollId => Poll
    mapping(uint => Poll) public polls;
    // pollId => TokenManager
    mapping(uint => address) public pollTokenManager;
    // pollId => VotingPaymaster
    mapping(uint => address) public pollVotingPaymaster;
    // pollId => optionId => Option (private storage — NOTE: Solidity `private` only prevents
    // other contracts from reading. The raw data is still readable via eth_getStorageAt.
    // True on-chain privacy requires encryption or off-chain solutions.)
    mapping(uint => mapping(uint => Option)) private options;
    // pollId => voter => choice (private storage — same caveat as above)
    mapping(uint => mapping(address => uint)) private voterChoice;
    // pollId => voter => has voted
    mapping(uint => mapping(address => bool)) public hasVoted;
    // pollId => voter => is authorized to vote
    mapping(uint => mapping(address => bool)) public authorizedVoters;

    event PollCreated(uint indexed pollId, string title, address indexed admin, uint startTime, uint endTime, bool tokenVotingEnabled, bool tokenVotingRequired);
    event OptionAdded(uint indexed pollId, uint indexed optionId, string name);
    event Voted(uint indexed pollId, address indexed voter, uint indexed optionId, VoteMethod method);
    event ResultsRevealed(uint indexed pollId);
    event VoterAuthorized(uint indexed pollId, address indexed voter);
    event VoterUnauthorized(uint indexed pollId, address indexed voter);
    event VotedMultiChoice(uint indexed pollId, address indexed voter, uint[] optionIds, VoteMethod method);
    event PollMetadataSet(uint indexed pollId, string metadataURI);

    // Composition: advanced feature modules
    MultiChoiceVoting public multiChoiceVoting;
    QuadraticVoting public quadraticVoting;
    DelegationVoting public delegationVoting;
    MetadataVoting public metadataVoting;

    // ══════════════════════════════════════════════════════════════
    //  SECRET BALLOT + TRUST FEATURES
    // ══════════════════════════════════════════════════════════════

    // pollId => secret ballot enabled
    mapping(uint => bool) public secretBallot;

    // SecretBallotManager contract (handles commit-reveal off-contract)
    address public secretBallotMgr;

    // FranchiseManager contract (handles sub-admin franchises)
    address public franchiseMgr;

    // Track polls created via FranchiseManager
    mapping(uint => bool) internal isFranchisePoll;

    // pollId => delegation enabled (opt-in per poll)
    mapping(uint => bool) public delegationEnabled;

    event SecretBallotEnabled(uint indexed pollId);
    event SecretBallotManagerSet(address indexed manager);
    event FranchiseManagerSet(address indexed manager);
    event PollAdminChanged(uint indexed pollId, address indexed oldAdmin, address indexed newAdmin);
    event DelegationEnabled(uint indexed pollId);

    modifier onlyAdminOrOwner(uint pollId) {
        if (!(msg.sender == polls[pollId].admin || msg.sender == owner)) revert Unauthorized();
        _;
    }

    constructor() TokenIntegratedVoting() {
        // Owner is initialized in parent constructor
        multiChoiceVoting = new MultiChoiceVoting();
        quadraticVoting = new QuadraticVoting();
        delegationVoting = new DelegationVoting();
        metadataVoting = new MetadataVoting();
    }

    function createPoll(
        string calldata title,
        address admin,
        uint startTime,
        uint durationSeconds,
        bool enableTokenVoting,
        bool requireTokenVoting,
        address customTokenManager,
        address customVotingPaymaster
    ) external returns (uint) {
        if (!(msg.sender == owner || msg.sender == franchiseMgr)) revert Unauthorized();
        if (!(admin != address(0))) revert ZeroAddress();
        // NEW: check for duplicate title
        if (pollTitles[title]) revert DuplicateTitle();

        // Validate time range using TimeValidator
        _validateTimeRange(startTime, durationSeconds);

        // Lock infrastructure after first poll is created
        _lockInfrastructure();

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
        // Token voting configuration
        p.tokenVotingEnabled = enableTokenVoting;
        p.tokenVotingRequired = requireTokenVoting;
        // NEW: mark title as used
        pollTitles[title] = true;

        // Set per-poll managers
        if (customTokenManager != address(0)) {
            pollTokenManager[pid] = customTokenManager;
        } else {
            pollTokenManager[pid] = address(tokenManager);
        }
        if (customVotingPaymaster != address(0)) {
            // Security: Verify paymaster admin consents
            address pmAdmin = VotingPaymaster(payable(customVotingPaymaster)).admin();
            if (!(pmAdmin == owner || pmAdmin == admin)) revert BadPaymaster();
            pollVotingPaymaster[pid] = customVotingPaymaster;
        } else {
            pollVotingPaymaster[pid] = address(votingPaymaster);
        }

        // Create token for poll if enabled and TokenManager is set
        if (enableTokenVoting && pollTokenManager[pid] != address(0)) {
            string memory tokenName = string(abi.encodePacked("Vote-", title));
            string memory tokenSymbol = string(abi.encodePacked("VOTE", _uint2str(pid)));
            TokenManager(pollTokenManager[pid]).createPollToken(pid, tokenName, tokenSymbol);
        }

        emit PollCreated(pid, title, admin, startTime, p.endTime, enableTokenVoting, requireTokenVoting);

        // Track if this poll was created via franchise manager
        if (msg.sender == franchiseMgr) {
            isFranchisePoll[pid] = true;
        }

        return pid;
    }

    // Helper function to convert uint to string
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    function addOptionToPoll(uint pollId, string calldata name) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasEnded(polls[pollId].endTime)) revert PollEnded();
        if (!(msg.sender == polls[pollId].admin || msg.sender == owner)) revert Unauthorized();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();
        // NEW: check for duplicate option name in this poll
        if (pollOptionNames[pollId][name]) revert DuplicateName();

        Poll storage p = polls[pollId];
        if (!(p.optionsCount < MAX_OPTIONS)) revert MaxOptionsReached();
        p.optionsCount += 1;
        uint oid = p.optionsCount;
        options[pollId][oid] = Option({ id: oid, name: name, votes: 0 });
        // NEW: mark option name as used in this poll
        pollOptionNames[pollId][name] = true;

        emit OptionAdded(pollId, oid, name);
    }

    function addVoter(uint pollId, address voter) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasEnded(polls[pollId].endTime)) revert PollEnded();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();
        if (!(voter != address(0))) revert ZeroAddress();
        if (authorizedVoters[pollId][voter]) revert DuplicateVoter();

        authorizedVoters[pollId][voter] = true;
        emit VoterAuthorized(pollId, voter);
    }

    function addVoters(uint pollId, address[] calldata voters) public onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasEnded(polls[pollId].endTime)) revert PollEnded();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();
        if (!(voters.length <= MAX_VOTERS_BATCH)) revert BatchLimitExceeded();

        for(uint i = 0; i < voters.length; i++) {
            address voter = voters[i];
            if (!(voter != address(0))) revert ZeroAddress();
            if (!authorizedVoters[pollId][voter]) {
                authorizedVoters[pollId][voter] = true;
                emit VoterAuthorized(pollId, voter);
            }
        }
    }

    function removeVoter(uint pollId, address voter) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasEnded(polls[pollId].endTime)) revert PollEnded();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();
        if (!(authorizedVoters[pollId][voter])) revert Unauthorized();
        if (hasVoted[pollId][voter]) revert AlreadyVoted();

        authorizedVoters[pollId][voter] = false;
        emit VoterUnauthorized(pollId, voter);
    }

    function getPollsCount() external view returns (uint) {
        return pollsCount;
    }

    function getOptionsCount(uint pollId) external view returns (uint) {
        return polls[pollId].optionsCount;
    }

    function getOption(uint pollId, uint optionId) external view returns (uint, string memory, uint) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        Poll storage p = polls[pollId];
        Option storage o = options[pollId][optionId];
        
        // Vote counts are hidden until results are revealed (no admin bypass)
        if (!p.revealed) {
            return (o.id, o.name, 0);
        }
        return (o.id, o.name, o.votes);
    }

    function voteInPoll(uint pollId, uint optionId) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (secretBallot[pollId]) revert SecretPoll();
        if (!(authorizedVoters[pollId][msg.sender])) revert NotVoter();
        Poll storage p = polls[pollId];
        if (!(_isWithinVotingPeriod(p.startTime, p.endTime))) revert PollNotActive();
        if (!(optionId > 0 && optionId <= p.optionsCount)) revert InvalidOption();
        if (hasVoted[pollId][msg.sender]) revert AlreadyVoted();
        if (delegationVoting.hasDelegated(pollId, msg.sender)) revert VoteIsDelegated();

        // Check if token voting is required
        if (p.tokenVotingRequired) {
            revert TokenVotingRequired();
        }

        hasVoted[pollId][msg.sender] = true;
        voterChoice[pollId][msg.sender] = optionId;
        options[pollId][optionId].votes +=1;
        p.totalVotes += 1;

        // Track vote method
        voteMethod[pollId][msg.sender] = VoteMethod.GasPayment;

        emit Voted(pollId, msg.sender, optionId, VoteMethod.GasPayment);
    }

    /**
     * @notice Vote with token (can be called by voter directly or by paymaster)
     * @param pollId Poll ID
     * @param optionId Option to vote for
     * @param voter Voter address
     */
    function voteInPollWithToken(
        uint256 pollId,
        uint256 optionId,
        address voter
    ) public override nonReentrant {
        // Can be called by voter directly OR by paymaster
        if (!(msg.sender == voter || msg.sender == pollVotingPaymaster[pollId])) revert Unauthorized();

        if (!(polls[pollId].exists)) revert PollNotFound();
        if (secretBallot[pollId]) revert SecretPoll();
        if (!(authorizedVoters[pollId][voter])) revert NotVoter();
        Poll storage p = polls[pollId];
        if (!(_isWithinVotingPeriod(p.startTime, p.endTime))) revert PollNotActive();
        if (!(optionId > 0 && optionId <= p.optionsCount)) revert InvalidOption();
        if (hasVoted[pollId][voter]) revert AlreadyVoted();
        if (delegationVoting.hasDelegated(pollId, voter)) revert VoteIsDelegated();
        if (!(p.tokenVotingEnabled)) revert TokenVotingNotEnabled();

        // Use per-poll TokenManager for token operations
        if (!(pollTokenManager[pollId] != address(0))) revert NoTokenManager();
        uint voterBalance = TokenManager(pollTokenManager[pollId]).getTokenBalance(pollId, voter);
        if (!(voterBalance >= 1)) revert InsufficientTokens();

        // CEI: Update all state BEFORE external call
        hasVotedWithToken[pollId][voter] = true;
        hasVoted[pollId][voter] = true;
        voterChoice[pollId][voter] = optionId;
        options[pollId][optionId].votes += 1;
        p.totalVotes += 1;
        voteMethod[pollId][voter] = VoteMethod.Token;

        // External call: burn tokens
        TokenManager(pollTokenManager[pollId]).burnTokens(pollId, voter, 1);

        emit VotedWithToken(pollId, voter, optionId);
        emit Voted(pollId, voter, optionId, VoteMethod.Token);
    }

    /**
     * @notice Add voters and allocate tokens in one transaction
     * @param pollId Poll ID
     * @param voters Array of voter addresses
     * @param tokensPerVoter Tokens to allocate per voter
     */
    function addVotersWithTokens(
        uint pollId,
        address[] calldata voters,
        uint256 tokensPerVoter
    ) external onlyAdminOrOwner(pollId) {
        if (!(tokensPerVoter > 0)) revert ZeroAmount();

        // First add voters (using existing logic)
        addVoters(pollId, voters);

        // Then allocate tokens if enabled
            Poll storage p = polls[pollId];
            if (p.tokenVotingEnabled && pollTokenManager[pollId] != address(0)) {
                uint256[] memory amounts = new uint256[](voters.length);
                for (uint256 i = 0; i < voters.length; i++) {
                    amounts[i] = tokensPerVoter;
                }
                TokenManager(pollTokenManager[pollId]).batchAllocateTokens(pollId, voters, amounts);
            }
    }

    function getTotalVotes(uint pollId) external view returns (uint) {
        return polls[pollId].totalVotes;
    }

    function getVoterChoice(uint pollId, address voter) external view returns (uint) {
        Poll storage p = polls[pollId];
        // No admin bypass — voter choice hidden until reveal
        if (!(p.revealed)) revert PollNotRevealed();
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
        if (!(polls[pollId].exists)) revert PollNotFound();
        Poll storage p = polls[pollId];
        return !_hasEnded(p.endTime) && _isWithinVotingPeriod(p.startTime, p.endTime);
    }

    function isPollStarted(uint pollId) external view returns (bool) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        return block.timestamp >= polls[pollId].startTime;
    }

    function isPollEnded(uint pollId) external view returns (bool) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        Poll storage p = polls[pollId];
        return _hasEnded(p.endTime);
    }

    function getPollStatus(uint pollId) external view returns (bool started, bool active, bool ended, bool revealed) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        Poll storage p = polls[pollId];
        
        started = block.timestamp >= p.startTime;
        active = !_hasEnded(p.endTime) && _isWithinVotingPeriod(p.startTime, p.endTime);
        ended = _hasEnded(p.endTime);
        revealed = p.revealed;
    }

    function getWinner(uint pollId) external view returns (uint winningOptionId, string memory winningOptionName, uint winningVotes) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        Poll storage p = polls[pollId];
        // No admin bypass — winner hidden until reveal
        if (!(p.revealed)) revert PollNotRevealed();

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
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (polls[pollId].revealed) revert PollAlreadyRevealed();

        uint endTime = polls[pollId].endTime;

        if (secretBallot[pollId]) {
            // Secret ballot: must wait for reveal period to finish
            // Read configurable reveal duration from SecretBallotManager
            uint revealDuration = ISecretBallotManager(secretBallotMgr).getRevealDuration(pollId);
            if (!(block.timestamp >= endTime + TIME_BUFFER + revealDuration)) revert RevealPeriodActive();
        } else {
            // Standard poll: anyone can reveal after time-based end
            if (!(_hasEnded(endTime))) revert PollNotEnded();
        }

        polls[pollId].revealed = true;
        emit ResultsRevealed(pollId);
    }

    // endPoll removed: polls end automatically when time expires (time-based only)

    // ══════════════════════════════════════════════════════════════
    //  MULTI-CHOICE VOTING
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Configure multi-choice voting for a poll (must be before start)
     * @param pollId Poll ID
     * @param maxChoices Maximum number of options a voter can select (2+)
     */
    function setMaxChoices(uint pollId, uint maxChoices) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();
        multiChoiceVoting.configureMultiChoice(pollId, maxChoices, polls[pollId].optionsCount);
    }

    /**
     * @notice Vote for multiple options in a poll
     * @param pollId Poll ID
     * @param optionIds Array of option IDs to vote for
     */
    function voteMultiChoice(uint pollId, uint[] calldata optionIds) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (secretBallot[pollId]) revert SecretPoll();
        if (!(authorizedVoters[pollId][msg.sender])) revert NotVoter();
        Poll storage p = polls[pollId];
        if (!(_isWithinVotingPeriod(p.startTime, p.endTime))) revert PollNotActive();
        if (hasVoted[pollId][msg.sender]) revert AlreadyVoted();
        if (delegationVoting.hasDelegated(pollId, msg.sender)) revert VoteIsDelegated();

        if (p.tokenVotingRequired) {
            revert TokenVotingRequired();
        }

        // CEI: Update core state BEFORE external module call
        hasVoted[pollId][msg.sender] = true;
        voterChoice[pollId][msg.sender] = optionIds[0]; // backward compat
        voteMethod[pollId][msg.sender] = VoteMethod.GasPayment;

        for (uint i = 0; i < optionIds.length; i++) {
            if (!(optionIds[i] > 0 && optionIds[i] <= p.optionsCount)) revert InvalidOption();
            options[pollId][optionIds[i]].votes += 1;
            p.totalVotes += 1;
        }

        // External call: validate and record in module
        multiChoiceVoting.recordMultiChoiceVote(pollId, msg.sender, optionIds, p.optionsCount);

        emit VotedMultiChoice(pollId, msg.sender, optionIds, VoteMethod.GasPayment);
    }

    /**
     * @notice Get voter's multi-choice selections
     * @param pollId Poll ID
     * @param voter Voter address
     * @return optionIds Array of chosen option IDs
     */
    function getVoterMultiChoices(uint pollId, address voter) external view returns (uint[] memory) {
        Poll storage p = polls[pollId];
        if (!(p.exists)) revert PollNotFound();
        if (!(p.revealed)) revert PollNotRevealed();
        return multiChoiceVoting.getVoterMultiChoices(pollId, voter);
    }

    // ══════════════════════════════════════════════════════════════
    //  QUADRATIC VOTING
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Enable quadratic voting for a poll (must be token-enabled, before start)
     * @param pollId Poll ID
     */
    function enableQuadraticVoting(uint pollId) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();
        if (!(polls[pollId].tokenVotingEnabled)) revert TokenVotingRequired();

        quadraticVoting.setQuadraticVotingEnabled(pollId, true);
    }

    /**
     * @notice Cast quadratic votes: cost = sum of (votes_i)^2 tokens
     * @dev Voter distributes votes across options. Cost for N votes on one option = N*N tokens.
     *      Example: 3 votes on option A + 2 votes on option B = 9 + 4 = 13 tokens
     * @param pollId Poll ID
     * @param optionIds Array of option IDs to vote for
     * @param voteAmounts Array of vote amounts per option (parallel with optionIds)
     */
    function voteQuadratic(
        uint pollId,
        uint[] calldata optionIds,
        uint[] calldata voteAmounts
    ) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (secretBallot[pollId]) revert SecretPoll();
        if (!(authorizedVoters[pollId][msg.sender])) revert NotVoter();
        Poll storage p = polls[pollId];
        if (!(_isWithinVotingPeriod(p.startTime, p.endTime))) revert PollNotActive();
        if (hasVoted[pollId][msg.sender]) revert AlreadyVoted();
        if (delegationVoting.hasDelegated(pollId, msg.sender)) revert VoteIsDelegated();

        // CEI: Update voted flag BEFORE external module call
        hasVoted[pollId][msg.sender] = true;
        voterChoice[pollId][msg.sender] = optionIds[0]; // backward compat
        voteMethod[pollId][msg.sender] = VoteMethod.Token;

        // Record quadratic votes in module (validates and returns costs)
        (uint totalCost, ) = quadraticVoting.recordQuadraticVotes(
            pollId, msg.sender, optionIds, voteAmounts, p.optionsCount
        );

        // Validate token cost
        if (!(pollTokenManager[pollId] != address(0))) revert NoTokenManager();
        uint voterBalance = TokenManager(pollTokenManager[pollId]).getTokenBalance(pollId, msg.sender);
        if (!(voterBalance >= totalCost)) revert InsufficientTokens();

        // Update option vote tallies
        for (uint i = 0; i < optionIds.length; i++) {
            options[pollId][optionIds[i]].votes += voteAmounts[i];
            p.totalVotes += voteAmounts[i];
        }

        // External call: burn tokens
        TokenManager(pollTokenManager[pollId]).burnTokens(pollId, msg.sender, totalCost);
    }

    /**
     * @notice Get quadratic vote allocation for a voter on a specific option
     * @param pollId Poll ID
     * @param voter Voter address
     * @param optionId Option ID
     * @return votes Number of votes allocated
     */
    function getQuadraticVotes(uint pollId, address voter, uint optionId) external view returns (uint) {
        Poll storage p = polls[pollId];
        if (!(p.exists)) revert PollNotFound();
        if (!(p.revealed)) revert PollNotRevealed();
        return quadraticVoting.getQuadraticVotes(pollId, voter, optionId);
    }

    // ══════════════════════════════════════════════════════════════
    //  VOTE DELEGATION
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Enable delegation for a poll (must be before start)
     * @param pollId Poll ID
     */
    function enableDelegation(uint pollId) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();
        if (polls[pollId].tokenVotingEnabled) revert NoDelegationForTokenPolls();
        delegationEnabled[pollId] = true;
        emit DelegationEnabled(pollId);
    }

    /**
     * @notice Delegate your vote to another authorized voter
     * @param pollId Poll ID
     * @param delegatee Address to delegate to
     */
    function delegateVote(uint pollId, address delegatee) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(delegationEnabled[pollId])) revert DelegationDisabled();
        if (!(authorizedVoters[pollId][msg.sender])) revert NotVoter();
        if (!(authorizedVoters[pollId][delegatee])) revert DelegateeNotAuthorized();
        if (hasVoted[pollId][msg.sender]) revert AlreadyVoted();
        if (!(!_hasStarted(polls[pollId].startTime) || _isWithinVotingPeriod(polls[pollId].startTime, polls[pollId].endTime))) revert DelegationClosed();

        delegationVoting.recordDelegation(pollId, msg.sender, delegatee);
    }

    /**
     * @notice Remove your vote delegation (only before poll starts or during voting if not yet voted by delegate)
     * @param pollId Poll ID
     */
    function removeDelegation(uint pollId) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (hasVoted[pollId][msg.sender]) revert DelegateAlreadyVoted();

        delegationVoting.removeDelegation(pollId, msg.sender);
    }

    /**
     * @notice Vote on behalf of a delegator
     * @param pollId Poll ID
     * @param optionId Option to vote for
     * @param delegator Address of the person who delegated their vote
     */
    function voteAsDelegate(uint pollId, uint optionId, address delegator) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(delegationEnabled[pollId])) revert DelegationDisabled();
        if (secretBallot[pollId]) revert SecretPoll();
        Poll storage p = polls[pollId];
        if (!(_isWithinVotingPeriod(p.startTime, p.endTime))) revert PollNotActive();
        if (!(optionId > 0 && optionId <= p.optionsCount)) revert InvalidOption();
        if (hasVoted[pollId][delegator]) revert DelegateAlreadyVoted();

        if (p.tokenVotingRequired) {
            revert NoDelegationForTokenPolls();
        }

        // CEI: Update core state BEFORE external module call
        hasVoted[pollId][delegator] = true;
        voterChoice[pollId][delegator] = optionId;
        options[pollId][optionId].votes += 1;
        p.totalVotes += 1;
        voteMethod[pollId][delegator] = VoteMethod.GasPayment;

        // Validate delegation in module
        delegationVoting.recordDelegateVote(pollId, msg.sender, delegator, optionId);

        emit Voted(pollId, delegator, optionId, VoteMethod.GasPayment);
    }

    /**
     * @notice Get delegation info for a voter
     * @param pollId Poll ID
     * @param voter Voter address
     * @return delegatee Address the voter delegated to (address(0) if none)
     * @return isDelegated Whether the voter has delegated
     * @return delegationsReceived Number of delegations this voter received
     */
    function getDelegationInfo(uint pollId, address voter) external view returns (
        address delegatee,
        bool isDelegated,
        uint delegationsReceived
    ) {
        return delegationVoting.getDelegationInfo(pollId, voter);
    }

    /**
     * @notice Check if a voter has delegated their vote for a poll
     * @param pollId Poll ID
     * @param voter Voter address
     * @return Whether the voter has delegated
     */
    function hasDelegated(uint pollId, address voter) external view returns (bool) {
        return delegationVoting.hasDelegated(pollId, voter);
    }

    // ══════════════════════════════════════════════════════════════
    //  IPFS POLL METADATA
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Set IPFS metadata URI for a poll (only before poll starts)
     * @param pollId Poll ID
     * @param metadataURI IPFS URI (e.g., "ipfs://QmYwAPJzv5CZsnA...")
     */
    function setPollMetadata(uint pollId, string calldata metadataURI) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();

        metadataVoting.setPollMetadata(pollId, metadataURI);
        emit PollMetadataSet(pollId, metadataURI);
    }

    /**
     * @notice Get IPFS metadata URI for a poll
     * @param pollId Poll ID
     * @return metadataURI The IPFS URI string
     */
    function getPollMetadata(uint pollId) external view returns (string memory) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        return metadataVoting.getPollMetadata(pollId);
    }

    // ══════════════════════════════════════════════════════════════
    //  SECRET BALLOT — Configuration & Callbacks
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Enable secret ballot (commit-reveal) for a poll (must be before start)
     * @param pollId Poll ID
     */
    function enableSecretBallot(uint pollId) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (_hasStarted(polls[pollId].startTime)) revert PollStarted();
        if (secretBallot[pollId]) revert SecretBallotAlreadyEnabled();
        if (!(secretBallotMgr != address(0))) revert SBMNotSet();

        secretBallot[pollId] = true;
        emit SecretBallotEnabled(pollId);
    }

    /**
     * @notice Set reveal duration for a specific poll (forwards to SecretBallotManager)
     * @param pollId Poll ID
     * @param duration Duration in seconds (minimum 1 minute, 0 = use default)
     */
    function setRevealDuration(uint pollId, uint duration) external onlyAdminOrOwner(pollId) {
        if (!(secretBallotMgr != address(0))) revert SBMNotSet();
        ISecretBallotManager(secretBallotMgr).setRevealDuration(pollId, duration);
    }

    /**
     * @notice Set the default reveal duration for new polls (forwards to SecretBallotManager)
     * @param duration Duration in seconds (minimum 1 minute)
     */
    function setDefaultRevealDuration(uint duration) external onlyOwner {
        if (!(secretBallotMgr != address(0))) revert SBMNotSet();
        ISecretBallotManager(secretBallotMgr).setDefaultRevealDuration(duration);
    }

    /**
     * @notice Set the SecretBallotManager contract address
     * @dev Locked after infrastructure is locked
     */
    function setSecretBallotManager(address _sbm) external onlyOwner {
        if (!(_sbm != address(0))) revert ZeroAddress();
        if (infrastructureLocked) revert InfraLocked();
        secretBallotMgr = _sbm;
        emit SecretBallotManagerSet(_sbm);
    }

    /**
     * @notice Set the franchise manager contract
     * @dev Locked after infrastructure is locked
     */
    function setFranchiseManager(address _fm) external onlyOwner {
        if (!(_fm != address(0))) revert ZeroAddress();
        if (infrastructureLocked) revert InfraLocked();
        franchiseMgr = _fm;
        emit FranchiseManagerSet(_fm);
    }

    /**
     * @notice Record a revealed vote from SecretBallotManager
     * @dev Only callable by the SecretBallotManager contract.
     *      Validates voter authorization, option bounds, secret ballot status,
     *      and prevents duplicate vote recording.
     */
    function recordSecretVote(uint pollId, address voter, uint optionId, bool isToken) external {
        if (!(msg.sender == secretBallotMgr)) revert Unauthorized();
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(secretBallot[pollId])) revert NotSecretBallot();
        if (!(authorizedVoters[pollId][voter])) revert Unauthorized();
        if (hasVoted[pollId][voter]) revert AlreadyVoted();
        if (!(optionId > 0 && optionId <= polls[pollId].optionsCount)) revert InvalidOption();

        Poll storage p = polls[pollId];
        hasVoted[pollId][voter] = true;
        voterChoice[pollId][voter] = optionId;
        options[pollId][optionId].votes += 1;
        p.totalVotes += 1;
        voteMethod[pollId][voter] = isToken ? VoteMethod.Token : VoteMethod.GasPayment;

        emit Voted(pollId, voter, optionId, voteMethod[pollId][voter]);
    }

    /**
     * @notice Burn a voter's token during secret ballot commit phase
     * @dev Only callable by the SecretBallotManager contract.
     *      Validates voter authorization, poll state, token voting status.
     */
    function burnTokenForCommit(uint pollId, address voter) external {
        if (!(msg.sender == secretBallotMgr)) revert Unauthorized();
        if (!(polls[pollId].tokenVotingEnabled)) revert TokenVotingNotEnabled();
        address tm = pollTokenManager[pollId];
        if (!(tm != address(0))) revert NoTokenManager();
        hasVotedWithToken[pollId][voter] = true;
        TokenManager(tm).burnTokensForVote(pollId, voter);
    }

    // clear revert reasons for unsupported interactions (helps debugging / tooling)
    receive() external payable {
        revert NoPlainEther();
    }

    fallback() external payable {
        revert UnknownFunction();
    }

    // ══════════════════════════════════════════════════════════════
    //  POLL ADMIN TRANSFER
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Transfer poll admin to a new address
     * @dev FranchiseManager can only change admin of polls it created
     */
    function changePollAdmin(uint pollId, address newAdmin) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(newAdmin != address(0))) revert ZeroAddress();
        if (!(newAdmin != polls[pollId].admin)) revert SameAddress();

        bool isPollAdmin = msg.sender == polls[pollId].admin;
        bool isOwner = msg.sender == owner;
        bool isFranchiseMgr = msg.sender == franchiseMgr && isFranchisePoll[pollId];

        if (!(isPollAdmin || isOwner || isFranchiseMgr)) revert Unauthorized();
        address oldAdmin = polls[pollId].admin;
        polls[pollId].admin = newAdmin;
        emit PollAdminChanged(pollId, oldAdmin, newAdmin);
    }
}
