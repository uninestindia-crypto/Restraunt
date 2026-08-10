// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db, getCategories, getItemsByCategory, createOrder, getNextOrderNumber, getSetting, generateLocalUuid } from '../../../db/database';
import { globalStore } from '../../../store/Store';
import { formatCurrency, playSound, vibrateDevice, showToast, parseOrderItems, menuItemImageSource } from '../../../utils/helpers';
import { MenuItem } from './MenuItem';
import { CategorySlider } from './CategorySlider';
import { CartDrawer } from './CartDrawer';
import { OrderSuccessTele } from './OrderSuccessTele';
import { ItemDetailDrawer } from './ItemDetailDrawer';
import { LoyaltyDrawer } from './LoyaltyDrawer';
import { OffersPage, AboutPage, CateringPage, SupportPage, AccountPage } from './CustomerPages';
import { getCurrentCoordinates, reverseGeocode, autocompleteAddress } from '../../../services/geocoding';
import { STOREFRONT_DEFAULTS, STOREFRONT_SETTING_KEYS, resolveStorefrontCopy } from '../../../content/storefront';
import { buildCustomerFavoritesFromOrders, fetchCustomerOffers, injectCustomerStructuredData, RETENTION_PREFERENCES, syncCustomerFavorite } from '../../../services/customerPlatform';
import { startPublicMenuSync } from '../../../services/publicMenuSync';

const PHONE_RE = /^[6-9]\d{9}$/;
const CUSTOMER_PREFERENCE_OPTIONS = [
  { key: 'less_spice', label: 'Less spice', icon: 'local_fire_department' },
  { key: 'extra_sauce', label: 'Extra sauce', icon: 'ramen_dining' },
  { key: 'call_before_delivery', label: 'Call before delivery', icon: 'call' },
  { key: 'no_cutlery', label: 'No cutlery', icon: 'eco' },
  { key: 'reduced_motion', label: 'Reduced motion', icon: 'motion_photos_off' },
  { key: 'larger_text', label: 'Larger text', icon: 'format_size' },
  { key: 'high_contrast', label: 'High contrast', icon: 'contrast' },
];

const CUSTOMER_ROUTES = {
  home: { page: 'home', label: 'Home', icon: 'home', path: '#/self-order' },
  menu: { page: 'home', label: 'Menu', icon: 'restaurant_menu', path: '#/self-order?page=menu' },
  offers: { page: 'offers', label: 'Offers', icon: 'local_offer', path: '#/self-order?page=offers' },
  account: { page: 'account', label: 'Account', icon: 'person', path: '#/self-order?page=account' },
  support: { page: 'support', label: 'Help', icon: 'support_agent', path: '#/self-order?page=support' },
  about: { page: 'about', label: 'About', icon: 'info', path: '#/self-order?page=about' },
  catering: { page: 'catering', label: 'Catering', icon: 'celebration', path: '#/self-order?page=catering' },
};

function getCustomerRouteFromHash() {
  const [, queryString = ''] = (window.location.hash || '#/self-order').split('?');
  const params = new URLSearchParams(queryString);
  const page = params.get('page') || 'home';
  return CUSTOMER_ROUTES[page] ? page : 'home';
}

