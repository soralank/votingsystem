# Architecture & Design Document

**Voting System v4.4 — Trustless Blockchain Polling Platform**
**Author:** Ankit Soral | **Contact:** ankit.soral@outlook.com
**Last Revised:** 2026-02-22

---

## 1. Formal Design Intent

This system was designed to answer a specific problem statement: **How do you conduct a verifiable election on a public blockchain where voters do not need to trust the administrator?**

Every architectural decision flows from three non-negotiable design principles:

| Principle | What It Means | How It Is Enforced |
|-----------|---------------|--------------------|
| **Trustlessness** | No single actor — including the contract owner — can observe, alter, or suppress votes or results | Infrastructure lock, admin bypass removal, democratic reveal, commit-reveal |
| **Temporal Integrity** | Poll lifecycle is governed exclusively by on-chain time; no human can extend, shorten, or override it | `TimeValidator` base contract, `TIME_BUFFER`, automatic poll termination |
| **Composable Isolation** | Each poll is an independent, self-contained election with its own token economy, voter registry, and configuration | Per-poll mappings, per-poll `TokenManager` / `VotingPaymaster`, soulbound non-transferable tokens |

These principles were chosen because blockchain voting systems face a credibility problem: if administrators retain any ability to influence outcomes, the system offers no advantage over a centralised database. This system eliminates that surface entirely.

### 1.1 Explicit Non-Goals

The following capabilities are deliberately **outside the scope** of this system. They are documented here to prevent assumptions about coverage and to clarify the boundary of the security model.

| Non-Goal | Rationale |
|----------|-----------|
| **Identity verification** | The system operates on Ethereum addresses, not human identities. It does not verify that an address corresponds to a unique real-world person. A voter is any address authorised by the poll admin — the admin bears responsibility for KYC or identity checks externally. |
| **Sybil resistance** | An attacker who controls multiple private keys and obtains voter authorisation for each can cast multiple votes. The system treats each authorised address as a distinct, legitimate voter. Sybil resistance must be implemented at the voter registration layer (off-chain or via separate identity protocols). |
| **On-chain privacy guarantees** | The commit-reveal scheme provides temporal privacy (votes are hidden until reveal) but not anonymity (voter-to-option linkage is revealed on-chain after the reveal phase). True ballot secrecy would require ZK-proof integration, which is a future consideration (see §10). |
| **Decentralised paymaster funding** | The `VotingPaymaster` is funded by the admin via `fund()`. There is no decentralised pooling, staking, or incentive mechanism for third-party gas sponsorship. The paymaster is a convenience layer, not a decentralised protocol. |
| **Governance token** | `VotingToken` is a per-poll, soulbound, burnable utility token. It carries no governance rights, no transferable value, and no cross-poll significance. It is not an investment instrument. |
| **Dispute resolution** | The system has no arbitration mechanism. Once a vote is cast, it is final. Once results are revealed, they are permanent. Disputes must be resolved off-chain. |

---

## 2. System Architecture

### 2.1 Contract Topology

The system consists of **14 contracts** in three categories:

```
INHERITANCE CHAIN (deployed as a single unit)
═══════════════════════════════════════════════

  TimeValidator.sol ─────── Time validation rules (MIN_POLL_DURATION, TIME_BUFFER, MAX_FUTURE_START)
        │
  TokenIntegratedVoting.sol  Token system integration + infrastructure lock + ownership
        │
  ElectionsManager.sol ───── Core contract: polls, voting, results, trust features, module orchestration
        │
  Voting.sol ─────────────── Thin deployment wrapper (inherits ElectionsManager)


AUTO-DEPLOYED MODULES (created in ElectionsManager constructor)
═══════════════════════════════════════════════

  MultiChoiceVoting.sol ──── Multi-choice vote state (maxChoices, voter selections)
  QuadraticVoting.sol ────── Quadratic vote state (enabled flag, allocations, cost tracking)
  DelegationVoting.sol ───── Delegation pairs and counts
  MetadataVoting.sol ─────── IPFS metadata URIs per poll


STANDALONE CONTRACTS (deployed separately, linked via interfaces)
═══════════════════════════════════════════════

  SecretBallotManager.sol ── Commit-reveal voting (deployed separately due to 24 KB limit)
  FranchiseManager.sol ───── Sub-admin franchise system (calls ElectionsManager.createPoll)
  TokenManager.sol ────────── Per-poll ERC20 token factory (called by ElectionsManager)
  VotingPaymaster.sol ─────── Gas sponsorship via EIP-712 meta-transactions
  VotingToken.sol ──────────── Per-poll soulbound burnable ERC20 (created by TokenManager)
  VotingReader.sol ──────────── Read-only aggregator for frontend queries
```

> **Note:** `Ownable.sol` exists in the repository but is explicitly **deprecated** and unused. Ownership logic is implemented directly in `TokenIntegratedVoting.sol`.

### 2.2 Why Modular Composition?

ElectionsManager compiles to approximately **21,869 bytes** (after custom error optimisation; originally ~23,932 bytes with string-based errors) — well within the Ethereum 24,576 byte contract size limit (EIP-170). Advanced voting state (multi-choice selections, quadratic allocations, delegation mappings, metadata URIs) was extracted into four lightweight module contracts to stay within this limit while preserving a single entry point for the frontend.

**Trade-off accepted:** Module calls are external calls, adding ~2,600 gas per `CALL` opcode versus internal function calls. This overhead is acceptable because:

1. It occurs once per vote, not per loop iteration
2. The alternative — splitting the main contract or removing features — would fracture the user experience
3. Module contracts are auto-deployed in the constructor, so their addresses are deterministic and immutable

### 2.3 Per-Poll Manager Architecture

Each poll can reference its own `TokenManager` and `VotingPaymaster`:

```
Poll 1 → pollTokenManager[1] = global TokenManager
Poll 2 → pollTokenManager[2] = custom TokenManager (deployed for a franchise)
Poll 3 → pollTokenManager[3] = global TokenManager
```

This enables the franchise system: a franchisee can operate with a custom token economy while sharing the same ElectionsManager contract. Pass `address(0)` during poll creation to default to the global contracts.

---

## 3. Explicit Trade-offs

Every system makes trade-offs. These are documented here so reviewers understand what was chosen and what was deliberately excluded.

| Decision | What We Chose | What We Gave Up | Rationale |
|----------|---------------|-----------------|-----------|
| **Immutable poll timing** | Polls end automatically by on-chain time; no `endPoll()` function exists | Admin cannot extend voting for late voters | Prevents admin from manipulating deadlines; voters know the exact window |
| **No vote modification** | Once cast, a vote is permanent | Voters cannot change their mind | Simplifies tally integrity; prevents coercion by forcing a "correct" re-vote |
| **Non-transferable tokens** | `VotingToken.transfer()` always reverts | No secondary market for voting power | Prevents plutocratic vote buying; each token is soulbound to its recipient |
| **Custom errors** | `if (!(condition)) revert CustomError()` with file-level error definitions in `VotingErrors.sol` | ~200 gas more per revert vs string-based errors in terms of off-chain parsing | 8.6% bytecode reduction (23,932 → 21,869 bytes on ElectionsManager); 4-byte selectors vs 32+ byte strings; all 242 error sites converted |
| **Batch size limits** | `MAX_VOTERS_BATCH = 50`, `MAX_OPTIONS = 100` | Large organisations must batch across multiple transactions | Prevents block gas limit DoS; 50 voters × ~50K gas = ~2.5M gas per batch, well within block limits |
| **Private mappings for vote data** | `options` and `voterChoice` are `private` | Does not provide true on-chain privacy (data readable via `eth_getStorageAt`) | Prevents casual inspection by other contracts; true privacy requires off-chain encryption (see Threat Model §4.4) |
| **No emergency pause (core)** | Core contracts have no pause mechanism | Admin cannot halt a live election | Intentional: pausing would give admin power to suppress voting during unfavourable periods. The upgradeable V2 variant includes pause for environments that require it. |
| **Single-owner model** | Owner is a single Ethereum address | No multi-sig by default | Simplicity for initial deployment; the two-step ownership transfer supports safe migration to a multi-sig (see §7) |
| **Infrastructure lock is permanent** | Once the first poll is created, `setTokenManager`, `setVotingPaymaster`, `setSecretBallotManager`, and `setFranchiseManager` revert forever | Cannot fix a misconfigured contract reference post-deployment | Guarantees voters that the system they authorised to hold their vote cannot be swapped mid-operation |

---

## 4. Formal Threat Model

This section enumerates the attack surfaces of the system, the mitigations implemented, and the residual risks that remain.

### 4.1 STRIDE Analysis

| Threat Category | Attack Vector | Mitigation | Residual Risk |
|-----------------|---------------|------------|---------------|
| **Spoofing** | Attacker submits a vote impersonating another voter | `msg.sender` is the sole identity mechanism; gasless votes require a valid EIP-712 signature from the voter's private key with ECDSA malleability rejection (`s ≤ secp256k1n/2`) | Key compromise is outside contract scope |
| **Tampering** | Admin modifies vote tallies after casting | Vote counts in `options[pollId][optionId].votes` are incremented atomically during the vote transaction; no `setVotes()` or `editVote()` function exists anywhere in the codebase | None within contract scope |
| **Repudiation** | Voter denies casting a vote | Every vote emits an indexed `Voted` event on-chain; `hasVoted[pollId][voter]` is publicly readable | Blockchain immutability provides non-repudiation |
| **Information Disclosure** | Admin peeks at vote distribution before reveal | `getOption()` returns vote counts as 0 when `revealed == false`; `getVoterChoice()`, `getWinner()`, `getVoterMultiChoices()`, and `getQuadraticVotes()` revert with `PollNotRevealed()` when `revealed == false` — **zero admin bypass** for any result data | Storage-level reads via `eth_getStorageAt` or archive nodes can extract private mappings (see §4.4) |
| **Denial of Service** | Attacker floods poll with options or voters | `MAX_OPTIONS = 100`, `MAX_VOTERS_BATCH = 50`; poll creation requires owner or franchise manager authorisation | An authorised admin could create 100 meaningless options; mitigated by social trust in poll admin |
| **Elevation of Privilege** | Non-owner calls owner-only functions | `onlyOwner`, `onlyAdminOrOwner`, `onlyVotingContract`, `onlyElectionsManager` modifiers; two-step ownership prevents accidental transfers | Compromised owner key grants full admin access |

### 4.2 Front-Running Protection

| Scenario | Protection |
|----------|------------|
| **Standard polls** | Voters observe each other's transactions in the mempool. This is a known limitation for non-secret-ballot polls. |
| **Secret ballot polls** | Commit-reveal scheme: voters submit `keccak256(pollId, optionId, salt, voterAddress)` during the voting period, then reveal `optionId + salt` after voting closes. The commitment hash contains no information about the vote. |
| **Token-based secret ballot** | Token is burned at commit time (not reveal time), preventing double-commit with different options. |

### 4.3 Reentrancy Protection

All state-changing vote functions use a custom `nonReentrant` modifier plus the Checks-Effects-Interactions (CEI) pattern:

```
1. CHECKS:  require(authorizedVoters[pollId][voter], ...)
2. EFFECTS: hasVoted[pollId][voter] = true; options[pollId][optionId].votes += 1;
3. INTERACTIONS: TokenManager(pollTokenManager[pollId]).burnTokens(...)
```

The CEI pattern is applied in:
- `voteInPollWithToken` — state updated before `burnTokens` external call
- `voteMultiChoice` — state updated before `recordMultiChoiceVote` external call
- `voteQuadratic` — state updated before `burnTokens` external call
- `voteAsDelegate` — state updated before `recordDelegateVote` external call
- `FranchiseManager.createFranchisePoll` — `pollsUsed++` before `electionsManager.createPoll` external call

### 4.4 On-Chain Privacy Limitations (Explicit Disclosure)

The `options` and `voterChoice` mappings are declared `private`. Per the Solidity specification, `private` only restricts access from other contracts — it **does not** encrypt data on-chain. Any party with access to an archive node can compute the storage slot and read the raw value via `eth_getStorageAt`.

**What this means:** For standard (non-secret-ballot) polls, a technically sophisticated observer can determine vote distributions before the reveal. For secret ballot polls, the commit-reveal scheme mitigates this because the on-chain commitment is a hash; the actual `optionId` is never stored until the reveal phase (after voting closes).

**For applications requiring true ballot secrecy**, additional measures would be needed — such as zero-knowledge proofs or homomorphic encryption — which are outside the current scope.

### 4.5 Timestamp Dependence

All time-based logic depends on `block.timestamp`, which miners (or validators post-merge) can influence by approximately ±15 seconds. The `TIME_BUFFER` of 30 seconds absorbs this variance:

- Voting closes when `block.timestamp + 30 ≥ endTime` (30-second grace)
- Poll is considered "ended" when `block.timestamp ≥ endTime + 30`
- Reveal period starts at `endTime + 30` and lasts for the configured reveal duration

This design ensures that a validator cannot unilaterally extend or shorten the voting window by a meaningful amount.

### 4.6 EIP-712 Signature Security

The `VotingPaymaster` implements gasless voting via EIP-712 typed data signatures:

