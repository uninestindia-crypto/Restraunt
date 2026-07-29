import type { Metadata } from 'next';
import { StaticPageChrome } from '../_components/StaticPageChrome';
import { StorefrontJsonLd } from '../_components/StorefrontJsonLd';
import { STOREFRONT_PAGES } from '../../content/storefront';

const page = STOREFRONT_PAGES.about;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: '/about' },
  openGraph: { title: page.metaTitle, description: page.metaDescription, type: 'website' }
};

export default function AboutPage() {
  return (
    <>
      <StorefrontJsonLd page="about" />
      <StaticPageChrome active="/about" eyebrow={page.eyebrow} title={page.title} copy={page.copy}>
        <div className="static-pillars">
          {page.pillars.map(pillar => (
            <article key={pillar.index}>
              <span>{pillar.index}</span>
              <h2>{pillar.title}</h2>
              <p>{pillar.copy}</p>
            </article>
          ))}
        </div>
      </StaticPageChrome>
    </>
  );
}
