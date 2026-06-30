import type { Metadata, Viewport } from 'next';
import '../styles/variables.css';
import '../styles/base.css';
import '../styles/components-v2.css';
import '../styles/layout.css';
import '../styles/sidebar.css';
import '../styles/storefront.css';

export const metadata: Metadata = {
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