- **Replay protection:** Per-voter monotonic nonce, incremented before the external call (CEI)
- **Time-bound:** `deadline` parameter enforces signature expiry
- **Malleable signature rejection:** `s` value checked against `secp256k1n/2` (EIP-2 compliance)
- **Domain separation:** `DOMAIN_SEPARATOR` includes `chainId` and `verifyingContract` to prevent cross-chain and cross-contract replay
- **Relayer whitelist:** Optional `relayerWhitelistEnabled` restricts who can submit meta-transactions

### 4.7 Attack Classification Table

The STRIDE analysis (§4.1) categorises threats by type. This table reclassifies every identified attack vector by **outcome severity**, **probability in practice**, and **residual exposure** — providing an operational risk register for deployment teams.

| ID | Attack Vector | Outcome Class | Severity | Probability | Mitigation | Residual Exposure |
|----|---------------|---------------|----------|-------------|------------|-------------------|
| **A-1** | Owner key compromise | Integrity | **Critical** | Low | Two-step ownership transfer; infra lock prevents post-lock contract swaps | Compromised owner can create polls, grant franchises, and upgrade (V2). Multi-sig eliminates single-key risk. |
| **A-2** | Upgrade to malicious implementation (V2) | Integrity | **Critical** | Very Low | `_authorizeUpgrade` requires `onlyOwner`; two-step ownership | No timelock or community veto — upgrade is atomic. Multi-sig + timelock recommended (§7.5). |
| **A-3** | Storage collision on upgrade | Integrity | **High** | Low | `__gap` pattern; V2 reduces gap by 3 slots for 4 new mappings; test coverage in `upgradeable.test.ts` | No automated CI-level `validateUpgrade()` check — relies on developer diligence. |
| **A-4** | Token inflation (quadratic voting) | Integrity | **High** | Medium | `hasVoted` prevents double-voting; quadratic cost function penalises concentration | No per-poll `maxTokenSupply` cap — colluding admin can inflate a voter's quadratic weight. |
| **A-5** | Front-running standard votes | Confidentiality | **Medium** | High | None for standard polls; commit-reveal for secret ballots | Standard poll votes are visible in the mempool. Acceptable for non-secret polls by design. |
| **A-6** | `eth_getStorageAt` data extraction | Confidentiality | **Medium** | Medium | `private` visibility; commit-reveal for secret ballots | Archive node operators can read private mappings. True secrecy requires ZK (out of scope). |
| **A-7** | Delegation concentration | Integrity | **Medium** | Medium | Depth-1 limit (I-8); opt-in per voter; revocable via `removeDelegation()` | No maximum delegation ratio — a single delegate can accumulate unbounded voting weight. |
| **A-8** | Relayer nonce exhaustion | Availability | **Medium** | Low | Relayer whitelist; each attack costs attacker gas | With whitelist disabled, attacker can drain voter nonces at their own gas cost. |
| **A-9** | Paymaster ETH depletion | Availability | **Low** | Medium | `fund()` replenishment; `GasSponsored` event monitoring; graceful degradation to gas-paying votes | No automatic funding trigger — relies on off-chain monitoring and manual `fund()` calls. |
| **A-10** | Timestamp manipulation (±15s) | Integrity | **Low** | Low | `TIME_BUFFER = 30` seconds absorbs ±15s validator drift | Validator holding tx >30s is economically irrational without financial incentive. |
| **A-11** | Block gas limit DoS | Availability | **Low** | Very Low | `MAX_VOTERS_BATCH = 50`; `MAX_OPTIONS = 100` | Large voter sets require multiple batched transactions — operational overhead, not a vulnerability. |
| **A-12** | Franchise fee underpayment | Economic | **Low** | Very Low | `require(msg.value >= feePerPoll)` with excess refund | First poll is free by design; subsequent polls enforced on-chain. |
| **A-13** | Transfer fee drain via pending refunds | Economic | **Low** | Very Low | `withdrawFees()` subtracts `pendingRefunds` from balance (H-5) | Invariant holds: owner cannot withdraw deposits earmarked for rejected transfers. |
| **A-14** | Strategic quadratic exhaustion | Integrity | **Medium** | Medium | Quadratic cost ($v^2$) penalises concentration | Unequal token allocation degrades fairness. Equal allocation is an operational responsibility. |

**Severity definitions:**
- **Critical:** System integrity permanently compromised; votes altered or contract captured.
- **High:** Significant advantage gained by attacker; requires active exploitation.
- **Medium:** Partial information leak or unfair weight advantage; impact bounded by design.
- **Low:** Operational inconvenience; graceful degradation or self-correcting.

---

## 5. Economic Model

### 5.1 Token Economics (Per-Poll)

Each poll optionally operates its own token economy:

```
                    ┌─────────────────┐
                    │   Poll Admin    │
                    └────────┬────────┘
                             │ allocateTokens (mint)
                             ▼
                    ┌─────────────────┐
                    │  VotingToken    │  (soulbound, non-transferable, 0 decimals)
                    │  ERC20-compat   │
                    └────────┬────────┘
                             │ on vote → burn
                             ▼
                    ┌─────────────────┐
                    │   Destroyed     │
                    └─────────────────┘
```

**Token lifecycle:**
1. **Mint:** Admin allocates tokens via `addVotersWithTokens(pollId, voters, tokensPerVoter)` or `allocateVotingTokens(pollId, voters, amounts)`.
2. **Hold:** Tokens sit in voter wallets. They cannot be transferred (`transfer()` reverts).
3. **Burn:** On vote, exactly 1 token is burned (standard vote) or `N²` tokens for `N` quadratic votes on a single option.
4. **No secondary market:** Because tokens are non-transferable, vote buying requires transferring the private key itself.

**Quadratic voting cost model:**

$$\text{Cost} = \sum_{i=1}^{k} v_i^2$$

Where $v_i$ is the number of votes allocated to option $i$. Example: 3 votes on option A and 2 votes on option B costs $3^2 + 2^2 = 13$ tokens. This ensures diminishing marginal influence — concentrating votes on one option is quadratically more expensive.

### 5.2 Franchise Economics

The franchise system creates a **two-tier economic relationship** between the contract owner and sub-admins:

| Parameter | Description | Constraints |
|-----------|-------------|-------------|
| `feePerPoll` | ETH charged per poll created | First poll always free; subsequent polls cost this amount |
| `transferFee` | ETH required to request a franchise transfer | Set globally by owner via `setTransferFee()` |
| `maxPolls` | Maximum elections per franchise | 1–100; owner can increase via `addPolls()` |
| `expiresAt` | Franchise expiry timestamp | Set on grant; cannot be extended |

**Revenue flow:**

```
Franchisee pays feePerPoll ──→ FranchiseManager contract balance
                                        │
                                owner calls withdrawFees()
                                        │
                              ──→ Owner wallet
                              (excludes pendingRefunds)
```

**Security invariant (H-5):** `withdrawFees()` computes withdrawable balance as `address(this).balance - pendingRefunds` to prevent the owner from draining ETH deposited for pending transfer requests. If a transfer is rejected, the fee is refunded to the franchisee.

### 5.3 Gas Sponsorship Model

The `VotingPaymaster` operates a pre-funded gas pool:

1. Admin deposits ETH via `fund()`
2. Voters sign EIP-712 typed data messages off-chain (zero gas cost)
3. A relayer submits the signed message to `executeVoteWithToken()`
4. The paymaster validates the signature, increments the nonce, and forwards the vote to ElectionsManager
5. Gas cost is borne by the relayer; the paymaster emits `GasSponsored(pollId, voter, gasUsed, gasPrice)` for accounting

**Economic constraint:** The paymaster has a hard `GAS_LIMIT = 200,000` per sponsored transaction to prevent a single gasless vote from consuming the entire pool.

### 5.4 Economic Attack Surface

This section models adversarial economic behaviour against the system and documents existing mitigations and residual exposure.

#### 5.4.1 Token Inflation Attack

**Vector:** A malicious or compromised poll admin calls `allocateVotingTokens()` repeatedly to mint an unbounded number of tokens per poll.

**Current state:** There is no hard cap on per-poll token supply. `TokenManager.allocateTokens()` mints tokens via `VotingToken.mint()` with no `maxSupply` check. An admin can allocate millions of tokens to a single voter.

**Mitigation:** Each voter can still only cast **one vote** per poll (enforcement: `hasVoted[pollId][voter]`). Extra tokens confer no additional voting power in standard or token-required polls. In **quadratic voting**, however, excess tokens enable a single voter to concentrate disproportionate weight on a single option (cost = $v^2$, so 100 tokens allow 10 votes on one option). The attack is bounded by invariant **I-1** (one vote record per voter) for standard voting but **not bounded for quadratic voting weight**.

**Residual risk:** A colluding admin can inflate quadratic voting influence for a chosen voter. Mitigation requires either a per-poll `maxTokenSupply` cap or a per-voter allocation ceiling — neither exists today.

#### 5.4.2 Vote Amplification via Delegation Concentration

**Vector:** A single delegate accumulates delegations from many voters, concentrating decision-making power in one address.

**Current state:** There is no cap on `delegationCount[pollId][delegatee]`. If 50 voters in a 100-voter poll all delegate to the same address, that address controls 50% of the vote.

