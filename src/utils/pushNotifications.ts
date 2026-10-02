export interface InAppPushPayload {
  id: string;
  title: string;
  body: string;
  tag: string;
  timestamp: string;
  actionLabel?: string;
}

export type BrowserPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function getBrowserNotificationPermission(): BrowserPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as BrowserPermissionState;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result as BrowserPermissionState;
  } catch {
    return Notification.permission as BrowserPermissionState;
  }
}

/**
 * Plays a gentle, acoustic-style harmonic chime using the Web Audio API
 * when a push reminder triggers and sound is enabled.
 */
export function playReminderChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Two soft harmonic sine tones (C5 -> G5)
    const freqs = [523.25, 783.99];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.95);
    });
  } catch {
    // Ignore audio context restrictions if no user gesture yet
  }
}

/**
 * Dispatches both a native Browser/OS Push Notification (if granted)
 * and invokes the in-app push banner callback so notifications always work
 * reliably inside preview iframes and desktop/mobile browsers.
 */
export function dispatchPushNotification(
  payload: {
    title: string;
    body: string;
    tag: string;
    actionLabel?: string;
  },
  options: {
    soundEnabled: boolean;
    onInAppPush: (notification: InAppPushPayload) => void;
  }
): void {
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const item: InAppPushPayload = {
    id: `push_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    timestamp: nowStr,
    actionLabel: payload.actionLabel,
  };

  if (options.soundEnabled) {
    playReminderChime();
  }

  // Trigger in-app push toast & log in notification history
  options.onInAppPush(item);

  // Also trigger native Web Notification API if permission is granted
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        silent: !options.soundEnabled,
      });
    } catch {
      // Fallback handled by onInAppPush
    }
  }
}