function CustomerShellNav({ activePage, cartCount, loggedInCustomer, onNavigate, onOpenCart, onSignIn, onLogout }) {
  const desktopRoutes = ['menu', 'offers', 'about', 'catering', 'support'];
  const mobileRoutes = ['home', 'menu', 'offers', 'account', 'support'];
  return (
    <>
      <header className="customer-shell-nav">
        <a className="store-brand" href="#/self-order" onClick={(e) => { e.preventDefault(); onNavigate('home'); }}>
          <img src="/assets/the-taste-logo.png" className="store-brand-mark" alt="The Taste Logo" style={{ objectFit: 'contain', padding: '2px', background: '#fff' }} />
          <div>THE TASTE</div>
        </a>
        <nav className="store-nav-links" aria-label="Customer navigation">
          {desktopRoutes.map(key => (
            <a key={key} href={CUSTOMER_ROUTES[key].path} className={activePage === CUSTOMER_ROUTES[key].page ? 'is-active' : ''} onClick={(e) => { e.preventDefault(); onNavigate(key); }}>
              {CUSTOMER_ROUTES[key].label}
            </a>
          ))}
          {loggedInCustomer ? (
            <button type="button" className="store-rewards-link store-nav-text-button" onClick={() => onNavigate('account')}>
              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>account_circle</span>
              Account
            </button>
          ) : (
            <button onClick={onSignIn} className="store-login-btn" type="button">
              <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>login</span>
              Sign In
            </button>
          )}
          {loggedInCustomer && (
            <button onClick={onLogout} className="store-logout-btn" type="button" title="Sign Out">
              <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>logout</span>
            </button>
          )}
        </nav>
      </header>
      <nav className="customer-bottom-nav" aria-label="Mobile customer navigation">
        {mobileRoutes.map(key => (
          <button key={key} type="button" className={activePage === CUSTOMER_ROUTES[key].page ? 'is-active' : ''} onClick={() => onNavigate(key)}>
            <span className="material-symbols-rounded" aria-hidden="true">{CUSTOMER_ROUTES[key].icon}</span>
            <small>{CUSTOMER_ROUTES[key].label}</small>
          </button>
        ))}
        <button type="button" className={cartCount ? 'has-cart' : ''} onClick={onOpenCart}>
          <span className="material-symbols-rounded" aria-hidden="true">shopping_bag</span>
          <small>Cart{cartCount ? ` ${cartCount}` : ''}</small>
        </button>
      </nav>
    </>
  );
}

/**
 * A guest's own contact details, kept on their own device.
 *
 * Someone who orders without signing in is identified only by the phone number
 * they typed, and that lived in React state alone — so reloading the page, or
 * simply coming back later to see what they ordered, left the app with no
 * phone number to match on and their order history came up empty. This is the
 * same device that placed the order; remembering the number is what lets them
 * see it again.
 */
const GUEST_CONTACT_KEY = 'taste_guest_contact';

