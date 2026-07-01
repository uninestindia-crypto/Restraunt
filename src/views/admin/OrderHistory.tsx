// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, getOrder, getOrders, getSetting, updateOrderFields, updatePayment } from '../../db/database';
import { ReceiptBuilder } from '../../services/receipt';
import { printerService } from '../../services/printer';
import { sendBillOnWhatsApp } from '../../services/whatsapp';
import { authService } from '../../services/auth';
import { formatCurrency, formatDateTime, parseOrderItems, playSound, showToast, vibrateDevice } from '../../utils/helpers';

interface OrderItem {
  id?: number;
  orderNumber: string;
  createdAt: string;
  completedAt?: string;
  type: 'dinein' | 'takeaway' | 'delivery';
  total: number;
  subtotal: number;
  tax: number;
  deliveryFee?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  status: string;
  deliveryStatus?: string;
  deliveryStaffId?: number;
  deliveryStaffName?: string;
  deliveryNotes?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryLandmark?: string;
  paymentReference?: string;
  paymentVerifiedAt?: string;
  paymentVerifiedBy?: string;
}

export function OrderHistory() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [deliveryStaff, setDeliveryStaff] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Delivery assign modal select state
  const [selectedStaffId, setSelectedStaffId] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const ordersList = await getOrders();
      const staffList = (await db.staff.toArray())
        .filter((staff: any) => staff.role === 'delivery' && (staff.isActive === 1 || staff.isActive === true));
      setOrders(ordersList);
      setDeliveryStaff(staffList);
    } catch (err) {
      console.error('[OrderHistory] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return orders;
    return orders.filter(order => {
      return [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        order.type,
        order.paymentMethod,
        order.paymentStatus,
        order.deliveryStatus,
        order.deliveryStaffName
      ].some(value => String(value || '').toLowerCase().includes(query));
    });
  }, [orders, searchQuery]);

  // Sync selected order detailed view if list updates
  const activeOrderDetails = useMemo(() => {
    if (!selectedOrder) return null;
    return orders.find(o => o.id === selectedOrder.id) || selectedOrder;
  }, [orders, selectedOrder]);

  const handlePrintReceipt = async (order: OrderItem) => {
    if (!printerService.isConnected) {
      showToast('Printer is not connected', 'warning', 4000);
      return;
    }
    try {
      const settings = {
        restaurantName: await getSetting('restaurantName') || 'The Taste',
        restaurantTagline: await getSetting('restaurantTagline') || 'Fast Food & Chinese',
        restaurantPhone: await getSetting('restaurantPhone') || '',
        restaurantAddress: await getSetting('restaurantAddress') || '',
        printerWidth: await getSetting('printerWidth') || '58',
      };
      const latest = await getOrder(order.id!) || order;
      await printerService.print(ReceiptBuilder.orderReceipt(latest, settings));
      playSound(800, 80);
      vibrateDevice([30]);
      showToast('Receipt printed', 'success');
    } catch (err) {
      console.error('[OrderHistory] Print failed:', err);
      showToast('Failed to print receipt', 'error');
    }
  };

  const handleWhatsApp = async (order: OrderItem) => {
    const inputPhone = prompt('Enter customer WhatsApp number:', order.customerPhone || '');
    if (inputPhone === null) return;
    await sendBillOnWhatsApp(order, inputPhone);
    showToast('Opening WhatsApp...', 'success');
  };

  const markPaid = async (order: OrderItem, method: string) => {
    const reference = method === 'upi' ? (prompt('Enter UPI reference/UTR (optional):', order.paymentReference || '') || '') : '';
    const staff = authService.getCurrentStaff();
    await updatePayment(order.id!, method, 'paid', {
      paymentReference: reference,
      paymentVerifiedAt: new Date().toISOString(),
      paymentVerifiedBy: staff?.name || 'Staff',
      paymentCollectedAt: new Date().toISOString()
    });
    showToast('Payment marked paid', 'success');
    loadData();
  };

  const assignDelivery = async (order: OrderItem) => {
    if (!selectedStaffId) {
      showToast('Select delivery staff first', 'warning');
      return;
    }
    const staff = deliveryStaff.find(s => String(s.id) === String(selectedStaffId));
    if (!staff) return;
    await updateOrderFields(order.id!, {
      deliveryStaffId: staff.id,
      deliveryStaffName: staff.name,
      deliveryStatus: 'assigned',
      deliveryAssignedAt: new Date().toISOString()
    });
    showToast(`Assigned to ${staff.name}`, 'success');
    loadData();
  };

  const markOutForDelivery = async (order: OrderItem) => {
    if (!order.deliveryStaffId) {
      showToast('Assign delivery staff before dispatch', 'warning');
      return;
    }
    await updateOrderFields(order.id!, {
      deliveryStatus: 'out_for_delivery',
      deliveryOutAt: new Date().toISOString()
    });
    showToast('Order marked out for delivery', 'success');
    loadData();
  };

  const markDelivered = async (order: OrderItem) => {
    const updates = {
      deliveryStatus: 'delivered',
      deliveredAt: new Date().toISOString(),
      status: 'completed',
      completedAt: new Date().toISOString()
    };
    if (order.paymentStatus !== 'paid' && order.paymentMethod === 'cash') {
      Object.assign(updates, {
        paymentStatus: 'paid',
        paymentCollectedAt: new Date().toISOString(),
        paymentVerifiedAt: new Date().toISOString(),
        paymentVerifiedBy: authService.getCurrentStaff()?.name || 'Delivery'
      });
    }
    await updateOrderFields(order.id!, updates);
    showToast('Delivery completed', 'success');
    loadData();
  };

  const markDeliveryFailed = async (order: OrderItem) => {
    const reason = prompt('Reason for failed delivery:', order.deliveryNotes || '') || '';
    await updateOrderFields(order.id!, {
      deliveryStatus: 'failed',
      deliveryNotes: reason
    });
    showToast('Delivery marked failed', 'warning');
    loadData();
  };

  const handleVoidOrder = async (order: OrderItem) => {
    const staff = authService.getCurrentStaff();
    const role = staff?.role?.toLowerCase() || '';
    const allowCashierVoidVal = await getSetting('allowCashierVoid');
    const allowCashierVoid = allowCashierVoidVal === 'true' || allowCashierVoidVal === true;

    const canVoid = ['owner', 'manager'].includes(role) || (role === 'cashier' && allowCashierVoid);

    if (canVoid) {
      if (confirm('Are you sure you want to void this order? This action will cancel the order and mark it as refunded.')) {
        await executeVoid(order, staff);
      }
    } else {
      const pin = prompt('Voiding this order requires Manager or Owner authorization.\nPlease enter an authorized PIN:');
      if (!pin) return;

      const authStaff = await authService.getStaffByPin(pin);
      const isAuthorized = authStaff && ['owner', 'manager'].includes(authStaff.role?.toLowerCase());

      if (isAuthorized) {
        await executeVoid(order, authStaff);
      } else {
        playSound(300, 200, 'square');
        vibrateDevice([150]);
        showToast('Unauthorized PIN code', 'error');
      }
    }
  };

  const executeVoid = async (order: OrderItem, authorizedStaff: any) => {
    try {
      await updateOrderFields(order.id!, {
        status: 'cancelled',
        paymentStatus: 'refunded',
        completedAt: new Date().toISOString(),
        voidedBy: authorizedStaff.name,
        voidedById: authorizedStaff.id,
        isSynced: 0
      });

      await db.activityLog.add({
        staffId: authorizedStaff.id,
        action: `voided_order_${order.orderNumber}`,
        timestamp: new Date().toISOString()
      });

      playSound(900, 100);
      showToast(`Order voided by ${authorizedStaff.name}`, 'success');
      setSelectedOrder(null);
      loadData();
    } catch (e: any) {
      console.error(e);
      showToast('Failed to void order: ' + e.message, 'error');
    }
  };

  // Badges rendering
  const renderTypeBadge = (order: OrderItem) => {
    const labels = { dinein: 'Dine-In', takeaway: 'Pickup', delivery: 'Delivery' };
    return <span className="badge badge-primary">{labels[order.type] || order.type}</span>;
  };

  const renderPaymentBadge = (order: OrderItem) => {
    const paid = order.paymentStatus === 'paid';
    const pending = order.paymentStatus === 'pending';
    const label = `${(order.paymentMethod || 'unpaid').toUpperCase()} / ${(order.paymentStatus || 'unpaid').toUpperCase()}`;
    const cls = paid ? 'badge-success' : pending ? 'badge-warning' : 'badge-danger';
    return <span className={`badge ${cls}`}>{label}</span>;
  };

  const renderStatusBadge = (status: string) => {
    const cls = status === 'completed' || status === 'ready' ? 'badge-success' : status === 'preparing' ? 'badge-warning' : 'badge-danger';
    return <span className={`badge ${cls}`}>{status || 'pending'}</span>;
  };

  const renderDeliveryBadge = (order: OrderItem) => {
    if (order.type !== 'delivery') return <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Not delivery</span>;
    const status = order.deliveryStatus || 'pending';
    const cls = status === 'delivered' ? 'badge-success' : status === 'failed' ? 'badge-danger' : 'badge-warning';
    const driver = order.deliveryStaffName ? ` - ${order.deliveryStaffName}` : '';
    return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ') + driver}</span>;
  };

  if (loading) {
    return (
      <div className="main-area" style={{ padding: '28px 24px' }}>
        <div className="skeleton-card" style={{ height: '40px', width: '250px', borderRadius: '8px', marginBottom: '24px' }}></div>
        <div className="card skeleton-card" style={{ height: '350px', borderRadius: '12px' }}></div>
      </div>
    );
  }

  return (
    <div className="main-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header bar */}
      <div className="header-bar" style={{ padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="header-bar-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>receipt_long</span>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: 0 }}>Orders & Delivery ({filteredOrders.length})</h2>
        </div>
        <div className="input-group" style={{ maxWidth: '360px', margin: 0, position: 'relative' }}>
          <input
            id="order-search"
            className="input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order, customer, driver..."
            style={{ paddingLeft: '42px' }}
          />
          <span className="material-symbols-rounded" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '20px', color: 'var(--text-secondary)', pointerEvents: 'none' }}>search</span>
        </div>
      </div>

      {/* Orders Table */}
      <div className="table-container scrollbar-none" style={{ flex: 1, padding: '0 24px 20px 24px' }}>
        <table className="premium-table responsive-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Kitchen</th>
              <th>Delivery</th>
              <th className="txt-right">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="txt-center txt-muted" style={{ padding: '44px' }}>No matching orders found.</td>
              </tr>
            ) : (
              filteredOrders.map(order => (
                <tr key={order.id} className="order-row clickable-row" onClick={() => {
                  setSelectedOrder(order);
                  setSelectedStaffId(String(order.deliveryStaffId || ''));
                }} style={{ cursor: 'pointer' }}>
                  <td className="txt-primary txt-extrabold" data-label="Token">#{order.orderNumber.split('-').pop()}</td>
                  <td data-label="Date">{formatDateTime(order.createdAt)}</td>
                  <td className="txt-primary txt-bold" data-label="Type">{renderTypeBadge(order)}</td>
                  <td className="txt-brand txt-extrabold" data-label="Amount">{formatCurrency(order.total)}</td>
                  <td data-label="Payment">{renderPaymentBadge(order)}</td>
                  <td data-label="Kitchen">{renderStatusBadge(order.status)}</td>
                  <td data-label="Delivery">{renderDeliveryBadge(order)}</td>
                  <td className="txt-right" data-label="Receipt">
                    <button className="btn btn-secondary btn-sm print-btn" onClick={(e) => {
                      e.stopPropagation();
                      handlePrintReceipt(order);
                    }}>
                      <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>print</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && activeOrderDetails && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedOrder(null)}>
          <div className="modal" style={{ maxWidth: '560px', width: '100%', margin: '20px' }} onClick={(e) => e.stopPropagation()}>
            <header className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="txt-primary txt-bold" style={{ margin: 0 }}>Order #{activeOrderDetails.orderNumber.split('-').pop()}</h3>
                <div className="txt-muted txt-medium" style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>{formatDateTime(activeOrderDetails.createdAt)}</div>
              </div>
              <button className="btn-icon" onClick={() => setSelectedOrder(null)}>
                <span className="material-symbols-rounded">close</span>
              </button>
            </header>

            <main className="modal-body scrollbar-none flex-column-gap" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto', padding: '16px 0' }}>
              
              {/* Items Section */}
              <section className="order-detail-section" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Items</h4>
                {parseOrderItems(activeOrderDetails.items).map((item: any, idx: number) => (
                  <div key={idx} className="flex-row-between txt-secondary" style={{ fontSize: 'var(--text-sm)', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <strong className="txt-primary">{item.quantity || 1}x</strong> {item.itemName || item.name || 'Item'}
                      {item.notes && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', marginTop: '2px' }}>{item.notes}</div>}
                    </div>
                    <strong className="txt-primary">{formatCurrency((item.price || 0) * (item.quantity || 1))}</strong>
                  </div>
                ))}
              </section>

              {/* Bill Summary Section */}
              <section className="order-detail-section" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Bill</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--text-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><strong className="txt-primary">{formatCurrency(activeOrderDetails.subtotal)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><strong className="txt-primary">{formatCurrency(activeOrderDetails.tax)}</strong></div>
                  {activeOrderDetails.deliveryFee ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delivery fee</span><strong className="txt-primary">{formatCurrency(activeOrderDetails.deliveryFee)}</strong></div>
                  ) : null}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }} className="txt-brand txt-extrabold">
                    <span>Total</span><span>{formatCurrency(activeOrderDetails.total)}</span>
                  </div>
                </div>
              </section>

              {/* Customer Section */}
              <section className="order-detail-section" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Customer</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--text-sm)' }}>
                  <div><strong className="txt-primary">Name:</strong> {activeOrderDetails.customerName || 'Not provided'}</div>
                  <div><strong className="txt-primary">Phone:</strong> {activeOrderDetails.customerPhone || 'Not provided'}</div>
                  {activeOrderDetails.type === 'delivery' ? (
                    <>
                      <div><strong className="txt-primary">Address:</strong> {activeOrderDetails.deliveryAddress || 'Missing'}</div>
                      {activeOrderDetails.deliveryLandmark ? <div><strong className="txt-primary">Landmark:</strong> {activeOrderDetails.deliveryLandmark}</div> : null}
                    </>
                  ) : null}
                </div>
              </section>

              {/* Payment Section */}
              <section className="order-detail-section" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Payment</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {renderPaymentBadge(activeOrderDetails)}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {activeOrderDetails.paymentStatus !== 'paid' ? (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => markPaid(activeOrderDetails, 'upi')}>Verify UPI</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => markPaid(activeOrderDetails, 'cash')}>Collect Cash</button>
                      </>
                    ) : (
                      <span className="badge badge-success">
                        Verified {activeOrderDetails.paymentVerifiedAt ? formatDateTime(activeOrderDetails.paymentVerifiedAt) : ''}
                      </span>
                    )}
                  </div>
                </div>
              </section>

              {/* Delivery Dispatch Section */}
              {activeOrderDetails.type === 'delivery' ? (
                <section className="order-detail-section" style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Delivery Dispatch</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>{renderDeliveryBadge(activeOrderDetails)}</div>
                    <select
                      id="delivery-staff-select"
                      className="input"
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                    >
                      <option value="">Select delivery staff</option>
                      {deliveryStaff.map(staff => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name}{staff.phone ? ` (${staff.phone})` : ''}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => assignDelivery(activeOrderDetails)}>Assign</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => markOutForDelivery(activeOrderDetails)}>Out for Delivery</button>
                      <button className="btn btn-primary btn-sm" onClick={() => markDelivered(activeOrderDetails)}>Delivered</button>
                      <button className="btn btn-danger btn-sm" onClick={() => markDeliveryFailed(activeOrderDetails)}>Failed</button>
                    </div>
                  </div>
                </section>
              ) : null}
            </main>

            <footer className="modal-footer" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
              <button className="btn btn-primary btn-sm" onClick={() => handlePrintReceipt(activeOrderDetails)}>Print Receipt</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleWhatsApp(activeOrderDetails)}>WhatsApp Bill</button>
              {activeOrderDetails.status !== 'cancelled' ? (
                <button className="btn btn-danger btn-sm" onClick={() => handleVoidOrder(activeOrderDetails)} style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#FF4D4D' }}>Void Order</button>
              ) : null}
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedOrder(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
