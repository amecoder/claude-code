// Stub: snip compaction (HISTORY_SNIP feature-gated)
import type { Message } from 'src/types/message.js'

export function isSnipMarkerMessage(_message: Message): boolean {
	return false
}

export function snipCompactIfNeeded(
	_messages: unknown,
	_options?: { force?: boolean },
): null {
	return null
}
