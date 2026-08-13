import { getSupabaseClient } from './supabaseClient';
import { db } from '../db/database';

class TelemetryService {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare isProcessing: any;
  declare queuedErrors: any;
  declare storeId: any;

  constructor() {
    this.queuedErrors = [];
    this.isProcessing = false;
    this.storeId = localStorage.getItem('store_id') || 'the-taste';

    // Hook global error handlers immediately in browser context
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => this.handleGlobalError(event));
      window.addEventListener('unhandledrejection', (event) => this.handlePromiseRejection(event));
      
      // Auto-flush queue when system recovers connectivity
      window.addEventListener('online', () => this.flushQueuedTelemetry());
    }
  }

  /**
   * Handle standard window errors
   */
  handleGlobalError(event) {
    const errorData = {
      message: event.message || 'Unknown window error',
      filename: event.filename || '',
      lineno: event.lineno || 0,
      colno: event.colno || 0,
      stack: event.error ? event.error.stack : '',
      type: 'uncaught_exception'
    };

    console.error('[Telemetry] Captured global error:', errorData);
    this.logTelemetry('error', errorData);
  }

  /**
   * Handle unhandled promise rejections
   */
  handlePromiseRejection(event) {
    const errorData = {
      message: event.reason ? (event.reason.message || String(event.reason)) : 'Promise rejected with no reason',
      stack: event.reason && event.reason.stack ? event.reason.stack : '',
      type: 'unhandled_promise_rejection'
    };

    console.error('[Telemetry] Captured promise rejection:', errorData);
    this.logTelemetry('error', errorData);
  }

  /**
   * Main logger method
   * @param {string} severity - 'error' | 'info' | 'warn'
   * @param {Object} data 
   */
  async logTelemetry(severity, data) {
    const logEntry = {
      store_id: this.storeId,
      action: `client_${severity}`,
      target_table: 'telemetry',
      target_id: data.type || 'generic',
      details: {
        ...data,
        severity,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : '',
        timestamp: new Date().toISOString(),
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
      }
    };

    // Attempt online delivery
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const delivered = await this.sendToCloud(logEntry);
      if (delivered) return;
    }

    // Offline fallback: Queue to memory and Dexie database if available
    this.queueOffline(logEntry);
  }

  async sendToCloud(logEntry) {
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) return false;

      const { error } = await supabase
        .from('audit_events')
        .insert([logEntry]);

      if (error) {
        console.warn('[Telemetry] Server insert failed:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[Telemetry] Cloud upload error:', err);
      return false;
    }
  }

  queueOffline(logEntry) {
    console.log('[Telemetry] Queueing error offline:', logEntry);
    this.queuedErrors.push(logEntry);
    
    // Save to local IndexedDB to guarantee persistence
    db.table('activity_log').add({
      id: Math.floor(Math.random() * 1000000000), // unique numeric ID for local activity log
      store_id: logEntry.store_id,
      timestamp: new Date(),
      action: logEntry.action,
      staff_name: 'Telemetry',
      details: JSON.stringify(logEntry.details)
    }).catch(err => {
      console.warn('[Telemetry] Failed to save log to local activity database:', err);
    });
  }

  async flushQueuedTelemetry() {
    if (this.isProcessing || this.queuedErrors.length === 0) return;
    this.isProcessing = true;
    console.log(`[Telemetry] Online status detected. Flushing ${this.queuedErrors.length} queued error logs...`);

    const activeQueue = [...this.queuedErrors];
    this.queuedErrors = [];

    for (const log of activeQueue) {
      const success = await this.sendToCloud(log);
      if (!success) {
        // Re-queue if it failed
        this.queuedErrors.push(log);
      }
    }
    
    this.isProcessing = false;
  }
}

export const telemetry = new TelemetryService();
