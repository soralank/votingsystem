// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL

pragma solidity ^0.8.20;

import "./VotingErrors.sol";

/**
 * @title Ownable (DEPRECATED)
 * @notice This contract is NOT used in the inheritance chain.
 * @dev Ownership logic is implemented directly in TokenIntegratedVoting.sol.
 *      This file is kept for reference only. Do NOT import or inherit from it.
 *      Use TokenIntegratedVoting's built-in ownership instead.
 */
contract Ownable {
	// Owner state and transfer event
	address public owner;
	address public pendingOwner;
	
	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
	event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

	// Set deployer as initial owner
	constructor() {
		owner = msg.sender;
	}

	// Restrict to owner
	modifier onlyOwner() {
		if (!(msg.sender == owner)) revert Unauthorized();
		_;
	}

	// Transfer ownership (2-step process)
	function transferOwnership(address _newOwner) public onlyOwner {
		if (!(_newOwner != address(0))) revert ZeroAddress();
		pendingOwner = _newOwner;
		emit OwnershipTransferStarted(owner, _newOwner);
	}

	// New owner accepts ownership
	function acceptOwnership() public {
		if (!(msg.sender == pendingOwner)) revert OnlyPendingOwner();
		address previous = owner;
		owner = pendingOwner;
		pendingOwner = address(0);
		emit OwnershipTransferred(previous, owner);
	}

	// Cancel pending ownership transfer
	function cancelOwnershipTransfer() public onlyOwner {
		if (!(pendingOwner != address(0))) revert NoTransferPending();
		pendingOwner = address(0);
	}

	// Renounce ownership (makes contract ownerless)
	function renounceOwnership() public onlyOwner {
		address previous = owner;
		owner = address(0);
		pendingOwner = address(0);
		emit OwnershipTransferred(previous, address(0));
	}
}
