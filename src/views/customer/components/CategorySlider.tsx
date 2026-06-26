// @ts-nocheck
import { h } from 'preact';

export function CategorySlider({ 
  categories, 
  activeCategoryId, 
  onSelectCategory, 
  searchQuery, 
  onSearchQueryChange 
}) {
  return (
    <div>
      {/* Dynamic Search Bar */}
      <div className="store-search-container" style={{ marginBottom: '20px', position: 'relative', width: '100%' }}>
        <span 
          className="material-symbols-rounded" 
          style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '20px', color: 'var(--text-secondary)', pointerEvents: 'none' }}
        >search</span>
        <input 
          type="text" 
          id="store-menu-search" 
          className="input" 
          placeholder="Search for dishes, starters, desserts..." 
          style={{ paddingLeft: '44px', width: '100%', borderRadius: 'var(--radius-lg)', height: '44px', fontSize: 'var(--text-sm)', fontWeight: 500 }} 
          value={searchQuery}
          onInput={(e) => onSearchQueryChange(e.target.value)}
        />
        {searchQuery ? (
          <button 
            id="store-search-clear" 
            className="btn-icon" 
            onClick={() => onSearchQueryChange('')}
            style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
            type="button" 
            title="Clear Search"
          >
            <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>close</span>
          </button>
        ) : null}
      </div>

      {/* Horizontal Sticky Scroll Category Slider */}
      <div className="store-category-strip scrollbar-none" aria-label="Menu categories">
        {categories.map(cat => {
          const active = cat.id === activeCategoryId && !searchQuery;
          return (
            <button 
              key={cat.id}
              className={`store-category-tab ${active ? 'is-active' : ''}`} 
              onClick={() => {
                onSelectCategory(cat.id);
                // Selecting a category clears the active search query
                onSearchQueryChange('');
              }} 
              aria-pressed={active}
              type="button"
            >
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
