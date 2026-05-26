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
import { showToast, playSound, vibrateDevice } from '../../utils/helpers.js';
import { logShiftStarted, logShiftEnded } from '../../utils/activityLogger.js';
import { hashPin } from '../../utils/crypto.js';

const ROLES = {
  owner: { label: 'Owner', color: '#FF6B35' },
  manager: { label: 'Manager', color: '#6C5CE7' },
  cashier: { label: 'Cashier', color: '#10B981' },
  kitchen: { label: 'Kitchen', color: '#F59E0B' },
  waiter: { label: 'Waiter', color: '#3B82F6' },
};

export class StaffView {
  constructor(app) { this.app = app; this.container = null; this.tab = 'directory'; this.editingStaffId = null; }

  async mount(container) {
    this.container = container;
    await this.seedDefault();
    this.render();
    this.bindEvents();
    await this.loadData();
  }

  async seedDefault() {
    const count = await db.staff.count();
    if (count === 0) {
      await db.staff.add({ name: 'Owner', role: 'owner', pinHash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', isActive: true, createdAt: new Date().toISOString(), isSynced: 0, _platform: 'nextgenos' });
    }
  }

  render() {
    this.container.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-primary);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:rgba(9,9,14,0.8);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-glass);z-index:10;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="material-symbols-rounded" style="color:var(--color-primary);font-size:24px;">groups</span>
            <h2 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-lg);font-weight:800;color:var(--text-primary);margin:0;">Staff & Roles</h2>
          </div>
          <button id="add-staff-btn" style="padding:8px 14px;background:var(--gradient-primary);border:none;border-radius:8px;color:white;font-size:var(--text-xs);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Plus Jakarta Sans',sans-serif;">
            <span class="material-symbols-rounded" style="font-size:16px;">person_add</span> Add Staff
          </button>
        </div>
        <div style="display:flex;gap:6px;padding:12px 24px;border-bottom:1px solid var(--border-glass);" id="staff-tabs">
          <button class="staff-tab active" data-tab="directory" style="padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:700;cursor:pointer;background:var(--gradient-primary);color:white;border:none;font-family:'Plus Jakarta Sans',sans-serif;">Directory</button>
          <button class="staff-tab" data-tab="shifts" style="padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:700;cursor:pointer;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid var(--border-glass);font-family:'Plus Jakarta Sans',sans-serif;">Shifts</button>
          <button class="staff-tab" data-tab="activity" style="padding:6px 14px;border-radius:8px;font-size:0.75rem;font-weight:700;cursor:pointer;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid var(--border-glass);font-family:'Plus Jakarta Sans',sans-serif;">Activity Log</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px 24px;" id="staff-content"></div>
      </div>
      <div id="staff-modal" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
        <div style="background:var(--bg-secondary);border:1px solid var(--border-glass);border-radius:20px;padding:28px;width:90%;max-width:400px;box-shadow:var(--shadow-modal);">
          <h3 id="staff-modal-title" style="font-family:'Plus Jakarta Sans',sans-serif;font-size:var(--text-md);font-weight:800;color:var(--text-primary);margin:0 0 20px;">Add Staff</h3>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <input type="text" id="staff-name" placeholder="Staff name" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:'Inter',sans-serif;">
            <select id="staff-role" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:'Inter',sans-serif;">
              <option value="cashier">Cashier</option>
              <option value="kitchen">Kitchen Staff</option>
              <option value="waiter">Waiter</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
            <input type="password" id="staff-pin" placeholder="4-digit PIN" maxlength="4" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:'Inter',sans-serif;letter-spacing:0.3em;">
            <input type="tel" id="staff-phone" placeholder="Phone (optional)" style="padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-primary);font-size:var(--text-sm);outline:none;font-family:'Inter',sans-serif;">
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button id="staff-cancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border-glass);border-radius:10px;color:var(--text-secondary);font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Cancel</button>
            <button id="staff-save" style="flex:1;padding:10px;background:var(--gradient-primary);border:none;border-radius:10px;color:white;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    document.getElementById('add-staff-btn').addEventListener('click', () => {
      playSound(700, 80);
      this.editingStaffId = null;
      document.getElementById('staff-modal-title').textContent = 'Add Staff';
      ['staff-name', 'staff-pin', 'staff-phone'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('staff-pin').placeholder = '4-digit PIN';
      document.getElementById('staff-role').value = 'cashier';
      document.getElementById('staff-modal').style.display = 'flex';
    });
    document.getElementById('staff-cancel').addEventListener('click', () => {
      this.editingStaffId = null;
      document.getElementById('staff-modal-title').textContent = 'Add Staff';
      ['staff-name', 'staff-pin', 'staff-phone'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('staff-pin').placeholder = '4-digit PIN';
      document.getElementById('staff-role').value = 'cashier';
      document.getElementById('staff-modal').style.display = 'none';
    });
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
        hashedPin = await hashPin(pin);
        
        const checkId = this.editingStaffId || 0;
        const existing = await db.staff.where('pinHash').equals(hashedPin).toArray();
        const collision = existing.find(s => s.isActive && s.id !== checkId);
        if (collision) {
          showToast('PIN already in use by another active staff member', 'error');
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

      this.editingStaffId = null;
      document.getElementById('staff-modal-title').textContent = 'Add Staff';
      document.getElementById('staff-modal').style.display = 'none';
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
          b.style.background = 'rgba(255,255,255,0.03)';
          b.style.color = 'var(--text-secondary)';
          b.style.border = '1px solid var(--border-glass)';
          b.classList.remove('active');
        });
        btn.style.background = 'var(--gradient-primary)';
        btn.style.color = 'white';
        btn.style.border = 'none';
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

      content.innerHTML = staffList.length === 0 ? '<div style="text-align:center;padding:60px;color:var(--text-muted);">No staff members yet.</div>' :
        `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">${staffList.map(s => {
          const role = ROLES[s.role] || ROLES.cashier;
          const isDeletable = !(s.role === 'owner' && owners.length <= 1);
          return `
            <div style="padding:18px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:14px;display:flex;align-items:center;gap:14px;position:relative;">
              <div style="width:44px;height:44px;border-radius:12px;background:rgba(${s.role === 'owner' ? '255,107,53' : '108,92,231'},0.1);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;color:${role.color};font-family:'Plus Jakarta Sans',sans-serif;flex-shrink:0;">${(s.name || '?')[0].toUpperCase()}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
                <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
                  <span style="font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:${role.color};background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">${role.label}</span>
                  <span style="font-size:0.6rem;color:${s.isActive ? 'var(--color-success)' : 'var(--color-error)'};font-weight:700;">${s.isActive ? '● Active' : '● Inactive'}</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="font-size:0.7rem;color:var(--text-muted);font-weight:600;letter-spacing:0.2em;">****</div>
                <button class="edit-staff-btn" data-id="${s.id}" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:4px;border-radius:6px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
                  <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
                </button>
                ${isDeletable ? `
                  <button class="delete-staff-btn" data-id="${s.id}" style="background:transparent;border:none;color:var(--color-danger);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:4px;border-radius:6px;transition:background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='transparent'">
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
        '<div style="text-align:center;padding:60px;color:var(--text-muted);"><span class="material-symbols-rounded" style="font-size:40px;display:block;margin-bottom:8px;opacity:0.3;">schedule</span>No shift records yet.</div>' :
        `<div style="display:flex;flex-direction:column;gap:10px;">${recent.map(s => `
          <div style="padding:14px 16px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:12px;display:flex;justify-content:space-between;align-items:center;">
            <div><div style="font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">Staff #${s.staffId}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);">${s.date || '—'}</div></div>
            <div style="text-align:right;"><div style="font-size:var(--text-xs);color:var(--color-success);">${s.clockIn || '—'} → ${s.clockOut || 'Active'}</div></div>
          </div>
        `).join('')}</div>`;
    } else {
      const logs = await db.activityLog.reverse().sortBy('timestamp');
      const recent = logs.slice(0, 30);
      content.innerHTML = recent.length === 0 ?
        '<div style="text-align:center;padding:60px;color:var(--text-muted);"><span class="material-symbols-rounded" style="font-size:40px;display:block;margin-bottom:8px;opacity:0.3;">history</span>No activity logged yet.</div>' :
        `<div style="display:flex;flex-direction:column;gap:8px;">${recent.map(l => `
          <div style="padding:12px 14px;background:rgba(255,255,255,0.01);border:1px solid var(--border-glass);border-radius:10px;display:flex;gap:12px;align-items:center;">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--color-primary);">history</span>
            <div style="flex:1;"><div style="font-size:var(--text-xs);color:var(--text-primary);font-weight:600;">${l.action || 'Action'}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);">${l.staffName || 'System'} · ${new Date(l.timestamp).toLocaleString('en-IN')}</div></div>
          </div>
        `).join('')}</div>`;
    }
  }

  unmount() { this.container = null; }
}
