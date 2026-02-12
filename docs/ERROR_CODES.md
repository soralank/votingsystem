# Error Codes Reference - Token-Based Gasless Voting System

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

### `"Poll does not exist."`
- **When**: Attempting operations on a non-existent poll ID
- **Frontend Action**: Display "Poll not found" message, redirect to polls list
- **HTTP Status**: 404

### `"Poll title already exists."`
- **When**: Creating a poll with a duplicate title
- **Frontend Action**: Display validation error, suggest alternative title
- **HTTP Status**: 400

### `"Poll already started; cannot add options."`
- **When**: Trying to add options after poll has started
- **Frontend Action**: Display "Poll is live, options locked" message
- **HTTP Status**: 400

### `"Poll already started; cannot add voters."`
- **When**: Trying to add voters after poll has started
- **Frontend Action**: Display "Poll is live, voter list locked" message
- **HTTP Status**: 400

### `"Poll already started; cannot remove voters."`
- **When**: Trying to remove voters after poll has started
- **Frontend Action**: Display "Poll is live, cannot modify voter list" message
- **HTTP Status**: 400

### `"Poll ended; cannot add options."`
- **When**: Trying to add options to an ended poll
- **Frontend Action**: Display "Poll has ended" message
- **HTTP Status**: 400

### `"Poll ended; cannot add voters."`
- **When**: Trying to add voters to an ended poll
- **Frontend Action**: Display "Poll has ended, cannot add voters" message
- **HTTP Status**: 400

### `"Poll ended; cannot remove voters."`
- **When**: Trying to remove voters from an ended poll
- **Frontend Action**: Display "Poll has ended, cannot modify voters" message
- **HTTP Status**: 400

### `"Poll ended; cannot vote."`
- **When**: Attempting to vote in an ended poll
- **Frontend Action**: Display "Voting has closed" message with results link
- **HTTP Status**: 400

### `"Poll not active for voting."`
- **When**: Voting outside the active voting period
- **Frontend Action**: Display poll start time or "Poll has ended" message
- **HTTP Status**: 400

### `"Maximum options limit reached."`
- **When**: Attempting to add more than 100 options
- **Frontend Action**: Display "Maximum 100 options allowed" message
- **HTTP Status**: 400

### `"Option name already exists in this poll."`
- **When**: Adding a duplicate option name
- **Frontend Action**: Display validation error, suggest alternative name
- **HTTP Status**: 400

---

## Voter Authorization Errors

### `"Not authorized to vote in this poll."`
- **When**: Unauthorized address attempts to vote
- **Frontend Action**: Display "You are not authorized to vote in this poll"
- **HTTP Status**: 403

### `"Voter already authorized."`
- **When**: Attempting to authorize an already authorized voter
- **Frontend Action**: Display "Voter is already authorized" message
- **HTTP Status**: 400

### `"Voter not authorized."`
- **When**: Trying to remove a voter who is not authorized
- **Frontend Action**: Display "Voter is not in the authorized list" message
- **HTTP Status**: 404

### `"Invalid voter address."`
- **When**: Providing zero address or invalid address for voter
- **Frontend Action**: Display "Invalid wallet address" validation error
- **HTTP Status**: 400

### `"Batch size exceeds maximum limit."`
- **When**: Trying to add more than 50 voters at once
- **Frontend Action**: Display "Maximum 50 voters per batch, split into multiple transactions"
- **HTTP Status**: 400

### `"Cannot remove voter who already voted."`
- **When**: Attempting to remove a voter after they've voted
- **Frontend Action**: Display "Cannot remove voter who has already cast their vote"
- **HTTP Status**: 400

---

## Voting Errors

### `"You have already voted."`
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

### `"This poll requires token-based voting. Use voteInPollWithToken()"`
- **When**: Using traditional vote method on a token-required poll
- **Frontend Action**: Display "This poll requires token-based voting" with token balance info
- **HTTP Status**: 400

### `"Token voting not enabled for this poll."`
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

### `"Only poll admin or owner allowed."`
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

### `"Cannot reveal before poll end plus buffer."`
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

### `"Results not revealed."`
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
    "Poll not active for voting.": {
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
- `"Poll not active for voting."` (can wait and retry)

Errors that cannot be retried:
- `"Already voted."`
- `"Poll ended; cannot vote."`
- `"Not authorized to vote in this poll."`
- `"Insufficient tokens"`

---

## Testing Error Handling

All 156 tests pass, covering:
- ✅ All error conditions
- ✅ Authorization checks
- ✅ Time validations
- ✅ Token  operations
- ✅ Gasless voting workflow
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

---

*Last Updated: Implementation Complete - All 156 Tests Passing*
