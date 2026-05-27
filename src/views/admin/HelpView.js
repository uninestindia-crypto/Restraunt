/**
 * HelpView — Premium Help Center & User Documentation System
 */

import { playSound, vibrateDevice } from '../../utils/helpers.js';

export class HelpView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.activeSection = 'quickstart';
  }

  async mount(container) {
    this.container = container;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="help-layout-container">
        
        <!-- Local Navigation Sidebar -->
        <div class="help-sidebar">
          <div style="margin-bottom: 16px; padding-left: 8px;">
            <div style="font-family: var(--font-display); font-size: var(--text-sm); font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-rounded txt-brand" style="font-size: 22px;">help_center</span>
              Help Center
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Documentation & Guides</div>
          </div>

          <button class="help-nav-btn ${this.activeSection === 'quickstart' ? 'active' : ''}" data-section="quickstart">
            <span class="material-symbols-rounded">rocket_launch</span>
            Quick Start Guide
          </button>
          <button class="help-nav-btn ${this.activeSection === 'operations' ? 'active' : ''}" data-section="operations">
            <span class="material-symbols-rounded">restaurant</span>
            Operations & Flow
          </button>
          <button class="help-nav-btn ${this.activeSection === 'hardware' ? 'active' : ''}" data-section="hardware">
            <span class="material-symbols-rounded">print</span>
            Hardware Setup
          </button>
          <button class="help-nav-btn ${this.activeSection === 'cloud' ? 'active' : ''}" data-section="cloud">
            <span class="material-symbols-rounded">cloud_sync</span>
            Cloud Sync & Offline
          </button>
          <button class="help-nav-btn ${this.activeSection === 'ai' ? 'active' : ''}" data-section="ai">
            <span class="material-symbols-rounded">smart_toy</span>
            AI Command Center
          </button>
          <button class="help-nav-btn ${this.activeSection === 'faq' ? 'active' : ''}" data-section="faq">
            <span class="material-symbols-rounded">quiz</span>
            FAQs
          </button>

          <div style="margin-top: auto; padding: 12px; background: rgba(255, 94, 54, 0.05); border: 1px solid rgba(255, 94, 54, 0.1); border-radius: var(--radius-md); font-size: 11px; color: var(--text-secondary); text-align: center;">
            <strong class="txt-brand">NextGenOS OS v2.0</strong>
            <div style="opacity: 0.7; margin-top: 2px;">Fully offline ready</div>
          </div>
        </div>

        <!-- Documentation Viewport -->
        <div class="help-content-viewport">
          <div style="max-width: 800px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 32px;" id="help-content-container">
            ${this.renderSectionContent()}
          </div>
        </div>

      </div>

      <style>
        .help-layout-container {
          display: flex;
          flex: 1;
          height: 100%;
          overflow: hidden;
          background: radial-gradient(circle at top right, rgba(255, 94, 54, 0.05) 0%, transparent 60%);
        }
        .help-sidebar {
          width: 260px;
          border-right: 1px solid var(--border-glass);
          background: rgba(18, 18, 29, 0.4);
          backdrop-filter: blur(20px);
          display: flex;
          flex-direction: column;
          padding: 24px 16px;
          gap: 8px;
          flex-shrink: 0;
        }
        .help-content-viewport {
          flex: 1;
          overflow-y: auto;
          padding: 36px 40px;
        }

        @media (max-width: 768px) {
          .help-layout-container {
            flex-direction: column !important;
            overflow-y: auto !important;
          }
          .help-sidebar {
            width: 100% !important;
            border-right: none !important;
            border-bottom: 1px solid var(--border-glass) !important;
            flex-direction: row !important;
            overflow-x: auto !important;
            padding: 12px 16px !important;
            gap: 8px !important;
            white-space: nowrap !important;
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
          .help-sidebar::-webkit-scrollbar {
            display: none !important;
          }
          .help-sidebar > div:first-child {
            display: none !important;
          }
          .help-sidebar > div:last-child {
            display: none !important;
          }
          .help-content-viewport {
            padding: 20px 16px !important;
            overflow-y: visible !important;
          }
        }

        .help-nav-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: var(--text-sm);
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .help-nav-btn span {
          font-size: 20px;
          color: var(--text-muted);
          transition: color var(--transition-fast);
        }
        .help-nav-btn:hover {
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
        }
        .help-nav-btn:hover span {
          color: var(--text-primary);
        }
        .help-nav-btn.active {
          background: rgba(255, 94, 54, 0.08);
          border-color: rgba(255, 94, 54, 0.2);
          color: var(--color-primary);
        }
        .help-nav-btn.active span {
          color: var(--color-primary);
        }

        .help-doc-section h1 {
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          margin: 0 0 16px 0;
        }
        .help-doc-section h2 {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          margin: 28px 0 12px 0;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 8px;
        }
        .help-doc-section p {
          color: var(--text-secondary);
          font-size: var(--text-sm);
          line-height: 1.6;
          margin: 0 0 16px 0;
        }
        .help-doc-section ul, .help-doc-section ol {
          margin: 0 0 20px 0;
          padding-left: 20px;
          color: var(--text-secondary);
          font-size: var(--text-sm);
          line-height: 1.6;
        }
        .help-doc-section li {
          margin-bottom: 8px;
        }
        
        .help-tip-box {
          background: rgba(59, 130, 246, 0.06);
          border-left: 4px solid var(--color-info);
          padding: 16px;
          border-radius: 0 var(--radius-md) var(--radius-md) 0;
          margin: 20px 0;
          color: var(--text-secondary);
          font-size: var(--text-sm);
          line-height: 1.5;
        }
        .help-tip-box strong {
          color: var(--text-primary);
          display: block;
          margin-bottom: 4px;
        }

        .help-warning-box {
          background: rgba(245, 158, 11, 0.06);
          border-left: 4px solid #F59E0B;
          padding: 16px;
          border-radius: 0 var(--radius-md) var(--radius-md) 0;
          margin: 20px 0;
          color: var(--text-secondary);
          font-size: var(--text-sm);
          line-height: 1.5;
        }
        .help-warning-box strong {
          color: var(--text-primary);
          display: block;
          margin-bottom: 4px;
        }

        .help-step-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-glass);
          border-radius: var(--radius-md);
          padding: 18px;
          margin-bottom: 16px;
          display: flex;
          gap: 16px;
          align-items: flex-start;
          transition: transform var(--transition-fast);
        }
        .help-step-card:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 94, 54, 0.15);
        }
        .help-step-badge {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 94, 54, 0.1);
          color: var(--color-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          flex-shrink: 0;
          font-size: var(--text-xs);
        }
      </style>
    `;

    this.bindEvents();
  }

  renderSectionContent() {
    switch (this.activeSection) {
      case 'quickstart':
        return `
          <div class="help-doc-section">
            <h1>🚀 Quick Start Guide</h1>
            <p>Welcome to <strong>The Taste Operating System</strong>. Follow this quick start setup to begin operations.</p>
            
            <h2>Taking Orders on the POS Portal</h2>
            <div class="help-step-card">
              <div class="help-step-badge">1</div>
              <div>
                <strong>Tap Menu Items</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Browse items by category tabs or use the real-time search bar at the top of the menu grid. Tap on an item to add it to the cart sidebar.</p>
              </div>
            </div>

            <div class="help-step-card">
              <div class="help-step-badge">2</div>
              <div>
                <strong>Adjust Quantity & Add Notes</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Modify quantities inside the stepper (` + '`' + `+` + '`' + ` / ` + '`' + `-` + '`' + `). Long-press or tap an item in the cart to append cooking notes (e.g., "Extra spicy", "No onions").</p>
              </div>
            </div>

            <div class="help-step-card">
              <div class="help-step-badge">3</div>
              <div>
                <strong>Set Order Type & Table</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Choose between <strong>Takeaway</strong>, <strong>Dine In</strong>, and <strong>Delivery</strong>. For Dine In, select the corresponding dining table number.</p>
              </div>
            </div>

            <div class="help-step-card">
              <div class="help-step-badge">4</div>
              <div>
                <strong>Select Payment & Checkout</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Tap the Pay button. Select <strong>UPI QR</strong> (fully supports split/partial bills) or <strong>Cash</strong>. Confirm payment to save the order and open the checkout success panel.</p>
              </div>
            </div>

            <h2>Kitchen Screen Workflow</h2>
            <p>The Kitchen Screen updates instantly as orders are placed. Kitchen staff can see pending tickets grouped by time elapsed:</p>
            <ul>
              <li><strong>Pending orders</strong> arrive as active cards with color-coded order type badges (Dine In is <span style="color:#60A5FA;font-weight:700;">Blue</span>, Takeaway is <span style="color:#FFA200;font-weight:700;">Orange</span>).</li>
              <li>Tap <strong>"Start Preparing"</strong> to update the ticket status. The card shifts to the Active column, signaling POS that work has started.</li>
              <li>Once ready, tap <strong>"Ready for Pickup"</strong> (or "Deliver"). This notifies waitstaff or dispatch instantly.</li>
            </ul>

            <div class="help-tip-box">
              <strong>💡 Sound Alerts</strong>
              New orders trigger a distinct ping chime. Ensure your device volume is active so the kitchen never misses an incoming ticket.
            </div>
          </div>
        `;

      case 'operations':
        return `
          <div class="help-doc-section">
            <h1>📋 Operations & Flow</h1>
            <p>The platform supports multiple channels working together in real-time, bridging self-ordering customers, waitstaff, cashier terminals, and the kitchen.</p>

            <h2>Self-Order Table QR Detection</h2>
            <p>Customers can order directly from their smartphones without staff intervention:</p>
            <ol>
              <li>Each table is assigned a unique URL QR code (e.g. ` + '`' + `#/self-order?table=5` + '`' + `).</li>
              <li>Scanning the QR code automatically configures the customer storefront in "Table Mode", locking the cart to that specific table.</li>
              <li>When the customer checkouts, the order bypasses cashier approval and prints directly to the kitchen, marked with a <strong>Self-Order</strong> channel tag.</li>
            </ol>

            <h2>Live Browser Notifications</h2>
            <p>For instant alerts when browser tabs are in the background:</p>
            <ul>
              <li>Ensure browser notification permissions are granted (the browser will prompt you on startup).</li>
              <li>When a customer places a self-order or requests assistance, a system-level desktop notification will pop up showing the table number and items.</li>
            </ul>

            <h2>Order Status Lifecycle</h2>
            <p>Every order moves sequentially through these states:</p>
            <div style="display: flex; gap: 8px; margin: 16px 0; font-size: 11px; justify-content: space-between; flex-wrap: wrap;">
              <span style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239,68,68,0.2); padding: 6px 10px; border-radius: 4px; color: #EF4444; font-weight:700;">1. PENDING (Unpaid/Self)</span>
              <span style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245,158,11,0.2); padding: 6px 10px; border-radius: 4px; color: #F59E0B; font-weight:700;">2. PREPARING</span>
              <span style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16,185,129,0.2); padding: 6px 10px; border-radius: 4px; color: #10B981; font-weight:700;">3. READY</span>
              <span style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99,102,241,0.2); padding: 6px 10px; border-radius: 4px; color: #6366F1; font-weight:700;">4. COMPLETED / PAID</span>
            </div>
          </div>
        `;

      case 'hardware':
        return `
          <div class="help-doc-section">
            <h1>🔌 Hardware & Printer Setup</h1>
            <p>Configure Bluetooth thermal printing directly from your tablet or mobile device. No drivers are required.</p>

            <h2>Connecting Bluetooth Thermal Printers</h2>
            <div class="help-step-card">
              <div class="help-step-badge">1</div>
              <div>
                <strong>Turn on Bluetooth</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Ensure Bluetooth is enabled on your device (iPad, Android tablet, or laptop) and the thermal printer is powered on and discoverable.</p>
              </div>
            </div>

            <div class="help-step-card">
              <div class="help-step-badge">2</div>
              <div>
                <strong>Tap Printer Connection Icon</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Click on the <strong>"Not Connected"</strong> printer button in the app header, or navigate to <strong>Admin -> Settings -> Printer Setup</strong>.</p>
              </div>
            </div>

            <div class="help-step-card">
              <div class="help-step-badge">3</div>
              <div>
                <strong>Select Printer & Pair</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Choose your Bluetooth printer (usually named <em>MPT-II</em>, <em>InnerPrinter</em>, or <em>Bluetooth Printer</em>) from the browser dialog and click Pair.</p>
              </div>
            </div>

            <h2>Printer Settings & Density Tuning</h2>
            <p>Customize print behaviors to fit your paper rolls:</p>
            <ul>
              <li><strong>Printer Width:</strong> Select <strong>58mm</strong> (32 character grid) or <strong>80mm</strong> (48 character grid) depending on your paper roll width.</li>
              <li><strong>Auto Print Copies:</strong> Set how many receipt copies print automatically when checkout succeeds (e.g. 1 copy for cashier, 1 for kitchen).</li>
              <li><strong>Show/Hide Fields:</strong> Choose whether to print FSSAI numbers, restaurant address, and customized receipt footers.</li>
            </ul>

            <div class="help-warning-box">
              <strong>⚠️ Browser Compatibility</strong>
              Web Bluetooth printing requires Web Bluetooth API support. It is highly recommended to run on <strong>Google Chrome</strong> (Android/Windows/Mac) or a supported Web-Bluetooth browser on iOS.
            </div>
          </div>
        `;

      case 'cloud':
        return `
          <div class="help-doc-section">
            <h1>💾 Cloud Sync & Offline Operations</h1>
            <p>The platform runs on a robust Offline-First architecture. Operations will continue seamlessly even during internet outages.</p>

            <h2>Bidirectional Sync</h2>
            <p>All data is saved locally on the device using <strong>Dexie IndexedDB</strong>. The background sync queue handles network state changes:</p>
            <ul>
              <li><strong>Offline Mode:</strong> Take orders, print thermal receipts, and operate the kitchen normally without internet connection.</li>
              <li><strong>Auto-Reconciliation:</strong> When connection is restored, the sync service pushes local offline orders to Supabase and pulls remote menu updates automatically.</li>
            </ul>

            <h2>LocalStorage Backup Cache</h2>
            <p>Core configurations (including custom tax labels, rates, currency symbols, and restaurant profiles) are continuously cached in <strong>localStorage</strong>. This enables critical rendering helpers to format currency codes instantly without waiting for database reads.</p>

            <div class="help-tip-box">
              <strong>💡 Sync Status Dot</strong>
              Monitor the cloud icon in the header:
              <br>• <span style="color:#10B981;font-weight:700;">Green (Cloud Active):</span> Network online, database in sync.
              <br>• <span style="color:#F59E0B;font-weight:700;">Orange (Syncing):</span> Pushing offline logs.
              <br>• <span style="color:#EF4444;font-weight:700;">Red (Offline):</span> Running on local storage database.
            </div>
          </div>
        `;

      case 'ai':
        return `
          <div class="help-doc-section">
            <h1>🤖 AI Command Center</h1>
            <p>Access restaurant intelligence and generate reports using voice or text commands inside the AI Center.</p>

            <h2>Supported Commands</h2>
            <p>You can type or speak queries naturally. Try these commands:</p>
            <ul>
              <li><strong>Revenue metrics:</strong> <em>"What is our revenue today?"</em> or <em>"How much did we make?"</em></li>
              <li><strong>Popularity trends:</strong> <em>"Show me the best sellers this week"</em> or <em>"What are the slowest selling items?"</em></li>
              <li><strong>Projections:</strong> <em>"Forecast sales for tomorrow"</em> or <em>"Predict revenue"</em></li>
              <li><strong>Operations:</strong> <em>"Show peak hours"</em> or <em>"When are we busiest?"</em></li>
              <li><strong>Split analysis:</strong> <em>"How did people pay today?"</em> (Breakdown of Cash vs UPI)</li>
              <li><strong>Anomaly alerts:</strong> <em>"Detect anomalies"</em> (Alerts for unusual ticket values)</li>
            </ul>

            <h2>Generating CSV & Excel Spreadsheets</h2>
            <p>Trigger spreadsheet generation directly by asking:</p>
            <ul>
              <li><em>"Generate CSV report today"</em></li>
              <li><em>"Export weekly report"</em></li>
              <li><em>"Download monthly report"</em></li>
            </ul>
            <p>The AI will compile all Key Performance Indicators (KPIs), transaction logs, and product items into a formatted CSV spreadsheet download.</p>
          </div>
        `;

      case 'faq':
        return `
          <div class="help-doc-section">
            <h1>❓ Frequently Asked Questions</h1>
            
            <h2>Can we run multiple terminals together offline?</h2>
            <p>Offline operations work for independent cashiering. However, to synchronize table statuses and order queues in real-time across multiple tablets, a local WiFi connection with active internet is required to reach the cloud gateway.</p>

            <h2>Where are backup files stored?</h2>
            <p>All database records are securely stored inside your browser's sandboxed IndexedDB storage. Clearing your browser cache or history completely may erase local data. Ensure cloud sync is enabled for persistent safety.</p>

            <h2>How do I customize the currency symbol?</h2>
            <p>Navigate to <strong>Admin -> Settings -> Payments & Tax Setup</strong>. Select your currency code (USD, EUR, GBP, AUD, CAD, INR) and enter a custom symbol. Click Save. The POS system, invoice templates, and receipts will adapt instantly.</p>

            <h2>How do I configure VAT instead of GST?</h2>
            <p>Under <strong>Admin -> Settings -> Payments & Tax Setup</strong>, change the Tax Type to VAT (or Sales Tax) and input your regional tax percentage. Enter "VAT" in the Tax Label field. All customer orders and PDF invoices will format accordingly.</p>
          </div>
        `;

      default:
        return '';
    }
  }

  bindEvents() {
    if (!this.container) return;

    // Sidebar navigation clicks
    const navButtons = this.container.querySelectorAll('.help-nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        if (section === this.activeSection) return;

        playSound(700, 80);
        vibrateDevice([15]);
        
        this.activeSection = section;

        // Toggle active class on sidebar buttons
        navButtons.forEach(b => {
          b.classList.toggle('active', b.dataset.section === section);
        });

        // Re-render documentation viewport contents
        const contentContainer = document.getElementById('help-content-container');
        if (contentContainer) {
          contentContainer.innerHTML = this.renderSectionContent();
        }
      });
    });
  }

  unmount() {
    this.container = null;
  }
}
