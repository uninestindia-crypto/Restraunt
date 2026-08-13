import React, { useState, useEffect } from 'react';
import { formatCurrency, playSound, vibrateDevice, menuItemImageSource } from '../../../utils/helpers';

const CATEGORY_IMAGE_MAP = {
  momos: '/assets/dish-momos.jpg',
  starters: '/assets/dish-starters.jpg',
  noodles: '/assets/dish-noodles.jpg',
  rice: '/assets/dish-rice.jpg',
  'main course': '/assets/dish-main.jpg',
  burgers: '/assets/dish-burgers.jpg',
  sides: '/assets/dish-sides.jpg',
  beverages: '/assets/dish-beverages.jpg',
  desserts: '/assets/dish-desserts.jpg'
};

const CATEGORY_COPY = {
  momos: 'Hand-folded, steamed or tossed hot.',
  starters: 'Crisp, saucy plates made for sharing.',
  noodles: 'Wok-tossed and packed for travel.',
  rice: 'Comfort bowls with bold Indo-Chinese flavor.',
  'main course': 'Gravy, soups, and full-meal favorites.',
  burgers: 'Fast, filling, and freshly assembled.',
  sides: 'Fries, breads, and quick add-ons.',
  beverages: 'Cold sips, shakes, and chai.',
  desserts: 'Sweet finishes for the table.'
};

