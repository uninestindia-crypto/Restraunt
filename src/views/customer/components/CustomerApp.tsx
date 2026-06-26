// @ts-nocheck
import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { db, getCategories, getItemsByCategory, createOrder, getNextOrderNumber, getSetting, generateLocalUuid } from '../../../db/database';
import { globalStore } from '../../../store/Store';
import { formatCurrency, playSound, vibrateDevice, showToast, parseOrderItems, escapeHtml } from '../../../utils/helpers';
import { MenuItem } from './MenuItem';
import { CategorySlider } from './CategorySlider';
import { CartDrawer } from './CartDrawer';
import { OrderSuccessTele } from './OrderSuccessTele';
import { ItemDetailDrawer } from './ItemDetailDrawer';
import { LoyaltyDrawer } from './LoyaltyDrawer';
import { getCurrentCoordinates, reverseGeocode, autocompleteAddress } from '../../../services/geocoding';

const PHONE_RE = /^[6-9]\d{9}$/;

export function CustomerApp({ app }) {
  // Navigation & View states
  const [state, setState] = useState('menu'); // 'menu' | 'cart' | 'checkout' | 'success'
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [items, setItems] = useState([]);
  const [menuByCategory, setMenuByCategory] = useState(new Map());
  const [tables, setTables] = useState([]);
  const [detectedTable, setDetectedTable] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState('');
  
  // Checkout & Customer states
  const [orderType, setOrderType] = useState('delivery');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('upi');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLandmark, setDeliveryLandmark] = useState('');
  const [loggedInCustomer, setLoggedInCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [placedOrder, setPlacedOrder] = useState(null);

  // Geolocation & Autocomplete states
  const [deliveryCoordinates, setDeliveryCoordinates] = useState({ latitude: null, longitude: null });
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [locating, setLocating] = useState(false);

  // Card payment fields
  const [cardNum, setCardNum] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Drawers
  const [activeDetailItem, setActiveDetailItem] = useState(null);
  const [showLoyaltyDrawer, setShowLoyaltyDrawer] = useState(false);

  // Centralized Store Binding
  const [cart, setCart] = useState(globalStore.state.cart);
  const [storeSettings, setStoreSettings] = useState({
    name: 'The Taste',
    tagline: 'Fast Food & Chinese',
    phone: '',
    address: ''
  });

  // Polling / WebSocket channels for telemetry
  const statusChannelRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const autocompleteTimerRef = useRef(null);

  // Handlers for Geolocation & Autocomplete
  const handleLocateMe = async () => {
    setLocating(true);
    showToast('Requesting device GPS location...', 'info');
    try {
      const coords = await getCurrentCoordinates();
      showToast('Coordinates locked. Reverse geocoding...', 'info');
      const geocoded = await reverseGeocode(coords.latitude, coords.longitude);
      setDeliveryAddress(geocoded.address);
      setDeliveryCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
      playSound(900, 100);
      vibrateDevice([40, 20, 40]);
      showToast('Delivery location resolved!', 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to detect location', 'error');
    } finally {
      setLocating(false);
    }
  };

  const handleAddressInputChange = (value) => {
    setDeliveryAddress(value);
    
    // Clear any pending timers
    if (autocompleteTimerRef.current) {
      clearTimeout(autocompleteTimerRef.current);
    }

    if (value.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }

    // Debounce autocomplete request to 400ms to respect rate limits
    autocompleteTimerRef.current = setTimeout(async () => {
      try {
        const results = await autocompleteAddress(value);
        setAddressSuggestions(results);
      } catch (err) {
        console.warn('[Autocomplete] Failed to fetch suggestions:', err);
      }
    }, 400);
  };

  const handleSelectSuggestion = (suggestion) => {
    setDeliveryAddress(suggestion.description);
    setDeliveryCoordinates({ latitude: suggestion.lat, longitude: suggestion.lon });
    setAddressSuggestions([]);
    playSound(700, 80);
    showToast('Delivery address selected!', 'success');
  };

  useEffect(() => {
    // Subscribe to global store changes
    const unsubscribe = globalStore.subscribe(() => {
      setCart(globalStore.state.cart);
    });

    // Custom event to switch state from drawers
    const handleSwitchState = (e) => {
      if (e.detail?.state) {
        setState(e.detail.state);
      }
    };
    window.addEventListener('switch-store-state', handleSwitchState);

    // Initial loading
    loadData();

    return () => {
      unsubscribe();
      window.removeEventListener('switch-store-state', handleSwitchState);
      cleanupTelemetry();
    };
  }, []);

  const cleanupTelemetry = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (statusChannelRef.current) {
      statusChannelRef.current.unsubscribe();
      statusChannelRef.current = null;
    }
  };

  const loadData = async () => {
    // ── Multi-Tenant Store ID Detection ──────────────────────
    const [, queryString = ''] = (window.location.hash || '').split('?');
    const urlParams = new URLSearchParams(queryString);
    const storeIdParam = urlParams.get('store_id');
    const prevStoreId = localStorage.getItem('store_id') || 'the-taste';
    const storeId = storeIdParam || prevStoreId;

    if (storeIdParam && prevStoreId !== storeIdParam) {
      localStorage.setItem('store_id', storeIdParam);
      console.log(`[Storefront] Switched store_id from '${prevStoreId}' to '${storeIdParam}'. Purging local menu cache.`);
      await Promise.all([
        db.menuCategories.clear(),
        db.menuItems.clear()
      ]);
    }

    const [name, tagline, phone, address] = await Promise.all([
      getSetting('restaurantName'),
      getSetting('restaurantTagline'),
      getSetting('restaurantPhone'),
      getSetting('restaurantAddress')
    ]);

    const resolvedSettings = {
      name: storeId !== 'the-taste' ? storeId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : (name || 'The Taste'),
      tagline: storeId !== 'the-taste' ? 'Fresh & Delicious Online Store' : (tagline || 'Fast Food & Chinese'),
      phone: phone || '',
      address: address || ''
    };
    setStoreSettings(resolvedSettings);

    // Load active customer login info
    try {
      const { authService } = await import('../../../services/auth');
      const current = authService.getCurrentStaff();
      if (current && current.role === 'customer') {
        setLoggedInCustomer(current);
        const profile = await db.customers.where('authUserId').equals(current.cloudUserId).first();
        if (profile) {
          setCustomerName(profile.name);
          setCustomerPhone(profile.phone || '');
        } else {
          setCustomerName(current.name);
        }
      }
    } catch (e) {
      console.warn('[CustomerView] Failed to retrieve customer auth state:', e);
    }

    // ── Online Menu Hydration from Cloud ──────────────────────
    if (navigator.onLine) {
      try {
        const { getSupabaseClient } = await import('../../../services/supabaseClient');
        const supabase = await getSupabaseClient();
        if (supabase) {
          const { data: cloudCats } = await supabase
            .from('menu_categories')
            .select('*')
            .eq('store_id', storeId)
            .eq('is_active', true)
            .order('sort_order');

          if (cloudCats && cloudCats.length > 0) {
            const { mapCategoryToLocal } = await import('../../../services/sync');
            const localCats = cloudCats.map(mapCategoryToLocal);
            await db.transaction('rw', db.menuCategories, async () => {
              await db.menuCategories.clear();
              for (const c of localCats) await db.menuCategories.put(c);
            });
          }

          const { data: cloudItems } = await supabase
            .from('menu_items')
            .select('*')
            .eq('store_id', storeId)
            .eq('is_available', true)
            .order('sort_order');

          if (cloudItems && cloudItems.length > 0) {
            const { mapItemToLocal } = await import('../../../services/sync');
            const localItems = cloudItems.map(mapItemToLocal);
            await db.transaction('rw', db.menuItems, async () => {
              await db.menuItems.clear();
              for (const i of localItems) await db.menuItems.put(i);
            });
          }
        }
      } catch (err) {
        console.warn('[CustomerView] Direct cloud menu hydration failed. Falling back to local storage:', err);
      }
    }

    const loadedCats = await getCategories();
    setCategories(loadedCats);

    const tablesStore = db.table('tables');
    const loadedTables = await tablesStore.toArray();
    setTables(loadedTables);

    // Table detection
    const tableParam = urlParams.get('table');
    let detTable = null;
    if (tableParam) {
      const numeric = parseInt(tableParam, 10);
      if (!Number.isNaN(numeric)) {
        detTable = await db.table('tables').where('number').equals(numeric).first();
      } else {
        detTable = await db.table('tables').where('number').equals(tableParam).first();
      }
    }
    
    if (detTable) {
      setDetectedTable(detTable);
      setOrderType('dinein');
      setSelectedTableId(String(detTable.id));
    }

    const map = new Map();
    for (const category of loadedCats) {
      map.set(category.id, await getItemsByCategory(category.id));
    }
    setMenuByCategory(map);

    if (loadedCats.length) {
      setActiveCategoryId(loadedCats[0].id);
      setItems(map.get(loadedCats[0].id) || []);
    }
  };

  useEffect(() => {
    if (activeCategoryId) {
      const activeItems = menuByCategory.get(activeCategoryId) || [];
      setItems(activeItems);
    }
  }, [activeCategoryId, menuByCategory]);

  const getFilteredItems = () => {
    if (!searchQuery || !searchQuery.trim()) {
      return items;
    }
    const query = searchQuery.toLowerCase().trim();
    const results = [];
    for (const [catId, catItems] of menuByCategory.entries()) {
      for (const item of catItems) {
        const matchesName = item.name && item.name.toLowerCase().includes(query);
        const desc = item.description || '';
        const matchesDesc = desc.toLowerCase().includes(query);
        if (matchesName || matchesDesc) {
          if (!results.some(r => r.id === item.id)) {
            results.push(item);
          }
        }
      }
    }
    return results;
  };

  const getFeaturedItems = () => {
    const all = categories.flatMap(category => menuByCategory.get(category.id) || []);
    const names = ['Steamed Veg Momos', 'Veg Hakka Noodles', 'Chicken Hakka Noodles', 'Cold Coffee', 'Chilli Paneer Dry', 'Chocolate Lava Cake'];
    const featured = names.map(name => all.find(item => item.name === name)).filter(Boolean);
    return featured.length ? featured.slice(0, 6) : all.slice(0, 6);
  };

  const handleOpenDetails = (item) => {
    playSound(600, 70);
    vibrateDevice([15]);
    setActiveDetailItem(item);
  };

  const handleCloseDetails = () => {
    setActiveDetailItem(null);
  };

  const handleAddToCartFromDrawer = ({ item, qty, spicyLevel, modifiers, customNotes, price }) => {
    let consolidatedNotes = `Spicy: ${spicyLevel}`;
    if (modifiers.length > 0) consolidatedNotes += ` | Mods: ${modifiers.join(', ')}`;
    if (customNotes) consolidatedNotes += ` | Note: ${customNotes}`;

    const currentCart = [...globalStore.state.cart];
    const existingIndex = currentCart.findIndex(ci => ci.itemId === item.id && ci.notes === consolidatedNotes);
    if (existingIndex !== -1) {
      currentCart[existingIndex].quantity += qty;
      globalStore.updateState({ cart: currentCart });
    } else {
      globalStore.addToCart({
        ...item,
        price
      }, qty, consolidatedNotes);
    }

    playSound(900, 100);
    vibrateDevice([40, 20, 40]);
    showToast(`${item.name} added to cart!`, 'success');
    setActiveDetailItem(null);
  };

  const handleShowLogin = async () => {
    playSound(700, 80);
    const appEl = document.getElementById('app');
    const { LoginScreen } = await import('../../../components/LoginScreen');
    const login = new LoginScreen(async (staff) => {
      // Re-fetch login state
      await loadData();
    }, { mode: 'customer' });
    login.render(appEl);
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      playSound(600, 80);
      const { authService } = await import('../../../services/auth');
      authService.logout();
      setLoggedInCustomer(null);
      setCustomerName('');
      setCustomerPhone('');
      await loadData();
    }
  };

  const getOrderTypeLabel = () => {
    if (detectedTable) return `Dine-In Table ${detectedTable.number}`;
    if (orderType === 'delivery') return 'Home Delivery Order';
    if (orderType === 'takeaway') return 'Pickup Order';
    const table = tables.find(t => String(t.id) === String(selectedTableId));
    return `Dine-In Order${table ? ` Table ${table.number}` : ''}`;
  };

  // Submit Order logic
  const handleValidateAndPlaceOrder = () => {
    if (!customerName) {
      showToast('Please enter your name', 'warning');
      return;
    }
    if (!PHONE_RE.test(customerPhone)) {
      showToast('Please enter a valid 10-digit mobile number', 'warning');
      return;
    }
    if (orderType === 'delivery' && !deliveryAddress) {
      showToast('Please enter your delivery address', 'warning');
      return;
    }
    if (orderType === 'dinein' && !detectedTable && !selectedTableId) {
      showToast('Please select your table number', 'warning');
      return;
    }
    if (selectedPaymentMethod === 'card') {
      const sanitizedCard = cardNum.replace(/\s/g, '');
      if (!sanitizedCard || sanitizedCard.length < 16) {
        showToast('Please enter a valid 16-digit card number', 'warning');
        return;
      }
      if (!cardExpiry || !/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        showToast('Please enter expiry in MM/YY format', 'warning');
        return;
      }
      if (!cardCvv || cardCvv.length < 3) {
        showToast('Please enter a valid CVV', 'warning');
        return;
      }
    }
    placeOrder();
  };

  const placeOrder = async () => {
    const isCard = selectedPaymentMethod === 'card';
    const submitBtn = document.getElementById('btn-submit-self-order');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Placing Order...';
    }

    try {
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const gstPercent = parseFloat(await getSetting('gstPercent') || '5');
      const tax = subtotal * (gstPercent / 100);
      const deliveryFee = 0;
      const total = subtotal + tax + deliveryFee;
      const type = detectedTable ? 'dinein' : orderType;
      const tableId = detectedTable ? detectedTable.id : (type === 'dinein' ? parseInt(selectedTableId, 10) : null);
      const now = new Date().toISOString();
      const clientOrderId = generateLocalUuid();

      const orderData = {
        clientOrderId,
        idempotencyKey: clientOrderId,
        orderNumber: await getNextOrderNumber(),
        type,
        channel: type === 'dinein' && detectedTable ? 'qr' : 'online',
        source: type === 'dinein' && detectedTable ? 'qr' : 'online',
        status: 'confirmed',
        items: cart,
        subtotal,
        tax,
        taxPercent: gstPercent,
        deliveryFee,
        total,
        paymentMethod: selectedPaymentMethod,
        paymentStatus: isCard ? 'unpaid' : (selectedPaymentMethod === 'upi' ? 'pending' : 'unpaid'),
        paymentReference: '',
        paymentVerifiedAt: null,
        customerName,
        customerPhone,
        deliveryAddress: type === 'delivery' ? deliveryAddress : '',
        deliveryLandmark: type === 'delivery' ? deliveryLandmark : '',
        deliveryNotes: type === 'delivery' ? (deliveryLandmark + (deliveryCoordinates.latitude && deliveryCoordinates.longitude ? ` [GPS: ${deliveryCoordinates.latitude}, ${deliveryCoordinates.longitude}]` : '')) : '',
        deliveryStatus: type === 'delivery' ? 'pending' : 'none',
        deliveryLatitude: type === 'delivery' ? deliveryCoordinates.latitude : null,
        deliveryLongitude: type === 'delivery' ? deliveryCoordinates.longitude : null,
        tableId,
        createdAt: now,
        updatedAt: now,
        requiresServerValidation: true,
        validationStatus: 'pending',
        syncStatus: 'pending',
        isSynced: 0
      };

      const { submitPublicOrder } = await import('../../../services/publicOrders');
      const remoteSubmit = await submitPublicOrder(orderData);
      const finalOrderData = remoteSubmit.accepted ? remoteSubmit.order : {
        ...orderData,
        lastSyncError: remoteSubmit.message || '',
        validationStatus: 'pending',
        requiresServerValidation: true
      };

      const order = await createOrder(finalOrderData, { skipSync: remoteSubmit.accepted });
      setPlacedOrder(order);

      if (!remoteSubmit.accepted) {
        showToast('Order saved locally. It will sync when online validation is available.', 'warning', 5000);
      }

      if (tableId && type === 'dinein') {
        await db.table('tables').update(tableId, { status: 'occupied', isSynced: 0 });
      }

      const afterOrderCreated = async (ord) => {
        try {
          const { deductInventoryForOrder } = await import('../../../services/inventoryHook');
          await deductInventoryForOrder(parseOrderItems(ord.items));
        } catch (error) {
          console.error('Inventory deduction failed:', error);
        }

        try {
          const existing = await db.customers.where('phone').equals(ord.customerPhone).first();
          const points = Math.floor(ord.total / 10);
          if (existing) {
            const totalSpent = (existing.totalSpent || 0) + ord.total;
            await db.customers.update(existing.id, {
              name: ord.customerName,
              totalSpent,
              visitCount: (existing.visitCount || 0) + 1,
              loyaltyPoints: (existing.loyaltyPoints || 0) + points,
              tier: totalSpent >= 5000 ? 'platinum' : totalSpent >= 2000 ? 'gold' : totalSpent >= 500 ? 'silver' : 'bronze',
              lastVisit: new Date().toISOString(),
              isSynced: 0
            });
          } else {
            await db.customers.add({
              phone: ord.customerPhone,
              name: ord.customerName,
              totalSpent: ord.total,
              visitCount: 1,
              loyaltyPoints: points,
              tier: ord.total >= 500 ? 'silver' : 'bronze',
              lastVisit: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              isSynced: 0,
              _platform: 'nextgenos'
            });
          }
        } catch (error) {
          console.error('Loyalty update failed:', error);
        }
      };

      if (isCard) {
        showStripeCheckoutModal(
          order,
          clientOrderId,
          async () => {
            if (navigator.onLine) {
              const { getSupabaseClient } = await import('../../../services/supabaseClient');
              const supabase = await getSupabaseClient();
              if (supabase) {
                const paymentIntentId = `pi_mock_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
                const { data, error } = await supabase.rpc('emulate_stripe_webhook', {
                  order_client_id: clientOrderId,
                  payment_intent_id: paymentIntentId,
                  status: 'succeeded'
                });
                if (error) {
                  throw new Error('Payment webhook processing failed: ' + error.message);
                }
              }
            } else {
              throw new Error('Device is offline. Stripe payment cannot be finalized.');
            }
            
            const updated = await db.orders.where('clientOrderId').equals(clientOrderId).first();
            if (updated) {
              setPlacedOrder(updated);
            }

            await afterOrderCreated(order);
            setState('success');
            playSound(900, 90);
            vibrateDevice([50, 30, 50]);
          },
          () => {
            showToast('Payment cancelled. Please try again.', 'info');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = 'Place Order';
            }
          }
        );
      } else {
        await afterOrderCreated(order);
        setState('success');
        playSound(900, 90);
        vibrateDevice([50, 30, 50]);
      }
    } catch (error) {
      console.error('Failed to submit self-order:', error);
      showToast('Order placement failed: ' + error.message, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Place Order';
      }
    }
  };

  const showStripeCheckoutModal = (order, clientOrderId, onComplete, onCancel) => {
    const modal = document.createElement('div');
    modal.className = 'stripe-modal-overlay';
    modal.style = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 16px;
    `;

    modal.innerHTML = `
      <div style="
        background: #fff; border-radius: 12px; width: 100%; max-width: 420px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3); overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #30313d;
      ">
        <div style="background: #f8f9fa; padding: 20px; border-bottom: 1px solid #e3e6e8; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg viewBox="0 0 40 16" style="width:38px; height:16px; fill:#635bff;"><path d="M4.09 10.37h1.49v4.29c0 .7.38.93 1.07.93.36 0 .66-.05.81-.12v-1.12a2.3 2.3 0 0 1-.36.03c-.28 0-.44-.08-.44-.45v-3.56H8.2V8.98H6.66V6.63L5.17 7.1v1.88H4.09v1.39zm4.74 3.73c0 .87.7 1.34 1.83 1.34.61 0 1.1-.1 1.38-.24v-1.18c-.28.11-.64.19-1.07.19-.52 0-.8-.17-.8-.58v-1.89h1.83V10.4h-1.83V8.98h-1.34v4.54l-.02.58zm6.54-6.42a2.6 2.6 0 0 0-1.88.75V3.88l-1.49.46v11.12h1.49V10.9a2.44 2.44 0 0 1 1.94-.85c1.23 0 1.91.86 1.91 2.31v3.1h1.49v-3.32c0-2.22-1.17-3.44-3.46-3.44zm6.06-1.57h1.49V4.62h-1.49v1.49zm0 2.27h1.49v9.12h-1.49V9.11zm3.87 0h1.49v1.07c.36-.67 1.08-1.25 2.1-1.25 1.7 0 2.59 1.15 2.59 3.03v6.27H33.4V12.1c0-1.14-.49-1.63-1.34-1.63-.58 0-1.08.3-1.34.78v4.21h-1.49V9.11zm9.35 3.32c0-2.12 1.38-3.32 3.13-3.32 1.82 0 2.92 1.25 2.92 3.25V12.9h-4.54c.05.95.73 1.39 1.63 1.39a3.2 3.2 0 0 0 1.38-.28v1.17c-.36.14-.9.24-1.58.24-1.8 0-2.94-1.17-2.94-3.32zm4.56-1.06c-.05-.73-.5-1.12-1.36-1.12-.76 0-1.23.4-1.32 1.12h2.68z"/></svg>
            <span style="font-size:12px; color:#6a737d; font-weight:600;">Secure Checkout</span>
          </div>
          <button class="btn-stripe-close" style="background:transparent; border:none; color:#a3acb9; cursor:pointer; font-size:16px; padding:4px;"><span class="material-symbols-rounded" style="font-size:16px;">close</span></button>
        </div>
        <div style="padding: 24px;">
          <div style="margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size: 12px; color: #6a737d; font-weight: 500; display:block;">ORDER #${order.orderNumber}</span>
              <strong style="font-size: 15px; color: #1a1b25;">The Taste Storefront</strong>
            </div>
            <strong style="font-size: 20px; color: #1a1b25;">${formatCurrency(order.total)}</strong>
          </div>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label style="font-size: 11px; font-weight: 600; color: #4f5b66;">Card Number</label>
              <div style="border: 1px solid #e3e6e8; border-radius: 6px; padding: 10px 12px; display: flex; align-items: center; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <span class="material-symbols-rounded" style="font-size:18px; color:#a3acb9; margin-right:8px;">credit_card</span>
                <input type="text" id="stripe-card-num" value="4242 4242 4242 4242" style="border:none; outline:none; width:100%; font-size:14px; font-family:monospace;" />
              </div>
            </div>
            <div style="display:flex; gap:12px;">
              <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                <label style="font-size: 11px; font-weight: 600; color: #4f5b66;">Expiration</label>
                <input type="text" id="stripe-card-expiry" value="12/28" style="border: 1px solid #e3e6e8; border-radius: 6px; padding: 10px 12px; font-size:14px; font-family:monospace; outline:none;" />
              </div>
              <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                <label style="font-size: 11px; font-weight: 600; color: #4f5b66;">CVC</label>
                <input type="password" id="stripe-card-cvc" value="123" style="border: 1px solid #e3e6e8; border-radius: 6px; padding: 10px 12px; font-size:14px; font-family:monospace; outline:none;" />
              </div>
            </div>
            <button id="stripe-pay-btn" style="
              background: #635bff; color: #fff; border: none; border-radius: 6px; padding: 12px;
              font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 16px;
              display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(99, 91, 255, 0.2);
            ">
              Pay ${formatCurrency(order.total)}
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.btn-stripe-close');
    const payBtn = modal.querySelector('#stripe-pay-btn');

    closeBtn.addEventListener('click', () => {
      modal.remove();
      onCancel();
    });

    payBtn.addEventListener('click', async () => {
      payBtn.disabled = true;
      payBtn.innerHTML = `Processing...`;
      try {
        await onComplete();
        modal.remove();
      } catch (err) {
        payBtn.disabled = false;
        payBtn.innerHTML = `Pay ${formatCurrency(order.total)}`;
        showToast('Stripe payment failed: ' + err.message, 'error');
      }
    });
  };

  const handleOrderAgain = () => {
    globalStore.updateState({ cart: [] });
    setPlacedOrder(null);
    setState('menu');
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Dynamic values
  const modeStr = detectedTable ? `Table ${detectedTable.number}` : 'Order online from home';
  const displayAddress = storeSettings.address || 'Fresh Indo-Chinese comfort food, packed hot for your table or home.';

  // Main UI Render depending on state route
  return (
    <div className="storefront-root">
      {state === 'menu' && (
        <div className="storefront-shell">
          {/* Hero Section */}
          <section className="store-hero" aria-label="The Taste storefront">
            <div className="store-hero-bg" aria-hidden="true"></div>
            <header className="store-nav">
              <a className="store-brand" href="#/self-order">
                <img src="/assets/the-taste-logo.png" className="store-brand-mark" alt="The Taste Logo" style={{ objectFit: 'contain', padding: '2px', background: '#fff' }} />
                <div>THE TASTE</div>
              </a>
              <nav className="store-nav-links" aria-label="Public navigation" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <a href="#menu">Menu</a>
                {loggedInCustomer ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <a 
                      href="#loyalty" 
                      onClick={(e) => { e.preventDefault(); setShowLoyaltyDrawer(true); }}
                      style={{ color: '#D4AF37', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>account_circle</span>
                      Hi, {loggedInCustomer.name.split(' ')[0]}
                    </a>
                    <button 
                      onClick={handleLogout}
                      className="store-logout-btn" 
                      type="button" 
                      title="Sign Out" 
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>logout</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <a 
                      href="#loyalty" 
                      onClick={(e) => { e.preventDefault(); setShowLoyaltyDrawer(true); }}
                      style={{ color: '#D4AF37', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>star</span>
                      Rewards
                    </a>
                    <button 
                      onClick={handleShowLogin}
                      className="store-login-btn" 
                      type="button" 
                      style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid #D4AF37', color: '#D4AF37', cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontWeight: 700, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>login</span>
                      Sign In
                    </button>
                  </div>
                )}
                <a href="/TheTaste.apk" download className="store-get-app-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#FF6B35', fontWeight: 700 }} title="Download Android App APK">
                  <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>android</span>Get App
                </a>
                <a href="#/pos" className="store-staff-link">Staff</a>
              </nav>
            </header>

            <div className="store-hero-content">
              <p className="store-kicker">{modeStr}</p>
              <h1>{storeSettings.name}</h1>
              <p className="store-hero-copy">{storeSettings.tagline} for delivery, pickup, and dine-in QR ordering. Freshly made, clearly priced, and ready for manual UPI or cash.</p>
              <div className="store-hero-actions">
                <a className="store-primary-action" href="#menu">
                  <span className="material-symbols-rounded" aria-hidden="true">restaurant_menu</span>
                  Order now
                </a>
                <button className="store-secondary-action" type="button" onClick={() => { setOrderType('takeaway'); document.getElementById('menu')?.scrollIntoView({ block: 'start' }); }}>
                  <span className="material-symbols-rounded" aria-hidden="true">shopping_bag</span>
                  Pickup
                </button>
              </div>
              <dl className="store-proof">
                <div><dt>30 min</dt><dd>Typical prep</dd></div>
                <div><dt>UPI</dt><dd>Manual verify</dd></div>
                <div><dt>COD</dt><dd>Cash accepted</dd></div>
              </dl>
            </div>
          </section>

          {/* Ordering Options Selector Band */}
          <section className="store-service-band" id="order-options" aria-label="Ordering options">
            <button className={`store-service-option ${orderType === 'delivery' ? 'is-active' : ''}`} onClick={() => setOrderType('delivery')} type="button">
              <span className="material-symbols-rounded" aria-hidden="true">local_shipping</span>
              <strong>Home delivery</strong>
              <small>Delivered by restaurant staff</small>
            </button>
            <button className={`store-service-option ${orderType === 'takeaway' ? 'is-active' : ''}`} onClick={() => setOrderType('takeaway')} type="button">
              <span className="material-symbols-rounded" aria-hidden="true">shopping_bag</span>
              <strong>Pickup</strong>
              <small>Order ahead and collect</small>
            </button>
            <button className={`store-service-option ${orderType === 'dinein' ? 'is-active' : ''}`} onClick={() => setOrderType('dinein')} type="button">
              <span className="material-symbols-rounded" aria-hidden="true">table_restaurant</span>
              <strong>{detectedTable ? `Table ${detectedTable.number}` : 'Dine-in QR'}</strong>
              <small>Order from your table</small>
            </button>
          </section>

          {/* Featured items */}
          <section className="store-section store-section-tight" aria-label="Highlights">
            <div className="store-section-head">
              <p>Popular right now</p>
              <h2>Fresh, fast, and built for home ordering</h2>
            </div>
            <div className="store-featured-grid">
              {getFeaturedItems().map(item => (
                <button key={item.id} className="store-featured-item" onClick={() => handleOpenDetails(item)} type="button">
                  <img src={item.imageUrl || '/assets/dish-starters.jpg'} alt="" width="640" height="420" loading="lazy" decoding="async" />
                  <span>{item.name}</span>
                  <strong>{formatCurrency(item.price)}</strong>
                </button>
              ))}
            </div>
          </section>

          {/* Menu Items Container */}
          <section className="store-section" id="menu" aria-label="Online menu">
            <div className="store-section-head store-menu-head">
              <div>
                <p>Order online</p>
                <h2>Choose your favorites</h2>
              </div>
              <div className="store-menu-note">{displayAddress}</div>
            </div>

            {/* Sticky Category and Search Filter */}
            <CategorySlider 
              categories={categories}
              activeCategoryId={activeCategoryId}
              onSelectCategory={setActiveCategoryId}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
            />

            <div className="store-menu-grid" style={{ marginTop: '24px' }}>
              {getFilteredItems().length === 0 ? (
                <div className="store-empty-state">
                  <span className="material-symbols-rounded" aria-hidden="true">restaurant_menu</span>
                  <p>No items found matching your search.</p>
                </div>
              ) : (
                getFilteredItems().map(item => (
                  <MenuItem 
                    key={item.id}
                    item={item}
                    categories={categories}
                    cart={cart}
                    onOpenDetails={handleOpenDetails}
                  />
                ))
              )}
            </div>
          </section>

          {/* Value Band */}
          <section className="store-info-band" aria-label="Payment and ordering details">
            <div>
              <span className="material-symbols-rounded" aria-hidden="true">qr_code_2</span>
              <strong>UPI orders stay pending</strong>
              <p>Staff verifies the payment reference before marking the order paid.</p>
            </div>
            <div>
              <span className="material-symbols-rounded" aria-hidden="true">payments</span>
              <strong>Cash and COD supported</strong>
              <p>Payment is collected at pickup or delivery and reconciled by staff.</p>
            </div>
            <div>
              <span className="material-symbols-rounded" aria-hidden="true">local_shipping</span>
              <strong>Delivery tracked in-house</strong>
              <p>Orders move from kitchen prep to assignment, out-for-delivery, and delivered.</p>
            </div>
          </section>

          {/* Cart floaty */}
          {cartCount > 0 && (
            <button 
              id="btn-view-cart" 
              className="store-floating-cart" 
              type="button" 
              onClick={() => { playSound(800, 80); setState('cart'); }}
              aria-label={`${cartCount} item${cartCount === 1 ? '' : 's'} in cart, total ${formatCurrency(total)}`}
            >
              <span>{cartCount} item{cartCount === 1 ? '' : 's'} in cart</span>
              <strong>{formatCurrency(total)}</strong>
            </button>
          )}
        </div>
      )}

      {state === 'cart' && (
        <CartDrawer 
          cart={cart}
          onBack={() => setState('menu')}
          onCheckout={() => setState('checkout')}
        />
      )}

      {state === 'checkout' && (
        <div className="store-checkout-shell">
          <header className="store-subheader">
            <button className="btn-icon btn-secondary" onClick={() => setState('cart')} type="button" aria-label="Go back">
              <span className="material-symbols-rounded" aria-hidden="true">arrow_back</span>
            </button>
            <a href="#/self-order" className="store-subheader-brand">
              <img src="/assets/the-taste-logo.png" className="store-brand-mark" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'contain', background: '#fff', marginRight: '4px' }} alt="Logo" />
              THE TASTE
            </a>
            <h2>Checkout</h2>
          </header>

          <main className="store-checkout-page" style={{ padding: '24px' }}>
            <div className="store-checkout-head" style={{ marginBottom: '24px' }}>
              <p>{getOrderTypeLabel()}</p>
              <h1>Almost there</h1>
            </div>

            {/* Loyalty login check */}
            {!loggedInCustomer ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <span>🔒 Sign in to autofill details and earn points!</span>
                <button className="btn btn-secondary btn-sm" onClick={handleShowLogin} type="button" style={{ padding: '4px 10px', fontSize: '0.7rem', borderColor: '#D4AF37', color: '#D4AF37', fontWeight: 700, flexShrink: 0 }}>Sign In</button>
              </div>
            ) : null}

            {/* Profile fields */}
            <section className="store-checkout-panel" style={{ marginBottom: '20px' }}>
              <h3>Contact details</h3>
              <div className="input-group store-input-group">
                <label className="store-field-label" htmlFor="self-name">Your name</label>
                <input type="text" id="self-name" className="input store-input" value={customerName} onInput={(e) => setCustomerName(e.target.value)} placeholder="Enter your name" />
              </div>
              <div className="input-group store-input-group" style={{ marginTop: '12px' }}>
                <label className="store-field-label" htmlFor="self-phone">Phone number</label>
                <input type="tel" id="self-phone" className="input store-input" value={customerPhone} onInput={(e) => setCustomerPhone(e.target.value)} placeholder="10-digit mobile number" />
              </div>
            </section>

            {/* Service selector */}
            {!detectedTable ? (
              <section className="store-checkout-panel" style={{ marginBottom: '20px' }}>
                <h3>How should we serve this order?</h3>
                <div className="store-option-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <button className={`store-choice-btn ${orderType === 'delivery' ? 'is-active' : ''}`} type="button" onClick={() => setOrderType('delivery')}>
                    <span className="material-symbols-rounded">local_shipping</span>
                    <span>Delivery</span>
                  </button>
                  <button className={`store-choice-btn ${orderType === 'takeaway' ? 'is-active' : ''}`} type="button" onClick={() => setOrderType('takeaway')}>
                    <span className="material-symbols-rounded">shopping_bag</span>
                    <span>Pickup</span>
                  </button>
                  <button className={`store-choice-btn ${orderType === 'dinein' ? 'is-active' : ''}`} type="button" onClick={() => setOrderType('dinein')}>
                    <span className="material-symbols-rounded">table_restaurant</span>
                    <span>Dine-in</span>
                  </button>
                </div>

                {orderType === 'delivery' && (
                  <div id="delivery-fields" className="store-conditional-fields" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="store-field-label" htmlFor="self-delivery-address" style={{ margin: 0 }}>Delivery address</label>
                      <button 
                        type="button" 
                        onClick={handleLocateMe} 
                        disabled={locating}
                        style={{
                          background: 'rgba(255, 94, 54, 0.1)',
                          border: '1px solid rgba(255, 94, 54, 0.25)',
                          color: 'var(--color-primary)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '4px 10px',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {locating ? (
                          <span className="spinner store-spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px', margin: 0 }}></span>
                        ) : (
                          <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>my_location</span>
                        )}
                        {locating ? 'Locating...' : 'Locate Me'}
                      </button>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <textarea 
                        id="self-delivery-address" 
                        className="input store-input" 
                        rows="3" 
                        value={deliveryAddress} 
                        onInput={(e) => handleAddressInputChange(e.target.value)} 
                        placeholder="House/flat, street, area"
                      ></textarea>

                      {addressSuggestions.length > 0 && (
                        <div 
                          className="store-address-suggestions"
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'rgba(15, 18, 20, 0.95)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid var(--border-glass)',
                            borderRadius: 'var(--radius-md)',
                            zIndex: 1000,
                            boxShadow: 'var(--shadow-xl)',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            marginTop: '4px'
                          }}
                        >
                          {addressSuggestions.map(s => (
                            <button
                              key={s.placeId}
                              type="button"
                              onClick={() => handleSelectSuggestion(s)}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                background: 'none',
                                border: 'none',
                                borderBottom: '1px solid var(--border-glass)',
                                textAlign: 'left',
                                color: 'var(--text-primary)',
                                fontSize: 'var(--text-sm)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'background 0.2s ease'
                              }}
                              onMouseEnter={(e) => e.target.style.background = 'rgba(255, 94, 54, 0.08)'}
                              onMouseLeave={(e) => e.target.style.background = 'none'}
                            >
                              <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)', fontSize: '18px', flexShrink: 0 }}>location_on</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="input-group store-input-group" style={{ marginTop: '12px' }}>
                      <label className="store-field-label" htmlFor="self-delivery-landmark">Landmark / delivery notes</label>
                      <input type="text" id="self-delivery-landmark" className="input store-input" value={deliveryLandmark} onInput={(e) => setDeliveryLandmark(e.target.value)} placeholder="Nearby landmark, gate code, etc." />
                    </div>
                  </div>
                )}

                {orderType === 'dinein' && (
                  <div id="table-fields" className="store-conditional-fields">
                    <label className="store-field-label" htmlFor="self-table-select">Table number</label>
                    <select id="self-table-select" className="input store-input" value={selectedTableId} onChange={(e) => setSelectedTableId(e.target.value)}>
                      <option value="">Select a table</option>
                      {tables.map(table => (
                        <option key={table.id} value={table.id}>Table {table.number} ({table.floorSection || 'Main'})</option>
                      ))}
                    </select>
                  </div>
                )}
              </section>
            ) : null}

            {/* Payment methods */}
            <section className="store-checkout-panel" style={{ marginBottom: '20px' }}>
              <h3>Payment</h3>
              <div className="store-option-grid three" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <button className={`store-choice-btn ${selectedPaymentMethod === 'upi' ? 'is-active' : ''}`} type="button" onClick={() => setSelectedPaymentMethod('upi')}>
                  <span className="material-symbols-rounded">qr_code_2</span>
                  <span>UPI QR</span>
                  <small>Staff verifies</small>
                </button>
                <button className={`store-choice-btn ${selectedPaymentMethod === 'card' ? 'is-active' : ''}`} type="button" onClick={() => setSelectedPaymentMethod('card')}>
                  <span className="material-symbols-rounded">credit_card</span>
                  <span>Online Card</span>
                  <small>Instant check</small>
                </button>
                <button className={`store-choice-btn ${selectedPaymentMethod === 'cash' ? 'is-active' : ''}`} type="button" onClick={() => setSelectedPaymentMethod('cash')}>
                  <span className="material-symbols-rounded">payments</span>
                  <span>Cash/COD</span>
                  <small>Pay later</small>
                </button>
              </div>

              {selectedPaymentMethod === 'card' && (
                <div id="card-fields" className="store-conditional-fields" style={{ marginTop: '14px' }}>
                  <div className="input-group store-input-group">
                    <label className="store-field-label" htmlFor="card-num">Credit/Debit Card Number</label>
                    <input type="text" id="card-num" className="input store-input" value={cardNum} onInput={(e) => setCardNum(e.target.value)} placeholder="4111 2222 3333 4444" />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <div style={{ flex: 1 }} className="input-group store-input-group">
                      <label className="store-field-label" htmlFor="card-expiry">Expiry Date</label>
                      <input type="text" id="card-expiry" className="input store-input" value={cardExpiry} onInput={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" />
                    </div>
                    <div style={{ flex: 1 }} className="input-group store-input-group">
                      <label className="store-field-label" htmlFor="card-cvv">CVV</label>
                      <input type="password" id="card-cvv" className="input store-input" value={cardCvv} onInput={(e) => setCardCvv(e.target.value)} placeholder="3-digit CVV" />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </main>

          <footer className="store-checkout-footer">
            <div>
              <span>Total payable</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
            <button 
              className="btn btn-primary btn-block btn-lg" 
              id="btn-submit-self-order" 
              type="button"
              onClick={handleValidateAndPlaceOrder}
            >
              <span className="material-symbols-rounded" aria-hidden="true">send_and_archive</span>
              Place Order
            </button>
          </footer>
        </div>
      )}

      {state === 'success' && placedOrder && (
        <OrderSuccessTele 
          order={placedOrder}
          onOrderAgain={handleOrderAgain}
        />
      )}

      {/* Drawers */}
      {activeDetailItem && (
        <ItemDetailDrawer 
          item={activeDetailItem}
          categories={categories}
          onClose={handleCloseDetails}
          onAddToCart={handleAddToCartFromDrawer}
        />
      )}

      {showLoyaltyDrawer && (
        <LoyaltyDrawer 
          loggedInCustomer={loggedInCustomer}
          customerPhone={customerPhone}
          customerName={customerName}
          onClose={() => setShowLoyaltyDrawer(false)}
          onShowLogin={handleShowLogin}
          onProfileLoaded={(name, phone) => {
            setCustomerName(name);
            setCustomerPhone(phone);
          }}
        />
      )}
    </div>
  );
}
