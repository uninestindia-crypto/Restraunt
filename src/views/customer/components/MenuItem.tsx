// @ts-nocheck
import { h } from 'preact';
import { globalStore } from '../../../store/Store';
import { formatCurrency, escapeHtml } from '../../../utils/helpers';

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

export function MenuItem({ item, categories, cart, onOpenDetails }) {
  const cartItem = cart.find(ci => ci.itemId === item.id);
  const qty = cartItem?.quantity || 0;

  const getItemImage = () => {
    if (item.imageUrl) return item.imageUrl;
    const cat = categories.find(c => c.id === item.categoryId);
    const catName = cat?.name?.toLowerCase() || '';
    return CATEGORY_IMAGE_MAP[catName] || '/assets/dish-momos.jpg';
  };

  const getItemDescription = () => {
    if (item.description) return item.description;
    const cat = categories.find(c => c.id === item.categoryId);
    const catName = cat?.name?.toLowerCase() || '';
    return CATEGORY_COPY[catName] || 'Freshly prepared daily with selected spices.';
  };

  const handleCardClick = (e) => {
    if (e.target.closest('.stepper') || e.target.closest('.btn-step') || e.target.closest('.store-add-btn')) {
      return;
    }
    if (onOpenDetails) {
      onOpenDetails(item);
    }
  };

  return (
    <article 
      className={`store-menu-item ${qty ? 'is-selected' : ''}`} 
      onClick={handleCardClick}
      style={{ cursor: onOpenDetails ? 'pointer' : 'default' }}
    >
      <img 
        className="store-menu-item-image" 
        src={getItemImage()} 
        alt={item.name} 
        width="640" 
        height="420" 
        loading="lazy" 
        decoding="async" 
      />
      <div className="store-menu-item-body">
        <div className="store-menu-item-title">
          <div>
            <h3>{item.name}</h3>
            <p>{getItemDescription()}</p>
          </div>
          <span className={item.isVeg ? 'store-food-mark veg' : 'store-food-mark nonveg'} aria-hidden="true"></span>
          <span className="sr-only">{item.isVeg ? 'Vegetarian' : 'Non vegetarian'}</span>
        </div>
        <div className="store-menu-item-footer">
          <strong>{formatCurrency(item.price)}</strong>
          {qty ? (
            <div className="stepper store-stepper" aria-label={`Quantity for ${item.name}`}>
              <button 
                className="btn-step" 
                onClick={() => globalStore.adjustCartQuantity(item.id, -1)} 
                type="button" 
                aria-label={`Remove one ${item.name}`}
              >-</button>
              <div className="stepper-count">{qty}</div>
              <button 
                className="btn-step" 
                onClick={() => globalStore.adjustCartQuantity(item.id, 1)} 
                type="button" 
                aria-label={`Add another ${item.name}`}
              >+</button>
            </div>
          ) : (
            <button 
              className="btn btn-primary btn-add store-add-btn" 
              onClick={() => globalStore.addToCart(item, 1)} 
              type="button"
            >
              <span className="material-symbols-rounded" aria-hidden="true">add</span>
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
