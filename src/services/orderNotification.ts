// @ts-nocheck
/**
 * Order Notification Service
 * Plays configurable ringtone melodies and shows system notifications
 * when new orders arrive on POS/Kitchen screens.
 */

import { getSetting } from '../db/database';

// ---------------------------------------------------------------------------
// Ringtone Definitions (Web Audio API synthesized melodies)
// ---------------------------------------------------------------------------

/**
 * Each ringtone is a sequence of { freq, duration, delay } steps.
 * freq = Hz, duration = ms, delay = ms offset from start.
 */
const RINGTONES = {
  classic_bell: {
    label: 'Classic Bell',
    icon: 'notifications_active',
    notes: [
      { freq: 830, dur: 120, delay: 0 },
      { freq: 1050, dur: 120, delay: 140 },
      { freq: 830, dur: 120, delay: 280 },
      { freq: 1050, dur: 120, delay: 420 },
      { freq: 1320, dur: 200, delay: 580 },
      { freq: 830, dur: 120, delay: 900 },
      { freq: 1050, dur: 120, delay: 1040 },
      { freq: 830, dur: 120, delay: 1180 },
      { freq: 1050, dur: 120, delay: 1320 },
      { freq: 1320, dur: 200, delay: 1480 },
    ],
    totalMs: 1800,
  },
  urgent_alarm: {
    label: 'Urgent Alarm',
    icon: 'crisis_alert',
    notes: [
      { freq: 880, dur: 200, delay: 0 },
      { freq: 0, dur: 100, delay: 200 },
      { freq: 880, dur: 200, delay: 300 },
      { freq: 0, dur: 100, delay: 500 },
      { freq: 1100, dur: 200, delay: 600 },
      { freq: 0, dur: 100, delay: 800 },
      { freq: 1100, dur: 200, delay: 900 },
      { freq: 0, dur: 100, delay: 1100 },
      { freq: 880, dur: 300, delay: 1200 },
      { freq: 1100, dur: 300, delay: 1550 },
    ],
    totalMs: 1900,
  },
  kitchen_chime: {
    label: 'Kitchen Chime',
    icon: 'restaurant',
    notes: [
      { freq: 523, dur: 150, delay: 0 },
      { freq: 659, dur: 150, delay: 170 },
      { freq: 784, dur: 150, delay: 340 },
      { freq: 1047, dur: 300, delay: 510 },
      { freq: 784, dur: 150, delay: 900 },
      { freq: 1047, dur: 300, delay: 1070 },
    ],
    totalMs: 1400,
  },
  cash_register: {
    label: 'Cash Register',
    icon: 'point_of_sale',
    notes: [
      { freq: 1500, dur: 60, delay: 0 },
      { freq: 1800, dur: 60, delay: 80 },
      { freq: 2100, dur: 60, delay: 160 },
      { freq: 2400, dur: 80, delay: 240 },
      { freq: 0, dur: 200, delay: 340 },
      { freq: 1200, dur: 100, delay: 540 },
      { freq: 1500, dur: 100, delay: 660 },
      { freq: 2000, dur: 200, delay: 780 },
    ],
    totalMs: 1000,
  },
};

export type RingtoneId = keyof typeof RINGTONES;
export const RINGTONE_OPTIONS = Object.entries(RINGTONES).map(([id, r]) => ({
  id: id as RingtoneId,
  label: r.label,
  icon: r.icon,
}));

// ---------------------------------------------------------------------------
// Settings Keys
// ---------------------------------------------------------------------------

const SETTING_KEYS = {
  enabled: 'orderAlertEnabled',
  ringtone: 'orderAlertRingtone',
  volume: 'orderAlertVolume',
  duration: 'orderAlertDuration',
  systemNotif: 'orderAlertSystemNotif',
  vibration: 'orderAlertVibration',
  filterRemoteOnly: 'orderAlertRemoteOnly',
};

