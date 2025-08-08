# lib.ts Optimization Summary

## Key Optimizations Implemented

### 1. **Stream-Based Processing**
- Replaced `getAllMessages()` that loads entire file into memory with async generators
- Added `readTranscriptLines()` generator for efficient line-by-line processing
- Implemented `streamConversationHistory()` and `streamToolUsage()` for memory-efficient operations
- Large transcript files can now be processed without loading everything into memory

### 2. **Caching Mechanism**
- Added transcript cache with 5-minute TTL to avoid repeated file reads
- Automatic cache cleanup to prevent memory leaks
- Optional cache bypass for real-time requirements
- `clearTranscriptCache()` function for manual cache control

### 3. **Early Exit Optimizations**
- `getInitialMessage()` now exits immediately after finding first user message
- No longer reads entire file when only first message is needed
- Significant performance improvement for large transcripts

### 4. **New Optimized Functions**
- `getLastNMessages()` - Get recent messages without reading entire file
- `searchMessages()` - Stream-based search with limit support
- `getSessionMetadata()` - Efficient metadata extraction
- All use streaming to minimize memory usage

### 5. **Better Type Safety**
- Added type predicates for array filtering
- Improved type narrowing in filter operations
- Reduces runtime type checking overhead

### 6. **Improved Error Handling**
- Better structured error handling in `runHook()`
- Buffered stdin reading to handle partial JSON inputs
- Separated async error handling logic

### 7. **Performance Enhancements**
- Increased file stream buffer to 64KB for better I/O performance
- Used `once` from events module for better async handling
- Optimized JSON parsing with dedicated helper function
- Reduced object allocations in hot paths

## Usage Examples

### Stream-based processing for large files:
```typescript
// Instead of loading all messages
const allMessages = await getAllMessages(transcriptPath)

// Use streaming for large files
for await (const message of streamConversationHistory(transcriptPath)) {
  // Process each message as it's read
  console.log(message)
}
```

### Efficient searching:
```typescript
// Search with limit to avoid processing entire file
for await (const message of searchMessages(transcriptPath, 'error', { limit: 10 })) {
  console.log('Found error:', message)
}
```

### Get recent messages efficiently:
```typescript
// Get last 20 messages without reading entire file
const recentMessages = await getLastNMessages(transcriptPath, 20)
```

## Backwards Compatibility

All original functions maintain their signatures and behavior. New streaming versions are available as alternatives for performance-critical scenarios.

## Memory Usage Comparison

- **Original**: O(n) where n = total messages in transcript
- **Optimized**: O(1) for streaming operations, O(k) for limited operations where k = limit

## Recommended Migration Path

1. For new code, prefer streaming functions
2. Use cached `getAllMessages()` for frequently accessed transcripts
3. Replace `getConversationHistory()` with `streamConversationHistory()` for large files
4. Use `getLastNMessages()` instead of `getAllMessages().slice(-n)`