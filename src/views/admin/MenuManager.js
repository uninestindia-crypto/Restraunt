/**
 * MenuManager — Admin view for managing categories and items
 */

import { db } from '../../db/database.js';
import { escapeHtml, formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers.js';

export class MenuManager {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.categories = [];
    this.items = [];
    this.activeTab = 'items'; // 'items' | 'categories'
    
    // Add/Edit Modals state
    this.editingItem = null;
    this.editingCategory = null;
  }

  async mount(container) {
    this.container = container;
    await this.loadData();
    this.render();
    this.bindEvents();
  }

  async loadData() {
    try {
      this.categories = await db.menuCategories.orderBy('sortOrder').toArray();
      this.items = await db.menuItems.orderBy('sortOrder').toArray();
    } catch (err) {
      console.error('Failed to load menu CRUD data:', err);
    }
  }

  render() {
    const tabsHtml = `
      <div style="display: flex; gap: 8px; margin-bottom: 24px; padding: 0 24px;">
        <button class="tab sub-tab ${this.activeTab === 'items' ? 'active' : ''}" data-sub-tab="items" style="
          border-radius: var(--radius-md); 
          padding: 8px 20px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 700;
          font-size: var(--text-xs);
          transition: all var(--transition-normal);
        ">
          Menu Items
        </button>
        <button class="tab sub-tab ${this.activeTab === 'categories' ? 'active' : ''}" data-sub-tab="categories" style="
          border-radius: var(--radius-md); 
          padding: 8px 20px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 700;
          font-size: var(--text-xs);
          transition: all var(--transition-normal);
        ">
          Categories
        </button>
      </div>
    `;

    let contentHtml = '';
    if (this.activeTab === 'items') {
      contentHtml = this.renderItemsView();
    } else {
      contentHtml = this.renderCategoriesView();
    }

    this.container.innerHTML = `
      <div style="padding: 24px 0; max-width: 1000px; margin: 0 auto; width: 100%;">
        ${tabsHtml}
        <div id="crud-content">
          ${contentHtml}
        </div>
      </div>
    `;
  }

  renderItemsView() {
    const itemsRows = this.items.map(item => {
      const cat = this.categories.find(c => c.id === item.categoryId);
      const catName = cat ? cat.name : 'Unknown';
      const vegDot = item.isVeg === 1 ? '🟢 Veg' : '🔺 Non-Veg';
      const availableLabel = item.isAvailable === 1 ? 'Available' : 'Sold Out';
      const availableClass = item.isAvailable === 1 ? 'badge-success' : 'badge-danger';
      const vegClass = item.isVeg === 1 ? 'badge-primary' : 'badge-danger';

      return `
        <tr style="border-bottom: 1px solid var(--border-glass); font-size: var(--text-sm); transition: background var(--transition-fast);">
          <td style="padding: 16px 20px; font-weight: 600; color: var(--text-primary);">${escapeHtml(item.name)}</td>
          <td style="padding: 16px 20px; color: var(--text-secondary); font-weight: 500;">${escapeHtml(catName)}</td>
          <td style="padding: 16px 20px; font-weight: 700; color: var(--color-primary);">${formatCurrency(item.price)}</td>
          <td style="padding: 16px 20px;">
            <span class="badge ${vegClass}" style="
              font-family: 'Plus Jakarta Sans', sans-serif; 
              font-weight: 700;
              letter-spacing: 0.02em;
            ">${vegDot}</span>
          </td>
          <td style="padding: 16px 20px;">
            <span class="badge ${availableClass}" style="
              font-family: 'Plus Jakarta Sans', sans-serif; 
              font-weight: 700;
              letter-spacing: 0.02em;
            ">${availableLabel}</span>
          </td>
          <td style="padding: 16px 20px; text-align: right;">
            <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary btn-sm edit-item-btn" data-id="${item.id}" style="
                min-height: 32px; 
                padding: 6px 12px;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                border: 1px solid var(--border-glass);
                background: rgba(255,255,255,0.02);
              ">
                Edit
              </button>
              <button class="btn btn-sm delete-item-btn" data-id="${item.id}" style="
                min-height: 32px; 
                padding: 6px 12px;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                background: rgba(239, 68, 68, 0.05); 
                color: #FF4D4D; 
                border: 1px solid rgba(239, 68, 68, 0.2);
              ">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div style="padding: 0 24px; display: flex; flex-direction: column; gap: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">Menu Items (${this.items.length})</h3>
          <button class="btn btn-primary btn-sm" id="btn-add-item" style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            box-shadow: var(--shadow-primary);
            padding: 8px 16px;
          ">
            Add New Item +
          </button>
        </div>

        <div style="
          overflow-x: auto; 
          border: 1px solid var(--border-glass); 
          border-radius: var(--radius-xl); 
          background: rgba(17,17,30,0.3);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        " class="scrollbar-none">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-glass); background: rgba(255, 255, 255, 0.01); font-size: var(--text-xs); text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">
                <th style="padding: 16px 20px; font-weight: 700;">Name</th>
                <th style="padding: 16px 20px; font-weight: 700;">Category</th>
                <th style="padding: 16px 20px; font-weight: 700;">Price</th>
                <th style="padding: 16px 20px; font-weight: 700;">Type</th>
                <th style="padding: 16px 20px; font-weight: 700;">Status</th>
                <th style="padding: 16px 20px; font-weight: 700; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows.length > 0 ? itemsRows : `
                <tr>
                  <td colspan="6" style="padding: 48px; text-align: center; color: var(--text-muted); font-weight: 500;">
                    No menu items found. Click 'Add New Item' to start!
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderCategoriesView() {
    const catsRows = this.categories.map(cat => {
      const activeLabel = cat.isActive === 1 ? 'Active' : 'Disabled';
      const activeClass = cat.isActive === 1 ? 'badge-success' : 'badge-danger';

      return `
        <tr style="border-bottom: 1px solid var(--border-glass); font-size: var(--text-sm); transition: background var(--transition-fast);">
          <td style="padding: 16px 20px; font-weight: 600; color: var(--text-primary);">${escapeHtml(cat.name)}</td>
          <td style="padding: 16px 20px; color: var(--text-secondary); font-weight: 500;">${cat.sortOrder}</td>
          <td style="padding: 16px 20px;">
            <span class="badge ${activeClass}" style="
              font-family: 'Plus Jakarta Sans', sans-serif; 
              font-weight: 700;
              letter-spacing: 0.02em;
            ">${activeLabel}</span>
          </td>
          <td style="padding: 16px 20px; text-align: right;">
            <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary btn-sm edit-cat-btn" data-id="${cat.id}" style="
                min-height: 32px; 
                padding: 6px 12px;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                border: 1px solid var(--border-glass);
                background: rgba(255,255,255,0.02);
              ">
                Edit
              </button>
              <button class="btn btn-sm delete-cat-btn" data-id="${cat.id}" style="
                min-height: 32px; 
                padding: 6px 12px;
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-weight: 700;
                font-size: var(--text-xs);
                background: rgba(239, 68, 68, 0.05); 
                color: #FF4D4D; 
                border: 1px solid rgba(239, 68, 68, 0.2);
              ">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div style="padding: 0 24px; display: flex; flex-direction: column; gap: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">Manage Categories (${this.categories.length})</h3>
          <button class="btn btn-primary btn-sm" id="btn-add-cat" style="
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            box-shadow: var(--shadow-primary);
            padding: 8px 16px;
          ">
            Add Category +
          </button>
        </div>

        <div style="
          overflow-x: auto; 
          border: 1px solid var(--border-glass); 
          border-radius: var(--radius-xl); 
          background: rgba(17,17,30,0.3);
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        " class="scrollbar-none">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-glass); background: rgba(255, 255, 255, 0.01); font-size: var(--text-xs); text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">
                <th style="padding: 16px 20px; font-weight: 700;">Name</th>
                <th style="padding: 16px 20px; font-weight: 700;">Sort Order</th>
                <th style="padding: 16px 20px; font-weight: 700;">Status</th>
                <th style="padding: 16px 20px; font-weight: 700; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${catsRows.length > 0 ? catsRows : `
                <tr>
                  <td colspan="4" style="padding: 48px; text-align: center; color: var(--text-muted); font-weight: 500;">
                    No categories found. Click 'Add Category' to start!
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Navigation tabs
    this.container.querySelectorAll('.sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound(700, 80);
        this.activeTab = btn.dataset.subTab;
        this.render();
        this.bindEvents();
      });
    });

    if (this.activeTab === 'items') {
      // Add Item
      const addBtn = document.getElementById('btn-add-item');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          playSound(800, 100);
          this.editingItem = { name: '', categoryId: this.categories[0]?.id || 0, price: 100, isVeg: 1, isAvailable: 1, sortOrder: this.items.length + 1 };
          this.showItemModal();
        });
      }

      // Edit Item
      this.container.querySelectorAll('.edit-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          playSound(800, 100);
          const id = parseInt(btn.dataset.id);
          this.editingItem = { ...this.items.find(i => i.id === id) };
          this.showItemModal();
        });
      });

      // Delete Item
      this.container.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          playSound(300, 150, 'sawtooth');
          if (confirm('Are you sure you want to delete this menu item?')) {
            const id = parseInt(btn.dataset.id);
            await db.menuItems.delete(id);
            showToast('Item deleted successfully', 'success');
            await this.loadData();
            this.render();
            this.bindEvents();
          }
        });
      });
    } else {
      // Add Category
      const addBtn = document.getElementById('btn-add-cat');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          playSound(800, 100);
          this.editingCategory = { name: '', sortOrder: this.categories.length + 1, isActive: 1 };
          this.showCategoryModal();
        });
      }

      // Edit Category
      this.container.querySelectorAll('.edit-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          playSound(800, 100);
          const id = parseInt(btn.dataset.id);
          this.editingCategory = { ...this.categories.find(c => c.id === id) };
          this.showCategoryModal();
        });
      });

      // Delete Category
      this.container.querySelectorAll('.delete-cat-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          playSound(300, 150, 'sawtooth');
          if (confirm('Deleting this category will NOT delete the menu items but they might not be visible. Are you sure you want to delete?')) {
            const id = parseInt(btn.dataset.id);
            await db.menuCategories.delete(id);
            showToast('Category deleted successfully', 'success');
            await this.loadData();
            this.render();
            this.bindEvents();
          }
        });
      });
    }
  }

  showItemModal() {
    const isNew = !this.editingItem.id;
    const modalHtml = `
      <div class="modal-overlay" id="crud-modal-overlay" style="background: rgba(0,0,0,0.65); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 999;">
        <div class="modal card-glass" style="
          background: rgba(17,17,30,0.85); 
          border: 1px solid var(--border-glass); 
          border-radius: var(--radius-xl); 
          width: 100%; 
          max-width: 460px; 
          box-shadow: 0 25px 50px rgba(0,0,0,0.3);
          overflow: hidden;
          animation: modalFadeIn 300ms ease-out;
        ">
          <div class="modal-header" style="border-bottom: 1px solid var(--border-glass); padding: 20px 24px; display: flex; align-items: center; justify-content: space-between;">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">${isNew ? 'Create Menu Item' : 'Modify Menu Item'}</h3>
            <button class="btn-icon" id="crud-modal-close" style="background: transparent; border: none; cursor: pointer;"><span class="material-symbols-rounded" style="color: var(--text-secondary);">close</span></button>
          </div>
          
          <div class="modal-body scrollbar-none" style="display:flex; flex-direction:column; gap:18px; padding: 24px; max-height: 70vh; overflow-y: auto;">
            <div class="input-group">
              <label class="login-label" for="item-name">Item Name</label>
              <input type="text" id="item-name" class="input" value="${escapeHtml(this.editingItem.name)}" placeholder="e.g. Schezwan Noodles" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>

            <div class="input-group">
              <label for="item-cat" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Category</label>
              <select id="item-cat" class="input" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
                ${this.categories.map(c => `<option value="${c.id}" ${c.id === this.editingItem.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>

            <div class="input-group">
              <label for="item-price" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Price (₹)</label>
              <input type="number" id="item-price" class="input" value="${this.editingItem.price}" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>

            <div style="display:flex; gap:16px;">
              <div class="input-group" style="flex:1;">
                <label for="item-veg" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Dietary Type</label>
                <select id="item-veg" class="input" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid var(--border-glass);
                  color: var(--text-primary);
                  font-family: 'Inter', sans-serif;
                  font-size: var(--text-sm);
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
                  <option value="1" ${this.editingItem.isVeg === 1 ? 'selected' : ''}>🟢 Veg</option>
                  <option value="0" ${this.editingItem.isVeg === 0 ? 'selected' : ''}>🔺 Non-Veg</option>
                </select>
              </div>

              <div class="input-group" style="flex:1;">
                <label for="item-avail" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Availability</label>
                <select id="item-avail" class="input" style="
                  background: rgba(0,0,0,0.25);
                  border: 1px solid var(--border-glass);
                  color: var(--text-primary);
                  font-family: 'Inter', sans-serif;
                  font-size: var(--text-sm);
                  padding: 12px 14px;
                  border-radius: var(--radius-md);
                  width: 100%;
                  box-sizing: border-box;
                  outline: none;
                  transition: border var(--transition-fast);
                ">
                  <option value="1" ${this.editingItem.isAvailable === 1 ? 'selected' : ''}>Available</option>
                  <option value="0" ${this.editingItem.isAvailable === 0 ? 'selected' : ''}>Sold Out</option>
                </select>
              </div>
            </div>

            <div class="input-group">
              <label for="item-sort" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Sort Order</label>
              <input type="number" id="item-sort" class="input" value="${this.editingItem.sortOrder}" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>
          </div>
          
          <div class="modal-footer" style="border-top: 1px solid var(--border-glass); padding: 16px 24px; display: flex; justify-content: flex-end; gap: 12px;">
            <button class="btn btn-secondary" id="crud-modal-cancel" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 38px;
              padding: 8px 18px;
              background: rgba(255,255,255,0.02);
              border: 1px solid var(--border-glass);
            ">Cancel</button>
            <button class="btn btn-primary" id="crud-modal-save" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 38px;
              padding: 8px 18px;
              box-shadow: var(--shadow-primary);
            ">Save Item</button>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'modal-wrapper';
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper);

    // Add CSS Focus glows for input fields
    const inputs = wrapper.querySelectorAll('.input');
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        input.style.borderColor = 'var(--color-primary)';
        input.style.boxShadow = '0 0 10px rgba(255, 94, 54, 0.25)';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = 'var(--border-glass)';
        input.style.boxShadow = 'none';
      });
    });

    // Bind modal actions
    const close = () => {
      playSound(700, 80);
      wrapper.remove();
    };

    document.getElementById('crud-modal-close').addEventListener('click', close);
    document.getElementById('crud-modal-cancel').addEventListener('click', close);
    document.getElementById('crud-modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('crud-modal-overlay')) close();
    });

    document.getElementById('crud-modal-save').addEventListener('click', async () => {
      const name = document.getElementById('item-name').value.trim();
      const categoryId = parseInt(document.getElementById('item-cat').value);
      const price = parseFloat(document.getElementById('item-price').value) || 0;
      const isVeg = parseInt(document.getElementById('item-veg').value);
      const isAvailable = parseInt(document.getElementById('item-avail').value);
      const sortOrder = parseInt(document.getElementById('item-sort').value) || 0;

      if (!name) {
        showToast('Please enter an item name', 'warning');
        return;
      }

      this.editingItem.name = name;
      this.editingItem.categoryId = categoryId;
      this.editingItem.price = price;
      this.editingItem.isVeg = isVeg;
      this.editingItem.isAvailable = isAvailable;
      this.editingItem.sortOrder = sortOrder;

      if (isNew) {
        await db.menuItems.add(this.editingItem);
        showToast('Item created successfully!', 'success');
      } else {
        await db.menuItems.put(this.editingItem);
        showToast('Item updated successfully!', 'success');
      }

      wrapper.remove();
      playSound(800, 100);
      vibrateDevice([40]);
      await this.loadData();
      this.render();
      this.bindEvents();
    });
  }

  showCategoryModal() {
    const isNew = !this.editingCategory.id;
    const modalHtml = `
      <div class="modal-overlay" id="crud-modal-overlay" style="background: rgba(0,0,0,0.65); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 999;">
        <div class="modal card-glass" style="
          background: rgba(17,17,30,0.85); 
          border: 1px solid var(--border-glass); 
          border-radius: var(--radius-xl); 
          width: 100%; 
          max-width: 460px; 
          box-shadow: 0 25px 50px rgba(0,0,0,0.3);
          overflow: hidden;
          animation: modalFadeIn 300ms ease-out;
        ">
          <div class="modal-header" style="border-bottom: 1px solid var(--border-glass); padding: 20px 24px; display: flex; align-items: center; justify-content: space-between;">
            <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">${isNew ? 'Create Category' : 'Modify Category'}</h3>
            <button class="btn-icon" id="crud-modal-close" style="background: transparent; border: none; cursor: pointer;"><span class="material-symbols-rounded" style="color: var(--text-secondary);">close</span></button>
          </div>
          
          <div class="modal-body scrollbar-none" style="display:flex; flex-direction:column; gap:18px; padding: 24px; max-height: 70vh; overflow-y: auto;">
            <div class="input-group">
              <label class="login-label" for="cat-name">Category Name</label>
              <input type="text" id="cat-name" class="input" value="${escapeHtml(this.editingCategory.name)}" placeholder="e.g. Starter Momos" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>

            <div class="input-group">
              <label for="cat-sort" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Sort Order</label>
              <input type="number" id="cat-sort" class="input" value="${this.editingCategory.sortOrder}" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
            </div>

            <div class="input-group">
              <label for="cat-active" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 8px; display: block; text-transform: uppercase; letter-spacing: 0.05em;">Status</label>
              <select id="cat-active" class="input" style="
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
                font-family: 'Inter', sans-serif;
                font-size: var(--text-sm);
                padding: 12px 14px;
                border-radius: var(--radius-md);
                width: 100%;
                box-sizing: border-box;
                outline: none;
                transition: border var(--transition-fast);
              ">
                <option value="1" ${this.editingCategory.isActive === 1 ? 'selected' : ''}>Active</option>
                <option value="0" ${this.editingCategory.isActive === 0 ? 'selected' : ''}>Disabled</option>
              </select>
            </div>
          </div>
          
          <div class="modal-footer" style="border-top: 1px solid var(--border-glass); padding: 16px 24px; display: flex; justify-content: flex-end; gap: 12px;">
            <button class="btn btn-secondary" id="crud-modal-cancel" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 38px;
              padding: 8px 18px;
              background: rgba(255,255,255,0.02);
              border: 1px solid var(--border-glass);
            ">Cancel</button>
            <button class="btn btn-primary" id="crud-modal-save" style="
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-weight: 700;
              font-size: var(--text-xs);
              min-height: 38px;
              padding: 8px 18px;
              box-shadow: var(--shadow-primary);
            ">Save Category</button>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'modal-wrapper';
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper);

    // Add CSS Focus glows for input fields
    const inputs = wrapper.querySelectorAll('.input');
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        input.style.borderColor = 'var(--color-primary)';
        input.style.boxShadow = '0 0 10px rgba(255, 94, 54, 0.25)';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = 'var(--border-glass)';
        input.style.boxShadow = 'none';
      });
    });

    // Bind modal actions
    const close = () => {
      playSound(700, 80);
      wrapper.remove();
    };

    document.getElementById('crud-modal-close').addEventListener('click', close);
    document.getElementById('crud-modal-cancel').addEventListener('click', close);
    document.getElementById('crud-modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('crud-modal-overlay')) close();
    });

    document.getElementById('crud-modal-save').addEventListener('click', async () => {
      const name = document.getElementById('cat-name').value.trim();
      const sortOrder = parseInt(document.getElementById('cat-sort').value) || 0;
      const isActive = parseInt(document.getElementById('cat-active').value);

      if (!name) {
        showToast('Please enter category name', 'warning');
        return;
      }

      this.editingCategory.name = name;
      this.editingCategory.sortOrder = sortOrder;
      this.editingCategory.isActive = isActive;

      if (isNew) {
        await db.menuCategories.add(this.editingCategory);
        showToast('Category created!', 'success');
      } else {
        await db.menuCategories.put(this.editingCategory);
        showToast('Category updated!', 'success');
      }

      wrapper.remove();
      playSound(800, 100);
      vibrateDevice([40]);
      await this.loadData();
      this.render();
      this.bindEvents();
    });
  }

  unmount() {
    this.container = null;
    const wrapper = document.getElementById('modal-wrapper');
    if (wrapper) wrapper.remove();
  }
}
