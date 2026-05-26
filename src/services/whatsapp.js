/**
 * ═══════════════════════════════════════════════════
 *  The Taste POS — WhatsApp Integration Service
 *  Module: WhatsApp Bill Formatting & Sharing (wa.me)
 *  Version: 1.0.0
 *  © 2026 The Taste. All Rights Reserved.
 * ═══════════════════════════════════════════════════
 */

import { getSetting } from '../db/database.js';

/**
 * Format order details into a clean, professional text receipt for WhatsApp
 * @param {Object} order - Order object
 * @param {Object} settings - Restaurant profile settings
 * @returns {string} Formatted WhatsApp message
 */
export function formatWhatsAppBill(order, settings = {}) {
  const restaurantName = settings.restaurantName || 'THE TASTE';
  const restaurantAddress = settings.restaurantAddress || '';
  const restaurantPhone = settings.restaurantPhone || '';
  const gstin = settings.restaurantGst || '';
  
  let text = `🍜 *${restaurantName.toUpperCase()}* — Order Receipt\n`;
  if (restaurantAddress) text += `📍 ${restaurantAddress}\n`;
  if (restaurantPhone) text += `📞 Phone: ${restaurantPhone}\n`;
  text += `━━━━━━━━━━━━━━━━\n`;
  text += `*Order:* #${order.orderNumber}\n`;
  text += `*Date:* ${new Date(order.createdAt).toLocaleString()}\n`;
  text += `*Type:* ${order.type === 'dine_in' ? 'Dine-In 🍽️' : 'Takeaway 🛍️'}\n`;
  if (order.customerName) text += `*Customer:* ${order.customerName}\n`;
  text += `━━━━━━━━━━━━━━━━\n`;
  
  if (Array.isArray(order.items)) {
    order.items.forEach(item => {
      text += `• ${item.name} x${item.quantity} — ₹${item.price * item.quantity}\n`;
    });
  }
  
  text += `━━━━━━━━━━━━━━━━\n`;
  text += `*Subtotal:* ₹${order.subtotal || 0}\n`;
  if (order.tax) text += `*GST/Tax:* ₹${order.tax || 0}\n`;
  text += `*TOTAL: ₹${order.total || 0}*\n`;
  text += `━━━━━━━━━━━━━━━━\n`;
  
  if (order.paymentStatus === 'paid') {
    text += `*Payment:* ${order.paymentMethod ? order.paymentMethod.toUpperCase() : 'Paid'} (PAID ✅)\n`;
  } else {
    text += `*Payment Status:* UNPAID ⚠️\n`;
  }
  
  if (gstin) text += `GSTIN: ${gstin}\n`;
  text += `━━━━━━━━━━━━━━━━\n`;
  text += `Thank you! Visit again! 🙏\n`;
  text += `*Order Online:* thetaste.co.in 🌐`;
  
  return text;
}

/**
 * Open WhatsApp wa.me share link
 * @param {Object} order - Order object
 * @param {string} [phoneNumber] - Customer's WhatsApp number
 */
export async function sendBillOnWhatsApp(order, phoneNumber = '') {
  // Fetch settings dynamically
  const settings = {
    restaurantName: await getSetting('restaurantName'),
    restaurantAddress: await getSetting('restaurantAddress'),
    restaurantPhone: await getSetting('restaurantPhone'),
    restaurantGst: await getSetting('restaurantGst')
  };

  const text = formatWhatsAppBill(order, settings);
  const encodedText = encodeURIComponent(text);
  
  // Clean phone number (keep only digits)
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  let url = `https://wa.me/`;
  if (cleanPhone) {
    // If not starting with country code, add 91 (India)
    const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    url += `${finalPhone}`;
  }
  url += `?text=${encodedText}`;
  
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
  return url;
}
