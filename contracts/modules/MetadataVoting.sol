// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

import "../VotingErrors.sol";

/**
 * @title MetadataVoting
 * @notice Module for IPFS poll metadata management
 * @dev Lightweight contract that stores metadata URIs.
 *      All validation is handled by ElectionsManager.
 */
contract MetadataVoting {
    // pollId => IPFS metadata URI (e.g., "ipfs://Qm...")
    mapping(uint => string) public pollMetadataURI;

    // Owner (ElectionsManager) who can call state-changing functions
    address public electionsManager;

    event PollMetadataSet(uint indexed pollId, string metadataURI);

    modifier onlyElectionsManager() {
        if (!(msg.sender == electionsManager)) revert Unauthorized();
        _;
    }

    constructor() {
        electionsManager = msg.sender;
    }

    /**
     * @notice Set IPFS metadata URI for a poll
     * @param pollId Poll ID
     * @param metadataURI IPFS URI
     */
    function setPollMetadata(uint pollId, string calldata metadataURI) external onlyElectionsManager {
        if (!(bytes(metadataURI).length > 0)) revert EmptyMetadata();
        pollMetadataURI[pollId] = metadataURI;
        emit PollMetadataSet(pollId, metadataURI);
    }

    /**
     * @notice Get IPFS metadata URI for a poll
     * @param pollId Poll ID
     * @return metadataURI The IPFS URI string
     */
    function getPollMetadata(uint pollId) external view returns (string memory) {
        return pollMetadataURI[pollId];
    }
}
