#!/usr/bin/env node
/**
 * Custom Errors Transformation Script (v2 — fixed negation)
 * Transforms require(condition, "string") → if (!(condition)) revert ErrorName()
 * Transforms revert("string") → revert ErrorName()
 * Also updates test files: revertedWith("string") → revertedWithCustomError(contract, "ErrorName")
 */

const fs = require('fs');
const path = require('path');

// ── Error String → Custom Error Name mapping ───────────────────
// Order matters: longer/more-specific strings first
const errorMap = new Map([
  // Access Control
  ['Admin only', 'Unauthorized'],
  ['Not authorized', 'Unauthorized'],
  ['No access', 'Unauthorized'],
  ['Only owner can call', 'Unauthorized'],
  ['Only owner can perform this action.', 'Unauthorized'],
  ['Only owner or EM', 'Unauthorized'],
  ['Only owner', 'Unauthorized'],
  ['Only SBM', 'Unauthorized'],
  ['Only voting contract', 'Unauthorized'],
  ['Only ElectionsManager', 'Unauthorized'],
  ['Only TokenManager can call', 'Unauthorized'],
  ['Only trusted relayers can execute', 'Unauthorized'],
  ['Not franchisee', 'Unauthorized'],
  ['Only voter or paymaster', 'Unauthorized'],
  ['Only poll admin or owner allowed.', 'Unauthorized'],
  ['Only admin', 'Unauthorized'],
  ['Only pending owner can accept', 'OnlyPendingOwner'],
  ['Only pending owner can accept.', 'OnlyPendingOwner'],
  ['Only pending owner', 'OnlyPendingOwner'],

  // Poll State — renamed to avoid conflicts with events
  ['Poll does not exist.', 'PollNotFound'],
  ['Poll does not exist', 'PollNotFound'],
  ['No poll', 'PollNotFound'],
  ['Cannot set weight after poll starts', 'PollStarted'],
  ['Poll already started', 'PollStarted'],
  ['Poll already ended', 'PollEnded'],
  ['Poll started', 'PollStarted'],
  ['Poll ended', 'PollEnded'],
  ['Poll not active for voting.', 'PollNotActive'],
  ['Not active', 'PollNotActive'],
  ['Not in commit phase.', 'PollNotActive'],
  ['Poll not ended', 'PollNotEnded'],
  ['Results not revealed yet.', 'PollNotRevealed'],
  ['Results not revealed.', 'PollNotRevealed'],
  ['Results not revealed', 'PollNotRevealed'],
  ['Not revealed', 'PollNotRevealed'],
  ['Poll is paused', 'PollIsPaused'],    // Renamed: avoids event PollPaused
  ['Poll already paused', 'PollIsPaused'],
  ['Poll not paused', 'PollNotPaused'],
  ['Reveal period active', 'RevealPeriodActive'],

  // Voting — renamed VoteDelegated → VoteIsDelegated to avoid event
  ['You have already voted.', 'AlreadyVoted'],
  ['Already voted.', 'AlreadyVoted'],
  ['Already voted', 'AlreadyVoted'],
  ['Voter voted', 'AlreadyVoted'],
  ['Voted already', 'AlreadyVoted'],
  ['Not authorized to vote in this poll.', 'NotVoter'],
  ['Voter not authorized', 'NotVoter'],
  ['Not voter', 'NotVoter'],
  ['Invalid option.', 'InvalidOption'],
  ['Invalid option', 'InvalidOption'],
  ['Vote delegated', 'VoteIsDelegated'],   // Renamed
  ['Delegated vote.', 'VoteIsDelegated'],  // Renamed
  ['Delegated', 'VoteIsDelegated'],        // Renamed
  ['Secret poll', 'SecretPoll'],
  ['Use commitVote', 'SecretPoll'],
  ['Token voting not enabled.', 'TokenVotingNotEnabled'],
  ['Token voting not enabled', 'TokenVotingNotEnabled'],
  ['Token-required: use commitVoteWithToken().', 'TokenVotingRequired'],
  ['Token voting required', 'TokenVotingRequired'],
  ['Needs token voting', 'TokenVotingRequired'],
  ['Vote execution failed', 'VoteExecutionFailed'],
  ['Deleg voted', 'DelegateAlreadyVoted'],
  ['Delegate voted', 'DelegateAlreadyVoted'],

  // Token
  ['Insufficient vote tokens', 'InsufficientTokens'],
  ['Insufficient tokens', 'InsufficientTokens'],
  ['Low tokens', 'InsufficientTokens'],
  ['Insufficient balance', 'InsufficientBalance'],
  ['Insufficient allowance', 'InsufficientAllowance'],
  ['Token already exists for this poll', 'TokenAlreadyExists'],
  ['No token for this poll', 'NoTokenForPoll'],
  ['Voting tokens are non-transferable', 'NonTransferable'],
  ['Only burning allowed', 'OnlyBurningAllowed'],
  ['Token used', 'TokenAlreadyUsed'],
  ['No token vote', 'TokenVotingNotEnabled'],
  ['No TM', 'NoTokenManager'],

  // Address Validation
  ['Invalid voting contract', 'ZeroAddress'],
  ['Invalid token manager', 'ZeroAddress'],
  ['Invalid voter address.', 'ZeroAddress'],
  ['Invalid voter', 'ZeroAddress'],
  ['Invalid relayer', 'ZeroAddress'],
  ['Invalid admin', 'ZeroAddress'],
  ['Invalid address', 'ZeroAddress'],
  ['New owner is the zero address.', 'ZeroAddress'],
  ['Invalid EM address', 'ZeroAddress'],
  ['Bad addr', 'ZeroAddress'],
  ['Zero address', 'ZeroAddress'],
  ['admin zero', 'ZeroAddress'],
  ['Bad admin', 'ZeroAddress'],
  ['Already owner', 'SameAddress'],
  ['Same admin', 'SameAddress'],
  ['Bad paymaster', 'BadPaymaster'],

  // Infrastructure — renamed InfrastructureLocked → InfraLocked
  ['Infra locked', 'InfraLocked'],
  ['ReentrancyGuard: reentrant call', 'ReentrantCall'],
  ['Reentrant call', 'ReentrantCall'],
  ['Must send ETH', 'MustSendETH'],
  ['No plain ether', 'NoPlainEther'],
  ['Use createFranchisePoll or requestTransfer', 'NoPlainEther'],
  ['Unknown function', 'UnknownFunction'],

  // Delegation
  ['Delegation off', 'DelegationDisabled'],
  ['Cannot delegate to self.', 'CannotSelfDelegate'],
  ['Already delegated.', 'AlreadyDelegated'],
  ['Delegatee already delegated', 'DelegateeAlreadyDelegated'],
  ['No active delegation.', 'NoDelegation'],
  ['Voter has not delegated.', 'NoDelegation'],
  ['Bad delegatee', 'DelegateeNotAuthorized'],
  ['Deleg closed', 'DelegationClosed'],
  ['You are not the delegatee.', 'NotDelegatee'],
  ['No delegation', 'NoDelegationForTokenPolls'],

  // Secret Ballot
  ['Not a secret ballot poll.', 'NotSecretBallot'],
  ['Secret ballot not enabled.', 'SecretBallotNotEnabled'],
  ['No commitment found.', 'NoCommitment'],
  ['Already committed.', 'AlreadyCommitted'],
  ['Not in reveal period.', 'NotInRevealPeriod'],
  ['Invalid reveal: hash mismatch.', 'HashMismatch'],
  ['Invalid commit hash.', 'InvalidCommitHash'],
  ['SBM not set', 'SBMNotSet'],
  ['Not SB', 'NotSecretBallot'],
  ['Already enabled', 'SecretBallotAlreadyEnabled'],
  ['Reveal duration too short', 'RevealDurationTooShort'],
  ['Not authorized.', 'NotVoter'],

  // Franchise
  ['Franchise does not exist', 'FranchiseNotFound'],
  ['Franchise expired', 'FranchiseExpired'],
  ['Franchise exhausted', 'FranchiseExhausted'],
  ['Max polls reached', 'FranchiseExhausted'],
  ['No franchise', 'NoFranchise'],
  ['Insufficient transfer fee', 'InsufficientFee'],
  ['Insufficient fee', 'InsufficientFee'],
  ['Transfer pending', 'TransferPending'],
  ['No pending transfer', 'NoTransferPending'],
  ['No pending transfer.', 'NoTransferPending'],
  ['Owner cannot be franchisee', 'OwnerCannotBeFranchisee'],
  ['Cannot self-transfer', 'CannotSelfTransfer'],
  ['Target has active franchise', 'TargetHasActiveFranchise'],
  ['Paymaster admin must be owner or franchisee', 'BadPaymaster'],
  ['Exceeds 100 poll cap', 'ExceedsPollCap'],
  ['Polls: 1-100', 'InvalidPollCount'],

  // Duplicates
  ['Poll title already exists.', 'DuplicateTitle'],
  ['Dup title', 'DuplicateTitle'],
  ['Dup name', 'DuplicateName'],
  ['Voter already authorized.', 'DuplicateVoter'],
  ['Dup voter', 'DuplicateVoter'],
  ['Duplicate option in choices.', 'DuplicateOption'],

  // Limits
  ['Maximum options limit reached.', 'MaxOptionsReached'],
  ['Max options', 'MaxOptionsReached'],
  ['Batch size exceeds maximum limit.', 'BatchLimitExceeded'],
  ['Batch limit', 'BatchLimitExceeded'],

  // Amounts
  ['Vote amount must be positive.', 'ZeroAmount'],
  ['Amount must be positive', 'ZeroAmount'],
  ['Duration must be > 0', 'ZeroAmount'],
  ['Must add > 0', 'ZeroAmount'],
  ['Zero tokens', 'ZeroAmount'],
  ['Empty arrays', 'EmptyArray'],
  ['Empty array', 'EmptyArray'],
  ['Array length mismatch.', 'ArrayLengthMismatch'],
  ['Array length mismatch', 'ArrayLengthMismatch'],

  // Time
  ['Start time cannot be in the past.', 'StartTimeInPast'],
  ['Start time too far in future.', 'StartTimeTooFarInFuture'],
  ['Poll duration too short.', 'DurationTooShort'],
  ['Invalid time range - overflow.', 'TimeOverflow'],

  // ETH Transfer
  ['ETH transfer failed', 'TransferFailed'],
  ['Withdraw failed', 'TransferFailed'],
  ['Refund failed', 'TransferFailed'],
  ['No fees', 'NoFeesToWithdraw'],

  // Signature
  ['Signature expired', 'SignatureExpired'],
  ['Invalid signature', 'InvalidSignature'],
  ['Invalid s value', 'InvalidSValue'],
  ['Invalid v value', 'InvalidVValue'],

  // Multi-choice
  ['Max choices exceeds option count.', 'MaxChoicesExceedsOptions'],
  ['Min 2 choices', 'MinTwoChoices'],
  ['Multi-choice not enabled', 'MultiChoiceNotEnabled'],
  ['Invalid choice count', 'InvalidChoiceCount'],

  // Quadratic
  ['Quadratic voting not enabled.', 'QuadraticNotEnabled'],
  ['Must vote for at least one option.', 'EmptyArray'],

  // Metadata
  ['Metadata URI cannot be empty.', 'EmptyMetadata'],

  // Upgradeable V2
  ['Weight must be between 1 and 10', 'WeightOutOfRange'],
  ['Title cannot be empty', 'EmptyTitle'],
]);

