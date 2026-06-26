// @ts-nocheck
import QRCode from 'qrcode';
import { getSetting } from '../db/database';

/**
 * Build a UPI deep link URL.
 * @param {Object} params
 * @param {string} params.payeeVPA - UPI ID of the payee (e.g. 'thetaste@upi')
 * @param {string} params.payeeName - Display name of the payee
 * @param {number} [params.amount] - Payment amount
 * @param {string} [params.transactionNote] - Description / note
 * @param {string} [params.refId] - Transaction reference ID
 * @returns {string} UPI deep link URL
 */
export function buildUPILink({ payeeVPA, payeeName, amount, transactionNote, refId }) {
  const params = new URLSearchParams();
  params.set('pa', payeeVPA);
  params.set('pn', payeeName);
  if (amount) params.set('am', amount.toFixed(2));
  params.set('cu', 'INR');
  if (transactionNote) params.set('tn', transactionNote);
  if (refId) params.set('tr', refId);
  return `upi://pay?${params.toString()}`;
}

/**
 * Generate a UPI QR code and render it on a canvas element.
 * @param {HTMLCanvasElement} canvasElement - Target canvas
 * @param {Object} options
 * @param {number} options.amount - Payment amount
 * @param {string|number} options.orderId - Order identifier
 * @returns {Promise<string>} The UPI deep link URL
 */
export async function generateUPIQR(canvasElement, { amount, orderId }) {
  const upiId = (await getSetting('upiId')) || 'paytmqr6zfcsx@ptys';
  const upiName = (await getSetting('upiName')) || 'The Taste';

  const upiLink = buildUPILink({
    payeeVPA: upiId,
    payeeName: upiName,
    amount: amount,
    transactionNote: `Order #${orderId}`,
    refId: `TT${orderId}${Date.now()}`
  });

  await QRCode.toCanvas(canvasElement, upiLink, {
    width: 220,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    errorCorrectionLevel: 'M'
  });

  return upiLink;
}

/**
 * Generate a UPI QR code as a data URL (e.g. for printing or embedding).
 * @param {Object} options
 * @param {number} options.amount - Payment amount
 * @param {string|number} options.orderId - Order identifier
 * @returns {Promise<string>} Base64 data URL of the QR code
 */
export async function generateUPIQRDataURL({ amount, orderId }) {
  const upiId = (await getSetting('upiId')) || 'paytmqr6zfcsx@ptys';
  const upiName = (await getSetting('upiName')) || 'The Taste';

  const upiLink = buildUPILink({
    payeeVPA: upiId,
    payeeName: upiName,
    amount: amount,
    transactionNote: `Order #${orderId}`,
    refId: `TT${orderId}${Date.now()}`
  });

  return await QRCode.toDataURL(upiLink, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M'
  });
}
