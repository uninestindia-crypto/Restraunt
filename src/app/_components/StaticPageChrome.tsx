import type { ReactNode } from 'react';
import { STORE_PROFILE } from '../../content/storefront';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/menu', label: 'Menu' },
  { href: '/offers', label: 'Offers' },
  { href: '/about', label: 'Our story' },
  { href: '/catering', label: 'Catering' },
  { href: '/support', label: 'Help' }
];

/**
 * Chrome for the statically exported marketing pages.
 *
 * These pages are deliberately not the SPA: they are indexable, load without
 * the bundle, and hand off to the ordering app through a single explicit CTA.
 */
export function StaticPageChrome({
  eyebrow,
  title,
  copy,
  children,
  cta = { href: '/#/self-order', label: 'Order online' },
  active
}: {
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
  cta?: { href: string; label: string };
  active: string;
}) {
  return (
    <div className="static-page">
      <header className="static-page-nav">
        <a className="static-page-brand" href="/">
          <img src="/assets/the-taste-logo.png" alt="" width={28} height={28} />
          <span>{STORE_PROFILE.name.toUpperCase()}</span>
        </a>
        <nav aria-label="Main">
          {NAV.map(link => (
            <a
              key={link.href}
              href={link.href}
              aria-current={link.href === active ? 'page' : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a className="static-page-cta" href={cta.href}>{cta.label}</a>
      </header>

      <main className="static-page-main">
        <div className="static-page-hero">
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <p className="static-page-hero-copy">{copy}</p>
        </div>
        {children}
      </main>

      <footer className="static-page-foot">
        <div>
          <strong>{STORE_PROFILE.name.toUpperCase()}</strong>
          <p>
            {STORE_PROFILE.streetAddress}, {STORE_PROFILE.locality} {STORE_PROFILE.postalCode}
          </p>
        </div>
        <nav aria-label="Footer">
          {NAV.filter(link => link.href !== active).map(link => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
      </footer>
    </div>
  );
}