// File-specific overrides for ambiguous strings
const fileOverrides = {
  'SecretBallotManager.sol': {
    'Already revealed.': 'AlreadyRevealed',
  },
  'ElectionsManager.sol': {
    'Already revealed.': 'PollAlreadyRevealed',
  },
  'ElectionsManagerUpgradeable.sol': {
    'Already revealed.': 'PollAlreadyRevealed',
  },
  'ElectionsManagerUpgradeableV2.sol': {
    'Already revealed.': 'PollAlreadyRevealed',
  },
  'Ownable.sol': {
    'No pending transfer.': 'NoTransferPending',
  },
};

const rootDir = '/Users/ankit/work/git/votingsystem';

function getErrorName(errorString, filename) {
  const baseName = path.basename(filename);
  if (fileOverrides[baseName] && fileOverrides[baseName][errorString] !== undefined) {
    return fileOverrides[baseName][errorString];
  }
  return errorMap.get(errorString);
}

function findMatchingParen(content, startIdx) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = startIdx; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * Negate a Solidity condition for use in if-revert pattern.
 * require(COND, "err") → if (NEGATED_COND) revert Err()
 *
 * Strategy:
 * - If COND starts with '!' and is a simple boolean: remove '!'
 * - Otherwise: wrap as !(COND)
 */
