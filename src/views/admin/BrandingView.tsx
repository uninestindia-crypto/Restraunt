// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { db, getSetting, setSetting } from '../../db/database';
import { ensureFresh } from '../../services/cloudDb';
import { STOREFRONT_DEFAULTS, STOREFRONT_SETTING_KEYS, resolveStorefrontCopy } from '../../content/storefront';
import { showToast, playSound, vibrateDevice } from '../../utils/helpers';
import { compressImage, formatBytes } from '../../utils/imageProcessing';

interface BrandingConfig {
  brandLogoBase64: string;
  brandAccentColor: string;
  brandSecondaryColor: string;
  brandBgGradientStart: string;
  brandBgGradientEnd: string;
  brandSocialInstagram: string;
  brandSocialFacebook: string;
  brandSocialGoogleMaps: string;
  brandSocialZomato: string;
  brandSocialSwiggy: string;
  brandSocialWhatsApp: string;
  brandBannerBase64: string;
  brandKioskFooter: string;
  brandKioskWelcome: string;
  restaurantName: string;
  restaurantTagline: string;
}

export function BrandingView() {
  const [config, setConfig] = useState<BrandingConfig>({
    brandLogoBase64: '',
    brandAccentColor: '#FF5E36',
    brandSecondaryColor: '#FF8960',
    brandBgGradientStart: '#040406',
    brandBgGradientEnd: '#0B0B0F',
    brandSocialInstagram: '',
    brandSocialFacebook: '',
    brandSocialGoogleMaps: '',
    brandSocialZomato: '',
    brandSocialSwiggy: '',
    brandSocialWhatsApp: '',
    brandBannerBase64: '',
    brandKioskFooter: '',
    brandKioskWelcome: 'Welcome! Order delicious food.',
    restaurantName: 'The Taste',
    restaurantTagline: 'Chinese & Fast Food'
  });
  // Public storefront wording. Kept apart from `config` because it is merged
  // over shipped defaults rather than stored as a complete record.
  const [copy, setCopy] = useState(() => resolveStorefrontCopy({}));
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const keys = [
        'brandLogoBase64',
        'brandAccentColor',
        'brandSecondaryColor',
        'brandBgGradientStart',
        'brandBgGradientEnd',
        'brandSocialInstagram',
        'brandSocialFacebook',
        'brandSocialGoogleMaps',
        'brandSocialZomato',
        'brandSocialSwiggy',
        'brandSocialWhatsApp',
        'brandBannerBase64',
        'brandKioskFooter',
        'brandKioskWelcome',
        'restaurantName',
        'restaurantTagline',
      ];
      const newConfig = { ...config };
      for (const key of keys) {
        const val = await getSetting(key);
        if (val !== undefined && val !== null && val !== '') {
          newConfig[key] = val;
        }
      }
      setConfig(newConfig);

      const storedCopy: Record<string, any> = {};
      for (const key of Object.values(STOREFRONT_SETTING_KEYS)) {
        storedCopy[key] = await getSetting(key);
      }
      setCopy(resolveStorefrontCopy(storedCopy));
      await ensureFresh(['items']);
      setMenuItems(await db.menuItems.orderBy('sortOrder').toArray());
    } catch (err) {
      console.error('[BrandingView] Load config failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyChange = (field: string, value: any) => {
    setCopy(prev => ({ ...prev, [field]: value }));
  };

  const handleProofChange = (index: number, field: 'value' | 'label', value: string) => {
    setCopy(prev => ({
      ...prev,
      proofPoints: prev.proofPoints.map((point, i) => (i === index ? { ...point, [field]: value } : point))
    }));
  };

  const toggleFeaturedItem = (id: number) => {
    setCopy(prev => {
      const selected = prev.featuredItemIds.includes(id);
      if (selected) {
        return { ...prev, featuredItemIds: prev.featuredItemIds.filter(itemId => itemId !== id) };
      }
      // Six is what the storefront row renders; beyond that the picks are ignored.
      if (prev.featuredItemIds.length >= 6) {
        showToast('Six featured dishes is the maximum. Remove one first.', 'warning');
        return prev;
      }
      return { ...prev, featuredItemIds: [...prev.featuredItemIds, id] };
    });
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const drawQRPlaceholder = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const url = `${window.location.origin}/#/self-order`;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 136, 136);
    ctx.fillStyle = '#000000';

    const size = 136;
    const modules = 21;
    const moduleSize = size / modules;

    const drawFinder = (x: number, y: number) => {
      ctx.fillRect(x, y, moduleSize * 7, moduleSize * 7);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x + moduleSize, y + moduleSize, moduleSize * 5, moduleSize * 5);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + moduleSize * 2, y + moduleSize * 2, moduleSize * 3, moduleSize * 3);
    };

    drawFinder(0, 0);
    ctx.fillStyle = '#000000';
    drawFinder(moduleSize * 14, 0);
    ctx.fillStyle = '#000000';
    drawFinder(0, moduleSize * 14);

    const hash = url.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    for (let i = 8; i < 13; i++) {
      for (let j = 8; j < 13; j++) {
        if ((hash + i * j) % 3 === 0) {
          ctx.fillRect(j * moduleSize, i * moduleSize, moduleSize, moduleSize);
        }
      }
    }

    for (let i = 8; i < 13; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(i * moduleSize, 6 * moduleSize, moduleSize, moduleSize);
        ctx.fillRect(6 * moduleSize, i * moduleSize, moduleSize, moduleSize);
      }
    }
  };

  useEffect(() => {
    if (!loading) {
      drawQRPlaceholder();
    }
  }, [loading]);

  /**
   * Branding art is stored inline in settings, so it is downscaled here
   * instead of being rejected for its file size.
   */
  const handleBrandingImageUpload = async (e, field, label, limits) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const optimised = await compressImage(file, limits);
      setConfig(prev => ({ ...prev, [field]: optimised.dataUrl }));
      showToast(
        `${label} optimised ${formatBytes(optimised.originalBytes)} → ${formatBytes(optimised.bytes)} — save to apply`,
        'info'
      );
    } catch (err: any) {
      showToast(`Could not use this ${label.toLowerCase()}: ${err?.message || err}`, 'error');
    } finally {
      input.value = '';
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) =>
    handleBrandingImageUpload(e, 'brandLogoBase64', 'Logo', { maxDimension: 512, maxBytes: 150 * 1024 });

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) =>
    handleBrandingImageUpload(e, 'brandBannerBase64', 'Banner', { maxDimension: 1600, maxBytes: 400 * 1024 });

  const handleColorChange = (field: keyof BrandingConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleInputChange = (field: keyof BrandingConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleQRDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'self-order-qr-code.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('QR Code downloaded!', 'success');
  };

  const handleSave = async () => {
    playSound(800, 100);
    vibrateDevice([50, 30]);

    const textFields = [
      'brandKioskWelcome', 'brandKioskFooter',
      'brandSocialInstagram', 'brandSocialFacebook',
      'brandSocialGoogleMaps', 'brandSocialZomato',
      'brandSocialSwiggy', 'brandSocialWhatsApp',
      'restaurantName', 'restaurantTagline'
    ];
    const colorFields = [
      'brandAccentColor', 'brandSecondaryColor',
      'brandBgGradientStart', 'brandBgGradientEnd',
    ];

    try {
      for (const f of textFields) {
        await setSetting(f, config[f].trim());
      }
      for (const f of colorFields) {
        await setSetting(f, config[f]);
      }
      await setSetting('brandLogoBase64', config.brandLogoBase64);
      await setSetting('brandBannerBase64', config.brandBannerBase64);

      // Storefront wording. Blank fields are stored as '' so the shipped
      // default takes over again rather than rendering an empty heading.
      await setSetting(STOREFRONT_SETTING_KEYS.heroKicker, copy.heroKicker.trim());
      await setSetting(STOREFRONT_SETTING_KEYS.heroCopy, copy.heroCopy.trim());
      await setSetting(STOREFRONT_SETTING_KEYS.heroCta, copy.heroCta.trim());
      await setSetting(STOREFRONT_SETTING_KEYS.featuredEyebrow, copy.featuredEyebrow.trim());
      await setSetting(STOREFRONT_SETTING_KEYS.featuredHeadline, copy.featuredHeadline.trim());
      await setSetting(STOREFRONT_SETTING_KEYS.menuEyebrow, copy.menuEyebrow.trim());
      await setSetting(STOREFRONT_SETTING_KEYS.menuHeadline, copy.menuHeadline.trim());
      await setSetting(STOREFRONT_SETTING_KEYS.footerCopy, copy.footerCopy.trim());
      await setSetting(
        STOREFRONT_SETTING_KEYS.proofPoints,
        copy.proofPoints
          .map(point => ({ value: String(point.value || '').trim(), label: String(point.label || '').trim() }))
          .filter(point => point.value && point.label)
      );
      await setSetting(STOREFRONT_SETTING_KEYS.featuredItemIds, copy.featuredItemIds);

      showToast('Branding settings saved! 🎨', 'success');
    } catch (err: any) {
      showToast('Save failed: ' + err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="settings-container" style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 24px' }}>
        <div className="skeleton-card" style={{ height: '40px', width: '200px', borderRadius: '8px', marginBottom: '24px' }}></div>
        <div className="card skeleton-card" style={{ height: '180px', borderRadius: '12px', marginBottom: '20px' }}></div>
        <div className="card skeleton-card" style={{ height: '180px', borderRadius: '12px' }}></div>
      </div>
    );
  }

  return (
    <div className="settings-container" style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '28px 24px',
      display: 'grid',
      gridTemplateColumns: '1.2fr 0.8fr',
      gap: '28px',
      alignItems: 'start'
    }}>
      
      {/* LEFT COLUMN: Controls & Input Forms */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>palette</span>
          Storefront Brand Customizer
        </div>

        {/* Identity Details */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>fingerprint</span>
            Storefront Identity
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="input-group">
              <label>Restaurant Name</label>
              <input type="text" className="input" value={config.restaurantName} onChange={(e) => handleInputChange('restaurantName', e.target.value)} placeholder="e.g. The Taste" />
            </div>
            <div className="input-group">
              <label>Tagline / Cuisine</label>
              <input type="text" className="input" value={config.restaurantTagline} onChange={(e) => handleInputChange('restaurantTagline', e.target.value)} placeholder="e.g. Chinese & Fast Food" />
            </div>
          </div>
        </div>

        {/* Logo Upload */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>image</span>
            Restaurant Brand Logo
          </h3>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              onClick={() => logoInputRef.current?.click()}
              style={{
                width: '100px', height: '100px', borderRadius: 'var(--radius-md)',
                border: '2.5px dashed var(--border-glass)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', overflow: 'hidden', background: 'rgba(0,0,0,0.2)',
                cursor: 'pointer', transition: 'all 0.2s ease', flexShrink: 0
              }}
              title="Click to upload logo"
            >
              {config.brandLogoBase64 ? (
                <img src={config.brandLogoBase64} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: '28px' }}>add_photo_alternate</span>
                  <div style={{ fontSize: '9px', marginTop: '4px', fontWeight: 700 }}>Upload Logo</div>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px', fontWeight: 500 }}>
                This logo represents your brand on the customer self-ordering portal, receipt bills, and invoice templates.
                Format: Transparent PNG/SVG — any size, it is optimised automatically.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => logoInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{ fontWeight: 700, fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>upload</span>
                  Upload
                </button>
                {config.brandLogoBase64 && (
                  <button onClick={() => setConfig(prev => ({ ...prev, brandLogoBase64: '' }))} className="btn btn-secondary btn-sm" style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-danger)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>delete</span>
                    Remove
                  </button>
                )}
              </div>
              <input ref={logoInputRef} type="file" onChange={handleLogoUpload} accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        {/* Brand Colors */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>colorize</span>
            Kiosk Interface Colors
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            {[
              { id: 'brandAccentColor', label: 'Primary Accent Theme' },
              { id: 'brandSecondaryColor', label: 'Secondary UI Accent' },
              { id: 'brandBgGradientStart', label: 'Kiosk Background Start' },
              { id: 'brandBgGradientEnd', label: 'Kiosk Background End' }
            ].map(picker => (
              <div key={picker.id} className="input-group">
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>{picker.label}</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    id={picker.id}
                    value={config[picker.id]}
                    onChange={(e) => handleColorChange(picker.id as any, e.target.value)}
                    style={{
                      border: '1px solid var(--border-glass)', background: 'none',
                      width: '38px', height: '38px', borderRadius: '8px',
                      cursor: 'pointer', padding: 0
                    }}
                  />
                  <input
                    type="text"
                    className="input"
                    value={config[picker.id]}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-F]{0,6}$/i.test(val)) {
                        handleColorChange(picker.id as any, val);
                      }
                    }}
                    placeholder={config[picker.id]}
                    style={{ textTransform: 'uppercase', textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 700 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Welcome Messages */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>chat_bubble</span>
            Kiosk Custom Messages
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="input-group">
              <label>Welcome Banner Text</label>
              <input type="text" className="input" value={config.brandKioskWelcome} onChange={(e) => handleInputChange('brandKioskWelcome', e.target.value)} placeholder="Welcome! Browse our menu." />
            </div>
            <div className="input-group">
              <label>kiosk Footer Text</label>
              <input type="text" className="input" value={config.brandKioskFooter} onChange={(e) => handleInputChange('brandKioskFooter', e.target.value)} placeholder="© 2026 Your Restaurant. All rights reserved." />
            </div>
          </div>
        </div>

        {/* Public storefront wording */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>storefront</span>
            Storefront Copy &amp; Highlights
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '8px 0 16px 0', fontWeight: 500 }}>
            The words customers read on the public website. Leave a field empty to fall back to the
            shipped default.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="input-group">
              <label htmlFor="sf-hero-copy">Hero paragraph</label>
              <textarea
                id="sf-hero-copy"
                className="input"
                rows={3}
                value={copy.heroCopy}
                onChange={(e) => handleCopyChange('heroCopy', e.target.value)}
                placeholder={STOREFRONT_DEFAULTS.heroCopy}
                style={{ resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="input-group">
                <label htmlFor="sf-hero-cta">Hero button label</label>
                <input id="sf-hero-cta" type="text" className="input" value={copy.heroCta} onChange={(e) => handleCopyChange('heroCta', e.target.value)} placeholder={STOREFRONT_DEFAULTS.heroCta} />
              </div>
              <div className="input-group">
                <label htmlFor="sf-featured-eyebrow">Highlights label</label>
                <input id="sf-featured-eyebrow" type="text" className="input" value={copy.featuredEyebrow} onChange={(e) => handleCopyChange('featuredEyebrow', e.target.value)} placeholder={STOREFRONT_DEFAULTS.featuredEyebrow} />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="sf-featured-headline">Highlights heading</label>
              <input id="sf-featured-headline" type="text" className="input" value={copy.featuredHeadline} onChange={(e) => handleCopyChange('featuredHeadline', e.target.value)} placeholder={STOREFRONT_DEFAULTS.featuredHeadline} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="input-group">
                <label htmlFor="sf-menu-eyebrow">Menu label</label>
                <input id="sf-menu-eyebrow" type="text" className="input" value={copy.menuEyebrow} onChange={(e) => handleCopyChange('menuEyebrow', e.target.value)} placeholder={STOREFRONT_DEFAULTS.menuEyebrow} />
              </div>
              <div className="input-group">
                <label htmlFor="sf-menu-headline">Menu heading</label>
                <input id="sf-menu-headline" type="text" className="input" value={copy.menuHeadline} onChange={(e) => handleCopyChange('menuHeadline', e.target.value)} placeholder={STOREFRONT_DEFAULTS.menuHeadline} />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="sf-footer-copy">Footer line</label>
              <input id="sf-footer-copy" type="text" className="input" value={copy.footerCopy} onChange={(e) => handleCopyChange('footerCopy', e.target.value)} placeholder={STOREFRONT_DEFAULTS.footerCopy} />
            </div>

            <fieldset style={{ border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '14px', margin: 0 }}>
              <legend style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', padding: '0 6px' }}>Proof points shown under the hero</legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {copy.proofPoints.map((point, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '0.6fr 1fr', gap: '10px' }}>
                    <input
                      type="text"
                      className="input"
                      value={point.value}
                      onChange={(e) => handleProofChange(index, 'value', e.target.value)}
                      aria-label={`Proof point ${index + 1} value`}
                      placeholder="30 min"
                      style={{ fontWeight: 700 }}
                    />
                    <input
                      type="text"
                      className="input"
                      value={point.label}
                      onChange={(e) => handleProofChange(index, 'label', e.target.value)}
                      aria-label={`Proof point ${index + 1} label`}
                      placeholder="Average delivery"
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            <fieldset style={{ border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '14px', margin: 0 }}>
              <legend style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', padding: '0 6px' }}>
                Featured dishes ({copy.featuredItemIds.length}/6)
              </legend>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                Pick up to six. With none selected the storefront falls back to its default picks.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                {menuItems.length === 0 ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No menu items yet.</span>
                ) : menuItems.map(item => {
                  const selected = copy.featuredItemIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleFeaturedItem(item.id)}
                      aria-pressed={selected}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--border-glass)'}`,
                        background: selected ? 'rgba(var(--color-primary-rgb), 0.15)' : 'transparent',
                        color: selected ? 'var(--color-primary)' : 'var(--text-secondary)'
                      }}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>

        {/* Promotional Carousel Banner */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>campaign</span>
            kiosk Advertising Banner
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '8px 0 16px 0', fontWeight: 500 }}>
            Upload a high-fidelity banner image representing special offers. Recommended size: 1200×400px.
          </p>
          
          <div
            onClick={() => bannerInputRef.current?.click()}
            style={{
              width: '100%', height: '140px', borderRadius: 'var(--radius-md)',
              border: '2.5px dashed var(--border-glass)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', overflow: 'hidden', background: 'rgba(0,0,0,0.2)',
              cursor: 'pointer', transition: 'all 0.25s ease'
            }}
            title="Click to upload banner"
          >
            {config.brandBannerBase64 ? (
              <img src={config.brandBannerBase64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '32px' }}>campaign</span>
                <div style={{ fontSize: '10px', marginTop: '4px', fontWeight: 700 }}>Click to upload promo banner</div>
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button onClick={() => bannerInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{ fontWeight: 700, fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>upload</span>
              Upload Banner
            </button>
            {config.brandBannerBase64 && (
              <button onClick={() => setConfig(prev => ({ ...prev, brandBannerBase64: '' }))} className="btn btn-secondary btn-sm" style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-danger)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>delete</span>
                Remove
              </button>
            )}
          </div>
          <input ref={bannerInputRef} type="file" onChange={handleBannerUpload} accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} />
        </div>

        {/* Social Channels */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>share</span>
            Social Media Integrations
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {[
              { id: 'brandSocialInstagram', label: 'Instagram Link', placeholder: 'https://instagram.com/page' },
              { id: 'brandSocialFacebook', label: 'Facebook Link', placeholder: 'https://facebook.com/page' },
              { id: 'brandSocialGoogleMaps', label: 'Google Maps Link', placeholder: 'https://maps.google.com/...' },
              { id: 'brandSocialZomato', label: 'Zomato Store Link', placeholder: 'https://zomato.com/...' },
              { id: 'brandSocialSwiggy', label: 'Swiggy Store Link', placeholder: 'https://swiggy.com/...' },
              { id: 'brandSocialWhatsApp', label: 'WhatsApp Number Link', placeholder: 'https://wa.me/91...' }
            ].map(field => (
              <div key={field.id} className="input-group">
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>{field.label}</label>
                <input type="url" className="input" value={config[field.id]} onChange={(e) => handleInputChange(field.id as any, e.target.value)} placeholder={field.placeholder} />
              </div>
            ))}
          </div>
        </div>

        {/* QR station */}
        <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>qr_code_2</span>
            Table Kiosk QR Code
          </h3>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ background: '#FFF', padding: '8px', borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px solid var(--border-glass)' }}>
              <canvas ref={canvasRef} width="110" height="110"></canvas>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '10px', fontWeight: 500 }}>
                Scan to access: <br />
                <code style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '10px' }}>{window.location.origin}/#/self-order</code>
              </p>
              <button onClick={handleQRDownload} className="btn btn-secondary btn-sm" style={{ fontWeight: 700, fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>download</span>
                Download QR Code
              </button>
            </div>
          </div>
        </div>

        {/* Global Save Button */}
        <button onClick={handleSave} className="btn btn-primary btn-block btn-lg" style={{
          fontWeight: 700, fontSize: 'var(--text-sm)', height: '48px',
          boxShadow: 'var(--shadow-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)', color: '#fff'
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>save</span>
          Save Brand Configuration
        </button>
      </div>

      {/* RIGHT COLUMN: Interactive Live Simulated Kiosk Mockup */}
      <div style={{ position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: '4px' }}>
          Live Storefront Simulator
        </div>

        <div style={{
          width: '100%',
          borderRadius: '24px',
          background: '#040406',
          border: '12px solid #1e1e24',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          aspectRatio: '9 / 14',
          position: 'relative'
        }}>
          
          {/* Mock Kiosk Header Bar */}
          <div style={{
            height: '4px',
            background: '#040406',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'absolute',
            top: 0,
            zIndex: 10
          }}>
            <div style={{ width: '40px', height: '2px', background: '#333', borderRadius: '10px' }} />
          </div>

          {/* Kiosk Storefront Screen Area */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: `linear-gradient(135deg, ${config.brandBgGradientStart || '#040406'}, ${config.brandBgGradientEnd || '#0B0B0F'})`,
            padding: '16px 12px',
            color: '#fff',
            overflow: 'hidden',
            fontFamily: 'var(--font-sans)',
            marginTop: '4px'
          }}>
            
            {/* Header Branding */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {config.brandLogoBase64 ? (
                  <img src={config.brandLogoBase64} style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'contain' }} />
                ) : (
                  <span className="material-symbols-rounded" style={{ fontSize: '18px', color: config.brandAccentColor }}>restaurant</span>
                )}
                <span style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                  {config.restaurantName || 'The Taste'}
                </span>
              </div>
              <span style={{
                fontSize: '7px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '2px 6px',
                borderRadius: '10px',
                fontWeight: 700
              }}>TABLE 5</span>
            </div>

            {/* Welcome message banner */}
            <div style={{ margin: '4px 0 12px 0' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'var(--font-display)', color: config.brandAccentColor, lineHeight: 1.2 }}>
                {config.brandKioskWelcome || 'Welcome!'}
              </div>
              <div style={{ fontSize: '9px', color: config.brandSecondaryColor || '#FF8960', fontWeight: 600, marginTop: '2px' }}>
                {config.restaurantTagline || 'Order Fresh Chinese & Fast Food'}
              </div>
            </div>

            {/* Promotional Carousel Ad */}
            <div style={{
              height: '76px',
              borderRadius: '8px',
              overflow: 'hidden',
              position: 'relative',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
              marginBottom: '14px'
            }}>
              {config.brandBannerBase64 ? (
                <img src={config.brandBannerBase64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '4px', opacity: 0.5 }}>
                  <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>campaign</span>
                  <span style={{ fontSize: '8px', fontWeight: 700 }}>Featured Ad Spot</span>
                </div>
              )}
            </div>

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '14px' }} className="scrollbar-none">
              {['All Items', '🍜 Momos', '🌶️ Starters', '🍜 Noodles'].map((cat, idx) => {
                const active = idx === 0;
                return (
                  <span key={cat} style={{
                    fontSize: '8px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    whiteSpace: 'nowrap',
                    background: active ? config.brandAccentColor : 'rgba(255,255,255,0.03)',
                    color: active ? '#fff' : '#94A3B8',
                    border: active ? 'none' : '1px solid rgba(255,255,255,0.04)'
                  }}>{cat}</span>
                );
              })}
            </div>

            {/* Dishes list items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }} className="scrollbar-none">
              {[
                { name: 'Veg Schezwan Noodles', price: '₹140', desc: 'Spicy stir-fried noodles with szechuan sauce' },
                { name: 'Steam Chicken Momos', price: '₹120', desc: 'Juicy steamed chicken dumplings with spicy red dip' }
              ].map(dish => (
                <div key={dish.name} style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255,255,255,0.04)'
                }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#F9FAFB' }}>{dish.name}</span>
                      <span style={{ fontSize: '8px', fontWeight: 800, color: config.brandSecondaryColor }}>{dish.price}</span>
                    </div>
                    <span style={{ fontSize: '7px', color: '#94A3B8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dish.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Social channels display */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '12px',
              paddingTop: '8px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              marginTop: '12px'
            }}>
              {config.brandSocialInstagram && <span style={{ fontSize: '10px' }}>📸</span>}
              {config.brandSocialFacebook && <span style={{ fontSize: '10px' }}>📘</span>}
              {config.brandSocialWhatsApp && <span style={{ fontSize: '10px' }}>💬</span>}
              {config.brandSocialGoogleMaps && <span style={{ fontSize: '10px' }}>📍</span>}
            </div>

            {/* Kiosk Footer */}
            <div style={{
              textAlign: 'center',
              fontSize: '6px',
              color: '#575765',
              marginTop: '6px',
              fontWeight: 600
            }}>
              {config.brandKioskFooter || 'Powered by NextGenOS'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
