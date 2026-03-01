import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  PollCreated,
  OptionAdded,
  Voted,
  VotedMultiChoice,
  VotedQuadratic,
  VoteDelegated,
  DelegationRemoved,
  VotedAsDelegate,
  ResultsRevealed,
  VoterAuthorized,
  VoterUnauthorized,
  PollMetadataSet,
  MultiChoiceConfigured,
  QuadraticVotingEnabled,
} from "../generated/ElectionsManager/ElectionsManager";
import {
  Poll,
  Option,
  Vote,
  Voter,
  Delegation,
  PollStats,
  GlobalStats,
} from "../generated/schema";

// ─── Helpers ────────────────────────────────────────────────

function getOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("global");
  if (!stats) {
    stats = new GlobalStats("global");
    stats.totalPolls = BigInt.zero();
    stats.totalVotes = BigInt.zero();
    stats.totalVoters = BigInt.zero();
    stats.totalGasSponsored = BigInt.zero();
  }
  return stats;
}

function getOrCreatePollStats(pollId: string): PollStats {
  let stats = PollStats.load(pollId);
  if (!stats) {
    stats = new PollStats(pollId);
    stats.totalVotersAuthorized = BigInt.zero();
    stats.totalVotesCast = BigInt.zero();
    stats.gasVotes = BigInt.zero();
    stats.tokenVotes = BigInt.zero();
    stats.quadraticVotes = BigInt.zero();
    stats.multiChoiceVotes = BigInt.zero();
    stats.delegatedVotes = BigInt.zero();
    stats.totalDelegations = BigInt.zero();
    stats.totalTokensAllocated = BigInt.zero();
    stats.totalTokensBurned = BigInt.zero();
  }
  return stats;
}

function getOrCreateVoter(pollId: string, address: Bytes): Voter {
  let id = pollId + "-" + address.toHexString();
  let voter = Voter.load(id);
  if (!voter) {
    voter = new Voter(id);
    voter.poll = pollId;
    voter.address = address;
    voter.authorized = false;
    voter.hasVoted = false;
    voter.hasDelegated = false;
    voter.delegationsReceived = BigInt.zero();
    voter.tokenBalance = BigInt.zero();
    voter.tokensAllocated = BigInt.zero();
    voter.tokensBurned = BigInt.zero();
  }
  return voter;
}

// ─── Event Handlers ─────────────────────────────────────────

export function handlePollCreated(event: PollCreated): void {
  let pollId = event.params.pollId.toString();

  let poll = new Poll(pollId);
  poll.title = event.params.title;
  poll.admin = event.params.admin;
  poll.startTime = event.params.startTime;
  poll.endTime = event.params.endTime;
  poll.tokenVotingEnabled = event.params.tokenVotingEnabled;
  poll.tokenVotingRequired = event.params.tokenVotingRequired;
  poll.quadraticVotingEnabled = false;
  poll.maxChoices = 0;
  poll.revealed = false;
  poll.ended = false;
  poll.totalVotes = BigInt.zero();
  poll.createdAt = event.block.timestamp;
  poll.createdTx = event.transaction.hash;
  poll.save();

  // Update global stats
  let globalStats = getOrCreateGlobalStats();
  globalStats.totalPolls = globalStats.totalPolls.plus(BigInt.fromI32(1));
  globalStats.save();

  // Initialize poll stats
  let pollStats = getOrCreatePollStats(pollId);
  pollStats.save();
}

export function handleOptionAdded(event: OptionAdded): void {
  let pollId = event.params.pollId.toString();
  let optionId = event.params.optionId.toString();
  let id = pollId + "-" + optionId;

  let option = new Option(id);
  option.poll = pollId;
  option.optionId = event.params.optionId;
  option.name = event.params.name;
  option.voteCount = BigInt.zero();
  option.save();
}

