import type { Metadata } from 'next';
import { StaticPageChrome } from '../_components/StaticPageChrome';
import { StorefrontJsonLd } from '../_components/StorefrontJsonLd';
import { STORE_PROFILE } from '../../content/storefront';
import snapshot from '../../data/menu-snapshot.json';

export const metadata: Metadata = {
  title: 'Full Menu & Prices — The Taste, Kumhrar Patna',
  description:
    'The complete Indo-Chinese and fast food menu at The Taste, Kumhrar, Patna — momos, noodles, fried rice, rolls, burgers and more, with current prices.',
  alternates: { canonical: '/menu' },
  openGraph: {
    title: 'Full Menu & Prices — The Taste, Patna',
    description: 'Every dish and price at The Taste, Kumhrar. Order online for delivery, pickup or your table.',
    type: 'website'
  }
};

function formatPrice(price: number) {
  return `₹${Number(price || 0).toFixed(0)}`;
}

export default function MenuPage() {
  const itemCount = snapshot.categories.reduce((sum, category) => sum + category.items.length, 0);

  return (
    <>
      <StorefrontJsonLd page="menu" />
      <StaticPageChrome
        active="/menu"
        eyebrow="Menu"
        title="Everything we cook, with prices"
        copy={`${itemCount} dishes across ${snapshot.categories.length} sections, prepared to order at ${STORE_PROFILE.streetAddress}, ${STORE_PROFILE.locality}.`}
      >
        {itemCount === 0 ? (
          <p className="static-page-empty">
            Our menu is being updated. Please call the restaurant for today&apos;s dishes.
          </p>
        ) : (
          <div className="static-menu">
            {snapshot.categories.map(category => (
              <section key={category.id} className="static-menu-section">
                <h2>
                  {category.icon ? <span aria-hidden="true">{category.icon} </span> : null}
                  {category.name}
                </h2>
                <ul>
                  {category.items.map(item => (
                    <li key={item.id}>
                      <span className={item.isVeg ? 'static-menu-mark veg' : 'static-menu-mark nonveg'} aria-hidden="true" />
                      <span className="static-menu-name">{item.name}</span>
                      <span className="sr-only">{item.isVeg ? 'Vegetarian' : 'Non vegetarian'}</span>
                      <span className="static-menu-price">{formatPrice(item.price)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="static-page-note">
          Prices include preparation; taxes and any delivery fee are shown at checkout.
        </p>
      </StaticPageChrome>
    </>
  );
}
