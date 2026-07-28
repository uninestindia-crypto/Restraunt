/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Global modal accessibility manager
 * ═══════════════════════════════════════════════════
 *
 * The app builds dialogs three different ways — static markup toggled via
 * `style.display`, imperatively appended overlays, and React conditional
 * renders — but all of them land on `.modal-overlay`. Rather than retrofit
 * focus management into ten call sites (and every future one), this observes
 * the document and applies WCAG 2.1 dialog semantics to whichever overlay is
 * currently on top:
 *
 *   - role="dialog" + aria-modal="true" on the dialog surface
 *   - initial focus moved into the dialog
 *   - Tab / Shift+Tab trapped inside it
 *   - Escape closes via the dialog's own close affordance
 *   - focus restored to the invoking element on close
 *   - background content marked `inert` and body scroll locked
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

type ActiveModal = {
  overlay: HTMLElement;
  dialog: HTMLElement;
  previouslyFocused: HTMLElement | null;
};

let active: ActiveModal | null = null;
let observer: MutationObserver | null = null;
let previousBodyOverflow = '';

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // An overlay animating out may still be connected but fully transparent.
  return style.opacity !== '0';
}

/** The topmost visible overlay — later in DOM order wins, matching paint order. */
function topmostOverlay(): HTMLElement | null {
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>('.modal-overlay')
  ).filter(isVisible);
  return overlays.length ? overlays[overlays.length - 1] : null;
}

function focusableWithin(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

/**
 * Resolve the dialog surface inside an overlay. Most overlays wrap a `.modal`,
 * but a few render their panel directly as the overlay's only child.
 */
function resolveDialog(overlay: HTMLElement): HTMLElement {
  return (
    overlay.querySelector<HTMLElement>('.modal') ||
    (overlay.firstElementChild as HTMLElement | null) ||
    overlay
  );
}

/**
 * Fire the dialog's own close affordance so each view's teardown logic
 * (state resets, callbacks, DOM removal) still runs. Falls back to a backdrop
 * click, which most overlays already bind to close.
 */
function requestClose(modal: ActiveModal): void {
  const { overlay, dialog } = modal;

  const explicit = dialog.querySelector<HTMLElement>('[data-modal-close]');
  if (explicit) {
    explicit.click();
    return;
  }

  const labelled = Array.from(
    dialog.querySelectorAll<HTMLElement>('button, [role="button"]')
  ).find((el) => /close|cancel|dismiss/i.test(el.getAttribute('aria-label') || el.id || ''));
  if (labelled) {
    labelled.click();
    return;
  }

  // Backdrop click: handlers check `e.target === overlay`, so dispatch on the
  // overlay itself rather than calling click() on a child.
  overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function setBackgroundInert(overlay: HTMLElement, inert: boolean): void {
  Array.from(document.body.children).forEach((child) => {
    if (child === overlay || child.contains(overlay)) return;
    if (!(child instanceof HTMLElement)) return;
    if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') return;
    // Toasts must stay announceable while a dialog is open.
    if (child.classList.contains('toast-container')) return;

    if (inert) {
      child.setAttribute('inert', '');
    } else {
      child.removeAttribute('inert');
    }
  });
}

function activate(overlay: HTMLElement): void {
  const dialog = resolveDialog(overlay);

  if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');

  // Label the dialog from its own heading when the view didn't supply one.
  if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
    const heading = dialog.querySelector<HTMLElement>('h1, h2, h3, h4');
    if (heading) {
      if (!heading.id) heading.id = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
      dialog.setAttribute('aria-labelledby', heading.id);
    }
  }

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  active = { overlay, dialog, previouslyFocused };

  setBackgroundInert(overlay, true);
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Prefer the first meaningful control; fall back to the dialog itself.
  const focusables = focusableWithin(dialog);
  const first = focusables.find((el) => !/close|cancel|dismiss/i.test(el.getAttribute('aria-label') || el.id || ''));
  (first || focusables[0] || dialog).focus({ preventScroll: true });
}

function deactivate(): void {
  if (!active) return;
  const { overlay, dialog, previouslyFocused } = active;

  dialog.removeAttribute('aria-modal');
  setBackgroundInert(overlay, false);
  document.body.style.overflow = previousBodyOverflow;

  active = null;

  if (previouslyFocused && previouslyFocused.isConnected) {
    previouslyFocused.focus({ preventScroll: true });
  }
}

function sync(): void {
  const top = topmostOverlay();

  if (!top) {
    if (active) deactivate();
    return;
  }

  if (active && active.overlay === top) return;

  if (active) deactivate();
  activate(top);
}

function onKeyDown(event: KeyboardEvent): void {
  if (!active) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    requestClose(active);
    return;
  }

  if (event.key !== 'Tab') return;

  const focusables = focusableWithin(active.dialog);
  if (focusables.length === 0) {
    event.preventDefault();
    active.dialog.focus({ preventScroll: true });
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const current = document.activeElement;

  if (event.shiftKey && (current === first || !active.dialog.contains(current))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (current === last || !active.dialog.contains(current))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

/**
 * Guard against focus escaping via mouse, iframe, or programmatic means while a
 * dialog is open.
 */
function onFocusIn(event: FocusEvent): void {
  if (!active) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (active.dialog.contains(target) || active.overlay.contains(target)) return;
  active.dialog.focus({ preventScroll: true });
}

export function initModalA11y(): void {
  if (observer || typeof window === 'undefined') return;

  observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  });

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocusIn, true);

  sync();
}

export function teardownModalA11y(): void {
  observer?.disconnect();
  observer = null;
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('focusin', onFocusIn, true);
  deactivate();
}
