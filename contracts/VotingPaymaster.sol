// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

import "./TokenManager.sol";

/**
 * @title VotingPaymaster
 * @notice Pays gas fees for token-based votes via meta-transactions
 * @dev Simplified paymaster (not full ERC-4337), uses EIP-712 signatures
 */
contract VotingPaymaster {
    // Reentrancy guard
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // Reference to main voting contract
    address public votingContract;

    // Reference to token manager
    TokenManager public tokenManager;

    // Admin who can fund the paymaster
    address public admin;

    // Nonce tracking for meta-transactions (prevents replay)
    mapping(address => uint256) public nonces;

    // EIP-712 Domain Separator
    bytes32 public immutable DOMAIN_SEPARATOR;

    // EIP-712 TypeHash for VoteWithToken
    bytes32 public constant VOTE_TYPEHASH = keccak256(
        "VoteWithToken(uint256 pollId,uint256 optionId,address voter,uint256 nonce,uint256 deadline)"
    );

    // Gas limit per transaction
    uint256 public constant GAS_LIMIT = 200000;

    // Relayer whitelist
    mapping(address => bool) public trustedRelayers;
    bool public relayerWhitelistEnabled;

    // Events
    event Funded(address indexed funder, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event GasSponsored(uint256 indexed pollId, address indexed voter, uint256 gasUsed, uint256 gasPrice);
    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    event RelayerWhitelistToggled(bool enabled);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyVotingContract() {
        require(msg.sender == votingContract, "Only voting contract");
        _;
    }

    /**
     * @notice Constructor to initialize the paymaster
     * @param _votingContract Address of the voting contract
     * @param _tokenManager Address of the token manager
     * @param _admin Address of the admin
     */
    constructor(address _votingContract, address _tokenManager, address _admin) {
        require(_votingContract != address(0), "Invalid voting contract");
        require(_tokenManager != address(0), "Invalid token manager");
        require(_admin != address(0), "Invalid admin");

        votingContract = _votingContract;
        tokenManager = TokenManager(_tokenManager);
        admin = _admin;
        _reentrancyStatus = _NOT_ENTERED;

        // EIP-712 Domain Separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("VotingPaymaster")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice Fund the paymaster with ETH
     */
    function fund() external payable {
        require(msg.value > 0, "Must send ETH");
        emit Funded(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw funds (admin only)
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external onlyAdmin {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = payable(admin).call{value: amount}("");
        require(success, "ETH transfer failed");
        emit Withdrawn(admin, amount);
    }

    /**
     * @notice Add trusted relayer
     * @param relayer Address of relayer
     */
    function addRelayer(address relayer) external onlyAdmin {
        require(relayer != address(0), "Invalid relayer");
        trustedRelayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    /**
     * @notice Remove trusted relayer
     * @param relayer Address of relayer
     */
    function removeRelayer(address relayer) external onlyAdmin {
        trustedRelayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    /**
     * @notice Enable or disable relayer whitelist enforcement
     * @param enabled True to require trusted relayers, false to allow anyone
     */
    function setRelayerWhitelistEnabled(bool enabled) external onlyAdmin {
        relayerWhitelistEnabled = enabled;
        emit RelayerWhitelistToggled(enabled);
    }

    /**
     * @notice Verify EIP-712 signature
     * @param pollId Poll ID
     * @param optionId Option ID to vote for
     * @param voter Voter address
     * @param deadline Signature expiration timestamp
     * @param v,r,s Signature components
     * @return bool True if signature is valid
     */
    function verifySignature(
        uint256 pollId,
        uint256 optionId,
        address voter,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public view returns (bool) {
        require(block.timestamp <= deadline, "Signature expired");

        bytes32 structHash = keccak256(
            abi.encode(
                VOTE_TYPEHASH,
                pollId,
                optionId,
                voter,
                nonces[voter],
                deadline
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        // Reject malleable signatures (EIP-2 / OpenZeppelin ECDSA standard)
        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "Invalid s value"
        );
        require(v == 27 || v == 28, "Invalid v value");

        address recoveredAddress = ecrecover(digest, v, r, s);
        return recoveredAddress == voter && recoveredAddress != address(0);
    }

    /**
     * @notice Execute gasless vote via meta-transaction
     * @param pollId Poll ID
     * @param optionId Option ID to vote for
     * @param voter Voter address (signer)
     * @param deadline Signature expiration
     * @param v,r,s Signature components
     * @return bool Success status
     */
    function executeVoteWithToken(
        uint256 pollId,
        uint256 optionId,
        address voter,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (bool) {
        uint256 gasStart = gasleft();

        // L-2: Validate voter address
        require(voter != address(0), "Invalid voter");

        // Enforce relayer whitelist if enabled
        if (relayerWhitelistEnabled) {
            require(trustedRelayers[msg.sender], "Only trusted relayers can execute");
        }

        // Verify signature
        require(verifySignature(pollId, optionId, voter, deadline, v, r, s), "Invalid signature");

        // Check voter has tokens
        require(tokenManager.hasVoteTokens(pollId, voter), "Insufficient vote tokens");

        // Increment nonce BEFORE external call (CEI pattern, prevents replay)
        nonces[voter]++;

        // Forward call to voting contract (voting contract will burn tokens)
        (bool success, bytes memory returndata) = votingContract.call{gas: GAS_LIMIT}(
            abi.encodeWithSignature(
                "voteInPollWithToken(uint256,uint256,address)",
                pollId,
                optionId,
                voter
            )
        );

        if (!success) {
            // If returndata is empty, use a generic error message
            if (returndata.length == 0) {
                revert("Vote execution failed");
            }
            // Otherwise, bubble up the error
            assembly {
                revert(add(returndata, 32), mload(returndata))
            }
        }

        // Calculate gas used and record
        uint256 gasUsed = gasStart - gasleft();
        emit GasSponsored(pollId, voter, gasUsed, tx.gasprice);

        return true;
    }

    /**
     * @notice Transfer admin rights
     * @param newAdmin New admin address
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin");
        address previous = admin;
        admin = newAdmin;
        emit AdminTransferred(previous, newAdmin);
    }

    /**
     * @notice Get current nonce for a voter
     * @param voter Voter address
     * @return uint256 Current nonce
     */
    function getNonce(address voter) external view returns (uint256) {
        return nonces[voter];
    }

    /**
     * @notice Check paymaster balance
     * @return uint256 Current balance in wei
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Check if an address is a trusted relayer
     * @param relayer Address to check
     * @return bool True if address is a trusted relayer
     */
    function isTrustedRelayer(address relayer) external view returns (bool) {
        return trustedRelayers[relayer];
    }

    /**
     * @notice Get the domain separator for EIP-712
     * @return bytes32 Domain separator
     */
    function getDomainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }

    /**
     * @notice Receive ETH directly
     */
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
