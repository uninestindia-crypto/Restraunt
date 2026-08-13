/**
 * Global reactive state store utilizing a publish-subscribe pattern.
 * Enables decoupling views from state mutations and synchronizes state updates.
 */

class Store {
  // Fields these methods assign. Type-only: `declare` emits nothing, so the
  // runtime shape of the class is unchanged.
  declare listeners: any;
  declare state: any;

  constructor() {
    this.state = {
      cart: [],
      loggedInCustomer: null,
      orderType: 'delivery',
      selectedPaymentMethod: 'upi',
      syncQueueLength: 0,
      activeTerminalStaff: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      settings: {}
    };
    this.listeners = new Set();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.updateState({ isOnline: true }));
      window.addEventListener('offline', () => this.updateState({ isOnline: false }));
    }
  }

  /**
   * Retrieve current state snapshot
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Update state fields and notify listeners
   * @param {Object} partialState 
   */
  updateState(partialState) {
    this.state = { ...this.state, ...partialState };
    this.notify();
  }

  /**
   * Subscribe to state updates
   * @param {Function} listener 
   * @returns {Function} unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    const currentState = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[Store] Listener notification error:', err);
      }
    });
  }

  /**
   * Identity of a cart line.
   *
   * Two portions of the same dish are only the same line when they were
   * ordered the same way: the add-ons and the spice level change what the
   * kitchen makes and what the customer pays, so they cannot be merged.
   */
  cartLineKey({ itemId, addonIds = [], spiceLevel = '', notes = '' }) {
    return [itemId, [...addonIds].sort((a, b) => a - b).join('+'), spiceLevel, notes].join('|');
  }

  // Cart helper mutators
  addToCart(item, quantity = 1, notes = '', options: Record<string, any> = {}) {
    const cart = [...this.state.cart];
    const addonIds = Array.isArray(options.addonIds) ? options.addonIds : [];
    const addons = Array.isArray(options.addons) ? options.addons : [];
    const spiceLevel = options.spiceLevel || '';
    const key = this.cartLineKey({ itemId: item.id, addonIds, spiceLevel, notes });

    const existing = cart.find(ci => this.cartLineKey({
      itemId: ci.itemId,
      addonIds: ci.addonIds || [],
      spiceLevel: ci.spiceLevel || '',
      notes: ci.notes || ''
    }) === key);

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        itemId: item.id,
        itemName: item.name,
        // Unit price including the chosen add-ons. The server re-prices a
        // public order from its own tables regardless; this is what the
        // customer is shown and what a staff-taken order bills.
        price: item.price,
        quantity,
        notes,
        addonIds,
        addons,
        spiceLevel
      });
    }
    this.updateState({ cart });
  }

  removeFromCart(itemId) {
    const cart = this.state.cart.filter(ci => ci.itemId !== itemId);
    this.updateState({ cart });
  }

  adjustCartQuantity(itemId, amount) {
    let cart = [...this.state.cart];
    const item = cart.find(ci => ci.itemId === itemId);
    if (item) {
      item.quantity += amount;
      if (item.quantity <= 0) {
        cart = cart.filter(ci => ci.itemId !== itemId);
      }
    }
    this.updateState({ cart });
  }

  clearCart() {
    this.updateState({ cart: [] });
  }
}

export const globalStore = new Store();
