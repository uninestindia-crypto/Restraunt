// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { getSetting, setSetting } from '../../db/database';
import { showToast, playSound, vibrateDevice } from '../../utils/helpers';

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
    restaurantName: '',
    restaurantTagline: ''
  });
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
    } catch (err) {
      console.error('[BrandingView] Load config failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // Simple QR placeholder renderer
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      showToast('Logo file must be under 1MB', 'error');
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setConfig(prev => ({ ...prev, brandLogoBase64: base64 }));
      showToast('Logo loaded — save to apply', 'info');
    } catch {
      showToast('Failed to read file', 'error');
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Banner file must be under 2MB', 'error');
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setConfig(prev => ({ ...prev, brandBannerBase64: base64 }));
      showToast('Banner loaded — save to apply', 'info');
    } catch {
      showToast('Failed to read file', 'error');
    }
  };

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
    <div className="settings-container" style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '24px', display: 'flex', alignItems: 'center' }}>
        <span className="material-symbols-rounded" style={{ fontSize: '22px', marginRight: '8px', color: 'var(--color-primary)' }}>palette</span>
        Storefront Branding
      </div>

      {/* Logo Upload */}
      <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>image</span>
          Restaurant Logo
        </h3>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            onClick={() => logoInputRef.current?.click()}
            style={{
              width: '120px', height: '120px', borderRadius: 'var(--radius-lg)',
              border: '2px dashed var(--border-glass)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-card)',
              cursor: 'pointer', transition: 'all 0.25s ease', flexShrink: 0
            }}
            title="Click to upload logo"
          >
            {config.brandLogoBase64 ? (
              <img src={config.brandLogoBase64} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '32px' }}>add_photo_alternate</span>
                <div style={{ fontSize: '0.65rem', marginTop: '4px', fontWeight: 600 }}>Upload Logo</div>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px', fontWeight: 500 }}>
              Upload your restaurant logo. It will appear on the customer-facing kiosk, receipts (if enabled), and invoices.
              Recommended: 512×512px PNG or SVG with transparent background.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => logoInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>upload</span>
                Choose File
              </button>
              {config.brandLogoBase64 && (
                <button onClick={() => setConfig(prev => ({ ...prev, brandLogoBase64: '' }))} className="btn btn-secondary btn-sm" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
      <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <h3 className="settings-card-heading" style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>colorize</span>
          Brand Colors
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0', fontWeight: 500 }}>
          These colors are applied to the customer-facing kiosk/ordering page.
        </p>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { id: 'brandAccentColor', label: 'Primary Accent' },
            { id: 'brandSecondaryColor', label: 'Secondary Accent' },
            { id: 'brandBgGradientStart', label: 'Background Start' },
            { id: 'brandBgGradientEnd', label: 'Background End' }
          ].map(picker => (
            <div key={picker.id} className="input-group" style={{ flex: 1, minWidth: '160px' }}>
              <label htmlFor={picker.id}>{picker.label}</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  id={picker.id}
                  value={config[picker.id]}
                  onChange={(e) => handleColorChange(picker.id as any, e.target.value)}
                  style={{
                    border: '1px solid var(--border-glass)', background: 'none',
                    width: '42px', height: '42px', borderRadius: 'var(--radius-md)',
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
                  style={{ maxWidth: '100px', textTransform: 'uppercase', textAlign: 'center' }}
                />
              </div>
            </div>
          ))}
        </div>
        {/* Color Preview */}
        <div style={{ marginTop: '16px', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-glass)', overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(135deg, ${config.brandBgGradientStart}, ${config.brandBgGradientEnd})`,
            zIndex: 0
          }}></div>
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-lg)', color: config.brandAccentColor, letterSpacing: '-0.02em' }}>
              {config.restaurantName || 'Your Restaurant'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: config.brandSecondaryColor, fontWeight: 600, marginTop: '4px' }}>
              {config.restaurantTagline || 'Your Tagline'}
            </div>
          </div>
        </div>
      </div>

      {/* Kiosk Display Text */}
      <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>storefront</span>
          Kiosk Display Text
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="input-group">
            <label htmlFor="brandKioskWelcome">Welcome Message</label>
            <input type="text" id="brandKioskWelcome" className="input" value={config.brandKioskWelcome} onChange={(e) => handleInputChange('brandKioskWelcome', e.target.value)} placeholder="Welcome! Browse our menu." />
          </div>
          <div className="input-group">
            <label htmlFor="brandKioskFooter">Kiosk Footer Text</label>
            <input type="text" id="brandKioskFooter" className="input" value={config.brandKioskFooter} onChange={(e) => handleInputChange('brandKioskFooter', e.target.value)} placeholder="© 2026 Your Restaurant. All rights reserved." />
          </div>
        </div>
      </div>

      {/* Promotional Banner */}
      <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <h3 className="settings-card-heading" style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>campaign</span>
          Promotional Banner
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0', fontWeight: 500 }}>
          Upload a hero banner image for the customer kiosk. Recommended: 1200×400px.
        </p>
        <div
          onClick={() => bannerInputRef.current?.click()}
          style={{
            width: '100%', minHeight: '120px', borderRadius: 'var(--radius-lg)',
            border: '2px dashed var(--border-glass)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-card)',
            cursor: 'pointer', transition: 'all 0.25s ease'
          }}
          title="Click to upload banner"
        >
          {config.brandBannerBase64 ? (
            <img src={config.brandBannerBase64} style={{ width: '100%', height: 'auto', maxHeight: '300px', objectFit: 'cover' }} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '36px' }}>panorama</span>
              <div style={{ fontSize: '0.7rem', marginTop: '6px', fontWeight: 600 }}>Click to upload promotional banner</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button onClick={() => bannerInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>upload</span>
            Upload Banner
          </button>
          {config.brandBannerBase64 && (
            <button onClick={() => setConfig(prev => ({ ...prev, brandBannerBase64: '' }))} className="btn btn-secondary btn-sm" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>delete</span>
              Remove
            </button>
          )}
        </div>
        <input ref={bannerInputRef} type="file" onChange={handleBannerUpload} accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} />
      </div>

      {/* Social Media Links */}
      <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <h3 className="settings-card-heading" style={{ margin: '0 0 16px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>share</span>
          Social Media & Platform Links
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { id: 'brandSocialInstagram', label: 'Instagram', placeholder: 'https://instagram.com/yourpage', emoji: '📸' },
            { id: 'brandSocialFacebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage', emoji: '📘' },
            { id: 'brandSocialGoogleMaps', label: 'Google Maps', placeholder: 'https://maps.google.com/...', emoji: '📍' },
            { id: 'brandSocialZomato', label: 'Zomato', placeholder: 'https://zomato.com/...', emoji: '🍽️' },
            { id: 'brandSocialSwiggy', label: 'Swiggy', placeholder: 'https://swiggy.com/...', emoji: '🛵' },
            { id: 'brandSocialWhatsApp', label: 'WhatsApp', placeholder: 'https://wa.me/91XXXXXXXXXX', emoji: '💬' }
          ].map(field => (
            <div key={field.id} className="input-group" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '1.2rem', flexShrink: 0, width: '28px', textAlign: 'center' }}>{field.emoji}</span>
              <div style={{ flex: 1 }}>
                <label htmlFor={field.id} style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{field.label}</label>
                <input type="url" id={field.id} className="input" value={config[field.id]} onChange={(e) => handleInputChange(field.id as any, e.target.value)} placeholder={field.placeholder} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code Download */}
      <div className="settings-card" style={{ background: 'var(--glass-bg)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <h3 className="settings-card-heading" style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>qr_code_2</span>
          Self-Order QR Code
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0', fontWeight: 500 }}>
          Download a printable QR code that customers can scan to open your online ordering page.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div id="branding-qr-preview" style={{
            width: '160px', height: '160px', background: 'white', borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border-glass)', padding: '12px'
          }}>
            <canvas ref={canvasRef} width="136" height="136"></canvas>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px', fontWeight: 500 }}>
              The QR code links to:<br />
              <code style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                {window.location.origin}/#/self-order
              </code>
            </div>
            <button onClick={handleQRDownload} className="btn btn-primary btn-sm" style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>download</span>
              Download QR Code (PNG)
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ marginTop: '8px', marginBottom: '30px' }}>
        <button onClick={handleSave} className="btn btn-primary btn-block btn-lg" style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 700, fontSize: 'var(--text-sm)', height: '48px',
          boxShadow: 'var(--shadow-primary)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-md)', color: '#fff'
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>save</span>
          Save Branding Settings
        </button>
      </div>
    </div>
  );
}
