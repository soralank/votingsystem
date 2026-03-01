import { BigInt } from "@graphprotocol/graph-ts";
import {
  VoteSponsoredWithToken,
  PaymasterFunded,
  PaymasterWithdrawn,
  RelayerWhitelisted,
  RelayerRemoved,
  RelayerWhitelistToggled,
} from "../generated/VotingPaymaster/VotingPaymaster";
import { GasSponsorship, PaymasterFunding, GlobalStats } from "../generated/schema";

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

// ─── Event Handlers ─────────────────────────────────────────

export function handleVoteSponsoredWithToken(
  event: VoteSponsoredWithToken
): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let sponsorship = new GasSponsorship(id);
  sponsorship.poll = event.params.pollId.toString();
  sponsorship.voter = event.params.voter;
  sponsorship.relayer = event.params.relayer;
  sponsorship.optionId = event.params.optionId;
  sponsorship.gasUsed = event.transaction.gasLimit;
  sponsorship.timestamp = event.block.timestamp;
  sponsorship.txHash = event.transaction.hash;
  sponsorship.save();

  // Update global stats
  let globalStats = getOrCreateGlobalStats();
  globalStats.totalGasSponsored = globalStats.totalGasSponsored.plus(
    BigInt.fromI32(1)
  );
  globalStats.save();
}

export function handlePaymasterFunded(event: PaymasterFunded): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let funding = new PaymasterFunding(id);
  funding.funder = event.params.funder;
  funding.amount = event.params.amount;
  funding.isFunding = true;
  funding.timestamp = event.block.timestamp;
  funding.txHash = event.transaction.hash;
  funding.save();
}

export function handlePaymasterWithdrawn(event: PaymasterWithdrawn): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();

  let funding = new PaymasterFunding(id);
  funding.funder = event.params.owner;
  funding.amount = event.params.amount;
  funding.isFunding = false;
  funding.timestamp = event.block.timestamp;
  funding.txHash = event.transaction.hash;
  funding.save();
}

export function handleRelayerWhitelisted(event: RelayerWhitelisted): void {
  // Relayer management events are tracked implicitly through
  // the VoteSponsoredWithToken events. No separate entity needed
  // unless you want a relayer registry.
}

export function handleRelayerRemoved(event: RelayerRemoved): void {
  // Same as above - tracked through sponsorship events
}

export function handleRelayerWhitelistToggled(
  event: RelayerWhitelistToggled
): void {
  // Configuration change - can be extended to store paymaster config
}
