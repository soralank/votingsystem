# Contributing to Voting System

Thank you for your interest in contributing to the Voting System project! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Community](#community)

## 📜 Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive Behavior:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable Behavior:**
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

## 🚀 Getting Started

### Prerequisites

Ensure you have:
- Node.js v18.x or higher
- npm or yarn
- Git
- A GitHub account
- Basic knowledge of Solidity and TypeScript

### Setting Up Your Development Environment

1. **Fork the Repository**

   Click the "Fork" button on the GitHub repository page.

2. **Clone Your Fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/votingsystem.git
   cd votingsystem
   ```

3. **Add Upstream Remote**

   ```bash
   git remote add upstream https://github.com/soralank/votingsystem.git
   ```

4. **Install Dependencies**

   ```bash
   npm install
   ```

5. **Verify Setup**

   ```bash
   npx hardhat compile
   npx hardhat test
   ```

## 🔄 Development Workflow

### 1. Create a Feature Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `test/` - Test additions or modifications
- `refactor/` - Code refactoring

### 2. Make Your Changes

- Write clean, readable code
- Follow the coding standards (see below)
- Add tests for new functionality
- Update documentation as needed

### 3. Commit Your Changes

Use clear, descriptive commit messages:

```bash
git add .
git commit -m "feat: add voter delegation feature"
```

Commit message format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### 4. Keep Your Branch Updated

```bash
git fetch upstream
git rebase upstream/main
```

### 5. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 6. Create a Pull Request

Go to the original repository and click "New Pull Request".

## 💻 Coding Standards

### Solidity Style Guide

Follow the [Official Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html).

**Key Points:**

```solidity
// SPDX-License-Identifier: ANKIT.SORAL
pragma solidity ^0.8.20;

/// @title Contract Title
/// @notice Explain contract purpose
/// @dev Developer notes
contract MyContract {
    // State variables
    uint public immutable MAX_VALUE = 100;
    address private _owner;

    // Events
    event ValueUpdated(uint indexed oldValue, uint indexed newValue);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == _owner, "Not owner");
        _;
    }

    // Functions: external, public, internal, private
    
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
- Contracts: `PascalCase`
- Functions: `camelCase`
- Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Private variables: `_leadingUnderscore`
- Events: `PascalCase`

### TypeScript Style Guide

```typescript
// Use strict TypeScript
import { expect } from "chai";
import { ethers } from "hardhat";

// Interfaces with PascalCase
interface VotingConfig {
    pollId: number;
    duration: number;
}

// Functions with camelCase
async function deployContract(): Promise<Contract> {
    const ContractFactory = await ethers.getContractFactory("Voting");
    const contract = await ContractFactory.deploy();
    await contract.waitForDeployment();
    return contract;
}

// Use descriptive variable names
const votingContract = await deployContract();
const pollCreationTx = await votingContract.createPoll("Test", admin, 3600);
```

### Gas Optimization

- Use `calldata` for read-only function parameters
- Minimize storage operations
- Use `immutable` and `constant` when possible
- Batch operations where applicable
- Avoid loops over unbounded arrays

### Security Best Practices

1. **Input Validation**
   ```solidity
   require(value > 0, "Value must be positive");
   require(address != address(0), "Invalid address");
   ```

2. **Access Control**
   ```solidity
   modifier onlyAdmin() {
       require(msg.sender == admin, "Only admin");
       _;
   }
   ```

3. **Reentrancy Protection**
   ```solidity
   // State changes before external calls
   hasVoted[msg.sender] = true;
   externalContract.call();
   ```

4. **Safe Math**
   - Solidity 0.8.0+ has built-in overflow protection
   - Use SafeMath for older versions

## 🔍 Pull Request Process

### Before Submitting

1. **Run All Tests**
   ```bash
   npx hardhat test
   ```

2. **Check Code Coverage**
   ```bash
   npx hardhat coverage
   ```
   Aim for >90% coverage for new code.

3. **Lint Your Code**
   ```bash
   npm run lint
   ```

4. **Compile Contracts**
   ```bash
   npx hardhat compile
   ```

5. **Update Documentation**
   - Update relevant .md files
   - Add inline code comments
   - Update README if needed

### PR Template

When creating a pull request, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added to complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added with >90% coverage

## Related Issues
Closes #(issue number)

## Screenshots (if applicable)
```

### Review Process

1. **Automated Checks**: CI/CD runs tests and linting
2. **Code Review**: Maintainers review code quality and design
3. **Feedback**: Address review comments
4. **Approval**: At least one maintainer approval required
5. **Merge**: Maintainer merges after approval

## 🧪 Testing Requirements

### Test Coverage Requirements

- **Critical Functions**: 100% coverage
- **New Features**: Minimum 90% coverage
- **Overall Project**: Maintain >85% coverage

### Writing Tests

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

    it("should revert with error message", async function () {
        await expect(
            contract.connect(user).restrictedFunction()
        ).to.be.revertedWith("Not authorized");
    });
});
```

### Test Categories

1. **Unit Tests**: Test individual functions
2. **Integration Tests**: Test contract interactions
3. **Edge Cases**: Boundary conditions and error scenarios
4. **Security Tests**: Access control and attack vectors
5. **Gas Tests**: Ensure operations are gas-efficient

## 📝 Documentation

### What to Document

1. **Code Comments**
   - Complex logic explanation
   - Security considerations
   - Gas optimization notes

2. **Function Documentation**
   - Purpose and behavior
   - Parameters and return values
   - Example usage

3. **Architecture Changes**
   - Update ARCHITECTURE.md
   - Explain design decisions

4. **README Updates**
   - New features or changes
   - Updated installation steps
   - New usage examples

### Documentation Style

- Use clear, concise language
- Include code examples
- Explain the "why" not just the "what"
- Keep it up-to-date

## 👥 Community

### Getting Help

- **GitHub Issues**: Report bugs or request features
- **Discussions**: Ask questions and share ideas
- **Pull Requests**: Contribute code

### Communication Guidelines

- Be respectful and professional
- Provide context and details
- Be patient with responses
- Help others when you can

## 🏆 Recognition

Contributors will be:
- Listed in project acknowledgments
- Credited in release notes
- Recognized in the README (for significant contributions)

## 📋 Issue Guidelines

### Reporting Bugs

Include:
- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, OS, etc.)
- Code samples if applicable

### Feature Requests

Include:
- Use case description
- Proposed solution
- Alternative solutions considered
- Impact assessment

### Security Issues

**DO NOT** open public issues for security vulnerabilities.
Contact maintainers privately at: [security contact method]

## ✅ Contribution Checklist

Before submitting a PR:

- [ ] Code compiles without errors
- [ ] All tests pass
- [ ] New tests added for new features
- [ ] Code coverage maintained
- [ ] Documentation updated
- [ ] Commit messages follow conventions
- [ ] No merge conflicts
- [ ] PR description is complete
- [ ] Changes are backwards compatible (or noted)

## 🎓 Learning Resources

- [Solidity Documentation](https://docs.soliditylang.org/)
- [Hardhat Documentation](https://hardhat.org/getting-started/)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [Ethereum Development Best Practices](https://consensys.github.io/smart-contract-best-practices/)

## 📜 License

By contributing, you agree that your contributions will be licensed under the same license as the project (ANKIT.SORAL).

---

## Thank You! 🙏

Your contributions make this project better for everyone. We appreciate your time and effort!

**Questions?** Open a discussion or reach out to the maintainers.

**Ready to contribute?** Start by checking our [good first issues](https://github.com/soralank/votingsystem/labels/good%20first%20issue)!

---

*Last updated: February 2026*