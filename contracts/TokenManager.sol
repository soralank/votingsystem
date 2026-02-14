// SPDX-License-Identifier: ANKIT.SORAL
pragma solidity ^0.8.20;

import "./VotingToken.sol";

/**
 * @title TokenManager
 * @notice Factory for creating and managing per-poll voting tokens
 * @dev Handles token creation, allocation, and burning operations
 */
contract TokenManager {
    // Reference to main voting contract
    address public votingContract;

    // pollId => VotingToken address
    mapping(uint256 => address) public pollTokens;

    // pollId => voter => allocated amount
    mapping(uint256 => mapping(address => uint256)) public allocatedTokens;

    // pollId => is token enabled for this poll
    mapping(uint256 => bool) public tokenVotingEnabled;

    // TokensPerVote: how many tokens required per vote (default 1)
    uint256 public constant TOKENS_PER_VOTE = 1;

    // Events
    event TokenCreated(uint256 indexed pollId, address indexed tokenAddress, string name, string symbol);
    event TokensAllocated(uint256 indexed pollId, address indexed voter, uint256 amount);
    event TokensBurned(uint256 indexed pollId, address indexed voter, uint256 amount);
    event TokenVotingEnabled(uint256 indexed pollId);
    event TokenVotingDisabled(uint256 indexed pollId);

    modifier onlyVotingContract() {
        require(msg.sender == votingContract, "Only voting contract");
        _;
    }

    /**
     * @notice Constructor to initialize TokenManager
     * @param _votingContract Address of the voting contract
     */
    constructor(address _votingContract) {
        require(_votingContract != address(0), "Invalid voting contract");
        votingContract = _votingContract;
    }

    /**
     * @notice Create a new voting token for a poll
     * @param pollId The poll ID
     * @param name Token name
     * @param symbol Token symbol
     * @return address Address of the created token
     */
    function createPollToken(
        uint256 pollId,
        string calldata name,
        string calldata symbol
    ) external onlyVotingContract returns (address) {
        require(pollTokens[pollId] == address(0), "Token already exists for this poll");

        VotingToken token = new VotingToken(pollId, name, symbol);
        pollTokens[pollId] = address(token);

        emit TokenCreated(pollId, address(token), name, symbol);
        return address(token);
    }

    /**
     * @notice Allocate tokens to a voter for a specific poll
     * @param pollId The poll ID
     * @param voter Voter address
     * @param amount Number of tokens to allocate
     */
    function allocateTokens(
        uint256 pollId,
        address voter,
        uint256 amount
    ) external onlyVotingContract {
        require(pollTokens[pollId] != address(0), "No token for this poll");
        require(voter != address(0), "Invalid voter");
        require(amount > 0, "Amount must be positive");

        VotingToken token = VotingToken(pollTokens[pollId]);
        token.mint(voter, amount);

        allocatedTokens[pollId][voter] += amount;

        emit TokensAllocated(pollId, voter, amount);
    }

    /**
     * @notice Batch allocate tokens to multiple voters
     * @param pollId The poll ID
     * @param voters Array of voter addresses
     * @param amounts Array of token amounts
     */
    function batchAllocateTokens(
        uint256 pollId,
        address[] calldata voters,
        uint256[] calldata amounts
    ) external onlyVotingContract {
        require(voters.length == amounts.length, "Array length mismatch");
        require(voters.length > 0, "Empty arrays");
        require(pollTokens[pollId] != address(0), "No token for this poll");

        VotingToken token = VotingToken(pollTokens[pollId]);

        for (uint256 i = 0; i < voters.length; i++) {
            require(voters[i] != address(0), "Invalid voter");
            require(amounts[i] > 0, "Amount must be positive");

            token.mint(voters[i], amounts[i]);
            allocatedTokens[pollId][voters[i]] += amounts[i];

            emit TokensAllocated(pollId, voters[i], amounts[i]);
        }
    }

    /**
     * @notice Burn tokens when a vote is cast
     * @param pollId The poll ID
     * @param voter Voter address
     */
    function burnTokensForVote(uint256 pollId, address voter) external onlyVotingContract {
        require(pollTokens[pollId] != address(0), "No token for this poll");

        VotingToken token = VotingToken(pollTokens[pollId]);
        require(token.balanceOf(voter) >= TOKENS_PER_VOTE, "Insufficient tokens");

        token.burn(voter, TOKENS_PER_VOTE);

        emit TokensBurned(pollId, voter, TOKENS_PER_VOTE);
    }

    /**
     * @notice Burn a specific amount of tokens (for quadratic voting)
     * @param pollId The poll ID
     * @param voter Voter address
     * @param amount Number of tokens to burn
     */
    function burnTokens(uint256 pollId, address voter, uint256 amount) external onlyVotingContract {
        require(pollTokens[pollId] != address(0), "No token for this poll");
        require(amount > 0, "Amount must be positive");

        VotingToken token = VotingToken(pollTokens[pollId]);
        require(token.balanceOf(voter) >= amount, "Insufficient tokens");

        token.burn(voter, amount);

        emit TokensBurned(pollId, voter, amount);
    }

    /**
     * @notice Check if voter has sufficient tokens
     * @param pollId The poll ID
     * @param voter Voter address
     * @return bool True if voter has sufficient tokens
     */
    function hasVoteTokens(uint256 pollId, address voter) external view returns (bool) {
        address tokenAddr = pollTokens[pollId];
        if (tokenAddr == address(0)) return false;

        VotingToken token = VotingToken(tokenAddr);
        return token.balanceOf(voter) >= TOKENS_PER_VOTE;
    }

    /**
     * @notice Get token balance for a voter
     * @param pollId The poll ID
     * @param voter Voter address
     * @return uint256 Token balance
     */
    function getTokenBalance(uint256 pollId, address voter) external view returns (uint256) {
        address tokenAddr = pollTokens[pollId];
        if (tokenAddr == address(0)) return 0;

        VotingToken token = VotingToken(tokenAddr);
        return token.balanceOf(voter);
    }

    /**
     * @notice Enable token-based voting for a poll
     * @param pollId The poll ID
     */
    function enableTokenVoting(uint256 pollId) external onlyVotingContract {
        require(pollTokens[pollId] != address(0), "No token for this poll");
        tokenVotingEnabled[pollId] = true;
        emit TokenVotingEnabled(pollId);
    }

    /**
     * @notice Disable token-based voting for a poll
     * @param pollId The poll ID
     */
    function disableTokenVoting(uint256 pollId) external onlyVotingContract {
        tokenVotingEnabled[pollId] = false;
        emit TokenVotingDisabled(pollId);
    }

    /**
     * @notice Get the token address for a poll
     * @param pollId The poll ID
     * @return address Token address (address(0) if no token exists)
     */
    function getPollToken(uint256 pollId) external view returns (address) {
        return pollTokens[pollId];
    }

    /**
     * @notice Check if token voting is enabled for a poll
     * @param pollId The poll ID
     * @return bool True if token voting is enabled
     */
    function isTokenVotingEnabled(uint256 pollId) external view returns (bool) {
        return tokenVotingEnabled[pollId];
    }
}
