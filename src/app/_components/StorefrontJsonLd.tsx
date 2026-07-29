import { STORE_ORIGIN, STORE_PROFILE, STOREFRONT_PAGES } from '../../content/storefront';
import snapshot from '../../data/menu-snapshot.json';

const postalAddress = {
  '@type': 'PostalAddress',
  streetAddress: STORE_PROFILE.streetAddress,
  addressLocality: STORE_PROFILE.locality,
  addressRegion: STORE_PROFILE.region,
  postalCode: STORE_PROFILE.postalCode,
  addressCountry: STORE_PROFILE.country
};

function menuSchema() {
  return {
    '@type': 'Menu',
    name: `${STORE_PROFILE.name} Menu`,
    hasMenuSection: snapshot.categories.map(category => ({
      '@type': 'MenuSection',
      name: category.name,
      hasMenuItem: category.items.map(item => ({
        '@type': 'MenuItem',
        name: item.name,
        suitableForDiet: item.isVeg ? 'https://schema.org/VegetarianDiet' : undefined,
        offers: {
          '@type': 'Offer',
          price: String(item.price),
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock'
        }
      }))
    }))
  };
}

/**
 * Emits the structured data as part of the exported HTML.
 *
 * This used to be injected at runtime by the SPA, which meant it only existed
 * for crawlers willing to execute the bundle. `application/ld+json` is data,
 * not an executable script, so it is unaffected by the site's `script-src` CSP
 * and by the inline-script hardening pass.
 */
export function StorefrontJsonLd({ page = 'home' }: { page?: string }) {
  const restaurant: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${STORE_ORIGIN}/#restaurant`,
    name: STORE_PROFILE.name,
    description: STORE_PROFILE.tagline,
    servesCuisine: STORE_PROFILE.cuisines,
    priceRange: STORE_PROFILE.priceRange,
    url: STORE_ORIGIN,
    address: postalAddress,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: STORE_PROFILE.latitude,
      longitude: STORE_PROFILE.longitude
    },
    acceptsReservations: false,
    hasMenu: `${STORE_ORIGIN}/menu`
  };

  if (page === 'home' || page === 'menu') {
    restaurant.hasMenu = menuSchema();
  }

  const graph: Record<string, any>[] = [restaurant];

  if (page === 'support') {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: STOREFRONT_PAGES.support.faqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer }
      }))
    });
  }

  return (
    <>
      {graph.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
    </>
  );
}
