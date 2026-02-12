// SPDX-License-Identifier: ANKIT.SORAL
pragma solidity ^0.8.20;

/**
 * @title VotingToken
 * @notice ERC20-compatible token for a specific poll, burnable on vote
 * @dev Simplified ERC20 without full transfer functionality
 *      Tokens are minted once per user and burned when used to vote
 */
contract VotingToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 0; // Voting tokens are whole units
    uint256 public totalSupply;

    // Poll ID this token is associated with
    uint256 public immutable pollId;

    // Reference to TokenManager that created this token
    address public immutable tokenManager;

    // Balance tracking
    mapping(address => uint256) public balanceOf;

    // Allowance tracking (for paymaster spending)
    mapping(address => mapping(address => uint256)) public allowance;

    // Events (ERC20 compatible)
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event VoteTokenBurned(address indexed voter, uint256 amount);

    modifier onlyTokenManager() {
        require(msg.sender == tokenManager, "Only TokenManager can call");
        _;
    }

    /**
     * @notice Constructor to initialize the voting token
     * @param _pollId The poll ID this token is associated with
     * @param _name Token name
     * @param _symbol Token symbol
     */
    constructor(
        uint256 _pollId,
        string memory _name,
        string memory _symbol
    ) {
        pollId = _pollId;
        name = _name;
        symbol = _symbol;
        tokenManager = msg.sender; // TokenManager deploys this
    }

    /**
     * @notice Mint tokens for a voter (called by TokenManager)
     * @param to Voter address
     * @param amount Number of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyTokenManager {
        require(to != address(0), "Invalid address");
        require(amount > 0, "Amount must be positive");

        balanceOf[to] += amount;
        totalSupply += amount;

        emit Transfer(address(0), to, amount);
    }

    /**
     * @notice Burn tokens when voting (called by TokenManager)
     * @param from Voter address
     * @param amount Number of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyTokenManager {
        require(balanceOf[from] >= amount, "Insufficient balance");

        balanceOf[from] -= amount;
        totalSupply -= amount;

        emit Transfer(from, address(0), amount);
        emit VoteTokenBurned(from, amount);
    }

    /**
     * @notice Approve spender (for paymaster pattern)
     * @param spender Address to approve (typically VotingPaymaster)
     * @param amount Amount to approve
     * @return bool Success status
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Transfer tokens (disabled for voting tokens)
     * @dev Voting tokens are non-transferable to prevent trading
     * @return bool Always reverts
     */
    function transfer(address, uint256) external pure returns (bool) {
        revert("Voting tokens are non-transferable");
    }

    /**
     * @notice TransferFrom (used by paymaster to burn tokens)
     * @dev Only allows burning (transfer to address(0))
     * @param from Source address
     * @param to Destination address (must be address(0))
     * @param amount Amount to transfer
     * @return bool Success status
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(to == address(0), "Only burning allowed");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        require(balanceOf[from] >= amount, "Insufficient balance");

        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        totalSupply -= amount;

        emit Transfer(from, address(0), amount);
        emit VoteTokenBurned(from, amount);

        return true;
    }
}
