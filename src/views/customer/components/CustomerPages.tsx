// @ts-nocheck
import React from 'react';
import { formatCurrency, formatDateTime, parseOrderItems } from '../../../utils/helpers';

const Icon = ({ children }) => <span className="material-symbols-rounded" aria-hidden="true">{children}</span>;

export function CustomerPageHeader({ eyebrow, title, copy, onBack }) {
  return (
    <header className="customer-page-hero">
      <button className="customer-back-link" type="button" onClick={onBack}><Icon>arrow_back</Icon> Home</button>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <div>{copy}</div>
    </header>
  );
}

export function OffersPage({ onBack, onOrder, offers = [] }) {
  return (
    <main className="customer-page">
      <CustomerPageHeader eyebrow="Offers" title="More joy in every order" copy="Live offers are displayed here, while final eligibility and discount math stay server validated at checkout." onBack={onBack} />
      <section className="customer-card-grid">
        {offers.map(offer => (
          <article className="customer-feature-card" key={offer.id || offer.code || offer.title}>
            <Icon>{offer.icon || 'local_offer'}</Icon>
            <small>{offer.label || 'Offer'}</small>
            <h2>{offer.title}</h2>
            <p>{offer.description}</p>
            <strong>{offer.displayValue || 'Server validated'}</strong>
            <button type="button" onClick={onOrder}>{offer.eligible === false ? 'Sign in to use' : 'Explore menu'} <Icon>arrow_forward</Icon></button>
          </article>
        ))}
      </section>
      <section className="customer-policy-panel">
        <Icon>verified_user</Icon>
        <div>
          <h2>Fair offer promise</h2>
          <p>Offer cards are informational. The app sends offer tags only; final price, taxes, eligibility, inventory, and payment state are accepted by the server.</p>
        </div>
      </section>
    </main>
  );
}

export function AboutPage({ onBack }) {
  return <main className="customer-page"><CustomerPageHeader eyebrow="Our story" title="Comfort food, cooked with character" copy="The Taste brings bold Indo-Chinese flavours to Patna with the warmth and consistency of a neighbourhood favourite." onBack={onBack} /><section className="customer-story-grid"><article><span>01</span><h2>Wok-fresh</h2><p>Every dish is prepared to order for aroma, texture, and heat that survives the journey home.</p></article><article><span>02</span><h2>Honest value</h2><p>Generous portions, clear pricing, and familiar food made without unnecessary theatre.</p></article><article><span>03</span><h2>Made locally</h2><p>We are rooted in Kumhrar and designed around the way our neighbourhood actually eats.</p></article></section></main>;
}

export function CateringPage({ onBack }) {
  return <main className="customer-page"><CustomerPageHeader eyebrow="Catering" title="Big-table food without the fuss" copy="Office lunches, family celebrations, college events, and everything that deserves a generous spread." onBack={onBack} /><section className="customer-contact-panel"><div><Icon>celebration</Icon><h2>Tell us about your gathering</h2><p>Share your date, guest count, preferences, and budget. Our team will help shape a menu that travels well.</p></div><a href="tel:+910000000000">Call the restaurant <Icon>call</Icon></a></section></main>;
}

export function SupportPage({ onBack }) {
  const faqs = [
    ['Can I change an order?', 'Contact the restaurant immediately after placing it. Changes depend on kitchen status.'],
    ['How do I track my order?', 'Your confirmation screen shows the latest status as the kitchen and delivery team update it.'],
    ['Which payments are supported?', 'Available payment methods are shown at checkout and may vary by fulfilment type.'],
    ['Do you show allergens?', 'Ask the restaurant before ordering if you have allergies. Allergen labels are being prepared for every menu item.'],
    ['What is your cancellation policy?', 'Cancellation depends on preparation status. Orders already cooking may not be cancellable.'],
  ];
  return <main className="customer-page"><CustomerPageHeader eyebrow="Help centre" title="We are here when you need us" copy="Quick answers and a direct line to the restaurant—no maze of support screens." onBack={onBack} /><section className="customer-faq-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}<Icon>add</Icon></summary><p>{a}</p></details>)}</section><div className="customer-support-actions"><a href="tel:+910000000000"><Icon>call</Icon> Call us</a><a href="https://wa.me/910000000000"><Icon>chat</Icon> WhatsApp</a></div></main>;
}

function EmptyAccountCard({ icon, title, copy, action, onAction }) {
  return <article className="customer-account-empty"><Icon>{icon}</Icon><h3>{title}</h3><p>{copy}</p>{action && <button type="button" onClick={onAction}>{action}</button>}</article>;
}

function getOrderSummary(order) {
  return parseOrderItems(order.items).map(item => item.itemName || item.name || 'Menu item').slice(0, 3).join(', ');
}

