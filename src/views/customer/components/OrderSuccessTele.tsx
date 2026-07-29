// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { getSetting } from '../../../db/database';
import { generateUPIQR } from '../../../services/upi';
import { fetchLiveOrder, getOrderTrackingState, saveCustomerReview, TRACKING_STEPS } from '../../../services/customerPlatform';
import { formatCurrency, parseOrderItems, showToast } from '../../../utils/helpers';

const Icon = ({ children }) => <span className="material-symbols-rounded" aria-hidden="true">{children}</span>;

export function OrderSuccessTele({ order, customer, supportPhone = '', onOrderAgain }) {
  const canvasRef = useRef(null);
  const [liveOrder, setLiveOrder] = useState(order);
  const [upiId, setUpiId] = useState('Loading...');
  const [upiLink, setUpiLink] = useState('#');
  const [showPayBtn, setShowPayBtn] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [reviewSaved, setReviewSaved] = useState(Boolean(order.customerRating));

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(err => console.warn('Notification permission request failed:', err));
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const updated = await fetchLiveOrder(liveOrder || order);
      if (active && updated) setLiveOrder(updated);
    };
    refresh();
    const interval = window.setInterval(refresh, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [order?.clientOrderId]);

  useEffect(() => {
    if (liveOrder && liveOrder.paymentMethod === 'upi' && canvasRef.current) {
      (async () => {
        const id = await getSetting('upiId') || '';
        setUpiId(id);
        try {
          const upiUrl = await generateUPIQR(canvasRef.current, {
            amount: liveOrder.total,
            orderId: liveOrder.orderNumber
          });
          setUpiLink(upiUrl);
          setShowPayBtn(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
        } catch (e) {
          console.error('[Telemetry] Failed to render UPI QR:', e);
        }
      })();
    }
  }, [liveOrder?.clientOrderId, liveOrder?.paymentMethod, liveOrder?.total]);

  const tracking = getOrderTrackingState(liveOrder);
  const token = liveOrder.displayToken || String(liveOrder.orderNumber || '').split('-').pop();
  const items = parseOrderItems(liveOrder.items);
  const supportDigits = String(supportPhone).replace(/\D/g, '');
  const normalizedSupportPhone = supportDigits.length === 10 ? `91${supportDigits}` : supportDigits;
  const supportHref = /^\d{11,15}$/.test(normalizedSupportPhone)
    ? `https://wa.me/${normalizedSupportPhone}?text=${encodeURIComponent(`Hi, I need help with order ${liveOrder.orderNumber || token}`)}`
    : '';
  const etaLabel = tracking.etaMinutes ? `${tracking.etaMinutes}-${tracking.etaMinutes + 8} min` : 'Completed';

  const submitReview = async () => {
    const result = await saveCustomerReview({ order: liveOrder, rating, comment: review, customer });
    if (result.saved) {
      setReviewSaved(true);
      showToast(result.synced === false ? 'Review saved locally and will sync later.' : 'Thank you for the review!', 'success');
    } else {
      showToast('Could not save review yet.', 'warning');
    }
  };

  return (
    <div className="store-success-shell">
      <div className="store-success-panel customer-tracking-panel animate-fade-in">
        <section className="customer-tracking-hero">
          <div className="aether-telemetry-ring-wrapper">
            <svg className="aether-telemetry-svg" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" className="aether-track" />
              <circle
                cx="50"
                cy="50"
                r="40"
                className="aether-fill"
                style={{ strokeDashoffset: 251.2 - (tracking.progress / 100) * 251.2 }}
              />
            </svg>
            <div className="aether-telemetry-ring-label">
              <Icon>{tracking.icon}</Icon>
              <strong>{tracking.progress}%</strong>
              <small>{tracking.label}</small>
            </div>
          </div>

          <p className="store-kicker">Live order tracking</p>
          <h1>Thank you, {liveOrder.customerName || 'guest'}</h1>
          <p>{liveOrder.type === 'delivery' ? 'We will keep this page updated from kitchen prep to doorstep.' : liveOrder.type === 'takeaway' ? 'Keep this token ready for pickup.' : 'Your table order has been sent to the kitchen.'}</p>
          <div className="store-token"><span>Token</span><strong>{token}</strong></div>
        </section>

        <section className="customer-tracking-summary" aria-label="Order status summary">
          <div><small>ETA</small><strong>{etaLabel}</strong></div>
          <div><small>Payment</small><strong>{liveOrder.paymentStatus || 'unpaid'}</strong></div>
          <div><small>Delivery</small><strong>{liveOrder.deliveryStatus || 'none'}</strong></div>
        </section>

        <section className="customer-tracking-timeline" aria-label="Order timeline">
          {TRACKING_STEPS.map((step, index) => (
            <div key={step.key} className={`customer-tracking-step ${index <= tracking.activeIndex ? 'is-complete' : ''} ${index === tracking.activeIndex ? 'is-active' : ''}`}>
              <span><Icon>{step.icon}</Icon></span>
              <strong>{step.label}</strong>
            </div>
          ))}
        </section>

        <section className="customer-receipt-card">
          <div className="customer-section-title"><div><small>Receipt</small><h2>{formatCurrency(liveOrder.total || 0)}</h2></div><Icon>receipt_long</Icon></div>
          <div className="customer-receipt-items">
            {items.map((item, index) => (
              <div key={`${item.itemId || item.itemName || index}`}>
                <span>{item.quantity || 1}x {item.itemName || item.name || 'Menu item'}</span>
                <strong>{formatCurrency((item.price || 0) * (item.quantity || 1))}</strong>
              </div>
            ))}
          </div>
          <div className="customer-receipt-total"><span>Server-validated total</span><strong>{formatCurrency(liveOrder.total || 0)}</strong></div>
        </section>

        {liveOrder.paymentMethod === 'upi' && liveOrder.paymentStatus !== 'paid' && (
          <section className="store-payment-box customer-payment-card">
            <div className="store-upi-qr"><canvas ref={canvasRef} id="upi-qr"></canvas></div>
            <strong>{formatCurrency(liveOrder.total)}</strong>
            <span id="upi-id-label">{upiId}</span>
            {showPayBtn && <a href={upiLink} className="btn btn-primary btn-block">Pay via UPI App</a>}
            <p>After paying, staff will verify UPI before marking this order paid.</p>
          </section>
        )}

        {tracking.canReview && (
          <section className="customer-review-card">
            <div className="customer-section-title"><div><small>Review</small><h2>{reviewSaved ? 'Thanks for rating us' : 'How was your meal?'}</h2></div><Icon>reviews</Icon></div>
            {!reviewSaved ? (
              <>
                <div className="customer-rating-row">
                  {[1, 2, 3, 4, 5].map(star => <button key={star} type="button" className={star <= rating ? 'is-active' : ''} onClick={() => setRating(star)}>★</button>)}
                </div>
                <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="Optional note for the restaurant" rows="3" />
                <button type="button" className="store-primary-action" onClick={submitReview}>Submit review</button>
              </>
            ) : <p>Your feedback helps the kitchen keep improving.</p>}
          </section>
        )}

        <div className="customer-tracking-actions">
          {supportHref && <a href={supportHref}><Icon>support_agent</Icon> Get support</a>}
          <button className="btn btn-secondary btn-block btn-lg" id="btn-order-again" onClick={onOrderAgain} type="button">Order Something Else</button>
        </div>
      </div>
    </div>
  );
}
