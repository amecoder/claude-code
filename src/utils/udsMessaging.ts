// Stub: UDS (Unix Domain Socket) messaging (UDS_INBOX feature-gated)
export function setOnEnqueue(_cb: () => void): void {}

export function getUdsMessagingSocketPath(): string | null {
	return null
}

export function startUdsMessaging(): void {}

export function cleanupUdsSocket(): void {}
