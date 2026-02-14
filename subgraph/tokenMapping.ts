import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  PollTokenCreated,
  TokensAllocated,
  TokensBurnedForVote,
  TokensBurned,
} from "../generated/TokenManager/TokenManager";
import {
  PollToken,
  TokenAllocation,
  TokenBurn,
  PollStats,
  Voter,
} from "../generated/schema";

// ─── Helpers ────────────────────────────────────────────────

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

export function handlePollTokenCreated(event: PollTokenCreated): void {
  let pollId = event.params.pollId.toString();
  let id = pollId;

  let pollToken = new PollToken(id);
  pollToken.poll = pollId;
  pollToken.tokenAddress = event.params.tokenAddress;
  pollToken.name = event.params.name;
  pollToken.symbol = event.params.symbol;
  pollToken.totalSupply = BigInt.zero();
  pollToken.totalBurned = BigInt.zero();
  pollToken.createdAt = event.block.timestamp;
  pollToken.save();
}

export function handleTokensAllocated(event: TokensAllocated): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let allocation = new TokenAllocation(id);
  allocation.poll = event.params.pollId.toString();
  allocation.voter = event.params.voter;
  allocation.amount = event.params.amount;
  allocation.timestamp = event.block.timestamp;
  allocation.txHash = event.transaction.hash;
  allocation.save();

  // Update PollToken total supply
  let pollId = event.params.pollId.toString();
  let pollToken = PollToken.load(pollId);
  if (pollToken) {
    pollToken.totalSupply = pollToken.totalSupply.plus(event.params.amount);
    pollToken.save();
  }

  // Update voter token balance
  let voter = getOrCreateVoter(pollId, event.params.voter);
  voter.tokenBalance = voter.tokenBalance.plus(event.params.amount);
  voter.tokensAllocated = voter.tokensAllocated.plus(event.params.amount);
  voter.save();

  // Update poll stats
  let pollStats = getOrCreatePollStats(pollId);
  pollStats.totalTokensAllocated = pollStats.totalTokensAllocated.plus(
    event.params.amount
  );
  pollStats.save();
}

export function handleTokensBurnedForVote(event: TokensBurnedForVote): void {
  let pollId = event.params.pollId.toString();

  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let burn = new TokenBurn(id);
  burn.poll = pollId;
  burn.voter = event.params.voter;
  burn.amount = BigInt.fromI32(1);
  burn.isQuadratic = false;
  burn.timestamp = event.block.timestamp;
  burn.txHash = event.transaction.hash;
  burn.save();

  // Update PollToken burned count
  let pollToken = PollToken.load(pollId);
  if (pollToken) {
    pollToken.totalBurned = pollToken.totalBurned.plus(BigInt.fromI32(1));
    pollToken.save();
  }

  // Update voter token balance
  let voter = getOrCreateVoter(pollId, event.params.voter);
  voter.tokenBalance = voter.tokenBalance.minus(BigInt.fromI32(1));
  voter.tokensBurned = voter.tokensBurned.plus(BigInt.fromI32(1));
  voter.save();

  // Update poll stats
  let pollStats = getOrCreatePollStats(pollId);
  pollStats.totalTokensBurned = pollStats.totalTokensBurned.plus(
    BigInt.fromI32(1)
  );
  pollStats.save();
}

export function handleTokensBurned(event: TokensBurned): void {
  let pollId = event.params.pollId.toString();

  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let burn = new TokenBurn(id);
  burn.poll = pollId;
  burn.voter = event.params.voter;
  burn.amount = event.params.amount;
  burn.isQuadratic = true;
  burn.timestamp = event.block.timestamp;
  burn.txHash = event.transaction.hash;
  burn.save();

  // Update PollToken burned count
  let pollToken = PollToken.load(pollId);
  if (pollToken) {
    pollToken.totalBurned = pollToken.totalBurned.plus(event.params.amount);
    pollToken.save();
  }

  // Update voter token balance
  let voter = getOrCreateVoter(pollId, event.params.voter);
  voter.tokenBalance = voter.tokenBalance.minus(event.params.amount);
  voter.tokensBurned = voter.tokensBurned.plus(event.params.amount);
  voter.save();

  // Update poll stats
  let pollStats = getOrCreatePollStats(pollId);
  pollStats.totalTokensBurned = pollStats.totalTokensBurned.plus(
    event.params.amount
  );
  pollStats.save();
}