export function handleVoted(event: Voted): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let vote = new Vote(id);
  vote.poll = event.params.pollId.toString();
  vote.voter = event.params.voter;
  vote.optionId = event.params.optionId;
  vote.method = event.params.method === 0 ? "GasPayment" : "Token";
  vote.isQuadratic = false;
  vote.isMultiChoice = false;
  vote.isDelegated = false;
  vote.timestamp = event.block.timestamp;
  vote.txHash = event.transaction.hash;
  vote.save();

  // Update option vote count
  let optionEntityId =
    event.params.pollId.toString() + "-" + event.params.optionId.toString();
  let option = Option.load(optionEntityId);
  if (option) {
    option.voteCount = option.voteCount.plus(BigInt.fromI32(1));
    option.save();
  }

  // Update poll stats
  let pollId = event.params.pollId.toString();
  let poll = Poll.load(pollId);
  if (poll) {
    poll.totalVotes = poll.totalVotes.plus(BigInt.fromI32(1));
    poll.save();
  }

  let pollStats = getOrCreatePollStats(pollId);
  pollStats.totalVotesCast = pollStats.totalVotesCast.plus(BigInt.fromI32(1));
  if (event.params.method === 0) {
    pollStats.gasVotes = pollStats.gasVotes.plus(BigInt.fromI32(1));
  } else {
    pollStats.tokenVotes = pollStats.tokenVotes.plus(BigInt.fromI32(1));
  }
  pollStats.save();

  // Update voter
  let voter = getOrCreateVoter(pollId, event.params.voter);
  voter.hasVoted = true;
  voter.save();

  // Update global stats
  let globalStats = getOrCreateGlobalStats();
  globalStats.totalVotes = globalStats.totalVotes.plus(BigInt.fromI32(1));
  globalStats.save();
}

export function handleVotedMultiChoice(event: VotedMultiChoice): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let vote = new Vote(id);
  vote.poll = event.params.pollId.toString();
  vote.voter = event.params.voter;
  vote.optionIds = event.params.optionIds;
  vote.method = event.params.method === 0 ? "GasPayment" : "Token";
  vote.isQuadratic = false;
  vote.isMultiChoice = true;
  vote.isDelegated = false;
  vote.timestamp = event.block.timestamp;
  vote.txHash = event.transaction.hash;
  vote.save();

  // Update poll stats
  let pollId = event.params.pollId.toString();
  let pollStats = getOrCreatePollStats(pollId);
  pollStats.multiChoiceVotes = pollStats.multiChoiceVotes.plus(
    BigInt.fromI32(1)
  );
  pollStats.save();
}

export function handleVotedQuadratic(event: VotedQuadratic): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let vote = new Vote(id);
  vote.poll = event.params.pollId.toString();
  vote.voter = event.params.voter;
  vote.optionIds = event.params.optionIds;
  vote.voteAmounts = event.params.voteAmounts;
  vote.method = "Token";
  vote.isQuadratic = true;
  vote.isMultiChoice = false;
  vote.isDelegated = false;
  vote.quadraticCost = event.params.totalCost;
  vote.timestamp = event.block.timestamp;
  vote.txHash = event.transaction.hash;
  vote.save();

  // Update poll stats
  let pollId = event.params.pollId.toString();
  let pollStats = getOrCreatePollStats(pollId);
  pollStats.quadraticVotes = pollStats.quadraticVotes.plus(BigInt.fromI32(1));
  pollStats.save();
}

export function handleVoteDelegated(event: VoteDelegated): void {
  let pollId = event.params.pollId.toString();
  let delegatorAddr = event.params.delegator;
  let id = pollId + "-" + delegatorAddr.toHexString();

  let delegation = new Delegation(id);
  delegation.poll = pollId;
  delegation.delegator = delegatorAddr;
  delegation.delegatee = event.params.delegatee;
  delegation.active = true;
  delegation.createdAt = event.block.timestamp;
  delegation.save();

  // Update voters
  let delegator = getOrCreateVoter(pollId, delegatorAddr);
  delegator.hasDelegated = true;
  delegator.delegatee = event.params.delegatee;
  delegator.save();

  let delegatee = getOrCreateVoter(pollId, event.params.delegatee);
  delegatee.delegationsReceived = delegatee.delegationsReceived.plus(
    BigInt.fromI32(1)
  );
  delegatee.save();

  // Update poll stats
  let pollStats = getOrCreatePollStats(pollId);
  pollStats.totalDelegations = pollStats.totalDelegations.plus(
    BigInt.fromI32(1)
  );
  pollStats.save();
}

