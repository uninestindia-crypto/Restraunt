import type { Metadata } from 'next';
import { StaticPageChrome } from '../_components/StaticPageChrome';
import { StorefrontJsonLd } from '../_components/StorefrontJsonLd';
import { STOREFRONT_PAGES } from '../../content/storefront';

const page = STOREFRONT_PAGES.support;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: '/support' },
  openGraph: { title: page.metaTitle, description: page.metaDescription, type: 'website' }
};

export default function SupportPage() {
  return (
    <>
      {/* Carries FAQPage structured data alongside the restaurant graph. */}
      <StorefrontJsonLd page="support" />
      <StaticPageChrome
        active="/support"
        eyebrow={page.eyebrow}
        title={page.title}
        copy={page.copy}
        cta={{ href: '/#/self-order?page=support', label: 'Open help centre' }}
      >
        <section className="static-faq">
          {page.faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
      </StaticPageChrome>
    </>
  );
}