export function AccountPage({ onBack, customer, orders = [], favorites = [], addresses = [], preferences = [], retentionPreferences = [], offers = [], onSignIn, onRewards, onReorder, onOpenMenu, onTogglePreference, onToggleRetentionPreference }) {
  const firstName = (customer?.name || '').split(' ')[0] || 'there';
  const hasCustomer = Boolean(customer);
  const latestOrder = orders[0];

  return (
    <main className="customer-page">
      <CustomerPageHeader
        eyebrow="Your account"
        title={hasCustomer ? `Welcome back, ${firstName}` : 'Your Taste, remembered'}
        copy={hasCustomer ? 'A proper customer hub: rewards, order history, favourites, addresses, preferences, and retention controls in one calm place.' : 'Sign in to collect rewards, follow orders, save addresses, and make checkout feel effortless.'}
        onBack={onBack}
      />

      <section className="customer-account-panel">
        <div className="customer-account-avatar"><Icon>person</Icon></div>
        <div>
          <small>{hasCustomer ? `${customer.tier || 'Taste'} Rewards member` : 'Guest customer'}</small>
          <h2>{customer?.name || 'Sign in to continue'}</h2>
          <p>{hasCustomer ? `${orders.length} order${orders.length === 1 ? '' : 's'} found${latestOrder ? ` · Last order ${formatCurrency(latestOrder.total || 0)}` : ''}` : 'Order history, favourites, saved addresses, preferences, and rewards unlock after sign in.'}</p>
        </div>
        <button type="button" onClick={hasCustomer ? onRewards : onSignIn}>{hasCustomer ? 'View rewards' : 'Sign in'} <Icon>arrow_forward</Icon></button>
      </section>

      <section className="customer-account-grid" aria-label="Account highlights">
        {[
          ['receipt_long', 'Orders', `${orders.length || 'No'} recent`],
          ['favorite', 'Favourites', `${favorites.length || 'No'} dishes yet`],
          ['location_on', 'Addresses', `${addresses.length || 'No'} saved`],
          ['tune', 'Preferences', `${preferences.filter(p => p.enabled).length} selected`],
        ].map(([icon, label, note]) => (
          <button type="button" key={label} disabled={!hasCustomer} onClick={label === 'Orders' ? onOpenMenu : undefined}>
            <Icon>{icon}</Icon><span>{label}</span><small>{hasCustomer ? note : 'Sign in required'}</small>
          </button>
        ))}
      </section>

      {hasCustomer && (
        <section className="customer-account-sections">
          <article className="customer-account-section customer-account-section-wide">
            <div className="customer-section-title"><div><small>Recent orders</small><h2>Order again in seconds</h2></div><Icon>receipt_long</Icon></div>
            {orders.length ? (
              <div className="customer-order-list">
                {orders.slice(0, 4).map(order => (
                  <div className="customer-order-row" key={order.clientOrderId || order.id || order.orderNumber}>
                    <div>
                      <strong>#{order.displayToken || order.orderNumber}</strong>
                      <p>{getOrderSummary(order) || 'Custom order'} · {formatDateTime(order.createdAt)}</p>
                      <small>{order.status || 'pending'} · {order.paymentStatus || 'unpaid'}</small>
                    </div>
                    <span>{formatCurrency(order.total || 0)}</span>
                    <button type="button" onClick={() => onReorder(order)}>Reorder</button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyAccountCard icon="restaurant_menu" title="No orders yet" copy="Your recent orders will appear here after checkout." action="Explore menu" onAction={onOpenMenu} />
            )}
          </article>

          <article className="customer-account-section">
            <div className="customer-section-title"><div><small>Smart favourites</small><h2>Dishes you return to</h2></div><Icon>favorite</Icon></div>
            {favorites.length ? (
              <div className="customer-favorite-list">
                {favorites.slice(0, 5).map(item => <button type="button" key={item.itemId || item.itemName} onClick={onOpenMenu}><span>{item.itemName}</span><small>Ordered {item.count || 1}x</small></button>)}
              </div>
            ) : (
              <EmptyAccountCard icon="favorite" title="Favourites are learning" copy="Order a few times and this becomes a shortcut to your usuals." action="Start ordering" onAction={onOpenMenu} />
            )}
          </article>

          <article className="customer-account-section">
            <div className="customer-section-title"><div><small>Saved addresses</small><h2>Faster delivery</h2></div><Icon>location_on</Icon></div>
            {addresses.length ? (
              <div className="customer-address-list">
                {addresses.slice(0, 4).map(address => <div key={address}><Icon>home_pin</Icon><span>{address}</span></div>)}
              </div>
            ) : (
              <EmptyAccountCard icon="home_pin" title="No address saved yet" copy="Delivery addresses are remembered from successful orders." />
            )}
          </article>

          <article className="customer-account-section customer-account-section-wide">
            <div className="customer-section-title"><div><small>Preferences</small><h2>Make every checkout feel personal</h2></div><Icon>tune</Icon></div>
            <div className="customer-preference-list">
              {preferences.map(pref => <button type="button" className={pref.enabled ? 'is-active' : ''} key={pref.key} onClick={() => onTogglePreference(pref.key)}><Icon>{pref.icon}</Icon><span>{pref.label}</span></button>)}
            </div>
          </article>

          <article className="customer-account-section">
            <div className="customer-section-title"><div><small>Retention</small><h2>Updates you control</h2></div><Icon>notifications_active</Icon></div>
            <div className="customer-preference-list customer-preference-list-compact">
              {retentionPreferences.map(pref => <button type="button" className={pref.enabled ? 'is-active' : ''} key={pref.key} onClick={() => onToggleRetentionPreference(pref.key)}><Icon>{pref.icon}</Icon><span>{pref.label}</span></button>)}
            </div>
            <p className="customer-section-note">These preferences only store consent. Automated messages are not sent unless backend messaging is configured.</p>
          </article>

          <article className="customer-account-section">
            <div className="customer-section-title"><div><small>Personal offers</small><h2>For your next visit</h2></div><Icon>redeem</Icon></div>
            <div className="customer-favorite-list">
              {offers.slice(0, 3).map(offer => <button type="button" key={offer.id || offer.code} onClick={onOpenMenu}><span>{offer.title}</span><small>{offer.displayValue}</small></button>)}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
