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

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'soldout'>('all');
  const [selectedCatFilter, setSelectedCatFilter] = useState<number | 'all'>('all');

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

  const handleToggleAvailable = async (item: MenuItem) => {
    playSound(700, 80);
    const updatedStatus = item.isAvailable === 1 ? 0 : 1;
    await db.menuItems.update(item.id!, { isAvailable: updatedStatus, isSynced: 0 });
    showToast(updatedStatus === 1 ? `${item.name} is Available` : `${item.name} is Sold Out`, 'info');
    loadData();
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

  // Filter items logic
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchDiet = dietFilter === 'all' 
        ? true 
        : (dietFilter === 'veg' ? item.isVeg === 1 : item.isVeg === 0);
      const matchStatus = statusFilter === 'all'
        ? true
        : (statusFilter === 'available' ? item.isAvailable === 1 : item.isAvailable === 0);
      const matchCat = selectedCatFilter === 'all'
        ? true
        : item.categoryId === Number(selectedCatFilter);

      return matchSearch && matchDiet && matchStatus && matchCat;
    });
  }, [items, searchQuery, dietFilter, statusFilter, selectedCatFilter]);

  // Compute number of items in each category
  const categoryCountMap = useMemo(() => {
    const counts: Record<number, number> = {};
    items.forEach(item => {
      counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
    });
    return counts;
  }, [items]);

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
      <style>{`
        .menu-filter-btn {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-glass);
          color: var(--text-secondary);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: var(--text-xs);
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .menu-filter-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-primary);
        }
        .menu-filter-btn.active {
          background: var(--gradient-primary);
          color: #fff;
          border-color: transparent;
          box-shadow: var(--shadow-primary);
        }
        
        .menu-grid-container {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 20px;
        }
        .dish-card {
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .dish-card:hover {
          transform: translateY(-4px);
          border-color: var(--border-active);
          box-shadow: var(--shadow-md);
        }
        .dish-thumbnail-container {
          position: relative;
          height: 140px;
          width: 100%;
          background: #111;
        }
        .dish-thumbnail {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .dish-type-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          font-size: 9px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .dish-type-badge.veg {
          background: rgba(16, 185, 129, 0.9);
          color: #fff;
        }
        .dish-type-badge.nonveg {
          background: rgba(239, 68, 68, 0.9);
          color: #fff;
        }
        
        /* Toggle available button */
        .btn-avail-toggle {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.15);
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-avail-toggle:hover {
          background: var(--color-primary);
          border-color: transparent;
        }
        .btn-avail-toggle.soldout {
          color: var(--color-danger);
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.35);
        }

        .category-card {
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }
        .category-card:hover {
          border-color: var(--border-active);
          background: rgba(255,255,255,0.02);
        }
      `}</style>

      {/* Sub tabs */}
      <div className="tab-container" style={{ padding: '0 24px', borderBottom: 'none', marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button onClick={() => handleTabChange('items')} className={`tab sub-tab ${activeTab === 'items' ? 'active' : ''}`} style={{ border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius-sm)', transition: 'all var(--transition-fast)' }}>
          Menu Items
        </button>
        <button onClick={() => handleTabChange('categories')} className={`tab sub-tab ${activeTab === 'categories' ? 'active' : ''}`} style={{ border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius-sm)', transition: 'all var(--transition-fast)' }}>
          Categories
        </button>
      </div>

      <div id="crud-content">
        {activeTab === 'items' ? (
          <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Control Bar: Search & Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', flex: 1 }}>
                
                {/* Search query input */}
                <div style={{ position: 'relative', width: '220px' }}>
                  <input
                    type="text"
                    className="input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dishes..."
                    style={{ paddingLeft: '36px', height: '34px', fontSize: 'var(--text-xs)' }}
                  />
                  <span className="material-symbols-rounded" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: 'var(--text-secondary)' }}>search</span>
                </div>

                {/* Diet filter chips */}
                <button className={`menu-filter-btn ${dietFilter === 'all' ? 'active' : ''}`} onClick={() => setDietFilter('all')}>All</button>
                <button className={`menu-filter-btn ${dietFilter === 'veg' ? 'active' : ''}`} onClick={() => setDietFilter('veg')}>🟢 Veg</button>
                <button className={`menu-filter-btn ${dietFilter === 'nonveg' ? 'active' : ''}`} onClick={() => setDietFilter('nonveg')}>🔺 Non-Veg</button>

                {/* Availability filter chips */}
                <button className={`menu-filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All Status</button>
                <button className={`menu-filter-btn ${statusFilter === 'available' ? 'active' : ''}`} onClick={() => setStatusFilter('available')}>Available</button>
                <button className={`menu-filter-btn ${statusFilter === 'soldout' ? 'active' : ''}`} onClick={() => setStatusFilter('soldout')}>Sold Out</button>

                {/* Category Filter Dropdown */}
                <select
                  className="input"
                  value={selectedCatFilter}
                  onChange={(e) => setSelectedCatFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  style={{ width: '130px', height: '34px', minHeight: '34px', padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 700 }}
                >
                  <option value="all">All Categories</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <button onClick={handleAddItemClick} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', height: '34px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>add</span>
                Add Item
              </button>
            </div>

            {/* Dishes Grid */}
            <div className="menu-grid-container">
              {filteredItems.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '64px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: '48px', color: 'var(--text-muted)', marginBottom: '8px' }}>no_meals</span>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>No menu items match your filter criteria.</div>
                </div>
              ) : (
                filteredItems.map(item => {
                  const cat = categories.find(c => c.id === item.categoryId);
                  const catName = cat ? cat.name : 'Unknown';
                  const vegClass = item.isVeg === 1 ? 'veg' : 'nonveg';
                  const vegLabel = item.isVeg === 1 ? 'Veg' : 'Non-Veg';
                  
                  const resolvedImg = item.imageUrl || defaultImgMap[(catName || '').toLowerCase()] || '/assets/dish-starters.jpg';

                  return (
                    <div key={item.id} className="dish-card">
                      {/* Thumbnail Container */}
                      <div className="dish-thumbnail-container">
                        <img src={resolvedImg} className="dish-thumbnail" alt={item.name} />
                        
                        <span className={`dish-type-badge ${vegClass}`}>
                          {vegLabel}
                        </span>

                        <button
                          className={`btn-avail-toggle ${item.isAvailable === 0 ? 'soldout' : ''}`}
                          onClick={() => handleToggleAvailable(item)}
                          title={item.isAvailable === 1 ? 'Mark Sold Out' : 'Mark Available'}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>
                            {item.isAvailable === 1 ? 'check_circle' : 'do_not_distribute'}
                          </span>
                        </button>
                      </div>

                      {/* Card Body */}
                      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{catName}</span>
                        <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</h4>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px' }}>
                          <span style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--color-primary)' }}>{formatCurrency(item.price)}</span>
                          
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => handleEditItemClick(item)}
                              className="btn btn-secondary btn-sm"
                              style={{ width: '28px', height: '28px', minWidth: '28px', minHeight: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Edit Item"
                            >
                              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteItemClick(item.id!)}
                              className="btn btn-sm"
                              style={{ width: '28px', height: '28px', minWidth: '28px', minHeight: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.06)', color: '#FF4D4D', border: '1px solid rgba(239,68,68,0.2)' }}
                              title="Delete Item"
                            >
                              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>Manage Categories ({categories.length})</h3>
              <button onClick={handleAddCategoryClick} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>add</span>
                Add Category
              </button>
            </div>

            {/* Categories List Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {categories.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>No categories found. Click 'Add Category' to start!</div>
              ) : (
                categories.map(cat => {
                  const itemCount = categoryCountMap[cat.id!] || 0;
                  return (
                    <div key={cat.id} className="category-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          background: 'rgba(255, 94, 54, 0.06)',
                          color: 'var(--color-primary)',
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1rem',
                          border: '1px solid rgba(255,94,54,0.2)'
                        }}>
                          {cat.sortOrder}
                        </div>
                        <div>
                          <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{cat.name}</h4>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, display: 'inline-block', marginTop: '2px' }}>
                            {itemCount} {itemCount === 1 ? 'dish' : 'dishes'} listed
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span className={`badge ${cat.isActive === 1 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '9px', fontWeight: 800, padding: '3px 8px', textTransform: 'uppercase' }}>
                          {cat.isActive === 1 ? 'Active' : 'Disabled'}
                        </span>
                        
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => handleEditCategoryClick(cat)} className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', height: '30px', display: 'flex', alignItems: 'center', gap: '4px' }}>Edit</button>
                          <button onClick={() => handleDeleteCategoryClick(cat.id!)} className="btn btn-sm" style={{ padding: '4px 10px', height: '30px', background: 'rgba(239,68,68,0.06)', color: '#FF4D4D', border: '1px solid rgba(239,68,68,0.2)' }}>Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Item Overlay Modal */}
      {itemModalOpen && editingItem && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setItemModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '480px', width: '100%', margin: '20px', background: 'var(--glass-bg)', backdropFilter: 'blur(30px)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-glass)', padding: '16px 20px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{!editingItem.id ? 'Create Menu Item' : 'Modify Menu Item'}</h3>
              <button className="btn-icon" onClick={() => setItemModalOpen(false)}>
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '20px' }}>
              <div className="input-group">
                <label htmlFor="item-name" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Item Name</label>
                <input
                  type="text"
                  id="item-name"
                  className="input"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="e.g. Schezwan Noodles"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="item-cat" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Category</label>
                  <select
                    id="item-cat"
                    className="input"
                    value={editingItem.categoryId}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, categoryId: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label htmlFor="item-price" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Price (₹)</label>
                  <input
                    type="number"
                    id="item-price"
                    className="input"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, price: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  />
                </div>
              </div>

              {/* Image upload dropzone */}
              <div className="input-group">
                <label htmlFor="item-image-file" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Dish Image (Max 2MB)</label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <img
                    id="item-image-preview"
                    src={editingItem.imageUrl || defaultImgMap[(categories.find(c => c.id === Number(editingItem.categoryId))?.name || '').toLowerCase()] || '/assets/dish-starters.jpg'}
                    style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border-glass)', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}
                    alt="Preview"
                  />
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="file"
                      id="item-image-file"
                      onChange={handleItemImageUpload}
                      accept="image/*"
                      className="input"
                      style={{ padding: '6px', fontSize: '11px', height: 'auto' }}
                    />
                    {imageUploading && (
                      <div className="loading-spinner" style={{ position: 'absolute', right: '12px', top: '10px', width: '16px', height: '16px', borderWidth: '2px' }}></div>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="item-veg" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Dietary Type</label>
                  <select
                    id="item-veg"
                    className="input"
                    value={editingItem.isVeg}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, isVeg: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  >
                    <option value={1}>🟢 Veg (Vegetarian)</option>
                    <option value={0}>🔺 Non-Veg (Egg/Meat)</option>
                  </select>
                </div>

                <div className="input-group">
                  <label htmlFor="item-avail" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Availability</label>
                  <select
                    id="item-avail"
                    className="input"
                    value={editingItem.isAvailable}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, isAvailable: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  >
                    <option value={1}>Available</option>
                    <option value={0}>Sold Out</option>
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="item-sort" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Sort Order Weight</label>
                <input
                  type="number"
                  id="item-sort"
                  className="input"
                  value={editingItem.sortOrder}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, sortOrder: Number(e.target.value) } : null)}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-glass)', padding: '16px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setItemModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveItem}>Save Menu Item</button>
            </div>
          </div>
        </div>
      )}

      {/* Category Overlay Modal */}
      {categoryModalOpen && editingCategory && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setCategoryModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '440px', width: '100%', margin: '20px', background: 'var(--glass-bg)', backdropFilter: 'blur(30px)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-glass)', padding: '16px 20px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{!editingCategory.id ? 'Create Category' : 'Modify Category'}</h3>
              <button className="btn-icon" onClick={() => setCategoryModalOpen(false)}>
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '20px' }}>
              <div className="input-group">
                <label htmlFor="cat-name" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Category Name</label>
                <input
                  type="text"
                  id="cat-name"
                  className="input"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="e.g. Starter Momos"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="cat-sort" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Sort Order Index</label>
                  <input
                    type="number"
                    id="cat-sort"
                    className="input"
                    value={editingCategory.sortOrder}
                    onChange={(e) => setEditingCategory(prev => prev ? { ...prev, sortOrder: Number(e.target.value) } : null)}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="cat-active" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Status</label>
                  <select
                    id="cat-active"
                    className="input"
                    value={editingCategory.isActive}
                    onChange={(e) => setEditingCategory(prev => prev ? { ...prev, isActive: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  >
                    <option value={1}>Active</option>
                    <option value={0}>Disabled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-glass)', padding: '16px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setCategoryModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveCategory}>Save Category</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
