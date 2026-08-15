import React from 'react';
import { globalStore } from '../../../store/Store';
import { formatCurrency } from '../../../utils/helpers';

export function CartDrawer({ cart, onBack, onCheckout, gstPercent = 0 }) {
  // The review step has to agree with the checkout step and with the order that gets created.
  // Showing the bare line-price sum as "Total" is what made a ₹160.00 cart into a ₹168.00 bill.
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxAmount = Number((subtotal * (gstPercent / 100)).toFixed(2));
  const total = Number((subtotal + taxAmount).toFixed(2));

  const handleNoteChange = (index, value) => {
    const updated = [...cart];
    if (updated[index]) {
      updated[index].notes = value;
      globalStore.updateState({ cart: updated });
    }
  };

  return (
    <div className="store-checkout-shell">
      {/* Top Bar */}
      <header className="store-checkout-nav">
        <button id="btn-back-menu" className="btn-icon" onClick={onBack} type="button" aria-label="Go back">
          <span className="material-symbols-rounded">arrow_back</span>
        </button>
        <h2>Your cart</h2>
      </header>

      <main className="store-cart-page" style={{ padding: '24px' }}>
        <div className="store-checkout-head" style={{ marginBottom: '24px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
            {cart.length} selected item{cart.length === 1 ? '' : 's'}
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>Review your order</h1>
        </div>
        <div className="store-cart-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {cart.length === 0 ? (
            <div className="store-empty-state">
              <span className="material-symbols-rounded" aria-hidden="true">shopping_cart</span>
              <p>Your cart is empty.</p>
            </div>
          ) : (
            cart.map((item, index) => (
              <article key={item.itemId} className="store-cart-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{item.itemName}</h3>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>{formatCurrency(item.price)} each</p>
                </div>
                <div className="store-cart-row-controls" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <strong style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(item.price * item.quantity)}</strong>
                  <div className="stepper store-stepper">
                    <button 
                      className="btn-step" 
                      onClick={() => globalStore.adjustCartQuantity(item.itemId, -1)} 
                      type="button" 
                      aria-label={`Remove one ${item.itemName}`}
                    >-</button>
                    <div className="stepper-count">{item.quantity}</div>
                    <button 
                      className="btn-step" 
                      onClick={() => globalStore.adjustCartQuantity(item.itemId, 1)} 
                      type="button" 
                      aria-label={`Add one ${item.itemName}`}
                    >+</button>
                  </div>
                </div>
                <input 
                  className="input note-input store-note-input" 
                  value={item.notes || ''} 
                  placeholder="Special instructions (e.g. less spicy, packaging, no onions)"
                  onChange={(e) => handleNoteChange(index, e.target.value)}
                  style={{ width: '100%', marginTop: '8px' }}
                />
              </article>
            ))
          )}
        </div>
      </main>

      {cart.length > 0 && (
        <footer className="store-checkout-footer">
          <div>
            <div className="store-checkout-breakdown">
              <div className="store-checkout-line">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {taxAmount > 0 && (
                <div className="store-checkout-line">
                  <span>GST ({gstPercent}%)</span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
              )}
            </div>
            <span>Total</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
          <button 
            className="btn btn-primary btn-block btn-lg" 
            id="btn-checkout" 
            onClick={onCheckout}
            type="button"
          >Proceed to Checkout</button>
        </footer>
      )}
    </div>
  );
}
