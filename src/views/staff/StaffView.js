/**
 * ═══════════════════════════════════════════════════
 *  NextGenOS Restaurant Operating System
 *  Module: Staff Management
 *  Version: 2.0.0
 *  © 2026 NextGenOS. All Rights Reserved.
 *  This software is proprietary and confidential.
 * ═══════════════════════════════════════════════════
 */

import { db } from '../../db/database.js';
import { escapeHtml, showToast, playSound, vibrateDevice } from '../../utils/helpers.js';
import { logShiftStarted, logShiftEnded } from '../../utils/activityLogger.js';
import { hashPin } from '../../utils/crypto.js';

const ROLES = {
  owner: { label: 'Owner', color: '#FF6B35' },
  manager: { label: 'Manager', color: '#6C5CE7' },
  cashier: { label: 'Cashier', color: '#10B981' },
  kitchen: { label: 'Kitchen', color: '#F59E0B' },
  waiter: { label: 'Waiter', color: '#3B82F6' },
  delivery: { label: 'Delivery', color: '#06B6D4' },
};

export class StaffView {
  constructor(app) { this.app = app; this.container = null; this.tab = 'directory'; this.editingStaffId = null; }

  async mount(container) {
    this.container = container;
    this.render();
    this.bindEvents();
    await this.loadData();
  }

