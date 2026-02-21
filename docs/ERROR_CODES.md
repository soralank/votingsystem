# Error Codes Reference - Token-Based Gasless Voting System
# Contract Information

Contact: ankit.soral@outlokk.com

This document provides a comprehensive reference of all error codes and messages returned by the smart contracts. Use this to implement proper error handling and user-friendly messages in your frontend application.

## Table of Contents

1. [Poll Management Errors](#poll-management-errors)
2. [Voter Authorization Errors](#voter-authorization-errors)
3. [Voting Errors](#voting-errors)
4. [Token Management Errors](#token-management-errors)
5. [Gasless Voting Errors](#gasless-voting-errors)
6. [Access Control Errors](#access-control-errors)
7. [Time Validation Errors](#time-validation-errors)
8. [General Validation Errors](#general-validation-errors)

---

## Poll Management Errors

### `"No poll"`
- **When**: Attempting operations on a non-existent poll ID
- **Frontend Action**: Display "Poll not found" message, redirect to polls list
- **HTTP Status**: 404

### `"Dup title"`
- **When**: Creating a poll with a duplicate title
- **Frontend Action**: Display validation error, suggest alternative title
- **HTTP Status**: 400

### `"Poll started"`
- **When**: Trying to add/remove options or voters after poll has started
- **Frontend Action**: Display "Poll is live, modifications locked" message
- **HTTP Status**: 400

### `"Poll ended"`
- **When**: Trying to add options or voters to an ended poll
- **Frontend Action**: Display "Poll has ended" message
- **HTTP Status**: 400

### `"Poll ended; cannot remove voters."`
- **When**: Trying to remove voters from an ended poll
- **Frontend Action**: Display "Poll has ended, cannot modify voters" message
- **HTTP Status**: 400

### `"Poll ended; cannot vote."`
- **When**: Attempting to vote in an ended poll
- **Frontend Action**: Display "Voting has closed" message with results link
- **HTTP Status**: 400

### `"Not active"`
- **When**: Voting outside the active voting period
- **Frontend Action**: Display poll start time or "Poll has ended" message
- **HTTP Status**: 400

### `"Max options"`
- **When**: Attempting to add more than 100 options
- **Frontend Action**: Display "Maximum 100 options allowed" message
- **HTTP Status**: 400

### `"Option name already exists in this poll."`
- **When**: Adding a duplicate option name
- **Frontend Action**: Display validation error, suggest alternative name
- **HTTP Status**: 400

---

## Voter Authorization Errors

### `"Not voter"`
- **When**: Unauthorized address attempts to vote
- **Frontend Action**: Display "You are not authorized to vote in this poll"
- **HTTP Status**: 403

### `"Dup voter"`
- **When**: Attempting to authorize an already authorized voter
- **Frontend Action**: Display "Voter is already authorized" message
- **HTTP Status**: 400

### `"Voter not authorized."`
- **When**: Trying to remove a voter who is not authorized
- **Frontend Action**: Display "Voter is not in the authorized list" message
- **HTTP Status**: 404

### `"Bad addr"`
- **When**: Providing zero address or invalid address for voter
- **Frontend Action**: Display "Invalid wallet address" validation error
- **HTTP Status**: 400

### `"Batch limit"`
- **When**: Trying to add more than 50 voters at once
- **Frontend Action**: Display "Maximum 50 voters per batch, split into multiple transactions"
- **HTTP Status**: 400

### `"Cannot remove voter who already voted."`
- **When**: Attempting to remove a voter after they've voted
- **Frontend Action**: Display "Cannot remove voter who has already cast their vote"
- **HTTP Status**: 400

---

## Voting Errors

### `"Already voted"`
- **When**: Attempting to vote twice (traditional voting)
- **Frontend Action**: Display "You have already voted in this poll" with option to view results
- **HTTP Status**: 400

### `"Already voted."`
- **When**: Attempting to vote twice (token-based voting)
- **Frontend Action**: Display "You have already voted in this poll" with option to view results
- **HTTP Status**: 400

### `"Already voted with token"`
- **When**: Internal check - voter already used token to vote
- **Frontend Action**: Same as above
- **HTTP Status**: 400

### `"Invalid option."`
- **When**: Voting for an option ID that doesn't exist
- **Frontend Action**: Display "Invalid option selected" and reload options
- **HTTP Status**: 400

### `"Token voting required"`
- **When**: Using traditional vote method on a token-required poll
- **Frontend Action**: Display "This poll requires token-based voting" with token balance info
- **HTTP Status**: 400

### `"Token voting not enabled"`
- **When**: Attempting token vote on a non-token poll
- **Frontend Action**: Display "Token voting is not enabled for this poll"
- **HTTP Status**: 400

---

## Token Management Errors

### `"No token for this poll"`
- **When**: Attempting token operations on a poll without tokens
- **Frontend Action**: Display "This poll does not have voting tokens enabled"
- **HTTP Status**: 404

### `"Token already exists for this poll"`
- **When**: Trying to create a token for a poll that already has one
- **Frontend Action**: Internal error - should not be exposed to users
- **HTTP Status**: 400

### `"Insufficient tokens"`
- **When**: Voter doesn't have enough tokens to vote
- **Frontend Action**: Display "You don't have voting tokens for this poll. Contact poll admin."
- **HTTP Status**: 403

### `"Insufficient vote tokens"`
- **When**: Paymaster check - voter has no tokens
- **Frontend Action**: Same as above
- **HTTP Status**: 403

### `"Only TokenManager can call"`
- **When**: Unauthorized call to token mint/burn functions
- **Frontend Action**: Internal error - should not occur in normal flow
- **HTTP Status**: 403

### `"Voting tokens are non-transferable"`
- **When**: Attempting to transfer voting tokens
- **Frontend Action**: Display "Voting tokens cannot be transferred"
- **HTTP Status**: 400

### `"Only burning allowed"`
- **When**: Attempting transferFrom to non-zero address
- **Frontend Action**: Internal error - should not be exposed to users
- **HTTP Status**: 400

### `"Amount must be positive"`
- **When**: Allocating zero tokens
- **Frontend Action**: Display "Token amount must be greater than zero"
- **HTTP Status**: 400

### `"Invalid address"`
- **When**: Zero address provided for token operations
- **Frontend Action**: Display "Invalid wallet address"
- **HTTP Status**: 400

### `"Insufficient balance"`
- **When**: Burning more tokens than available
- **Frontend Action**: Display "Insufficient token balance"
- **HTTP Status**: 400

### `"Insufficient allowance"`
- **When**: TransferFrom without sufficient allowance
- **Frontend Action**: Display "Please approve token spending first"
- **HTTP Status**: 400

---

## Gasless Voting Errors

### `"Invalid signature"`
- **When**: EIP-712 signature verification fails or nonce mismatch
- **Frontend Action**: Display "Signature verification failed. Please try signing again."
- **HTTP Status**: 401

### `"Signature expired"`
- **When**: Attempting to use an expired signature
- **Frontend Action**: Display "Signature has expired. Please sign again."
- **HTTP Status**: 401

### `"Vote execution failed"`
- **When**: Voting transaction fails within paymaster
- **Frontend Action**: Display generic error with transaction details
- **HTTP Status**: 500

### `"Only voter or paymaster"`
- **When**: Unauthorized caller for token vote
- **Frontend Action**: Internal error - should not be exposed to users
- **HTTP Status**: 403

### `"Only voting contract"`
- **When**: Unauthorized call to paymaster or token manager
- **Frontend Action**: Internal error - should not occur in normal flow
- **HTTP Status**: 403

### `"Must send ETH"`
- **When**: Calling fund() with zero value
- **Frontend Action**: Display "Must send ETH to fund paymaster"
- **HTTP Status**: 400

### `"Invalid paymaster"`
- **When**: Zero address for paymaster
- **Frontend Action**: Configuration error - contact admin
- **HTTP Status**: 500

### `"Invalid relayer"`
- **When**: Zero address for relayer
- **Frontend Action**: Configuration error - contact admin
- **HTTP Status**: 500

---

## Access Control Errors

### `"Only owner can call"`
- **When**: Non-owner attempts owner-only functions
- **Frontend Action**: Display "Only contract owner can perform this action"
- **HTTP Status**: 403

### `"Only owner can perform this action."`
- **When**: Same as above (legacy message)
- **Frontend Action**: Same as above
- **HTTP Status**: 403

### `"Admin only"`
- **When**: Non-admin/owner attempts admin functions on a poll
- **Frontend Action**: Display "Only poll admin or contract owner can perform this action"
- **HTTP Status**: 403

### `"Only admin"`
- **When**: Non-admin attempts admin-only paymaster functions
- **Frontend Action**: Display "Only paymaster admin can perform this action"
- **HTTP Status**: 403

### `"Only pending owner can accept"`
- **When**: Non-pending owner tries to accept ownership
- **Frontend Action**: Display "Only the pending owner can accept ownership"
- **HTTP Status**: 403

### `"Only pending owner can accept."`
- **When**: Same as above (variant with period)
- **Frontend Action**: Same as above
- **HTTP Status**: 403

### `"New owner is zero address"`
- **When**: Transferring ownership to zero address
- **Frontend Action**: Display "Invalid new owner address"
- **HTTP Status**: 400

### `"New owner is the zero address."`
- **When**: Same as above (variant)
- **Frontend Action**: Same as above
- **HTTP Status**: 400

### `"No pending transfer."`
- **When**: Canceling when there's no pending transfer
- **Frontend Action**: Display "No pending ownership transfer to cancel"
- **HTTP Status**: 400

---

## Time Validation Errors

### `"Start time cannot be in the past."`
- **When**: Creating poll with past start time
- **Frontend Action**: Display "Poll start time must be in the future"
- **HTTP Status**: 400

### `"Start time too far in future."`
- **When**: Start time exceeds MAX_FUTURE_START (30 days)
- **Frontend Action**: Display "Poll start time cannot be more than 30 days in the future"
- **HTTP Status**: 400

### `"Poll duration too short."`
- **When**: Duration less than MIN_POLL_DURATION (5 minutes / 300 seconds)
- **Frontend Action**: Display "Poll duration must be at least 5 minutes"
- **HTTP Status**: 400

### `"Invalid time range - overflow."`
- **When**: Start time + duration causes overflow
- **Frontend Action**: Display "Invalid time range"
- **HTTP Status**: 400

### `"Poll not ended"`
- **When**: Revealing results before poll end + 30 second buffer
- **Frontend Action**: Display poll end time and countdown
- **HTTP Status**: 400

### `"Cannot end before end time plus buffer."`
- **When**: Ending poll before end time + 30 second buffer
- **Frontend Action**: Display poll end time and countdown
- **HTTP Status**: 400

---

## General Validation Errors

### `"admin zero"`
- **When**: Zero address provided for poll admin
- **Frontend Action**: Display "Invalid admin address"
- **HTTP Status**: 400

### `"Invalid voting contract"`
- **When**: Zero address for voting  contract in deployment
- **Frontend Action**: Deployment error - contact developers
- **HTTP Status**: 500

### `"Invalid token manager"`
- **When**: Zero address for token manager
- **Frontend Action**: Configuration error - contact admin
- **HTTP Status**: 500

### `"TokenManager not set"`
- **When**: Token operations attempted before TokenManager configured
- **Frontend Action**: Display "Token system not configured for this contract"
- **HTTP Status**: 500

### `"Empty arrays"`
- **When**: Batch operations with empty arrays
- **Frontend Action**: Display "No voters provided"
- **HTTP Status**: 400

### `"Empty voters array"`
- **When**: Allocating tokens with empty voter array
- **Frontend Action**: Same as above
- **HTTP Status**: 400

### `"Array length mismatch"`
- **When**: Voters and amounts arrays have different lengths
- **Frontend Action**: Display "Data validation error, please try again"
- **HTTP Status**: 400

### `"Not revealed"`
- **When**: Accessing vote details before results revealed
- **Frontend Action**: Display "Results will be available after reveal"
- **HTTP Status**: 403

### `"Contract does not accept plain ether."`
- **When**: Sending ETH directly to voting contract
- **Frontend Action**: Display "This contract does not accept direct ETH transfers"
- **HTTP Status**: 400

### `"Unknown function called."`
- **When**: Calling non-existent function
- **Frontend Action**: Display "Invalid operation"
- **HTTP Status**: 400

---

## Trust & Secret Ballot Errors (v4.0)

### Infrastructure Lock Errors

#### `"Infra locked"`
- **When**: Attempting to change TokenManager or VotingPaymaster after the first poll is created
- **Frontend Action**: Display "Infrastructure contracts are permanently locked after first poll creation"
- **HTTP Status**: 403

### Secret Ballot Errors (ElectionsManager)

#### `"Secret poll"`
- **When**: Attempting plain vote/token vote on a secret ballot poll
- **Frontend Action**: Display "This is a secret ballot poll. Use the commit-reveal workflow instead."
- **HTTP Status**: 400

#### `"Secret ballot: delegation uses commitVote()."`
- **When**: Attempting delegation on a secret ballot poll
- **Frontend Action**: Display "Secret ballot polls do not support direct delegation. Use commit-reveal."
- **HTTP Status**: 400

#### `"Already enabled"`
- **When**: Calling `enableSecretBallot()` on a poll that already has secret ballot enabled
- **Frontend Action**: Display "Secret ballot is already enabled for this poll"
- **HTTP Status**: 400

#### `"SBM not set"`
- **When**: Calling `enableSecretBallot()`, `setRevealDuration()`, or `setDefaultRevealDuration()` before `setSecretBallotManager()` has been called
- **Frontend Action**: Display "SecretBallotManager has not been configured. Contact the contract owner."
- **HTTP Status**: 500

#### `"Only SBM"`
- **When**: Non-SecretBallotManager contract calls `recordSecretVote()` or `burnTokenForCommit()`
- **Frontend Action**: Internal error — should not occur in normal flow
- **HTTP Status**: 403

#### `"Already revealed."`
- **When**: Calling `revealResults()` on a poll that has already been revealed
- **Frontend Action**: Display "Results have already been revealed for this poll"
- **HTTP Status**: 400

### Secret Ballot Errors (SecretBallotManager)

#### `"Secret ballot not enabled."`
- **When**: Attempting commit on a non-secret-ballot poll
- **Frontend Action**: Display "Secret ballot is not enabled for this poll"
- **HTTP Status**: 400

#### `"Not a secret ballot poll."`
- **When**: Attempting reveal on a non-secret-ballot poll
- **Frontend Action**: Display "This poll does not use secret ballot"
- **HTTP Status**: 400

#### `"Not authorized."`
- **When**: Unauthorized voter attempts commit
- **Frontend Action**: Display "You are not authorized to vote in this poll"
- **HTTP Status**: 403

#### `"Not in commit phase."`
- **When**: Committing outside the active voting period
- **Frontend Action**: Display "Commit phase has ended" or "Poll has not started yet"
- **HTTP Status**: 400

#### `"Already committed."`
- **When**: Voter attempts to commit a second time
- **Frontend Action**: Display "You have already committed your vote. Wait for the reveal phase."
- **HTTP Status**: 400

#### `"Delegated vote."`
- **When**: Voter who has delegated tries to commit
- **Frontend Action**: Display "You have delegated your vote and cannot commit"
- **HTTP Status**: 400

#### `"Invalid commit hash."`
- **When**: Providing a zero bytes32 commit hash
- **Frontend Action**: Display "Invalid commitment. Please generate a valid hash."
- **HTTP Status**: 400

#### `"No commitment found."`
- **When**: Revealing without having committed
- **Frontend Action**: Display "You did not commit a vote for this poll"
- **HTTP Status**: 400

#### `"Not in reveal period."`
- **When**: Attempting reveal during commit phase or after reveal window closes
- **Frontend Action**: Display countdown to reveal period or "Reveal period has ended"
- **HTTP Status**: 400

#### `"Invalid reveal: hash mismatch."`
- **When**: Reveal data doesn't match the committed hash
- **Frontend Action**: Display "Your reveal data does not match your commitment. Check optionId and salt."
- **HTTP Status**: 400

#### `"Token voting not enabled."`
- **When**: Using `commitVoteWithToken()` on a poll without token voting
- **Frontend Action**: Display "Token voting is not enabled for this poll"
- **HTTP Status**: 400

#### `"Only owner or EM"`
- **When**: Non-owner, non-ElectionsManager address calls `setRevealDuration()` or `setDefaultRevealDuration()` on SBM directly
- **Frontend Action**: Internal error — use ElectionsManager proxy functions instead of calling SBM directly
- **HTTP Status**: 403

#### `"Reveal duration too short"`
- **When**: Setting reveal duration below 1 minute (MIN_REVEAL_DURATION)
- **Frontend Action**: Display "Reveal duration must be at least 1 minute"
- **HTTP Status**: 400

### Metadata Lock Errors

#### `"Poll started"`
- **When**: Attempting `setPollMetadata()`, `enableSecretBallot()`, or `enableQuadraticVoting()` after poll has started
- **Frontend Action**: Display "This setting can only be changed before the poll starts"
- **HTTP Status**: 400

#### `"Metadata URI cannot be empty."`
- **When**: Providing empty string for metadata URI
- **Frontend Action**: Display "Please provide a valid IPFS URI"
- **HTTP Status**: 400

---

## Frontend Integration Guide

### Error Handling Pattern

```typescript
// Example error handling in frontend
async function handleVoteError(error: any) {
  const errorMessage = error.reason || error.message;

  const errorMap: Record<string, { title: string; message: string; action?: string }> = {
    "Already voted.": {
      title: "Already Voted",
      message: "You have already cast your vote in this poll.",
      action: "View Results"
    },
    "Insufficient tokens": {
      title: "No Voting Tokens",
      message: "You don't have voting tokens for this poll. Please contact the poll administrator.",
      action: "Contact Admin"
    },
    "Not active": {
      title: "Poll Not Active",
      message: "This poll is not currently accepting votes.",
      action: "View Poll Details"
    },
    // Add more mappings...
  };

  const errorInfo = errorMap[errorMessage] || {
    title: "Transaction Failed",
    message: errorMessage,
  };

  displayErrorModal(errorInfo);
}
```

### Error Categories for UI

```typescript
enum ErrorSeverity {
  INFO = "info",        // User can retry or take action
  WARNING = "warning",  // Validation errors
  ERROR = "error",      // Transaction failures
  CRITICAL = "critical" // System errors
}

function categorizeError(errorMessage: string): ErrorSeverity {
  if (errorMessage.includes("already voted")) return ErrorSeverity.INFO;
  if (errorMessage.includes("not authorized")) return ErrorSeverity.WARNING;
  if (errorMessage.includes("Invalid")) return ErrorSeverity.WARNING;
  if (errorMessage.includes("Cannot")) return ErrorSeverity.ERROR;
  if (errorMessage.includes("Only owner")) return ErrorSeverity.ERROR;
  return ErrorSeverity.ERROR;
}
```

### Retry Logic

Errors that can be retried:
- `"Signature expired"`
- `"Invalid signature"`
- `"Not active"` (can wait and retry)

Errors that cannot be retried:
- `"Already voted."`
- `"Poll ended; cannot vote."`
- `"Not voter"`
- `"Insufficient tokens"`

---

## Testing Error Handling

All 312 tests pass, covering:
- ✅ All error conditions
- ✅ Authorization checks
- ✅ Time validations
- ✅ Token operations
- ✅ Gasless voting workflow
- ✅ Trust features (infrastructure lock, secret ballot, democratic reveal)
- ✅ Edge cases and security

Run tests:
```bash
npx hardhat test
```

---

## Notes

1. **Error Message Consistency**: Some error messages have periods, some don't. Frontend should handle both formats.

2. **Gas Estimation Failures**: When transactions will revert, gas estimation will fail with the revert reason. Catch these during gas estimation phase.

3. **EIP-712 Signatures**: Invalid signatures may fail at verification step before transaction submission.

4. **Custom Error Codes**: For gas optimization, consider using custom errors (Solidity 0.8.4+). Current implementation uses string revert messages for clarity.

5. **Logging**: All major state changes emit events. Frontend should listen to events for real-time updates.

6. **Transaction Hashes**: Always provide transaction hash to users for failed transactions so they can investigate on block explorer.

7. **Secret Ballot UX**: Commit-reveal errors should guide users through the two-phase workflow. Store the salt securely client-side between commit and reveal phases.

---

## Franchise Management Errors

### `"No franchise"`
- **When**: Trying to create a franchise poll without having an active franchise
- **Frontend Action**: Display "You don't have an active franchise"
- **HTTP Status**: 403

### `"Franchise expired"`
- **When**: Trying to create a poll or transfer after franchise time limit
- **Frontend Action**: Display "Your franchise has expired" with expiry date
- **HTTP Status**: 403

### `"Max polls reached"`
- **When**: All allocated polls have been used
- **Frontend Action**: Display "You have used all your allocated polls"
- **HTTP Status**: 403

### `"Insufficient fee"`
- **When**: Not sending enough ETH for poll creation (2nd poll onward)
- **Frontend Action**: Display required fee amount
- **HTTP Status**: 402

### `"Active franchise exists"` — *REMOVED*
- **Behavior Change**: Re-granting to an address with an active franchise now **supersedes** the old one instead of reverting. Old polls remain on ElectionsManager. Emits `FranchiseSuperseded`.

### `"Franchise does not exist"`
- **When**: Calling `addPolls` with an invalid franchise ID
- **Frontend Action**: Display "Franchise not found"
- **HTTP Status**: 404

### `"Franchise exhausted"`
- **When**: Calling `addPolls` on a franchise that has used all its polls
- **Frontend Action**: Display "Franchise has no remaining polls — consider granting a new one"
- **HTTP Status**: 403

### `"Must add > 0"`
- **When**: Calling `addPolls` with 0 additional polls
- **Frontend Action**: Display "Must add at least 1 poll"
- **HTTP Status**: 400

### `"Exceeds 100 poll cap"`
- **When**: `addPolls` would push total maxPolls above 100
- **Frontend Action**: Display "Cannot exceed 100 polls — current max is X"
- **HTTP Status**: 400

### `"Owner cannot be franchisee"`
- **When**: Trying to grant a franchise to the contract owner
- **Frontend Action**: Display "Owner cannot be a franchisee"
- **HTTP Status**: 400

### `"Polls: 1-100"`
- **When**: Granting a franchise with 0 or >100 max polls
- **Frontend Action**: Display "Polls must be between 1 and 100"
- **HTTP Status**: 400

### `"Duration must be > 0"`
- **When**: Granting a franchise with zero duration
- **Frontend Action**: Display "Duration must be greater than 0"
- **HTTP Status**: 400

### `"Not franchisee"`
- **When**: Non-franchisee trying to request a transfer
- **Frontend Action**: Display "Only the franchise holder can request transfers"
- **HTTP Status**: 403

### `"Transfer pending"`
- **When**: Requesting a second transfer while one is pending
- **Frontend Action**: Display "A transfer request is already pending"
- **HTTP Status**: 409

### `"Insufficient transfer fee"`
- **When**: Not sending enough ETH for transfer request
- **Frontend Action**: Display required transfer fee
- **HTTP Status**: 402

### `"Target has active franchise"`
- **When**: Trying to transfer to someone who already has a franchise
- **Frontend Action**: Display "Target address already has an active franchise"
- **HTTP Status**: 409

### `"No pending transfer"`
- **When**: Trying to approve/reject a transfer that doesn't exist
- **Frontend Action**: Display "No pending transfer to process"
- **HTTP Status**: 404

### `"Not authorized"`
- **When**: Non-owner/non-franchise-manager calling createPoll on ElectionsManager
- **Frontend Action**: Display "Not authorized to create polls"
- **HTTP Status**: 403

---

*Last Updated: v4.1 - 396 Tests Passing*
