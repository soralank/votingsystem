// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

import "../VotingErrors.sol";

/**
 * @title QuadraticVoting
 * @notice Module for quadratic voting state management
 * @dev Lightweight contract that stores quadratic voting configuration and allocations.
 *      All validation and core poll state updates are handled by ElectionsManager.
 */
contract QuadraticVoting {
    // pollId => is quadratic voting enabled
    mapping(uint => bool) public quadraticVotingEnabled;
    // pollId => voter => optionId => number of votes allocated
    mapping(uint => mapping(address => mapping(uint => uint))) public quadraticVoteAllocation;
    // pollId => voter => total tokens spent (for tracking)
    mapping(uint => mapping(address => uint)) public quadraticTokensSpent;

    // Owner (ElectionsManager) who can call state-changing functions
    address public electionsManager;

    event QuadraticVotingEnabled(uint indexed pollId);
    event QuadraticVotingDisabled(uint indexed pollId);
    event VotedQuadratic(uint indexed pollId, address indexed voter, uint[] optionIds, uint[] voteAmounts, uint totalCost);

    modifier onlyElectionsManager() {
        if (!(msg.sender == electionsManager)) revert Unauthorized();
        _;
    }

    constructor() {
        electionsManager = msg.sender;
    }

    /**
     * @notice Enable or disable quadratic voting for a poll
     * @param pollId Poll ID
     * @param enabled Whether to enable
     */
    function setQuadraticVotingEnabled(uint pollId, bool enabled) external onlyElectionsManager {
        quadraticVotingEnabled[pollId] = enabled;
        if (enabled) {
            emit QuadraticVotingEnabled(pollId);
        } else {
            emit QuadraticVotingDisabled(pollId);
        }
    }

    /**
     * @notice Validate and record quadratic vote allocations. Returns totalCost and per-option vote amounts.
     * @dev Called by ElectionsManager after it has validated poll state, authorization, etc.
     * @param pollId Poll ID
     * @param voter Voter address
     * @param optionIds Array of option IDs to vote for
     * @param voteAmounts Array of vote amounts per option
     * @param optionsCount Total options in the poll
     * @return totalCost The total quadratic cost (sum of squares)
     * @return totalVotes The total votes cast (sum of amounts)
     */
    function recordQuadraticVotes(
        uint pollId,
        address voter,
        uint[] calldata optionIds,
        uint[] calldata voteAmounts,
        uint optionsCount
    ) external onlyElectionsManager returns (uint totalCost, uint totalVotes) {
        if (!(quadraticVotingEnabled[pollId])) revert QuadraticNotEnabled();
        if (!(optionIds.length > 0)) revert EmptyArray();
        if (!(optionIds.length == voteAmounts.length)) revert ArrayLengthMismatch();

        totalCost = 0;
        totalVotes = 0;
        for (uint i = 0; i < optionIds.length; i++) {
            if (!(optionIds[i] > 0 && optionIds[i] <= optionsCount)) revert InvalidOption();
            if (!(voteAmounts[i] > 0)) revert ZeroAmount();
            // Check for duplicate options
            for (uint j = 0; j < i; j++) {
                if (!(optionIds[i] != optionIds[j])) revert DuplicateOption();
            }

            uint cost = voteAmounts[i] * voteAmounts[i]; // quadratic cost
            totalCost += cost;
            totalVotes += voteAmounts[i];

            quadraticVoteAllocation[pollId][voter][optionIds[i]] = voteAmounts[i];
        }

        quadraticTokensSpent[pollId][voter] = totalCost;

        emit VotedQuadratic(pollId, voter, optionIds, voteAmounts, totalCost);
    }

    /**
     * @notice Get quadratic vote allocation for a voter on a specific option
     * @param pollId Poll ID
     * @param voter Voter address
     * @param optionId Option ID
     * @return votes Number of votes allocated
     */
    function getQuadraticVotes(uint pollId, address voter, uint optionId) external view returns (uint) {
        return quadraticVoteAllocation[pollId][voter][optionId];
    }
}
