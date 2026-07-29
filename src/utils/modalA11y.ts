/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Global modal accessibility manager
 * ═══════════════════════════════════════════════════
 *
 * The app builds dialogs three different ways — static markup toggled via
 * `style.display`, imperatively appended overlays, and React conditional
 * renders — across two overlay families: `.modal-overlay` (staff console) and
 * `.aether-drawer-overlay` (customer storefront sheets). Rather than retrofit
 * focus management into every call site (and every future one), this observes
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

/** Both overlay families the app uses to present a dialog. */
const OVERLAY_SELECTOR = '.modal-overlay, .aether-drawer-overlay';

/** The panel inside an overlay that should carry the dialog semantics. */
const SURFACE_SELECTOR = '.modal, .aether-drawer-sheet';

type ActiveModal = {
  overlay: HTMLElement;
  dialog: HTMLElement;
  previouslyFocused: HTMLElement | null;
  /** Identity of the trigger, so focus can be restored even if React has
   *  replaced the original DOM node while the dialog was open. */
  triggerId: string | null;
  triggerLabel: string | null;
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
    document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)
  ).filter(isVisible);
  return overlays.length ? overlays[overlays.length - 1] : null;
}

function focusableWithin(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

/**
 * Resolve the dialog surface inside an overlay. Staff dialogs wrap a `.modal`,
 * customer sheets wrap an `.aether-drawer-sheet`; anything else falls back to
 * the overlay's first element child.
 */
function resolveDialog(overlay: HTMLElement): HTMLElement {
  return (
    overlay.querySelector<HTMLElement>(SURFACE_SELECTOR) ||
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
  ).find((el) =>
    /close|cancel|dismiss/i.test(
      [el.getAttribute('aria-label'), el.id, el.className.toString()].filter(Boolean).join(' ')
    )
  );
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
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;

  active = {
    overlay,
    dialog,
    previouslyFocused,
    triggerId: previouslyFocused?.id || null,
    triggerLabel: previouslyFocused?.getAttribute('aria-label') || null,
  };

  setBackgroundInert(overlay, true);
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Prefer the first meaningful control; fall back to the dialog itself.
  const focusables = focusableWithin(dialog);
  const first = focusables.find((el) => !/close|cancel|dismiss/i.test(el.getAttribute('aria-label') || el.id || ''));
  (first || focusables[0] || dialog).focus({ preventScroll: true });
}

/**
 * Find where focus should land after the dialog closes. Prefer the exact node
 * that opened it; if a re-render replaced that node, match it by id or label so
 * focus still returns to the same control rather than collapsing to <body>.
 */
function restoreTarget(modal: ActiveModal): HTMLElement | null {
  const { previouslyFocused, triggerId, triggerLabel } = modal;

  if (previouslyFocused?.isConnected) return previouslyFocused;

  if (triggerId) {
    const byId = document.getElementById(triggerId);
    if (byId) return byId;
  }

  if (triggerLabel) {
    const escaped = triggerLabel.replace(/"/g, '\\"');
    const byLabel = document.querySelector<HTMLElement>(`[aria-label="${escaped}"]`);
    if (byLabel) return byLabel;
  }

  // Last resort: the main landmark, so focus re-enters the page in a
  // predictable place instead of being dropped on <body>.
  const main = document.querySelector<HTMLElement>('#main-content, main');
  if (main) {
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    return main;
  }

  return null;
}

function deactivate(): void {
  if (!active) return;
  const { overlay, dialog } = active;
  const closing = active;

  dialog.removeAttribute('aria-modal');
  setBackgroundInert(overlay, false);
  document.body.style.overflow = previousBodyOverflow;

  active = null;

  // Restore immediately when the trigger survived the close, so focus is never
  // observably parked on <body>.
  const immediate = restoreTarget(closing);
  immediate?.focus({ preventScroll: true });

  // If the trigger was replaced by a re-render, the DOM may not have settled
  // yet. Retry next frame, but only if focus is still unplaced — never steal it
  // back from somewhere the user or the app has since moved it.
  requestAnimationFrame(() => {
    if (active) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    restoreTarget(closing)?.focus({ preventScroll: true });
  });
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