export { SETTING_KEYS as ORDER_ALERT_SETTINGS };

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  enabled: true,
  ringtone: 'kitchen_chime' as RingtoneId,
  volume: 80, // 0-100
  duration: 6, // seconds to loop the ringtone
  systemNotif: true,
  vibration: true,
  filterRemoteOnly: false,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class OrderNotificationService {
  private _audioCtx: AudioContext | null = null;
  private _activeNodes: OscillatorNode[] = [];
  private _loopTimer: ReturnType<typeof setTimeout> | null = null;
  private _stopTimer: ReturnType<typeof setTimeout> | null = null;
  private _isPlaying = false;

  /** Lazily create / resume an AudioContext */
  private getAudioContext(): AudioContext {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      this._audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    return this._audioCtx;
  }

  /** Load current alert settings from IndexedDB */
  async getSettings() {
    const [enabled, ringtone, volume, duration, systemNotif, vibration, filterRemoteOnly] =
      await Promise.all([
        getSetting(SETTING_KEYS.enabled),
        getSetting(SETTING_KEYS.ringtone),
        getSetting(SETTING_KEYS.volume),
        getSetting(SETTING_KEYS.duration),
        getSetting(SETTING_KEYS.systemNotif),
        getSetting(SETTING_KEYS.vibration),
        getSetting(SETTING_KEYS.filterRemoteOnly),
      ]);

    return {
      enabled: enabled !== null ? enabled === true || enabled === 'true' : DEFAULTS.enabled,
      ringtone: (ringtone as RingtoneId) || DEFAULTS.ringtone,
      volume: volume !== null ? Number(volume) : DEFAULTS.volume,
      duration: duration !== null ? Number(duration) : DEFAULTS.duration,
      systemNotif: systemNotif !== null ? systemNotif === true || systemNotif === 'true' : DEFAULTS.systemNotif,
      vibration: vibration !== null ? vibration === true || vibration === 'true' : DEFAULTS.vibration,
      filterRemoteOnly: filterRemoteOnly !== null ? filterRemoteOnly === true || filterRemoteOnly === 'true' : DEFAULTS.filterRemoteOnly,
    };
  }

  /**
   * Play a ringtone once (one pass of all notes).
   */
  playRingtoneOnce(ringtoneId: RingtoneId, volume: number) {
    const ringtone = RINGTONES[ringtoneId];
    if (!ringtone) return;

    const ctx = this.getAudioContext();
    const gainValue = Math.max(0, Math.min(1, volume / 100));

    for (const note of ringtone.notes) {
      if (note.freq === 0) continue; // silence gap

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.value = note.freq;
      gain.gain.setValueAtTime(gainValue, ctx.currentTime + note.delay / 1000);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        ctx.currentTime + (note.delay + note.dur) / 1000
      );

      osc.start(ctx.currentTime + note.delay / 1000);
      osc.stop(ctx.currentTime + (note.delay + note.dur + 20) / 1000);

      this._activeNodes.push(osc);

      // Cleanup reference after stop
      osc.onended = () => {
        const idx = this._activeNodes.indexOf(osc);
        if (idx !== -1) this._activeNodes.splice(idx, 1);
      };
    }
  }

  /**
   * Play a looping ringtone for a given duration.
   */
  playLooping(ringtoneId: RingtoneId, volume: number, durationSec: number) {
    if (this._isPlaying) return; // already playing
    this._isPlaying = true;

    const ringtone = RINGTONES[ringtoneId];
    if (!ringtone) return;

    const loopIntervalMs = ringtone.totalMs + 400; // gap between loops

    // Play first immediately
    this.playRingtoneOnce(ringtoneId, volume);

    // Loop
    this._loopTimer = setInterval(() => {
      this.playRingtoneOnce(ringtoneId, volume);
    }, loopIntervalMs);

    // Auto-stop after duration
    this._stopTimer = setTimeout(() => {
      this.stop();
    }, durationSec * 1000);
  }

  /**
   * Stop all active sounds.
   */
  stop() {
    if (this._loopTimer) {
      clearInterval(this._loopTimer);
      this._loopTimer = null;
    }
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }

    // Stop all active oscillators
    for (const osc of this._activeNodes) {
      try { osc.stop(); } catch (_) { /* already stopped */ }
    }
    this._activeNodes = [];
    this._isPlaying = false;
  }

  get isPlaying() {
    return this._isPlaying;
  }

  /**
   * Show a system browser notification.
   */
  async showSystemNotification(title: string, body: string) {
    const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform();
    
    if (isCapacitor) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const permission = await LocalNotifications.checkPermissions();
        
        if (permission.display !== 'granted') {
          const req = await LocalNotifications.requestPermissions();
          if (req.display !== 'granted') return;
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: Math.floor(Math.random() * 100000) + 1,
              schedule: { at: new Date(Date.now() + 50) },
              smallIcon: 'ic_launcher_round',
            }
          ]
        });
      } catch (e) {
        console.error('[OrderNotif] Native local notification failed:', e);
      }
      return;
    }

    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/icons/icon-192.png',
          tag: 'new-order-alert',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
        });
      } catch (e) {
        console.warn('[OrderNotif] System notification failed:', e);
      }
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          this.showSystemNotification(title, body);
        }
      });
    }
  }

  /**
   * Trigger vibration pattern for new order.
   */
  triggerVibration() {
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300, 100, 500]);
    }
  }

  /**
   * Main entry point — called when a new order is detected.
   * Reads settings, plays ringtone, shows notification, vibrates.
   */
  async alertNewOrder(order?: {
    orderNumber?: string;
    items?: any[];
    tableNumber?: string | number;
    channel?: string;
    source?: string;
  }) {
    const settings = await this.getSettings();

    if (!settings.enabled) return;

    // Filter: if remote-only mode, skip POS orders
    if (settings.filterRemoteOnly && order) {
      const ch = order.channel || order.source || 'pos';
      if (ch === 'pos') return;
    }

    // 1. Play ringtone
    this.playLooping(settings.ringtone, settings.volume, settings.duration);

    // 2. System notification
    if (settings.systemNotif) {
      const orderNum = order?.orderNumber || 'New';
      const table = order?.tableNumber ? ` • Table ${order.tableNumber}` : '';
      const itemCount = Array.isArray(order?.items) ? order.items.length : 0;
      const channelTag = order?.channel && order.channel !== 'pos' ? ` [${order.channel.toUpperCase()}]` : '';

      this.showSystemNotification(
        `🔔 New Order #${orderNum}${channelTag}`,
        `${itemCount} item${itemCount !== 1 ? 's' : ''}${table} — Tap to view`
      );
    }

    // 3. Vibration
    if (settings.vibration) {
      this.triggerVibration();
    }
  }

  /**
   * Preview a specific ringtone (used in Settings page).
   * Plays once at given volume.
   */
  preview(ringtoneId: RingtoneId, volume: number = 80) {
    this.stop();
    this.playRingtoneOnce(ringtoneId, volume);
  }

  /**
   * Request notification permission proactively.
   */
  async requestNotificationPermission(): Promise<string> {
    const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.isNativePlatform();
    
    if (isCapacitor) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const req = await LocalNotifications.requestPermissions();
        return req.display;
      } catch (e) {
        console.error('[OrderNotif] Failed to request native permission:', e);
        return 'denied';
      }
    }

    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    return result;
  }
}

/** Singleton instance */
export const orderNotificationService = new OrderNotificationService();
