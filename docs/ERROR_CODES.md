# Error Code Reference — Voting System v4.2

Contact: ankit.soral@outlook.com

Authoritative reference for all custom errors emitted by the voting system smart contracts. All errors are defined as file-level custom errors in `contracts/VotingErrors.sol` and use Solidity's 4-byte selector encoding for gas-efficient revert data.

> **Migration Note (v4.2):** All `require(condition, "string")` patterns have been replaced with `if (!(condition)) revert CustomError()`. Error selectors are ABI-encoded and can be decoded by ethers.js v6, viem, or any ABI-aware library.

## Table of Contents

1. [Decoding Custom Errors](#decoding-custom-errors)
2. [Poll Management Errors](#poll-management-errors)
3. [Voter Authorization Errors](#voter-authorization-errors)
4. [Voting Errors](#voting-errors)
5. [Token Management Errors](#token-management-errors)
6. [Gasless Voting Errors](#gasless-voting-errors)
7. [Access Control Errors](#access-control-errors)
8. [Time Validation Errors](#time-validation-errors)
9. [General Validation Errors](#general-validation-errors)
10. [Delegation Errors](#delegation-errors)
11. [Secret Ballot Errors](#secret-ballot-errors)
12. [Franchise Errors](#franchise-errors)
13. [Multi-Choice & Quadratic Errors](#multi-choice--quadratic-errors)
14. [Metadata Errors](#metadata-errors)
15. [Upgradeable V2 Errors](#upgradeable-v2-errors)

---

## Decoding Custom Errors

Custom errors are returned as 4-byte selectors in the revert data. Frontends and API layers decode them against the contract ABI.

### ethers.js v6

```typescript
import { Contract } from "ethers";

try {
  await contract.voteInPoll(pollId, optionId);
} catch (error: any) {
  // ethers.js v6 automatically parses custom errors
  const errorName = error.revert?.name;  // e.g., "AlreadyVoted"
  const errorArgs = error.revert?.args;  // e.g., [] (parameterless)

  switch (errorName) {
    case "AlreadyVoted":
      showToast("You have already voted in this poll.");
      break;
    case "PollNotActive":
      showToast("This poll is not currently accepting votes.");
      break;
    case "NotVoter":
      showToast("You are not authorized to vote in this poll.");
      break;
    default:
      showToast(`Transaction failed: ${errorName}`);
  }
}
```

### Hardhat Tests

```typescript
await expect(
  contract.voteInPoll(pollId, optionId)
).to.be.revertedWithCustomError(contract, "AlreadyVoted");
```

---

## Poll Management Errors

### `PollNotFound`
- **When**: Attempting operations on a non-existent poll ID
- **Frontend Action**: Display "Poll not found" message, redirect to polls list
- **HTTP Status**: 404

### `DuplicateTitle`
- **When**: Creating a poll with a duplicate title
- **Frontend Action**: Display validation error, suggest alternative title
- **HTTP Status**: 400

### `DuplicateName`
- **When**: Adding a duplicate option name to a poll
- **Frontend Action**: Display validation error, suggest alternative name
- **HTTP Status**: 400

### `PollStarted`
- **When**: Trying to add/remove options or voters after poll has started
- **Frontend Action**: Display "Poll is live, modifications locked" message
- **HTTP Status**: 400

### `PollEnded`
- **When**: Trying to add options, voters, or vote in an ended poll
- **Frontend Action**: Display "Poll has ended" message with results link
- **HTTP Status**: 400

### `PollNotActive`
- **When**: Voting outside the active voting period
- **Frontend Action**: Display poll start time or "Poll has ended" message
- **HTTP Status**: 400

### `PollNotEnded`
- **When**: Attempting to reveal results before the poll ends
- **Frontend Action**: Display "Poll is still active, results not yet available"
- **HTTP Status**: 400

### `PollAlreadyRevealed`
- **When**: Attempting to reveal results that have already been revealed
- **Frontend Action**: Display "Results already revealed" with link to results
- **HTTP Status**: 400

### `PollNotRevealed`
- **When**: Attempting to access results before reveal
- **Frontend Action**: Display "Results not yet revealed" message
- **HTTP Status**: 400

### `PollIsPaused`
- **When**: Attempting to vote in a paused poll (V2 upgradeable only)
- **Frontend Action**: Display "Poll is temporarily paused"
- **HTTP Status**: 400

### `PollNotPaused`
- **When**: Attempting to unpause a poll that is not paused
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

### `MaxOptionsReached`
- **When**: Attempting to add more than 100 options
- **Frontend Action**: Display "Maximum 100 options allowed" message
- **HTTP Status**: 400

---

## Voter Authorization Errors

### `NotVoter`
- **When**: Unauthorized address attempts to vote
- **Frontend Action**: Display "You are not authorized to vote in this poll"
- **HTTP Status**: 403

### `DuplicateVoter`
- **When**: Attempting to authorize an already authorized voter
- **Frontend Action**: Display "Voter is already authorized" message
- **HTTP Status**: 400

### `ZeroAddress`
- **When**: Providing the zero address for voter, admin, or contract reference
- **Frontend Action**: Display "Invalid wallet address" validation error
- **HTTP Status**: 400

### `BatchLimitExceeded`
- **When**: Trying to add more than 50 voters at once
- **Frontend Action**: Display "Maximum 50 voters per batch, split into multiple transactions"
- **HTTP Status**: 400

---

## Voting Errors

### `AlreadyVoted`
- **When**: Attempting to vote again after already voting
- **Frontend Action**: Display "You have already voted" with current selection
- **HTTP Status**: 400

### `InvalidOption`
- **When**: Voting for a non-existent option ID
- **Frontend Action**: Display "Invalid option selected" validation error
- **HTTP Status**: 400

### `VoteIsDelegated`
- **When**: A delegator attempts to vote directly when they have an active delegation
- **Frontend Action**: Display "Your vote has been delegated to [address]. Remove delegation to vote directly."
- **HTTP Status**: 400

### `SecretPoll`
- **When**: Attempting a regular `voteInPoll` on a secret ballot poll
- **Frontend Action**: Redirect to commit-reveal voting flow
- **HTTP Status**: 400

### `TokenVotingRequired`
- **When**: Using `voteInPoll` on a poll that requires token-based voting
- **Frontend Action**: Redirect to token voting flow, display "This poll requires token-based voting"
- **HTTP Status**: 400

### `TokenVotingNotEnabled`
- **When**: Using token voting functions on a poll without token voting enabled
- **Frontend Action**: Display "Token voting is not enabled for this poll"
- **HTTP Status**: 400

### `VoteExecutionFailed`
- **When**: Internal vote recording operation failed
- **Frontend Action**: Display "Vote failed, please try again"
- **HTTP Status**: 500

### `DelegateAlreadyVoted`
- **When**: Delegate attempts to vote for a delegator after they already voted
- **Frontend Action**: Display "This delegate has already voted"
- **HTTP Status**: 400

---

## Token Management Errors

### `InsufficientTokens`
- **When**: Voter attempts to use more tokens than allocated
- **Frontend Action**: Display remaining token balance, suggest lower amount
- **HTTP Status**: 400

### `InsufficientBalance`
- **When**: Token operation exceeds available balance
- **Frontend Action**: Display "Insufficient token balance"
- **HTTP Status**: 400

### `InsufficientAllowance`
- **When**: Token transfer exceeds approved allowance
- **Frontend Action**: Display "Insufficient allowance, approve more tokens"
- **HTTP Status**: 400

### `NoTokenManager`
- **When**: Token voting requested but no TokenManager is configured
- **Frontend Action**: Display "Token voting is not available for this system"
- **HTTP Status**: 500

### `TokenAlreadyExists`
- **When**: Attempting to create a token for a poll that already has one
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

### `NoTokenForPoll`
- **When**: Accessing token functions for a poll without an associated token
- **Frontend Action**: Display "No token configured for this poll"
- **HTTP Status**: 404

### `NonTransferable`
- **When**: Attempting to transfer voting tokens (they are soulbound)
- **Frontend Action**: Display "Voting tokens cannot be transferred"
- **HTTP Status**: 400

### `OnlyBurningAllowed`
- **When**: Attempting non-burn transfers on voting tokens
- **Frontend Action**: Display "Only token burning is permitted"
- **HTTP Status**: 400

### `TokenAlreadyUsed`
- **When**: Attempting to reuse a token that has already been spent
- **Frontend Action**: Display "Token has already been used"
- **HTTP Status**: 400

---

## Gasless Voting Errors

### `SignatureExpired`
- **When**: EIP-712 signature deadline has passed
- **Frontend Action**: Display "Signature expired, please sign again"
- **HTTP Status**: 400

### `InvalidSignature`
- **When**: EIP-712 signature does not match the expected signer
- **Frontend Action**: Display "Invalid signature, please try again"
- **HTTP Status**: 401

### `InvalidSValue`
- **When**: ECDSA `s` value exceeds the canonical limit (`secp256k1n/2`)
- **Frontend Action**: Display "Signature malformed, please sign again"
- **HTTP Status**: 400

### `InvalidVValue`
- **When**: ECDSA `v` value is not 27 or 28
- **Frontend Action**: Display "Signature malformed, please sign again"
- **HTTP Status**: 400

### `MustSendETH`
- **When**: Calling `fund()` without sending ETH
- **Frontend Action**: Display "Please include ETH amount to fund the paymaster"
- **HTTP Status**: 400

### `TransferFailed`
- **When**: ETH transfer (withdrawal, refund) failed
- **Frontend Action**: Display "ETH transfer failed, please try again"
- **HTTP Status**: 500

### `NoFeesToWithdraw`
- **When**: Attempting to withdraw with no accumulated fees
- **Frontend Action**: Display "No fees to withdraw"
- **HTTP Status**: 400

### `BadPaymaster`
- **When**: Paymaster admin is neither owner nor franchisee
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

---

## Access Control Errors

### `Unauthorized`
- **When**: Caller lacks required permissions (admin, owner, or specific role)
- **Frontend Action**: Display "You do not have permission to perform this action"
- **HTTP Status**: 403

### `OnlyPendingOwner`
- **When**: Non-pending-owner attempts to accept ownership transfer
- **Frontend Action**: Display "Only the pending owner can accept the transfer"
- **HTTP Status**: 403

### `SameAddress`
- **When**: Setting admin or owner to their current value (no-op)
- **Frontend Action**: Display "New address must be different from current"
- **HTTP Status**: 400

---

## Time Validation Errors

### `StartTimeInPast`
- **When**: Creating a poll with a start time in the past
- **Frontend Action**: Display "Start time must be in the future"
- **HTTP Status**: 400

### `StartTimeTooFarInFuture`
- **When**: Creating a poll with a start time more than 365 days ahead
- **Frontend Action**: Display "Start time must be within 1 year"
- **HTTP Status**: 400

### `DurationTooShort`
- **When**: Poll duration is less than the minimum (60 seconds)
- **Frontend Action**: Display "Poll duration must be at least 60 seconds"
- **HTTP Status**: 400

### `TimeOverflow`
- **When**: Start time + duration overflows uint256
- **Frontend Action**: Display "Invalid time range"
- **HTTP Status**: 400

---

## General Validation Errors

### `ZeroAmount`
- **When**: Providing zero for amount, duration, or voter count parameters
- **Frontend Action**: Display "Value must be greater than zero"
- **HTTP Status**: 400

### `EmptyArray`
- **When**: Providing an empty array where at least one element is required
- **Frontend Action**: Display "At least one item is required"
- **HTTP Status**: 400

### `ArrayLengthMismatch`
- **When**: Parallel arrays (e.g., addresses and amounts) have different lengths
- **Frontend Action**: Display "Array lengths do not match"
- **HTTP Status**: 400

### `InfraLocked`
- **When**: Attempting to change infrastructure contracts (TokenManager, VotingPaymaster, etc.) after the first poll has been created
- **Frontend Action**: Display "System configuration is locked after first poll creation"
- **HTTP Status**: 400

### `ReentrantCall`
- **When**: Reentrancy guard triggered during a nested call
- **Frontend Action**: Display "Transaction failed, please try again"
- **HTTP Status**: 500

### `NoPlainEther`
- **When**: Sending ETH directly to a contract that does not accept plain transfers
- **Frontend Action**: Display "This contract does not accept direct ETH transfers"
- **HTTP Status**: 400

### `UnknownFunction`
- **When**: Calling a non-existent function on the contract
- **Frontend Action**: Display "Unknown operation"
- **HTTP Status**: 400

---

## Delegation Errors

### `DelegationDisabled`
- **When**: Attempting delegation on a poll where delegation is not enabled
- **Frontend Action**: Display "Delegation is not enabled for this poll"
- **HTTP Status**: 400

### `CannotSelfDelegate`
- **When**: Attempting to delegate to own address
- **Frontend Action**: Display "You cannot delegate to yourself"
- **HTTP Status**: 400

### `AlreadyDelegated`
- **When**: Attempting to delegate when already delegated
- **Frontend Action**: Display "You have already delegated your vote"
- **HTTP Status**: 400

### `DelegateeAlreadyDelegated`
- **When**: Attempting to delegate to someone who has themselves delegated
- **Frontend Action**: Display "Target has already delegated their vote (chain prevention)"
- **HTTP Status**: 400

### `NoDelegation`
- **When**: Attempting to remove delegation when none exists
- **Frontend Action**: Display "No active delegation to remove"
- **HTTP Status**: 400

### `NotDelegatee`
- **When**: Attempting to vote as delegate for someone who hasn't delegated to you
- **Frontend Action**: Display "You are not the designated delegate for this voter"
- **HTTP Status**: 403

### `DelegateeNotAuthorized`
- **When**: Delegatee is not an authorized voter for the poll
- **Frontend Action**: Display "The delegate must be an authorized voter"
- **HTTP Status**: 400

### `DelegationClosed`
- **When**: Attempting to delegate after the delegation window has closed
- **Frontend Action**: Display "Delegation period has ended"
- **HTTP Status**: 400

### `NoDelegationForTokenPolls`
- **When**: Attempting delegation on a token-based poll (delegation not supported for token polls)
- **Frontend Action**: Display "Delegation is not available for token-based polls"
- **HTTP Status**: 400

---

## Secret Ballot Errors

### `NotSecretBallot`
- **When**: Attempting secret ballot operations on a non-secret ballot poll
- **Frontend Action**: Display "This is not a secret ballot poll"
- **HTTP Status**: 400

### `SecretBallotNotEnabled`
- **When**: Attempting commit-vote on a poll without secret ballot enabled
- **Frontend Action**: Redirect to standard voting flow
- **HTTP Status**: 400

### `SecretBallotAlreadyEnabled`
- **When**: Attempting to enable secret ballot on a poll that already has it
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

### `AlreadyCommitted`
- **When**: Attempting to commit a vote hash when one already exists
- **Frontend Action**: Display "You have already committed your vote"
- **HTTP Status**: 400

### `NoCommitment`
- **When**: Attempting to reveal without a prior commitment
- **Frontend Action**: Display "No vote commitment found, commit first"
- **HTTP Status**: 400

### `AlreadyRevealed`
- **When**: Attempting to reveal a vote that has already been revealed
- **Frontend Action**: Display "Your vote has already been revealed"
- **HTTP Status**: 400

### `NotInRevealPeriod`
- **When**: Attempting to reveal before the reveal period begins
- **Frontend Action**: Display "Reveal period has not started yet" with countdown
- **HTTP Status**: 400

### `HashMismatch`
- **When**: Revealed vote data does not match the committed hash
- **Frontend Action**: Display "Invalid reveal — your option or salt does not match your commitment"
- **HTTP Status**: 400

### `InvalidCommitHash`
- **When**: Committing a zero hash
- **Frontend Action**: Display "Invalid commitment hash"
- **HTTP Status**: 400

### `SBMNotSet`
- **When**: Secret ballot operations attempted but SecretBallotManager not configured
- **Frontend Action**: Display "Secret ballot is not available for this system"
- **HTTP Status**: 500

### `RevealPeriodActive`
- **When**: Attempting to reveal results while the individual reveal period is still active
- **Frontend Action**: Display "Please wait for the reveal period to end"
- **HTTP Status**: 400

### `RevealDurationTooShort`
- **When**: Setting reveal duration below the minimum threshold
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

---

## Franchise Errors

### `FranchiseNotFound`
- **When**: Accessing a non-existent franchise
- **Frontend Action**: Display "Franchise not found"
- **HTTP Status**: 404

### `FranchiseExpired`
- **When**: Using an expired franchise to create polls
- **Frontend Action**: Display "Your franchise has expired, contact the system owner"
- **HTTP Status**: 400

### `FranchiseExhausted`
- **When**: Franchise has used all its allocated polls
- **Frontend Action**: Display "Poll quota exhausted, request more or renew franchise"
- **HTTP Status**: 400

### `NoFranchise`
- **When**: Non-franchisee attempting franchise-only operations
- **Frontend Action**: Display "You do not have an active franchise"
- **HTTP Status**: 403

### `InsufficientFee`
- **When**: Franchise fee not met for transfer operations
- **Frontend Action**: Display "Please include the required transfer fee"
- **HTTP Status**: 400

### `TransferPending`
- **When**: Attempting a new franchise transfer while one is pending
- **Frontend Action**: Display "A transfer is already pending"
- **HTTP Status**: 400

### `NoTransferPending`
- **When**: Attempting to accept/cancel a non-existent transfer
- **Frontend Action**: Display "No pending transfer to accept"
- **HTTP Status**: 400

### `OwnerCannotBeFranchisee`
- **When**: System owner attempts to grant franchise to themselves
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

### `CannotSelfTransfer`
- **When**: Franchisee attempts to transfer franchise to themselves
- **Frontend Action**: Display "Cannot transfer to yourself"
- **HTTP Status**: 400

### `TargetHasActiveFranchise`
- **When**: Transfer target already has an active franchise
- **Frontend Action**: Display "Target address already has a franchise"
- **HTTP Status**: 400

### `ExceedsPollCap`
- **When**: Granting more than 100 polls in a franchise
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

### `InvalidPollCount`
- **When**: Setting franchise poll count outside 1-100 range
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

---

## Multi-Choice & Quadratic Errors

### `MultiChoiceNotEnabled`
- **When**: Using multi-choice voting on a poll without it enabled
- **Frontend Action**: Display "Multi-choice voting is not enabled for this poll"
- **HTTP Status**: 400

### `InvalidChoiceCount`
- **When**: Number of selections exceeds the poll's maxChoices
- **Frontend Action**: Display "You can select up to [maxChoices] options"
- **HTTP Status**: 400

### `MinTwoChoices`
- **When**: Setting maxChoices below 2
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

### `MaxChoicesExceedsOptions`
- **When**: maxChoices is greater than the total number of options
- **Frontend Action**: N/A (admin-only)
- **HTTP Status**: 400

### `DuplicateOption`
- **When**: Submitting duplicate option IDs in a multi-choice or quadratic vote
- **Frontend Action**: Display "Each option can only be selected once"
- **HTTP Status**: 400

### `QuadraticNotEnabled`
- **When**: Using quadratic voting on a poll without it enabled
- **Frontend Action**: Display "Quadratic voting is not enabled for this poll"
- **HTTP Status**: 400

---

## Metadata Errors

### `EmptyMetadata`
- **When**: Setting an empty metadata URI on a poll
- **Frontend Action**: Display "Metadata URI cannot be empty"
- **HTTP Status**: 400

---

## Upgradeable V2 Errors

### `WeightOutOfRange`
- **When**: Setting vote weight outside 1-10 range (V2 only)
- **Frontend Action**: Display "Vote weight must be between 1 and 10"
- **HTTP Status**: 400

### `EmptyTitle`
- **When**: Creating a poll with an empty title string (V2 only)
- **Frontend Action**: Display "Poll title is required"
- **HTTP Status**: 400

---

**Version:** 4.2.0 | **Solidity:** ^0.8.20 (compiled with 0.8.28) | **License:** LicenseRef-ANKIT-SORAL
