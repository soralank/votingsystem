//SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../../TokenManager.sol";
import "../../VotingPaymaster.sol";
import "../../VotingErrors.sol";

/**
* @title ElectionsManagerUpgradeable V1
 * @notice Upgradeable version with UUPS proxy pattern
 * @dev Standalone upgradeable version - includes all necessary functionality
 */
contract ElectionsManagerUpgradeable is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    string public constant VERSION = "1.0.0";

    // Poll structure
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
        bool tokenVotingEnabled;
        bool tokenVotingRequired;
    }

    enum VoteMethod { GasPayment, Token }

    // State variables
    TokenManager public tokenManager;
    VotingPaymaster public votingPaymaster;
    
    uint public pollsCount;
    mapping(uint => Poll) public polls;
    mapping(uint => mapping(uint => string)) public pollOptions;
    mapping(uint => mapping(uint => uint)) public votesCount;
    mapping(uint => mapping(address => bool)) public authorizedVoters;
    mapping(uint => mapping(address => bool)) public hasVoted;
    mapping(uint => mapping(address => uint)) public voterChoice;
    mapping(uint => mapping(address => VoteMethod)) public voteMethod;
    mapping(uint => string) public pollTitles;
    mapping(string => bool) private titleExists;

    // Duplicate option name prevention (ported from base)
    mapping(uint => mapping(string => bool)) public pollOptionNames;

    // Track polls created via FranchiseManager (ported from base)
    mapping(uint => bool) internal isFranchisePoll;

    // Constants
    uint public constant MIN_POLL_DURATION = 300;
    uint public constant TIME_BUFFER = 30;
    uint public constant MAX_FUTURE_START = 30 days;
    uint public constant MAX_OPTIONS = 100;
    uint public constant MAX_VOTERS_BATCH = 50;

    // Infrastructure lock: permanently prevents swapping critical contracts (H-8 fix)
    bool public infrastructureLocked;

    // Events
    event PollCreated(uint indexed pollId, string title, address indexed admin, uint startTime, uint endTime, bool tokenVotingEnabled, bool tokenVotingRequired);
    event OptionAdded(uint indexed pollId, uint indexed optionId, string optionName);
    event Voted(uint indexed pollId, address indexed voter, uint indexed optionId, VoteMethod method);
    event ResultsRevealed(uint indexed pollId);
    event VoterAuthorized(uint indexed pollId, address indexed voter);
    event VoterUnauthorized(uint indexed pollId, address indexed voter);
    event ContractUpgraded(string newVersion, address implementation);
    event FranchiseManagerSet(address indexed manager);
    event InfrastructureLocked();
    event Initialized(address indexed initializer);
    event TokenManagerSet(address indexed tokenManager);
    event PaymasterSet(address indexed paymaster);
    event PollAdminChanged(uint indexed pollId, address indexed oldAdmin, address indexed newAdmin);

    // Franchise manager (sub-admin franchise system)
    address public franchiseMgr;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        emit Initialized(msg.sender);
    }

    function setTokenManager(address _tokenManager) external onlyOwner {
        if (!(_tokenManager != address(0))) revert ZeroAddress();
        if (infrastructureLocked) revert InfraLocked();
        tokenManager = TokenManager(_tokenManager);
        emit TokenManagerSet(_tokenManager);
    }

    function setVotingPaymaster(address payable _paymaster) external onlyOwner {
        if (!(_paymaster != address(0))) revert ZeroAddress();
        if (infrastructureLocked) revert InfraLocked();
        votingPaymaster = VotingPaymaster(_paymaster);
        emit PaymasterSet(_paymaster);
    }

    function setFranchiseManager(address _fm) external onlyOwner {
        if (!(_fm != address(0))) revert ZeroAddress();
        if (infrastructureLocked) revert InfraLocked();
        franchiseMgr = _fm;
        emit FranchiseManagerSet(_fm);
    }

    /**
     * @notice Lock infrastructure permanently — prevents swapping critical contracts
     * @dev Called automatically when first poll is created, or manually by owner
     */
    function lockInfrastructure() external onlyOwner {
        _lockInfrastructure();
    }

    function _lockInfrastructure() internal {
        if (!infrastructureLocked) {
            infrastructureLocked = true;
            emit InfrastructureLocked();
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        emit ContractUpgraded(VERSION, newImplementation);
    }

    function getVersion() external pure virtual returns (string memory) {
        return VERSION;
    }

    function createPoll(
        string calldata title,
        address admin,
        uint startTime,
        uint durationSeconds,
        bool enableTokenVoting,
        bool requireTokenVoting,
        address /* customTokenManager */,
        address /* customVotingPaymaster */
    ) external returns (uint) {
        if (!(msg.sender == owner() || msg.sender == franchiseMgr)) revert Unauthorized();
        if (!(bytes(title).length > 0)) revert EmptyTitle();
        if (titleExists[title]) revert DuplicateTitle();
        if (!(admin != address(0))) revert ZeroAddress();
        if (!(startTime >= block.timestamp)) revert StartTimeInPast();
        if (!(startTime <= block.timestamp + MAX_FUTURE_START)) revert StartTimeTooFarInFuture();
        if (!(durationSeconds >= MIN_POLL_DURATION)) revert DurationTooShort();

        uint endTime = startTime + durationSeconds;

        // Lock infrastructure after first poll is created (H-8 fix)
        _lockInfrastructure();

        pollsCount++;
        uint pollId = pollsCount;

        polls[pollId] = Poll({
            title: title,
            admin: admin,
            startTime: startTime,
            endTime: endTime,
            revealed: false,
            ended: false,
            totalVotes: 0,
            optionsCount: 0,
            exists: true,
            tokenVotingEnabled: enableTokenVoting,
            tokenVotingRequired: requireTokenVoting
        });

        pollTitles[pollId] = title;
        titleExists[title] = true;

        // Track if this poll was created via franchise manager
        if (msg.sender == franchiseMgr) {
            isFranchisePoll[pollId] = true;
        }

        if (enableTokenVoting && address(tokenManager) != address(0)) {
            string memory tokenName = string(abi.encodePacked("Vote Token - ", title));
            string memory tokenSymbol = string(abi.encodePacked("VOTE", _uint2str(pollId)));
            tokenManager.createPollToken(pollId, tokenName, tokenSymbol);
        }

        emit PollCreated(pollId, title, admin, startTime, endTime, enableTokenVoting, requireTokenVoting);
        return pollId;
    }

    function addOptionToPoll(uint pollId, string calldata optionName) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(block.timestamp < polls[pollId].startTime)) revert PollStarted();
        if (polls[pollId].ended) revert PollEnded();
        if (!(polls[pollId].optionsCount < MAX_OPTIONS)) revert MaxOptionsReached();
        // Prevent duplicate option names within a poll (ported from base)
        if (pollOptionNames[pollId][optionName]) revert DuplicateName();

        polls[pollId].optionsCount++;
        uint optionId = polls[pollId].optionsCount;
        pollOptions[pollId][optionId] = optionName;
        pollOptionNames[pollId][optionName] = true;

        emit OptionAdded(pollId, optionId, optionName);
    }

    function addVoter(uint pollId, address voter) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(block.timestamp < polls[pollId].startTime)) revert PollStarted();
        if (polls[pollId].ended) revert PollEnded();
        if (!(voter != address(0))) revert ZeroAddress();
        if (authorizedVoters[pollId][voter]) revert DuplicateVoter();

        authorizedVoters[pollId][voter] = true;
        emit VoterAuthorized(pollId, voter);
    }

    function addVoters(uint pollId, address[] calldata voters) public onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(block.timestamp < polls[pollId].startTime)) revert PollStarted();
        if (polls[pollId].ended) revert PollEnded();
        if (!(voters.length > 0 && voters.length <= MAX_VOTERS_BATCH)) revert BatchLimitExceeded();

        for (uint i = 0; i < voters.length; i++) {
            if (!authorizedVoters[pollId][voters[i]]) {
                authorizedVoters[pollId][voters[i]] = true;
                emit VoterAuthorized(pollId, voters[i]);
            }
        }
    }

    function removeVoter(uint pollId, address voter) external onlyAdminOrOwner(pollId) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(block.timestamp < polls[pollId].startTime)) revert PollStarted();
        if (polls[pollId].ended) revert PollEnded();
        if (!(authorizedVoters[pollId][voter])) revert Unauthorized();
        if (hasVoted[pollId][voter]) revert AlreadyVoted();

        authorizedVoters[pollId][voter] = false;
        emit VoterUnauthorized(pollId, voter);
    }

    function addVotersWithTokens(uint pollId, address[] calldata voters, uint256 tokensPerVoter) external onlyAdminOrOwner(pollId) {
        addVoters(pollId, voters);

        if (polls[pollId].tokenVotingEnabled && address(tokenManager) != address(0)) {
            for (uint i = 0; i < voters.length; i++) {
                tokenManager.allocateTokens(pollId, voters[i], tokensPerVoter);
            }
        }
    }

    function voteInPoll(uint pollId, uint optionId) public virtual {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(authorizedVoters[pollId][msg.sender])) revert NotVoter();
        if (hasVoted[pollId][msg.sender]) revert AlreadyVoted();
        if (!(block.timestamp >= polls[pollId].startTime && block.timestamp < polls[pollId].endTime)) revert PollNotActive();
        if (!(optionId > 0 && optionId <= polls[pollId].optionsCount)) revert InvalidOption();

        if (polls[pollId].tokenVotingRequired) {
            revert TokenVotingRequired();
        }

        hasVoted[pollId][msg.sender] = true;
        votesCount[pollId][optionId]++;
        polls[pollId].totalVotes++;
        voterChoice[pollId][msg.sender] = optionId;
        voteMethod[pollId][msg.sender] = VoteMethod.GasPayment;

        emit Voted(pollId, msg.sender, optionId, VoteMethod.GasPayment);
    }

    function voteInPollWithToken(uint256 pollId, uint256 optionId, address voter) public virtual {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(polls[pollId].tokenVotingEnabled)) revert TokenVotingNotEnabled();
        if (!(authorizedVoters[pollId][voter])) revert NotVoter();
        if (hasVoted[pollId][voter]) revert AlreadyVoted();
        if (!(msg.sender == voter || msg.sender == address(votingPaymaster))) revert Unauthorized();
        if (!(block.timestamp >= polls[pollId].startTime && block.timestamp < polls[pollId].endTime)) revert PollNotActive();
        if (!(optionId > 0 && optionId <= polls[pollId].optionsCount)) revert InvalidOption();

        // CEI: Update state BEFORE external call
        hasVoted[pollId][voter] = true;
        votesCount[pollId][optionId]++;
        polls[pollId].totalVotes++;
        voterChoice[pollId][voter] = optionId;
        voteMethod[pollId][voter] = VoteMethod.Token;

        // External call: burn tokens
        tokenManager.burnTokensForVote(pollId, voter);

        emit Voted(pollId, voter, optionId, VoteMethod.Token);
    }

    function revealResults(uint pollId) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (polls[pollId].revealed) revert PollAlreadyRevealed();
        if (!(block.timestamp >= polls[pollId].endTime + TIME_BUFFER)) revert PollNotEnded();

        polls[pollId].revealed = true;
        emit ResultsRevealed(pollId);
    }

    // endPoll removed: polls end automatically when time expires

    // View functions
    function getVotes(uint pollId, uint optionId) external view returns (uint) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(polls[pollId].revealed)) revert PollNotRevealed();
        return votesCount[pollId][optionId];
    }

    function getTotalVotes(uint pollId) external view returns (uint) {
        return polls[pollId].totalVotes;
    }

    function getOption(uint pollId, uint optionId) external view returns (string memory) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        return pollOptions[pollId][optionId];
    }

    function isVoterAuthorized(uint pollId, address voter) external view returns (bool) {
        return authorizedVoters[pollId][voter];
    }

    function hasVoterVoted(uint pollId, address voter) external view returns (bool) {
        return hasVoted[pollId][voter];
    }

    function getVoterChoice(uint pollId, address voter) external view returns (uint) {
        if (!(polls[pollId].revealed)) revert PollNotRevealed();
        return voterChoice[pollId][voter];
    }

    function isPollActive(uint pollId) external view returns (bool) {
        if (!polls[pollId].exists) return false;
        return block.timestamp >= polls[pollId].startTime && block.timestamp < polls[pollId].endTime && !polls[pollId].ended;
    }

    function isPollStarted(uint pollId) external view returns (bool) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        return block.timestamp >= polls[pollId].startTime;
    }

    function isPollEnded(uint pollId) external view returns (bool) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        return block.timestamp >= polls[pollId].endTime;
    }

    function getPollStatus(uint pollId) external view returns (bool started, bool active, bool ended, bool revealed) {
        if (!(polls[pollId].exists)) revert PollNotFound();
        Poll storage p = polls[pollId];
        started = block.timestamp >= p.startTime;
        active = block.timestamp >= p.startTime && block.timestamp < p.endTime && !p.ended;
        ended = block.timestamp >= p.endTime;
        revealed = p.revealed;
    }

    function getPollsCount() external view returns (uint) {
        return pollsCount;
    }

    function getOptionsCount(uint pollId) external view returns (uint) {
        return polls[pollId].optionsCount;
    }

    function getPollStartTime(uint pollId) external view returns (uint) {
        return polls[pollId].startTime;
    }

    function getPollEndTime(uint pollId) external view returns (uint) {
        return polls[pollId].endTime;
    }

    /**
     * @notice Transfer poll admin to a new address (ported from base)
     * @dev FranchiseManager can only change admin of polls it created
     */
    function changePollAdmin(uint pollId, address newAdmin) external {
        if (!(polls[pollId].exists)) revert PollNotFound();
        if (!(newAdmin != address(0))) revert ZeroAddress();
        if (!(newAdmin != polls[pollId].admin)) revert SameAddress();

        bool isPollAdmin = msg.sender == polls[pollId].admin;
        bool isOwnerCaller = msg.sender == owner();
        bool isFranchiseMgr = msg.sender == franchiseMgr && isFranchisePoll[pollId];

        if (!(isPollAdmin || isOwnerCaller || isFranchiseMgr)) revert Unauthorized();
        address oldAdmin = polls[pollId].admin;
        polls[pollId].admin = newAdmin;
        emit PollAdminChanged(pollId, oldAdmin, newAdmin);
    }

    function getWinner(uint pollId) external view returns (uint winnerId, string memory winnerName) {
        if (!(polls[pollId].revealed)) revert PollNotRevealed();

        uint maxVotes = 0;
        uint winningOption = 0;

        for (uint i = 1; i <= polls[pollId].optionsCount; i++) {
            if (votesCount[pollId][i] > maxVotes) {
                maxVotes = votesCount[pollId][i];
                winningOption = i;
            }
        }

        return (winningOption, pollOptions[pollId][winningOption]);
    }

    function canVoteWithToken(uint256 pollId, address voter) external view returns (bool) {
        if (address(tokenManager) == address(0)) return false;
        return tokenManager.hasVoteTokens(pollId, voter);
    }

    function getVoterTokenBalance(uint256 pollId, address voter) external view returns (uint256) {
        if (address(tokenManager) == address(0)) return 0;
        return tokenManager.getTokenBalance(pollId, voter);
    }

    modifier onlyAdminOrOwner(uint pollId) {
        if (!(msg.sender == polls[pollId].admin || msg.sender == owner())) revert Unauthorized();
        _;
    }

    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
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
            bstr[k] = bytes1(uint8(48 + _i % 10));
            _i /= 10;
        }
        return string(bstr);
    }

    uint256[46] private __gap; // reduced from 48: added pollOptionNames + isFranchisePoll
}
