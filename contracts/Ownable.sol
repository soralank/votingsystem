// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.20;

contract Ownable {
	// Owner state and transfer event
	address public owner;
	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

	// Set deployer as initial owner
	constructor() {
		owner = msg.sender;
	}

	// Restrict to owner
	modifier onlyOwner() {
		require(msg.sender == owner, "Only owner can perform this action.");
		_;
	}

	// Transfer ownership
	function transferOwnership(address _newOwner) public onlyOwner {
		require(_newOwner != address(0), "New owner is the zero address.");
		address previous = owner;
		owner = _newOwner;
		emit OwnershipTransferred(previous, _newOwner);
	}
}
