// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title VotingSystem
 * @dev A decentralized voting system demonstrating blockchain capabilities
 * @notice This contract allows creating elections, registering voters, and casting votes
 */
contract VotingSystem {
    
    // Structure to represent a candidate
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }
    
    // Structure to represent an election
    struct Election {
        uint256 id;
        string name;
        string description;
        uint256 startTime;
        uint256 endTime;
        bool exists;
        uint256 candidateCount;
        mapping(uint256 => Candidate) candidates;
        mapping(address => bool) hasVoted;
        mapping(address => bool) isRegistered;
    }
    
    // State variables
    address public owner;
    uint256 public electionCount;
    mapping(uint256 => Election) public elections;
    
    // Events
    event ElectionCreated(
        uint256 indexed electionId,
        string name,
        uint256 startTime,
        uint256 endTime
    );
    
    event CandidateAdded(
        uint256 indexed electionId,
        uint256 candidateId,
        string name
    );
    
    event VoterRegistered(
        uint256 indexed electionId,
        address indexed voter
    );
    
    event VoteCasted(
        uint256 indexed electionId,
        address indexed voter,
        uint256 candidateId
    );
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    modifier electionExists(uint256 _electionId) {
        require(elections[_electionId].exists, "Election does not exist");
        _;
    }
    
    modifier electionActive(uint256 _electionId) {
        require(
            block.timestamp >= elections[_electionId].startTime,
            "Election has not started yet"
        );
        require(
            block.timestamp <= elections[_electionId].endTime,
            "Election has ended"
        );
        _;
    }
    
    // Constructor
    constructor() {
        owner = msg.sender;
        electionCount = 0;
    }
    
    /**
     * @dev Create a new election
     * @param _name Name of the election
     * @param _description Description of the election
     * @param _durationInDays Duration of the election in days
     */
    function createElection(
        string memory _name,
        string memory _description,
        uint256 _durationInDays
    ) public onlyOwner returns (uint256) {
        require(bytes(_name).length > 0, "Election name cannot be empty");
        require(_durationInDays > 0, "Duration must be greater than 0");
        
        electionCount++;
        Election storage newElection = elections[electionCount];
        newElection.id = electionCount;
        newElection.name = _name;
        newElection.description = _description;
        newElection.startTime = block.timestamp;
        newElection.endTime = block.timestamp + (_durationInDays * 1 days);
        newElection.exists = true;
        newElection.candidateCount = 0;
        
        emit ElectionCreated(
            electionCount,
            _name,
            newElection.startTime,
            newElection.endTime
        );
        
        return electionCount;
    }
    
    /**
     * @dev Add a candidate to an election
     * @param _electionId ID of the election
     * @param _name Name of the candidate
     */
    function addCandidate(uint256 _electionId, string memory _name)
        public
        onlyOwner
        electionExists(_electionId)
    {
        require(bytes(_name).length > 0, "Candidate name cannot be empty");
        require(
            block.timestamp < elections[_electionId].startTime,
            "Cannot add candidates after election starts"
        );
        
        Election storage election = elections[_electionId];
        election.candidateCount++;
        
        election.candidates[election.candidateCount] = Candidate({
            id: election.candidateCount,
            name: _name,
            voteCount: 0
        });
        
        emit CandidateAdded(_electionId, election.candidateCount, _name);
    }
    
    /**
     * @dev Register a voter for an election
     * @param _electionId ID of the election
     * @param _voter Address of the voter to register
     */
    function registerVoter(uint256 _electionId, address _voter)
        public
        onlyOwner
        electionExists(_electionId)
    {
        require(_voter != address(0), "Invalid voter address");
        require(
            !elections[_electionId].isRegistered[_voter],
            "Voter already registered"
        );
        
        elections[_electionId].isRegistered[_voter] = true;
        emit VoterRegistered(_electionId, _voter);
    }
    
    /**
     * @dev Cast a vote for a candidate
     * @param _electionId ID of the election
     * @param _candidateId ID of the candidate to vote for
     */
    function vote(uint256 _electionId, uint256 _candidateId)
        public
        electionExists(_electionId)
        electionActive(_electionId)
    {
        Election storage election = elections[_electionId];
        
        require(
            election.isRegistered[msg.sender],
            "You are not registered to vote in this election"
        );
        require(
            !election.hasVoted[msg.sender],
            "You have already voted in this election"
        );
        require(
            _candidateId > 0 && _candidateId <= election.candidateCount,
            "Invalid candidate ID"
        );
        
        election.hasVoted[msg.sender] = true;
        election.candidates[_candidateId].voteCount++;
        
        emit VoteCasted(_electionId, msg.sender, _candidateId);
    }
    
    /**
     * @dev Get election details
     * @param _electionId ID of the election
     */
    function getElection(uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (
            uint256 id,
            string memory name,
            string memory description,
            uint256 startTime,
            uint256 endTime,
            uint256 candidateCount
        )
    {
        Election storage election = elections[_electionId];
        return (
            election.id,
            election.name,
            election.description,
            election.startTime,
            election.endTime,
            election.candidateCount
        );
    }
    
    /**
     * @dev Get candidate details
     * @param _electionId ID of the election
     * @param _candidateId ID of the candidate
     */
    function getCandidate(uint256 _electionId, uint256 _candidateId)
        public
        view
        electionExists(_electionId)
        returns (
            uint256 id,
            string memory name,
            uint256 voteCount
        )
    {
        require(
            _candidateId > 0 && _candidateId <= elections[_electionId].candidateCount,
            "Invalid candidate ID"
        );
        
        Candidate storage candidate = elections[_electionId].candidates[_candidateId];
        return (candidate.id, candidate.name, candidate.voteCount);
    }
    
    /**
     * @dev Check if an address has voted in an election
     * @param _electionId ID of the election
     * @param _voter Address of the voter
     */
    function hasVoted(uint256 _electionId, address _voter)
        public
        view
        electionExists(_electionId)
        returns (bool)
    {
        return elections[_electionId].hasVoted[_voter];
    }
    
    /**
     * @dev Check if an address is registered for an election
     * @param _electionId ID of the election
     * @param _voter Address to check
     */
    function isRegisteredVoter(uint256 _electionId, address _voter)
        public
        view
        electionExists(_electionId)
        returns (bool)
    {
        return elections[_electionId].isRegistered[_voter];
    }
    
    /**
     * @dev Get the winner of an election
     * @param _electionId ID of the election
     */
    function getWinner(uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (uint256 winnerId, string memory winnerName, uint256 winningVoteCount)
    {
        require(
            block.timestamp > elections[_electionId].endTime,
            "Election is still ongoing"
        );
        
        Election storage election = elections[_electionId];
        uint256 maxVotes = 0;
        uint256 winningCandidateId = 0;
        
        for (uint256 i = 1; i <= election.candidateCount; i++) {
            if (election.candidates[i].voteCount > maxVotes) {
                maxVotes = election.candidates[i].voteCount;
                winningCandidateId = i;
            }
        }
        
        if (winningCandidateId > 0) {
            return (
                winningCandidateId,
                election.candidates[winningCandidateId].name,
                maxVotes
            );
        } else {
            return (0, "No winner", 0);
        }
    }
}