function negateCondition(condition) {
  const trimmed = condition.trim();

  // Case 1: condition is "!expr" (no compound operators)
  // We can remove the '!' to negate
  if (trimmed.startsWith('!') && !trimmed.includes('&&') && !trimmed.includes('||')) {
    const inner = trimmed.substring(1).trim();
    // But if inner has comparison operators, we still need parens
    // e.g., "!a == b" should remain "a == b" (which is fine since require(!a == b, ...) means require(not_a_equals_b))
    // Actually: require(!polls[pollId].exists, ...) means the polls SHOULD NOT exist
    // Negation: polls[pollId].exists (if it does exist, revert)
    // This is correct as long as inner is a simple expression
    return inner;
  }

  // Case 2: everything else — wrap in !(...)
  // This handles: comparisons (a >= b), compound (a && b), etc.
  return `!(${trimmed})`;
}

function transformSolidityFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);

  if (filename === 'Voting.sol' || filename === 'ERC1967Proxy.sol') return false;

  let modified = false;

  // PASS 1: Transform require(condition, "string") statements
  let searchStart = 0;
  while (true) {
    const reqIdx = content.indexOf('require(', searchStart);
    if (reqIdx === -1) break;

    // Ensure standalone require
    if (reqIdx > 0 && /[a-zA-Z0-9_]/.test(content[reqIdx - 1])) {
      searchStart = reqIdx + 8;
      continue;
    }

    const closeIdx = findMatchingParen(content, reqIdx + 7);
    if (closeIdx === -1) { searchStart = reqIdx + 8; continue; }

    const innerContent = content.substring(reqIdx + 8, closeIdx);

    // Find ALL string literals in the inner content
    const innerRegex = /"([^"\\]*(\\.[^"\\]*)*)"/g;
    const innerMatches = [];
    let im;
    while ((im = innerRegex.exec(innerContent)) !== null) {
      innerMatches.push({ str: im[1], index: im.index, end: im.index + im[0].length, full: im[0] });
    }

    if (innerMatches.length === 0) { searchStart = closeIdx + 1; continue; }

    const lastMatch = innerMatches[innerMatches.length - 1];
    const errorString = lastMatch.str;
    const errorName = getErrorName(errorString, filePath);
    if (!errorName) {
      console.warn(`  WARNING: No mapping for "${errorString}" in ${filename}`);
      searchStart = closeIdx + 1;
      continue;
    }

    // Find comma separating condition from error string
    let commaIdx = -1;
    for (let i = lastMatch.index - 1; i >= 0; i--) {
      const ch = innerContent[i];
      if (ch === ',') { commaIdx = i; break; }
      if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') break;
    }

    if (commaIdx === -1) {
      // No comma → might be a single-arg require or revert-like
      searchStart = closeIdx + 1;
      continue;
    }

    const condition = innerContent.substring(0, commaIdx).trim();
    const negated = negateCondition(condition);

    // Find semicolon after closing paren
    let semiIdx = closeIdx + 1;
    while (semiIdx < content.length && /\s/.test(content[semiIdx])) semiIdx++;
    if (semiIdx < content.length && content[semiIdx] === ';') {
      // Good
    } else {
      // Look more carefully
      semiIdx = closeIdx + 1;
      while (semiIdx < content.length && content[semiIdx] !== ';') semiIdx++;
    }
    if (semiIdx >= content.length) { searchStart = closeIdx + 1; continue; }

    const replacement = `if (${negated}) revert ${errorName}();`;

    content = content.substring(0, reqIdx) + replacement + content.substring(semiIdx + 1);
    modified = true;
    searchStart = reqIdx + replacement.length;
  }

  // PASS 2: Transform revert("string") statements
  searchStart = 0;
  while (true) {
    const revIdx = content.indexOf('revert(', searchStart);
    if (revIdx === -1) break;

    if (revIdx > 0 && /[a-zA-Z0-9_]/.test(content[revIdx - 1])) {
      searchStart = revIdx + 7;
      continue;
    }

    const closeIdx = findMatchingParen(content, revIdx + 6);
    if (closeIdx === -1) { searchStart = revIdx + 7; continue; }

    const innerContent = content.substring(revIdx + 7, closeIdx);
    const strMatch = innerContent.match(/"([^"\\]*(\\.[^"\\]*)*)"/);
    if (!strMatch) { searchStart = closeIdx + 1; continue; }

    const errorString = strMatch[1];
    const errorName = getErrorName(errorString, filePath);
    if (!errorName) {
      console.warn(`  WARNING: No revert mapping for "${errorString}" in ${filename}`);
      searchStart = closeIdx + 1;
      continue;
    }

    let semiIdx = closeIdx + 1;
    while (semiIdx < content.length && content[semiIdx] !== ';') semiIdx++;

    const replacement = `revert ${errorName}();`;

    content = content.substring(0, revIdx) + replacement + content.substring(semiIdx + 1);
    modified = true;
    searchStart = revIdx + replacement.length;
  }

  // PASS 3: Add import statement if modified
  if (modified) {
    const relDir = path.relative(rootDir + '/contracts', path.dirname(filePath));
    let importPath;
    if (relDir === '' || relDir === '.') importPath = './VotingErrors.sol';
    else if (relDir === 'modules') importPath = '../VotingErrors.sol';
    else if (relDir.startsWith('upgradeable')) importPath = '../../VotingErrors.sol';
    else importPath = './VotingErrors.sol';

    const importStatement = `import "${importPath}";`;
    if (!content.includes(importStatement)) {
      const lastImportMatch = content.match(/^import\s+[^;]+;/gm);
      if (lastImportMatch) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1];
        const lastImportIdx = content.lastIndexOf(lastImport);
        const insertPoint = lastImportIdx + lastImport.length;
        content = content.substring(0, insertPoint) + '\n' + importStatement + content.substring(insertPoint);
      } else {
        const pragmaMatch = content.match(/pragma solidity[^;]+;/);
        if (pragmaMatch) {
          const insertPoint = content.indexOf(pragmaMatch[0]) + pragmaMatch[0].length;
          content = content.substring(0, insertPoint) + '\n\n' + importStatement + content.substring(insertPoint);
        }
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Transformed: ${filename}`);
  } else {
    console.log(`  ○ No changes: ${filename}`);
  }
  return modified;
}

// ── Test File Transformation ───────────────────────────────────

function transformTestFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  let modified = false;

  let defaultContract = 'voting';
  if (filename.includes('votingPaymaster')) defaultContract = 'paymaster';
  else if (filename.includes('tokenManager')) defaultContract = 'tokenManager';
  else if (filename.includes('votingToken')) defaultContract = 'votingToken';
  else if (filename.includes('franchiseManager') || filename.includes('franchise')) defaultContract = 'franchiseManager';
  else if (filename.includes('gasless')) defaultContract = 'paymaster';
  else if (filename.includes('upgradeable')) defaultContract = 'electionsManager';
  else if (filename.includes('errorCodes')) defaultContract = 'voting';
  else if (filename.includes('trustFeatures')) defaultContract = 'em';
  else if (filename.includes('advancedFeatures')) defaultContract = 'voting';
  else if (filename.includes('electionsManager')) defaultContract = 'voting';

  const revertedWithRegex = /\.to\.be\.revertedWith\(\s*"([^"]+)"\s*\)/g;

  content = content.replace(revertedWithRegex, (match, errorString) => {
    let errorName = getErrorName(errorString, filePath);

    // Handle "Already revealed." contextually
    if (errorString === 'Already revealed.') {
      // Check surrounding context to determine which contract
      const matchIdx = content.indexOf(match);
      const contextBefore = content.substring(Math.max(0, matchIdx - 200), matchIdx);
      if (contextBefore.includes('sbm.') || contextBefore.includes('secretBallot')) {
        errorName = 'AlreadyRevealed';
      } else {
        errorName = 'PollAlreadyRevealed';
      }
    }

    if (!errorName) {
      console.warn(`  WARNING: No test mapping for "${errorString}" in ${filename}`);
      return match;
    }

    let contractVar = defaultContract;

    // Specific overrides based on error and context
    if (errorString === 'Only TokenManager can call') {
      if (filename.includes('errorCodes')) contractVar = 'votingToken';
      else contractVar = defaultContract;
    }
    if (['Invalid voting contract', 'Invalid token manager', 'Invalid admin'].includes(errorString)) {
      if (filename.includes('votingPaymaster')) contractVar = 'VotingPaymaster';
      else if (filename.includes('tokenManager')) contractVar = 'TokenManager';
    }

    modified = true;
    return `.to.be.revertedWithCustomError(${contractVar}, "${errorName}")`;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Test updated: ${filename}`);
  } else {
    console.log(`  ○ No test changes: ${filename}`);
  }
  return modified;
}

