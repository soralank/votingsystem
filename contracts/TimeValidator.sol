// SPDX-License-Identifier: LicenseRef-ANKIT-SORAL
pragma solidity ^0.8.20;

import "./VotingErrors.sol";

/**
 * @title TimeValidator
 * @notice All timestamps in this contract are Unix timestamps (seconds since Jan 1, 1970 00:00:00 UTC)
 * @dev IMPORTANT TIMEZONE INFORMATION:
 *      - block.timestamp is ALWAYS in UTC (Coordinated Universal Time)
 *      - All time parameters (startTime, endTime, duration) must be provided as Unix timestamps in UTC
 *      - Frontend applications should convert local times to UTC Unix timestamps before calling contract functions
 *      - To convert: UTC timestamp = new Date(yourLocalTime).getTime() / 1000
 *      - To display: new Date(utcTimestamp * 1000).toLocaleString()
 */
contract TimeValidator {
    // Time-related constants (all in seconds)
    uint public constant MIN_POLL_DURATION = 300; // 5 minutes minimum
    uint public constant TIME_BUFFER = 30; // 30 second buffer for timestamp variance (miner discretion)
    uint public constant MAX_FUTURE_START = 30 days; // Max future scheduling (2592000 seconds)

    /**
     * @dev Validates that start time is valid (not in past, not too far in future)
     * @param startTime The proposed start time as Unix timestamp (UTC seconds since epoch)
     * Time Calculation Example: To start poll at 2026-03-01 10:00:00 UTC:
     *   - JavaScript: Math.floor(new Date('2026-03-01T10:00:00Z').getTime() / 1000)
     *   - Python: int(datetime.datetime(2026, 3, 1, 10, 0, 0, tzinfo=datetime.timezone.utc).timestamp())
     */
    function _validateStartTime(uint startTime) internal view {
        if (!(startTime >= block.timestamp)) revert StartTimeInPast();
        if (!(startTime <= block.timestamp + MAX_FUTURE_START)) revert StartTimeTooFarInFuture();
    }

    /**
     * @dev Validates that duration meets minimum requirements
     * @param duration The poll duration in seconds (e.g., 3600 = 1 hour, 86400 = 1 day)
     * Duration Examples:
     *   - 1 hour = 3600 seconds
     *   - 1 day = 86400 seconds
     *   - 1 week = 604800 seconds
     */
    function _validateDuration(uint duration) internal pure {
        if (!(duration >= MIN_POLL_DURATION)) revert DurationTooShort();
    }

    /**
     * @dev Validates the complete time range (start + duration)
     * @param startTime When voting begins (Unix timestamp in UTC)
     * @param duration How long voting lasts (seconds)
     * NOTE: endTime is automatically calculated as: startTime + duration
     *       Both startTime and endTime are stored/returned as Unix timestamps (UTC)
     */
    function _validateTimeRange(uint startTime, uint duration) internal view {
        _validateStartTime(startTime);
        _validateDuration(duration);
        
        uint endTime = startTime + duration;
        if (!(endTime > startTime)) revert TimeOverflow();
    }

    /**
     * @dev Checks if current time is within voting period (with buffer)
     * @param startTime When voting begins (Unix timestamp UTC)
     * @param endTime When voting ends (Unix timestamp UTC)
     * @return True if current block.timestamp (UTC) is between startTime and (endTime - TIME_BUFFER)
     */
    function _isWithinVotingPeriod(uint startTime, uint endTime) internal view returns (bool) {
        return block.timestamp >= startTime && block.timestamp + TIME_BUFFER <= endTime;
    }

    /**
     * @dev Checks if poll has started
     * @param startTime When voting begins (Unix timestamp UTC)
     * @return True if current block.timestamp (UTC) >= startTime
     */
    function _hasStarted(uint startTime) internal view returns (bool) {
        return block.timestamp >= startTime;
    }

    /**
     * @dev Checks if poll has ended (with buffer)
     * @param endTime When voting ends (Unix timestamp UTC)
     * @return True if current block.timestamp (UTC) >= endTime + TIME_BUFFER
     */
    function _hasEnded(uint endTime) internal view returns (bool) {
        return block.timestamp >= endTime + TIME_BUFFER;
    }
}
