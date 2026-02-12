// SPDX-License-Identifier: ANKIT.SORAL
pragma solidity ^0.8.20;

import "./TimeValidator.sol";
import "./TokenManager.sol";
import "./VotingPaymaster.sol";

/**
 * @title TokenIntegratedVoting
 * @notice Adds token-based voting capabilities to base voting system
 * @dev Extends TimeValidator, integrates with TokenManager and VotingPaymaster
 */
contract TokenIntegratedVoting is TimeValidator {
    // Token infrastructure
    TokenManager public tokenManager;
    VotingPaymaster public votingPaymaster;

    // Owner address (for access control)
    address public owner;
    address public pendingOwner;

    // Poll configuration for token voting
    struct TokenConfig {
        bool enabled;              // Is token voting enabled for this poll?
        bool tokenRequired;        // Is token REQUIRED (vs optional)?
        uint256 tokensPerVoter;    // How many tokens to allocate per voter
        bool allowGaslessVoting;   // Allow gasless (paymaster) voting?
    }

    // pollId => TokenConfig
    mapping(uint256 => TokenConfig) public pollTokenConfigs;

    // pollId => voter => has voted with token
    mapping(uint256 => mapping(address => bool)) public hasVotedWithToken;

    // Events
    event TokenManagerSet(address indexed tokenManager);
    event PaymasterSet(address indexed paymaster);
    event TokenVotingConfigured(
        uint256 indexed pollId,
        bool enabled,
        bool tokenRequired,
        uint256 tokensPerVoter,
        bool allowGaslessVoting
    );
    event VotedWithToken(uint256 indexed pollId, address indexed voter, uint256 indexed optionId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }

    /**
     * @notice Constructor to initialize ownership
     */
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @notice Set the token manager contract
     * @param _tokenManager Address of TokenManager
     */
    function setTokenManager(address _tokenManager) external onlyOwner {
        require(_tokenManager != address(0), "Invalid token manager");
        tokenManager = TokenManager(_tokenManager);
        emit TokenManagerSet(_tokenManager);
    }

    /**
     * @notice Set the voting paymaster contract
     * @param _paymaster Address of VotingPaymaster
     */
    function setVotingPaymaster(address payable _paymaster) external onlyOwner {
        require(_paymaster != address(0), "Invalid paymaster");
        votingPaymaster = VotingPaymaster(_paymaster);
        emit PaymasterSet(_paymaster);
    }

    /**
     * @notice Configure token-based voting for a poll
     * @param pollId Poll ID
     * @param enabled Enable token voting?
     * @param tokenRequired Require tokens (vs optional)?
     * @param tokensPerVoter Tokens to allocate per voter
     * @param allowGaslessVoting Allow gasless voting?
     */
    function configureTokenVoting(
        uint256 pollId,
        bool enabled,
        bool tokenRequired,
        uint256 tokensPerVoter,
        bool allowGaslessVoting
    ) external virtual {
        // Access control should be implemented in subclass
        // This function is meant to be overridden by ElectionsManager

        TokenConfig storage config = pollTokenConfigs[pollId];
        config.enabled = enabled;
        config.tokenRequired = tokenRequired;
        config.tokensPerVoter = tokensPerVoter;
        config.allowGaslessVoting = allowGaslessVoting;

        emit TokenVotingConfigured(pollId, enabled, tokenRequired, tokensPerVoter, allowGaslessVoting);
    }

    /**
     * @notice Create tokens for a poll
     * @param pollId Poll ID
     * @param tokenName Token name
     * @param tokenSymbol Token symbol
     */
    function createPollTokens(
        uint256 pollId,
        string calldata tokenName,
        string calldata tokenSymbol
    ) external virtual {
        // Access control should be implemented in subclass
        require(address(tokenManager) != address(0), "TokenManager not set");

        tokenManager.createPollToken(pollId, tokenName, tokenSymbol);
    }

    /**
     * @notice Allocate tokens to voters
     * @param pollId Poll ID
     * @param voters Array of voter addresses
     * @param amounts Array of token amounts (can be single element for uniform allocation)
     */
    function allocateVotingTokens(
        uint256 pollId,
        address[] calldata voters,
        uint256[] calldata amounts
    ) external virtual {
        // Access control should be implemented in subclass
        require(address(tokenManager) != address(0), "TokenManager not set");
        require(voters.length > 0, "Empty voters array");

        TokenConfig memory config = pollTokenConfigs[pollId];

        if (amounts.length == 0) {
            // Use default amount from config
            uint256[] memory defaultAmounts = new uint256[](voters.length);
            for (uint256 i = 0; i < voters.length; i++) {
                defaultAmounts[i] = config.tokensPerVoter > 0 ? config.tokensPerVoter : 1;
            }
            tokenManager.batchAllocateTokens(pollId, voters, defaultAmounts);
        } else if (amounts.length == 1) {
            // Use single amount for all voters
            uint256[] memory uniformAmounts = new uint256[](voters.length);
            for (uint256 i = 0; i < voters.length; i++) {
                uniformAmounts[i] = amounts[0];
            }
            tokenManager.batchAllocateTokens(pollId, voters, uniformAmounts);
        } else {
            // Use provided amounts array
            require(voters.length == amounts.length, "Array length mismatch");
            tokenManager.batchAllocateTokens(pollId, voters, amounts);
        }
    }

    /**
     * @notice Vote with token (called by voter directly, pays gas)
     * @param pollId Poll ID
     * @param optionId Option to vote for
     * @param voter Voter address
     */
    function voteInPollWithToken(
        uint256 pollId,
        uint256 optionId,
        address voter
    ) public virtual {
        // Validation logic should be implemented in subclass
        // - Poll exists and is active
        // - Voter is authorized
        // - Voter hasn't voted yet
        // - Option is valid
        // - Voter has sufficient tokens

        require(address(tokenManager) != address(0), "TokenManager not set");
        require(!hasVotedWithToken[pollId][voter], "Already voted with token");

        // Burn tokens
        tokenManager.burnTokensForVote(pollId, voter);

        // Mark as voted
        hasVotedWithToken[pollId][voter] = true;

        // Actual vote recording happens in subclass
        emit VotedWithToken(pollId, voter, optionId);
    }

    /**
     * @notice Check if voter can vote with tokens
     * @param pollId Poll ID
     * @param voter Voter address
     * @return bool True if voter can vote with tokens
     */
    function canVoteWithToken(uint256 pollId, address voter) external view returns (bool) {
        if (address(tokenManager) == address(0)) return false;
        if (hasVotedWithToken[pollId][voter]) return false;

        return tokenManager.hasVoteTokens(pollId, voter);
    }

    /**
     * @notice Get voter's token balance
     * @param pollId Poll ID
     * @param voter Voter address
     * @return uint256 Token balance
     */
    function getVoterTokenBalance(uint256 pollId, address voter) external view returns (uint256) {
        if (address(tokenManager) == address(0)) return 0;
        return tokenManager.getTokenBalance(pollId, voter);
    }

    /**
     * @notice Get token configuration for a poll
     * @param pollId Poll ID
     * @return TokenConfig configuration
     */
    function getTokenConfig(uint256 pollId) external view returns (TokenConfig memory) {
        return pollTokenConfigs[pollId];
    }

    /**
     * @notice Transfer ownership (2-step process, step 1)
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /**
     * @notice Accept ownership (2-step process, step 2)
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Only pending owner can accept");
        address oldOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, owner);
    }

    /**
     * @notice Cancel pending ownership transfer
     */
    function cancelOwnershipTransfer() external onlyOwner {
        pendingOwner = address(0);
    }

    /**
     * @notice Renounce ownership permanently
     */
    function renounceOwnership() external onlyOwner {
        owner = address(0);
        pendingOwner = address(0);
        emit OwnershipTransferred(msg.sender, address(0));
    }
}