export function handleDelegationRemoved(event: DelegationRemoved): void {
  let pollId = event.params.pollId.toString();
  let delegatorAddr = event.params.delegator;
  let id = pollId + "-" + delegatorAddr.toHexString();

  let delegation = Delegation.load(id);
  if (delegation) {
    delegation.active = false;
    delegation.removedAt = event.block.timestamp;
    delegation.save();
  }

  // Update voter
  let delegator = getOrCreateVoter(pollId, delegatorAddr);
  delegator.hasDelegated = false;
  delegator.delegatee = null;
  delegator.save();

  let delegatee = getOrCreateVoter(
    pollId,
    event.params.previousDelegatee
  );
  delegatee.delegationsReceived = delegatee.delegationsReceived.minus(
    BigInt.fromI32(1)
  );
  delegatee.save();
}

export function handleVotedAsDelegate(event: VotedAsDelegate): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let vote = new Vote(id);
  vote.poll = event.params.pollId.toString();
  vote.voter = event.params.delegator;
  vote.optionId = event.params.optionId;
  vote.method = "GasPayment";
  vote.isQuadratic = false;
  vote.isMultiChoice = false;
  vote.isDelegated = true;
  vote.delegate = event.params.delegate;
  vote.timestamp = event.block.timestamp;
  vote.txHash = event.transaction.hash;
  vote.save();

  // Update poll stats
  let pollId = event.params.pollId.toString();
  let pollStats = getOrCreatePollStats(pollId);
  pollStats.delegatedVotes = pollStats.delegatedVotes.plus(BigInt.fromI32(1));
  pollStats.save();
}

export function handleResultsRevealed(event: ResultsRevealed): void {
  let pollId = event.params.pollId.toString();
  let poll = Poll.load(pollId);
  if (poll) {
    poll.revealed = true;
    poll.save();
  }
}

export function handleVoterAuthorized(event: VoterAuthorized): void {
  let pollId = event.params.pollId.toString();
  let voter = getOrCreateVoter(pollId, event.params.voter);
  voter.authorized = true;
  voter.save();

  let pollStats = getOrCreatePollStats(pollId);
  pollStats.totalVotersAuthorized = pollStats.totalVotersAuthorized.plus(
    BigInt.fromI32(1)
  );
  pollStats.save();

  let globalStats = getOrCreateGlobalStats();
  globalStats.totalVoters = globalStats.totalVoters.plus(BigInt.fromI32(1));
  globalStats.save();
}

export function handleVoterUnauthorized(event: VoterUnauthorized): void {
  let pollId = event.params.pollId.toString();
  let voter = getOrCreateVoter(pollId, event.params.voter);
  voter.authorized = false;
  voter.save();

  let pollStats = getOrCreatePollStats(pollId);
  pollStats.totalVotersAuthorized = pollStats.totalVotersAuthorized.minus(
    BigInt.fromI32(1)
  );
  pollStats.save();
}

export function handlePollMetadataSet(event: PollMetadataSet): void {
  let pollId = event.params.pollId.toString();
  let poll = Poll.load(pollId);
  if (poll) {
    poll.metadataURI = event.params.metadataURI;
    poll.save();
  }
}

export function handleMultiChoiceConfigured(
  event: MultiChoiceConfigured
): void {
  let pollId = event.params.pollId.toString();
  let poll = Poll.load(pollId);
  if (poll) {
    poll.maxChoices = event.params.maxChoices.toI32();
    poll.save();
  }
}

export function handleQuadraticVotingEnabled(
  event: QuadraticVotingEnabled
): void {
  let pollId = event.params.pollId.toString();
  let poll = Poll.load(pollId);
  if (poll) {
    poll.quadraticVotingEnabled = true;
    poll.save();
  }
}
