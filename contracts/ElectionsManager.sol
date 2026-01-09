// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.20;

import "./Ownable.sol";

contract ElectionsManager is Ownable {
	// Option type (formerly Candidate)
	struct Option {
		uint id;
		string text;
		uint voteCount;
	}

	// Quiz type (formerly Election)
	struct Quiz {
		uint id;
		string question;
		address admin;
		uint startTime;
		uint endTime;
		bool ended;
		uint optionsCount;
		bool resultsRevealed;
		mapping(uint => Option) options;
		mapping(address => bool) voted;
		mapping(address => uint) votesBy;
	}

	// Storage
	mapping(uint => Quiz) private quizzes;
	uint public quizzesCount;

	// Events
	event Voted(uint indexed quizId, uint indexed optionId, address voter);
	event OptionAdded(uint indexed quizId, uint indexed optionId, string text);
	event QuizCreated(uint indexed quizId, string question, address indexed admin, uint startTime, uint endTime);
	event QuizEnded(uint indexed quizId);
	event ResultsRevealed(uint indexed quizId);

	// Only admin or contract owner
	modifier onlyAdminOrOwner(uint _quizId) {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		Quiz storage q = quizzes[_quizId];
		require(msg.sender == q.admin || msg.sender == owner, "Only quiz admin or owner allowed.");
		_;
	}

	// Create a new quiz (only contract owner). Duration is in seconds.
	function createQuiz(string memory _question, address _admin, uint _durationSeconds) public onlyOwner returns (uint) {
		require(_admin != address(0), "Admin cannot be zero address.");
		require(_durationSeconds > 0, "Duration must be > 0.");

		quizzesCount++;
		Quiz storage q = quizzes[quizzesCount];
		q.id = quizzesCount;
		q.question = _question;
		q.admin = _admin;
		q.startTime = block.timestamp;
		 // increase safety buffer so immediate subsequent txs don't see quiz as expired
		q.endTime = block.timestamp + _durationSeconds + 120;
		q.ended = false;
		q.optionsCount = 0;
		q.resultsRevealed = false;

		emit QuizCreated(q.id, _question, _admin, q.startTime, q.endTime);
		return q.id;
	}

	// Admin (or owner) can add an option to a specific quiz until it is explicitly ended
	function addOptionToQuiz(uint _quizId, string memory _text) public onlyAdminOrOwner(_quizId) {
		Quiz storage q = quizzes[_quizId];
		require(!q.ended, "Quiz ended; cannot add options.");

		q.optionsCount++;
		q.options[q.optionsCount] = Option(q.optionsCount, _text, 0);
		emit OptionAdded(_quizId, q.optionsCount, _text);
	}

	// Vote in a specific quiz (public, but single vote per address)
	function voteInQuiz(uint _quizId, uint _optionId) public {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		Quiz storage q = quizzes[_quizId];

		require(block.timestamp >= q.startTime, "Quiz has not started.");
		require(block.timestamp <= q.endTime, "Quiz time over.");
		require(!q.ended, "Quiz ended.");
		require(!q.voted[msg.sender], "You have already voted.");
		require(_optionId > 0 && _optionId <= q.optionsCount, "Invalid option id.");

		q.voted[msg.sender] = true;
		q.votesBy[msg.sender] = _optionId;
		q.options[_optionId].voteCount++;

		emit Voted(_quizId, _optionId, msg.sender);
	}

	// Anyone (admin/owner) can end a quiz after time passed; once ended it cannot be reopened
	function endQuiz(uint _quizId) public {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		Quiz storage q = quizzes[_quizId];
		require(msg.sender == q.admin || msg.sender == owner, "Only admin or owner can end quiz.");
		require(!q.ended, "Quiz already ended.");
		require(block.timestamp >= q.endTime, "Cannot end before end time.");

		q.ended = true;
		emit QuizEnded(_quizId);
	}

	// Admin or owner reveals results; once revealed, voter->choice lookup becomes visible to callers (or owner/admin)
	function revealResults(uint _quizId) public onlyAdminOrOwner(_quizId) {
		Quiz storage q = quizzes[_quizId];
		// allow reveal only after quiz end time or if the quiz was explicitly ended
		require(q.ended || block.timestamp >= q.endTime, "Cannot reveal before quiz end.");
		q.resultsRevealed = true;
		emit ResultsRevealed(_quizId);
	}

	// View helpers

	function getOption(uint _quizId, uint _optionId) public view returns (uint id, string memory text, uint voteCount) {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		Quiz storage q = quizzes[_quizId];
		require(_optionId > 0 && _optionId <= q.optionsCount, "Invalid option id.");
		Option storage o = q.options[_optionId];
		return (o.id, o.text, o.voteCount);
	}

	function getOptionsCount(uint _quizId) public view returns (uint) {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		return quizzes[_quizId].optionsCount;
	}

	// return the configured endTime for a quiz (useful for tests/clients)
	function getQuizEndTime(uint _quizId) public view returns (uint) {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		return quizzes[_quizId].endTime;
	}

	function hasVoted(uint _quizId, address _voter) public view returns (bool) {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		return quizzes[_quizId].voted[_voter];
	}

	function getVoterChoice(uint _quizId, address _voter) public view returns (uint) {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		Quiz storage q = quizzes[_quizId];
		require(q.resultsRevealed || msg.sender == owner || msg.sender == q.admin, "Results not revealed.");
		return q.votesBy[_voter];
	}

	function getTotalVotes(uint _quizId) public view returns (uint total) {
		require(_quizId > 0 && _quizId <= quizzesCount, "Invalid quiz id.");
		Quiz storage q = quizzes[_quizId];
		for (uint i = 1; i <= q.optionsCount; i++) {
			total += q.options[i].voteCount;
		}
	}

	// Internal helper to check ended state (if time passed we treat as ended for operations)
	function _isEnded(Quiz storage q) internal view returns (bool) {
		if (q.ended) return true;
		if (block.timestamp > q.endTime) return true;
		return false;
	}
}
