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
import { lookupAuthUser } from '../../services/staffAdmin.js';

// Roles that require a verified Supabase Auth account (operational backend access)
const CLOUD_REQUIRED_ROLES = ['owner', 'manager'];

const ROLES = {
  owner: { label: 'Owner', color: '#FF6B35' },
  manager: { label: 'Manager', color: '#6C5CE7' },
  cashier: { label: 'Cashier', color: '#10B981' },
  kitchen: { label: 'Kitchen', color: '#F59E0B' },
  waiter: { label: 'Waiter', color: '#3B82F6' },
  delivery: { label: 'Delivery', color: '#06B6D4' },
};

export class StaffView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.tab = 'directory';
    this.editingStaffId = null;
    // Tracks the verified cloud user for the current modal session
    this.verifiedCloudUser = null; // { authUserId, email, confirmed, existingMembership }
  }

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
        <div class="modal" style="max-width:420px;">
          <div class="modal-header">
            <h3 id="staff-modal-title">Add Staff</h3>
            <button class="btn-icon" id="staff-close-icon"><span class="material-symbols-rounded">close</span></button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
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

            <!-- Cloud Account Verification (shown for owner/manager roles) -->
            <div id="staff-cloud-section" style="display:none;">
              <div style="background:rgba(108,92,231,0.06);border:1px solid rgba(108,92,231,0.15);border-radius:var(--radius-md);padding:12px;margin-bottom:4px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                  <span class="material-symbols-rounded" style="font-size:16px;color:var(--nextgenos-purple);">verified_user</span>
                  <span style="font-size:0.72rem;font-weight:700;color:var(--nextgenos-purple);text-transform:uppercase;letter-spacing:0.05em;">Cloud Account Verification Required</span>
                </div>
                <p style="font-size:0.7rem;color:var(--text-secondary);margin:0 0 10px;line-height:1.4;">Owner and Manager roles require a verified Supabase Auth account. Enter the staff member's login email to verify.</p>
                <div style="display:flex;gap:8px;align-items:stretch;">
                  <input type="email" id="staff-cloud-email" class="input" placeholder="staff@example.com" style="flex:1;font-size:0.8rem;">
                  <button id="staff-verify-btn" class="btn btn-secondary btn-sm" style="white-space:nowrap;padding:6px 14px;font-size:0.72rem;font-weight:700;">
                    <span class="material-symbols-rounded" style="font-size:14px;">search</span> Verify
                  </button>
                </div>
                <div id="staff-cloud-status" style="margin-top:8px;min-height:24px;"></div>
              </div>
            </div>

            <div class="input-group">
              <label for="staff-name">Staff Name</label>
              <input type="text" id="staff-name" class="input" placeholder="e.g. Rahul Sharma">
            </div>
            <div class="input-group">
              <label for="staff-pin">4-Digit PIN</label>
              <input type="password" id="staff-pin" class="input" placeholder="e.g. 1234" maxlength="4" style="letter-spacing: 0.3em; text-align: center;">
            </div>
            <div class="input-group">
              <label for="staff-phone">Phone Number</label>
              <input type="tel" id="staff-phone" class="input" placeholder="e.g. 9876543210">
            </div>
            <div class="input-group" style="flex-direction:row; align-items:center; gap:8px; margin-top:8px;">
              <input type="checkbox" id="staff-allow-express" style="width:auto; cursor:pointer; height: 18px; margin: 0;">
              <label for="staff-allow-express" style="margin:0; cursor:pointer; font-weight: 500;">Allow access to Express Panel</label>
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

  /** Show/hide the cloud verification section based on selected role */
  updateCloudSectionVisibility() {
    const role = document.getElementById('staff-role')?.value;
    const cloudSection = document.getElementById('staff-cloud-section');
    if (cloudSection) {
      cloudSection.style.display = CLOUD_REQUIRED_ROLES.includes(role) ? 'block' : 'none';
    }
  }

  /** Reset the cloud verification state */
  resetCloudVerification() {
    this.verifiedCloudUser = null;
    const emailEl = document.getElementById('staff-cloud-email');
    const statusEl = document.getElementById('staff-cloud-status');
    if (emailEl) emailEl.value = '';
    if (statusEl) statusEl.innerHTML = '';
  }

  /** Display the cloud verification result */
  showCloudStatus(result) {
    const statusEl = document.getElementById('staff-cloud-status');
    if (!statusEl) return;

    if (!result || !result.success) {
      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);">
          <span class="material-symbols-rounded" style="font-size:14px;color:var(--color-danger);">error</span>
          <span style="font-size:0.7rem;color:var(--color-danger);font-weight:600;">${escapeHtml(result?.message || 'Verification failed. Check your connection.')}</span>
        </div>`;
      return;
    }

    const data = result.data;
    if (!data?.found) {
      statusEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);">
          <span class="material-symbols-rounded" style="font-size:14px;color:var(--color-danger);">person_off</span>
          <span style="font-size:0.7rem;color:var(--color-danger);font-weight:600;">No account found. This person must sign up first.</span>
        </div>`;
      this.verifiedCloudUser = null;
      return;
    }

    // Auto-fill name field if empty
    const nameEl = document.getElementById('staff-name');
    if (nameEl && !nameEl.value.trim() && data.email) {
      const emailName = data.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      nameEl.value = emailName;
    }

    this.verifiedCloudUser = {
      authUserId: data.authUserId,
      email: data.email,
      confirmed: data.confirmed,
      existingMembership: data.existingMembership
    };

    let membershipNote = '';
    if (data.existingMembership) {
      const m = data.existingMembership;
      membershipNote = `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;">Already linked as <strong>${escapeHtml(m.role)}</strong> (${m.isActive ? 'active' : 'inactive'})</div>`;
    }

    statusEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);">
        <span class="material-symbols-rounded" style="font-size:14px;color:var(--color-success);">verified</span>
        <div>
          <span style="font-size:0.7rem;color:var(--color-success);font-weight:600;">Verified: ${escapeHtml(data.email)}</span>
          ${data.confirmed ? '' : '<span style="font-size:0.6rem;color:var(--text-muted);margin-left:4px;">(email not confirmed)</span>'}
          ${membershipNote}
        </div>
      </div>`;
  }

  bindEvents() {
    const modal = document.getElementById('staff-modal');
    const resetModal = () => {
      this.editingStaffId = null;
      this.resetCloudVerification();
      document.getElementById('staff-modal-title').textContent = 'Add Staff';
      ['staff-name', 'staff-pin', 'staff-phone'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('staff-pin').placeholder = '4-digit PIN';
      document.getElementById('staff-role').value = 'cashier';
      document.getElementById('staff-allow-express').checked = false;
      this.updateCloudSectionVisibility();
    };

    document.getElementById('add-staff-btn').addEventListener('click', () => {
      playSound(700, 80);
      resetModal();
      modal.style.display = 'flex';
    });

    const closeModal = () => {
      resetModal();
      modal.style.display = 'none';
    };
    document.getElementById('staff-cancel').addEventListener('click', closeModal);
    document.getElementById('staff-close-icon')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Toggle cloud section visibility when role changes
    document.getElementById('staff-role')?.addEventListener('change', () => {
      this.updateCloudSectionVisibility();
      // Reset verification when role changes
      if (!CLOUD_REQUIRED_ROLES.includes(document.getElementById('staff-role').value)) {
        this.resetCloudVerification();
      }
    });

    // Verify cloud account button
    document.getElementById('staff-verify-btn')?.addEventListener('click', async () => {
      const email = document.getElementById('staff-cloud-email')?.value?.trim();
      if (!email || !email.includes('@')) {
        showToast('Enter a valid email address to verify', 'warning');
        return;
      }

      const verifyBtn = document.getElementById('staff-verify-btn');
      const statusEl = document.getElementById('staff-cloud-status');
      verifyBtn.disabled = true;
      verifyBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Checking…';
      statusEl.innerHTML = '';

      try {
        const result = await lookupAuthUser(email);
        this.showCloudStatus(result);
      } catch (err) {
        this.showCloudStatus({ success: false, message: 'Network error: ' + err.message });
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">search</span> Verify';
      }
    });

    // Save staff member
    document.getElementById('staff-save').addEventListener('click', async () => {
      const name = document.getElementById('staff-name').value.trim();
      const role = document.getElementById('staff-role').value;
      const pin = document.getElementById('staff-pin').value;
      const phone = document.getElementById('staff-phone').value.trim();
      const allowExpress = document.getElementById('staff-allow-express').checked ? 1 : 0;
      
      if (!name) { showToast('Name is required', 'error'); return; }
      
      const isEdit = !!this.editingStaffId;

      // ── Enforce cloud verification for operational backend roles ──
      if (CLOUD_REQUIRED_ROLES.includes(role)) {
        if (!this.verifiedCloudUser || !this.verifiedCloudUser.authUserId) {
          showToast(`${role === 'owner' ? 'Owner' : 'Manager'} role requires a verified Supabase Auth account. Please verify the email first.`, 'error');
          return;
        }
      }
      
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

      // Build staff data with optional cloud user link
      const cloudUserId = this.verifiedCloudUser?.authUserId || null;

      if (isEdit) {
        const updateData = { name, role, phone, allowExpress, isSynced: 0 };
        if (pin) updateData.pinHash = hashedPin;
        if (cloudUserId) updateData.cloudUserId = cloudUserId;
        await db.staff.update(this.editingStaffId, updateData);
        showToast('Staff member updated!', 'success');
      } else {
        await db.staff.add({
          name, role, pinHash: hashedPin, phone, allowExpress,
          cloudUserId,
          isActive: true,
          createdAt: new Date().toISOString(),
          isSynced: 0,
          _platform: 'nextgenos'
        });
        showToast('Staff member added!', 'success');
      }

      if (role === 'owner' && pin) {
        await db.settings.put({ key: 'adminPinHash', value: hashedPin });
      }

      resetModal();
      modal.style.display = 'none';
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
          const hasExpress = s.allowExpress === 1 || s.allowExpress === true || s.role === 'owner';
          const expressBadge = hasExpress ? `<span style="font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:var(--nextgenos-purple);background:var(--nextgenos-purple-bg);border:1px solid var(--nextgenos-purple-border);margin-left:4px;">Express Panel</span>` : '';
          return `
            <div class="premium-card">
              <div class="premium-card-avatar" style="background:rgba(${s.role === 'owner' ? '255,107,53' : '108,92,231'},0.1); color:${role.color};">
                ${escapeHtml((s.name || '?')[0].toUpperCase())}
              </div>
              <div class="premium-card-body">
                <span class="premium-card-title">${escapeHtml(s.name)}</span>
                <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
                  <span style="font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:${role.color};background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);">${role.label}</span>
                  ${expressBadge}
                  ${s.cloudUserId ? `<span style="font-size:0.6rem;padding:2px 8px;border-radius:6px;font-weight:700;color:var(--color-success);background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.15);margin-left:4px;"><span class="material-symbols-rounded" style="font-size:10px;vertical-align:middle;">verified</span> Cloud</span>` : ''}
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
          this.resetCloudVerification();
          document.getElementById('staff-modal-title').textContent = 'Edit Staff Member';
          document.getElementById('staff-name').value = staffMember.name || '';
          document.getElementById('staff-role').value = staffMember.role || 'cashier';
          document.getElementById('staff-pin').value = '';
          document.getElementById('staff-pin').placeholder = '•••• (leave blank to keep)';
          document.getElementById('staff-phone').value = staffMember.phone || '';
          document.getElementById('staff-allow-express').checked = staffMember.allowExpress === 1 || staffMember.allowExpress === true;

          // If already linked to a cloud user, pre-populate the verification
          if (staffMember.cloudUserId) {
            this.verifiedCloudUser = {
              authUserId: staffMember.cloudUserId,
              email: null,
              confirmed: true,
              existingMembership: null
            };
            const statusEl = document.getElementById('staff-cloud-status');
            if (statusEl) {
              statusEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);">
                  <span class="material-symbols-rounded" style="font-size:14px;color:var(--color-success);">verified</span>
                  <span style="font-size:0.7rem;color:var(--color-success);font-weight:600;">Already linked to cloud account</span>
                </div>`;
            }
          }

          this.updateCloudSectionVisibility();
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
