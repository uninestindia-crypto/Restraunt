import React from 'react';

export function CategorySlider({ 
  categories, 
  activeCategoryId, 
  onSelectCategory, 
  searchQuery, 
  onSearchQueryChange 
}) {
  return (
    /* Search and categories travel together: once the list is scrolling, the
       two controls that change what is in it have to stay reachable. */
    <div className="store-menu-toolbar">
      {/* Dynamic Search Bar */}
      <div className="store-search-container" style={{ position: 'relative', width: '100%' }}>
        <span 
          className="material-symbols-rounded" 
          style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '20px', color: 'var(--text-secondary)', pointerEvents: 'none' }}
        >search</span>
        <input 
          type="text" 
          id="store-menu-search" 
          className="store-input"
          placeholder="Search for dishes, starters, desserts..."
          /* No inline border-radius: an inline style beats the stylesheet, so the
             storefront could not square this control off with everything else. */
          style={{ paddingLeft: '44px', width: '100%', height: '44px', fontSize: 'var(--text-sm)', fontWeight: 500 }}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
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

      {/* Horizontal Scroll Category Slider */}
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
