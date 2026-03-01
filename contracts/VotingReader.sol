// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

import "./VotingErrors.sol";

/**
 * @title IElectionsManagerReader
 * @notice Minimal interface to read ElectionsManager state and module addresses
 */
interface IElectionsManagerReader {
    // Module address getters (auto-generated from public vars)
    function quadraticVoting() external view returns (address);
    function multiChoiceVoting() external view returns (address);
    function delegationVoting() external view returns (address);
    function metadataVoting() external view returns (address);

    // Core poll state
    function getPollsCount() external view returns (uint);
    function getOptionsCount(uint pollId) external view returns (uint);
    function getOption(uint pollId, uint optionId) external view returns (uint, string memory, uint);
    function getTotalVotes(uint pollId) external view returns (uint);
    function getVoterChoice(uint pollId, address voter) external view returns (uint);
    function getPollEndTime(uint pollId) external view returns (uint);
    function getPollStartTime(uint pollId) external view returns (uint);
    function isVoterAuthorized(uint pollId, address voter) external view returns (bool);
    function isPollActive(uint pollId) external view returns (bool);
    function isPollStarted(uint pollId) external view returns (bool);
    function isPollEnded(uint pollId) external view returns (bool);
    function hasVoted(uint pollId, address voter) external view returns (bool);
    function secretBallot(uint pollId) external view returns (bool);
    function delegationEnabled(uint pollId) external view returns (bool);
    function getPollStatus(uint pollId) external view returns (bool started, bool active, bool ended, bool revealed);
    function getWinner(uint pollId) external view returns (uint, string memory, uint);

    // Token-related
    function hasVotedWithToken(uint pollId, address voter) external view returns (bool);
    function pollTokenManager(uint pollId) external view returns (address);
}

/**
 * @title IQuadraticVotingReader
 * @notice Interface for reading QuadraticVoting module state
 */
interface IQuadraticVotingReader {
    function quadraticVotingEnabled(uint pollId) external view returns (bool);
    function quadraticVoteAllocation(uint pollId, address voter, uint optionId) external view returns (uint);
    function quadraticTokensSpent(uint pollId, address voter) external view returns (uint);
}

/**
 * @title IMultiChoiceVotingReader
 * @notice Interface for reading MultiChoiceVoting module state
 */
interface IMultiChoiceVotingReader {
    function pollMaxChoices(uint pollId) external view returns (uint);
    function getVoterMultiChoices(uint pollId, address voter) external view returns (uint[] memory);
}

/**
 * @title IDelegationVotingReader
 * @notice Interface for reading DelegationVoting module state
 */
interface IDelegationVotingReader {
    function voteDelegation(uint pollId, address voter) external view returns (address);
    function delegationCount(uint pollId, address voter) external view returns (uint);
    function hasDelegated(uint pollId, address voter) external view returns (bool);
    function getDelegationInfo(uint pollId, address voter) external view returns (address, bool, uint);
}

/**
 * @title IMetadataVotingReader
 * @notice Interface for reading MetadataVoting module state
 */
interface IMetadataVotingReader {
    function getPollMetadata(uint pollId) external view returns (string memory);
}

/**
 * @title ITokenManagerReader
 * @notice Interface for reading TokenManager state
 */
interface ITokenManagerReader {
    function getTokenBalance(uint pollId, address voter) external view returns (uint);
    function pollTokens(uint pollId) external view returns (address);
}

/**
 * @title VotingReader
 * @notice Read-only helper contract that aggregates queries across ElectionsManager and its modules
 * @dev Deployed alongside the voting system to give frontends a single entry point for:
 *      - Quadratic voting status (isQuadraticVotingEnabled)
 *      - Multi-choice poll config (getPollMaxChoices)
 *      - Delegation status (isDelegated, getDelegationInfo)
 *      - Aggregated poll info (getFullPollInfo)
 *
 *      This contract holds NO state and makes only external view calls.
 *      It exists because ElectionsManager is at the 24KB contract size limit.
 */