export function ItemDetailDrawer({ item, categories, addons = [], onClose, onAddToCart }) {
  const [qty, setQty] = useState(1);
  const [spicyLevel, setSpicyLevel] = useState('Mild');
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [customNotes, setCustomNotes] = useState('');

  // Only this dish's add-ons, in the order the owner arranged them.
  const itemAddons = addons
    .filter(addon => addon.menuItemId === item?.id && (addon.isActive === 1 || addon.isActive === true))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // A dish whose add-ons changed since the sheet opened must not keep a stale
  // selection: it would be priced here and then refused by the server.
  useEffect(() => {
    setSelectedAddonIds(current => current.filter(id => itemAddons.some(addon => addon.id === id)));
  }, [item?.id, itemAddons.length]);

  if (!item) return null;

  const getItemImage = () => {
    const source = menuItemImageSource(item);
    if (source) return source;
    const cat = categories.find(c => c.id === item.categoryId);
    const catName = cat?.name?.toLowerCase() || '';
    return CATEGORY_IMAGE_MAP[catName] || '/assets/dish-starters.jpg';
  };

  const getItemDescription = () => {
    if (item.description) return item.description;
    const cat = categories.find(c => c.id === item.categoryId);
    const catName = cat?.name?.toLowerCase() || '';
    return CATEGORY_COPY[catName] || 'Freshly prepared by The Taste kitchen.';
  };

  const handleAddonChange = (addonId, checked) => {
    playSound(620, 60);
    setSelectedAddonIds(current => (
      checked ? [...current, addonId] : current.filter(id => id !== addonId)
    ));
  };

  const selectedAddons = itemAddons.filter(addon => selectedAddonIds.includes(addon.id));
  const addonsPrice = selectedAddons.reduce((sum, addon) => sum + (Number(addon.price) || 0), 0);
  const singleItemPrice = item.price + addonsPrice;
  const totalPrice = singleItemPrice * qty;

  const handleAdd = () => {
    onAddToCart({
      item,
      qty,
      spicyLevel,
      addons: selectedAddons.map(addon => ({ id: addon.id, name: addon.name, price: Number(addon.price) || 0 })),
      addonIds: selectedAddons.map(addon => addon.id),
      customNotes,
      price: singleItemPrice
    });
  };

  const isVeg = item.isVeg ? 'veg' : 'nonveg';

  return (
    <div className="aether-drawer-overlay is-open" onClick={(e) => (e.target as HTMLElement).classList.contains('aether-drawer-overlay') && onClose()}>
      <div className="aether-drawer-sheet">
        <div className="aether-drawer-handle"></div>
        <button 
          className="aether-drawer-close-btn" 
          type="button" 
          aria-label="Close"
          onClick={onClose}
        >
          <span className="material-symbols-rounded">close</span>
        </button>

        <div className="aether-drawer-scroll-content">
          <div className="aether-drawer-hero-wrapper">
            <img className="aether-drawer-hero-img" src={getItemImage()} alt={item.name} />
            <span className={`store-food-mark ${isVeg}`} style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 2, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}></span>
          </div>

          <div className="aether-drawer-body">
            <div className="aether-drawer-header">
              <h2>{item.name}</h2>
              <span className="aether-drawer-price">{formatCurrency(item.price)}</span>
            </div>
            <p className="aether-drawer-desc">{getItemDescription()}</p>

            <div className="aether-drawer-section">
              <h3>Spicy Level</h3>
              <div className="aether-spicy-grid">
                <label className="aether-spicy-option">
                  <input 
                    type="radio" 
                    name="spicy-level" 
                    value="Mild" 
                    checked={spicyLevel === 'Mild'} 
                    onChange={() => setSpicyLevel('Mild')} 
                  />
                  <span className="aether-spicy-card">
                    <span className="material-symbols-rounded" style={{ color: '#10B981' }}>nature</span>
                    <strong>Mild</strong>
                    <small>Default prep</small>
                  </span>
                </label>
                <label className="aether-spicy-option">
                  <input 
                    type="radio" 
                    name="spicy-level" 
                    value="Hot" 
                    checked={spicyLevel === 'Hot'} 
                    onChange={() => setSpicyLevel('Hot')} 
                  />
                  <span className="aether-spicy-card">
                    <span className="material-symbols-rounded" style={{ color: '#F59E0B' }}>local_fire_department</span>
                    <strong>Hot</strong>
                    <small>Chef spicy</small>
                  </span>
                </label>
                <label className="aether-spicy-option">
                  <input 
                    type="radio" 
                    name="spicy-level" 
                    value="Volcanic" 
                    checked={spicyLevel === 'Volcanic'} 
                    onChange={() => setSpicyLevel('Volcanic')} 
                  />
                  <span className="aether-spicy-card">
                    <span className="material-symbols-rounded" style={{ color: '#EF4444' }}>volcano</span>
                    <strong>Volcanic</strong>
                    <small>Extra high heat</small>
                  </span>
                </label>
              </div>
            </div>

            {itemAddons.length > 0 && (
              <div className="aether-drawer-section">
                <h3>Add-ons (Optional)</h3>
                <div className="aether-modifiers-list">
                  {itemAddons.map(addon => (
                    <label className="aether-modifier-item" key={addon.id}>
                      <input
                        type="checkbox"
                        name="addon"
                        value={addon.id}
                        checked={selectedAddonIds.includes(addon.id)}
                        onChange={(e) => handleAddonChange(addon.id, e.target.checked)}
                      />
                      <span className="aether-checkbox-visual"></span>
                      <div className="aether-modifier-label">
                        <strong>{addon.name}</strong>
                        {Number(addon.price) > 0 && <small>+{formatCurrency(Number(addon.price))}</small>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="aether-drawer-section">
              <h3>Special Kitchen Notes</h3>
              <textarea 
                className="aether-textarea" 
                rows={2} 
                placeholder="E.g. Make it extra crispy, packing sauce separately..."
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
              ></textarea>
            </div>
          </div>
        </div>

        <div className="aether-drawer-action-bar">
          <div className="aether-drawer-quantity-stepper">
            <button 
              className="aether-qty-btn minus" 
              type="button"
              onClick={() => {
                if (qty > 1) {
                  playSound(600, 60);
                  setQty(qty - 1);
                }
              }}
            >-</button>
            <span className="aether-qty-count">{qty}</span>
            <button 
              className="aether-qty-btn plus" 
              type="button"
              onClick={() => {
                playSound(650, 70);
                setQty(qty + 1);
              }}
            >+</button>
          </div>
          <button 
            className="btn btn-primary" 
            id="drawer-add-to-cart-btn" 
            type="button" 
            style={{ flex: 1, height: '48px', fontWeight: 800, borderRadius: 'var(--radius-md)' }}
            onClick={handleAdd}
          >
            Add to Cart — {formatCurrency(totalPrice)}
          </button>
        </div>
      </div>
    </div>
  );
}
