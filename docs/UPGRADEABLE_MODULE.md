# Upgradeable Contracts Module - Complete Guide

## Overview

This module implements **upgradeable smart contracts** for the Voting System using the **UUPS (Universal Upgradeable Proxy Standard)** pattern. This allows you to:

- **Fix bugs** in deployed contracts
- **Add new features** without migrating data
- **Preserve all existing poll data, votes, and tokens**
- **Maintain the same contract address** users interact with

---

## Architecture

### UUPS Proxy Pattern

```
┌─────────────────────────────┐
│  User / Frontend            │
│                             │
└──────────────┬──────────────┘
               │
               │ All calls go through proxy
               ▼
┌──────────────────────────────┐
│  ERC1967Proxy                │  ← Same address forever
│  (Storage + Delegation)      │
│                              │
│  - Stores all data           │
│  - Delegates calls to impl   │
└──────────────┬───────────────┘
               │
               │ delegatecall
               ▼
┌──────────────────────────────┐
│  Implementation (V1/V2/V3..) │  ← Can be upgraded
│  (Logic only, no storage)    │
│                              │
│  - Contains all functions    │
│  - Can be replaced           │
└──────────────────────────────┘
```

### Key Concepts

1. **Proxy Contract**: Stores all data, delegates function calls to implementation
2. **Implementation Contract**: Contains logic, can be upgraded
3. **Storage Gaps**: Reserved slots for future state variables
4. **Initializers**: Replace constructors (since proxies don't call constructors)
5. **Authorization**: Only owner can authorize upgrades

---

## What's Included

### V1 (Current Functionality)
- `ElectionsManagerUpgradeable.sol` - All existing voting features
- Full backward compatibility with non-upgradeable version
- Storage layout optimized for future upgrades

### V2 (Example Upgrade)
- `ElectionsManagerUpgradeableV2.sol` - V1 + new features:
  - ✅ **Poll Categories** - Organize polls by type
  - ✅ **Vote Weight Multipliers** - VIP voters can have 2x, 3x vote weight
  - ✅ **Pause/Unpause Polls** - Emergency stop mechanism
  - ✅ **Batch Voting** - Vote in multiple polls at once
  - ✅ **Enhanced Statistics** - Participation rate, vote diversity
  - ✅ **Category Queries** - Get all polls in a category

---

## Quick Start

### 1. Deploy V1

```bash
# Deploy upgradeable V1 with proxy
npx hardhat ignition deploy ignition/modules/UpgradeableVoting.ts

# Output will include:
# - Proxy address (this is what users interact with - never changes!)
# - Implementation address (V1)
# - Token Manager address
# - VotingPaymaster address
```

**Important**: Save the proxy address - this is your permanent contract address!

### 2. Use V1 Normally

```typescript
// In your frontend/scripts
const electionsManager = await ethers.getContractAt(
  "ElectionsManagerUpgradeable",
  PROXY_ADDRESS  // Use proxy address, not implementation
);

// Use exactly like non-upgradeable version
await electionsManager.createPoll(...);
await electionsManager.addVoter(...);
// etc.
```

### 3. Upgrade to V2

When you're ready to add new features:

```bash
# Create parameters file with proxy address
cat > ignition/parameters/upgrade-v2.json << EOF
{
  "UpgradeToV2": {
    "proxyAddress": "0xYourProxyAddressHere"
  }
}
EOF

# Deploy upgrade
npx hardhat ignition deploy ignition/modules/UpgradeToV2.ts \
  --parameters ignition/parameters/upgrade-v2.json

# All existing data preserved!
# Users still use same proxy address
# New V2 features now available
```

### 4. Verify Upgrade

```typescript
const electionsManager = await ethers.getContractAt(
  "ElectionsManagerUpgradeableV2",  // Now use V2 interface
  PROXY_ADDRESS  // Same proxy address
);

// Check version
console.log(await electionsManager.getVersion()); // "2.0.0"

// Verify data preserved
const poll1 = await electionsManager.polls(1);
console.log(poll1.title); // Your original poll still there!

// Use new V2 features
await electionsManager.setPollCategory(1, "Governance");
await electionsManager.setVoteWeight(1, voterAddress, 2);
```

---

## Testing

### Run Comprehensive Upgrade Tests

```bash
npx hardhat test test/upgradeable.test.ts
```

**Test Coverage**:
- ✅  V1 deployment with proxy
- ✅ V1 functionality (create polls, vote, etc.)
- ✅ Upgrade from V1 to V2
- ✅ Data preservation (polls, votes, tokens all preserved)
- ✅ New V2 features work correctly
- ✅ Storage layout validation (no corruption)
- ✅ Authorization (only owner can upgrade)
- ✅ Backward compatibility

**Expected Output**:
```
  Upgradeable Voting System - Comprehensive Tests
    Part 1: Deploy and Use V1
      ✓ should deploy V1 with proxy pattern
      ✓ should deploy TokenManager and VotingPaymaster
      ✓ should check V1 version
      ✓ should create poll in V1
      ✓ should add options and voters in V1
      ✓ should vote in V1 poll

    Part 2: Upgrade from V1 to V2
      ✓ should deploy V2 implementation
      ✓ should verify V2 version
      ✓ should only allow owner to upgrade

    Part 3: Verify Data Preserved After Upgrade
      ✓ should preserve existing poll data
      ✓ should preserve poll options
      ✓ should preserve voter authorization
      ✓ should preserve votes cast
      ✓ should preserve token balances
      ✓ should preserve pollsCount
      ✓ should preserve ownership

    Part 4: Test New V2 Features
      ✓ should create new poll in V2 with category
      ✓ should set vote weights (VIP voting - new V2 feature)
      ✓ should apply vote weight when voting
      ✓ should pause and unpause poll (new V2 feature)
      ✓ should get participation rate (new V2 feature)
      ✓ should get vote diversity (new V2 feature)
      ✓ should get poll stats (new V2 feature)
      ✓ should get polls by category (new V2 feature)

    Part 5: V1 Functionality Still Works After Upgrade
      ✓ should still allow voting in old V1 polls
      ✓ should reveal V1 poll results
      ✓ should get winner from V1 poll

    Part 6: Storage Layout Safety
      ✓ should not corrupt storage slots after upgrade
      ✓ should verify storage gap is preserved

    Test Summary
      ✓ should print upgrade test summary

  29 passing (3s)
```

---

## Safety Features

### 1. Storage Gaps

```solidity
// In V1
uint256[50] private __gap;

// In V2 (4 new state variables added)
uint256[46] private __gapV2;  // 50 - 4 = 46 remaining slots
```

**Why?** Allows adding new state variables in future upgrades without corrupting existing storage.

### 2. Only Owner Can Upgrade

```solidity
function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
    emit ContractUpgraded(VERSION, newImplementation);
}
```

**Why?** Prevents unauthorized upgrades that could introduce malicious code.

### 3. Initializers Instead of Constructors

```solidity
/// @custom:oz-upgrades-unsafe-allow constructor
constructor() {
    _disableInitializers();  // Prevents implementation contract from being initialized
}

function initialize() public initializer {
    __UUPSUpgradeable_init();
    __TimeValidator_init();
    __Ownable_init(msg.sender);
}
```

**Why?** Proxies don't call constructors. Initializers ensure setup only happens once.

### 4. Version Tracking

```solidity
function getVersion() external pure returns (string memory) {
    return "2.0.0";
}
```

**Why?** Frontend can check version and enable/disable features accordingly.

---

## Creating Your Own V3

Want to add more features? Here's how:

### Step 1: Create V3 Contract

```solidity
// contracts/upgradeable/v3/ElectionsManagerUpgradeableV3.sol
pragma solidity ^0.8.28;

import "../v2/ElectionsManagerUpgradeableV2.sol";

contract ElectionsManagerUpgradeableV3 is ElectionsManagerUpgradeableV2 {
    string public constant VERSION_V3 = "3.0.0";

    // Add new state variables (will use __gapV2 slots)
    mapping(uint => bool) public pollArchived;
    mapping(uint => string) public pollTags;

    // Add new functions
    function archivePoll(uint pollId) external onlyOwner {
        require(polls[pollId].ended, "Poll not ended");
        pollArchived[pollId] = true;
    }

    function tagPoll(uint pollId, string calldata tag) external onlyAdminOrOwner(pollId) {
        pollTags[pollId] = tag;
    }

    function getVersion() external pure override returns (string memory) {
        return VERSION_V3;
    }

    // Reduce gap by number of new state variables (2 in this case)
    uint256[44] private __gapV3;  // 46 - 2 = 44 remaining
}
```

### Step 2: Create Upgrade Module

```typescript
// ignition/modules/UpgradeToV3.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("UpgradeToV3", (m) => {
  const proxyAddress = m.getParameter("proxyAddress");

  const implV3 = m.contract("ElectionsManagerUpgradeableV3", []);

  const proxyAsV2 = m.contractAt("ElectionsManagerUpgradeableV2", proxyAddress);

  // No initialize needed for V3 (unless you add one)
  m.call(proxyAsV2, "upgradeTo", [implV3]);

  return {
    implementation: implV3,
    proxy: proxyAddress,
  };
});
```

### Step 3: Deploy Upgrade

```bash
npx hardhat ignition deploy ignition/modules/UpgradeToV3.ts \
  --parameters ignition/parameters/upgrade-v3.json
```

---

## Best Practices

### ✅ DO

1. **Always test upgrades on testnet first**
2. **Keep storage layout consistent** (never remove/reorder state variables)
3. **Use storage gaps** in every upgradeable contract
4. **Version all implementations** (VERSION constant)
5. **Document all breaking changes** in upgrade guides
6. **Verify storage layout** with hardhat-upgrades plugin (if using)
7. **Emit events on upgrade** for frontend monitoring

### ❌ DON'T

1. **Don't remove or reorder existing state variables**
2. **Don't change inheritance order**
3. **Don't make lib contracts upgradeable unless needed**
4. **Don't upgrade without comprehensive testing**
5. **Don't skip security audits for upgrades**

---

## Storage Layout Rules

### ✅ Safe: Adding New Variables

```solidity
// V1
contract V1 {
    uint public count;
    uint256[50] private __gap;
}

// V2 - SAFE to add new variable
contract V2 is V1 {
    uint public newVariable;  // Uses gap slot
    uint256[49] private __gapV2;  // Reduced by 1
}
```

### ❌ Unsafe: Removing/Reordering

```solidity
// V1
contract V1 {
    uint public count;
    address public admin;
}

// V2 - UNSAFE! Will corrupt storage
contract V2 is V1 {
    address public admin;  // Swapped order - BAD!
    uint public count;
}
```

---

## Emergency Procedures

### If Upgrade Fails

1. **Don't panic** - proxy still points to working V1
2. **Identify the issue** in V2 implementation
3. **Fix and redeploy** V2 implementation
4. **Retry upgrade** with fixed implementation

### Rollback (If Absolutely Necessary)

```typescript
// Redeploy V1 implementation
const v1Impl = await ethers.deployContract("ElectionsManagerUpgradeable");

// Upgrade "back" to V1
await proxyAsV2.upgradeTo(v1Impl.target);
```

**Warning**: Only do this if V2 didn't add incompatible state variables!

---

## Frontend Integration

### Detect Current Version

```typescript
const contract = await ethers.getContractAt("ElectionsManagerUpgradeable", PROXY_ADDRESS);

try {
  const version = await contract.getVersion();

  if (version === "2.0.0") {
    // Enable V2 features in UI
    enableVoteWeights();
    enablePollCategories();
  }
} catch {
  // Old non-upgradeable version or V1
  console.log("Using V1 or legacy contract");
}
```

### Listen for Upgrades

```typescript
contract.on("ContractUpgraded", (newVersion, implementation) => {
  console.log(`Contract upgraded to version ${newVersion}`);
  console.log(`New implementation: ${implementation}`);

  // Refresh UI to enable new features
  window.location.reload();
});
```

---

## Gas Costs

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| Initial Deploy | ~3.5M gas | Proxy + Implementation + TokenManager + Paymaster |
| First Call (Cold) | +~2.5K gas | UUPS proxy overhead on first delegatecall |
| Subsequent Calls | +~100 gas | Minimal overhead after warm storage |
| Upgrade | ~200K gas | Deploy new implementation + call upgradeToAndCall |

**Note**: Proxy adds minimal overhead (~100 gas per call) compared to non-upgradeable contracts.

---

##Production Deployment Checklist

### Before Deploying V1

- [ ] All tests passing (including upgradeable.test.ts)
- [ ] Contract size under 24KB limit
- [ ] Storage gaps properly configured
- [ ] Initializers properly secured
- [ ] Ownership properly configured
- [ ] Version number set correctly

### Before Upgrading to V2

- [ ] V2 tests passing
- [ ] Storage layout verified (no corruption)
- [ ] New features documented
- [ ] Frontend updated for V2 features
- [ ] Testnet upgrade successful
- [ ] Security audit completed (if adding security-critical features)
- [ ] Backup plan prepared (rollback procedure)
- [ ] Users notified of upcoming upgrade

### After Upgrade

- [ ] Verify version on-chain
- [ ] Test all V1 functionality still works
- [ ] Test new V2 features
- [ ] Monitor for any issues
- [ ] Update documentation
- [ ] Announce upgrade to users

---

## FAQ

### Q: Can I upgrade multiple times?
**A**: Yes! V1 → V2 → V3 → ... as many times as needed.

### Q: Will users need to do anything?
**A**: No! They keep using the same proxy address. Upgrades are transparent to users.

### Q: What if I run out of storage gap slots?
**A**: Each implementation has 50 (V1) or 46 (V2) slots. You can add 46 more state variables before running out. If you do run out, deploy a fresh V3 with a new 50-slot gap.

### Q: Can I upgrade TokenManager and VotingPaymaster?
**A**: Yes! You can make these upgradeable too using the same pattern. Just deploy them as proxies initially.

### Q: Is this more expensive than regular contracts?
**A**: Slightly - adds ~100 gas per function call. Negligible compared to benefits of upgradeability.

### Q: Can upgrade be cancelled mid-process?
**A**: Once `upgradeToAndCall` completes,the upgrade is done But if it reverts, nothing changes (proxy still points to V1).

---

## Need Help?

- Review test file: `test/upgradeable.test.ts` for complete examples
- Check OpenZeppelin docs: https://docs.openzeppelin.com/upgrades-plugins/
- Run tests: `npx hardhat test test/upgradeable.test.ts --verbose`

---

**Remember**: With great upgradeability comes great responsibility. Always test thoroughly before upgrading on mainnet!

Delegation toggle: Supported. Admin/owner must call enableDelegation(pollId) before delegation is allowed.
