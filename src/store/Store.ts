// @ts-nocheck
/**
 * Global reactive state store utilizing a publish-subscribe pattern.
 * Enables decoupling views from state mutations and synchronizes state updates.
 */

class Store {
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

  // Cart helper mutators
  addToCart(item, quantity = 1, notes = '') {
    const cart = [...this.state.cart];
    const existing = cart.find(ci => ci.itemId === item.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        quantity,
        notes
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
