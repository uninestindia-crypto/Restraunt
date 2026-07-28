// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { db } from '../../../db/database';
import { globalStore } from '../../../store/Store';
import { formatCurrency, playSound, vibrateDevice, showToast, parseOrderItems } from '../../../utils/helpers';

export function LoyaltyDrawer({ loggedInCustomer, customerPhone, customerName, onClose, onShowLogin, onProfileLoaded }) {
  const [view, setView] = useState('loading'); // 'lookup', 'profile', 'register', 'link_phone', 'loading'
  const [phoneInput, setPhoneInput] = useState('');
  const [regName, setRegName] = useState(loggedInCustomer?.name || '');
  const [regPhone, setRegPhone] = useState('');
  const [linkPhone, setLinkPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    if (loggedInCustomer) {
      fetchLoggedInCustomerProfile();
    } else {
      setView('lookup');
    }
  }, [loggedInCustomer]);

  const fetchLoggedInCustomerProfile = async () => {
    setLoading(true);
    setView('loading');
    try {
      let cust = await db.customers.where('authUserId').equals(loggedInCustomer.cloudUserId).first();
      let ords = [];

      if (navigator.onLine) {
        const { getSupabaseClient } = await import('../../../services/supabaseClient');
        const supabase = await getSupabaseClient();
        if (supabase) {
          const { data: custData, error: custErr } = await supabase
            .from('customers')
            .select('*')
            .eq('auth_user_id', loggedInCustomer.cloudUserId)
            .maybeSingle();

          if (!custErr && custData) {
            const { mapCustomerToLocal } = await import('../../../services/sync');
            const localCust = mapCustomerToLocal(custData);
            const existingLocal = await db.customers.where('phone').equals(localCust.phone).first();
            if (existingLocal) {
              localCust.id = existingLocal.id;
            }
            await db.customers.put(localCust);
            cust = localCust;
          }

          const phoneToUse = cust?.phone || customerPhone;
          if (phoneToUse) {
            const { data: ordersData, error: ordersErr } = await supabase
              .from('orders')
              .select('*')
              .eq('customer_phone', phoneToUse)
              .order('created_at', { ascending: false });

            if (!ordersErr && ordersData) {
              const { mapOrderToLocal } = await import('../../../services/sync');
              ords = ordersData.map(mapOrderToLocal);
              await db.transaction('rw', db.orders, async () => {
                for (const order of ords) {
                  const existing = await db.orders.where('clientOrderId').equals(order.clientOrderId).first();
                  if (existing) order.id = existing.id;
                  await db.orders.put(order);
                }
              });
            }
          }
        }
      }

      if (!ords.length && cust?.phone) {
        ords = await db.orders.where('customerPhone').equals(cust.phone).reverse().toArray();
      }

      if (cust) {
        setCustomer(cust);
        setOrders(ords);
        onProfileLoaded(cust.name, cust.phone);
        if (!cust.phone) {
          setView('link_phone');
        } else {
          setView('profile');
        }
      } else {
        setView('register');
      }
    } catch (err) {
      console.error('CRM lookup error:', err);
      showToast('Failed to load rewards profile', 'error');
      setView('lookup');
    } finally {
      setLoading(false);
    }
  };

  const handleLookup = async () => {
    if (!/^[6-9]\d{9}$/.test(phoneInput)) {
      showToast('Please enter a valid 10-digit mobile number', 'warning');
      return;
    }

    playSound(700, 80);
    vibrateDevice([20]);
    setView('loading');

    try {
      const cust = await db.customers.where('phone').equals(phoneInput).first();
      const ords = await db.orders.where('customerPhone').equals(phoneInput).reverse().toArray();

      if (cust) {
        setCustomer(cust);
        setOrders(ords);
        onProfileLoaded(cust.name, cust.phone);
        setView('profile');
      } else {
        setView('register');
      }
    } catch (err) {
      console.error('CRM lookup error:', err);
      showToast('Failed to load profile', 'error');
      setView('lookup');
    }
  };

  const handleRegister = async () => {
    const isCloud = !!loggedInCustomer;
    const nameToUse = regName.trim();
    const phoneToUse = isCloud ? regPhone.trim() : phoneInput;

    if (!nameToUse) {
      showToast('Please enter your name', 'warning');
      return;
    }
    if (isCloud && !/^[6-9]\d{9}$/.test(phoneToUse)) {
      showToast('Please enter a valid 10-digit mobile number', 'warning');
      return;
    }

    playSound(900, 80);
    vibrateDevice([30]);
    setView('loading');

    try {
      const authUserId = isCloud ? loggedInCustomer.cloudUserId : null;
      const newProfile = {
        id: Date.now(),
        phone: phoneToUse,
        name: nameToUse,
        authUserId,
        totalSpent: 0,
        visitCount: 0,
        loyaltyPoints: 0,
        tier: 'bronze',
        lastVisit: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isSynced: 0,
        _platform: 'nextgenos'
      };

      if (isCloud) {
        const existing = await db.customers.where('phone').equals(phoneToUse).first();
        if (existing) {
          existing.authUserId = authUserId;
          existing.name = nameToUse;
          existing.isSynced = 0;
          await db.customers.put(existing);
          showToast('Account activated & synced with existing profile!', 'success');
          setCustomer(existing);
          setOrders([]);
          onProfileLoaded(existing.name, existing.phone);
          setView('profile');
          return;
        }
      }

      await db.customers.add(newProfile);
      showToast('Welcome to TasteRewards!', 'success');
      setCustomer(newProfile);
      setOrders([]);
      onProfileLoaded(newProfile.name, newProfile.phone);
      setView('profile');
    } catch (err) {
      console.error('Registration failed:', err);
      showToast('Failed to register profile', 'error');
      setView('lookup');
    }
  };

  const handleLinkPhone = async () => {
    if (!/^[6-9]\d{9}$/.test(linkPhone)) {
      showToast('Please enter a valid 10-digit mobile number', 'warning');
      return;
    }

    playSound(900, 80);
    vibrateDevice([30]);
    setView('loading');

    try {
      const existingPhone = await db.customers.where('phone').equals(linkPhone).first();
      if (existingPhone && existingPhone.authUserId && existingPhone.authUserId !== loggedInCustomer.cloudUserId) {
        showToast('This phone number is already linked to another account.', 'error');
        setView('link_phone');
        return;
      }

      let updatedCustomer = { ...customer, phone: linkPhone };

      if (existingPhone) {
        const mergedPoints = (existingPhone.loyaltyPoints || 0) + (customer.loyaltyPoints || 0);
        const mergedSpent = (existingPhone.totalSpent || 0) + (customer.totalSpent || 0);
        const mergedVisits = (existingPhone.visitCount || 0) + (customer.visitCount || 0);

        await db.customers.delete(customer.id);
        updatedCustomer = {
          ...existingPhone,
          authUserId: loggedInCustomer.cloudUserId,
          name: customer.name || existingPhone.name,
          loyaltyPoints: mergedPoints,
          totalSpent: mergedSpent,
          visitCount: mergedVisits,
          tier: mergedSpent >= 5000 ? 'platinum' : mergedSpent >= 2000 ? 'gold' : mergedSpent >= 500 ? 'silver' : 'bronze',
          isSynced: 0
        };
        await db.customers.put(updatedCustomer);
      } else {
        await db.customers.update(customer.id, { phone: linkPhone, isSynced: 0 });
      }

      showToast('Phone number linked successfully!', 'success');
      setCustomer(updatedCustomer);
      onProfileLoaded(updatedCustomer.name, updatedCustomer.phone);

      // Load linked phone orders
      let ords = [];
      if (navigator.onLine) {
        const { getSupabaseClient } = await import('../../../services/supabaseClient');
        const supabase = await getSupabaseClient();
        if (supabase) {
          const { data: ordersData } = await supabase
            .from('orders')
            .select('*')
            .eq('customer_phone', linkPhone)
            .order('created_at', { ascending: false });
          if (ordersData) {
            const { mapOrderToLocal } = await import('../../../services/sync');
            ords = ordersData.map(mapOrderToLocal);
          }
        }
      }
      if (!ords.length) {
        ords = await db.orders.where('customerPhone').equals(linkPhone).reverse().toArray();
      }
      setOrders(ords);
      setView('profile');
    } catch (err) {
      console.error('Phone link failed:', err);
      showToast('Failed to link phone number', 'error');
      setView('link_phone');
    }
  };

  const handleReorder = (order) => {
    const parsed = parseOrderItems(order.items);
    const cartItems = parsed.map(item => ({
      itemId: item.itemId,
      itemName: item.itemName || item.name,
      price: item.price,
      quantity: item.quantity,
      isVeg: item.isVeg,
      notes: item.notes || ''
    }));

    globalStore.updateState({ cart: cartItems });
    playSound(900, 100);
    vibrateDevice([40, 20, 40]);
    showToast('Cart loaded with past items!', 'success');
    onClose();
    // Signal CustomerApp to transition state to 'cart'
    window.dispatchEvent(new CustomEvent('switch-store-state', { detail: { state: 'cart' } }));
  };

  const tierGradients = {
    bronze: 'linear-gradient(135deg, #8C7853 0%, #4E3E28 100%)',
    silver: 'linear-gradient(135deg, #BDC3C7 0%, #2C3E50 100%)',
    gold: 'linear-gradient(135deg, #F39C12 0%, #F1C40F 100%)',
    platinum: 'linear-gradient(135deg, #34495E 0%, #2C3E50 100%)'
  };

  return (
    <div className="aether-drawer-overlay is-open" onClick={(e) => e.target.classList.contains('aether-drawer-overlay') && onClose()}>
      <div className="aether-drawer-sheet crm-drawer">
        <div className="aether-drawer-handle"></div>
        <button 
          className="aether-drawer-close-btn" 
          type="button" 
          aria-label="Close"
          onClick={onClose}
        >
          <span className="material-symbols-rounded">close</span>
        </button>

        <div className="aether-drawer-scroll-content">
          <div className="crm-hero-section">
            <span className="material-symbols-rounded crm-hero-icon" style={{ color: 'var(--color-primary)', fontSize: '2.5rem', filter: 'drop-shadow(0 2px 8px var(--color-primary-glow))' }}>rewarded_ads</span>
            <h2>TasteRewards Club</h2>
            <p>Earn 1 point for every {formatCurrency(10)} spent. Unlock silver, gold, and platinum culinary tiers.</p>
          </div>

          <div className="crm-body-content">
            {view === 'loading' && (
              <div style={{ textAlign: 'center', padding: '32px' }}>
                <div className="spinner store-spinner" style={{ margin: '0 auto 12px' }}></div>
                Loading profile...
              </div>
            )}

            {view === 'lookup' && (
              <div className="crm-auth-view">
                <div className="input-group store-input-group">
                  <label className="store-field-label" htmlFor="crm-phone-input">Enter Phone Number</label>
                  <input 
                    type="tel" 
                    id="crm-phone-input" 
                    className="input store-input" 
                    placeholder="10-digit mobile number" 
                    maxLength={10} 
                    value={phoneInput}
                    onInput={(e) => setPhoneInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>
                <button 
                  className="btn btn-primary btn-block" 
                  id="crm-lookup-btn" 
                  type="button" 
                  style={{ height: '46px', marginTop: '12px', fontWeight: 700 }}
                  onClick={handleLookup}
                >
                  Access Account
                </button>
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8 }}>Or secure your account with a password:</span>
                  <button 
                    className="btn btn-secondary btn-block btn-sm" 
                    id="crm-signin-link" 
                    type="button" 
                    style={{ marginTop: '8px', fontWeight: 700, height: '38px' }}
                    onClick={() => {
                      onClose();
                      onShowLogin();
                    }}
                  >
                    Sign In / Sign Up
                  </button>
                </div>
              </div>
            )}

            {view === 'register' && (
              <div className="crm-register-view" style={{ textAlign: 'center', padding: '16px 8px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '48px', color: 'var(--color-primary)', marginBottom: '8px' }}>app_registration</span>
                <h3>Join TasteRewards</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '18px' }}>You don't have a rewards profile yet. Register your details to start earning points on every dish!</p>

                <div className="input-group store-input-group" style={{ textAlign: 'left' }}>
                  <label className="store-field-label" htmlFor="crm-reg-name">Your Full Name</label>
                  <input 
                    type="text" 
                    id="crm-reg-name" 
                    className="input store-input" 
                    placeholder="E.g. Alexander Mercer" 
                    value={regName}
                    onInput={(e) => setRegName(e.target.value)}
                  />
                </div>

                {loggedInCustomer && (
                  <div className="input-group store-input-group" style={{ textAlign: 'left', marginTop: '12px' }}>
                    <label className="store-field-label" htmlFor="crm-reg-phone">Mobile Number</label>
                    <input 
                      type="tel" 
                      id="crm-reg-phone" 
                      className="input store-input" 
                      placeholder="10-digit mobile number" 
                      maxLength={10} 
                      value={regPhone}
                      onInput={(e) => setRegPhone(e.target.value)}
                    />
                  </div>
                )}

                <button 
                  className="btn btn-primary btn-block" 
                  id="crm-reg-submit" 
                  type="button" 
                  style={{ height: '46px', marginTop: '16px', fontWeight: 700 }}
                  onClick={handleRegister}
                >
                  Activate Account
                </button>
              </div>
            )}

            {view === 'link_phone' && (
              <div className="crm-register-view" style={{ textAlign: 'center', padding: '16px 8px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '48px', color: 'var(--color-primary)', marginBottom: '8px' }}>phone_android</span>
                <h3>Link Phone Number</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '18px' }}>To track your orders and accumulate TasteRewards points, please link your 10-digit mobile number.</p>

                <div className="input-group store-input-group" style={{ textAlign: 'left' }}>
                  <label className="store-field-label" htmlFor="crm-link-phone">Mobile Number</label>
                  <input 
                    type="tel" 
                    id="crm-link-phone" 
                    className="input store-input" 
                    placeholder="10-digit mobile number" 
                    maxLength={10} 
                    value={linkPhone}
                    onInput={(e) => setLinkPhone(e.target.value)}
                  />
                </div>

                <button 
                  className="btn btn-primary btn-block" 
                  id="crm-link-submit" 
                  type="button" 
                  style={{ height: '46px', marginTop: '16px', fontWeight: 700 }}
                  onClick={handleLinkPhone}
                >
                  Link Number
                </button>
              </div>
            )}

            {view === 'profile' && customer && (
              <div className="crm-profile-view">
                <div className="crm-loyalty-card" style={{ background: tierGradients[customer.tier?.toLowerCase() || 'bronze'] }}>
                  <div className="crm-card-top">
                    <div className="crm-brand-name">THE TASTE</div>
                    <span className="crm-tier-tag">{(customer.tier || 'bronze').toUpperCase()} TIER</span>
                  </div>
                  <div className="crm-card-middle">
                    <h3 className="crm-cust-name">{customer.name}</h3>
                    <p className="crm-cust-phone">{customer.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}</p>
                  </div>
                  <div className="crm-card-bottom">
                    <div>
                      <small>LOYALTY POINTS</small>
                      <strong>{customer.loyaltyPoints || 0} pts</strong>
                    </div>
                    <div>
                      <small>VISITS</small>
                      <strong>{customer.visitCount || 0}</strong>
                    </div>
                  </div>
                </div>

                {(() => {
                  const tier = customer.tier || 'bronze';
                  let nextTier = 'Silver';
                  let nextPointsNeeded = 50 - (customer.loyaltyPoints || 0);
                  let percentage = Math.min(((customer.loyaltyPoints || 0) / 50) * 100, 100);

                  if (tier === 'silver') {
                    nextTier = 'Gold';
                    nextPointsNeeded = 200 - (customer.loyaltyPoints || 0);
                    percentage = Math.min(((customer.loyaltyPoints || 0) / 200) * 100, 100);
                  } else if (tier === 'gold') {
                    nextTier = 'Platinum';
                    nextPointsNeeded = 500 - (customer.loyaltyPoints || 0);
                    percentage = Math.min(((customer.loyaltyPoints || 0) / 500) * 100, 100);
                  } else if (tier === 'platinum') {
                    nextTier = 'Maximum Status';
                    nextPointsNeeded = 0;
                    percentage = 100;
                  }

                  return (
                    <div className="crm-tier-meter-box">
                      <div className="crm-meter-labels">
                        <span>Progress to {nextTier}</span>
                        <span>{customer.loyaltyPoints || 0} pts</span>
                      </div>
                      <div className="crm-meter-track">
                        <div className="crm-meter-fill" style={{ width: `${percentage}%` }}></div>
                      </div>
                      {nextPointsNeeded > 0 ? (
                        <p className="crm-meter-hint">Earn {nextPointsNeeded} more points for {nextTier} status.</p>
                      ) : (
                        <p className="crm-meter-hint">You are at maximum elite status!</p>
                      )}
                    </div>
                  );
                })()}

                <div className="crm-history-section">
                  <h3>Order History</h3>
                  <div className="crm-orders-scroll-list">
                    {orders.length === 0 ? (
                      <p className="crm-no-orders">No past order history found.</p>
                    ) : (
                      orders.map(order => {
                        const parsedItems = parseOrderItems(order.items);
                        const itemsDesc = parsedItems.map(i => `${i.quantity}x ${i.itemName || i.name}`).join(', ');
                        const dateStr = new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        return (
                          <div key={order.id} className="crm-order-card">
                            <div className="crm-order-card-header">
                              <strong>Order on {dateStr}</strong>
                              <span className="crm-order-price">{formatCurrency(order.total)}</span>
                            </div>
                            <p className="crm-order-items">{itemsDesc}</p>
                            <button 
                              className="btn btn-secondary btn-sm btn-reorder" 
                              type="button" 
                              style={{ marginTop: '8px', fontSize: '0.65rem', padding: '4px 8px', borderRadius: 'var(--radius-sm)', fontWeight: 700 }}
                              onClick={() => handleReorder(order)}
                            >
                              <span className="material-symbols-rounded" style={{ fontSize: '12px', verticalAlign: 'middle', marginRight: '2px' }}>replay</span>
                              1-Click Reorder
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