  render() {
    this.container.innerHTML = `
      <div class="main-area">
        <div class="header-bar">
          <div class="header-bar-title">
            <span class="material-symbols-rounded">groups</span>
            <h2>Staff & Roles</h2>
          </div>
          <button id="add-staff-btn" class="btn btn-primary btn-sm">
            <span class="material-symbols-rounded" style="font-size:16px;">person_add</span> Add Staff
          </button>
        </div>
        <div class="tab-container" id="staff-tabs">
          <button class="tab staff-tab active" data-tab="directory">Directory</button>
          <button class="tab staff-tab" data-tab="shifts">Shifts</button>
          <button class="tab staff-tab" data-tab="activity">Activity Log</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:24px;" id="staff-content"></div>
      </div>
      <div id="staff-modal" class="modal-overlay" style="display:none;">
        <div class="modal" style="max-width:400px;">
          <div class="modal-header">
            <h3 id="staff-modal-title">Add Staff</h3>
            <button class="btn-icon" id="staff-close-icon"><span class="material-symbols-rounded">close</span></button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
            <div class="input-group">
              <label for="staff-name">Staff Name</label>
              <input type="text" id="staff-name" class="input" placeholder="e.g. Rahul Sharma">
            </div>
            <div class="input-group">
              <label for="staff-role">Role</label>
              <select id="staff-role" class="input">
                <option value="cashier">Cashier</option>
                <option value="kitchen">Kitchen Staff</option>
                <option value="waiter">Waiter</option>
                <option value="delivery">Delivery Staff</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div class="input-group">
              <label for="staff-pin">4-Digit PIN</label>
              <input type="password" id="staff-pin" class="input" placeholder="e.g. 1234" maxlength="4" style="letter-spacing: 0.3em; text-align: center;">
            </div>
            <div class="input-group">
              <label for="staff-phone">Phone Number</label>
              <input type="tel" id="staff-phone" class="input" placeholder="e.g. 9876543210">
            </div>
          </div>
          <div class="modal-footer">
            <button id="staff-cancel" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="staff-save" class="btn btn-primary btn-sm">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const modal = document.getElementById('staff-modal');
    document.getElementById('add-staff-btn').addEventListener('click', () => {
      playSound(700, 80);
      this.editingStaffId = null;
      document.getElementById('staff-modal-title').textContent = 'Add Staff';
      ['staff-name', 'staff-pin', 'staff-phone'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('staff-pin').placeholder = '4-digit PIN';
      document.getElementById('staff-role').value = 'cashier';
      modal.style.display = 'flex';
    });
    const closeModal = () => {
      this.editingStaffId = null;
      document.getElementById('staff-modal-title').textContent = 'Add Staff';
      ['staff-name', 'staff-pin', 'staff-phone'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('staff-pin').placeholder = '4-digit PIN';
      document.getElementById('staff-role').value = 'cashier';
      modal.style.display = 'none';
    };
    document.getElementById('staff-cancel').addEventListener('click', closeModal);
    document.getElementById('staff-close-icon')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('staff-save').addEventListener('click', async () => {
      const name = document.getElementById('staff-name').value.trim();
      const role = document.getElementById('staff-role').value;
      const pin = document.getElementById('staff-pin').value;
      const phone = document.getElementById('staff-phone').value.trim();
      
      if (!name) { showToast('Name is required', 'error'); return; }
      
      const isEdit = !!this.editingStaffId;
      
      if (!isEdit && (!pin || pin.length !== 4)) {
        showToast('4-digit PIN is required for new staff', 'error');
        return;
      }
      
      if (pin && pin.length !== 4) {
        showToast('PIN must be exactly 4 digits', 'error');
        return;
      }

      let hashedPin = '';
      if (pin) {
        const isWeak = /^(.)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin);
        hashedPin = await hashPin(pin);
        
        const checkId = this.editingStaffId || 0;
        const existing = await db.staff.where('pinHash').equals(hashedPin).toArray();
        const collision = existing.some(s => s.isActive && s.id !== checkId);
        
        if (isWeak || collision) {
          showToast('Invalid or insecure PIN. Please choose a different 4-digit combination.', 'error');
          return;
        }
      }

      if (isEdit) {
        const updateData = { name, role, phone, isSynced: 0 };
        if (pin) {
          updateData.pinHash = hashedPin;
        }
        await db.staff.update(this.editingStaffId, updateData);
        showToast('Staff member updated!', 'success');
      } else {
        await db.staff.add({ name, role, pinHash: hashedPin, phone, isActive: true, createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' });
        showToast('Staff member added!', 'success');
      }

      if (role === 'owner' && pin) {
        await db.settings.put({ key: 'adminPinHash', value: hashedPin });
      }

      this.editingStaffId = null;
      document.getElementById('staff-modal-title').textContent = 'Add Staff';
      modal.style.display = 'none';
      ['staff-name', 'staff-pin', 'staff-phone'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('staff-pin').placeholder = '4-digit PIN';
      document.getElementById('staff-role').value = 'cashier';
      playSound(900, 100);
      vibrateDevice([40]);
      await this.loadData();
    });
    this.container.querySelectorAll('.staff-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.tab = btn.dataset.tab;
        playSound(700, 80);
        this.container.querySelectorAll('.staff-tab').forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        await this.loadData();
      });
    });
  }

  async loadData() {
    const content = document.getElementById('staff-content');
    if (!content) return;
    if (this.tab === 'directory') {
      const staffList = await db.staff.toArray();
      const owners = staffList.filter(s => s.role === 'owner' && s.isActive);

      content.innerHTML = staffList.length === 0 ? '<div class="empty-state"><span class="material-symbols-rounded">person_off</span><p>No staff members yet.</p></div>' :
        `<div class="content-grid">${staffList.map(s => {
          const role = ROLES[s.role] || ROLES.cashier;
          const isDeletable = !(s.role === 'owner' && owners.length <= 1);
          return `
            <div class="premium-card">
              <div class="premium-card-avatar" style="background:rgba(${s.role === 'owner' ? '255,107,53' : '108,92,231'},0.1); color:${role.color};">
                ${escapeHtml((s.name || '?')[0].toUpperCase())}
              </div>
              <div class="premium-card-body">
                <span class="premium-card-title">${escapeHtml(s.name)}</span>
                <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
                  <span style="font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:${role.color};background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">${role.label}</span>
                  <span style="font-size:0.6rem;color:${s.isActive ? 'var(--color-success)' : 'var(--color-error)'};font-weight:700;">${s.isActive ? '● Active' : '● Inactive'}</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:4px;">
                <div style="font-size:0.7rem;color:var(--text-muted);font-weight:600;letter-spacing:0.2em;margin-right:8px;">****</div>
                <button class="btn-icon edit-staff-btn" data-id="${s.id}">
                  <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
                </button>
                ${isDeletable ? `
                  <button class="btn-icon delete-staff-btn" data-id="${s.id}" style="color:var(--color-danger);">
                    <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
                  </button>
                ` : ''}
              </div>
            </div>`;
        }).join('')}</div>`;

      content.querySelectorAll('.edit-staff-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = parseInt(btn.dataset.id);
          const staffMember = await db.staff.get(id);
          if (!staffMember) return;

          playSound(700, 80);
          this.editingStaffId = id;
          document.getElementById('staff-modal-title').textContent = 'Edit Staff Member';
          document.getElementById('staff-name').value = staffMember.name || '';
          document.getElementById('staff-role').value = staffMember.role || 'cashier';
          document.getElementById('staff-pin').value = '';
          document.getElementById('staff-pin').placeholder = '•••• (leave blank to keep)';
          document.getElementById('staff-phone').value = staffMember.phone || '';
          
          document.getElementById('staff-modal').style.display = 'flex';
        });
      });

      content.querySelectorAll('.delete-staff-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = parseInt(btn.dataset.id);
          const staffMember = await db.staff.get(id);
          if (!staffMember) return;

          if (confirm(`Are you sure you want to remove ${staffMember.name}?`)) {
            await db.staff.delete(id);
            playSound(900, 100);
            vibrateDevice([40]);
            showToast('Staff member removed successfully!', 'success');
            await this.loadData();
          }
        });
      });

    } else if (this.tab === 'shifts') {
      const shifts = await db.shifts.reverse().sortBy('clockIn');
      const recent = shifts.slice(0, 20);
      content.innerHTML = recent.length === 0 ?
        '<div class="empty-state"><span class="material-symbols-rounded">schedule</span><p>No shift records yet.</p></div>' :
        `<div class="content-grid">${recent.map(s => `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-direction:row;">
            <div>
              <div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">Staff #${s.staffId}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${s.date || '—'}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:var(--text-xs);color:var(--color-success);font-weight:600;">${s.clockIn || '—'} → ${s.clockOut || 'Active'}</div>
            </div>
          </div>
        `).join('')}</div>`;
    } else {
      const logs = await db.activityLog.reverse().sortBy('timestamp');
      const recent = logs.slice(0, 30);
      content.innerHTML = recent.length === 0 ?
        '<div class="empty-state"><span class="material-symbols-rounded">history</span><p>No activity logged yet.</p></div>' :
        `<div class="content-grid">${recent.map(l => `
          <div class="card" style="display:flex; gap:12px; align-items:center; flex-direction:row;">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--color-primary); flex-shrink:0;">history</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:var(--text-xs);color:var(--text-primary);font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(l.action || 'Action')}</div>
              <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(l.staffName || 'System')} · ${new Date(l.timestamp).toLocaleString('en-IN')}</div>
            </div>
          </div>
        `).join('')}</div>`;
    }
  }

  unmount() { this.container = null; }
}
