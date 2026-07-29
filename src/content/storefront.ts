/**
 * Single source of truth for storefront marketing copy.
 *
 * The same text has to appear in three places that cannot import each other's
 * runtime: the statically exported HTML a crawler sees, the client SPA, and
 * the admin panel that edits it. Keeping the defaults here is what stops those
 * three from drifting apart.
 *
 * Everything in `STOREFRONT_SETTING_KEYS` is overridable per store from the
 * admin panel; the values below are what ships in the pre-rendered HTML.
 */

export const STORE_ORIGIN = 'https://thetaste.in';

export const STORE_PROFILE = {
  name: 'The Taste',
  tagline: 'Fast Food & Chinese',
  streetAddress: 'Sandalpur Road, Kumhrar',
  locality: 'Patna',
  region: 'Bihar',
  postalCode: '800026',
  country: 'IN',
  latitude: 25.5999,
  longitude: 85.1818,
  cuisines: ['Chinese', 'Indo-Chinese', 'Fast Food'],
  priceRange: '₹₹'
};

export interface ProofPoint {
  value: string;
  label: string;
}

export const STOREFRONT_DEFAULTS = {
  heroKicker: 'Order online from home',
  heroHeadline: 'The Taste',
  heroCopy:
    'Bold Indo-Chinese flavours, wok-tossed fresh and delivered hot. Your neighbourhood favourites, made the way they should be.',
  heroCta: 'Order now',
  menuEyebrow: 'Order online',
  menuHeadline: 'What are you craving today?',
  featuredEyebrow: 'Popular right now',
  featuredHeadline: 'The dishes Patna keeps coming back for',
  proofPoints: [
    { value: '30 min', label: 'Average delivery' },
    { value: '4.8 ★', label: 'Local favourite' },
    { value: '100%', label: 'Freshly prepared' }
  ] as ProofPoint[],
  featuredItemNames: [
    'Steamed Veg Momos',
    'Veg Hakka Noodles',
    'Chicken Hakka Noodles',
    'Cold Coffee',
    'Chilli Paneer Dry',
    'Chocolate Lava Cake'
  ],
  footerCopy: 'Wok-fresh Indo-Chinese comfort food from Kumhrar, Patna.',
  footerNote: 'Freshly prepared. Clearly priced. Made locally.'
};

/** Dexie `settings` keys the admin panel writes and the storefront reads. */
export const STOREFRONT_SETTING_KEYS = {
  heroKicker: 'storefrontHeroKicker',
  heroCopy: 'storefrontHeroCopy',
  heroCta: 'storefrontHeroCta',
  featuredEyebrow: 'storefrontFeaturedEyebrow',
  featuredHeadline: 'storefrontFeaturedHeadline',
  menuEyebrow: 'storefrontMenuEyebrow',
  menuHeadline: 'storefrontMenuHeadline',
  proofPoints: 'storefrontProofPoints',
  featuredItemIds: 'storefrontFeaturedItemIds',
  footerCopy: 'storefrontFooterCopy'
} as const;

