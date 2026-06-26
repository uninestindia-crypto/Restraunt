// @ts-nocheck
/**
 * MenuManager — Admin view for managing categories and items
 */

import { db } from '../../db/database';
import { escapeHtml, formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers';

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
      <div class="tab-container" style="padding: 0 24px; border-bottom: none; margin-bottom: 12px;">
        <button class="tab sub-tab ${this.activeTab === 'items' ? 'active' : ''}" data-sub-tab="items">
          Menu Items
        </button>
        <button class="tab sub-tab ${this.activeTab === 'categories' ? 'active' : ''}" data-sub-tab="categories">
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
        <tr>
          <td data-label="Name" style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item.name)}</td>
          <td data-label="Category">${escapeHtml(catName)}</td>
          <td data-label="Price" style="font-weight: 700; color: var(--color-primary);">${formatCurrency(item.price)}</td>
          <td data-label="Type">
            <span class="badge ${vegClass}">${vegDot}</span>
          </td>
          <td data-label="Status">
            <span class="badge ${availableClass}">${availableLabel}</span>
          </td>
          <td data-label="Actions" style="text-align: right;">
            <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary btn-sm edit-item-btn" data-id="${item.id}">
                Edit
              </button>
              <button class="btn btn-sm delete-item-btn" data-id="${item.id}" style="background: rgba(239, 68, 68, 0.05); color: #FF4D4D; border: 1px solid rgba(239, 68, 68, 0.2);">
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
          <h3 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">Menu Items (${this.items.length})</h3>
          <button class="btn btn-primary btn-sm" id="btn-add-item">
            Add New Item +
          </button>
        </div>

        <div class="table-container scrollbar-none">
          <table class="premium-table responsive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Type</th>
                <th>Status</th>
                <th style="text-align: right;">Actions</th>
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
        <tr>
          <td data-label="Name" style="font-weight: 600; color: var(--text-primary);">${escapeHtml(cat.name)}</td>
          <td data-label="Sort Order">${cat.sortOrder}</td>
          <td data-label="Status">
            <span class="badge ${activeClass}">${activeLabel}</span>
          </td>
          <td data-label="Actions" style="text-align: right;">
            <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary btn-sm edit-cat-btn" data-id="${cat.id}">
                Edit
              </button>
              <button class="btn btn-sm delete-cat-btn" data-id="${cat.id}" style="background: rgba(239, 68, 68, 0.05); color: #FF4D4D; border: 1px solid rgba(239, 68, 68, 0.2);">
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
          <h3 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">Manage Categories (${this.categories.length})</h3>
          <button class="btn btn-primary btn-sm" id="btn-add-cat">
            Add Category +
          </button>
        </div>

        <div class="table-container scrollbar-none">
          <table class="premium-table responsive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sort Order</th>
                <th>Status</th>
                <th style="text-align: right;">Actions</th>
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
    const cat = this.categories.find(c => c.id === this.editingItem.categoryId);
    const key = (cat?.name || '').toLowerCase();
    const defaultImageMap = {
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
    const defaultImg = defaultImageMap[key] || '/assets/dish-starters.jpg';

    const modalHtml = `
      <div class="modal-overlay" id="crud-modal-overlay">
        <div class="modal" style="max-width: 460px;">
          <div class="modal-header">
            <h3>${isNew ? 'Create Menu Item' : 'Modify Menu Item'}</h3>
            <button class="btn-icon" id="crud-modal-close"><span class="material-symbols-rounded">close</span></button>
          </div>
          
          <div class="modal-body" style="display:flex; flex-direction:column; gap:18px;">
            <div class="input-group">
              <label for="item-name">Item Name</label>
              <input type="text" id="item-name" class="input" value="${escapeHtml(this.editingItem.name)}" placeholder="e.g. Schezwan Noodles">
            </div>

            <div class="input-group">
              <label for="item-cat">Category</label>
              <select id="item-cat" class="input">
                ${this.categories.map(c => `<option value="${c.id}" ${c.id === this.editingItem.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>

            <div class="input-group">
              <label for="item-price">Price (₹)</label>
              <input type="number" id="item-price" class="input" value="${this.editingItem.price}">
            </div>

            <div class="input-group">
              <label for="item-image-file">Dish Image (Max 2MB)</label>
              <div style="display: flex; gap: 12px; align-items: center; position: relative;">
                <img id="item-image-preview" src="${this.editingItem.imageUrl || defaultImg}" style="width: 54px; height: 54px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid rgba(255,255,255,0.15);" alt="Preview">
                <div style="flex: 1; position: relative;">
                  <input type="file" id="item-image-file" accept="image/*" class="input" style="padding: 6px; font-size: 0.8rem; height: auto;">
                  <div id="image-upload-spinner" class="loading-spinner" style="position: absolute; right: 10px; top: 10px; display: none; width: 18px; height: 18px; border-width: 2px;"></div>
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="input-group">
                <label for="item-veg">Dietary Type</label>
                <select id="item-veg" class="input">
                  <option value="1" ${this.editingItem.isVeg === 1 ? 'selected' : ''}>🟢 Veg</option>
                  <option value="0" ${this.editingItem.isVeg === 0 ? 'selected' : ''}>🔺 Non-Veg</option>
                </select>
              </div>

              <div class="input-group">
                <label for="item-avail">Availability</label>
                <select id="item-avail" class="input">
                  <option value="1" ${this.editingItem.isAvailable === 1 ? 'selected' : ''}>Available</option>
                  <option value="0" ${this.editingItem.isAvailable === 0 ? 'selected' : ''}>Sold Out</option>
                </select>
              </div>
            </div>

            <div class="input-group">
              <label for="item-sort">Sort Order</label>
              <input type="number" id="item-sort" class="input" value="${this.editingItem.sortOrder}">
            </div>
          </div>
          
          <div class="modal-footer">
            <button class="btn btn-secondary btn-sm" id="crud-modal-cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="crud-modal-save">Save Item</button>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'modal-wrapper';
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper);

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

    // Bind image file selection and upload
    document.getElementById('item-image-file')?.addEventListener('change', async (e) => {
      const fileInput = e.target;
      const file = fileInput.files[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        showToast('Image size must be less than 2MB', 'warning');
        fileInput.value = '';
        return;
      }

      const spinner = document.getElementById('image-upload-spinner');
      if (spinner) spinner.style.display = 'block';

      try {
        const { getSupabaseClient } = await import('../../services/supabaseClient');
        const supabase = await getSupabaseClient();
        if (!supabase) {
          throw new Error('Supabase client is not available or configured.');
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `items/${fileName}`;

        const { data, error } = await supabase.storage
          .from('menu-images')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
          });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('menu-images')
          .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;
        this.editingItem.imageUrl = publicUrl;

        const previewImg = document.getElementById('item-image-preview');
        if (previewImg) previewImg.src = publicUrl;

        showToast('Image uploaded successfully!', 'success');
      } catch (err) {
        console.error('Image upload failed:', err);
        showToast(`Image upload failed: ${err.message || err}`, 'error');
      } finally {
        if (spinner) spinner.style.display = 'none';
      }
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
      <div class="modal-overlay" id="crud-modal-overlay">
        <div class="modal" style="max-width: 460px;">
          <div class="modal-header">
            <h3>${isNew ? 'Create Category' : 'Modify Category'}</h3>
            <button class="btn-icon" id="crud-modal-close"><span class="material-symbols-rounded">close</span></button>
          </div>
          
          <div class="modal-body" style="display:flex; flex-direction:column; gap:18px;">
            <div class="input-group">
              <label for="cat-name">Category Name</label>
              <input type="text" id="cat-name" class="input" value="${escapeHtml(this.editingCategory.name)}" placeholder="e.g. Starter Momos">
            </div>

            <div class="input-group">
              <label for="cat-sort">Sort Order</label>
              <input type="number" id="cat-sort" class="input" value="${this.editingCategory.sortOrder}">
            </div>

            <div class="input-group">
              <label for="cat-active">Status</label>
              <select id="cat-active" class="input">
                <option value="1" ${this.editingCategory.isActive === 1 ? 'selected' : ''}>Active</option>
                <option value="0" ${this.editingCategory.isActive === 0 ? 'selected' : ''}>Disabled</option>
              </select>
            </div>
          </div>
          
          <div class="modal-footer">
            <button class="btn btn-secondary btn-sm" id="crud-modal-cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="crud-modal-save">Save Category</button>
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'modal-wrapper';
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper);

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
