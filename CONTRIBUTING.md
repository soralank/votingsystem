# Contributing to Voting System

Thank you for your interest in contributing. This document establishes the guidelines, coding standards, and review process for all contributions to the Voting System project.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Security](#security)

---

## Code of Conduct

All participants are expected to maintain a professional, respectful, and inclusive environment. Harassment, personal attacks, and publishing private information without consent are not tolerated. Focus discussions on technical merit, accept constructive feedback gracefully, and engage with empathy.

---

## Getting Started

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | v18.0.0+ |
| npm | 9.0.0+ |
| Git | Latest |
| Solidity knowledge | Intermediate+ |
| TypeScript knowledge | Basic+ |

### Environment Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/votingsystem.git
cd votingsystem

# 3. Add upstream remote
git remote add upstream https://github.com/soralank/votingsystem.git

# 4. Install dependencies
npm install

# 5. Verify setup
npx hardhat compile
npx hardhat test
```

All 396 tests must pass before proceeding.

---

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b <prefix>/short-description
```

Branch naming conventions:

| Prefix | Purpose |
|--------|---------|
| `feature/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation updates |
| `test/` | Test additions or modifications |
| `refactor/` | Code restructuring |

### 2. Implement Changes

- Write clean, readable code adhering to the standards below
- Add tests for all new functionality
- Update documentation where applicable

### 3. Commit

Use conventional commit messages:

```bash
git commit -m "feat: add voter delegation feature"
```

| Prefix | Meaning |
|--------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation change |
| `test:` | Test addition or update |
| `refactor:` | Code restructuring (no behaviour change) |
| `chore:` | Maintenance task |

### 4. Stay Current

```bash
git fetch upstream
git rebase upstream/main
```

### 5. Push and Open a Pull Request

```bash
git push origin <branch-name>
```

Navigate to the original repository and create a Pull Request.

---

## Coding Standards

### Solidity

Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html).

**Contract Structure:**

```solidity
// SPDX-License-Identifier: ANKIT.SORAL
pragma solidity ^0.8.20;

/// @title Contract Title
/// @notice High-level purpose
/// @dev Implementation notes
contract MyContract {
    // 1. State variables
    uint public immutable MAX_VALUE = 100;
    address private _owner;

    // 2. Events
    event ValueUpdated(uint indexed oldValue, uint indexed newValue);

    // 3. Modifiers
    modifier onlyOwner() {
        require(msg.sender == _owner, "Not owner");
        _;
    }

    // 4. Functions (external → public → internal → private)
    /// @notice Update a value
    /// @param newValue The new value to set
    /// @return success Whether the operation succeeded
    function updateValue(uint newValue)
        external
        onlyOwner
        returns (bool success)
    {
        require(newValue <= MAX_VALUE, "Value too high");
        emit ValueUpdated(_value, newValue);
        _value = newValue;
        return true;
    }
}
```

**Naming Conventions:**

| Element | Convention | Example |
|---------|-----------|---------|
| Contracts | PascalCase | `ElectionsManager` |
| Functions | camelCase | `createPoll` |
| Variables | camelCase | `pollCount` |
| Constants | UPPER_SNAKE_CASE | `MAX_OPTIONS` |
| Private variables | Leading underscore | `_owner` |
| Events | PascalCase | `PollCreated` |

**Gas Optimisation:**

- Use `calldata` for read-only array/struct parameters
- Minimise storage writes; prefer memory computation
- Use `immutable` and `constant` where applicable
- Use batch operations over individual calls
- Avoid unbounded loops over dynamic arrays

**Security Patterns:**

- Apply the Checks-Effects-Interactions (CEI) pattern on all state-changing functions
- Validate all inputs: non-zero addresses, non-empty strings, range checks
- Use access control modifiers consistently
- Never make external calls before updating state
- Solidity 0.8+ provides built-in overflow/underflow protection

### TypeScript

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

// Use descriptive variable names
const votingContract = await deployContract();
const pollCreationTx = await votingContract.createPoll("Test", admin, 3600);
```

- Use strict TypeScript (no `any` unless unavoidable)
- Prefer `const` over `let`; avoid `var`
- Use PascalCase for interfaces, camelCase for functions and variables
- Use descriptive names over abbreviations

---

## Pull Request Process

### Pre-Submission Checklist

```bash
# 1. Run full test suite
npx hardhat test

# 2. Compile contracts
npx hardhat compile

# 3. Verify gas impact (for contract changes)
REPORT_GAS=true npx hardhat test
```

All 396 existing tests must continue to pass. New features require new tests.

### PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Manual testing completed on local network

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added to complex logic
- [ ] Documentation updated
- [ ] No new compiler warnings
- [ ] Contract size remains under 24 KB (if modifying ElectionsManager)

## Related Issues
Closes #(issue number)
```

### Review Process

1. **Automated checks** — CI/CD runs compile, test, and Slither static analysis
2. **Code review** — Maintainer reviews design, quality, and security implications
3. **Feedback** — Address review comments with new commits
4. **Approval** — At least one maintainer approval required
5. **Merge** — Maintainer merges after approval

---

## Testing Requirements

### Coverage Targets

| Scope | Requirement |
|-------|-------------|
| Critical functions (voting, token, access control) | 100% |
| New features | Minimum 90% |
| Overall project | Maintain above 85% |

### Test Structure

```typescript
describe("MyFeature", function () {
    let contract: Contract;
    let owner: SignerWithAddress;
    let user: SignerWithAddress;

    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();
        contract = await deployContract();
    });

    it("should correctly perform action", async function () {
        await contract.connect(owner).someFunction(param);
        const result = await contract.getResult();
        expect(result).to.equal(expectedValue);
    });

    it("should revert with correct error message", async function () {
        await expect(
            contract.connect(user).restrictedFunction()
        ).to.be.revertedWith("Not authorized");
    });
});
```

### Test Categories

| Category | Purpose |
|----------|---------|
| Unit tests | Individual function behaviour |
| Integration tests | Cross-contract interactions |
| Edge cases | Boundary conditions, overflow, empty inputs |
| Security tests | Access control enforcement, attack vectors |
| Trust tests | Infrastructure lock, secret ballot, democratic reveal |
| Gas tests | Verify operations remain gas-efficient |

---

## Documentation

### Requirements for All Changes

1. **Code comments** — Explain complex logic, security considerations, and gas optimisation rationale
2. **Function documentation** — NatSpec for all public/external functions
3. **Architecture changes** — Update [ARCHITECTURE.md](ARCHITECTURE.md) if modifying design patterns or adding new contracts. If the change affects threat model, update the Attack Classification Table (§4.7) and Threat Simulation Appendix (§15). If it introduces new events, update the Operational Monitoring Guide (§11). If it affects governance or ownership, update the Governance Hardening Checklist (§7.5) and Upgrade Risk Matrix (§7.5.6). If it modifies invariants, update the Formal Verification Roadmap (§14) with corresponding Certora/Echidna properties.
4. **README** — Update if features, installation steps, or statistics change
5. **Error codes** — Document new revert messages in [docs/ERROR_CODES.md](docs/ERROR_CODES.md)

### Style

- Use clear, technical language
- Include code examples for non-trivial features
- Explain the rationale ("why") in addition to the mechanism ("what")
- Keep documentation current with code changes

---

## Security

### Reporting Vulnerabilities

**Do not** open public issues for security vulnerabilities.

Contact: **ankit.soral@outlook.com**

Include:
- Clear description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if applicable)

### Security Standards for Contributions

All contributions touching contract logic must:

1. Follow the Checks-Effects-Interactions pattern
2. Validate all external inputs
3. Include access control where appropriate
4. Not introduce unbounded loops or storage growth
5. Not exceed the 24 KB contract size limit for ElectionsManager (currently at 23,932 bytes)
6. Pass Slither static analysis without new findings

---

## Issue Guidelines

### Bug Reports

Include:
- Clear title and description
- Steps to reproduce
- Expected versus actual behaviour
- Environment details (Node.js version, OS, network)
- Code samples or transaction hashes if applicable

### Feature Requests

Include:
- Use case description
- Proposed implementation approach
- Alternative solutions considered
- Gas and storage impact assessment

---

## Recognition

Contributors will be credited in:
- Project acknowledgments
- Release notes
- README (for significant contributions)

---

## License

By contributing, you agree that your contributions will be licensed under the same terms as the project. See [LICENSE](LICENSE) for details.

---

**Version**: 4.1.0 | **Last Updated**: 2026-02-22
