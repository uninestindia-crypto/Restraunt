import React, { useState, useEffect, useMemo } from 'react';
import { db, type MenuCategory, type MenuItem } from '../../db/database';
import { ensureFresh } from '../../services/cloudDb';
import { formatCurrency, showToast, playSound, vibrateDevice, menuItemImageSource } from '../../utils/helpers';
import { compressImage, formatBytes } from '../../utils/imageProcessing';
import {
  hasUnpublishedImage,
  publishPendingMenuImages,
  startPendingImageRetry,
  uploadMenuImage
} from '../../services/menuImagePublisher';

/** Cloud `menu_items.image_url` is a varchar(500); anything longer must stay local. */
const MAX_REMOTE_IMAGE_URL_LENGTH = 500;



export function MenuManager() {
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [categories, setCategories] = useState<MenuCategory[]>([]);
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

  // Paid extras for the dish currently open in the modal.
  const [itemAddons, setItemAddons] = useState<any[]>([]);
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState('');

  // Photos that exist only on this device, and why the last publish failed.
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [publishError, setPublishError] = useState('');
  const [publishing, setPublishing] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      // Read the published menu, not this browser's copy of it.
      await ensureFresh(['categories', 'items']);

      // A photo picked while signed out of the cloud never reached Supabase, so
      // a second device still shows the old dish. Retry those before listing.
      const publish = await publishPendingMenuImages();
      if (publish.published > 0) {
        showToast(`Published ${publish.published} dish photo${publish.published > 1 ? 's' : ''} to all devices.`, 'success');
      }
      setPendingPhotos(publish.pending);
      setPublishError(publish.pending > 0 ? publish.reason : '');
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
    startPendingImageRetry();
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
      description: '',
      sortOrder: items.length + 1
    });
    setItemAddons([]);
    setItemModalOpen(true);
  };

  const handleEditItemClick = (item: MenuItem) => {
    playSound(800, 100);
    setEditingItem({ ...item });
    loadItemAddons(item.id);
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
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !editingItem) return;

    setImageUploading(true);
    try {
      // Any camera-sized photo is accepted: it is downscaled here instead of
      // being rejected for its file size.
      const optimised = await compressImage(file, { maxDimension: 1280, maxBytes: 400 * 1024 });

      // Show the new picture straight away, whether or not the cloud accepts it.
      setEditingItem(prev => prev ? { ...prev, imageData: optimised.dataUrl } : null);

      const { url, reason } = await uploadMenuImage(optimised.blob, optimised.type);
      if (url) {
        setEditingItem(prev => prev ? { ...prev, imageUrl: url, imageData: '' } : null);
        showToast(
          `Image optimised ${formatBytes(optimised.originalBytes)} → ${formatBytes(optimised.bytes)} and uploaded. Save to apply.`,
          'success'
        );
      } else {
        // Kept as a pending photo rather than a lost one: the item is flagged in
        // the list below and retried whenever a cloud session is available.
        showToast(`${reason} Saved on this device for now — it will publish automatically once you are signed in to the cloud.`, 'warning', 8000);
      }
    } catch (err: any) {
      console.error('Image processing failed:', err);
      showToast(`Could not use this image: ${err?.message || err}`, 'error');
    } finally {
      setImageUploading(false);
      input.value = '';
    }
  };

  const handleImageUrlChange = (value: string) => {
    const url = value.trim();
    setEditingItem(prev => prev ? { ...prev, imageUrl: url, imageData: url ? '' : prev.imageData } : null);
  };

  const handleRemoveItemImage = () => {
    playSound(400, 80);
    setEditingItem(prev => prev ? { ...prev, imageUrl: '', imageData: '' } : null);
    showToast('Image cleared — the category default will be shown. Save to apply.', 'info');
  };

  const loadItemAddons = async (menuItemId?: number) => {
    if (!menuItemId) {
      setItemAddons([]);
      return;
    }
    try {
      const rows = await db.menuItemAddons.where('menuItemId').equals(menuItemId).toArray();
      setItemAddons(rows.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    } catch (err) {
      console.error('[MenuManager] Could not load add-ons:', err);
      setItemAddons([]);
    }
  };

  const handleAddAddon = async () => {
    const name = newAddonName.trim();
    const price = Number(newAddonPrice) || 0;
    if (!editingItem?.id) {
      showToast('Save the dish first, then add its extras.', 'warning');
      return;
    }
    if (!name) {
      showToast('Give the add-on a name', 'warning');
      return;
    }
    if (itemAddons.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      showToast('That add-on already exists for this dish', 'warning');
      return;
    }

    // isSynced: 0 so the sync layer pushes it; the Dexie hook does the upload.
    await db.menuItemAddons.add({
      menuItemId: editingItem.id,
      name,
      price,
      isActive: 1,
      sortOrder: itemAddons.length,
      updatedAt: new Date().toISOString(),
      isSynced: 0
    } as any);

    setNewAddonName('');
    setNewAddonPrice('');
    playSound(880, 80);
    await loadItemAddons(editingItem.id);
  };

  const handleRemoveAddon = async (addonId: number) => {
    await db.menuItemAddons.delete(addonId);
    playSound(400, 80);
    await loadItemAddons(editingItem?.id);
  };

  const handleAddonPriceChange = async (addonId: number, price: number) => {
    await db.menuItemAddons.update(addonId, {
      price: Number(price) || 0,
      updatedAt: new Date().toISOString(),
      isSynced: 0
    });
    await loadItemAddons(editingItem?.id);
  };

  const handlePublishPhotos = async () => {
    setPublishing(true);
    try {
      const result = await publishPendingMenuImages();
      setPendingPhotos(result.pending);
      setPublishError(result.pending > 0 ? result.reason : '');
      if (result.published > 0) {
        showToast(`Published ${result.published} photo${result.published > 1 ? 's' : ''} — every device sees them now.`, 'success');
      } else if (result.reason) {
        showToast(result.reason, 'error', 9000);
      }
      await loadData();
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveItem = async () => {
    if (!editingItem) return;
    const name = editingItem.name.trim();

    if (!name) {
      showToast('Please enter an item name', 'warning');
      return;
    }

    // A pasted data URL (or an over-long link) cannot fit the cloud's
    // varchar(500) `image_url`, so it is kept as a device-local image instead
    // of silently breaking the next menu sync.
    const rawUrl = String(editingItem.imageUrl || '').trim();
    const urlIsRemoteSafe = rawUrl.length <= MAX_REMOTE_IMAGE_URL_LENGTH && !/^data:/i.test(rawUrl);

    const savedItem = {
      ...editingItem,
      description: String(editingItem.description || '').trim().slice(0, 280),
      imageUrl: urlIsRemoteSafe ? rawUrl : '',
      imageData: urlIsRemoteSafe
        ? String(editingItem.imageData || '')
        : (String(editingItem.imageData || '') || rawUrl),
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
      showToast('Item created successfully', 'success');
    } else {
      await db.menuItems.put(savedItem);
      showToast('Item updated successfully', 'success');
    }

    // The upload at pick time may have been refused before the cloud session
    // was ready; saving is a natural second attempt.
    if (hasUnpublishedImage(savedItem)) {
      const retry = await publishPendingMenuImages();
      setPendingPhotos(retry.pending);
      setPublishError(retry.pending > 0 ? retry.reason : '');
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

  const handleEditCategoryClick = (cat: MenuCategory) => {
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
      showToast('Category created', 'success');
    } else {
      await db.menuCategories.put(savedCategory);
      showToast('Category updated', 'success');
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
          transition: transform, opacity, background-color, border-color, color, box-shadow 0.2s;
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
          transition: transform, opacity, background-color, border-color, color, box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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
          background: rgba(var(--color-success-rgb), 0.9);
          color: #fff;
        }
        .dish-type-badge.nonveg {
          background: rgba(var(--color-danger-rgb), 0.9);
          color: #fff;
        }

        /* A photo that has not reached Supabase yet. Without this the item looks
           updated everywhere while a second device still shows the old dish. */
        .dish-photo-pending {
          position: absolute;
          bottom: 10px;
          left: 10px;
          right: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-size: 9px;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          background: rgba(var(--color-warning-rgb), 0.92);
          color: var(--panel-ink-warm);
          border: 1px solid rgba(0, 0, 0, 0.12);
          cursor: help;
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
          transition: transform, opacity, background-color, border-color, color, box-shadow 0.2s;
        }
        .btn-avail-toggle:hover {
          background: var(--color-primary);
          border-color: transparent;
        }
        .btn-avail-toggle.soldout {
          color: var(--color-danger);
          background: rgba(var(--color-danger-rgb), 0.15);
          border-color: rgba(var(--color-danger-rgb), 0.35);
        }

        .category-card {
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: transform, opacity, background-color, border-color, color, box-shadow 0.2s;
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

            {/* Photos that never reached the cloud. Without this the menu looks
                correct on the device that took the picture and stays unchanged
                on the storefront and every other till, with nothing to say so
                and no way to retry. */}
            {pendingPhotos > 0 && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px',
                padding: '12px 16px', borderRadius: 'var(--radius-md)',
                background: 'rgba(var(--color-warning-rgb), 0.10)',
                border: '1px solid rgba(var(--color-warning-rgb), 0.35)'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '20px', color: 'var(--color-warning)' }}>cloud_off</span>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <strong style={{ display: 'block', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {pendingPhotos} dish photo{pendingPhotos > 1 ? 's are' : ' is'} only on this device
                  </strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {publishError || 'Customers and other tills still see the old picture until these are published.'}
                  </span>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handlePublishPhotos}
                  disabled={publishing}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {publishing ? 'Publishing…' : 'Publish now'}
                </button>
              </div>
            )}

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
                  
                  const resolvedImg = menuItemImageSource(item) || defaultImgMap[(catName || '').toLowerCase()] || '/assets/dish-starters.jpg';
                  const photoPending = hasUnpublishedImage(item);

                  return (
                    <div key={item.id} className="dish-card">
                      {/* Thumbnail Container */}
                      <div className="dish-thumbnail-container">
                        <img src={resolvedImg} className="dish-thumbnail" alt={item.name} />
                        
                        <span className={`dish-type-badge ${vegClass}`}>
                          {vegLabel}
                        </span>

                        {photoPending && (
                          <span
                            className="dish-photo-pending"
                            title="This photo is only on this device. It publishes automatically once you are signed in to the cloud as a manager or owner."
                          >
                            <span className="material-symbols-rounded" style={{ fontSize: '13px' }}>cloud_off</span>
                            This device only
                          </span>
                        )}

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
                              style={{ width: '28px', height: '28px', minWidth: '28px', minHeight: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--color-danger-rgb),0.06)', color: 'var(--alert-red)', border: '1px solid rgba(var(--color-danger-rgb),0.2)' }}
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
                          background: 'rgba(var(--color-primary-rgb), 0.06)',
                          color: 'var(--color-primary)',
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1rem',
                          border: '1px solid rgba(var(--color-primary-rgb),0.2)'
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
                          <button onClick={() => handleDeleteCategoryClick(cat.id!)} className="btn btn-sm" style={{ padding: '4px 10px', height: '30px', background: 'rgba(var(--color-danger-rgb),0.06)', color: 'var(--alert-red)', border: '1px solid rgba(var(--color-danger-rgb),0.2)' }}>Delete</button>
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

              <div className="input-group">
                <label htmlFor="item-description" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Description — shown to customers under the dish name
                </label>
                <textarea
                  id="item-description"
                  className="input"
                  rows={2}
                  maxLength={280}
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="e.g. Crispy fries tossed with our signature masala blend"
                  style={{ resize: 'vertical', lineHeight: 1.45, padding: '10px 12px' }}
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
                <label htmlFor="item-image-file" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Dish Image — any photo, resized automatically
                </label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <img
                    id="item-image-preview"
                    src={menuItemImageSource(editingItem) || defaultImgMap[(categories.find(c => c.id === Number(editingItem.categoryId))?.name || '').toLowerCase()] || '/assets/dish-starters.jpg'}
                    style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border-glass)', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}
                    alt="Preview"
                  />
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="file"
                      id="item-image-file"
                      onChange={handleItemImageUpload}
                      accept="image/*"
                      disabled={imageUploading}
                      className="input"
                      style={{ padding: '6px', fontSize: '11px', height: 'auto' }}
                    />
                    {imageUploading && (
                      <div className="loading-spinner" style={{ position: 'absolute', right: '12px', top: '10px', width: '16px', height: '16px', borderWidth: '2px' }}></div>
                    )}
                  </div>
                  {(editingItem.imageUrl || editingItem.imageData) && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleRemoveItemImage}
                      disabled={imageUploading}
                      title="Remove image"
                      style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 700 }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>delete</span>
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  id="item-image-url"
                  className="input"
                  value={editingItem.imageUrl || ''}
                  onChange={(e) => handleImageUrlChange(e.target.value)}
                  placeholder="…or paste an image link (https://…)"
                  style={{ marginTop: '8px', fontSize: '11px' }}
                />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {imageUploading
                    ? 'Optimising and uploading…'
                    : editingItem.imageData
                      ? 'Stored on this device only — sign in to the cloud to share it with every terminal.'
                      : 'Large photos are compressed to about 400 KB before upload.'}
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="item-veg" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Dietary Type</label>
                  <select
                    id="item-veg"
                    className="input"
                    value={String(Number(editingItem.isVeg))}
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
                    value={String(Number(editingItem.isAvailable))}
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

              {/* Paid extras. Priced by the server at checkout, so what is set
                  here is what a customer is actually charged. */}
              <div className="input-group">
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Add-ons — optional paid extras for this dish
                </label>

                {!editingItem.id ? (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Save the dish first, then reopen it to add extras.
                  </p>
                ) : (
                  <>
                    {itemAddons.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                        {itemAddons.map(addon => (
                          <div key={addon.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{addon.name}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>₹</span>
                            <input
                              type="number"
                              className="input"
                              aria-label={`Price for ${addon.name}`}
                              value={addon.price}
                              onChange={(e) => handleAddonPriceChange(addon.id, Number(e.target.value))}
                              style={{ width: '90px', fontWeight: 700 }}
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => handleRemoveAddon(addon.id)}
                              title={`Remove ${addon.name}`}
                              style={{ width: '32px', height: '32px', minWidth: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--color-danger-rgb),0.06)', color: 'var(--alert-red)', border: '1px solid rgba(var(--color-danger-rgb),0.2)' }}
                            >
                              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="input"
                        aria-label="New add-on name"
                        placeholder="e.g. Extra Cheese"
                        value={newAddonName}
                        maxLength={60}
                        onChange={(e) => setNewAddonName(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        className="input"
                        aria-label="New add-on price"
                        placeholder="₹0"
                        value={newAddonPrice}
                        onChange={(e) => setNewAddonPrice(e.target.value)}
                        style={{ width: '100px', fontWeight: 700 }}
                      />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddAddon} style={{ whiteSpace: 'nowrap' }}>
                        Add
                      </button>
                    </div>
                  </>
                )}
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
                    value={String(Number(editingCategory.isActive))}
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
