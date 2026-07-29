import { STOREFRONT_DEFAULTS, STORE_PROFILE } from '../../content/storefront';
import snapshot from '../../data/menu-snapshot.json';

function formatPrice(price: number) {
  return `₹${Number(price || 0).toFixed(0)}`;
}

/**
 * The storefront as plain HTML, rendered into the static export.
 *
 * Two audiences read this and never see the SPA: search crawlers that index
 * the response body, and visitors whose JavaScript has not loaded (or failed).
 * The SPA removes it on boot — see `hideLoadingScreen` in src/main.ts — so it
 * is never shown alongside the interactive menu.
 *
 * Its content is the same catalogue the app renders, baked by
 * scripts/build-menu-snapshot.js, so the two can never disagree.
 */
export function StorefrontSeoShell() {
  const itemCount = snapshot.categories.reduce((sum, category) => sum + category.items.length, 0);

  return (
    <div id="storefront-seo-shell" className="storefront-seo-shell">
      <header className="seo-shell-head">
        <p className="seo-shell-kicker">{STOREFRONT_DEFAULTS.heroKicker}</p>
        <h1>{STORE_PROFILE.name}</h1>
        <p className="seo-shell-copy">{STOREFRONT_DEFAULTS.heroCopy}</p>
        <p className="seo-shell-address">
          {STORE_PROFILE.streetAddress}, {STORE_PROFILE.locality} {STORE_PROFILE.postalCode}
        </p>
        <nav className="seo-shell-nav" aria-label="Storefront">
          <a href="/menu">Full menu</a>
          <a href="/offers">Offers</a>
          <a href="/about">Our story</a>
          <a href="/catering">Catering</a>
          <a href="/support">Help</a>
        </nav>
      </header>

      <dl className="seo-shell-proof">
        {STOREFRONT_DEFAULTS.proofPoints.map(point => (
          <div key={point.label}>
            <dt>{point.value}</dt>
            <dd>{point.label}</dd>
          </div>
        ))}
      </dl>

      <section className="seo-shell-menu" aria-label="Menu">
        <h2>{STOREFRONT_DEFAULTS.menuHeadline}</h2>
        {itemCount === 0 ? (
          <p>Our menu is being updated. Please call the restaurant for today&apos;s dishes.</p>
        ) : (
          snapshot.categories.map(category => (
            <section key={category.id} className="seo-shell-category">
              <h3>
                {category.icon ? <span aria-hidden="true">{category.icon} </span> : null}
                {category.name}
              </h3>
              <ul>
                {category.items.map(item => (
                  <li key={item.id}>
                    <span className="seo-shell-item-name">{item.name}</span>
                    <span className="seo-shell-item-diet">{item.isVeg ? 'Veg' : 'Non-veg'}</span>
                    <span className="seo-shell-item-price">{formatPrice(item.price)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </section>

      <footer className="seo-shell-foot">
        <p>{STOREFRONT_DEFAULTS.footerCopy}</p>
        <p>{STOREFRONT_DEFAULTS.footerNote}</p>
      </footer>
    </div>
  );
}
