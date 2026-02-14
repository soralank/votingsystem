// SPDX-License-Identifier: ANKIT.SORAL
pragma solidity ^0.8.20;

import "./TokenIntegratedVoting.sol";
import "./modules/MultiChoiceVoting.sol";
import "./modules/QuadraticVoting.sol";
import "./modules/DelegationVoting.sol";
import "./modules/MetadataVoting.sol";

/**
 * @title ISecretBallotManager
 * @notice Minimal interface for ElectionsManager to read configurable reveal duration
 */
interface ISecretBallotManager {
    function getRevealDuration(uint pollId) external view returns (uint);
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
    // pollId => optionId => Option (private to hide vote counts until reveal)
    mapping(uint => mapping(uint => Option)) private options;
    // pollId => voter => choice (private to protect vote privacy)
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

    event SecretBallotEnabled(uint indexed pollId);
    event SecretBallotManagerSet(address indexed manager);
    event FranchiseManagerSet(address indexed manager);
    event PollAdminChanged(uint indexed pollId, address indexed oldAdmin, address indexed newAdmin);

    modifier onlyAdminOrOwner(uint pollId) {
        require(msg.sender == polls[pollId].admin || msg.sender == owner, "Only poll admin or owner allowed.");
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
        require(msg.sender == owner || msg.sender == franchiseMgr, "Not authorized");
        require(admin != address(0), "admin zero");
        // NEW: check for duplicate title
        require(!pollTitles[title], "Poll title already exists.");

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
        require(polls[pollId].exists, "Poll does not exist.");
        require(!_hasEnded(polls[pollId].endTime), "Poll ended");
        require(msg.sender == polls[pollId].admin || msg.sender == owner, "Only poll admin or owner allowed.");
        require(!_hasStarted(polls[pollId].startTime), "Poll started");
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
        require(!_hasEnded(polls[pollId].endTime), "Poll ended");
        require(!_hasStarted(polls[pollId].startTime), "Poll started");
        require(voter != address(0), "Invalid voter address.");
        require(!authorizedVoters[pollId][voter], "Voter already authorized.");

        authorizedVoters[pollId][voter] = true;
        emit VoterAuthorized(pollId, voter);
    }

