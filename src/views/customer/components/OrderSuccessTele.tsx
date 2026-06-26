// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { getSetting } from '../../../db/database';
import { generateUPIQR } from '../../../services/upi';
import { formatCurrency } from '../../../utils/helpers';

export function OrderSuccessTele({ order, onOrderAgain }) {
  const canvasRef = useRef(null);
  const [upiId, setUpiId] = useState('Loading...');
  const [upiLink, setUpiLink] = useState('#');
  const [showPayBtn, setShowPayBtn] = useState(false);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(err => console.warn('Notification permission request failed:', err));
    }
  }, []);

  useEffect(() => {
    if (order && order.paymentMethod === 'upi' && canvasRef.current) {
      (async () => {
        const id = await getSetting('upiId') || 'paytmqr6zfcsx@ptys';
        setUpiId(id);
        
        try {
          const upiUrl = await generateUPIQR(canvasRef.current, {
            amount: order.total,
            orderId: order.orderNumber
          });
          setUpiLink(upiUrl);
          const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          setShowPayBtn(isMobile);
        } catch (e) {
          console.error('[Telemetry] Failed to render UPI QR:', e);
        }
      })();
    }
  }, [order, order?.paymentMethod]);

  const token = order.displayToken || order.orderNumber.split('-').pop();
  const deliveryText = order.type === 'delivery'
    ? 'Your order will be prepared and assigned to our delivery staff.'
    : order.type === 'takeaway'
      ? 'Please keep this token ready for pickup.'
      : 'Your table order has been sent to the kitchen.';

  // Map order status to progress metrics
  let percentage = 15;
  let label = 'Received';
  let icon = 'receipt';

  const orderStatus = (order.status || 'pending').toLowerCase();
  const delivStatus = (order.deliveryStatus || 'pending').toLowerCase();

  if (orderStatus === 'confirmed') {
    percentage = 30;
    label = 'Confirmed';
    icon = 'thumb_up';
  } else if (orderStatus === 'preparing' || orderStatus === 'cooking') {
    percentage = 60;
    label = 'Cooking';
    icon = 'skillet';
  } else if (orderStatus === 'plated' || orderStatus === 'ready') {
    percentage = 85;
    label = 'Plated';
    icon = 'room_service';
  } else if (orderStatus === 'dispatched' || delivStatus === 'dispatched' || delivStatus === 'out_for_delivery') {
    percentage = 92;
    label = 'En Route';
    icon = 'local_shipping';
  } else if (orderStatus === 'completed' || orderStatus === 'served' || delivStatus === 'delivered') {
    percentage = 100;
    label = 'Served';
    icon = 'check_circle';
  }

  const offset = 251.2 - (percentage / 100) * 251.2;

  // Prep status summary text
  const prepParts = [];
  if (order.estimatedPrepTime) prepParts.push(`Prep time: ${order.estimatedPrepTime} min`);
  prepParts.push(`Kitchen: ${order.status}`);
  if (order.type === 'delivery') prepParts.push(`Delivery: ${order.deliveryStatus || 'pending'}`);
  if (order.paymentStatus === 'paid') prepParts.push('Payment verified');
  const prepStatusText = prepParts.join(' | ');

  return (
    <div className="store-success-shell">
      <div className="store-success-panel animate-fade-in" style={{ padding: '24px' }}>
        <div className="aether-telemetry-ring-wrapper">
          <svg className="aether-telemetry-svg" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" className="aether-track" />
            <circle 
              cx="50" 
              cy="50" 
              r="40" 
              className="aether-fill" 
              style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 0.8s ease' }} 
            />
          </svg>
          <div className="aether-telemetry-ring-label">
            <span className="material-symbols-rounded" style={{ fontSize: '24px', display: 'block', margin: '0 auto 4px' }}>{icon}</span>
            <strong style={{ fontSize: '1.4rem', fontWeight: 800 }}>{percentage}%</strong>
            <small style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.8, display: 'block' }}>{label}</small>
          </div>
        </div>
        
        <p className="store-kicker" style={{ marginTop: '16px' }}>Live Order Telemetry</p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0' }}>Thank you, {order.customerName || 'guest'}</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 20px' }}>{deliveryText}</p>
        
        <div className="store-token" style={{ marginBottom: '24px' }}>
          <span>Token</span>
          <strong>{token}</strong>
        </div>

        {order.paymentMethod === 'upi' ? (
          <div className="store-payment-box" style={{ marginBottom: '24px' }}>
            <div className="store-upi-qr">
              <canvas ref={canvasRef} id="upi-qr" style={{ display: 'block', margin: '0 auto' }}></canvas>
            </div>
            <strong style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: '12px' }}>{formatCurrency(order.total)}</strong>
            <span id="upi-id-label" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{upiId}</span>
            
            {showPayBtn && (
              <div style={{ marginTop: '12px', width: '100%' }}>
                <a 
                  href={upiLink} 
                  className="btn btn-primary btn-block" 
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '44px', fontWeight: 700, background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', border: 'none', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)' }}
                >
                  <span className="material-symbols-rounded">open_in_new</span>
                  Pay via UPI App
                </a>
              </div>
            )}
            <p style={{ marginTop: '12px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>After paying, staff will verify UPI before marking this order as paid.</p>
          </div>
        ) : order.paymentMethod === 'card' ? (
          <div className="store-payment-box cash" style={{ borderColor: '#10B981', background: 'rgba(16, 185, 129, 0.04)', marginBottom: '24px' }}>
            <span className="material-symbols-rounded" aria-hidden="true" style={{ color: '#10B981', fontSize: '24px' }}>check_circle</span>
            <strong style={{ color: '#10B981', fontSize: 'var(--text-sm)', display: 'block', marginTop: '4px' }}>Online Payment Verified</strong>
            <p style={{ fontSize: 'var(--text-xs)' }}>Amount {formatCurrency(order.total)} paid via Credit/Debit card. Transaction Reference: {order.paymentReference}</p>
          </div>
        ) : (
          <div className="store-payment-box cash" style={{ marginBottom: '24px' }}>
            <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: '24px' }}>payments</span>
            <strong style={{ display: 'block', marginTop: '4px' }}>Cash on {order.type === 'delivery' ? 'Delivery' : 'Pickup'}</strong>
            <p style={{ fontSize: 'var(--text-xs)' }}>Payment will be collected and marked paid by staff.</p>
          </div>
        )}

        <div id="prep-status" className="store-prep-status" style={{ marginBottom: '24px', fontWeight: 600, fontSize: 'var(--text-xs)' }}>
          {prepStatusText}
        </div>
        <button 
          className="btn btn-secondary btn-block btn-lg" 
          id="btn-order-again" 
          onClick={onOrderAgain}
          type="button"
        >Order Something Else</button>
      </div>
    </div>
  );
}
