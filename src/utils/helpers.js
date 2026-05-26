/**
 * Format an amount as Indian Rupees with 2 decimal places.
 * @param {number} amount
 * @returns {string} e.g. "₹120.00"
 */
export function formatCurrency(amount) {
  return '₹' + Number(amount).toFixed(2);
}

/**
 * Format an amount as Indian Rupees, rounded to nearest integer.
 * @param {number} amount
 * @returns {string} e.g. "₹120"
 */
export function formatCurrencyShort(amount) {
  return '₹' + Math.round(Number(amount));
}

/**
 * Format a date in DD/MM/YYYY Indian locale format.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Format a time in 12-hour Indian locale format.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format a date and time together.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
  return formatDate(date) + ' ' + formatTime(date);
}

/**
 * Debounce a function call.
 * @param {Function} fn - Function to debounce
 * @param {number} ms - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Show a toast notification.
 * @param {string} message - Toast message
 * @param {'success'|'error'|'warning'|'info'} type - Toast type
 * @param {number} duration - Duration in milliseconds
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
  };

  toast.innerHTML = `
    <span class="material-symbols-rounded toast-icon">${icons[type] || 'info'}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Generate a short unique ID.
 * @returns {string}
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Play a short feedback sound using the Web Audio API.
 * @param {number} frequency - Tone frequency in Hz
 * @param {number} duration - Duration in milliseconds
 * @param {OscillatorType} type - Oscillator wave type
 */
export function playSound(frequency = 800, duration = 150, type = 'sine') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch (e) {
    // Audio not supported
  }
}

/**
 * Trigger device vibration (mobile).
 * @param {number[]} pattern - Vibration pattern in milliseconds
 */
export function vibrateDevice(pattern = [50]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