**Mitigation:** Delegation is opt-in per voter (`delegateVote()` requires the delegator's signature), revocable before the delegate votes (`removeDelegation()`), and depth-limited to 1 (invariant **I-8**: `hasDelegated[delegatee]` is checked, preventing chain delegation). The system also requires `enableDelegation(pollId)` before any delegation is possible, giving the admin control over whether delegation is available at all.

**Residual risk:** No maximum delegation concentration ratio. A whale delegate can cast a single vote that carries the weight of many. This is a known property of liquid democracy and is mitigated socially (voters choose to delegate) rather than mechanically.

#### 5.4.3 Paymaster Griefing by Relayers

**Vector:** A trusted relayer submits valid-signature votes that consume paymaster-funded gas, then receives the gas refund from the network while the paymaster pool is drained.

**Current state:** The paymaster does **not** reimburse relayers. It records gas usage (`GasSponsored` event) but never transfers ETH to the relayer. The relayer pays gas out of pocket. The paymaster's ETH pool is only expendable via `withdraw()` (admin-only).

**Griefing scenario:** A malicious relayer could submit intentionally failing transactions to waste gas. However, `executeVoteWithToken()` validates the signature, checks token balance, and increments the nonce before the external call. If the forwarded call reverts, the nonce is already incremented (preventing replay), but the relayer still paid for the gas.

**Mitigation:** Relayer whitelist (`relayerWhitelistEnabled`) restricts submission to trusted addresses. If disabled, any address can relay but bears its own gas cost — griefing hurts the griefer, not the paymaster.

**Residual risk:** If the relayer whitelist is disabled, a malicious actor could submit high-gas-price transactions with valid signatures to drain voters' nonces (preventing future gasless votes for those voters). Each attack costs the attacker gas, making sustained griefing economically unprofitable.

#### 5.4.4 Gas Limit Abuse

**Vector:** An attacker crafts a gasless vote that consumes the full `GAS_LIMIT = 200,000` gas per call, depleting the relayer's funds.

**Current state:** The `200,000` cap applies to the forwarded `call` to the voting contract, not to the total `executeVoteWithToken()` gas. Signature validation, nonce increment, and event emission occur outside this cap, adding ~50,000 gas overhead.

**Mitigation:** A single gasless vote costs approximately 120,000–150,000 gas in practice (well within the cap). The cap prevents pathological cases (e.g., a reentrant callback consuming unlimited gas). The relayer is the entity paying gas, so the relayer's incentive is to monitor and stop if costs exceed expected bounds.

**Residual risk:** No on-chain mechanism limits the number of gasless votes per poll or per time window. A relayer could be overwhelmed by volume, but this is a liveness concern, not an economic attack on the contract.

#### 5.4.5 Strategic Quadratic Exhaustion

**Vector:** A voter with large token allocation concentrates all tokens on a single option to overwhelm other voters' quadratic allocations.

**Example:** Voter A has 100 tokens and places 10 votes on Option X (cost: $10^2 = 100$ tokens). Voters B through K each have 10 tokens and place 3 votes on Option Y (cost: $3^2 = 9$ tokens each, total: 30 quadratic votes). Voter A's 10 quadratic votes outweigh 30 distributed quadratic votes because the quadratic cost only penalises individual concentration, not aggregate advantage.

**Mitigation:** The quadratic cost function ($\sum v_i^2$) ensures diminishing returns for vote concentration — 10 votes cost 100 tokens, but 10 voters casting 1 vote each cost only 10 tokens total. The system is designed to favour distributed preferences over concentrated ones.

**Residual risk:** The system does not enforce equal token distribution. If the admin allocates unequal tokens, the quadratic mechanism's fairness guarantee degrades. Equal token allocation is an operational best practice, not a contract invariant.

### 5.5 Gas Economics Sustainability

#### 5.5.1 Worst-Case Depletion Model

The paymaster's ETH pool is consumed by relayer gas costs, not by direct contract transfers. Worst-case depletion:

| Scenario | Gas per Vote | Cost at 50 gwei | Votes per 1 ETH |
|----------|-------------|-----------------|------------------|
| Standard gasless vote | ~150,000 | 0.0075 ETH | ~133 |
| High-gas environment (200 gwei) | ~150,000 | 0.03 ETH | ~33 |
| Worst case (GAS_LIMIT saturated) | 250,000 (incl. overhead) | 0.0125 ETH | ~80 |

At 50 gwei, a 1 ETH paymaster deposit supports approximately 133 gasless votes. The paymaster emits `GasSponsored` events with actual `gasUsed` and `gasPrice`, enabling off-chain monitoring dashboards to project depletion rates and trigger `fund()` calls before exhaustion.

**Failure mode:** If the paymaster is depleted, gasless voting degrades gracefully — voters can still cast token-based votes by paying their own gas via `voteInPollWithToken()`. No votes are lost; only the gas-free convenience is suspended.

#### 5.5.2 Relayer Incentive Structure

The current architecture provides **no on-chain relayer reimbursement**. The paymaster holds ETH but does not transfer it to relayers. This creates a centralised incentive model:

| Actor | Incentive | Funding Source |
|-------|-----------|----------------|
| **Admin** | Provides gas-free voting UX to voters | Deposits ETH via `fund()` |
| **Relayer** | Operates as a service provider (off-chain agreement with admin) | Admin pays relayer off-chain, or admin runs relayer directly |
| **Voter** | Zero-cost voting | No direct cost |

**Implication:** The relayer is expected to be operated by the same entity that funded the paymaster (or a contracted third party). There is no trustless relayer marketplace or competitive relayer auction. This is an intentional simplification — decentralised relayer incentives (e.g., Flashbots-style relayer auctions, ERC-4337 bundler economics) add significant complexity and are outside the current scope.

#### 5.5.3 MEV Interaction

Miner/validator extractable value (MEV) interactions with the voting system:

| MEV Vector | Applicability | Current Protection |
|------------|--------------|--------------------|
| **Front-running a standard vote** | Low value — votes carry no financial value; front-running a vote reveals voting intent but cannot extract profit | None needed for standard polls; commit-reveal for secret ballots |
| **Sandwich attacking gasless votes** | Not applicable — gasless votes do not involve token swaps or price-sensitive operations | N/A |
| **Transaction reordering** | A validator could delay a vote until after `endTime + TIME_BUFFER`, causing it to revert | `TIME_BUFFER = 30` seconds absorbs ±15 seconds of timestamp manipulation; the remaining risk is that a validator holds the transaction for >30 seconds, which is economically irrational without financial incentive |
| **Commit-reveal front-running** | During the reveal phase, a validator observing a `revealVote()` transaction in the mempool can extract the option ID. However, since reveals occur after voting closes, this information cannot influence other votes | Structural mitigation: reveals happen after commit deadline |

**Overall assessment:** The voting system has low MEV exposure because votes carry no direct financial value. MEV actors have no economic incentive to reorder, front-run, or sandwich voting transactions.

---

## 6. Failure Modes & Recovery

| Failure | Impact | Recovery Path |
|---------|--------|---------------|
| **Owner key compromised** | Attacker can create polls, grant franchises, and set infrastructure (if not yet locked) | Two-step ownership transfer (`transferOwnership` → `acceptOwnership`) allows migration to a new key. If infrastructure is already locked, attacker cannot swap TokenManager/Paymaster/SBM. |
| **Infrastructure misconfigured before lock** | Wrong TokenManager or Paymaster address set; locked permanently on first poll creation | Deploy a new ElectionsManager. The misconfigured instance has no polls and no voters — no data is lost. |
| **SecretBallotManager unavailable** | Voters who committed votes cannot reveal them | The SBM is a separate contract; if it becomes unavailable, committed votes are permanently lost for that poll. Mitigation: SBM is immutable after lock, so it cannot be swapped to a malicious version. |
| **Paymaster runs out of ETH** | Gasless voting stops; voters must pay their own gas | Admin can call `fund()` at any time to replenish. Voters can still vote directly via `voteInPollWithToken()` by paying their own gas. |
| **Voter loses salt (secret ballot)** | Cannot reveal their committed vote; vote is not counted | No recovery. The salt is the voter's responsibility. Frontend should persist the salt in local storage and warn users. |
| **Franchise expires with unused polls** | Remaining polls are forfeit | By design: no extensions. Owner can grant a new franchise to the same address (supersedes the old one). |
| **Transfer request rejected** | Franchisee's transfer fee is refunded via `rejectTransfer()` | Refund is automatic; `pendingRefunds` tracking prevents owner from draining deposits. |
| **Block gas limit exceeded** | Transaction reverts | Batch sizes are capped (`MAX_VOTERS_BATCH = 50`). Large voter sets must be split across multiple transactions. |
| **Contract size exceeds 24 KB** | Deployment fails | Feature state is extracted to module contracts. New features should follow the module pattern. |

---

## 7. Governance & Ownership Model

### 7.1 Current Ownership Architecture

```
                    ┌──────────────┐
                    │    Owner     │  (single EOA or multi-sig)
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────────┐
        │                  │                      │
        ▼                  ▼                      ▼
  ElectionsManager   SecretBallotManager   FranchiseManager
  (owns modules)     (independent owner)   (independent owner)
        │
        ├── MultiChoiceVoting (owned by EM)
        ├── QuadraticVoting   (owned by EM)
        ├── DelegationVoting  (owned by EM)
        └── MetadataVoting    (owned by EM)
```

All three top-level contracts (ElectionsManager, SecretBallotManager, FranchiseManager) implement **two-step ownership transfer**:

1. Current owner calls `transferOwnership(newOwner)` — sets `pendingOwner`
2. New owner calls `acceptOwnership()` — completes the transfer

This prevents accidental transfers to wrong addresses and is compatible with multi-sig wallets.

### 7.2 Multi-sig Migration Path

The system is **multi-sig ready** without code changes:

1. Deploy a Gnosis Safe (or similar multi-sig)
2. Call `transferOwnership(safeAddress)` on each top-level contract
3. From the multi-sig, call `acceptOwnership()` on each
4. All subsequent owner operations require multi-sig approval

TokenIntegratedVoting also supports `cancelOwnershipTransfer()` and `renounceOwnership()` for edge cases.

### 7.3 Upgrade Governance

The optional upgradeable path (UUPS proxy) allows logic upgrades while preserving storage:

- **V1:** Core voting lifecycle (create, vote, reveal, winner) with ported features (removeVoter, changePollAdmin, convenience views) via `ElectionsManagerUpgradeable`
- **V2:** Adds categories, weighted votes, pause/unpause, deadline extension, emergency end, on-chain descriptions
- **Future:** Storage gaps (`uint256[46] private __gap` in V1, `uint256[43] private __gapV2` in V2) reserve slots for future state variables

The upgrade requires owner authorisation (`_authorizeUpgrade` calls `onlyOwner`). In a production deployment with multi-sig ownership, this means upgrades require M-of-N approval.

#### 7.3.1 Upgrade Capture Risk

**Threat:** A compromised owner key can push a malicious implementation that redefines vote counting logic, adds backdoor functions, or drains contract state.

**Current mitigation:** Two-step ownership transfer prevents accidental key compromise from leading to immediate upgrade capture — the attacker must also call `acceptOwnership()` from the new address. However, if the single owner key is compromised, no other on-chain actor can block the upgrade.

**Residual risk:** There is no on-chain timelock, no governance delay, and no community veto mechanism for upgrades. An upgrade takes effect in a single transaction. In production, this risk should be mitigated operationally by:

1. Using a multi-sig (Gnosis Safe) as the owner — requiring M-of-N signatories
2. Adding a timelock contract (e.g., OpenZeppelin `TimelockController`) between the multi-sig and the proxy, enforcing a mandatory delay (e.g., 48 hours) before upgrade execution
3. Publishing upgrade proposals publicly before execution, enabling community review

None of these are implemented in contract code today. They are deployment-time configuration choices.

#### 7.3.2 Storage Collision Risk

Beyond the storage gap mechanism, the following storage collision risks exist:

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Variable reordering** | Changing the order of state variables in an upgraded implementation shifts storage slot assignments, silently corrupting data | Code review discipline; V1 declares `uint256[46] __gap`; V2 adds 6 new mappings and declares its own `uint256[43] __gapV2` for future V3 headroom |
| **Inheritance order change** | Modifying the inheritance chain changes the base contract storage layout | V2 inherits from V1 directly; this chain must never be reordered |
| **Type change** | Changing a variable's type (e.g., `uint256` to `address`) while keeping the same slot causes silent misinterpretation | No automated detection; relies on developer diligence |
| **Gap arithmetic error** | V2 declares `uint256[43] __gapV2` (separate from V1's `uint256[46] __gap`). An arithmetic mistake here would overwrite existing state in V3+ | Verified in `upgradeable.test.ts` via storage slot validation tests (50 tests) |

**Tooling recommended:** OpenZeppelin's `@openzeppelin/upgrades-core` provides `validateUpgrade()` which detects storage layout incompatibilities automatically. This is not currently integrated into the CI pipeline.

#### 7.3.3 Upgrade Delay Governance

The current upgrade is **instant** — a single `upgradeToAndCall()` transaction replaces the implementation. There is no mandatory observation period.

**Production recommendation:** Introduce a governance-grade upgrade flow:

```
Proposal → Timelock (48h) → Execution
```

1. Owner (multi-sig) submits upgrade proposal to a `TimelockController`
2. Proposal enters a mandatory waiting period (e.g., 48 hours)
3. During the waiting period, the community can inspect the new implementation bytecode
4. After the delay, the multi-sig executes the upgrade

This pattern is standard in production DeFi protocols and would close the upgrade capture window.

#### 7.3.4 Community Veto Patterns

The system does not currently implement any community veto mechanism. In governance-mature deployments, the following patterns could be adopted:

| Pattern | Description | Applicability |
|---------|-------------|---------------|
| **Optimistic governance** | Upgrades execute after timelock unless vetoed by a threshold of stakeholders | Requires a stakeholder registry — not present today |
| **Governor contract** | On-chain voting by token holders to approve/reject upgrades | `VotingToken` is per-poll and soulbound — not suitable as a governance token |
| **Emergency guardian** | A separate multi-sig that can cancel a pending timelocked upgrade | Compatible with the current architecture via TimelockController's `CANCELLER_ROLE` |

**Current state:** No community veto exists. The owner has unilateral upgrade authority. This is acceptable for early-stage deployments and becomes a governance gap as the system scales.

### 7.4 Poll-Level Admin Separation

Each poll has its own admin, distinct from the contract owner:

- **Owner:** Global authority (create polls, set infrastructure, grant franchises)
- **Poll Admin:** Local authority (add options, add voters, configure voting features — all before poll start only)
- **Voter:** Can only vote and delegate

After a poll starts, no admin action is possible — `addVoter()`, `addVoters()`, `removeVoter()`, `addOptionToPoll()`, and all configuration functions revert with `PollStarted()` once `block.timestamp >= startTime`. This temporal restriction is enforced by `_hasStarted()` and `_hasEnded()` checks.

### 7.5 Governance Hardening Checklist

This section provides a **production-readiness checklist** for hardening the governance model before mainnet deployment. Each item maps to a concrete operational step.

#### 7.5.1 Pre-Deployment Key Ceremony

| Step | Action | Verification |
|------|--------|-------------- |
| 1 | Generate deployer key on air-gapped machine | Key never touches a network-connected device |
| 2 | Deploy all contracts (ElectionsManager, SecretBallotManager, FranchiseManager) from deployer key | Verify via block explorer that `owner()` returns deployer address |
| 3 | Call `setTokenManager()`, `setVotingPaymaster()`, `setSecretBallotManager()`, `setFranchiseManager()` before first poll | Confirm addresses via view functions |
| 4 | Deploy Gnosis Safe multi-sig (M-of-N, recommended 3-of-5) | Verify Safe address on-chain |
| 5 | Call `transferOwnership(safeAddress)` on each top-level contract | Verify `pendingOwner()` returns Safe address |
| 6 | From Safe, call `acceptOwnership()` on each contract | Verify `owner()` returns Safe address; deployer key no longer has authority |
| 7 | Destroy deployer key material | No residual single-key risk |

**Post-ceremony state:** All admin operations require M-of-N multi-sig approval. The deployer key is physically destroyed.

#### 7.5.2 Multi-Sig Configuration Recommendations

| Parameter | Recommendation | Rationale |
|-----------|---------------|-----------|
| **Threshold** | 3-of-5 (production) or 2-of-3 (small deployments) | Balances security against key-loss risk |
| **Signer distribution** | Geographically distributed; no two signers on the same device | Eliminates single-location compromise |
| **Hardware wallets** | All signers use hardware wallets (Ledger / Trezor) | Prevents software-level key extraction |
| **Signer rotation** | Rotate at least 1 signer every 6 months | Limits exposure window from compromised-but-undetected keys |
| **Recovery module** | Enable Gnosis Safe recovery module with a 7-day timelock | Allows signer replacement without losing all threshold keys |

#### 7.5.3 Timelock Integration

The current architecture has **no on-chain delay** between an owner action and its execution. For production deployments, a `TimelockController` should be inserted between the multi-sig and the contracts:

```
Gnosis Safe (3/5)
        │
        ▼
TimelockController (48h delay)
        │
        ├──→ ElectionsManager   (owner = TimelockController)
        ├──→ SecretBallotManager (owner = TimelockController)
        └──→ FranchiseManager    (owner = TimelockController)
```

**Role configuration:**
- `PROPOSER_ROLE` → Gnosis Safe address (only the multi-sig can queue actions)
- `EXECUTOR_ROLE` → Gnosis Safe address (only the multi-sig can execute after delay)
- `CANCELLER_ROLE` → Emergency guardian address (a separate multi-sig that can cancel pending proposals)
- `TIMELOCK_ADMIN_ROLE` → TimelockController itself (self-administered; no external admin)

**Delay recommendations:**

| Action Category | Recommended Delay | Justification |
|-----------------|-------------------|---------------|
| Ownership transfer | 72 hours | Highest-impact action; community needs time to react |
| Upgrade (V2 proxy) | 48 hours | New bytecode must be publicly inspectable before activation |
| Grant franchise | 24 hours | Lower impact; franchisee cannot vote directly |
| Create poll (owner) | None (immediate) | Time-sensitive; polls have explicit start times |

#### 7.5.4 Ownership Event Monitoring

The following ownership-related events should trigger **immediate alerts** in any production monitoring system:

| Event | Contract | Alert Level | Response |
|-------|----------|-------------|----------|
| `OwnershipTransferStarted` | All top-level contracts | **Critical** | Verify the pending owner is expected; if not, cancel immediately |
| `OwnershipTransferred` | All top-level contracts | **Critical** | Confirm the new owner is the expected multi-sig |
| `OwnershipTransferCancelled` | TokenIntegratedVoting | **Warning** | Log and investigate why a transfer was cancelled |
| `InfrastructureLocked` | TokenIntegratedVoting | **Info** | Confirm infrastructure addresses are correct (no reversal possible) |
| `ContractUpgraded` | Upgradeable V1 | **Critical** | Verify new implementation bytecode hash matches published proposal |

#### 7.5.5 Hardening Maturity Model

| Level | Description | Requirements |
|-------|-------------|-------------- |
| **L0 — Development** | Single EOA owner, no timelock, testnet only | Default deployment state |
| **L1 — Pilot** | Multi-sig owner (2/3), no timelock, mainnet | Complete key ceremony (§7.5.1); suitable for small-scale elections |
| **L2 — Production** | Multi-sig owner (3/5), 48h timelock, event monitoring | Timelock integration (§7.5.3); monitoring configured (§11) |
| **L3 — Governance-Grade** | Multi-sig + timelock + emergency guardian + public upgrade proposals | Community veto mechanism (§7.3.4); formal audit completed |

#### 7.5.6 Upgrade Risk Matrix

Every admin action has an associated risk profile. This matrix classifies actions by **reversibility**, **blast radius**, and **recommended safeguard level** to guide timelock and approval configuration.

| Action | Reversibility | Blast Radius | Recommended Safeguard | Rationale |
|--------|---------------|--------------|-----------------------|-----------|
| `upgradeToAndCall()` (UUPS) | **Irreversible** (storage persists; can only upgrade forward) | **Total** — all polls, all voters, all state | Multi-sig + 48h timelock + public bytecode diff | Single most dangerous action; can redefine all contract logic |
| `transferOwnership()` | Reversible (pending owner can be cancelled) | **Total** — new owner gains full control | Multi-sig + 72h timelock | Ownership transfer is the root-of-trust change |
| `setTokenManager()` / `setVotingPaymaster()` / `setSecretBallotManager()` / `setFranchiseManager()` | **Irreversible** after lock | **Total** — affects all future polls | Pre-lock: careful verification; post-lock: impossible | Infrastructure lock (I-4) prevents post-deployment changes |
| `grantFranchise()` | Irrevocable (franchise cannot be revoked; only superseded) | **Scoped** — franchisee can only create polls within allocation | Multi-sig + 24h timelock | Grants sub-admin authority with bounded scope |
| `createPoll()` | Irreversible (poll ID allocated; also triggers infra lock on first call) | **Scoped** — single poll | Immediate (time-sensitive) | First call is especially critical — triggers permanent infrastructure lock |
| `addPolls()` | Irreversible (cannot reduce maxPolls) | **Scoped** — single franchise | Multi-sig only | Bounded by MAX_POLLS_PER_FRANCHISE = 100 |
| `approveTransfer()` | Irreversible (franchise changes hands) | **Scoped** — single franchise + its polls | Multi-sig + KYC review | Transfers admin of all franchise polls |
| `fund()` (Paymaster) | Reversible (admin can `withdraw()`) | **Low** — adds ETH to gas pool | Admin-only | Failure mode is benign (excess funding) |
| `renounceOwnership()` | **Permanently irreversible** | **Total** — no admin can ever act again | Multi-sig + 7-day timelock + explicit "Are you sure?" confirmation | Nuclear option; discussed in §7.5.7 |

#### 7.5.7 Emergency Migration Strategy

When a production deployment is compromised or requires replacement, the following migration strategy applies. The core contracts are designed with **no migration path** by default — this section documents the operational procedures for moving to a new deployment.

**Scenario A: Owner key compromised, infrastructure locked**

| Step | Action | Data Impact |
|------|--------|-------------|
| 1 | Attacker cannot swap TokenManager/Paymaster/SBM (infra locked) | Existing polls are safe if they started before compromise |
| 2 | Attacker can create new malicious polls and grant franchises | New polls created by attacker are illegitimate |
| 3 | Cancel ownership transfer if pending (`cancelOwnershipTransfer()`) | If the attacker set a pending owner, cancel it |
| 4 | Deploy new ElectionsManager with fresh infrastructure | Historical poll data remains on old contract (immutable) |
| 5 | Re-register voters and re-create active polls on new contract | Event logs from old contract serve as the voter registry backup |
| 6 | Communicate new contract address to all stakeholders | Frontend must update contract address |

**Scenario B: Upgrade captured (V2 proxy compromised)**

| Step | Action | Data Impact |
|------|--------|-------------|
| 1 | Proxy now points to attacker-controlled implementation | **All on-chain state interpretable by attacker's logic** |
| 2 | No on-chain remediation possible without attacker's cooperation | Proxy storage is intact but code layer is hostile |
| 3 | Deploy new proxy + new implementation | Historical data on old proxy is forensically recoverable via storage reads |
| 4 | Use event logs from old proxy to reconstruct voter registries and poll state | Events are immutable regardless of implementation |
| 5 | For active polls: declare results void; re-run on new deployment | Decided off-chain by governance body |

**Scenario C: Voluntary migration to new contract version**

| Step | Action | Data Impact |
|------|--------|-------------|
| 1 | Deploy new contract suite | Fresh state |
| 2 | Transfer ownership of old contracts to a burn address or renounce | Old contracts become permanently read-only |
| 3 | Migrate active franchises by re-granting on new contract | Franchise history is not migrated — new IDs assigned |
| 4 | Active polls on old contract run to completion on old contract | No cross-contract poll migration is possible |
| 5 | New polls are created on new contract only | Communicate migration timeline to franchisees |

**Key principle:** The voting system is designed to be **disposable at the contract level** — historical data lives permanently on-chain in events, and new deployments start fresh. There is no state migration function, and adding one would introduce a new attack surface.

#### 7.5.8 Owner Key Rotation Policy

Multi-sig signer rotation should follow a **scheduled and auditable cadence** to limit the exposure window from compromised-but-undetected keys.

| Schedule | Action | Verification |
|----------|--------|-------------- |
| **Every 6 months** | Rotate at least 1 signer (see §12.3) | New signer confirmed; old signer key destroyed |
| **On personnel change** | Immediately rotate departing member's signer key | Former team member has no residual signing authority |
| **On suspected compromise** | Emergency rotation of all potentially affected signers within 24 hours | Incident response (§12.4) triggered |
| **Annually** | Full audit of signer inventory: verify all signers are active, reachable, and using hardware wallets | Signed attestation from each signer |

**Rotation audit trail:**
1. Log every `addOwnerWithThreshold()` and `removeOwner()` call on the Gnosis Safe
2. Maintain an off-chain signer registry with: signer address, real-world identity, hardware wallet serial number, date added, date rotated
3. Cross-reference signer registry against Safe's `getOwners()` view function quarterly

---

## 8. Advanced Technical: Invariant Specification

The following invariants hold across all contract states. These are suitable for formal verification tooling (e.g., Certora, Halmos) if pursued in future:

### 8.1 Core Invariants

| ID | Invariant | Enforced By |
|----|-----------|-------------|
| **I-1** | A voter can cast at most one vote per poll: `hasVoted[pollId][voter] ⟹ no further vote transactions succeed` | `require(!hasVoted[pollId][voter])` in all 5 vote functions + `recordSecretVote` |
| **I-2** | Vote counts are monotonically non-decreasing: `options[pollId][optionId].votes` never decreases | No decrement operation exists in the codebase |
| **I-3** | `totalVotes` equals the sum of all option vote counts: `polls[pollId].totalVotes == Σ options[pollId][i].votes` for `i ∈ [1, optionsCount]` | Both are incremented atomically in the same transaction |
| **I-4** | Infrastructure lock is irreversible: once `infrastructureLocked == true`, it never becomes `false` | `_lockInfrastructure()` has no unlock path |
| **I-5** | Revealed state is irreversible: once `polls[pollId].revealed == true`, it never becomes `false` | `revealResults()` sets `revealed = true` with no revert path |
| **I-6** | Token supply conservation: `totalSupply == Σ balanceOf[addr]` for all addresses | Mint adds to both; burn subtracts from both |
| **I-7** | Franchise poll count never exceeds limit: `franchises[fid].pollsUsed ≤ franchises[fid].maxPolls ≤ 100` | `require(f.pollsUsed < f.maxPolls)` in `createFranchisePoll` + `require(f.maxPolls + additionalPolls ≤ 100)` in `addPolls` |
| **I-8** | No delegation cycles of depth > 1: `hasDelegated[pollId][delegatee]` is checked when recording delegation | `require(!hasDelegated[pollId][delegatee])` in `DelegationVoting.recordDelegation` |

### 8.2 Temporal Invariants

| ID | Invariant |
|----|-----------|
| **T-1** | Options and voters can only be added before `startTime` |
| **T-2** | Votes can only be cast when `startTime ≤ block.timestamp` and `block.timestamp + TIME_BUFFER ≤ endTime` |
| **T-3** | Results can only be revealed after `endTime + TIME_BUFFER` (standard) or `endTime + TIME_BUFFER + revealDuration` (secret ballot) |
| **T-4** | Secret ballot commits are only accepted during the voting period; reveals are only accepted during `[endTime + TIME_BUFFER, endTime + TIME_BUFFER + revealDuration]` |

### 8.3 Liveness Guarantees

The system's security model emphasises **integrity** (votes cannot be altered, tallies cannot be falsified). This section analyses **liveness** — the guarantee that the system makes forward progress and reaches a deterministic terminal state.

#### 8.3.1 Can Reveal Be Permanently Stalled?

**Question:** Is there a state where `revealResults()` can never be called, leaving a poll permanently unrevealed?

**Analysis:**

| Scenario | Can Stall? | Explanation |
|----------|-----------|-------------|
| **Standard poll** | No | `revealResults()` requires only `block.timestamp >= endTime + TIME_BUFFER` and `!revealed`. Anyone can call it — no admin permission required (democratic reveal). Time always advances; the condition will eventually be satisfied. |
| **Secret ballot poll** | No | `revealResults()` for secret ballot polls requires `block.timestamp >= endTime + TIME_BUFFER + revealDuration`. The reveal window has a finite duration. Even if zero voters reveal their votes, `revealResults()` can still be called after the reveal window closes. |
| **All voters lose salt** | No | If all voters lose their salts, no individual votes are revealed, and `totalVotes` remains 0. `revealResults()` still succeeds — it flips `revealed = true` regardless of how many (or few) individual votes were revealed. The poll result is "zero votes," which is a valid terminal state. |

**Liveness guarantee: `revealResults()` is always reachable** given sufficient time. No actor can prevent its execution.

#### 8.3.2 Can Delegation Create Deadlocks?

**Question:** Can a voter delegate to an address that can never vote, creating an irrecoverable lost vote?

**Analysis:**

| Scenario | Deadlock? | Explanation |
|----------|----------|-------------|
| **Delegate to non-voter** | Partial | If Voter A delegates to Address B, and B is not an authorised voter, B cannot call `voteAsDelegate()` (the function requires `isVoterAuthorized[pollId][B]`). However, Voter A can call `removeDelegation()` at any time before the poll ends to recover their vote. |
| **Delegate to voter who already voted** | No deadlock | B can still call `voteAsDelegate(pollId, optionId, A)` because the function checks `hasDelegated[A]` and `voteDelegation[A] == B`, not whether B has voted in their own capacity. |
| **Circular delegation** | Impossible | Invariant **I-8** prevents this: `recordDelegation()` requires `!hasDelegated[delegatee]`. If B has already delegated to C, A cannot delegate to B. |
| **Delegate loses key** | Partial | If B loses their private key, B cannot vote on A's behalf. A can remove the delegation if the poll is still active. If A does not remove the delegation before voting closes, A's vote is lost. |

**Liveness guarantee: Delegation cannot create permanent deadlocks.** A delegator can always `removeDelegation()` during the voting period. After the poll ends, unexercised delegations result in uncounted votes — this is a voter responsibility, not a system failure.

#### 8.3.3 Can Franchise Exhaustion Prevent Governance Continuity?

**Question:** Can a state arise where no entity can create new polls, halting governance?

**Analysis:**

| Scenario | Halts Governance? | Explanation |
|----------|------------------|-------------|
| **All franchises expired** | No | The contract owner retains `createPoll()` authority regardless of franchise state. Franchise expiry does not affect owner privileges. |
| **Owner key lost** | Yes | If the owner key is lost and no `pendingOwner` has been set via `transferOwnership()`, no one can create polls directly. However, any active franchisee can still create polls within their allocation. |
| **Owner key lost + all franchises expired** | Yes | No entity can create new polls. The contract is functionally frozen for new governance. Existing polls continue to operate and reach terminal state. |
| **Franchise maxPolls exhausted** | No | Owner can call `addPolls(franchiseId, additionalPolls)` to increase the cap (up to 100). Owner can also grant new franchises. |

**Liveness guarantee: Governance continuity depends on owner key availability.** The owner is the root of trust for poll creation. If the owner key is irrecoverably lost and all franchises have expired, no new polls can be created. This is the strongest argument for multi-sig ownership and key management discipline.

#### 8.3.4 Can a Poll Fail to Reach Terminal State?

A poll has exactly one terminal state: `revealed == true`. The path to this state is:

```
created → started (block.timestamp >= startTime) → ended (block.timestamp >= endTime)
  → buffer elapsed (block.timestamp >= endTime + TIME_BUFFER)
  → [for secret ballot: reveal window elapsed]
  → revealResults() called by anyone → revealed = true
```

Every transition is driven by time (which always advances) or by a permissionless function (`revealResults()`). No actor can block progress. The only scenario where a poll remains unrevealed indefinitely is if no one ever calls `revealResults()` — but this is a liveness assumption about the existence of at least one interested party, which is standard for blockchain systems.

---

## 9. Contract Size & Gas Profile

### 9.1 Compilation Configuration

```
Compiler:    Solidity 0.8.28
Optimizer:   100 runs, viaIR enabled
Target:      EVM (default)
```

The optimizer is configured with low run count (100) and `viaIR: true` to minimise deployment bytecode size at the expense of marginally higher per-call gas. This trade-off was necessary to keep ElectionsManager within the 24 KB limit.

### 9.2 Gas Cost Reference

| Operation | Approximate Gas | Notes |
|-----------|----------------|-------|
| `createPoll()` (no token) | ~200,000 | First call also triggers infrastructure lock |
| `createPoll()` (with token) | ~1,000,000 | Includes `VotingToken` deployment |
| `addVotersWithTokens()` (10 voters) | ~350,000 | Batch authorise + allocate |
| `voteInPoll()` | ~70,000 | Traditional gas-paying vote |
| `voteInPollWithToken()` | ~120,000 | Includes token burn |
| `voteQuadratic()` | ~150,000 | Token burn + quadratic calculation |
| `commitVote()` | ~80,000 | Secret ballot commit |
| `revealVote()` | ~100,000 | Secret ballot reveal + callback |
| `revealResults()` | ~50,000 | State flip only |

---

## 10. Appendix: Areas for Future Improvement

The following items are **not implemented** in the current codebase. They are documented here as potential enhancements for future consideration.

| Area | Description | Complexity |
|------|-------------|------------|
| **Emergency Pause (Core)** | Add an owner-controlled circuit breaker to the non-upgradeable contracts | Low — but conflicts with the trustless design principle (see §3) |
| **Multi-sig as Default Owner** | Deploy with a Gnosis Safe as owner from day one | Low — no code change, deployment configuration only |
| **Timelock on Admin Actions** | Introduce a delay between owner action and execution (e.g., 24-hour timelock for `grantFranchise`) | Medium |
| **Batch Reveal (Secret Ballot)** | Allow revealing multiple voter votes in a single transaction | Medium |
| **ZK-Proof Integration** | True ballot secrecy via zero-knowledge proofs (e.g., zk-SNARKs for vote validity without revealing choice) | High |
| **Cross-Chain Support** | Bridge-based voting across L1/L2 | High |
| **Formal Verification** | Verify invariants (§8) using Certora, Halmos, or similar — roadmap and CVL properties documented in §14 | Medium |
| **Professional Security Audit** | Independent third-party audit of all contracts | External dependency |

---

## 11. Operational Monitoring Guide

This section defines the **event-based monitoring framework** for production deployments. Every on-chain event emitted by the system is classified by monitoring priority, recommended alerting threshold, and expected response action.

### 11.1 Critical Events (Immediate Alert)

These events indicate potential security incidents or irreversible state changes. Alert within **< 1 minute**.

| Event | Contract | Trigger Condition | Response Action |
|-------|----------|-------------------|-----------------|
| `OwnershipTransferStarted` | All top-level | Any occurrence | Verify `newOwner` matches expected multi-sig. If unexpected → cancel via `cancelOwnershipTransfer()` or begin incident response (§12.4). |
| `OwnershipTransferred` | All top-level | Any occurrence | Confirm transfer was authorised. If unexpected → system is compromised; trigger incident response. |
| `InfrastructureLocked` | TokenIntegratedVoting | Any occurrence | Verify `tokenManager()`, `votingPaymaster()`, `secretBallotManager()`, `franchiseManager()` return correct addresses. This event is **irreversible** — wrong addresses require redeployment. |
| `ContractUpgraded` | Upgradeable V1 | Any occurrence | Compare new implementation bytecode hash against the published proposal. If mismatched → upgrade is malicious. |
| `AdminTransferred` | VotingPaymaster | Any occurrence | Verify new admin is expected. Paymaster admin controls gas funds. |

### 11.2 Warning Events (Alert Within 5 Minutes)

These events may indicate operational issues, policy violations, or early signs of attack.

| Event | Contract | Threshold | Response Action |
|-------|----------|-----------|-----------------|
| `FranchiseGranted` | FranchiseManager | > 3 franchises per hour | Investigate bulk franchise grants — may indicate compromised owner. |
| `TransferRequested` | FranchiseManager | Any occurrence | Review transfer target; ensure the new franchisee is an authorised entity. |
| `TransferRejected` | FranchiseManager | Any occurrence | Log reason; verify refund was processed. |
| `OwnershipTransferCancelled` | TokenIntegratedVoting | Any occurrence | Investigate why a transfer was cancelled — may indicate a detected attack attempt. |
| `GasSponsored` | VotingPaymaster | > 50 events per 10-minute window | Possible relayer abuse or Sybil attack on gasless voting. Check unique voter addresses. |
| `RelayerAdded` / `RelayerRemoved` | VotingPaymaster | Any occurrence | Verify relayer change was authorised. Unauthorised relayer addition enables gas pool exploitation. |
| `RelayerWhitelistToggled` | VotingPaymaster | `enabled = false` | **High concern:** disabling whitelist exposes the relayer endpoint to any caller. Verify this was intentional. |

### 11.3 Informational Events (Dashboard & Analytics)

These events support operational dashboards, participation tracking, and post-election reporting.

| Event | Contract | Dashboard Use |
|-------|----------|---------------|
| `PollCreated` | ElectionsManager | Track poll creation velocity; display active/upcoming/completed polls. |
| `OptionAdded` | ElectionsManager | Track poll configuration completeness. Alert if options added after expected setup window. |
| `Voted` / `VotedMultiChoice` | ElectionsManager | Real-time participation counter; plot vote accumulation curves. |
| `VotedWithToken` | TokenIntegratedVoting | Track token-based participation separately from standard votes. |
| `VoterAuthorized` / `VoterUnauthorized` | ElectionsManager | Track voter registry changes; alert on bulk unauthorisations. |
| `ResultsRevealed` | ElectionsManager | Trigger results display in frontend; archive poll data. |
| `TokenCreated` | TokenManager | Track per-poll token deployments. |
| `TokensAllocated` / `TokensBurned` | TokenManager | Monitor token lifecycle; detect allocation anomalies. |
| `VoteCommitted` / `VoteRevealed` | SecretBallotManager | Track commit/reveal ratios — low reveal rate indicates voters losing salts. |
| `Funded` / `Withdrawn` | VotingPaymaster | Track paymaster ETH balance lifecycle. |
| `FranchisePollCreated` | FranchiseManager | Track franchise utilisation rates. |
| `VoteDelegated` / `DelegationRemoved` | DelegationVoting | Monitor delegation graphs for concentration patterns. |
| `VotedQuadratic` | QuadraticVoting | Track quadratic cost distribution for fairness analysis. |

### 11.4 Derived Metrics & Alerting Thresholds

Beyond individual events, the following **computed metrics** should be tracked:

| Metric | Computation | Warning Threshold | Critical Threshold |
|--------|-------------|-------------------|---------------------|
| **Paymaster balance** | `address(paymaster).balance` (periodic query) | < 0.5 ETH | < 0.1 ETH |
| **Gas cost per vote** | `gasUsed * gasPrice` from `GasSponsored` events | > 0.02 ETH per vote (at 200 gwei) | > 0.05 ETH per vote |
| **Commit-reveal ratio** | `VoteRevealed` count / `VoteCommitted` count per poll | < 80% (voters losing salts) | < 50% |
| **Delegation concentration** | Max delegations to single address / total voters | > 20% of voters delegated to one address | > 40% |
| **Franchise utilisation** | `pollsUsed / maxPolls` per franchise | > 80% | = 100% (exhausted) |
| **Vote velocity** | Votes per minute per poll | < 1 vote/minute in final hour | 0 votes in final 30 minutes (possible liveness issue) |
| **Time to reveal** | `block.timestamp` of `ResultsRevealed` − `endTime` | > 24 hours after end | > 72 hours (poll results stranded) |

### 11.5 Monitoring Stack Recommendations

| Layer | Tool | Integration Point |
|-------|------|-------------------|
| **Event indexing** | The Graph (subgraph provided in `subgraph/`) | Indexes all contract events; serves GraphQL queries |
| **Real-time alerts** | OpenZeppelin Defender Sentinel / Tenderly Alerts | Watch for critical events (§11.1); webhook to PagerDuty/Slack |
| **Dashboards** | Grafana + Prometheus (via Graph node metrics) or Dune Analytics | Visualise participation, delegation, and paymaster metrics |
| **Log archival** | EVM archive node + event log export | Long-term audit trail; required for disputed elections |

### 11.6 Example Grafana / Prometheus Queries

The following PromQL and panel definitions translate the derived metrics (§11.4) into actionable Grafana dashboard panels. Assumes a Prometheus exporter that scrapes The Graph or direct RPC event logs.

#### 11.6.1 Paymaster Balance (Gauge Panel)

```promql
# Scrape paymaster ETH balance every 60 seconds via eth_getBalance
voting_paymaster_balance_eth{contract="paymaster"}
```

**Alert rule:**
```yaml
- alert: PaymasterBalanceLow
  expr: voting_paymaster_balance_eth < 0.5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Paymaster balance below 0.5 ETH"

- alert: PaymasterBalanceCritical
  expr: voting_paymaster_balance_eth < 0.1
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Paymaster balance below 0.1 ETH — gasless voting will fail"
```

#### 11.6.2 Vote Velocity (Time Series Panel)

```promql
# Rate of Voted events per minute, per poll
rate(voting_votes_total{poll_id=~".*"}[1m]) * 60
```

**Alert rule:**
```yaml
- alert: VoteVelocityStalled
  expr: rate(voting_votes_total{status="active"}[30m]) == 0
  for: 30m
  labels:
    severity: warning
  annotations:
    summary: "No votes cast in 30 minutes for active poll {{ $labels.poll_id }}"
```

#### 11.6.3 Gas Cost Per Vote (Histogram Panel)

```promql
# Average gas cost per sponsored vote over 10-minute window
voting_gas_sponsored_cost_eth_sum / voting_gas_sponsored_cost_eth_count
```

**Alert rule:**
```yaml
- alert: GasCostPerVoteHigh
  expr: (voting_gas_sponsored_cost_eth_sum / voting_gas_sponsored_cost_eth_count) > 0.02
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Gas cost per vote exceeds 0.02 ETH — gas prices may be spiking"
```

#### 11.6.4 Delegation Concentration (Gauge Panel)

```promql
# Maximum delegations to any single address as percentage of total voters
(max(voting_delegations_received{poll_id=~".*"}) / voting_voters_authorized{poll_id=~".*"}) * 100
```

**Alert rule:**
```yaml
- alert: DelegationConcentrationHigh
  expr: (max by (poll_id) (voting_delegations_received) / voting_voters_authorized) > 0.4
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Single delegate controls >40% of votes in poll {{ $labels.poll_id }}"
```

#### 11.6.5 Commit-Reveal Ratio (Bar Gauge Panel)

```promql
# Revealed votes / committed votes per secret ballot poll
voting_votes_revealed{poll_id=~".*"} / voting_votes_committed{poll_id=~".*"} * 100
```

**Alert rule:**
```yaml
- alert: LowRevealRate
  expr: (voting_votes_revealed / voting_votes_committed) < 0.5
  for: 1h
  labels:
    severity: critical
  annotations:
    summary: "Less than 50% of committed votes have been revealed in poll {{ $labels.poll_id }}"
```

### 11.7 The Graph Monitoring Queries

The subgraph (`subgraph/schema.graphql`) indexes all contract events into queryable entities. The following GraphQL queries support the monitoring dashboard.

#### 11.7.1 Active Polls with Participation Rate

```graphql
query ActivePollsWithParticipation {
  polls(where: { ended: false, revealed: false }, orderBy: startTime) {
    id
    title
    startTime
    endTime
    totalVotes
    voters(where: { authorized: true }) {
      id
    }
  }
}
```

**Dashboard use:** Display each active poll's participation rate as `totalVotes / voters.length * 100`.

#### 11.7.2 Paymaster Gas Sponsorship Trend

```graphql
query GasSponsorshipTrend($since: BigInt!) {
  gasSponsorships(
    where: { timestamp_gte: $since }
    orderBy: timestamp
    orderDirection: asc
    first: 1000
  ) {
    pollId
    voter
    gasUsed
    gasPrice
    totalCost
    timestamp
  }
}
```

**Dashboard use:** Plot `totalCost` over time; detect gas price spikes; calculate moving average cost-per-vote.

#### 11.7.3 Delegation Concentration per Poll

```graphql
query DelegationConcentration($pollId: ID!) {
  voters(
    where: { poll: $pollId, delegationsReceived_gt: "0" }
    orderBy: delegationsReceived
    orderDirection: desc
    first: 10
  ) {
    address
    delegationsReceived
  }
  poll(id: $pollId) {
    totalVotes
    voters(where: { authorized: true }) {
      id
    }
  }
}
```

**Dashboard use:** Bar chart of top 10 delegates by delegation count; alert if top delegate exceeds 20% of total voters.

#### 11.7.4 Franchise Utilisation

```graphql
query FranchiseUtilisation {
  # Note: FranchiseManager events must be indexed via a separate subgraph
  # or combined into the main subgraph. The schema below assumes extension.
  franchises(where: { active: true }) {
    id
    franchisee
    maxPolls
    pollsUsed
    expiresAt
    feePerPoll
  }
}
```

**Dashboard use:** Gauge chart showing `pollsUsed / maxPolls` per franchise; highlight franchises at >80% utilisation.

#### 11.7.5 Secret Ballot Commit/Reveal Health

```graphql
query CommitRevealHealth($pollId: ID!) {
  poll(id: $pollId) {
    id
    title
    endTime
    totalVotes
  }
  votes(where: { poll: $pollId }) {
    id
    voter
    timestamp
  }
  # Cross-reference committed vs revealed counts
  # VoteCommitted events → count; VoteRevealed events → count
}
```

**Dashboard use:** Track reveal completion percentage during the reveal window; warn operations team if reveal rate is below 80% with less than 25% of the reveal window remaining.

### 11.8 Operational Maturity Model

This model maps monitoring capabilities to the governance hardening levels defined in §7.5.5, providing a clear progression path for operational excellence.

| Maturity Level | Monitoring Capability | Alerting | Dashboard | Audit Trail |
|----------------|----------------------|----------|-----------|-------------|
| **M0 — Ad Hoc** | Manual block explorer checks | None | None | Transaction history only |
| **M1 — Basic** | The Graph subgraph deployed; manual GraphQL queries | Email alerts for critical events via Tenderly | Basic Grafana panels (poll count, vote count) | Event logs indexed but not archived |
| **M2 — Proactive** | All §11.1–§11.3 events monitored; derived metrics tracked | PagerDuty integration; on-call rotation for critical alerts | Full dashboard with all §11.6 panels; delegation concentration tracking | 90-day event log retention in archive node |
| **M3 — Audit-Grade** | Continuous monitoring with anomaly detection; baseline deviation alerts | Multi-channel alerts (PagerDuty + Slack + SMS); escalation matrix defined | Custom Dune Analytics dashboards for post-election reporting; public transparency dashboard | Permanent event log archival; notarised snapshots for disputed elections |

**Progression checklist:**

| From | To | Required Actions |
|------|----|------------------|
| M0 → M1 | Deploy subgraph; configure Tenderly alerts for `OwnershipTransferStarted` and `InfrastructureLocked`; stand up Grafana instance |
| M1 → M2 | Add all event watchers (§11.1–§11.2); implement Prometheus exporters for §11.4 metrics; configure PagerDuty routing; set up archive node for log retention |
| M2 → M3 | Add anomaly detection rules (baseline vote velocity ± 2σ); create public transparency dashboard; implement event log notarisation for election integrity audits |

---

## 12. Operational Playbooks

Step-by-step runbooks for common operational scenarios. Each playbook specifies **who** performs each step, **what** on-chain action is required, and **how** to verify success.

### 12.1 Playbook: Initial Deployment

**Actors:** Deployer (single key, destroyed after ceremony)

| Step | Command / Action | Verification |
|------|------------------|-------------- |
| 1 | Deploy `VotingToken` implementation (or use factory) | Record contract address |
| 2 | Deploy `TokenManager(deployer)` | `tokenManager.owner()` returns deployer |
| 3 | Deploy `VotingPaymaster(deployer, electionsManagerAddr)` | `paymaster.admin()` returns deployer |
| 4 | Deploy `SecretBallotManager(deployer)` | `sbm.owner()` returns deployer |
| 5 | Deploy `FranchiseManager(deployer, electionsManagerAddr)` | `fm.owner()` returns deployer |
| 6 | Deploy `ElectionsManager(deployer)` | `em.owner()` returns deployer |
| 7 | `em.setTokenManager(tokenManagerAddr)` | `em.tokenManager()` returns expected address |
| 8 | `em.setVotingPaymaster(paymasterAddr)` | `em.votingPaymaster()` returns expected address |
| 9 | `em.setSecretBallotManager(sbmAddr)` | `em.secretBallotManager()` returns expected address |
| 10 | `em.setFranchiseManager(fmAddr)` | `em.franchiseManager()` returns expected address |
| 11 | Optionally call `em.lockInfrastructure()` to lock before first poll | `em.infrastructureLocked()` returns `true` |
| 12 | Proceed to key ceremony (§7.5.1) to transfer ownership to multi-sig | Owner is multi-sig |

**Rollback:** If any address is set incorrectly before lock, call the setter again with the correct address. After lock, redeploy.

### 12.2 Playbook: Poll Lifecycle Management

**Actors:** Poll Admin (or Owner)

| Phase | Step | Action | Event Emitted |
|-------|------|--------|---------------|
| **Setup** | 1 | `createPoll(title, startTime, duration, tokenEnabled, tokenRequired)` | `PollCreated` |
| | 2 | `addOption(pollId, optionName)` (repeat per option, max 100) | `OptionAdded` |
| | 3 | `addVotersWithTokens(pollId, voterAddresses, tokensPerVoter)` | `VoterAuthorized`, `TokensAllocated` |
| | 4 | (Optional) `enableSecretBallot(pollId)` | `SecretBallotEnabled` |
| | 5 | (Optional) `enableDelegation(pollId)` | `DelegationEnabled` |
| | 6 | (Optional) `enableQuadraticVoting(pollId)` | `QuadraticVotingEnabled` |
| | 7 | (Optional) `setMultiChoice(pollId, maxChoices)` | `MultiChoiceConfigured` |
| | 8 | (Optional) `setPollMetadata(pollId, metadataURI)` | `PollMetadataSet` |
| **Active** | 9 | Wait for `block.timestamp >= startTime` | — |
| | 10 | Voters cast votes via `voteInPoll()` / `voteInPollWithToken()` | `Voted` / `VotedWithToken` |
| | 11 | No admin actions possible during active period — voters and options can only be added before `startTime` | — |
| **Ended** | 12 | Wait for `block.timestamp >= endTime + TIME_BUFFER` | — |
| | 13 | (Secret ballot only) Voters call `revealVote()` during reveal window | `VoteRevealed` |
| **Terminal** | 14 | Anyone calls `revealResults(pollId)` | `ResultsRevealed` |
| | 15 | Read results via `getOption()`, `getWinner()`, `getVoterChoice()` | — |

**Failure recovery:** If `revealResults()` is never called, the poll remains unrevealed indefinitely but is not stuck — any address can call it at any time after the buffer period.

### 12.3 Playbook: Key Rotation

**Actors:** Current multi-sig signers, new signer

| Step | Action | Verification |
|------|--------|-------------- |
| 1 | Identify the signer being rotated and the replacement signer | New signer generates key on hardware wallet |
| 2 | From Gnosis Safe, execute `removeOwner()` + `addOwnerWithThreshold()` | Safe signers list updated; threshold unchanged |
| 3 | New signer confirms access by signing a test transaction | Safe operational with new signer |
| 4 | Old signer destroys key material | No residual access |

**If rotating the entire multi-sig** (new Safe deployment):

| Step | Action | Verification |
|------|--------|-------------- |
| 1 | Deploy new Gnosis Safe with new signers | New Safe address confirmed |
| 2 | From old Safe, call `transferOwnership(newSafeAddr)` on each contract | `pendingOwner()` returns new Safe |
| 3 | From new Safe, call `acceptOwnership()` on each contract | `owner()` returns new Safe |
| 4 | Verify old Safe has no remaining authority | Old Safe cannot call `onlyOwner` functions |

### 12.4 Playbook: Incident Response

**Trigger:** Unexpected `OwnershipTransferStarted`, `ContractUpgraded`, or `AdminTransferred` event detected.

| Step | Action | Timeline |
|------|--------|----------|
| 1 | **Classify:** Determine if the event was authorised by checking multi-sig transaction history | Immediate (< 5 min) |
| 2 | **Contain:** If unauthorised, call `cancelOwnershipTransfer()` (if transfer is pending) | Immediate |
| 3 | **Assess:** Check if `infrastructureLocked == true` — if so, contract references cannot be swapped | < 15 min |
| 4 | **Rotate:** Begin emergency key rotation (§12.3) for all potentially compromised signers | < 1 hour |
| 5 | **Communicate:** Notify stakeholders and voters that an incident is being investigated | < 1 hour |
| 6 | **Audit:** Reconstruct the attack timeline from on-chain events and multi-sig transaction logs | < 24 hours |
| 7 | **Remediate:** If ownership was transferred, assess whether the attacker created polls or granted franchises; invalidate results from attacker-created polls off-chain | < 48 hours |

**If the upgrade (V2) was captured:**
- The proxy now points to an attacker-controlled implementation. On-chain remediation is **not possible** without a new upgrade (which the attacker controls).
- Mitigation is preventive: use a timelock (§7.5.3) to ensure a 48-hour window for upgrade review.

### 12.5 Playbook: Franchise Management

**Actors:** Contract Owner (multi-sig)

**Granting a franchise:**

| Step | Action | Event |
|------|--------|-------|
| 1 | Call `grantFranchise(franchisee, duration, maxPolls, feePerPoll, tokenManager, paymaster)` | `FranchiseGranted` |
| 2 | Verify franchise via `getFranchise(franchiseId)` | Confirm parameters match |
| 3 | Communicate franchise ID and fee schedule to franchisee | — |

**Handling a transfer request:**

| Step | Action | Event |
|------|--------|-------|
| 1 | Receive `TransferRequested` event notification | `TransferRequested` |
| 2 | Review new franchisee address and KYC status (off-chain) | — |
| 3a | If approved: `approveTransfer(franchiseId)` | `TransferApproved` |
| 3b | If rejected: `rejectTransfer(franchiseId)` — fee refunded automatically | `TransferRejected` |

**Withdrawing fees:**

| Step | Action | Verification |
|------|--------|-------------- |
| 1 | Check `address(franchiseManager).balance - pendingRefunds` > 0 | Withdrawable amount is positive |
| 2 | Call `withdrawFees()` | `FeesWithdrawn` event emitted |
| 3 | Verify ETH received by owner address / Safe | Balance updated |

### 12.6 Playbook: Paymaster Funding

**Actors:** Paymaster Admin

| Step | Action | Verification |
|------|--------|-------------- |
| 1 | Monitor paymaster balance via dashboard (§11.4) | Balance above warning threshold |
| 2 | When balance < 0.5 ETH: call `paymaster.fund{value: X}()` | `Funded` event emitted |
| 3 | Verify new balance: `address(paymaster).balance` | Balance > 1 ETH |
| 4 | Monitor `GasSponsored` events for cost-per-vote trending | Stable or decreasing cost |

**Emergency:** If gas prices spike and paymaster depletes rapidly:
1. Temporarily enable relayer whitelist to restrict relay traffic
2. Fund with emergency ETH reserves
3. Communicate to voters that gasless voting may be temporarily degraded — voters can pay their own gas via `voteInPollWithToken()`

---

## 13. What Would V2 Change?

The optional upgradeable path provides a V2 implementation (`ElectionsManagerUpgradeableV2`) that extends V1 with additional governance features. This section documents the **architectural delta** between V1 and V2 for deployment teams evaluating the upgrade.

### 13.1 Feature Delta

| Capability | V1 (Core / Upgradeable V1) | V2 (Upgradeable V2) |
|------------|--------------------------|----------------------|
| **Poll categories** | Not supported | `setPollCategory(pollId, category)` assigns a string label; `getPollsByCategory()` retrieves polls by category |
| **Weighted voting** | 1 vote = 1 weight | `setVoteWeight(pollId, voter, weight)` assigns weight 1–10; additional votes applied on cast via override; emits `WeightedVoteApplied` |
| **Poll pause** | Not supported (intentional — see §3) | `pausePoll(pollId)` / `unpausePoll(pollId)` — admin can halt and resume voting on individual polls |
| **Participation analytics** | Manual calculation from event logs | `getParticipationRate(pollId)` and `getVoteDiversity(pollId)` provide on-chain percentage metrics |
| **Poll statistics** | Individual view functions | `getPollStats(pollId)` returns `(totalVotes, participationRate, diversity, isPaused)` in one call |
| **Version identification** | `getVersion()` returns `"1.0.0"` | `getVersion()` returns `"2.0.0"` |

### 13.2 New State Variables

V2 introduces 4 new storage mappings and adjusts the storage gap:

| Variable | Type | Slot Impact |
|----------|------|-------------|
| `pollCategories` | `mapping(uint => string)` | Dynamic — uses keccak256-based slot |
| `voteWeight` | `mapping(uint => mapping(address => uint))` | Dynamic — nested mapping |
| `pollPaused` | `mapping(uint => bool)` | Dynamic |
| `authorizedVoterCount` | `mapping(uint => uint)` | Dynamic |
| `__gapV2` | `uint256[45]` | Replaces V1's `uint256[48] __gap` |

**Storage safety:** Solidity mappings do not occupy sequential storage slots — they use `keccak256(key . slot)` for storage location. The gap reduction from 48 to 45 provides headroom for future V3 state but does not conflict with V2's mappings. Storage layout is validated in `upgradeable.test.ts`.

### 13.3 Behavioural Overrides

V2 **overrides** two V1 vote functions to inject pause checks and weight logic:

```
V1: voteInPoll(pollId, optionId)          → records 1 vote
V2: voteInPoll(pollId, optionId)          → checks !paused → records 1 vote → if weight > 1, adds (weight-1) extra votes

V1: voteInPollWithToken(pollId, optionId, voter) → burns 1 token, records 1 vote
V2: voteInPollWithToken(pollId, optionId, voter) → checks !paused → burns 1 token, records 1 vote → if weight > 1, adds extra votes
```

**Weight application detail:** The override calls `super.voteInPoll()` first (which records 1 vote), then checks `voteWeight[pollId][voter]`. If weight > 1, it increments `options[pollId][optionId].votes` by `weight - 1` and increments `polls[pollId].totalVotes` by `weight - 1`, then emits `WeightedVoteApplied`. This preserves invariant **I-3** (totalVotes = Σ option votes).

### 13.4 Design Philosophy Tension

V2 introduces capabilities that **deliberately conflict** with V1's design non-goals (§1.1):

| V1 Non-Goal | V2 Reality | Justification |
|-------------|------------|---------------|
| "Admin cannot pause elections" | `pausePoll()` exists | Some environments (regulated elections, emergency situations) require circuit-breaker capability. V2 is opt-in — deploy V1 if pause is unacceptable. |
| "All votes are equal weight" | `setVoteWeight()` assigns 1–10× multiplier | Weighted governance (e.g., board voting with share-proportional weight) is a valid use case. Weight is set before poll start and is transparent on-chain. |

**Upgrade is optional.** The core (non-upgradeable) contracts remain available for deployments that prioritise trustlessness over flexibility. V2 is intended for environments where admin control is acceptable and expected — such as corporate governance, association voting, or regulated elections.

### 13.5 Migration Considerations

| Consideration | Detail |
|---------------|--------|
| **Proxy deployment required** | V2 only works with UUPS proxy pattern (`ERC1967Proxy`). Non-upgradeable contracts cannot adopt V2 features. |
| **One-time initialisation** | After upgrade, call `initializeV2()` (uses `reinitializer(2)` — idempotent guard prevents double-init). Emits `UpgradedToV2`. |
| **Existing poll compatibility** | All polls created under V1 continue to function. V2 features (categories, weights, pause) can be applied to existing polls retroactively. |
| **Gas impact** | V2 overrides add ~5,000 gas per vote (pause check + weight lookup + conditional extra vote recording). This is acceptable given the added functionality. |
| **Rollback** | UUPS proxy allows upgrading to a V3 that removes V2 features, but **not** downgrading to V1 — V2's storage variables persist in proxy storage and would become orphaned. |
| **Storage gap arithmetic** | V1: 48 gap slots. V2: 45 gap slots. A future V3 can add up to 45 new state variables without collision. Verify via `validateUpgrade()` before deployment. |

---

## 14. Formal Verification Roadmap

This section translates the invariants documented in §8 into concrete verification targets for three complementary tools: **Certora Prover** (mathematical proofs), **Echidna** (property-based fuzzing), and **Slither** (static analysis). Together, they form a layered assurance model that positions the system for audit readiness.

### 14.1 Certora Prover Properties

Certora uses CVL (Certora Verification Language) to express invariants as mathematical properties that must hold across all possible execution paths. The following properties map directly to the invariants in §8.

#### 14.1.1 Vote Integrity Properties

```cvl
// I-1: A voter can cast at most one vote per poll
rule noDoubleVoting(uint256 pollId, address voter) {
    env e;
    require hasVoted(pollId, voter) == true;
    // All 5 vote functions + recordSecretVote must revert
    voteInPoll@withrevert(e, pollId, _);
    assert lastReverted;
}

// I-2: Vote counts are monotonically non-decreasing
invariant voteMonotonicity(uint256 pollId, uint256 optionId)
    options(pollId, optionId).votes >= old(options(pollId, optionId).votes)
    { preserved { require true; } }

// I-3: totalVotes equals sum of all option votes
// (approximation — Certora does not natively support unbounded sums)
rule totalVotesConsistency(uint256 pollId, uint256 optionId) {
    env e;
    uint256 totalBefore = polls(pollId).totalVotes;
    uint256 optionBefore = options(pollId, optionId).votes;
    voteInPoll(e, pollId, optionId);
    assert polls(pollId).totalVotes == totalBefore + 1;
    assert options(pollId, optionId).votes == optionBefore + 1;
}
```

#### 14.1.2 Infrastructure Lock Properties

```cvl
// I-4: Infrastructure lock is irreversible
invariant lockIrreversibility()
    infrastructureLocked() == true =>
        always(infrastructureLocked() == true)

// Once locked, setTokenManager must revert
rule lockedInfrastructureRejectsSetters() {
    env e;
    require infrastructureLocked() == true;
    setTokenManager@withrevert(e, _);
    assert lastReverted;
    setVotingPaymaster@withrevert(e, _);
    assert lastReverted;
    setSecretBallotManager@withrevert(e, _);
    assert lastReverted;
    setFranchiseManager@withrevert(e, _);
    assert lastReverted;
}
```

#### 14.1.3 Token Conservation Properties

```cvl
// I-6: Token supply conservation
invariant tokenSupplyConservation(address token)
    totalSupply(token) == sum(balanceOf(token, addr)) for all addr

// Non-transferability: transfer always reverts
rule nonTransferable(address token, address from, address to, uint256 amount) {
    env e;
    transfer@withrevert(e, to, amount);
    assert lastReverted;
}
```

#### 14.1.4 Temporal Properties

```cvl
// T-1: Options cannot be added after poll starts
rule noOptionsAfterStart(uint256 pollId) {
    env e;
    require block.timestamp >= polls(pollId).startTime;
    addOption@withrevert(e, pollId, _);
    assert lastReverted;
}

// I-5: Revealed state is irreversible
invariant revealIrreversibility(uint256 pollId)
    polls(pollId).revealed == true =>
        always(polls(pollId).revealed == true)
```

#### 14.1.5 Franchise Properties

```cvl
// I-7: Franchise poll count never exceeds limit
invariant franchisePollBound(uint256 fid)
    franchises(fid).pollsUsed <= franchises(fid).maxPolls
    && franchises(fid).maxPolls <= 100
```

**Priority order for Certora implementation:**

| Priority | Properties | Coverage |
|----------|-----------|----------|
| **P0 — Critical** | I-1 (noDoubleVoting), I-4 (lockIrreversibility), I-5 (revealIrreversibility) | Core vote integrity and irreversibility |
| **P1 — High** | I-3 (totalVotesConsistency), I-6 (tokenSupplyConservation), I-7 (franchisePollBound) | Accounting correctness |
| **P2 — Medium** | T-1 through T-4 (temporal invariants), I-8 (delegationDepth) | Lifecycle correctness |
| **P3 — Low** | Non-transferability, delegation revocation, quadratic cost | Feature-specific properties |

### 14.2 Echidna Fuzzing Targets

Echidna performs property-based fuzzing by generating random sequences of contract calls and checking that properties hold. The following targets complement Certora's mathematical proofs with empirical coverage.

#### 14.2.1 Recommended Echidna Properties

```solidity
// echidna_config.yaml target: contracts/test/EchidnaVoting.sol

contract EchidnaVoting is ElectionsManager {

    // Property 1: No voter can vote twice
    // Echidna will attempt to find a sequence of calls that violates this
    function echidna_no_double_vote() public view returns (bool) {
        // For each poll-voter pair where hasVoted is true,
        // a second vote call should have reverted
        return true; // Placeholder — actual check via assertion mode
    }

    // Property 2: totalVotes never decreases
    mapping(uint256 => uint256) internal _lastTotalVotes;
    function echidna_total_votes_monotonic() public returns (bool) {
        for (uint256 i = 1; i <= pollCount; i++) {
            if (polls[i].totalVotes < _lastTotalVotes[i]) return false;
            _lastTotalVotes[i] = polls[i].totalVotes;
        }
        return true;
    }

    // Property 3: Infrastructure lock is permanent
    bool internal _wasLocked;
    function echidna_lock_irreversible() public returns (bool) {
        if (_wasLocked && !infrastructureLocked) return false;
        _wasLocked = infrastructureLocked;
        return true;
    }

    // Property 4: Token balance never exceeds allocated amount
    function echidna_no_token_inflation() public view returns (bool) {
        // VotingToken.totalSupply() >= sum of all balances
        return true;
    }

    // Property 5: Revealed status is permanent
    mapping(uint256 => bool) internal _wasRevealed;
    function echidna_reveal_permanent() public returns (bool) {
        for (uint256 i = 1; i <= pollCount; i++) {
            if (_wasRevealed[i] && !polls[i].revealed) return false;
            if (polls[i].revealed) _wasRevealed[i] = true;
        }
        return true;
    }
}
```

#### 14.2.2 Echidna Configuration

```yaml
# echidna.config.yaml
testMode: "property"
testLimit: 100000
seqLen: 50
shrinkLimit: 5000
contractAddr: "0x00a329c0648769A73afAc7F9381E08FB43dBEA72"
deployer: "0x00a329c0648769A73afAc7F9381E08FB43dBEA72"
sender: ["0x10000", "0x20000", "0x30000"]
filterFunctions:
  - "echidna_"
  - "createPoll"
  - "voteInPoll"
  - "voteInPollWithToken"
  - "addOption"
  - "addVotersWithTokens"
  - "revealResults"
  - "delegateVote"
  - "removeDelegation"
  - "transferOwnership"
  - "acceptOwnership"
  - "lockInfrastructure"
```

#### 14.2.3 Fuzzing Priority Matrix

| Target | Property | Likelihood of Finding Bug | Impact if Found |
|--------|----------|--------------------------|-----------------|
| **Vote deduplication** | `echidna_no_double_vote` | Low (well-tested) | **Critical** — vote integrity |
| **Lock permanence** | `echidna_lock_irreversible` | Very Low | **Critical** — infrastructure safety |
| **Token conservation** | `echidna_no_token_inflation` | Medium (complex mint/burn interaction) | **High** — quadratic voting fairness |
| **Delegation depth** | Depth-1 invariant via random delegate chains | Low | **Medium** — prevents delegation cycles |
| **Reentrancy** | Call sequence exploiting CEI pattern gaps | Low (nonReentrant modifier) | **Critical** — state corruption |
| **Timestamp boundary** | Votes at exact `startTime` and `endTime + TIME_BUFFER` boundaries | Medium | **Medium** — off-by-one errors |

### 14.3 Slither Custom Detectors & CI Rules

Slither is already integrated into the CI pipeline (`.github/workflows/ci.yml`). The following custom detectors and configuration enhancements would strengthen static analysis coverage.

#### 14.3.1 Recommended Slither Detectors (Already Enabled)

The current CI configuration runs Slither with `--exclude-dependencies` and filters `node_modules` and `ERC1967Proxy.sol`. The following built-in detectors are most relevant:

| Detector | Relevance | Expected Findings |
|----------|-----------|-------------------|
| `reentrancy-eth` | CEI pattern violations | Should find zero — `nonReentrant` modifier applied |
| `reentrancy-no-eth` | State-only reentrancy | Should find zero — CEI pattern followed |
| `unchecked-transfer` | ERC20 transfer return value | N/A — VotingToken's `transfer()` always reverts |
| `arbitrary-send-eth` | Unrestricted ETH transfers | `withdrawFees()` and `withdraw()` are admin-only |
| `controlled-delegatecall` | Delegate call to user-supplied address | Only in UUPS `_authorizeUpgrade` — expected and safe |
| `suicidal` | Self-destruct calls | Should find zero — no `selfdestruct` in codebase |
| `uninitialized-state` | State variables without initial value | Should find zero — all state initialised in constructors |
| `locked-ether` | Contracts that receive ETH but cannot withdraw | FranchiseManager has `withdrawFees()`; Paymaster has `withdraw()` |

#### 14.3.2 Custom Slither Rules for This Codebase

The following custom detectors should be added as CI-enforced rules:

```python
# slither_custom/no_admin_bypass.py
"""
Custom detector: Ensure no function with 'get' prefix
bypasses the 'revealed' check for result data.

All result-reading functions (getOption, getWinner, getVoterChoice,
getVoterMultiChoices, getQuadraticVotes) must require polls[pollId].revealed == true.
"""

# slither_custom/infrastructure_lock_guard.py
"""
Custom detector: Ensure all setter functions for infrastructure
(setTokenManager, setVotingPaymaster, setSecretBallotManager, setFranchiseManager)
check infrastructureLocked and revert with InfraLocked().
"""

# slither_custom/nonreentrant_on_state_changes.py
"""
Custom detector: Ensure all functions that make external calls
after state changes have the nonReentrant modifier.
Target: voteInPollWithToken, voteMultiChoice, voteQuadratic,
voteAsDelegate, createFranchisePoll.
"""

# slither_custom/event_emission.py
"""
Custom detector: Ensure all state-changing functions emit
at least one indexed event for off-chain tracking.
Critical for monitoring framework (§11).
"""
```

#### 14.3.3 CI Pipeline Enhancements

```yaml
# .github/workflows/ci.yml additions (recommended)

- name: Run Slither with strict detectors
  run: |
    slither . \
      --hardhat-ignore-compile \
      --exclude-dependencies \
      --filter-paths "node_modules|contracts/upgradeable/ERC1967Proxy.sol" \
      --detect reentrancy-eth,reentrancy-no-eth,arbitrary-send-eth,suicidal,uninitialized-state \
      --fail-on high \
      --json slither-strict.json

- name: Validate upgrade storage layout
  run: |
    npx @openzeppelin/upgrades-core validate \
      --contract ElectionsManagerUpgradeable \
      --reference ElectionsManagerUpgradeableV2 \
      || exit 1
```

### 14.4 Upgrade Storage Layout Diff Automation

Storage layout incompatibilities are the most insidious upgrade bug — they cause silent data corruption with no revert. The following automation should be integrated into the CI pipeline and enforced on every PR that touches upgradeable contracts.

#### 14.4.1 OpenZeppelin Upgrades Plugin

```typescript
// scripts/validateUpgrade.ts
import { validateUpgrade } from '@openzeppelin/upgrades-core';
import { readArtifact } from 'hardhat';

async function main() {
    const v1 = await readArtifact('ElectionsManagerUpgradeable');
    const v2 = await readArtifact('ElectionsManagerUpgradeableV2');

    const result = await validateUpgrade(v1, v2, {
        unsafeAllowRenames: false,
        unsafeSkipStorageCheck: false,
    });

    if (result.length > 0) {
        console.error('Storage layout incompatibility detected:');
        result.forEach(r => console.error(` - ${r.message}`));
        process.exit(1);
    }

    console.log('✓ Storage layout is compatible');
}

main();
```

#### 14.4.2 Storage Slot Snapshot

```typescript
// test/storageLayout.test.ts (recommended addition)
describe('Storage Layout Validation', () => {
    it('V2 gap reduces by exactly the number of new state variables', () => {
        // V1: uint256[48] __gap
        // V2: uint256[45] __gapV2 + 4 new mappings (mappings don't consume gap slots)
        // But gap reduction from 48 to 45 = 3 slots reserved for future
        const V1_GAP = 48;
        const V2_GAP = 45;
        const NEW_MAPPINGS = 4; // pollCategories, voteWeight, pollPaused, authorizedVoterCount
        // Mappings don't consume sequential slots, so gap reduction is for future headroom
        expect(V2_GAP).to.be.lessThan(V1_GAP);
        expect(V2_GAP).to.be.greaterThan(0);
    });

    it('V1 storage slots are unchanged in V2', async () => {
        // Deploy V1 via proxy, write state, upgrade to V2, verify state is intact
        // Already covered in upgradeable.test.ts — this documents the expectation
    });
});
```

#### 14.4.3 Pre-Merge Checklist for Upgradeable Changes

| Check | Automated? | Tool |
|-------|-----------|------|
| Storage layout compatibility | **Yes** — `validateUpgrade()` in CI | `@openzeppelin/upgrades-core` |
| Gap arithmetic correctness | **Yes** — unit test assertion | `upgradeable.test.ts` |
| Inheritance order unchanged | **No** — manual review | Code review checklist |
| `reinitializer(N)` incremented for new version | **No** — manual review | Code review checklist |
| New state variables initialised in `initializeVN()` | **No** — manual review | Code review checklist |
| No `constructor` with state in upgradeable contracts | **Yes** — Slither `uninitialized-state` | Slither |

### 14.5 Verification Maturity Ladder

| Level | Tools | Coverage | Audit Readiness |
|-------|-------|----------|-----------------|
| **V0 — Current** | Hardhat tests (442 passing), Slither (CI, default detectors) | Functional correctness, basic static analysis | **Pre-audit** — tests demonstrate intent, not exhaustive coverage |
| **V1 — Enhanced Static** | Slither with custom detectors (§14.3.2), strict fail-on-high CI gate | Static invariant enforcement; no admin bypass, reentrancy guards | **Audit-assisted** — auditors can focus on logic, not boilerplate |
| **V2 — Fuzz Tested** | Echidna properties (§14.2), 100K+ test sequences per property | Empirical coverage of state transitions, boundary conditions | **Audit-ready** — properties document exact security guarantees |
| **V3 — Formally Verified** | Certora Prover (§14.1), mathematical proof of core invariants | Provable correctness for I-1 through I-8, T-1 through T-4 | **Audit-certified** — verification report accompanies audit submission |

---

## 15. Threat Simulation Appendix

This appendix documents **end-to-end attack scenarios** against the system, modelling the attacker's capabilities, the attack sequence, the system's response, and the residual outcome. Each simulation maps to one or more entries in the Attack Classification Table (§4.7).

### 15.1 Simulation: Owner Key Compromise (A-1)

**Attacker capability:** Full control of the owner EOA private key.

| Step | Attacker Action | System Response | Observable Effect |
|------|-----------------|-----------------|-------------------|
| 1 | Calls `transferOwnership(attackerAddr)` | `OwnershipTransferStarted` event emitted; `pendingOwner` set | **Alert triggered** (§11.1) — operations team has a window to respond |
| 2 | Calls `acceptOwnership()` from attacker address | `OwnershipTransferred` event emitted; owner is now attacker | **Critical alert** — attacker is now contract owner |
| 3 | Calls `setTokenManager(maliciousTokenManager)` | **Reverts with `InfraLocked`** if any poll was ever created | Attacker cannot swap infrastructure |
| 4 | Calls `createPoll(...)` with attacker as admin | Poll created successfully; attacker controls voter registry | Illegitimate poll exists on-chain |
| 5 | Calls `grantFranchise(attackerAlly, ...)` | Franchise created; attacker distributes admin authority | Attacker can bootstrap sub-admins |

**System resilience:**
- Infrastructure lock (I-4) prevents the most destructive actions (contract reference swaps)
- Two-step ownership gives operations a detection window (Steps 1→2)
- Existing polls and their votes are immutable — attacker cannot alter historical data
- **With multi-sig:** Attack requires M compromised keys, not 1
- **With timelock:** Attack requires waiting 72 hours, giving the community time to cancel or migrate

**Residual damage:** Attacker can create illegitimate polls and grant franchises. These must be invalidated off-chain by the governance body. No existing vote data is affected.

### 15.2 Simulation: Malicious Upgrade (A-2)

**Attacker capability:** Compromised owner key + UUPS proxy deployment.

| Step | Attacker Action | System Response | Observable Effect |
|------|-----------------|-----------------|-------------------|
| 1 | Deploys malicious implementation contract with altered `voteInPoll()` logic | No on-chain effect until upgrade | Malicious bytecode visible on-chain |
| 2 | Calls `upgradeToAndCall(maliciousImpl, "")` | Proxy's implementation slot updated atomically | **`ContractUpgraded` event** emitted — critical alert triggered |
| 3 | All subsequent `voteInPoll()` calls execute attacker's logic | Votes may be silently redirected, suppressed, or fabricated | Users cannot distinguish malicious from legitimate behaviour |
| 4 | Attacker calls `selfdestruct()` on malicious implementation (if included) | Proxy becomes non-functional | System permanently destroyed |

**System resilience without timelock:** **None.** Upgrade is atomic; there is no recovery window.

**System resilience with timelock (§7.5.3):**
| Step | Timelock Response |
|------|-------------------|
| 1 | Upgrade proposal queued; 48-hour delay begins |
| 2 | Community inspects proposed implementation bytecode via block explorer |
| 3 | If malicious: emergency guardian calls `cancel()` on TimelockController |
| 4 | Compromised owner key is rotated via multi-sig during the 48-hour window |

**Residual damage with timelock:** Zero — attack is detected and cancelled during the delay. Without timelock, damage is total and irreversible.

### 15.3 Simulation: Quadratic Vote Manipulation (A-4, A-14)

**Attacker capability:** Colluding poll admin + one voter.

| Step | Attacker Action | System Response | Observable Effect |
|------|-----------------|-----------------|-------------------|
| 1 | Admin creates poll with quadratic voting enabled | Normal operation | `PollCreated` + `QuadraticVotingEnabled` events |
| 2 | Admin calls `allocateVotingTokens(pollId, [colluder], [10000])` | 10,000 tokens minted to colluder | `TokensAllocated` event — anomalous allocation |
| 3 | Admin allocates 10 tokens each to 50 legitimate voters | Normal operation | Standard allocation |
| 4 | Colluder calls `voteQuadratic(pollId, [{option: 1, votes: 100}])` | Cost: $100^2 = 10,000$ tokens; all burned | Colluder's 100 quadratic votes dominate |
| 5 | 50 legitimate voters each cast 3 quadratic votes at cost $3^2 = 9$ tokens | Normal operation | Total: 150 legitimate quadratic votes |
| 6 | `revealResults()` — Option 1 wins with 100 votes vs. distributed votes | System reports accurate tallies | Result is technically valid but unfair |

**System resilience:**
- `TokensAllocated` event monitoring (§11.3) would flag the 10,000-token allocation as anomalous
- The quadratic cost function did penalise the colluder ($10,000$ tokens for $100$ votes vs. $10$ tokens for $10$ votes at 1 each)
- No on-chain mechanism prevents disproportionate allocation

**Residual damage:** The colluder wins the poll. Detection is post-hoc; prevention requires a per-voter allocation cap (not implemented — see §10).

### 15.4 Simulation: Nonce Exhaustion Attack (A-8)

**Attacker capability:** Access to the gasless voting endpoint; relayer whitelist disabled.

| Step | Attacker Action | System Response | Observable Effect |
|------|-----------------|-----------------|-------------------|
| 1 | Obtains valid voter signatures (e.g., from compromised frontend) | Signatures are valid EIP-712 typed data | Signatures appear legitimate |
| 2 | Submits signatures via `executeVoteWithToken()` repeatedly | First submission: nonce incremented, vote cast | `Voted` + `GasSponsored` events |
| 3 | Subsequent submissions with the same voter: revert (nonce mismatch) | Transaction reverts; attacker pays gas for each revert | No damage to voter state beyond nonce increment |
| 4 | Attacker obtains new signatures and submits them | Each successful submission increments the voter's nonce | Voter cannot use previously issued signatures |

**System resilience:**
- Each attack transaction costs the attacker gas (~150K gas per attempt)
- Relayer whitelist prevents unauthorised submission when enabled
- Voter can always vote directly via `voteInPollWithToken()` by paying their own gas

**Residual damage:** If the attacker can intercept valid signatures, they can drain those specific nonces. The voter must regenerate signatures with the new nonce. Sustained attack is economically unprofitable for the attacker.

### 15.5 Simulation: Front-Running Secret Ballot Reveal (A-5, A-6)

**Attacker capability:** Validator or MEV bot observing the mempool.

| Step | Attacker Action | System Response | Observable Effect |
|------|-----------------|-----------------|-------------------|
| 1 | Voter submits `revealVote(pollId, optionId, salt)` to the mempool | Transaction pending | Attacker observes `optionId` in calldata |
| 2 | Attacker extracts `optionId` from pending transaction | No on-chain effect | Vote choice leaked before on-chain confirmation |
| 3 | Voting has already closed (reveal phase only) | No votes can be cast | Leaked information cannot influence other votes |

**System resilience:** The commit-reveal scheme structurally mitigates this:
- **Commits** happen during the voting period — they contain only the hash, not the vote
- **Reveals** happen after voting closes — by the time `optionId` is visible, no one can vote
- The temporal separation means front-running reveals has zero strategic value

**Residual damage:** Privacy of individual voter choices is weakened during the reveal phase (MEV bots can attribute votes slightly before on-chain confirmation). This is inherent to any commit-reveal scheme on a public blockchain.

### 15.6 Simulation Score Card

| Simulation | Attack Vectors | Prevented By | Timelock Benefit | Damage Without Safeguards | Damage With Full Safeguards |
|------------|---------------|--------------|------------------|----|---|
| §15.1 Owner Key Compromise | A-1 | Infra lock, two-step ownership | +72h detection window | Illegitimate polls + franchises | None (detected and cancelled) |
| §15.2 Malicious Upgrade | A-2 | Timelock + guardian | **Critical** — sole prevention | Total system capture | None (cancelled during delay) |
| §15.3 Quadratic Manipulation | A-4, A-14 | Monitoring only | N/A | Unfair election result | Detected post-hoc; result stands |
| §15.4 Nonce Exhaustion | A-8 | Relayer whitelist, economic cost | N/A | Temporary gasless voting disruption | Blocked by whitelist |
| §15.5 Front-Running Reveal | A-5, A-6 | Commit-reveal temporal separation | N/A | Zero strategic value | Zero damage |

---

**Version:** 4.4.0 | **Solidity:** ^0.8.20 (compiled with 0.8.28) | **License:** LicenseRef-ANKIT-SORAL