contract VotingReader {
    IElectionsManagerReader public immutable electionsManager;

    constructor(address _electionsManager) {
        if (!(_electionsManager != address(0))) revert ZeroAddress();
        electionsManager = IElectionsManagerReader(_electionsManager);
    }

    // ══════════════════════════════════════════════════════════════
    //  QUADRATIC VOTING QUERIES
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Check if quadratic voting is enabled for a poll
     * @param pollId Poll ID
     * @return enabled Whether quadratic voting is active
     */
    function isQuadraticVotingEnabled(uint pollId) external view returns (bool) {
        return IQuadraticVotingReader(electionsManager.quadraticVoting())
            .quadraticVotingEnabled(pollId);
    }

    /**
     * @notice Get quadratic vote allocation for a voter on a specific option
     * @param pollId Poll ID
     * @param voter Voter address
     * @param optionId Option ID
     * @return votes Number of quadratic votes allocated
     */
    function getQuadraticVoteAllocation(uint pollId, address voter, uint optionId) external view returns (uint) {
        return IQuadraticVotingReader(electionsManager.quadraticVoting())
            .quadraticVoteAllocation(pollId, voter, optionId);
    }

    /**
     * @notice Get total quadratic tokens spent by a voter
     * @param pollId Poll ID
     * @param voter Voter address
     * @return tokens Total tokens consumed by quadratic voting
     */
    function getQuadraticTokensSpent(uint pollId, address voter) external view returns (uint) {
        return IQuadraticVotingReader(electionsManager.quadraticVoting())
            .quadraticTokensSpent(pollId, voter);
    }

    // ══════════════════════════════════════════════════════════════
    //  MULTI-CHOICE QUERIES
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Get maximum choices allowed for a multi-choice poll
     * @param pollId Poll ID
     * @return maxChoices Maximum selectable options (0 = not configured / single-choice)
     */
    function getPollMaxChoices(uint pollId) external view returns (uint) {
        return IMultiChoiceVotingReader(electionsManager.multiChoiceVoting())
            .pollMaxChoices(pollId);
    }

    /**
     * @notice Check if a poll has multi-choice voting configured
     * @param pollId Poll ID
     * @return enabled Whether multi-choice is enabled (maxChoices >= 2)
     */
    function isMultiChoiceEnabled(uint pollId) external view returns (bool) {
        return IMultiChoiceVotingReader(electionsManager.multiChoiceVoting())
            .pollMaxChoices(pollId) >= 2;
    }

    // ══════════════════════════════════════════════════════════════
    //  DELEGATION QUERIES
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Check if delegation is enabled for a poll
     * @param pollId Poll ID
     * @return enabled Whether delegation is active for this poll
     */
    function isDelegationEnabled(uint pollId) external view returns (bool) {
        return electionsManager.delegationEnabled(pollId);
    }

    /**
     * @notice Check if a voter has delegated their vote
     * @param pollId Poll ID
     * @param voter Voter address
     * @return delegated Whether the voter has delegated
     */
    function isDelegated(uint pollId, address voter) external view returns (bool) {
        return IDelegationVotingReader(electionsManager.delegationVoting())
            .hasDelegated(pollId, voter);
    }

    /**
     * @notice Get the delegatee for a voter
     * @param pollId Poll ID
     * @param voter Voter address
     * @return delegatee Address the voter delegated to (address(0) if none)
     */
    function getDelegatee(uint pollId, address voter) external view returns (address) {
        return IDelegationVotingReader(electionsManager.delegationVoting())
            .voteDelegation(pollId, voter);
    }

    /**
     * @notice Get number of delegations received by an address
     * @param pollId Poll ID
     * @param delegatee Address to check
     * @return count Number of delegations received
     */
    function getDelegationCount(uint pollId, address delegatee) external view returns (uint) {
        return IDelegationVotingReader(electionsManager.delegationVoting())
            .delegationCount(pollId, delegatee);
    }

    /**
     * @notice Get full delegation info for a voter (convenience)
     * @param pollId Poll ID
     * @param voter Voter address
     * @return delegatee Who the voter delegated to
     * @return hasDelegatedVote Whether delegation is active
     * @return delegationsReceived How many delegations this voter received
     */
    function getFullDelegationInfo(uint pollId, address voter) external view returns (
        address delegatee,
        bool hasDelegatedVote,
        uint delegationsReceived
    ) {
        return IDelegationVotingReader(electionsManager.delegationVoting())
            .getDelegationInfo(pollId, voter);
    }

    // ══════════════════════════════════════════════════════════════
    //  METADATA QUERIES
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Get IPFS metadata URI for a poll
     * @param pollId Poll ID
     * @return metadataURI The IPFS URI string
     */
    function getPollMetadata(uint pollId) external view returns (string memory) {
        return IMetadataVotingReader(electionsManager.metadataVoting())
            .getPollMetadata(pollId);
    }

    // ══════════════════════════════════════════════════════════════
    //  AGGREGATED POLL INFO
    // ══════════════════════════════════════════════════════════════

    /**
     * @notice Get comprehensive poll feature flags in a single call
     * @param pollId Poll ID
     * @return isQuadratic Whether quadratic voting is enabled
     * @return maxChoices Max multi-choice selections (0 = single-choice)
     * @return isDelegation Whether delegation is enabled
     * @return isSecret Whether secret ballot is enabled
     * @return started Whether the poll has started
     * @return active Whether the poll is currently active
     * @return ended Whether the poll has ended
     * @return revealed Whether results have been revealed
     */
    function getPollFeatures(uint pollId) external view returns (
        bool isQuadratic,
        uint maxChoices,
        bool isDelegation,
        bool isSecret,
        bool started,
        bool active,
        bool ended,
        bool revealed
    ) {
        isQuadratic = IQuadraticVotingReader(electionsManager.quadraticVoting())
            .quadraticVotingEnabled(pollId);
        maxChoices = IMultiChoiceVotingReader(electionsManager.multiChoiceVoting())
            .pollMaxChoices(pollId);
        isDelegation = electionsManager.delegationEnabled(pollId);
        isSecret = electionsManager.secretBallot(pollId);
        (started, active, ended, revealed) = electionsManager.getPollStatus(pollId);
    }

    /**
     * @notice Get voter's full status for a poll in a single call
     * @param pollId Poll ID
     * @param voter Voter address
     * @return authorized Whether voter is authorized
     * @return voted Whether voter has already voted
     * @return delegated Whether voter has delegated their vote
     * @return delegatee Address delegated to (address(0) if none)
     * @return votedWithToken Whether voter used token-based voting
     */
    function getVoterStatus(uint pollId, address voter) external view returns (
        bool authorized,
        bool voted,
        bool delegated,
        address delegatee,
        bool votedWithToken
    ) {
        authorized = electionsManager.isVoterAuthorized(pollId, voter);
        voted = electionsManager.hasVoted(pollId, voter);
        delegated = IDelegationVotingReader(electionsManager.delegationVoting())
            .hasDelegated(pollId, voter);
        delegatee = IDelegationVotingReader(electionsManager.delegationVoting())
            .voteDelegation(pollId, voter);
        votedWithToken = electionsManager.hasVotedWithToken(pollId, voter);
    }
}
