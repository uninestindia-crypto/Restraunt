import type { Metadata } from 'next';
import { StaticPageChrome } from '../_components/StaticPageChrome';
import { StorefrontJsonLd } from '../_components/StorefrontJsonLd';
import { STOREFRONT_PAGES } from '../../content/storefront';

const page = STOREFRONT_PAGES.offers;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: '/offers' },
  openGraph: { title: page.metaTitle, description: page.metaDescription, type: 'website' }
};

export default function OffersPage() {
  return (
    <>
      <StorefrontJsonLd page="offers" />
      <StaticPageChrome
        active="/offers"
        eyebrow={page.eyebrow}
        title={page.title}
        copy={page.copy}
        cta={{ href: '/#/self-order?page=offers', label: 'See live offers' }}
      >
        {/* Offer values are per-customer and server validated, so the static
            page describes the programme and defers the numbers to the app. */}
        <section className="static-panel">
          <h2>Live offers open in the ordering app</h2>
          <p>
            Eligibility depends on your account, cart and fulfilment type, so every offer is
            calculated at checkout rather than advertised as a fixed number here.
          </p>
          <a className="static-panel-cta" href="/#/self-order?page=offers">View offers for my account</a>
        </section>

        <section className="static-panel">
          <h2>Fair offer promise</h2>
          <p>
            The app sends offer tags only. Final price, taxes, eligibility, inventory and payment
            state are accepted by the server, so what you see at checkout is what you pay.
          </p>
        </section>
      </StaticPageChrome>
    </>
  );
}
