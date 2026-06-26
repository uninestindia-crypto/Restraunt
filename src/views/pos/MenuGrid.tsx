// @ts-nocheck
/**
 * MenuGrid — Category tabs + searchable item grid
 */

import { getCategories, getAllItems, getItemsByCategory, searchItems } from '../../db/database';
import { formatCurrencyShort, debounce } from '../../utils/helpers';

export class MenuGrid {
  constructor({ container, onAddItem }) {
    this.container = container;
    this.onAddItem = onAddItem;

    this.categories = [];
    this.items = [];
    this.filteredItems = [];
    this.selectedCategory = null;
    this.searchQuery = '';
    this.addedIndicators = new Map(); // itemId -> timeout
  }

  async init() {
    // Load data
    this.categories = await getCategories();
    this.items = await getAllItems();

    if (this.categories.length > 0) {
      this.selectedCategory = this.categories[0].id;
      this.filterItems();
    } else {
      this.filteredItems = this.items;
    }

    this.render();
    this.bindEvents();
  }

  filterItems() {
    if (this.searchQuery.trim()) {
      // Search mode — search across all categories
      const query = this.searchQuery.toLowerCase();
      this.filteredItems = this.items.filter(item =>
        item.name.toLowerCase().includes(query)
      );
    } else if (this.selectedCategory) {
      // Category filter mode
      this.filteredItems = this.items.filter(
        item => item.categoryId === this.selectedCategory
      );
    } else {
      this.filteredItems = this.items;
    }
  }

  render() {
    this.container.innerHTML = `
      <!-- Search Bar -->
      <div class="search-container">
        <div class="search-wrapper">
          <span class="material-symbols-rounded search-icon">search</span>
          <input 
            type="text" 
            class="input" 
            id="menu-search" 
            placeholder="Search menu items..." 
            value="${this.searchQuery}"
            autocomplete="off"
          >
        </div>
      </div>

      <!-- Category Tabs -->
      <div class="category-tabs scrollbar-none" id="category-tabs">
        ${this.renderCategoryTabs()}
      </div>

      <!-- Menu Item Grid -->
      <div class="menu-grid-container scrollbar-none" id="menu-grid-container">
        ${this.renderGrid()}
      </div>
    `;
  }

  renderCategoryTabs() {
    if (this.categories.length === 0) return '';

    return this.categories.map(cat => `
      <button 
        class="tab ${cat.id === this.selectedCategory && !this.searchQuery ? 'active' : ''}" 
        data-category-id="${cat.id}"
      >
        <span style="margin-right: 4px;">${cat.icon || ''}</span>${cat.name}
      </button>
    `).join('');
  }

  renderGrid() {
    if (this.filteredItems.length === 0) {
      return `
        <div class="empty-state" style="padding-top: 60px;">
          <span class="material-symbols-rounded">restaurant_menu</span>
          <p>${this.searchQuery ? 'No items match your search' : 'No items in this category'}</p>
        </div>
      `;
    }

    return `
      <div class="menu-grid">
        ${this.filteredItems.map(item => this.renderMenuItem(item)).join('')}
      </div>
    `;
  }

  renderMenuItem(item) {
    const vegBadge = item.isVeg
      ? '<span class="badge-veg" title="Vegetarian"></span>'
      : '<span class="badge-nonveg" title="Non-Vegetarian"></span>';

    const imageContent = item.imageUrl
      ? `<img src="${item.imageUrl}" alt="${item.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="fallback-emoji" style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">${item.icon || this.getCategoryIcon(item.categoryId)}</span>`
      : `${item.icon || this.getCategoryIcon(item.categoryId)}`;

    return `
      <div class="menu-item ${!item.isAvailable ? 'sold-out' : ''}" 
           data-item-id="${item.id}" 
           role="button" 
           tabindex="0">
        <div class="menu-item-image">${imageContent}</div>
        <div class="menu-item-info">
          <div class="menu-item-name">${item.name}</div>
          <div class="menu-item-bottom">
            <span class="menu-item-price">${formatCurrencyShort(item.price)}</span>
            ${vegBadge}
          </div>
        </div>
        <div class="item-added-indicator" id="added-${item.id}">
          <span class="material-symbols-rounded">check_circle</span>
        </div>
      </div>
    `;
  }

  getCategoryIcon(categoryId) {
    const cat = this.categories.find(c => c.id === categoryId);
    return cat ? cat.icon : '🍽️';
  }

  bindEvents() {
    // Search input
    const searchInput = document.getElementById('menu-search');
    if (searchInput) {
      const debouncedSearch = debounce((query) => {
        this.searchQuery = query;
        this.filterItems();
        this.updateGrid();
        this.updateCategoryTabs();
      }, 200);

      searchInput.addEventListener('input', (e) => {
        debouncedSearch(e.target.value);
      });

      // Clear search on Escape
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          this.searchQuery = '';
          this.filterItems();
          this.updateGrid();
          this.updateCategoryTabs();
        }
      });
    }

    // Category tabs — use event delegation
    const tabsContainer = document.getElementById('category-tabs');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;

        const categoryId = parseInt(tab.dataset.categoryId, 10);
        this.selectedCategory = categoryId;
        this.searchQuery = '';

        // Clear search input
        const searchInput = document.getElementById('menu-search');
        if (searchInput) searchInput.value = '';

        this.filterItems();
        this.updateGrid();
        this.updateCategoryTabs();

        // Scroll tab into view
        tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    }

    // Menu items — use event delegation on grid container
    const gridContainer = document.getElementById('menu-grid-container');
    if (gridContainer) {
      gridContainer.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.menu-item');
        if (!itemEl || itemEl.classList.contains('sold-out')) return;

        const itemId = parseInt(itemEl.dataset.itemId, 10);
        const item = this.items.find(i => i.id === itemId);
        if (item && this.onAddItem) {
          this.onAddItem(item);
        }
      });

      // Keyboard support
      gridContainer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const itemEl = e.target.closest('.menu-item');
          if (itemEl && !itemEl.classList.contains('sold-out')) {
            e.preventDefault();
            itemEl.click();
          }
        }
      });
    }
  }

  updateGrid() {
    const gridContainer = document.getElementById('menu-grid-container');
    if (gridContainer) {
      gridContainer.innerHTML = this.renderGrid();
    }
  }

  updateCategoryTabs() {
    const tabsContainer = document.getElementById('category-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = this.renderCategoryTabs();
    }
  }

  showAddedIndicator(itemId) {
    const indicator = document.getElementById(`added-${itemId}`);
    if (!indicator) return;

    // Clear any existing timeout
    if (this.addedIndicators.has(itemId)) {
      clearTimeout(this.addedIndicators.get(itemId));
    }

    indicator.classList.add('show');

    const timeout = setTimeout(() => {
      indicator.classList.remove('show');
      this.addedIndicators.delete(itemId);
    }, 600);

    this.addedIndicators.set(itemId, timeout);
  }

  destroy() {
    // Clear all indicator timeouts
    for (const timeout of this.addedIndicators.values()) {
      clearTimeout(timeout);
    }
    this.addedIndicators.clear();
  }
}
