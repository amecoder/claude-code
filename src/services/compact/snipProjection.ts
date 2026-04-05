// Stub: snip projection (HISTORY_SNIP feature-gated)
import type { Message } from 'src/types/message.js'

export function isSnipBoundaryMessage(_message: Message): boolean {
	return false
}

export function projectSnippedView<T>(messages: T[]): T[] {
	return messages
}
