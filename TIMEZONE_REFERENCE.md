# Timezone & Time Calculation Reference

## 🌍 All Times Are UTC (Unix Timestamps)

**IMPORTANT:** All timestamps in the smart contracts are **Unix timestamps in UTC** (seconds since January 1, 1970 00:00:00 UTC).

---

## 📋 Key Concepts

### What is `block.timestamp`?
- **Always UTC**: Ethereum blockchain time is always in UTC
- **Unix timestamp format**: Seconds since epoch (not milliseconds!)
- **Miner discretion**: Can vary by ±30 seconds (why we have `TIME_BUFFER`)

### Time Parameters in Contract Functions

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `startTime` | uint | Poll start time (UTC Unix timestamp) | `1709294400` = 2024-03-01 10:00:00 UTC |
| `durationSeconds` | uint | How long poll runs (in seconds) | `86400` = 1 day |
| `endTime` | uint | Auto-calculated: `startTime + durationSeconds` | `1709380800` |

---

## 💻 Frontend Integration Guide

### JavaScript/TypeScript Examples

#### Creating a Poll (Convert Local Time → UTC Unix Timestamp)

```javascript
// Option 1: From specific UTC date/time string
const utcTimeString = '2026-03-01T10:00:00Z'; // Z = UTC
const startTime = Math.floor(new Date(utcTimeString).getTime() / 1000);

// Option 2: From local time (auto-converts to UTC)
const localTime = new Date('2026-03-01T10:00:00'); // Uses local timezone
const startTime = Math.floor(localTime.getTime() / 1000);

// Option 3: Current time + offset
const now = Math.floor(Date.now() / 1000); // Current UTC timestamp
const startTime = now + 3600; // Start in 1 hour

// Duration examples
const ONE_HOUR = 3600;
const ONE_DAY = 86400;
const ONE_WEEK = 604800;

// Create poll
const duration = ONE_DAY; // Poll runs for 1 day
await contract.createPoll(title, adminAddress, startTime, duration);
```

#### Displaying Times to Users

```javascript
// From contract - startTime is UTC Unix timestamp (seconds)
const startTime = await contract.getPollStartTime(pollId);
const endTime = await contract.getPollEndTime(pollId);

// Convert to Date objects (multiply by 1000 for milliseconds)
const startDate = new Date(startTime * 1000);
const endDate = new Date(endTime * 1000);

// Display in user's local timezone
console.log('Start:', startDate.toLocaleString());
console.log('End:', endDate.toLocaleString());

// Or format with specific options
const options = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short'
};
console.log('Start:', startDate.toLocaleString('en-US', options));
// Output: "March 1, 2026, 10:00 AM UTC" or converted to user's timezone
```

### Python Examples

```python
from datetime import datetime, timezone
import time

# Creating a poll - convert to UTC Unix timestamp
utc_time = datetime(2026, 3, 1, 10, 0, 0, tzinfo=timezone.utc)
start_time = int(utc_time.timestamp())

# Duration constants
ONE_HOUR = 3600
ONE_DAY = 86400
ONE_WEEK = 604800

# Current time + offset
now = int(time.time())
start_time = now + 3600  # Start in 1 hour

# Create poll
duration = ONE_DAY
tx = contract.functions.createPoll(title, admin_address, start_time, duration).transact()

# Displaying times
start_time = contract.functions.getPollStartTime(poll_id).call()
end_time = contract.functions.getPollEndTime(poll_id).call()

# Convert to datetime (user's local timezone)
start_date = datetime.fromtimestamp(start_time)
end_date = datetime.fromtimestamp(end_time)

print(f"Start: {start_date.strftime('%Y-%m-%d %H:%M:%S %Z')}")
print(f"End: {end_date.strftime('%Y-%m-%d %H:%M:%S %Z')}")
```

---

## 📊 Common Duration Values

