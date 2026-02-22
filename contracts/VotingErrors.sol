// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

// ── Access Control ──────────────────────────────────────────────
error Unauthorized();
error OnlyPendingOwner();

// ── Poll Lifecycle ──────────────────────────────────────────────
error PollNotFound();
error PollStarted();
error PollEnded();
error PollNotActive();
error PollNotEnded();
error PollAlreadyRevealed();
error PollNotRevealed();
error PollIsPaused();
error PollNotPaused();

// ── Voting ──────────────────────────────────────────────────────
error AlreadyVoted();
error NotVoter();
error InvalidOption();
error VoteIsDelegated();
error SecretPoll();
error TokenVotingRequired();
error TokenVotingNotEnabled();
error VoteExecutionFailed();

// ── Token ───────────────────────────────────────────────────────
error InsufficientTokens();
error InsufficientBalance();
error NoTokenManager();
error TokenAlreadyExists();
error NoTokenForPoll();
error NonTransferable();
error OnlyBurningAllowed();
error InsufficientAllowance();
error TokenAlreadyUsed();

// ── Validation ──────────────────────────────────────────────────
error ZeroAddress();
error SameAddress();
error ZeroAmount();
error EmptyArray();
error ArrayLengthMismatch();
error EmptyTitle();

// ── Infrastructure ──────────────────────────────────────────────
error InfraLocked();
error ReentrantCall();
error BadPaymaster();
error MustSendETH();
error NoPlainEther();
error UnknownFunction();

// ── Delegation ──────────────────────────────────────────────────
error DelegationDisabled();
error AlreadyDelegated();
error NoDelegation();
error CannotSelfDelegate();
error DelegateeAlreadyDelegated();
error DelegateeNotAuthorized();
error DelegateAlreadyVoted();
error DelegationClosed();
error NotDelegatee();
error NoDelegationForTokenPolls();

// ── Secret Ballot ───────────────────────────────────────────────
error NotSecretBallot();
error SecretBallotNotEnabled();
error AlreadyCommitted();
error NoCommitment();
error AlreadyRevealed();
error NotInRevealPeriod();
error HashMismatch();
error InvalidCommitHash();
error SBMNotSet();
error SecretBallotAlreadyEnabled();
error RevealPeriodActive();
error RevealDurationTooShort();

// ── Franchise ───────────────────────────────────────────────────
error NoFranchise();
error FranchiseExpired();
error FranchiseExhausted();
error FranchiseNotFound();
error InsufficientFee();
error TransferPending();
error NoTransferPending();
error OwnerCannotBeFranchisee();
error CannotSelfTransfer();
error TargetHasActiveFranchise();
error ExceedsPollCap();
error InvalidPollCount();

// ── Duplicates ──────────────────────────────────────────────────
error DuplicateTitle();
error DuplicateName();
error DuplicateVoter();
error DuplicateOption();

// ── Limits ──────────────────────────────────────────────────────
error MaxOptionsReached();
error BatchLimitExceeded();

// ── Time ────────────────────────────────────────────────────────
error StartTimeInPast();
error StartTimeTooFarInFuture();
error DurationTooShort();
error TimeOverflow();

// ── ETH Transfer ────────────────────────────────────────────────
error TransferFailed();
error NoFeesToWithdraw();

// ── Signature ───────────────────────────────────────────────────
error SignatureExpired();
error InvalidSignature();
error InvalidSValue();
error InvalidVValue();

// ── Multi-Choice ────────────────────────────────────────────────
error MinTwoChoices();
error MaxChoicesExceedsOptions();
error MultiChoiceNotEnabled();
error InvalidChoiceCount();

// ── Quadratic ───────────────────────────────────────────────────
error QuadraticNotEnabled();

// ── Metadata ────────────────────────────────────────────────────
error EmptyMetadata();

// ── Upgradeable ─────────────────────────────────────────────────
error WeightOutOfRange();
