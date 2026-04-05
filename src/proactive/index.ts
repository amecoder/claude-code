// Stub: proactive module (PROACTIVE/KAIROS feature-gated, not available in external builds)
export function isProactiveActive(): boolean {
	return false
}

export function activateProactive(_source: string): void {}

export function deactivateProactive(): void {}

export function isProactivePaused(): boolean {
	return false
}

export function getProactiveConfig(): null {
	return null
}

export function subscribeToProactiveStatus(_cb: () => void): () => void {
	return () => {}
}

export const PROACTIVE_SYSTEM_PROMPT_SECTION = ''
