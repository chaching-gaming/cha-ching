/**
 * Simple event emitter for celebration events.
 * Used to bridge notifications to UI celebrations.
 */

export type CelebrationEvent = {
  type: 'win' | 'loss';
  betId: string;
  roomId?: string;
};

type CelebrationListener = (event: CelebrationEvent) => void;

const listeners = new Set<CelebrationListener>();

/** Emit a celebration event to all listeners */
export function emitCelebration(event: CelebrationEvent): void {
  if (__DEV__) console.log('[Celebration] Emitting event:', event);
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      if (__DEV__) console.error('[Celebration] Listener error:', err);
    }
  }
}

/** Subscribe to celebration events. Returns unsubscribe function. */
export function subscribeToCelebrations(listener: CelebrationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
