import type { Metadata, Viewport } from 'next';
import { STORE_ORIGIN } from '../content/storefront';
// Only what the pre-rendered storefront paints with. The staff console's chrome —
// components-v2.css, layout.css, sidebar.css, 88 KB of it — is imported by main.ts instead, so it
// arrives with the app that uses it rather than blocking the render of a marketing page that never
// draws a sidebar. Lighthouse was reporting 590ms of unused CSS on the home page.
import '../styles/fonts.css';
import '../styles/variables.css';
import '../styles/base.css';
import '../styles/storefront.css';
import '../styles/storefront-static.css';

export const metadata: Metadata = {
  metadataBase: new URL(STORE_ORIGIN),
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  title: 'The Taste — Chinese Food | Fresh & Reasonable Restaurant in Patna',
  description: 'Welcome to The Taste — the best Chinese Food & Fast Food restaurant in Kumhrar, Patna. Serving fresh and reasonable delicacies since 2026. Order online or visit us on Sandalpur Road, Kumhrar.',
  keywords: 'The Taste Patna, Restaurant in Patna, Chinese Food Patna, Kumhrar Restaurant, Sandalpur Road Food, Fast Food Patna, Momos Patna, Veg and Chicken Momos, Online Food Delivery Patna',
  applicationName: 'The Taste Customer Platform',
  category: 'restaurant',
  openGraph: {
    title: 'The Taste - Order Indo-Chinese Food in Patna',
    description: 'Premium customer ordering, live tracking, rewards, offers, catering, and support for The Taste, Kumhrar.',
    type: 'website',
    locale: 'en_IN',
    siteName: 'The Taste',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Taste - Order Indo-Chinese Food in Patna',
    description: 'Order online, track your meal, earn rewards, and get support from The Taste.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'The Taste',
  },
  other: {
    'geo.region': 'IN-BR',
    'geo.placename': 'Patna',
    'geo.position': '25.5999;85.1818',
    ICBM: '25.5999, 85.1818',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FF6B35',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Text faces are self-hosted (see scripts/fetch-fonts.js) so first
            paint never blocks on a third-party origin and the PWA renders
            correctly offline. Preload only the latin subsets used above the
            fold; latin-ext loads on demand via its unicode-range. */}
        <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter-latin.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/plus-jakarta-sans-latin.woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