function readGuestContact() {
  try {
    const stored = JSON.parse(localStorage.getItem(GUEST_CONTACT_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return null;
    return { name: String(stored.name || ''), phone: String(stored.phone || '') };
  } catch {
    return null;
  }
}

function rememberGuestContact(name, phone) {
  const cleanPhone = String(phone || '').trim();
  if (!cleanPhone) return;
  try {
    localStorage.setItem(GUEST_CONTACT_KEY, JSON.stringify({ name: String(name || '').trim(), phone: cleanPhone }));
  } catch (error) {
    console.warn('[CustomerApp] Could not remember the guest contact:', error);
  }
}

function forgetGuestContact() {
  try {
    localStorage.removeItem(GUEST_CONTACT_KEY);
  } catch (error) {
    console.warn('[CustomerApp] Could not clear the guest contact:', error);
  }
}

export function CustomerApp({ app }) {
  // Navigation & View states
  const [state, setState] = useState('menu'); // 'menu' | 'cart' | 'checkout' | 'success'
  const [customerPage, setCustomerPage] = useState('home');
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [items, setItems] = useState([]);
  const [menuByCategory, setMenuByCategory] = useState(new Map());
  const [addons, setAddons] = useState([]);
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
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerFavorites, setCustomerFavorites] = useState([]);
  const [customerAddresses, setCustomerAddresses] = useState([]);
  const [customerOffers, setCustomerOffers] = useState([]);
  const [customerPreferences, setCustomerPreferences] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('customer_preferences') || '[]');
      return CUSTOMER_PREFERENCE_OPTIONS.map(option => ({ ...option, enabled: saved.includes(option.key) }));
    } catch (error) {
      return CUSTOMER_PREFERENCE_OPTIONS.map(option => ({ ...option, enabled: false }));
    }
  });
  const [retentionPreferences, setRetentionPreferences] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('customer_retention_preferences') || '[]');
      return RETENTION_PREFERENCES.map(option => ({ ...option, enabled: saved.includes(option.key) }));
    } catch (error) {
      return RETENTION_PREFERENCES.map(option => ({ ...option, enabled: false }));
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [placedOrder, setPlacedOrder] = useState(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [routeAnnouncement, setRouteAnnouncement] = useState('');
  const [storefrontCopy, setStorefrontCopy] = useState(() => resolveStorefrontCopy({}));

  // Geolocation & Autocomplete states
  const [deliveryCoordinates, setDeliveryCoordinates] = useState({ latitude: null, longitude: null });
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [locating, setLocating] = useState(false);

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
      showToast('Coordinates locked. Add your full street address.', 'info');
      const geocoded = await reverseGeocode(coords.latitude, coords.longitude);
      if (geocoded.address) setDeliveryAddress(geocoded.address);
      setDeliveryCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
      playSound(900, 100);
      vibrateDevice([40, 20, 40]);
      showToast('GPS location saved. Please confirm the delivery address.', 'success');
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

  /**
   * Re-read the catalogue out of the local cache into view state.
   *
   * Called after every cloud pull, so an admin price change, a new dish or a
   * dish going unavailable reaches an already-open storefront tab without a
   * reload. Keeps the active category if it still exists.
   */
  const applyLocalCatalogue = useCallback(async () => {
    const refreshedCats = await getCategories();
    const refreshedMap = new Map();
    for (const category of refreshedCats) {
      refreshedMap.set(category.id, await getItemsByCategory(category.id));
    }
    setCategories(refreshedCats);
    setMenuByCategory(refreshedMap);
    setAddons(await db.menuItemAddons.toArray());
    setTables(await db.table('tables').toArray());
    setActiveCategoryId(current => (
      current && refreshedMap.has(current) ? current : (refreshedCats[0]?.id || null)
    ));
  }, []);

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
    const handleCustomerRoute = () => {
      setCustomerPage(CUSTOMER_ROUTES[getCustomerRouteFromHash()].page);
      if (getCustomerRouteFromHash() === 'menu') {
        requestAnimationFrame(() => document.getElementById('menu')?.scrollIntoView({ block: 'start' }));
      }
    };
    window.addEventListener('switch-store-state', handleSwitchState);
    window.addEventListener('hashchange', handleCustomerRoute);

    // Initial loading
    handleCustomerRoute();
    loadData().catch(err => {
      // A failed catalogue read must still clear the skeletons, otherwise the
      // storefront sits on placeholders forever.
      console.error('[CustomerView] Failed to load the storefront catalogue:', err);
      setMenuLoading(false);
    });

    // Live catalogue. Paints from the local cache first (above), then pulls and
    // subscribes, so a slow network delays fresh prices but never first paint.
    const stopMenuSync = startPublicMenuSync(applyLocalCatalogue);

    return () => {
      unsubscribe();
      stopMenuSync();
      window.removeEventListener('switch-store-state', handleSwitchState);
      window.removeEventListener('hashchange', handleCustomerRoute);
      cleanupTelemetry();
    };
  }, [applyLocalCatalogue]);

  // Restore a guest's own details before the first insights load, so their
  // orders are still theirs after a reload.
  useEffect(() => {
    if (loggedInCustomer) return;
    const remembered = readGuestContact();
    if (!remembered?.phone) return;
    setCustomerPhone(current => current || remembered.phone);
    setCustomerName(current => current || remembered.name);
  }, [loggedInCustomer]);

  useEffect(() => {
    loadCustomerInsights();
  }, [customerPhone, loggedInCustomer]);

  useEffect(() => {
    fetchCustomerOffers(loggedInCustomer).then(setCustomerOffers);
  }, [loggedInCustomer]);

  useEffect(() => {
    injectCustomerStructuredData(storeSettings);
  }, [storeSettings]);

  /**
   * Cart, checkout and confirmation replace the page without a navigation, so
   * nothing tells a screen reader or a keyboard user that the view changed.
   * Move focus to the new view's heading and announce it.
   */
  useEffect(() => {
    if (state === 'menu') return;
    const label = { cart: 'Your cart', checkout: 'Checkout', success: 'Order confirmed' }[state];
    if (!label) return;

    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector('.store-checkout-shell h1, .store-checkout-shell h2');
      if (heading instanceof HTMLElement) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      window.scrollTo({ top: 0 });
      setRouteAnnouncement(label);
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);

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

  const loadCustomerInsights = async () => {
    const normalizedPhone = String(customerPhone || loggedInCustomer?.phone || '').trim();
    if (!normalizedPhone) {
      setCustomerOrders([]);
      setCustomerFavorites([]);
      setCustomerAddresses([]);
      return;
    }

    try {
      const allOrders = await db.orders.toArray();
      const matchingOrders = allOrders
        .filter(order => String(order.customerPhone || '').trim() === normalizedPhone)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      const addressSet = new Set();

      for (const order of matchingOrders) {
        if (order.deliveryAddress) {
          addressSet.add(order.deliveryAddress);
        }
      }

      setCustomerOrders(matchingOrders);
      setCustomerFavorites(buildCustomerFavoritesFromOrders(matchingOrders).slice(0, 6));
      setCustomerAddresses([...addressSet]);
    } catch (error) {
      console.warn('[CustomerView] Failed to load customer insights:', error);
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

    // Marketing copy is owner-editable from the admin panel; the pre-rendered
    // HTML ships the defaults and the app layers any overrides on top.
    const storedCopy = {};
    await Promise.all(
      Object.values(STOREFRONT_SETTING_KEYS).map(async key => {
        storedCopy[key] = await getSetting(key);
      })
    );
    setStorefrontCopy(resolveStorefrontCopy(storedCopy));

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
    setMenuLoading(false);
  };

  useEffect(() => {
    if (activeCategoryId) {
      const activeItems = menuByCategory.get(activeCategoryId) || [];
      setItems(activeItems);
    }
  }, [activeCategoryId, menuByCategory]);

  // Both of these scan the whole catalogue and are read during render, so they
  // are cached against their inputs rather than recomputed on every keystroke,
  // cart change and drawer toggle.
  const filteredItems = useMemo(() => {
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
  }, [searchQuery, items, menuByCategory]);

  /**
   * Featured dishes, in order of authority: the ids the owner picked in the
   * admin panel, then the shipped default names, then whatever is on the menu.
   * The old hardcoded name list meant a rename silently emptied the row.
   */
  const featuredItems = useMemo(() => {
    const all = categories.flatMap(category => menuByCategory.get(category.id) || []);
    if (!all.length) return [];

    const chosen = storefrontCopy.featuredItemIds
      .map(id => all.find(item => item.id === id))
      .filter(Boolean);
    if (chosen.length) return chosen.slice(0, 6);

    const byName = STOREFRONT_DEFAULTS.featuredItemNames
      .map(name => all.find(item => item.name === name))
      .filter(Boolean);
    return byName.length ? byName.slice(0, 6) : all.slice(0, 6);
  }, [categories, menuByCategory, storefrontCopy.featuredItemIds]);

  const handleOpenDetails = (item) => {
    playSound(600, 70);
    vibrateDevice([15]);
    setActiveDetailItem(item);
  };

  const handleCloseDetails = () => {
    setActiveDetailItem(null);
  };

  const handleAddToCartFromDrawer = ({ item, qty, spicyLevel, addons: chosenAddons = [], addonIds = [], customNotes, price }) => {
    // The ticket the kitchen prints still reads as a sentence; the ids beside it
    // are what the server prices the order from.
    let consolidatedNotes = `Spicy: ${spicyLevel}`;
    if (chosenAddons.length > 0) consolidatedNotes += ` | Add-ons: ${chosenAddons.map(a => a.name).join(', ')}`;
    if (customNotes) consolidatedNotes += ` | Note: ${customNotes}`;

    globalStore.addToCart({ ...item, price }, qty, consolidatedNotes, {
      addonIds,
      addons: chosenAddons,
      spiceLevel: spicyLevel
    });

    playSound(900, 100);
    vibrateDevice([40, 20, 40]);
    showToast(`${item.name} added to cart!`, 'success');
    setActiveDetailItem(null);
  };

  const handleShowLogin = async () => {
    playSound(700, 80);
    let overlay = document.getElementById('login-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'login-overlay';
      document.body.appendChild(overlay);
    }
    const { CustomerLoginScreen } = await import('../../../components/CustomerLoginScreen');
    const login = new CustomerLoginScreen(async (staff) => {
      overlay?.remove();
      // Re-fetch login state
      await loadData();
    });
    login.render(overlay);
  };

  const toggleCustomerPreference = (key) => {
    const next = customerPreferences.map(pref => pref.key === key ? { ...pref, enabled: !pref.enabled } : pref);
    setCustomerPreferences(next);
    localStorage.setItem('customer_preferences', JSON.stringify(next.filter(pref => pref.enabled).map(pref => pref.key)));
    showToast('Preference updated', 'success');
  };

  const toggleRetentionPreference = (key) => {
    const next = retentionPreferences.map(pref => pref.key === key ? { ...pref, enabled: !pref.enabled } : pref);
    setRetentionPreferences(next);
    localStorage.setItem('customer_retention_preferences', JSON.stringify(next.filter(pref => pref.enabled).map(pref => pref.key)));
    showToast('Communication preference updated', 'success');
  };

  const handleFavoriteItem = async (item) => {
    const result = await syncCustomerFavorite({ customer: loggedInCustomer, item });
    const existing = customerFavorites.find(fav => String(fav.itemId) === String(item.id) || fav.itemName === item.name);
    if (!existing) {
      setCustomerFavorites([{ itemId: item.id, itemName: item.name, count: 1, source: result.synced ? 'server' : 'local' }, ...customerFavorites].slice(0, 6));
    }
    showToast(result.synced ? 'Saved to favourites' : 'Favourite saved locally', 'success');
  };

  const handleReorder = (order) => {
    const menuItems = categories.flatMap(category => menuByCategory.get(category.id) || []);
    const availableById = new Map(menuItems.map(item => [String(item.id), item]));
    const availableByName = new Map(menuItems.map(item => [String(item.name || '').toLowerCase(), item]));
    const orderItems = parseOrderItems(order.items);
    let restoredCount = 0;

    globalStore.clearCart();

    for (const orderItem of orderItems) {
      const menuItem = availableById.get(String(orderItem.itemId || orderItem.id || orderItem.menuItemId)) ||
        availableByName.get(String(orderItem.itemName || orderItem.name || '').toLowerCase());

      if (menuItem) {
        globalStore.addToCart(menuItem, Number(orderItem.quantity || 1), orderItem.notes || '');
        restoredCount += 1;
      }
    }

    if (order.type) setOrderType(order.type === 'dinein' ? 'takeaway' : order.type);
    if (order.deliveryAddress) setDeliveryAddress(order.deliveryAddress);

    openMenu();
    if (restoredCount) {
      showToast(`Restored ${restoredCount} item${restoredCount === 1 ? '' : 's'} from your last order`, 'success');
    } else {
      showToast('Those items are not available right now. Please choose from today’s menu.', 'warning');
    }
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      playSound(600, 80);
      const { authService } = await import('../../../services/auth');
      authService.logout();
      setLoggedInCustomer(null);
      setCustomerName('');
      setCustomerPhone('');
      forgetGuestContact();
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
    placeOrder();
  };

  const placeOrder = async () => {
    // Submission state lives in React rather than being written straight into
    // the button's DOM: the old approach fought re-renders and could leave the
    // control stuck on "Placing Order..." after a state update.
    if (placingOrder) return;
    setPlacingOrder(true);

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
        paymentStatus: selectedPaymentMethod === 'upi' ? 'pending' : 'unpaid',
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
          const existing = await db.customers.where('phone').equals(ord.customerPhone).first();
          if (existing) {
            await db.customers.update(existing.id, {
              name: ord.customerName,
              authUserId: existing.authUserId || loggedInCustomer?.cloudUserId || null,
              isSynced: 0
            });
          } else {
            await db.customers.add({
              phone: ord.customerPhone,
              name: ord.customerName,
              authUserId: loggedInCustomer?.cloudUserId || null,
              totalSpent: 0,
              visitCount: 0,
              loyaltyPoints: 0,
              tier: 'bronze',
              lastVisit: null,
              createdAt: new Date().toISOString(),
              isSynced: 0,
              _platform: 'nextgenos'
            });
          }
        } catch (error) {
          console.error('Loyalty update failed:', error);
        }
      };

      await afterOrderCreated(order);
      rememberGuestContact(customerName, customerPhone);
      await loadCustomerInsights();
      setState('success');
      playSound(900, 90);
      vibrateDevice([50, 30, 50]);
    } catch (error) {
      console.error('Failed to submit self-order:', error);
      showToast('Order placement failed: ' + error.message, 'error');
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleOrderAgain = () => {
    globalStore.updateState({ cart: [] });
    setPlacedOrder(null);
    setState('menu');
  };

  const openCustomerPage = (pageOrRoute) => {
    const route = CUSTOMER_ROUTES[pageOrRoute] || { page: pageOrRoute, path: `#/self-order?page=${pageOrRoute}` };
    setCustomerPage(route.page);
    if (window.location.hash !== route.path) {
      window.history.pushState(null, '', route.path);
      window.dispatchEvent(new Event('hashchange'));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openMenu = () => {
    openCustomerPage('menu');
    requestAnimationFrame(() => document.getElementById('menu')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const accessibilityClass = [
    customerPreferences.some(pref => pref.key === 'reduced_motion' && pref.enabled) ? 'pref-reduced-motion' : '',
    customerPreferences.some(pref => pref.key === 'larger_text' && pref.enabled) ? 'pref-larger-text' : '',
    customerPreferences.some(pref => pref.key === 'high_contrast' && pref.enabled) ? 'pref-high-contrast' : '',
  ].filter(Boolean).join(' ');

  // Dynamic values
  const modeStr = detectedTable ? `Table ${detectedTable.number}` : 'Order online from home';
  const displayAddress = storeSettings.address || 'Fresh Indo-Chinese comfort food, packed hot for your table or home.';

  // Main UI Render depending on state route
  return (
    <div className={`storefront-root ${accessibilityClass}`}>
      <p className="sr-only" role="status" aria-live="polite">{routeAnnouncement}</p>
      {state === 'menu' && (
        <div className="storefront-shell">
          <CustomerShellNav
            activePage={customerPage}
            cartCount={cartCount}
            loggedInCustomer={loggedInCustomer}
            onNavigate={openCustomerPage}
            onOpenCart={() => { playSound(800, 80); setState('cart'); }}
            onSignIn={handleShowLogin}
            onLogout={handleLogout}
          />
          {customerPage === 'offers' && <OffersPage onBack={() => openCustomerPage('home')} onOrder={openMenu} offers={customerOffers} />}
          {customerPage === 'about' && <AboutPage onBack={() => openCustomerPage('home')} />}
          {customerPage === 'catering' && <CateringPage onBack={() => openCustomerPage('home')} supportPhone={storeSettings.phone} />}
          {customerPage === 'support' && <SupportPage onBack={() => openCustomerPage('home')} supportPhone={storeSettings.phone} />}
          {customerPage === 'account' && (
            <AccountPage
              onBack={() => openCustomerPage('home')}
              customer={loggedInCustomer}
              orders={customerOrders}
              favorites={customerFavorites}
              addresses={customerAddresses}
              preferences={customerPreferences}
              retentionPreferences={retentionPreferences}
              offers={customerOffers}
              onSignIn={handleShowLogin}
              onRewards={() => setShowLoyaltyDrawer(true)}
              onReorder={handleReorder}
              onOpenMenu={openMenu}
              onTogglePreference={toggleCustomerPreference}
              onToggleRetentionPreference={toggleRetentionPreference}
            />
          )}
          {customerPage === 'home' && <>
          {/* Hero Section */}
          <section className="store-hero" aria-label="The Taste storefront">
            <div className="store-hero-content">
              <p className="store-kicker"><span aria-hidden="true">✦</span> {modeStr}</p>
              <h1>{storeSettings.name}</h1>
              {/* Where the food comes from, at the top where a customer looks
                  for it, rather than buried beside the menu heading. */}
              <a className="store-location-chip" href="#menu">
                <span className="material-symbols-rounded" aria-hidden="true">location_on</span>
                {displayAddress}
              </a>
              <p className="store-hero-copy">{storefrontCopy.heroCopy}</p>
              <div className="store-hero-actions">
                <a className="store-primary-action" href="#menu">
                  <span className="material-symbols-rounded" aria-hidden="true">restaurant_menu</span>
                  {storefrontCopy.heroCta}
                </a>
              </div>
              <dl className="store-proof">
                {storefrontCopy.proofPoints.map(point => (
                  <div key={point.label}><dt>{point.value}</dt><dd>{point.label}</dd></div>
                ))}
              </dl>
            </div>
          </section>

          {/* Ordering Options Selector Band */}
          <section className="store-service-band" id="order-options" aria-label="Ordering options">
            <button className={`store-service-option ${orderType === 'delivery' ? 'is-active' : ''}`} aria-pressed={orderType === 'delivery'} onClick={() => setOrderType('delivery')} type="button">
              <span className="material-symbols-rounded" aria-hidden="true">local_shipping</span>
              <strong>Home delivery</strong>
              <small>Delivered by restaurant staff</small>
            </button>
            <button className={`store-service-option ${orderType === 'takeaway' ? 'is-active' : ''}`} aria-pressed={orderType === 'takeaway'} onClick={() => setOrderType('takeaway')} type="button">
              <span className="material-symbols-rounded" aria-hidden="true">shopping_bag</span>
              <strong>Pickup</strong>
              <small>Order ahead and collect</small>
            </button>
            <button className={`store-service-option ${orderType === 'dinein' ? 'is-active' : ''}`} aria-pressed={orderType === 'dinein'} onClick={() => setOrderType('dinein')} type="button">
              <span className="material-symbols-rounded" aria-hidden="true">table_restaurant</span>
              <strong>{detectedTable ? `Table ${detectedTable.number}` : 'Dine-in QR'}</strong>
              <small>Order from your table</small>
            </button>
          </section>

          {/* Featured items */}
          <section className="store-section store-section-tight" aria-label="Highlights">
            <div className="store-section-head">
              <p>{storefrontCopy.featuredEyebrow}</p>
              <h2>{storefrontCopy.featuredHeadline}</h2>
            </div>
            <div className="store-featured-grid">
              {menuLoading && featuredItems.length === 0
                ? Array.from({ length: 6 }, (_, index) => (
                    <div key={`featured-skeleton-${index}`} className="store-skeleton store-skeleton-featured" aria-hidden="true" />
                  ))
                : featuredItems.map(item => (
                <article key={item.id} className="store-featured-item">
                  <button
                    className="store-featured-open"
                    onClick={() => handleOpenDetails(item)}
                    onContextMenu={(e) => { e.preventDefault(); handleFavoriteItem(item); }}
                    type="button"
                  >
                    <img src={menuItemImageSource(item) || '/assets/dish-starters.jpg'} alt="" width="640" height="420" loading="lazy" decoding="async" />
                    <span>{item.name}</span>
                    <strong>{formatCurrency(item.price)}</strong>
                  </button>
                  {/* Right-click/long-press stays as a shortcut, but favouriting
                      needs a real control to be reachable by keyboard and AT. */}
                  <button
                    className="store-featured-fav"
                    type="button"
                    onClick={() => handleFavoriteItem(item)}
                    aria-label={`Save ${item.name} to favourites`}
                    title={`Save ${item.name} to favourites`}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">favorite</span>
                  </button>
                </article>
              ))}
            </div>
          </section>

          {/* Menu Items Container */}
          <section className="store-section" id="menu" aria-label="Online menu">
            <div className="store-section-head store-menu-head">
              <div>
                <p>{storefrontCopy.menuEyebrow}</p>
                <h2>{storefrontCopy.menuHeadline}</h2>
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

            <div className="store-menu-grid" style={{ marginTop: '24px' }} aria-busy={menuLoading}>
              {menuLoading && filteredItems.length === 0 ? (
                Array.from({ length: 8 }, (_, index) => (
                  <div key={`menu-skeleton-${index}`} className="store-skeleton store-skeleton-card" aria-hidden="true" />
                ))
              ) : filteredItems.length === 0 ? (
                <div className="store-empty-state">
                  <span className="material-symbols-rounded" aria-hidden="true">restaurant_menu</span>
                  <p>No items found matching your search.</p>
                </div>
              ) : (
                filteredItems.map(item => (
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

          <footer className="customer-footer">
            <div><strong>THE TASTE</strong><p>{storefrontCopy.footerCopy}</p></div>
            <nav aria-label="Customer information"><button type="button" onClick={() => openCustomerPage('about')}>Our story</button><button type="button" onClick={() => openCustomerPage('catering')}>Catering</button><button type="button" onClick={() => openCustomerPage('support')}>Help</button></nav>
            <small>Freshly prepared. Clearly priced. Made locally.</small>
          </footer>
          </>}

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
                <input type="text" id="self-name" className="input store-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter your name" />
              </div>
              <div className="input-group store-input-group" style={{ marginTop: '12px' }}>
                <label className="store-field-label" htmlFor="self-phone">Phone number</label>
                <input type="tel" id="self-phone" className="input store-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="10-digit mobile number" />
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
                          background: 'rgba(var(--color-primary-rgb), 0.1)',
                          border: '1px solid rgba(var(--color-primary-rgb), 0.25)',
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
                        onChange={(e) => handleAddressInputChange(e.target.value)} 
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
                              onMouseEnter={(e) => e.target.style.background = 'rgba(var(--color-primary-rgb), 0.08)'}
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
                      <input type="text" id="self-delivery-landmark" className="input store-input" value={deliveryLandmark} onChange={(e) => setDeliveryLandmark(e.target.value)} placeholder="Nearby landmark, gate code, etc." />
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
              <div className="store-option-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button className={`store-choice-btn ${selectedPaymentMethod === 'upi' ? 'is-active' : ''}`} type="button" onClick={() => setSelectedPaymentMethod('upi')}>
                  <span className="material-symbols-rounded">qr_code_2</span>
                  <span>UPI QR</span>
                  <small>Staff verifies</small>
                </button>
                <button className={`store-choice-btn ${selectedPaymentMethod === 'cash' ? 'is-active' : ''}`} type="button" onClick={() => setSelectedPaymentMethod('cash')}>
                  <span className="material-symbols-rounded">payments</span>
                  <span>Cash/COD</span>
                  <small>Pay later</small>
                </button>
              </div>

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
              disabled={placingOrder}
              aria-busy={placingOrder}
            >
              <span className="material-symbols-rounded" aria-hidden="true">send_and_archive</span>
              {placingOrder ? 'Placing Order…' : 'Place Order'}
            </button>
          </footer>
        </div>
      )}

      {state === 'success' && placedOrder && (
        <OrderSuccessTele 
          order={placedOrder}
          customer={loggedInCustomer}
          supportPhone={storeSettings.phone}
          onOrderAgain={handleOrderAgain}
        />
      )}

      {/* Drawers */}
      {activeDetailItem && (
        <ItemDetailDrawer 
          item={activeDetailItem}
          categories={categories}
          onClose={handleCloseDetails}
          addons={addons}
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
