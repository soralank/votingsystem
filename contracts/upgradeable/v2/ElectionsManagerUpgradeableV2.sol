// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../v1/ElectionsManagerUpgradeable.sol";

/**
 * @title ElectionsManagerUpgradeable V2
 * @notice Upgraded version with new features
 * @dev Demonstrates safe upgrade with new functionality
 */
contract ElectionsManagerUpgradeableV2 is ElectionsManagerUpgradeable {
    string public constant VERSION_V2 = "2.0.0";

    // New state variables
    mapping(uint => string) public pollCategories;
    mapping(uint => mapping(address => uint)) public voteWeight;
    mapping(uint => bool) public pollPaused;
    mapping(uint => uint) public authorizedVoterCount;

    event PollCategorized(uint indexed pollId, string category);
    event VoteWeightSet(uint indexed pollId, address indexed voter, uint weight);
    event PollPaused(uint indexed pollId);
    event PollUnpaused(uint indexed pollId);
    event VoterCountUpdated(uint indexed pollId, uint count);
    event UpgradedToV2(string version);
    event WeightedVoteApplied(uint indexed pollId, address indexed voter, uint optionId, uint additionalVotes);

    function initializeV2() public reinitializer(2) {
        emit UpgradedToV2(VERSION_V2);
    }

    function setPollCategory(uint pollId, string calldata category) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        pollCategories[pollId] = category;
        emit PollCategorized(pollId, category);
    }

    function setVoteWeight(uint pollId, address voter, uint weight) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(block.timestamp < polls[pollId].startTime, "Cannot set weight after poll starts");
        require(weight > 0 && weight <= 10, "Weight must be between 1 and 10");
        require(authorizedVoters[pollId][voter], "Voter not authorized");

        voteWeight[pollId][voter] = weight;
        emit VoteWeightSet(pollId, voter, weight);
    }

    function pausePoll(uint pollId) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(block.timestamp < polls[pollId].endTime + 30, "Poll already ended");
        require(!pollPaused[pollId], "Poll already paused");

        pollPaused[pollId] = true;
        emit PollPaused(pollId);
    }

    function unpausePoll(uint pollId) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(pollPaused[pollId], "Poll not paused");

        pollPaused[pollId] = false;
        emit PollUnpaused(pollId);
    }

    /**
     * @notice Track authorized voter count for participation rate
     * @param pollId Poll ID
     * @param count Number of authorized voters
     */
    function setAuthorizedVoterCount(uint pollId, uint count) external onlyAdminOrOwner(pollId) {
        require(polls[pollId].exists, "Poll does not exist.");
        authorizedVoterCount[pollId] = count;
        emit VoterCountUpdated(pollId, count);
    }

    function voteInPoll(uint pollId, uint optionId) public override {
        require(!pollPaused[pollId], "Poll is paused");
        super.voteInPoll(pollId, optionId);

        uint weight = voteWeight[pollId][msg.sender];
        if (weight > 1) {
            uint additionalVotes = weight - 1;
            votesCount[pollId][optionId] += additionalVotes;
            polls[pollId].totalVotes += additionalVotes;
            emit WeightedVoteApplied(pollId, msg.sender, optionId, additionalVotes);
        }
    }

    /**
     * @notice Override token voting to enforce pause and apply vote weight (M-2/M-7 fix)
     */
    function voteInPollWithToken(uint256 pollId, uint256 optionId, address voter) public override {
        require(!pollPaused[pollId], "Poll is paused");
        super.voteInPollWithToken(pollId, optionId, voter);

        // Apply vote weight multiplier (same as voteInPoll)
        uint weight = voteWeight[pollId][voter];
        if (weight > 1) {
            uint additionalVotes = weight - 1;
            votesCount[pollId][optionId] += additionalVotes;
            polls[pollId].totalVotes += additionalVotes;
            emit WeightedVoteApplied(pollId, voter, optionId, additionalVotes);
        }
    }

    function getParticipationRate(uint pollId) external view returns (uint rate) {
        require(polls[pollId].exists, "Poll does not exist.");
        uint totalAuthorized = authorizedVoterCount[pollId];
        if (totalAuthorized == 0) return 0;
        return (polls[pollId].totalVotes * 100) / totalAuthorized;
    }

    function getVoteDiversity(uint pollId) public view returns (uint diversity) {
        require(polls[pollId].exists, "Poll does not exist.");
        require(polls[pollId].revealed, "Results not revealed");
        return _calcDiversity(pollId);
    }

    function _calcDiversity(uint pollId) internal view returns (uint) {
        if (polls[pollId].totalVotes == 0) return 0;
        if (polls[pollId].optionsCount == 0) return 0;

        uint optionsWithVotes = 0;
        for (uint i = 1; i <= polls[pollId].optionsCount; i++) {
            if (votesCount[pollId][i] > 0) {
                optionsWithVotes++;
            }
        }

        return (optionsWithVotes * 100) / polls[pollId].optionsCount;
    }

    function getPollStats(uint pollId) external view returns (
        uint totalVotes,
        uint participationRate,
        uint diversity,
        bool isPaused
    ) {
        require(polls[pollId].exists, "Poll does not exist.");

        totalVotes = polls[pollId].totalVotes;

        // Participation: safe to call always
        uint totalAuthorized = authorizedVoterCount[pollId];
        participationRate = totalAuthorized > 0 ? (totalVotes * 100) / totalAuthorized : 0;

        // Diversity: only available after reveal (0 if not yet revealed)
        diversity = polls[pollId].revealed ? _calcDiversity(pollId) : 0;

        isPaused = pollPaused[pollId];
    }

    function getPollsByCategory(string calldata category, uint maxResults) external view returns (uint[] memory pollIds) {
        uint[] memory tempIds = new uint[](maxResults);
        uint count = 0;

        for (uint i = 1; i <= pollsCount && count < maxResults; i++) {
            if (keccak256(bytes(pollCategories[i])) == keccak256(bytes(category))) {
                tempIds[count] = i;
                count++;
            }
        }

        pollIds = new uint[](count);
        for (uint i = 0; i < count; i++) {
            pollIds[i] = tempIds[i];
        }

        return pollIds;
    }

    function getVoteWeight(uint pollId, address voter) external view returns (uint weight) {
        uint w = voteWeight[pollId][voter];
        return w == 0 ? 1 : w;
    }

    function getVersion() external pure override returns (string memory) {
        return VERSION_V2;
    }

    uint256[45] private __gapV2;
}