function coerceText(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

/**
 * Merge stored admin overrides over the shipped defaults.
 * Accepts the raw shape Dexie hands back, including legacy/blank values.
 */
export function resolveStorefrontCopy(stored: Record<string, any> = {}) {
  let proofPoints = STOREFRONT_DEFAULTS.proofPoints;
  const rawProof = stored[STOREFRONT_SETTING_KEYS.proofPoints];
  if (Array.isArray(rawProof)) {
    const cleaned = rawProof
      .map(point => ({
        value: String(point?.value ?? '').trim(),
        label: String(point?.label ?? '').trim()
      }))
      .filter(point => point.value && point.label);
    if (cleaned.length) proofPoints = cleaned.slice(0, 4);
  }

  // `Number(null)` and `Number('')` are 0, which is a valid-looking Dexie key,
  // so blanks are rejected before conversion rather than after.
  const rawFeatured = stored[STOREFRONT_SETTING_KEYS.featuredItemIds];
  const featuredItemIds = Array.isArray(rawFeatured)
    ? rawFeatured
        .filter(id => typeof id === 'number' || (typeof id === 'string' && id.trim() !== ''))
        .map(Number)
        .filter(id => Number.isInteger(id) && id > 0)
    : [];

  return {
    heroKicker: coerceText(stored[STOREFRONT_SETTING_KEYS.heroKicker], STOREFRONT_DEFAULTS.heroKicker),
    heroCopy: coerceText(stored[STOREFRONT_SETTING_KEYS.heroCopy], STOREFRONT_DEFAULTS.heroCopy),
    heroCta: coerceText(stored[STOREFRONT_SETTING_KEYS.heroCta], STOREFRONT_DEFAULTS.heroCta),
    featuredEyebrow: coerceText(stored[STOREFRONT_SETTING_KEYS.featuredEyebrow], STOREFRONT_DEFAULTS.featuredEyebrow),
    featuredHeadline: coerceText(stored[STOREFRONT_SETTING_KEYS.featuredHeadline], STOREFRONT_DEFAULTS.featuredHeadline),
    menuEyebrow: coerceText(stored[STOREFRONT_SETTING_KEYS.menuEyebrow], STOREFRONT_DEFAULTS.menuEyebrow),
    menuHeadline: coerceText(stored[STOREFRONT_SETTING_KEYS.menuHeadline], STOREFRONT_DEFAULTS.menuHeadline),
    footerCopy: coerceText(stored[STOREFRONT_SETTING_KEYS.footerCopy], STOREFRONT_DEFAULTS.footerCopy),
    proofPoints,
    featuredItemIds
  };
}

/** Content for the statically rendered marketing pages and their SPA twins. */
export const STOREFRONT_PAGES = {
  offers: {
    slug: 'offers',
    eyebrow: 'Offers',
    title: 'More joy in every order',
    copy: 'Live offers are displayed here, while final eligibility and discount math stay server validated at checkout.',
    metaTitle: 'Offers & Deals — The Taste, Kumhrar Patna',
    metaDescription:
      'Current offers on Indo-Chinese food from The Taste in Kumhrar, Patna. Combo deals, first-order discounts and rewards, validated at checkout.'
  },
  about: {
    slug: 'about',
    eyebrow: 'Our story',
    title: 'Comfort food, cooked with character',
    copy: 'The Taste brings bold Indo-Chinese flavours to Patna with the warmth and consistency of a neighbourhood favourite.',
    metaTitle: 'Our Story — The Taste, Indo-Chinese Restaurant in Patna',
    metaDescription:
      'How The Taste cooks Indo-Chinese comfort food in Kumhrar, Patna: wok-fresh preparation, honest value, and a menu built around how our neighbourhood eats.',
    pillars: [
      {
        index: '01',
        title: 'Wok-fresh',
        copy: 'Every dish is prepared to order for aroma, texture, and heat that survives the journey home.'
      },
      {
        index: '02',
        title: 'Honest value',
        copy: 'Generous portions, clear pricing, and familiar food made without unnecessary theatre.'
      },
      {
        index: '03',
        title: 'Made locally',
        copy: 'We are rooted in Kumhrar and designed around the way our neighbourhood actually eats.'
      }
    ]
  },
  catering: {
    slug: 'catering',
    eyebrow: 'Catering',
    title: 'Big-table food without the fuss',
    copy: 'Office lunches, family celebrations, college events, and everything that deserves a generous spread.',
    metaTitle: 'Catering & Bulk Orders — The Taste, Patna',
    metaDescription:
      'Indo-Chinese catering in Patna for office lunches, family celebrations and college events. Share your date, guest count and budget with The Taste, Kumhrar.',
    panelTitle: 'Tell us about your gathering',
    panelCopy:
      'Share your date, guest count, preferences, and budget. Our team will help shape a menu that travels well.'
  },
  support: {
    slug: 'support',
    eyebrow: 'Help centre',
    title: 'We are here when you need us',
    copy: 'Quick answers and a direct line to the restaurant—no maze of support screens.',
    metaTitle: 'Help & Support — The Taste, Patna',
    metaDescription:
      'Order changes, tracking, payment methods, allergens and cancellations — answers and a direct line to The Taste in Kumhrar, Patna.',
    faqs: [
      [
        'Can I change an order?',
        'Contact the restaurant immediately after placing it. Changes depend on kitchen status.'
      ],
      [
        'How do I track my order?',
        'Your confirmation screen shows the latest status as the kitchen and delivery team update it.'
      ],
      [
        'Which payments are supported?',
        'Available payment methods are shown at checkout and may vary by fulfilment type.'
      ],
      [
        'Do you show allergens?',
        'Ask the restaurant before ordering if you have allergies. Allergen labels are being prepared for every menu item.'
      ],
      [
        'What is your cancellation policy?',
        'Cancellation depends on preparation status. Orders already cooking may not be cancellable.'
      ]
    ] as Array<[string, string]>
  }
} as const;

/** Routes emitted into the sitemap and linked from the static page chrome. */
export const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/menu', priority: '0.9', changefreq: 'daily' },
  { path: '/offers', priority: '0.8', changefreq: 'weekly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/catering', priority: '0.6', changefreq: 'monthly' },
  { path: '/support', priority: '0.5', changefreq: 'monthly' }
];
