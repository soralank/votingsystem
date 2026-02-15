//SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../../TokenManager.sol";
import "../../VotingPaymaster.sol";

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
        require(_tokenManager != address(0), "Invalid address");
        require(!infrastructureLocked, "Infra locked");
        tokenManager = TokenManager(_tokenManager);
        emit TokenManagerSet(_tokenManager);
    }

    function setVotingPaymaster(address payable _paymaster) external onlyOwner {
        require(_paymaster != address(0), "Invalid address");
        require(!infrastructureLocked, "Infra locked");
        votingPaymaster = VotingPaymaster(_paymaster);
        emit PaymasterSet(_paymaster);
    }

    function setFranchiseManager(address _fm) external onlyOwner {
        require(_fm != address(0), "Invalid address");
        require(!infrastructureLocked, "Infra locked");
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
        require(msg.sender == owner() || msg.sender == franchiseMgr, "Not authorized");
        require(bytes(title).length > 0, "Title cannot be empty");
        require(!titleExists[title], "Poll title already exists.");
        require(admin != address(0), "admin zero");
        require(startTime >= block.timestamp, "Start time cannot be in the past.");
        require(startTime <= block.timestamp + MAX_FUTURE_START, "Start time too far in future.");
        require(durationSeconds >= MIN_POLL_DURATION, "Poll duration too short.");

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

        if (enableTokenVoting && address(tokenManager) != address(0)) {
            string memory tokenName = string(abi.encodePacked("Vote Token - ", title));
            string memory tokenSymbol = string(abi.encodePacked("VOTE", _uint2str(pollId)));
            tokenManager.createPollToken(pollId, tokenName, tokenSymbol);
        }

        emit PollCreated(pollId, title, admin, startTime, endTime, enableTokenVoting, requireTokenVoting);
        return pollId;
    }

    function addOptionToPoll(uint pollId, string calldata optionName) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(block.timestamp < polls[pollId].startTime, "Poll started");
        require(!polls[pollId].ended, "Poll ended");
        // Note: p.ended is kept in struct for storage layout but never set manually
        require(polls[pollId].optionsCount < MAX_OPTIONS, "Maximum options limit reached.");

        polls[pollId].optionsCount++;
        uint optionId = polls[pollId].optionsCount;
        pollOptions[pollId][optionId] = optionName;

        emit OptionAdded(pollId, optionId, optionName);
    }

    function addVoter(uint pollId, address voter) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(block.timestamp < polls[pollId].startTime, "Poll started");
        require(!polls[pollId].ended, "Poll ended");
        require(voter != address(0), "Invalid voter address.");
        require(!authorizedVoters[pollId][voter], "Voter already authorized.");

        authorizedVoters[pollId][voter] = true;
        emit VoterAuthorized(pollId, voter);
    }

    function addVoters(uint pollId, address[] calldata voters) public onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(block.timestamp < polls[pollId].startTime, "Poll started");
        require(!polls[pollId].ended, "Poll ended");
        require(voters.length > 0 && voters.length <= MAX_VOTERS_BATCH, "Batch size exceeds maximum limit.");

        for (uint i = 0; i < voters.length; i++) {
            if (!authorizedVoters[pollId][voters[i]]) {
                authorizedVoters[pollId][voters[i]] = true;
                emit VoterAuthorized(pollId, voters[i]);
            }
        }
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
        require(polls[pollId].exists, "Poll does not exist.");
        require(authorizedVoters[pollId][msg.sender], "Not authorized to vote in this poll.");
        require(!hasVoted[pollId][msg.sender], "You have already voted.");
        require(block.timestamp >= polls[pollId].startTime && block.timestamp < polls[pollId].endTime, "Poll not active for voting.");
        require(optionId > 0 && optionId <= polls[pollId].optionsCount, "Invalid option.");

        if (polls[pollId].tokenVotingRequired) {
            revert("Token voting required");
        }

        hasVoted[pollId][msg.sender] = true;
        votesCount[pollId][optionId]++;
        polls[pollId].totalVotes++;
        voterChoice[pollId][msg.sender] = optionId;
        voteMethod[pollId][msg.sender] = VoteMethod.GasPayment;

        emit Voted(pollId, msg.sender, optionId, VoteMethod.GasPayment);
    }

    function voteInPollWithToken(uint256 pollId, uint256 optionId, address voter) public virtual {
        require(polls[pollId].exists, "Poll does not exist.");
        require(polls[pollId].tokenVotingEnabled, "Token voting not enabled");
        require(authorizedVoters[pollId][voter], "Not authorized to vote in this poll.");
        require(!hasVoted[pollId][voter], "Already voted.");
        require(msg.sender == voter || msg.sender == address(votingPaymaster), "Only voter or paymaster");
        require(block.timestamp >= polls[pollId].startTime && block.timestamp < polls[pollId].endTime, "Poll not active for voting.");
        require(optionId > 0 && optionId <= polls[pollId].optionsCount, "Invalid option.");

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
        require(polls[pollId].exists, "Poll does not exist.");
        require(!polls[pollId].revealed, "Already revealed.");
        require(block.timestamp >= polls[pollId].endTime + TIME_BUFFER, "Poll not ended");

        polls[pollId].revealed = true;
        emit ResultsRevealed(pollId);
    }

    // endPoll removed: polls end automatically when time expires

    // View functions
    function getVotes(uint pollId, uint optionId) external view returns (uint) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(polls[pollId].revealed, "Results not revealed.");
        return votesCount[pollId][optionId];
    }

    function getTotalVotes(uint pollId) external view returns (uint) {
        return polls[pollId].totalVotes;
    }

    function getOption(uint pollId, uint optionId) external view returns (string memory) {
        require(polls[pollId].exists, "Poll does not exist.");
        return pollOptions[pollId][optionId];
    }

    function isVoterAuthorized(uint pollId, address voter) external view returns (bool) {
        return authorizedVoters[pollId][voter];
    }

    function hasVoterVoted(uint pollId, address voter) external view returns (bool) {
        return hasVoted[pollId][voter];
    }

    function getVoterChoice(uint pollId, address voter) external view returns (uint) {
        require(polls[pollId].revealed, "Results not revealed.");
        return voterChoice[pollId][voter];
    }

    function isPollActive(uint pollId) external view returns (bool) {
        if (!polls[pollId].exists) return false;
        return block.timestamp >= polls[pollId].startTime && block.timestamp < polls[pollId].endTime && !polls[pollId].ended;
    }

    function getWinner(uint pollId) external view returns (uint winnerId, string memory winnerName) {
        require(polls[pollId].revealed, "Results not revealed yet.");

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
        require(msg.sender == polls[pollId].admin || msg.sender == owner(), "Only poll admin or owner allowed.");
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

    uint256[48] private __gap;
}
