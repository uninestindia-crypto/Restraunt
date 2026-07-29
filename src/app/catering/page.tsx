import type { Metadata } from 'next';
import { StaticPageChrome } from '../_components/StaticPageChrome';
import { StorefrontJsonLd } from '../_components/StorefrontJsonLd';
import { STOREFRONT_PAGES, STORE_PROFILE } from '../../content/storefront';

const page = STOREFRONT_PAGES.catering;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: '/catering' },
  openGraph: { title: page.metaTitle, description: page.metaDescription, type: 'website' }
};

export default function CateringPage() {
  return (
    <>
      <StorefrontJsonLd page="catering" />
      <StaticPageChrome
        active="/catering"
        eyebrow={page.eyebrow}
        title={page.title}
        copy={page.copy}
        cta={{ href: '/#/self-order?page=catering', label: 'Plan an order' }}
      >
        <section className="static-panel">
          <h2>{page.panelTitle}</h2>
          <p>{page.panelCopy}</p>
          <p className="static-panel-address">
            {STORE_PROFILE.streetAddress}, {STORE_PROFILE.locality} {STORE_PROFILE.postalCode}
          </p>
          <a className="static-panel-cta" href="/#/self-order?page=support">Contact the restaurant</a>
        </section>
      </StaticPageChrome>
    </>
  );
}
