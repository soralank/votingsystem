// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

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
        require(msg.sender == electionsManager, "Only ElectionsManager");
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
        require(bytes(metadataURI).length > 0, "Metadata URI cannot be empty.");
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
