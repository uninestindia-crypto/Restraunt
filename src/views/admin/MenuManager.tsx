// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../db/database';
import { formatCurrency, showToast, playSound, vibrateDevice } from '../../utils/helpers';

interface Category {
  id?: number;
  name: string;
  sortOrder: number;
  isActive: number;
  icon?: string;
  isSynced?: number;
}

interface MenuItem {
  id?: number;
  name: string;
  categoryId: number;
  price: number;
  isVeg: number;
  isAvailable: number;
  sortOrder: number;
  imageUrl?: string;
  isSynced?: number;
}

export function MenuManager() {
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const catsList = await db.menuCategories.orderBy('sortOrder').toArray();
      const itemsList = await db.menuItems.orderBy('sortOrder').toArray();
      setCategories(catsList);
      setItems(itemsList);
    } catch (err) {
      console.error('Failed to load menu CRUD data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTabChange = (tab: 'items' | 'categories') => {
    playSound(700, 80);
    setActiveTab(tab);
  };

  // --- ITEM CRUD ACTIONS ---
  const handleAddItemClick = () => {
    playSound(800, 100);
    setEditingItem({
      name: '',
      categoryId: categories[0]?.id || 0,
      price: 100,
      isVeg: 1,
      isAvailable: 1,
      sortOrder: items.length + 1
    });
    setItemModalOpen(true);
  };

  const handleEditItemClick = (item: MenuItem) => {
    playSound(800, 100);
    setEditingItem({ ...item });
    setItemModalOpen(true);
  };

  const handleDeleteItemClick = async (id: number) => {
    playSound(300, 150, 'sawtooth');
    if (confirm('Are you sure you want to delete this menu item?')) {
      await db.menuItems.delete(id);
      showToast('Item deleted successfully', 'success');
      loadData();
    }
  };

  const handleItemImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingItem) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Image size must be less than 2MB', 'warning');
      e.target.value = '';
      return;
    }

    setImageUploading(true);
    try {
      const { getSupabaseClient } = await import('../../services/supabaseClient');
      const supabase = await getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client is not available or configured.');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `items/${fileName}`;

      const { error } = await supabase.storage
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
      setEditingItem(prev => prev ? { ...prev, imageUrl: publicUrl } : null);
      showToast('Image uploaded successfully!', 'success');
    } catch (err: any) {
      console.error('Image upload failed:', err);
      showToast(`Image upload failed: ${err.message || err}`, 'error');
    } finally {
      setImageUploading(false);
    }
  };

  const handleSaveItem = async () => {
    if (!editingItem) return;
    const name = editingItem.name.trim();

    if (!name) {
      showToast('Please enter an item name', 'warning');
      return;
    }

    const savedItem = {
      ...editingItem,
      name,
      categoryId: Number(editingItem.categoryId),
      price: Number(editingItem.price) || 0,
      isVeg: Number(editingItem.isVeg),
      isAvailable: Number(editingItem.isAvailable),
      sortOrder: Number(editingItem.sortOrder) || 0,
      isSynced: 0
    };

    if (!savedItem.id) {
      await db.menuItems.add(savedItem);
      showToast('Item created successfully!', 'success');
    } else {
      await db.menuItems.put(savedItem);
      showToast('Item updated successfully!', 'success');
    }

    setItemModalOpen(false);
    setEditingItem(null);
    playSound(800, 100);
    vibrateDevice([40]);
    loadData();
  };

  // --- CATEGORY CRUD ACTIONS ---
  const handleAddCategoryClick = () => {
    playSound(800, 100);
    setEditingCategory({
      name: '',
      sortOrder: categories.length + 1,
      isActive: 1
    });
    setCategoryModalOpen(true);
  };

  const handleEditCategoryClick = (cat: Category) => {
    playSound(800, 100);
    setEditingCategory({ ...cat });
    setCategoryModalOpen(true);
  };

  const handleDeleteCategoryClick = async (id: number) => {
    playSound(300, 150, 'sawtooth');
    if (confirm('Deleting this category will NOT delete the menu items but they might not be visible. Are you sure you want to delete?')) {
      await db.menuCategories.delete(id);
      showToast('Category deleted successfully', 'success');
      loadData();
    }
  };

  const handleSaveCategory = async () => {
    if (!editingCategory) return;
    const name = editingCategory.name.trim();

    if (!name) {
      showToast('Please enter category name', 'warning');
      return;
    }

    const savedCategory = {
      ...editingCategory,
      name,
      sortOrder: Number(editingCategory.sortOrder) || 0,
      isActive: Number(editingCategory.isActive),
      isSynced: 0
    };

    if (!savedCategory.id) {
      await db.menuCategories.add(savedCategory);
      showToast('Category created!', 'success');
    } else {
      await db.menuCategories.put(savedCategory);
      showToast('Category updated!', 'success');
    }

    setCategoryModalOpen(false);
    setEditingCategory(null);
    playSound(800, 100);
    vibrateDevice([40]);
    loadData();
  };

  const defaultImgMap: Record<string, string> = {
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

  if (loading) {
    return (
      <div style={{ padding: '24px 0', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        <div className="tab-container" style={{ padding: '0 24px', borderBottom: 'none', marginBottom: '12px', display: 'flex', gap: '8px' }}>
          <div className="skeleton-card" style={{ height: '36px', width: '110px', borderRadius: '8px' }}></div>
          <div className="skeleton-card" style={{ height: '36px', width: '110px', borderRadius: '8px' }}></div>
        </div>
        <div style={{ padding: '0 24px' }}>
          <div className="skeleton-card" style={{ height: '300px', borderRadius: '12px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 0', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      {/* Sub tabs */}
      <div className="tab-container" style={{ padding: '0 24px', borderBottom: 'none', marginBottom: '12px', display: 'flex', gap: '8px' }}>
        <button onClick={() => handleTabChange('items')} className={`tab sub-tab ${activeTab === 'items' ? 'active' : ''}`} style={{ border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius-sm)', transition: 'all var(--transition-fast)' }}>
          Menu Items
        </button>
        <button onClick={() => handleTabChange('categories')} className={`tab sub-tab ${activeTab === 'categories' ? 'active' : ''}`} style={{ border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius-sm)', transition: 'all var(--transition-fast)' }}>
          Categories
        </button>
      </div>

      <div id="crud-content">
        {activeTab === 'items' ? (
          <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>Menu Items ({items.length})</h3>
              <button onClick={handleAddItemClick} className="btn btn-primary btn-sm">
                Add New Item +
              </button>
            </div>

            <div className="table-container scrollbar-none">
              <table className="premium-table responsive-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>
                        No menu items found. Click 'Add New Item' to start!
                      </td>
                    </tr>
                  ) : (
                    items.map(item => {
                      const cat = categories.find(c => c.id === item.categoryId);
                      const catName = cat ? cat.name : 'Unknown';
                      const vegDot = item.isVeg === 1 ? '🟢 Veg' : '🔺 Non-Veg';
                      const vegClass = item.isVeg === 1 ? 'badge-success' : 'badge-danger';
                      return (
                        <tr key={item.id}>
                          <td data-label="Name" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</td>
                          <td data-label="Category">{catName}</td>
                          <td data-label="Price" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatCurrency(item.price)}</td>
                          <td data-label="Type">
                            <span className={`badge ${vegClass}`} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{vegDot}</span>
                          </td>
                          <td data-label="Status">
                            <span className={`badge ${item.isAvailable === 1 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>
                              {item.isAvailable === 1 ? 'Available' : 'Sold Out'}
                            </span>
                          </td>
                          <td data-label="Actions" style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button onClick={() => handleEditItemClick(item)} className="btn btn-secondary btn-sm">Edit</button>
                              <button onClick={() => handleDeleteItemClick(item.id!)} className="btn btn-sm" style={{ background: 'rgba(239, 68, 68, 0.05)', color: '#FF4D4D', border: '1px solid rgba(239, 68, 68, 0.2)' }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>Manage Categories ({categories.length})</h3>
              <button onClick={handleAddCategoryClick} className="btn btn-primary btn-sm">
                Add Category +
              </button>
            </div>

            <div className="table-container scrollbar-none">
              <table className="premium-table responsive-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Sort Order</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>
                        No categories found. Click 'Add Category' to start!
                      </td>
                    </tr>
                  ) : (
                    categories.map(cat => (
                      <tr key={cat.id}>
                        <td data-label="Name" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cat.name}</td>
                        <td data-label="Sort Order">{cat.sortOrder}</td>
                        <td data-label="Status">
                          <span className={`badge ${cat.isActive === 1 ? 'badge-success' : 'badge-danger'}`}>
                            {cat.isActive === 1 ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td data-label="Actions" style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button onClick={() => handleEditCategoryClick(cat)} className="btn btn-secondary btn-sm">Edit</button>
                            <button onClick={() => handleDeleteCategoryClick(cat.id!)} className="btn btn-sm" style={{ background: 'rgba(239, 68, 68, 0.05)', color: '#FF4D4D', border: '1px solid rgba(239, 68, 68, 0.2)' }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Item Overlay Modal */}
      {itemModalOpen && editingItem && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setItemModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '460px', width: '100%', margin: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{!editingItem.id ? 'Create Menu Item' : 'Modify Menu Item'}</h3>
              <button className="btn-icon" onClick={() => setItemModalOpen(false)}>
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '20px 0' }}>
              <div className="input-group">
                <label htmlFor="item-name">Item Name</label>
                <input
                  type="text"
                  id="item-name"
                  className="input"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="e.g. Schezwan Noodles"
                />
              </div>

              <div className="input-group">
                <label htmlFor="item-cat">Category</label>
                <select
                  id="item-cat"
                  className="input"
                  value={editingItem.categoryId}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, categoryId: Number(e.target.value) } : null)}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label htmlFor="item-price">Price (₹)</label>
                <input
                  type="number"
                  id="item-price"
                  className="input"
                  value={editingItem.price}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, price: Number(e.target.value) } : null)}
                />
              </div>

              {/* Image upload */}
              <div className="input-group">
                <label htmlFor="item-image-file">Dish Image (Max 2MB)</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', position: 'relative' }}>
                  <img
                    id="item-image-preview"
                    src={editingItem.imageUrl || defaultImgMap[(categories.find(c => c.id === Number(editingItem.categoryId))?.name || '').toLowerCase()] || '/assets/dish-starters.jpg'}
                    style={{ width: '54px', height: '54px', borderRadius: 'var(--radius-sm)', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)' }}
                    alt="Preview"
                  />
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="file"
                      id="item-image-file"
                      onChange={handleItemImageUpload}
                      accept="image/*"
                      className="input"
                      style={{ padding: '6px', fontSize: '0.8rem', height: 'auto' }}
                    />
                    {imageUploading && (
                      <div className="loading-spinner" style={{ position: 'absolute', right: '10px', top: '10px', width: '18px', height: '18px', borderWidth: '2px' }}></div>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-row" style={{ display: 'flex', gap: '12px' }}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label htmlFor="item-veg">Dietary Type</label>
                  <select
                    id="item-veg"
                    className="input"
                    value={editingItem.isVeg}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, isVeg: Number(e.target.value) } : null)}
                  >
                    <option value={1}>🟢 Veg</option>
                    <option value={0}>🔺 Non-Veg</option>
                  </select>
                </div>

                <div className="input-group" style={{ flex: 1 }}>
                  <label htmlFor="item-avail">Availability</label>
                  <select
                    id="item-avail"
                    className="input"
                    value={editingItem.isAvailable}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, isAvailable: Number(e.target.value) } : null)}
                  >
                    <option value={1}>Available</option>
                    <option value={0}>Sold Out</option>
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="item-sort">Sort Order</label>
                <input
                  type="number"
                  id="item-sort"
                  className="input"
                  value={editingItem.sortOrder}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, sortOrder: Number(e.target.value) } : null)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setItemModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveItem}>Save Item</button>
            </div>
          </div>
        </div>
      )}

      {/* Category Overlay Modal */}
      {categoryModalOpen && editingCategory && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setCategoryModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '460px', width: '100%', margin: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{!editingCategory.id ? 'Create Category' : 'Modify Category'}</h3>
              <button className="btn-icon" onClick={() => setCategoryModalOpen(false)}>
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '20px 0' }}>
              <div className="input-group">
                <label htmlFor="cat-name">Category Name</label>
                <input
                  type="text"
                  id="cat-name"
                  className="input"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="e.g. Starter Momos"
                />
              </div>

              <div className="input-group">
                <label htmlFor="cat-sort">Sort Order</label>
                <input
                  type="number"
                  id="cat-sort"
                  className="input"
                  value={editingCategory.sortOrder}
                  onChange={(e) => setEditingCategory(prev => prev ? { ...prev, sortOrder: Number(e.target.value) } : null)}
                />
              </div>

              <div className="input-group">
                <label htmlFor="cat-active">Status</label>
                <select
                  id="cat-active"
                  className="input"
                  value={editingCategory.isActive}
                  onChange={(e) => setEditingCategory(prev => prev ? { ...prev, isActive: Number(e.target.value) } : null)}
                >
                  <option value={1}>Active</option>
                  <option value={0}>Disabled</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setCategoryModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveCategory}>Save Category</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
