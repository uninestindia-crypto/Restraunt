// @ts-nocheck
/**
 * KitchenView — Kitchen Display System (KDS)
 * Kanban-style board for managing order preparation
 */

import { getOrders, updateOrderStatus, db } from '../../db/database';
import { escapeHtml, formatTime, parseOrderItems, showToast, playSound, vibrateDevice, reportStatusChange } from '../../utils/helpers';
import { orderNotificationService } from '../../services/orderNotification';
import { authService } from '../../services/auth';

export class KitchenView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.orders = [];
    this.refreshInterval = null;
    this.loading = null;
    this.onSyncDataChanged = null;
  }

  async mount(container) {
    this.container = container;
    this.render();

    // Open on the store's real state, not this device's cache.
    await this.loadOrders(true);

    // Realtime pushes drive the board; the poll below is only a safety net.
    this.onSyncDataChanged = (event) => {
      if (event.detail?.storeName !== 'orders') return;
      this.loadOrders();
    };
    window.addEventListener('sync-data-changed', this.onSyncDataChanged);

    this.refreshInterval = setInterval(() => this.loadOrders(true), 10000);
  }  render() {
    this.container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg-primary);">
        <!-- Sub-Header / Controls -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: var(--glass-bg); backdrop-filter: blur(20px); border-bottom: 1px solid var(--border-glass); z-index: 10;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-rounded" style="color: var(--color-primary-on-surface); font-size: 24px; filter: drop-shadow(0 0 8px rgba(var(--color-primary-rgb), 0.45));">restaurant</span>
            <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-lg); font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin: 0;">Kitchen Display System</h2>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-refresh-kds" style="
            min-height: 38px; 
            padding: 8px 16px; 
            gap: 6px; 
            border: 1px solid var(--border-glass); 
            background: rgba(255,255,255,0.02);
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
          ">
            <span class="material-symbols-rounded" style="font-size: 18px;">refresh</span>
            Refresh Board
          </button>
        </div>

        <!-- Kanban Board Grid -->
        <div style="flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 20px; overflow: hidden;" id="kds-grid-container">
          
          <!-- Column 1: New / Confirmed -->
          <div class="kds-col card-glass" style="
            display: flex; 
            flex-direction: column; 
            height: 100%; 
            border-radius: var(--radius-xl); 
            overflow: hidden; 
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid var(--border-glass);
            box-shadow: 0 15px 35px rgba(0,0,0,0.2);
          ">
            <div style="
              display: flex; 
              align-items: center; 
              justify-content: space-between; 
              padding: 16px 20px; 
              border-bottom: 1.5px solid var(--color-danger); 
              background: rgba(255, 23, 68, 0.02);
            ">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="status-dot offline animate-pulse" style="width: 8px; height: 8px; background: var(--color-danger); box-shadow: 0 0 10px var(--color-danger);"></span>
                <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: var(--text-sm); color: var(--text-primary); letter-spacing: 0.05em; text-transform: uppercase;">Incoming</span>
              </div>
              <span class="badge badge-danger" id="count-new" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; min-width: 24px; padding: 4px 8px; border-radius: var(--radius-full);">0</span>
            </div>
            <div class="kds-cards-list scrollbar-none" id="list-new" style="flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
              <!-- Cards load here -->
            </div>
          </div>

          <!-- Column 2: Preparing -->
          <div class="kds-col card-glass" style="
            display: flex; 
            flex-direction: column; 
            height: 100%; 
            border-radius: var(--radius-xl); 
            overflow: hidden; 
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid var(--border-glass);
            box-shadow: 0 15px 35px rgba(0,0,0,0.2);
          ">
            <div style="
              display: flex; 
              align-items: center; 
              justify-content: space-between; 
              padding: 16px 20px; 
              border-bottom: 1.5px solid var(--color-warning); 
              background: rgba(var(--color-warning-rgb), 0.02);
            ">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="status-dot animate-pulse" style="width: 8px; height: 8px; background: var(--color-warning); box-shadow: 0 0 10px var(--color-warning);"></span>
                <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: var(--text-sm); color: var(--text-primary); letter-spacing: 0.05em; text-transform: uppercase;">Preparing</span>
              </div>
              <span class="badge badge-warning" id="count-preparing" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; min-width: 24px; padding: 4px 8px; border-radius: var(--radius-full);">0</span>
            </div>
            <div class="kds-cards-list scrollbar-none" id="list-preparing" style="flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
              <!-- Cards load here -->
            </div>
          </div>

          <!-- Column 3: Ready for Pickup -->
          <div class="kds-col card-glass" style="
            display: flex; 
            flex-direction: column; 
            height: 100%; 
            border-radius: var(--radius-xl); 
            overflow: hidden; 
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid var(--border-glass);
            box-shadow: 0 15px 35px rgba(0,0,0,0.2);
          ">
            <div style="
              display: flex; 
              align-items: center; 
              justify-content: space-between; 
              padding: 16px 20px; 
              border-bottom: 1.5px solid var(--color-success); 
              background: rgba(0, 200, 83, 0.02);
            ">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="status-dot online animate-pulse" style="width: 8px; height: 8px; background: var(--color-success); box-shadow: 0 0 10px var(--color-success);"></span>
                <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: var(--text-sm); color: var(--text-primary); letter-spacing: 0.05em; text-transform: uppercase;">Ready to Serve</span>
              </div>
              <span class="badge badge-success" id="count-ready" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; min-width: 24px; padding: 4px 8px; border-radius: var(--radius-full);">0</span>
            </div>
            <div class="kds-cards-list scrollbar-none" id="list-ready" style="flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
              <!-- Cards load here -->
            </div>
          </div>

        </div>
      </div>
      
      <!-- Responsive Mobile & KDS Custom Styles -->
      <style>
        @keyframes pulseRed {
          0% {
            box-shadow: 0 0 8px rgba(var(--color-danger-rgb), 0.2), inset 0 0 4px rgba(var(--color-danger-rgb), 0.1);
            border-color: rgba(var(--color-danger-rgb), 0.4);
          }
          50% {
            box-shadow: 0 0 20px rgba(var(--color-danger-rgb), 0.6), inset 0 0 10px rgba(var(--color-danger-rgb), 0.2);
            border-color: rgba(var(--color-danger-rgb), 0.8);
          }
          100% {
            box-shadow: 0 0 8px rgba(var(--color-danger-rgb), 0.2), inset 0 0 4px rgba(var(--color-danger-rgb), 0.1);
            border-color: rgba(var(--color-danger-rgb), 0.4);
          }
        }
        @keyframes pulseGlowRed {
          0% {
            box-shadow: 0 0 5px rgba(var(--color-danger-rgb), 0.2);
            background: rgba(var(--color-danger-rgb), 0.15);
          }
          50% {
            box-shadow: 0 0 15px rgba(var(--color-danger-rgb), 0.5);
            background: rgba(var(--color-danger-rgb), 0.3);
          }
          100% {
            box-shadow: 0 0 5px rgba(var(--color-danger-rgb), 0.2);
            background: rgba(var(--color-danger-rgb), 0.15);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .prep-modal-card {
          background: #12121a;
          border: 1px solid var(--border-glass);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(var(--color-primary-rgb), 0.15);
          border-radius: var(--radius-xl);
          padding: 32px;
          width: 90%;
          max-width: 440px;
          text-align: center;
          animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        #prep-time-modal-overlay {
          background: rgba(9, 9, 14, 0.85);
          backdrop-filter: blur(8px);
          z-index: 10000;
          animation: fadeIn 0.25s ease-out;
        }
        @media (max-width: 900px) {
          #kds-grid-container {
            grid-template-columns: 1fr !important;
            overflow-y: auto !important;
            gap: 16px !important;
            padding: 16px !important;
          }
          .kds-col {
            height: 450px !important;
          }
        }
        @media (max-width: 768px) {
          .prep-modal-card {
            width: 100% !important;
            max-width: 100% !important;
            border-radius: var(--radius-xl) var(--radius-xl) 0 0 !important;
            margin: 0 !important;
            max-height: 85vh !important;
            padding: 24px 20px !important;
            animation: slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
        }
      </style>
    `;

    // Refresh button listener
    document.getElementById('btn-refresh-kds').addEventListener('click', () => {
      playSound(700, 80);
      this.loadOrders(true);
      showToast('KDS Refreshed', 'info');
    });
  }

  showPrepTimeModal() {
    return new Promise((resolve) => {
      // Create overlay element
      const overlay = document.createElement('div');
      overlay.id = 'prep-time-modal-overlay';
      overlay.className = 'modal-overlay';

      // Modal container
      const modal = document.createElement('div');
      modal.className = 'modal prep-modal-card';

      // Modal Title
      const title = document.createElement('h3');
      title.innerText = 'Select Estimated Prep Time';
      title.style.cssText = `
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: var(--text-lg);
        font-weight: 800;
        color: var(--text-primary);
        margin-bottom: 24px;
        letter-spacing: -0.01em;
      `;
      modal.appendChild(title);

      // Quick timing options grid
      const grid = document.createElement('div');
      grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      `;

      const prepTimes = [10, 15, 20, 30, 45];
      prepTimes.forEach(mins => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.innerText = `${mins} Mins`;
        btn.style.cssText = `
          padding: 14px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 700;
          font-size: var(--text-sm);
          border: 1px solid var(--border-glass);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-primary);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        `;
        
        btn.onmouseenter = () => {
          btn.style.background = 'var(--color-primary)';
          btn.style.color = 'white';
          btn.style.borderColor = 'var(--color-primary)';
          btn.style.boxShadow = '0 4px 15px rgba(var(--color-primary-rgb), 0.3)';
        };
        btn.onmouseleave = () => {
          btn.style.background = 'rgba(255, 255, 255, 0.02)';
          btn.style.color = 'var(--text-primary)';
          btn.style.borderColor = 'var(--border-glass)';
          btn.style.boxShadow = 'none';
        };
        btn.onclick = () => {
          playSound(800, 100);
          resolve(mins);
          cleanup();
        };
        grid.appendChild(btn);
      });

      modal.appendChild(grid);

      // Cancel Button
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-block';
      cancelBtn.innerText = 'Cancel';
      cancelBtn.style.cssText = `
        width: 100%;
        padding: 12px;
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-weight: 700;
        font-size: var(--text-sm);
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: transparent;
        color: var(--text-muted);
        border-radius: var(--radius-md);
        cursor: pointer;
        margin-top: 8px;
        transition: all var(--transition-fast);
      `;
      cancelBtn.onmouseenter = () => {
        cancelBtn.style.color = 'var(--text-primary)';
        cancelBtn.style.background = 'rgba(255, 255, 255, 0.05)';
      };
      cancelBtn.onmouseleave = () => {
        cancelBtn.style.color = 'var(--text-muted)';
        cancelBtn.style.background = 'transparent';
      };
      cancelBtn.onclick = () => {
        playSound(600, 80);
        resolve(null);
        cleanup();
      };
      
      modal.appendChild(cancelBtn);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const cleanup = () => {
        overlay.style.animation = 'fadeOut 0.2s ease-in forwards';
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 200);
      };
    });
  }

  /**
   * @param wait queue behind a refresh already in flight instead of being
   *   dropped — required after a staff action, so the board cannot settle on a
   *   snapshot taken just before the change.
   */
  async loadOrders(forceRefresh = false, wait = false) {
    if (this.loading) {
      if (!wait) return;
      await this.loading.catch(() => {});
    }

    const run = this.fetchOrders(forceRefresh);
    this.loading = run;
    try {
      await run;
    } finally {
      if (this.loading === run) this.loading = null;
    }
  }

  async fetchOrders(forceRefresh) {
    try {
      // Get all active kitchen orders. A cloud read needs a connection; without
      // one we fall back to the cache rather than blocking the board.
      const allOrders = await getOrders(null, forceRefresh && navigator.onLine);

      // Filter out completed ones, keep only confirmed, preparing, and ready
      this.orders = allOrders.filter(o =>
        o.status === 'confirmed' || o.status === 'preparing' || o.status === 'ready'
      );

      this.updateColumns();
    } catch (error) {
      console.error('Failed to load kitchen orders:', error);
    }
  }

  updateColumns() {
    const listNew = document.getElementById('list-new');
    const listPreparing = document.getElementById('list-preparing');
    const listReady = document.getElementById('list-ready');

    const countNew = document.getElementById('count-new');
    const countPreparing = document.getElementById('count-preparing');
    const countReady = document.getElementById('count-ready');

    if (!listNew || !listPreparing || !listReady) return;

    // Clear columns
    listNew.innerHTML = '';
    listPreparing.innerHTML = '';
    listReady.innerHTML = '';

    let newCount = 0;
    let prepCount = 0;
    let readyCount = 0;

    // Filter, sort, and render orders
    // Sort oldest first so they get processed in order
    const sortedOrders = [...this.orders].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Audio cue for new incoming orders
    const hasNewConfirmed = sortedOrders.some(o => o.status === 'confirmed');
    const previousConfirmedCount = parseInt(countNew.textContent || '0');
    const currentConfirmedCount = sortedOrders.filter(o => o.status === 'confirmed').length;

    if (currentConfirmedCount > previousConfirmedCount) {
      // New order has arrived! Alert the kitchen via notification service
      const newestOrder = sortedOrders.filter(o => o.status === 'confirmed').pop();
      orderNotificationService.alertNewOrder({
        orderNumber: newestOrder?.orderNumber,
        items: newestOrder?.items,
        tableNumber: newestOrder?.tableNumber,
        channel: newestOrder?.channel,
        source: newestOrder?.source,
      });
      showToast('New Order Received!', 'warning');
    }

    sortedOrders.forEach(order => {
      const card = this.createOrderCard(order);
      
      if (order.status === 'confirmed') {
        listNew.appendChild(card);
        newCount++;
      } else if (order.status === 'preparing') {
        listPreparing.appendChild(card);
        prepCount++;
      } else if (order.status === 'ready') {
        listReady.appendChild(card);
        readyCount++;
      }
    });

    // Update headers
    countNew.textContent = newCount;
    countPreparing.textContent = prepCount;
    countReady.textContent = readyCount;

    // Show empty states if columns are empty
    this.checkEmptyState(listNew, 'No new orders');
    this.checkEmptyState(listPreparing, 'No orders preparing');
    this.checkEmptyState(listReady, 'No ready orders');
  }

  checkEmptyState(element, message) {
    if (element.children.length === 0) {
      element.innerHTML = `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); padding: 40px 0;">
          <span class="material-symbols-rounded" style="font-size: 32px; margin-bottom: 6px;">inbox</span>
          <span style="font-size: var(--text-xs);">${escapeHtml(message)}</span>
        </div>
      `;
    }
  }

  createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'card card-glass animate-slideUp';
    const orderId = escapeHtml(String(order.id ?? ''));
    const orderToken = escapeHtml(String(order.orderNumber || '').split('-').pop() || '—');
    const prepLimit = Math.max(0, Number(order.estimatedPrepTime) || 0);
    
    // Parse items if string
    const items = parseOrderItems(order.items);

    // Calculate time elapsed
    const elapsedMinutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
    
    let ageColor = 'var(--text-secondary)';
    let ageWeight = '700';
    let cardStyle = `
      padding: 20px;
      background: rgba(255, 255, 255, 0.01);
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-glass);
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: relative;
      transition: all var(--transition-normal);
    `;
    
    if (order.status !== 'ready') {
      if (elapsedMinutes >= 15) {
        ageColor = '#EF4444';
        cardStyle = `
          padding: 20px;
          background: rgba(var(--color-danger-rgb), 0.02);
          border-radius: var(--radius-xl);
          border: 1.5px solid rgba(var(--color-danger-rgb), 0.4);
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
          box-shadow: 0 0 20px rgba(var(--color-danger-rgb), 0.15), inset 0 0 12px rgba(var(--color-danger-rgb), 0.05);
          animation: pulseRed 2s infinite ease-in-out;
          transition: all var(--transition-normal);
        `;
      } else if (elapsedMinutes >= 8) {
        ageColor = '#F59E0B';
        cardStyle = `
          padding: 20px;
          background: rgba(var(--color-warning-rgb), 0.01);
          border-radius: var(--radius-xl);
          border: 1.5px solid rgba(var(--color-warning-rgb), 0.35);
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
          box-shadow: 0 8px 24px rgba(var(--color-warning-rgb), 0.1);
          transition: all var(--transition-normal);
        `;
      }
    }

    let isOverdue = false;
    let elapsedPrep = 0;
    if (order.status === 'preparing' && prepLimit) {
      elapsedPrep = Math.floor((Date.now() - new Date(order.prepStartTime).getTime()) / 60000);
      if (elapsedPrep > prepLimit) {
        isOverdue = true;
        cardStyle = `
          padding: 20px;
          background: rgba(var(--color-danger-rgb), 0.02);
          border-radius: var(--radius-xl);
          border: 1.5px solid rgba(var(--color-danger-rgb), 0.5);
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
          box-shadow: 0 0 20px rgba(var(--color-danger-rgb), 0.2), inset 0 0 12px rgba(var(--color-danger-rgb), 0.05);
          animation: pulseRed 2s infinite ease-in-out;
          transition: all var(--transition-normal);
        `;
      }
    }

    card.style.cssText = cardStyle;

    // Build items html
    const itemsHtml = items.map(item => {
      const vegIcon = item.isVeg === 1 
        ? `<span class="badge-veg" style="transform: scale(0.9);"></span>`
        : `<span class="badge-nonveg" style="transform: scale(0.9);"></span>`;
        
      return `
        <div style="display: flex; align-items: flex-start; justify-content: space-between; font-size: var(--text-sm); line-height: 1.5; padding: 4px 0;">
          <div style="flex: 1; min-width: 0; padding-right: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; color: var(--color-primary-on-surface); font-size: 1.1rem; line-height: 1;">${Math.max(1, Number(item.quantity) || 1)}x</span>
              <span style="color: var(--text-primary); font-weight: 600; font-size: 0.95rem;">${escapeHtml(item.itemName || item.name || 'Item')}</span>
            </div>
            ${item.notes ? `<div style="font-size: var(--text-xs); color: #FF8960; font-weight: 500; font-style: italic; margin-left: 28px; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-rounded" style="font-size: 12px;">notes</span>
              ${escapeHtml(item.notes)}
            </div>` : ''}
          </div>
          <div style="display: flex; align-items: center; justify-content: center; height: 20px;">
            ${vegIcon}
          </div>
        </div>
      `;
    }).join('<div style="height: 1px; background: var(--border-glass); margin: 6px 0;"></div>');

    // Action button based on status
    let actionBtnHtml = '';
    if (order.status === 'confirmed') {
      actionBtnHtml = `
        <button class="btn btn-primary btn-block btn-sm action-btn" data-action="prepare" data-id="${orderId}" style="
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 700;
          box-shadow: var(--shadow-primary);
          height: 38px;
        ">
          <span class="material-symbols-rounded" style="font-size: 18px;">restaurant</span>
          Start Cook
        </button>
      `;
    } else if (order.status === 'preparing') {
      actionBtnHtml = `
        <button class="btn action-btn" data-action="ready" data-id="${orderId}" style="
          color: white; 
          background: linear-gradient(135deg, var(--color-warning) 0%, #D97706 100%);
          border: none;
          box-shadow: 0 4px 15px rgba(var(--color-warning-rgb), 0.35);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 700;
          width: 100%;
          border-radius: var(--radius-md);
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          font-size: var(--text-xs);
          transition: all var(--transition-fast);
        ">
          <span class="material-symbols-rounded" style="font-size: 18px;">check_circle</span>
          Food Ready
        </button>
      `;
    } else if (order.status === 'ready') {
      const action = order.type === 'delivery' ? 'dispatch-wait' : 'complete';
      const label = order.type === 'delivery' ? 'Ready for Dispatch' : 'Done & Serve';
      actionBtnHtml = `
        <button class="btn action-btn" data-action="${action}" data-id="${orderId}" style="
          color: white; 
          background: linear-gradient(135deg, var(--color-success) 0%, #059669 100%);
          border: none;
          box-shadow: 0 4px 15px rgba(var(--color-success-rgb), 0.35);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 700;
          width: 100%;
          border-radius: var(--radius-md);
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: ${order.type === 'delivery' ? 'default' : 'pointer'};
          font-size: var(--text-xs);
          transition: all var(--transition-fast);
        ">
          <span class="material-symbols-rounded" style="font-size: 18px;">done_all</span>
          ${label}
        </button>
      `;
    }

    card.innerHTML = `
      <!-- Card Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-glass); padding-bottom: 12px;">
        <div>
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em;">
            #${orderToken}
          </div>
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: var(--text-xs); color: var(--text-secondary); text-transform: uppercase; margin-top: 4px; font-weight: 700; display: flex; align-items: center; gap: 4px;">
            ${order.type === 'dinein' ? 'Dine In' : order.type === 'takeaway' ? 'Pickup' : 'Delivery'}
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
          <div style="
            font-size: var(--text-xs); 
            color: ${ageColor}; 
            font-weight: ${ageWeight}; 
            background: rgba(255,255,255,0.03); 
            padding: 2px 8px; 
            border-radius: var(--radius-full);
            border: 1px solid var(--border-glass);
          ">
            ${elapsedMinutes === 0 ? 'Just now' : `${elapsedMinutes}m ago`}
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 6px; font-weight: 500;">
            ${escapeHtml(formatTime(order.createdAt))}
          </div>
        </div>
      </div>

      ${order.lastSyncError ? `
      <!-- The server refused the last change to this ticket. A toast is gone in
           four seconds; the reason has to stay on the card the operator is
           looking at, or it reads as "delete does nothing". -->
      <div class="kds-refusal" role="status" style="
        margin: 8px 0 0;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(var(--color-danger-rgb), 0.10);
        border: 1px solid rgba(var(--color-danger-rgb), 0.35);
        color: var(--color-danger);
        font-size: 0.68rem;
        font-weight: 700;
        line-height: 1.4;
        display: flex;
        gap: 6px;
        align-items: flex-start;
      ">
        <span class="material-symbols-rounded" style="font-size: 14px; flex: 0 0 auto;">error</span>
        <span>${escapeHtml(order.lastSyncError)}${(order.paymentStatus === 'paid') ? ' — a paid ticket has to be served and closed, or refunded before it can be voided.' : ''}</span>
      </div>` : ''}

      <!-- Prep Limit Badge -->
      ${order.status === 'preparing' && prepLimit ? `
        <div style="
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: var(--radius-md);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: var(--text-xs);
          font-weight: 700;
          margin-top: 8px;
          margin-bottom: 4px;
          ${isOverdue ? `
            background: rgba(var(--color-danger-rgb), 0.15);
            color: #FF6B6B;
            border: 1px solid rgba(var(--color-danger-rgb), 0.3);
            box-shadow: 0 0 10px rgba(var(--color-danger-rgb), 0.2);
            animation: pulseGlowRed 1.5s infinite;
          ` : `
            background: rgba(var(--color-warning-rgb), 0.15);
            color: var(--color-warning);
            border: 1px solid rgba(var(--color-warning-rgb), 0.25);
          `}
        ">
          ${isOverdue ? `
            <span style="font-size: 14px;">🚨</span>
            <span>OVERDUE by ${elapsedPrep - prepLimit}m</span>
          ` : `
            <span>⏳</span>
            <span>Prep Limit: ${prepLimit}m</span>
          `}
        </div>
      ` : ''}

      <!-- Items List -->
      <div style="display: flex; flex-direction: column; margin: 4px 0;">
        ${itemsHtml}
      </div>

      <!-- Customer / Order Notes (if any) -->
      ${order.customerName ? `
        <div style="
          font-size: var(--text-xs); 
          color: var(--text-secondary); 
          background: rgba(255, 255, 255, 0.01); 
          padding: 8px 12px; 
          border-radius: var(--radius-md); 
          border: 1px dashed var(--border-glass);
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          <span class="material-symbols-rounded" style="font-size: 14px; color: var(--color-primary-on-surface);">person</span>
          <span style="font-weight: 600;">${escapeHtml(order.customerName)}</span>
          ${order.customerPhone ? `<span style="color: var(--text-muted); font-size: 10px;">(${escapeHtml(order.customerPhone)})</span>` : ''}
        </div>
      ` : ''}

      ${order.type === 'delivery' ? `
        <div style="
          font-size: var(--text-xs);
          color: var(--text-secondary);
          background: rgba(var(--color-info-rgb), 0.05);
          padding: 8px 12px;
          border-radius: var(--radius-md);
          border: 1px dashed rgba(var(--color-info-rgb), 0.24);
          line-height: 1.4;
        ">
          <strong style="color: var(--text-primary);">Delivery:</strong> ${escapeHtml(order.deliveryAddress || 'Address missing')}
          ${order.deliveryLandmark ? `<br><span>${escapeHtml(order.deliveryLandmark)}</span>` : ''}
        </div>
      ` : ''}

      ${order.notes ? `
        <div style="
          font-size: var(--text-xs); 
          color: var(--color-warning); 
          font-weight: 600; 
          background: rgba(var(--color-warning-rgb), 0.05); 
          padding: 8px 12px; 
          border-radius: var(--radius-md);
          border: 1px solid rgba(var(--color-warning-rgb), 0.1);
        ">
          <strong>Notes:</strong> ${escapeHtml(order.notes)}
        </div>
      ` : ''}

      <!-- Actions -->
      <div style="margin-top: 4px; display: flex; gap: 8px;">
        ${actionBtnHtml}
        <button class="btn btn-secondary btn-icon action-btn" data-action="delete" data-id="${orderId}" style="
          color: var(--color-danger); 
          border-color: rgba(var(--color-danger-rgb), 0.2); 
          background: rgba(var(--color-danger-rgb), 0.05);
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        " title="Cancel/Void Order">
          <span class="material-symbols-rounded" style="font-size: 18px;">delete</span>
        </button>
      </div>
    `;

    // Bind click handlers to action buttons
    card.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const orderId = parseInt(btn.dataset.id);
        
        playSound(900, 80);
        vibrateDevice([40]);
        
        if (action === 'prepare') {
          const estimatedPrepTime = await this.showPrepTimeModal();
          if (estimatedPrepTime === null) {
            return;
          }
          reportStatusChange(
            await updateOrderStatus(orderId, 'preparing', {
              estimatedPrepTime,
              prepStartTime: new Date().toISOString()
            }),
            'Preparing order'
          );
        } else if (action === 'ready') {
          reportStatusChange(await updateOrderStatus(orderId, 'ready'), 'Order is ready!');
        } else if (action === 'complete') {
          reportStatusChange(await updateOrderStatus(orderId, 'completed'), 'Order served & closed');
        } else if (action === 'dispatch-wait') {
          showToast('Use Orders to assign delivery staff', 'info');
        } else if (action === 'delete') {
          const currentStaff = authService.getCurrentStaff();
          const role = currentStaff?.role || 'kitchen';

          const isAuthorized = Boolean(
            currentStaff?.isActive && ['owner', 'developer', 'manager'].includes(role.toLowerCase())
          );

          if (isAuthorized) {
            if (confirm('Are you sure you want to cancel and void this order?')) {
              // updateOrderStatus replicates to the cloud itself, and rolls the
              // local change back when the server refuses the transition (for
              // example, a paid order that has not been refunded).
              const outcome = await updateOrderStatus(orderId, 'cancelled');

              if (outcome.applied) {
                await db.activityLog.add({
                  staffId: currentStaff?.id || 0,
                  action: `void_order_kds_id_${orderId}`,
                  timestamp: new Date().toISOString()
                });
              }

              reportStatusChange(outcome, 'Order cancelled & voided');
            }
          } else {
            showToast('Cancelling orders requires an active manager, owner, or developer cloud session.', 'error');
            playSound(300, 200, 'square');
            vibrateDevice([150]);
          }
        }

        // Settle on the status the server accepted, not the optimistic local one
        await this.loadOrders(true, true);
      });
    });

    return card;
  }

  unmount() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.onSyncDataChanged) {
      window.removeEventListener('sync-data-changed', this.onSyncDataChanged);
      this.onSyncDataChanged = null;
    }
    this.container = null;
  }

}