// ── Main ───────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════');
console.log(' Custom Errors Transformation v2');
console.log('═══════════════════════════════════════════\n');

const contractFiles = [
  'contracts/ElectionsManager.sol',
  'contracts/FranchiseManager.sol',
  'contracts/SecretBallotManager.sol',
  'contracts/VotingPaymaster.sol',
  'contracts/TokenIntegratedVoting.sol',
  'contracts/TokenManager.sol',
  'contracts/VotingToken.sol',
  'contracts/TimeValidator.sol',
  'contracts/VotingReader.sol',
  'contracts/Ownable.sol',
  'contracts/modules/DelegationVoting.sol',
  'contracts/modules/MultiChoiceVoting.sol',
  'contracts/modules/QuadraticVoting.sol',
  'contracts/modules/MetadataVoting.sol',
  'contracts/upgradeable/v1/ElectionsManagerUpgradeable.sol',
  'contracts/upgradeable/v2/ElectionsManagerUpgradeableV2.sol',
];

console.log('Transforming Solidity contracts:\n');
let contractsModified = 0;
for (const file of contractFiles) {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    if (transformSolidityFile(fullPath)) contractsModified++;
  } else {
    console.log(`  ✗ Not found: ${file}`);
  }
}

const testFiles = fs.readdirSync(path.join(rootDir, 'test'))
  .filter(f => f.endsWith('.test.ts') || f.endsWith('.test.js'))
  .map(f => path.join(rootDir, 'test', f));

console.log('\nTransforming test files:\n');
let testsModified = 0;
for (const file of testFiles) {
  if (fs.existsSync(file)) {
    if (transformTestFile(file)) testsModified++;
  }
}

console.log(`\n═══════════════════════════════════════════`);
console.log(` Done: ${contractsModified} contracts, ${testsModified} test files modified`);
console.log('═══════════════════════════════════════════\n');
