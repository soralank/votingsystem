// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @dev This contract wraps OpenZeppelin's ERC1967Proxy to make it available to Hardhat
 * for compilation and use in tests/deployment scripts.
 *
 * Usage in tests: await ethers.getContractFactory("TestERC1967Proxy")
 */
contract TestERC1967Proxy is ERC1967Proxy {
    constructor(address implementation, bytes memory _data) ERC1967Proxy(implementation, _data) {}
}
