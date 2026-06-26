// @ts-nocheck
import React, { useState } from 'react';
import { formatCurrency, playSound, vibrateDevice } from '../../../utils/helpers';

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

export function ItemDetailDrawer({ item, categories, onClose, onAddToCart }) {
  const [qty, setQty] = useState(1);
  const [spicyLevel, setSpicyLevel] = useState('Mild');
  const [modifiers, setModifiers] = useState([]);
  const [customNotes, setCustomNotes] = useState('');

  if (!item) return null;

  const getItemImage = () => {
    if (item.imageUrl) return item.imageUrl;
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

  const handleModifierChange = (modName, checked) => {
    playSound(620, 60);
    if (checked) {
      setModifiers([...modifiers, modName]);
    } else {
      setModifiers(modifiers.filter(m => m !== modName));
    }
  };

  const extraCheeseCost = modifiers.includes('Extra Cheese') ? 30 : 0;
  const singleItemPrice = item.price + extraCheeseCost;
  const totalPrice = singleItemPrice * qty;

  const handleAdd = () => {
    onAddToCart({
      item,
      qty,
      spicyLevel,
      modifiers,
      customNotes,
      price: singleItemPrice
    });
  };

  const isVeg = item.isVeg ? 'veg' : 'nonveg';

  return (
    <div className="aether-drawer-overlay is-open" onClick={(e) => e.target.classList.contains('aether-drawer-overlay') && onClose()}>
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
            <p class="aether-drawer-desc">{getItemDescription()}</p>

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

            <div className="aether-drawer-section">
              <h3>Culinary Modifiers</h3>
              <div className="aether-modifiers-list">
                <label className="aether-modifier-item">
                  <input 
                    type="checkbox" 
                    name="modifier" 
                    value="Extra Cheese" 
                    checked={modifiers.includes('Extra Cheese')}
                    onChange={(e) => handleModifierChange('Extra Cheese', e.target.checked)}
                  />
                  <span className="aether-checkbox-visual"></span>
                  <div className="aether-modifier-label">
                    <strong>Extra Melted Cheese</strong>
                    <small>Rich visual pull (+{formatCurrency(30)})</small>
                  </div>
                </label>
                <label className="aether-modifier-item">
                  <input 
                    type="checkbox" 
                    name="modifier" 
                    value="Gluten Free" 
                    checked={modifiers.includes('Gluten Free')}
                    onChange={(e) => handleModifierChange('Gluten Free', e.target.checked)}
                  />
                  <span className="aether-checkbox-visual"></span>
                  <div className="aether-modifier-label">
                    <strong>Gluten Free Preparation</strong>
                    <small>Organic substitute ingredients</small>
                  </div>
                </label>
                <label className="aether-modifier-item">
                  <input 
                    type="checkbox" 
                    name="modifier" 
                    value="No Onions" 
                    checked={modifiers.includes('No Onions')}
                    onChange={(e) => handleModifierChange('No Onions', e.target.checked)}
                  />
                  <span className="aether-checkbox-visual"></span>
                  <div className="aether-modifier-label">
                    <strong>No Onions or Garlic</strong>
                    <small>Classic customization</small>
                  </div>
                </label>
              </div>
            </div>

            <div className="aether-drawer-section">
              <h3>Special Kitchen Notes</h3>
              <textarea 
                className="aether-textarea" 
                rows="2" 
                placeholder="E.g. Make it extra crispy, packing sauce separately..."
                value={customNotes}
                onInput={(e) => setCustomNotes(e.target.value)}
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
