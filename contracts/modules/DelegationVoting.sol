// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

import "../VotingErrors.sol";

/**
 * @title DelegationVoting
 * @notice Module for vote delegation state management
 * @dev Lightweight contract that stores delegation mappings.
 *      All validation and core poll state updates are handled by ElectionsManager.
 */
contract DelegationVoting {
    // pollId => delegator => delegatee
    mapping(uint => mapping(address => address)) public voteDelegation;
    // pollId => delegatee => number of delegations received
    mapping(uint => mapping(address => uint)) public delegationCount;
    // pollId => voter => true if has delegated (cannot vote directly)
    mapping(uint => mapping(address => bool)) public hasDelegated;

    // Owner (ElectionsManager) who can call state-changing functions
    address public electionsManager;

    event VoteDelegated(uint indexed pollId, address indexed delegator, address indexed delegatee);
    event DelegationRemoved(uint indexed pollId, address indexed delegator, address indexed previousDelegatee);
    event VotedAsDelegate(uint indexed pollId, address indexed delegate, address indexed delegator, uint optionId);

    modifier onlyElectionsManager() {
        if (!(msg.sender == electionsManager)) revert Unauthorized();
        _;
    }

    constructor() {
        electionsManager = msg.sender;
    }

    /**
     * @notice Record a vote delegation
     * @dev Called by ElectionsManager after it validates poll state, authorization, etc.
     * @param pollId Poll ID
     * @param delegator Address of voter delegating
     * @param delegatee Address to delegate to
     */
    function recordDelegation(uint pollId, address delegator, address delegatee) external onlyElectionsManager {
        if (!(delegator != delegatee)) revert CannotSelfDelegate();
        if (hasDelegated[pollId][delegator]) revert AlreadyDelegated();
        if (hasDelegated[pollId][delegatee]) revert DelegateeAlreadyDelegated();

        voteDelegation[pollId][delegator] = delegatee;
        hasDelegated[pollId][delegator] = true;
        delegationCount[pollId][delegatee] += 1;

        emit VoteDelegated(pollId, delegator, delegatee);
    }

    /**
     * @notice Remove a vote delegation
     * @dev Called by ElectionsManager after it validates poll state.
     * @param pollId Poll ID
     * @param delegator Address of voter removing delegation
     */
    function removeDelegation(uint pollId, address delegator) external onlyElectionsManager {
        if (!(hasDelegated[pollId][delegator])) revert NoDelegation();

        address previousDelegatee = voteDelegation[pollId][delegator];
        voteDelegation[pollId][delegator] = address(0);
        hasDelegated[pollId][delegator] = false;
        if (delegationCount[pollId][previousDelegatee] > 0) {
            delegationCount[pollId][previousDelegatee] -= 1;
        }

        emit DelegationRemoved(pollId, delegator, previousDelegatee);
    }

    /**
     * @notice Record a delegate vote (emits event)
     * @param pollId Poll ID
     * @param delegate The delegate casting the vote
     * @param delegator The original voter who delegated
     * @param optionId Option voted for
     */
    function recordDelegateVote(uint pollId, address delegate, address delegator, uint optionId) external onlyElectionsManager {
        if (!(hasDelegated[pollId][delegator])) revert NoDelegation();
        if (!(voteDelegation[pollId][delegator] == delegate)) revert NotDelegatee();

        emit VotedAsDelegate(pollId, delegate, delegator, optionId);
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
        delegatee = voteDelegation[pollId][voter];
        isDelegated = hasDelegated[pollId][voter];
        delegationsReceived = delegationCount[pollId][voter];
    }
}
