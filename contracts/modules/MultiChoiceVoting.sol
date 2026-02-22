// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

import "../VotingErrors.sol";

/**
 * @title MultiChoiceVoting
 * @notice Module for multi-choice voting state management
 * @dev Lightweight contract that stores multi-choice configuration and voter selections.
 *      All validation and core poll state updates are handled by ElectionsManager.
 */
contract MultiChoiceVoting {
    // pollId => max choices allowed (0 = single-choice default)
    mapping(uint => uint) public pollMaxChoices;
    // pollId => voter => array of chosen optionIds
    mapping(uint => mapping(address => uint[])) private voterMultiChoices;

    // Owner (ElectionsManager) who can call state-changing functions
    address public electionsManager;

    event MultiChoiceConfigured(uint indexed pollId, uint maxChoices);

    modifier onlyElectionsManager() {
        if (!(msg.sender == electionsManager)) revert Unauthorized();
        _;
    }

    constructor() {
        electionsManager = msg.sender;
    }

    /**
     * @notice Configure multi-choice voting for a poll
     * @param pollId Poll ID
     * @param maxChoices Maximum choices allowed (must be >= 2)
     * @param optionsCount Current number of options in the poll
     */
    function configureMultiChoice(uint pollId, uint maxChoices, uint optionsCount) external onlyElectionsManager {
        if (!(maxChoices >= 2)) revert MinTwoChoices();
        if (!(maxChoices <= optionsCount || optionsCount == 0)) revert MaxChoicesExceedsOptions();
        pollMaxChoices[pollId] = maxChoices;
        emit MultiChoiceConfigured(pollId, maxChoices);
    }

    /**
     * @notice Validate multi-choice vote and record voter's selections
     * @dev Called by ElectionsManager after it has validated poll state, authorization, etc.
     * @param pollId Poll ID
     * @param voter Voter address
     * @param optionIds Array of option IDs selected
     * @param optionsCount Total options in the poll (for bounds checking)
     */
    function recordMultiChoiceVote(
        uint pollId,
        address voter,
        uint[] calldata optionIds,
        uint optionsCount
    ) external onlyElectionsManager {
        uint maxC = pollMaxChoices[pollId];
        if (!(maxC >= 2)) revert MultiChoiceNotEnabled();
        if (!(optionIds.length >= 1 && optionIds.length <= maxC)) revert InvalidChoiceCount();

        // Validate options and check for duplicates
        for (uint i = 0; i < optionIds.length; i++) {
            if (!(optionIds[i] > 0 && optionIds[i] <= optionsCount)) revert InvalidOption();
            for (uint j = 0; j < i; j++) {
                if (!(optionIds[i] != optionIds[j])) revert DuplicateOption();
            }
        }

        voterMultiChoices[pollId][voter] = optionIds;
    }

    /**
     * @notice Get voter's multi-choice selections
     * @param pollId Poll ID
     * @param voter Voter address
     * @return optionIds Array of chosen option IDs
     */
    function getVoterMultiChoices(uint pollId, address voter) external view returns (uint[] memory) {
        return voterMultiChoices[pollId][voter];
    }
}
