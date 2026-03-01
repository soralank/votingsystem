// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title VotingProxy
 * @dev Wraps OpenZeppelin's ERC1967Proxy to make it available as a Hardhat artifact
 * for compilation and use in deployment scripts and tests.
 *
 * This proxy is used by the UUPS upgradeable voting system:
 *   - Stores all contract state (storage)
 *   - Delegates function calls to the current implementation (V1/V2/...)
 *   - Same address forever — users always interact with this contract
 *
 * Usage: await ethers.getContractFactory("VotingProxy")
 */
contract VotingProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory _data) ERC1967Proxy(implementation, _data) {}
}