    function addVoters(uint pollId, address[] calldata voters) public onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!_hasEnded(polls[pollId].endTime), "Poll ended");
        require(!_hasStarted(polls[pollId].startTime), "Poll started");
        require(voters.length <= MAX_VOTERS_BATCH, "Batch size exceeds maximum limit.");

        for(uint i = 0; i < voters.length; i++) {
            address voter = voters[i];
            require(voter != address(0), "Invalid voter address.");
            if (!authorizedVoters[pollId][voter]) {
                authorizedVoters[pollId][voter] = true;
                emit VoterAuthorized(pollId, voter);
            }
        }
    }

    function removeVoter(uint pollId, address voter) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!_hasEnded(polls[pollId].endTime), "Poll ended");
        require(!_hasStarted(polls[pollId].startTime), "Poll started");
        require(authorizedVoters[pollId][voter], "Voter not authorized.");
        require(!hasVoted[pollId][voter], "Cannot remove voter who already voted.");

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
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        Option storage o = options[pollId][optionId];
        
        // Vote counts are hidden until results are revealed (no admin bypass)
        if (!p.revealed) {
            return (o.id, o.name, 0);
        }
        return (o.id, o.name, o.votes);
    }

    function voteInPoll(uint pollId, uint optionId) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!secretBallot[pollId], "Secret ballot enabled. Use commitVote().");
        require(authorizedVoters[pollId][msg.sender], "Not authorized to vote in this poll.");
        Poll storage p = polls[pollId];
        require(_isWithinVotingPeriod(p.startTime, p.endTime), "Poll not active for voting.");
        require(optionId > 0 && optionId <= p.optionsCount, "Invalid option.");
        require(!hasVoted[pollId][msg.sender], "You have already voted.");
        require(!delegationVoting.hasDelegated(pollId, msg.sender), "You have delegated your vote.");

        // Check if token voting is required
        if (p.tokenVotingRequired) {
            revert("Token voting required");
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
    ) public override {
        // Can be called by voter directly OR by paymaster
        require(
            msg.sender == voter || msg.sender == pollVotingPaymaster[pollId],
            "Only voter or paymaster"
        );

        require(polls[pollId].exists, "Poll does not exist.");
        require(!secretBallot[pollId], "Secret ballot enabled. Use commitVote().");
        require(authorizedVoters[pollId][voter], "Not authorized to vote in this poll.");
        Poll storage p = polls[pollId];
        require(_isWithinVotingPeriod(p.startTime, p.endTime), "Poll not active for voting.");
        require(optionId > 0 && optionId <= p.optionsCount, "Invalid option.");
        require(!hasVoted[pollId][voter], "Already voted.");
        require(!delegationVoting.hasDelegated(pollId, voter), "Voter has delegated their vote.");
        require(p.tokenVotingEnabled, "Token voting not enabled");

        // Use per-poll TokenManager for token operations
        require(pollTokenManager[pollId] != address(0), "TokenManager not set");
        uint voterBalance = TokenManager(pollTokenManager[pollId]).getTokenBalance(pollId, voter);
        require(voterBalance >= 1, "Insufficient tokens");
        TokenManager(pollTokenManager[pollId]).burnTokens(pollId, voter, 1);

        // Mark token vote (don't call super — it would burn tokens again via global TokenManager)
        hasVotedWithToken[pollId][voter] = true;
        emit VotedWithToken(pollId, voter, optionId);

        // Record vote
        hasVoted[pollId][voter] = true;
        voterChoice[pollId][voter] = optionId;
        options[pollId][optionId].votes += 1;
        p.totalVotes += 1;

        // Track vote method
        voteMethod[pollId][voter] = VoteMethod.Token;

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
        require(p.revealed, "Results not revealed.");
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
        return !_hasEnded(p.endTime) && _isWithinVotingPeriod(p.startTime, p.endTime);
    }

    function isPollStarted(uint pollId) external view returns (bool) {
        require(polls[pollId].exists, "Poll does not exist.");
        return block.timestamp >= polls[pollId].startTime;
    }

    function isPollEnded(uint pollId) external view returns (bool) {
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        return _hasEnded(p.endTime);
    }

    function getPollStatus(uint pollId) external view returns (bool started, bool active, bool ended, bool revealed) {
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        
        started = block.timestamp >= p.startTime;
        active = !_hasEnded(p.endTime) && _isWithinVotingPeriod(p.startTime, p.endTime);
        ended = _hasEnded(p.endTime);
        revealed = p.revealed;
    }

    function getWinner(uint pollId) external view returns (uint winningOptionId, string memory winningOptionName, uint winningVotes) {
        require(polls[pollId].exists, "Poll does not exist.");
        Poll storage p = polls[pollId];
        // No admin bypass — winner hidden until reveal
        require(p.revealed, "Results not revealed.");

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
        require(!polls[pollId].revealed, "Already revealed.");

        uint endTime = polls[pollId].endTime;

        if (secretBallot[pollId]) {
            // Secret ballot: must wait for reveal period to finish
            // Read configurable reveal duration from SecretBallotManager
            uint revealDuration = ISecretBallotManager(secretBallotMgr).getRevealDuration(pollId);
            require(block.timestamp >= endTime + TIME_BUFFER + revealDuration,
                "Reveal period active");
        } else {
            // Standard poll: anyone can reveal after time-based end
            require(_hasEnded(endTime), "Poll not ended");
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
        require(polls[pollId].exists, "Poll does not exist.");
        require(!_hasStarted(polls[pollId].startTime), "Poll already started.");
        multiChoiceVoting.configureMultiChoice(pollId, maxChoices, polls[pollId].optionsCount);
    }

    /**
     * @notice Vote for multiple options in a poll
     * @param pollId Poll ID
     * @param optionIds Array of option IDs to vote for
     */
    function voteMultiChoice(uint pollId, uint[] calldata optionIds) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!secretBallot[pollId], "Secret ballot enabled. Use commitVote().");
        require(authorizedVoters[pollId][msg.sender], "Not authorized to vote in this poll.");
        Poll storage p = polls[pollId];
        require(_isWithinVotingPeriod(p.startTime, p.endTime), "Poll not active for voting.");
        require(!hasVoted[pollId][msg.sender], "You have already voted.");
        require(!delegationVoting.hasDelegated(pollId, msg.sender), "You have delegated your vote.");

        if (p.tokenVotingRequired) {
            revert("Token voting required");
        }

        // Validate and record multi-choice selections in module
        multiChoiceVoting.recordMultiChoiceVote(pollId, msg.sender, optionIds, p.optionsCount);

        // Update core state
        for (uint i = 0; i < optionIds.length; i++) {
            options[pollId][optionIds[i]].votes += 1;
            p.totalVotes += 1;
        }

        hasVoted[pollId][msg.sender] = true;
        voterChoice[pollId][msg.sender] = optionIds[0]; // backward compat
        voteMethod[pollId][msg.sender] = VoteMethod.GasPayment;

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
        require(p.exists, "Poll does not exist.");
        require(p.revealed, "Results not revealed.");
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
        require(polls[pollId].exists, "Poll does not exist.");
        require(!_hasStarted(polls[pollId].startTime), "Poll already started.");
        require(polls[pollId].tokenVotingEnabled, "Needs token voting");

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
        require(polls[pollId].exists, "Poll does not exist.");
        require(!secretBallot[pollId], "Secret ballot enabled. Use commitVote().");
        require(authorizedVoters[pollId][msg.sender], "Not authorized to vote in this poll.");
        Poll storage p = polls[pollId];
        require(_isWithinVotingPeriod(p.startTime, p.endTime), "Poll not active for voting.");
        require(!hasVoted[pollId][msg.sender], "You have already voted.");
        require(!delegationVoting.hasDelegated(pollId, msg.sender), "You have delegated your vote.");

        // Record quadratic votes in module (validates and returns costs)
        (uint totalCost, ) = quadraticVoting.recordQuadraticVotes(
            pollId, msg.sender, optionIds, voteAmounts, p.optionsCount
        );

        // Burn tokens equal to quadratic cost
        require(pollTokenManager[pollId] != address(0), "TokenManager not set");
        uint voterBalance = TokenManager(pollTokenManager[pollId]).getTokenBalance(pollId, msg.sender);
        require(voterBalance >= totalCost, "Insufficient tokens for quadratic cost.");
        TokenManager(pollTokenManager[pollId]).burnTokens(pollId, msg.sender, totalCost);

        // Update core state: increment option votes
        for (uint i = 0; i < optionIds.length; i++) {
            options[pollId][optionIds[i]].votes += voteAmounts[i];
            p.totalVotes += voteAmounts[i];
        }

        hasVoted[pollId][msg.sender] = true;
        voterChoice[pollId][msg.sender] = optionIds[0]; // backward compat
        voteMethod[pollId][msg.sender] = VoteMethod.Token;
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
        require(p.exists, "Poll does not exist.");
        require(p.revealed, "Results not revealed.");
        return quadraticVoting.getQuadraticVotes(pollId, voter, optionId);
    }

    // ══════════════════════════════════════════════════════════════
    //  VOTE DELEGATION
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Delegate your vote to another authorized voter
     * @param pollId Poll ID
     * @param delegatee Address to delegate to
     */
    function delegateVote(uint pollId, address delegatee) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(authorizedVoters[pollId][msg.sender], "Not authorized to vote in this poll.");
        require(authorizedVoters[pollId][delegatee], "Delegatee not authorized.");
        require(!hasVoted[pollId][msg.sender], "Already voted; cannot delegate.");
        require(!_hasStarted(polls[pollId].startTime) || _isWithinVotingPeriod(polls[pollId].startTime, polls[pollId].endTime),
            "Can only delegate before or during voting.");

        delegationVoting.recordDelegation(pollId, msg.sender, delegatee);
    }

    /**
     * @notice Remove your vote delegation (only before poll starts or during voting if not yet voted by delegate)
     * @param pollId Poll ID
     */
    function removeDelegation(uint pollId) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!hasVoted[pollId][msg.sender], "Delegate already voted on your behalf.");

        delegationVoting.removeDelegation(pollId, msg.sender);
    }

    /**
     * @notice Vote on behalf of a delegator
     * @param pollId Poll ID
     * @param optionId Option to vote for
     * @param delegator Address of the person who delegated their vote
     */
    function voteAsDelegate(uint pollId, uint optionId, address delegator) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(!secretBallot[pollId], "Secret ballot: use commitVote()");
        Poll storage p = polls[pollId];
        require(_isWithinVotingPeriod(p.startTime, p.endTime), "Poll not active for voting.");
        require(optionId > 0 && optionId <= p.optionsCount, "Invalid option.");
        require(!hasVoted[pollId][delegator], "Already voted for this delegator.");

        if (p.tokenVotingRequired) {
            revert("Token polls: no delegation");
        }

        // Validate delegation in module
        delegationVoting.recordDelegateVote(pollId, msg.sender, delegator, optionId);

        // Update core state
        hasVoted[pollId][delegator] = true;
        voterChoice[pollId][delegator] = optionId;
        options[pollId][optionId].votes += 1;
        p.totalVotes += 1;
        voteMethod[pollId][delegator] = VoteMethod.GasPayment;

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
        require(polls[pollId].exists, "Poll does not exist.");
        require(!_hasStarted(polls[pollId].startTime), "Poll started");

        metadataVoting.setPollMetadata(pollId, metadataURI);
        emit PollMetadataSet(pollId, metadataURI);
    }

    /**
     * @notice Get IPFS metadata URI for a poll
     * @param pollId Poll ID
     * @return metadataURI The IPFS URI string
     */
    function getPollMetadata(uint pollId) external view returns (string memory) {
        require(polls[pollId].exists, "Poll does not exist.");
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
        require(polls[pollId].exists, "Poll does not exist.");
        require(!_hasStarted(polls[pollId].startTime), "Poll already started.");
        require(!secretBallot[pollId], "Already enabled");

        secretBallot[pollId] = true;
        emit SecretBallotEnabled(pollId);
    }

    /**
     * @notice Set the SecretBallotManager contract address
     * @param _sbm Address of SecretBallotManager
     */
    function setSecretBallotManager(address _sbm) external onlyOwner {
        require(_sbm != address(0), "Invalid address");
        secretBallotMgr = _sbm;
        emit SecretBallotManagerSet(_sbm);
    }

    /**
     * @notice Set the franchise manager contract
     * @param _fm Address of FranchiseManager
     */
    function setFranchiseManager(address _fm) external onlyOwner {
        require(_fm != address(0), "Invalid address");
        franchiseMgr = _fm;
        emit FranchiseManagerSet(_fm);
    }

    /**
     * @notice Record a revealed vote from SecretBallotManager
     * @dev Only callable by the SecretBallotManager contract
     * @param pollId Poll ID
     * @param voter Voter address
     * @param optionId The option voted for
     * @param isToken Whether voter used token-based commit
     */
    function recordSecretVote(uint pollId, address voter, uint optionId, bool isToken) external {
        require(msg.sender == secretBallotMgr, "Only SBM");
        require(polls[pollId].exists, "Poll does not exist.");

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
     * @dev Only callable by the SecretBallotManager contract
     * @param pollId Poll ID
     * @param voter Voter address
     */
    function burnTokenForCommit(uint pollId, address voter) external {
        require(msg.sender == secretBallotMgr, "Only SBM");
        address tm = pollTokenManager[pollId];
        require(tm != address(0), "TokenManager not set");
        TokenManager(tm).burnTokensForVote(pollId, voter);
        hasVotedWithToken[pollId][voter] = true;
    }

    // clear revert reasons for unsupported interactions (helps debugging / tooling)
    receive() external payable {
        revert("Contract does not accept plain ether.");
    }

    fallback() external payable {
        revert("Unknown function called.");
    }

    // ══════════════════════════════════════════════════════════════
    //  POLL ADMIN TRANSFER
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Transfer poll admin to a new address
     * @dev Callable by current poll admin, contract owner, or franchise manager
     * @param pollId Poll ID
     * @param newAdmin New admin address
     */
    function changePollAdmin(uint pollId, address newAdmin) external {
        require(polls[pollId].exists, "Poll does not exist.");
        require(newAdmin != address(0), "Invalid admin address");
        require(
            msg.sender == polls[pollId].admin ||
            msg.sender == owner ||
            msg.sender == franchiseMgr,
            "Only poll admin, owner, or franchise manager"
        );
        address oldAdmin = polls[pollId].admin;
        polls[pollId].admin = newAdmin;
        emit PollAdminChanged(pollId, oldAdmin, newAdmin);
    }
}
