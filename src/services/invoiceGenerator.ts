// @ts-nocheck
import { escapeHtml } from '../utils/helpers';

export class InvoiceGenerator {
  /**
   * Generates a complete, self-contained HTML document for a premium invoice
   * based on order details and admin settings.
   * 
   * @param {Object} order - The order record
   * @param {Object} settings - All admin settings
   * @param {string} [upiQrDataUrl] - Base64 Data URL of the UPI QR Code
   * @returns {string} Fully styled HTML string
   */
  static generateInvoiceHTML(order, settings, upiQrDataUrl = '') {
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    const subtotal = order.subtotal || 0;
    const tax = order.tax || 0;
    const total = order.total || 0;
    const orderNum = order.orderNumber || '0000';
    const displayToken = orderNum.split('-').pop();

    // Load custom settings with defaults
    const template = settings.invoiceTemplate || 'minimalist';
    const primaryColor = settings.invoicePrimaryColor || '#FF5E36';
    const fontFamily = settings.invoiceFontFamily || 'sans-serif';
    const logoUrl = settings.invoiceLogoUrl || '';
    const title = settings.invoiceTitle || 'TAX INVOICE';
    const terms = settings.invoiceTerms || '1. Goods once sold cannot be returned.\n2. Please check bill before leaving.';
    const showSignature = settings.invoiceShowSignature === 'true' || settings.invoiceShowSignature === true;
    const signatureText = settings.invoiceSignatureText || 'Authorized Signatory';
    const showGrid = settings.invoiceShowGrid !== 'false' && settings.invoiceShowGrid !== false;
    const showWatermark = settings.invoiceShowWatermark === 'true' || settings.invoiceShowWatermark === true;
    const showUpiQr = (settings.invoiceShowUpiQr === 'true' || settings.invoiceShowUpiQr === true) && upiQrDataUrl;

    // Font configurations
    let fontImports = '';
    let fontStyle = '';
    if (fontFamily === 'serif') {
      fontImports = `<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">`;
      fontStyle = `font-family: 'EB Garamond', 'Georgia', serif;`;
    } else if (fontFamily === 'monospace') {
      fontImports = `<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet">`;
      fontStyle = `font-family: 'JetBrains Mono', 'Courier New', monospace;`;
    } else if (fontFamily === 'slab') {
      fontImports = `<link href="https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">`;
      fontStyle = `font-family: 'Roboto Slab', serif;`;
    } else { // default sans-serif
      fontImports = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">`;
      fontStyle = `font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;`;
    }

    // Dynamic classes/styles for templates
    let themeStyles = '';
    if (template === 'luxury') {
      themeStyles = `
        .invoice-container {
          border: 1px solid rgba(212, 175, 55, 0.4);
          background: #FCFCF9;
          box-shadow: 0 20px 40px rgba(0,0,0,0.05);
          padding: 50px 40px;
        }
        .header-title {
          font-family: 'Playfair Display', serif;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #1a1a1a;
          border-bottom: 2px double ${primaryColor};
          padding-bottom: 6px;
          display: inline-block;
        }
        .invoice-title {
          font-family: 'Playfair Display', serif;
          color: ${primaryColor};
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }
        .elegant-divider {
          border-top: 1px solid rgba(212, 175, 55, 0.3);
          border-bottom: 1px solid rgba(212, 175, 55, 0.3);
          height: 3px;
          margin: 20px 0;
        }
        .items-table th {
          border-bottom: 2px solid ${primaryColor};
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 11px;
          color: #1a1a1a;
          font-weight: 700;
          background: transparent;
        }
        .items-table td {
          border-bottom: 1px solid #e8e6df;
        }
        .badge-status {
          border: 1px solid ${primaryColor};
          background: transparent;
          color: #1a1a1a;
          font-family: 'Playfair Display', serif;
          font-style: italic;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `;
    } else if (template === 'executive') {
      themeStyles = `
        .invoice-container {
          border-top: 8px solid ${primaryColor};
          background: #ffffff;
          padding: 40px;
        }
        .invoice-title {
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.03em;
        }
        .items-table th {
          background: ${primaryColor};
          color: #ffffff;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.05em;
          border: none;
        }
        .items-table tr:nth-child(even) {
          background-color: #f8fafc;
        }
        .badge-status {
          background: ${primaryColor};
          color: #ffffff;
          border-radius: 4px;
          font-weight: 700;
        }
        .info-grid {
          background: #f1f5f9;
          border-radius: 8px;
          padding: 20px;
          border-left: 4px solid ${primaryColor};
        }
      `;
    } else if (template === 'chic') {
      themeStyles = `
        .invoice-container {
          border-radius: 20px;
          background: #FDFBF7;
          border: 1px solid #f3ebe1;
          padding: 40px;
          box-shadow: 0 15px 35px rgba(224, 169, 109, 0.08);
        }
        .invoice-title {
          color: ${primaryColor};
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .items-table {
          border-radius: 12px;
          overflow: hidden;
        }
        .items-table th {
          background: rgba(224, 169, 109, 0.1);
          color: #634a35;
          font-weight: 700;
          border-bottom: 2px solid ${primaryColor}22;
        }
        .badge-status {
          background: rgba(224, 169, 109, 0.15);
          color: ${primaryColor};
          font-weight: 600;
        }
        .signature-line {
          border-bottom-style: dashed;
        }
      `;
    } else { // minimalist
      themeStyles = `
        .invoice-container {
          background: #ffffff;
          padding: 45px;
        }
        .invoice-title {
          font-weight: 800;
          color: #111827;
          letter-spacing: -0.04em;
        }
        .items-table th {
          border-bottom: 2px solid #111827;
          color: #111827;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
        }
        .items-table td {
          border-bottom: 1px solid #f3f4f6;
        }
        .badge-status {
          background: #f3f4f6;
          color: #1f2937;
          border: 1px solid #e5e7eb;
          font-weight: 600;
        }
      `;
    }

    const currencySymbol = settings.currencySymbol || '₹';

    // Build invoice items table rows
    const rowsHtml = items.map((item, idx) => {
      const name = item.itemName || item.name || 'Item';
      const qty = item.quantity || item.qty || 1;
      const price = item.price || 0;
      const rowTotal = price * qty;
      return `
        <tr>
          <td style="text-align: center; width: 6%; color: #64748b;">${idx + 1}</td>
          <td style="text-align: left; font-weight: 600; color: #1e293b;">${escapeHtml(name)}</td>
          <td style="text-align: center; width: 12%; color: #475569;">${currencySymbol}${price.toFixed(2)}</td>
          <td style="text-align: center; width: 12%; color: #475569;">${qty}</td>
          <td style="text-align: right; width: 18%; font-weight: 700; color: #0f172a;">${currencySymbol}${rowTotal.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    // Format tax label
    const taxLabel = settings.taxLabel ? `${settings.taxLabel} (${settings.gstPercent || 5}%)` : (settings.gstPercent ? `GST (${settings.gstPercent}%)` : 'GST');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(title)} #${orderNum}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          ${fontImports}
          <style>
            /* Base reset & typography */
            body {
              margin: 0;
              padding: 0;
              background-color: #f8fafc;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              ${fontStyle}
              font-size: 13px;
              color: #334155;
              line-height: 1.5;
            }

            .invoice-container {
              position: relative;
              max-width: 800px;
              margin: 0 auto;
              box-sizing: border-box;
              min-height: 297mm; /* standard A4 height ratio placeholder */
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }

            /* Watermark design */
            ${showWatermark ? `
            .invoice-container::before {
              content: "${escapeHtml(settings.restaurantName || 'PAID')}";
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-35deg);
              font-size: 80px;
              font-weight: 900;
              opacity: 0.04;
              color: ${primaryColor};
              z-index: 0;
              pointer-events: none;
              white-space: nowrap;
              letter-spacing: 0.1em;
              text-transform: uppercase;
            }
            ` : ''}

            .invoice-content {
              position: relative;
              z-index: 1;
            }

            /* Custom Grid borders option */
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 24px;
              margin-bottom: 24px;
            }
            .items-table th {
              padding: 12px 14px;
              text-align: left;
              font-size: 12px;
            }
            .items-table td {
              padding: 12px 14px;
              border-bottom: 1px solid #f1f5f9;
            }
            ${showGrid ? `
              .items-table td, .items-table th {
                border: 1px solid #e2e8f0;
              }
            ` : ''}

            /* Badges */
            .badge-status {
              display: inline-block;
              padding: 4px 10px;
              font-size: 10px;
              border-radius: 9999px;
              text-transform: uppercase;
              font-weight: 800;
              letter-spacing: 0.05em;
            }

            /* UPI and QR structures */
            .upi-qr-box {
              border: 1px solid #e2e8f0;
              background: #fff;
              border-radius: 8px;
              padding: 10px;
              display: inline-block;
              text-align: center;
            }
            .upi-qr-image {
              width: 100px;
              height: 100px;
              display: block;
              margin: 0 auto 6px auto;
            }

            /* Structure elements */
            .row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
            }
            .col {
              flex: 1;
            }
            .text-right { text-align: right; }
            .text-center { text-align: center; }

            /* Signature Block */
            .signature-container {
              margin-top: 40px;
              text-align: right;
            }
            .signature-line {
              display: inline-block;
              width: 180px;
              border-bottom: 1px solid #94a3b8;
              margin-bottom: 6px;
            }
            .signature-label {
              font-size: 11px;
              color: #64748b;
              font-weight: 600;
            }

            /* Custom themes injection */
            ${themeStyles}

            @media print {
              body {
                background: #fff;
                padding: 0;
              }
              .invoice-container {
                box-shadow: none;
                border: none;
                padding: 0;
                width: 100%;
                min-height: auto;
              }
              button, .no-print {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="invoice-container">
            <div class="invoice-content">
              <!-- Top Branding Header -->
              <div class="row" style="align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 30px;">
                <div style="display: flex; align-items: center; gap: 16px;">
                  ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" style="max-height: 60px; max-width: 160px; object-fit: contain;" />` : ''}
                  <div>
                    <h2 class="header-title" style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a;">
                      ${escapeHtml(settings.restaurantName || 'THE TASTE')}
                    </h2>
                    ${settings.restaurantTagline ? `<div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 2px;">${escapeHtml(settings.restaurantTagline)}</div>` : ''}
                  </div>
                </div>
                <div class="text-right">
                  <span class="invoice-title" style="font-size: 20px; font-weight: 800; display: block; margin-bottom: 4px;">
                    ${escapeHtml(title)}
                  </span>
                  <span style="font-size: 12px; color: #64748b; font-weight: bold; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">
                    Order #${orderNum}
                  </span>
                </div>
              </div>

              <!-- Info Columns Grid -->
              <div class="row info-grid" style="margin-bottom: 30px;">
                <div class="col">
                  <div style="font-size: 10px; text-transform: uppercase; font-weight: 800; color: #94a3b8; margin-bottom: 6px; letter-spacing: 0.05em;">Restaurant Details</div>
                  <div style="font-weight: 700; color: #1e293b;">${escapeHtml(settings.restaurantName || 'The Taste')}</div>
                  ${settings.showAddressOnReceipt !== 'false' && settings.restaurantAddress ? `<div style="font-size: 12px; margin-top: 4px; color: #475569;">${escapeHtml(settings.restaurantAddress)}</div>` : ''}
                  ${settings.showPhoneOnReceipt !== 'false' && settings.restaurantPhone ? `<div style="font-size: 12px; margin-top: 2px; color: #475569;">Phone: ${escapeHtml(settings.restaurantPhone)}</div>` : ''}
                  ${settings.restaurantEmail ? `<div style="font-size: 12px; margin-top: 2px; color: #475569;">Email: ${escapeHtml(settings.restaurantEmail)}</div>` : ''}
                  ${settings.showGstinOnReceipt === 'true' && settings.gstin ? `<div style="font-size: 11px; margin-top: 4px; font-weight: 600; color: #334155;">GSTIN: ${escapeHtml(settings.gstin)}</div>` : ''}
                  ${settings.showFssaiOnReceipt === 'true' && settings.fssaiNumber ? `<div style="font-size: 11px; margin-top: 2px; font-weight: 600; color: #334155;">FSSAI: ${escapeHtml(settings.fssaiNumber)}</div>` : ''}
                </div>

                <div class="col" style="padding-left: 20px; border-left: 1px solid #e2e8f0;">
                  <div style="font-size: 10px; text-transform: uppercase; font-weight: 800; color: #94a3b8; margin-bottom: 6px; letter-spacing: 0.05em;">Billing To</div>
                  <div style="font-weight: 700; color: #1e293b;">${escapeHtml(order.customerName || 'Walk-in Customer')}</div>
                  ${order.customerPhone ? `<div style="font-size: 12px; margin-top: 4px; color: #475569;">Phone: ${escapeHtml(order.customerPhone)}</div>` : ''}
                  ${order.type === 'delivery' && order.deliveryAddress ? `<div style="font-size: 12px; margin-top: 4px; color: #475569;"><strong>Address:</strong> ${escapeHtml(order.deliveryAddress)}</div>` : ''}
                  ${order.tableId ? `<div style="font-size: 12px; margin-top: 4px; color: #475569;"><strong>Table / Section:</strong> Table ${escapeHtml(order.tableId)}</div>` : ''}
                </div>

                <div class="col text-right" style="max-width: 220px;">
                  <div style="font-size: 10px; text-transform: uppercase; font-weight: 800; color: #94a3b8; margin-bottom: 6px; letter-spacing: 0.05em;">Invoice Details</div>
                  <div style="font-size: 12px; color: #475569; margin-bottom: 3px;">
                    <strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                  <div style="font-size: 12px; color: #475569; margin-bottom: 3px;">
                    <strong>Time:</strong> ${new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style="font-size: 12px; color: #475569; margin-bottom: 6px;">
                    <strong>Type:</strong> <span style="text-transform: capitalize; font-weight: 600;">${order.type || 'takeaway'}</span>
                  </div>
                  <div>
                    <span class="badge-status">
                      ${(order.paymentStatus || 'unpaid').toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Items Table -->
              <table class="items-table">
                <thead>
                  <tr>
                    <th style="text-align: center; width: 6%;">#</th>
                    <th style="text-align: left;">Item Description</th>
                    <th style="text-align: center; width: 12%;">Price</th>
                    <th style="text-align: center; width: 12%;">Qty</th>
                    <th style="text-align: right; width: 18%;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>

              <!-- Bottom Layout Block: Terms / Signature & Totals -->
              <div class="row" style="margin-top: 30px; align-items: flex-start;">
                <!-- Left side: Terms & Conditions and/or UPI QR -->
                <div style="flex: 1.2; padding-right: 30px;">
                  ${showUpiQr ? `
                    <div style="display: flex; gap: 16px; margin-bottom: 20px; align-items: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #fff;">
                      <div class="upi-qr-box" style="border: none; padding: 0;">
                        <img class="upi-qr-image" src="${upiQrDataUrl}" alt="UPI QR Code" />
                      </div>
                      <div>
                        <div style="font-size: 12px; font-weight: 700; color: #1e293b;">Scan to Pay Instantly</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.4;">
                          Scan this QR code using any UPI app (GPay, PhonePe, Paytm) to make payment of <strong>${currencySymbol}${total.toFixed(2)}</strong>.
                        </div>
                      </div>
                    </div>
                  ` : ''}

                  ${terms ? `
                    <div>
                      <div style="font-size: 10px; text-transform: uppercase; font-weight: 800; color: #94a3b8; margin-bottom: 6px; letter-spacing: 0.05em;">Terms & Conditions</div>
                      <div style="font-size: 11px; color: #64748b; white-space: pre-line; line-height: 1.5;">${escapeHtml(terms)}</div>
                    </div>
                  ` : ''}
                </div>

                <!-- Right side: Summary / Totals -->
                <div style="flex: 0.8; max-width: 280px;">
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                      <span style="color: #64748b;">Subtotal</span>
                      <span style="font-weight: 600; color: #1e293b;">${currencySymbol}${subtotal.toFixed(2)}</span>
                    </div>
                    ${tax > 0 ? `
                      <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                        <span style="color: #64748b;">${escapeHtml(taxLabel)}</span>
                        <span style="font-weight: 600; color: #1e293b;">${currencySymbol}${tax.toFixed(2)}</span>
                      </div>
                    ` : ''}
                    <div style="border-top: 2px solid ${primaryColor}22; padding-top: 10px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                      <span style="font-weight: 800; color: #0f172a; font-size: 14px;">Total Amount</span>
                      <span style="font-weight: 800; color: ${primaryColor}; font-size: 18px;">${currencySymbol}${total.toFixed(2)}</span>
                    </div>
                    
                    <div style="margin-top: 12px; font-size: 10px; color: #64748b; text-align: center; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
                      Payment Mode: <strong style="text-transform: uppercase;">${escapeHtml(order.paymentMethod || 'None')}</strong>
                    </div>
                  </div>

                  ${showSignature ? `
                    <div class="signature-container">
                      <div class="signature-line"></div>
                      <div class="signature-label">${escapeHtml(signatureText)}</div>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- Invoice Footer -->
            ${settings.showFooterOnReceipt !== 'false' && settings.receiptFooter ? `
              <div class="elegant-divider" style="margin-top: 50px; margin-bottom: 10px;"></div>
              <div class="text-center no-print" style="font-size: 12px; font-style: italic; color: #94a3b8; padding-bottom: 20px;">
                ${escapeHtml(settings.receiptFooter)}
              </div>
            ` : ''}
          </div>
          
          <script>
            window.onload = function() {
              // Only trigger print dialog if not rendered as preview
              if (!window.location.search.includes('preview=true')) {
                window.print();
                setTimeout(() => window.close(), 600);
              }
            }
          </script>
        </body>
      </html>
    `;
  }
}