| Duration | Seconds | Calculation |
|----------|---------|-------------|
| 5 minutes (minimum) | 300 | `5 * 60` |
| 1 hour | 3,600 | `60 * 60` |
| 12 hours | 43,200 | `12 * 60 * 60` |
| 1 day | 86,400 | `24 * 60 * 60` |
| 1 week | 604,800 | `7 * 24 * 60 * 60` |
| 30 days (max future start) | 2,592,000 | `30 * 24 * 60 * 60` |

---

## ⚠️ Important Constraints

### Time Validation Rules

1. **Start Time Constraints:**
   - ❌ Cannot be in the past: `startTime >= block.timestamp`
   - ❌ Cannot be more than 30 days in future: `startTime <= block.timestamp + 2592000`

2. **Duration Constraints:**
   - ❌ Minimum duration: 300 seconds (5 minutes)
   - ✅ No maximum duration

3. **Time Buffer:**
   - 30-second buffer accounts for miner timestamp variance
   - Voting window: `block.timestamp >= startTime && block.timestamp + 30 <= endTime`

### Testing Time Calculations

```javascript
// In tests, always add buffer for block mining delays
const now = await getCurrentTimestamp();

// ✅ GOOD: Give plenty of buffer for test setup
const startTime = now + 100; // 100 seconds in future
const duration = 600; // 10 minutes

// ❌ BAD: Too close to current time
const startTime = now + 2; // Might fail if block mines late
```

---

## 🔍 Troubleshooting

### "Start time cannot be in the past" Error
**Cause:** Your calculated startTime < current block.timestamp

**Solutions:**
- Add buffer when creating poll: `now + 60` (1 minute buffer)
- Check your timezone conversion is correct
- Verify you're using seconds, not milliseconds

### "Poll not active for voting" Error
**Cause:** Current time is outside voting window

**Check:**
```javascript
const now = Math.floor(Date.now() / 1000);
const startTime = await contract.getPollStartTime(pollId);
const endTime = await contract.getPollEndTime(pollId);

console.log('Current time:', now);
console.log('Start time:', startTime);
console.log('End time:', endTime);
console.log('Poll started?', now >= startTime);
console.log('Poll not ended?', now + 30 <= endTime); // 30 sec buffer
```

---

## 🎯 Quick Reference Card

```
UNIX TIMESTAMP (UTC)
━━━━━━━━━━━━━━━━━━━━
Format: Seconds since 1970-01-01 00:00:00 UTC
Range: 0 to ~2^32 (until year 2106)

CONVERT TO UNIX:
  JS:     Math.floor(Date.now() / 1000)
  Python: int(time.time())
  
CONVERT FROM UNIX:
  JS:     new Date(timestamp * 1000)
  Python: datetime.fromtimestamp(timestamp)

CONTRACT TIME FLOW:
  1. createPoll(title, admin, startTime, duration)
  2. Contract calculates: endTime = startTime + duration
  3. All stored as Unix timestamps (UTC)
  4. Frontend converts to local time for display
```

---

## 📝 Example: Complete Poll Creation Flow

```javascript
// 1. User selects date/time in their local timezone on frontend
const userSelectedDate = '2026-03-15T14:00'; // Local time picker value

// 2. Convert to UTC Unix timestamp
const startTime = Math.floor(new Date(userSelectedDate).getTime() / 1000);

// 3. Set duration
const duration = 7 * 24 * 60 * 60; // 1 week in seconds

// 4. Create poll
const tx = await contract.createPoll(
  "Should we implement feature X?",
  adminAddress,
  startTime,
  duration
);
await tx.wait();

// 5. Get poll info for display
const pollId = await contract.pollsCount();
const pollStartTime = await contract.getPollStartTime(pollId);
const pollEndTime = await contract.getPollEndTime(pollId);

// 6. Display to user in their timezone
console.log('Voting opens:', new Date(pollStartTime * 1000).toLocaleString());
console.log('Voting closes:', new Date(pollEndTime * 1000).toLocaleString());
```

---

**Last Updated:** 2026-02-09
