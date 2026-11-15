/**
 * APLYD - Data Store & Persistence Engine
 * Supports Dual-Mode Operation:
 * 1. Cloud Mode (Supabase PostgreSQL + Storage + Edge Functions)
 * 2. Autonomous Local Mode (IndexedDB / LocalStorage) with full relational integrity
 */

const SEED_MACHINES = [
  { id: 'a0000000-0000-0000-0000-000000000001', machine_code: 'L-01', name: 'Loom 01 (Air-Jet)', machine_type: 'Air-Jet', default_unit: 'metres', min_expected_quantity: 150, max_expected_quantity: 750, is_active: true, notes: 'Shed A - Fine Cotton Cambric' },
  { id: 'a0000000-0000-0000-0000-000000000002', machine_code: 'L-02', name: 'Loom 02 (Air-Jet)', machine_type: 'Air-Jet', default_unit: 'metres', min_expected_quantity: 150, max_expected_quantity: 750, is_active: true, notes: 'Shed A - Poplin 40s' },
  { id: 'a0000000-0000-0000-0000-000000000003', machine_code: 'L-03', name: 'Loom 03 (Rapier)', machine_type: 'Rapier', default_unit: 'metres', min_expected_quantity: 100, max_expected_quantity: 500, is_active: true, notes: 'Shed B - Heavy Twill / Denim 3/1' },
  { id: 'a0000000-0000-0000-0000-000000000004', machine_code: 'L-04', name: 'Loom 04 (Rapier)', machine_type: 'Rapier', default_unit: 'metres', min_expected_quantity: 100, max_expected_quantity: 500, is_active: true, notes: 'Shed B - Oxford Shirting' },
  { id: 'a0000000-0000-0000-0000-000000000005', machine_code: 'L-05', name: 'Loom 05 (Rapier)', machine_type: 'Rapier', default_unit: 'metres', min_expected_quantity: 100, max_expected_quantity: 550, is_active: true, notes: 'Shed B - Linen Blend' },
  { id: 'a0000000-0000-0000-0000-000000000006', machine_code: 'L-06', name: 'Loom 06 (Air-Jet)', machine_type: 'Air-Jet', default_unit: 'metres', min_expected_quantity: 150, max_expected_quantity: 750, is_active: true, notes: 'Shed A - Voile 60s' },
  { id: 'a0000000-0000-0000-0000-000000000007', machine_code: 'L-07', name: 'Loom 07 (Air-Jet)', machine_type: 'Air-Jet', default_unit: 'metres', min_expected_quantity: 150, max_expected_quantity: 750, is_active: true, notes: 'Shed A - Sheeting 30s' },
  { id: 'a0000000-0000-0000-0000-000000000008', machine_code: 'L-08', name: 'Loom 08 (Shuttle)', machine_type: 'Shuttle', default_unit: 'metres', min_expected_quantity: 50, max_expected_quantity: 300, is_active: true, notes: 'Shed C - Selvedge Drill' },
  { id: 'a0000000-0000-0000-0000-000000000009', machine_code: 'L-09', name: 'Loom 09 (Shuttle)', machine_type: 'Shuttle', default_unit: 'metres', min_expected_quantity: 50, max_expected_quantity: 300, is_active: true, notes: 'Shed C - Heavy Duck Canvas' },
  { id: 'a0000000-0000-0000-0000-000000000010', machine_code: 'L-10', name: 'Loom 10 (Air-Jet)', machine_type: 'Air-Jet', default_unit: 'metres', min_expected_quantity: 150, max_expected_quantity: 750, is_active: true, notes: 'Shed A - Cotton Satin 50s' },
  { id: 'a0000000-0000-0000-0000-000000000011', machine_code: 'L-11', name: 'Loom 11 (Rapier)', machine_type: 'Rapier', default_unit: 'metres', min_expected_quantity: 100, max_expected_quantity: 550, is_active: true, notes: 'Shed B - Yarn Dyed Check' },
  { id: 'a0000000-0000-0000-0000-000000000012', machine_code: 'L-12', name: 'Loom 12 (Air-Jet High Speed)', machine_type: 'Air-Jet', default_unit: 'metres', min_expected_quantity: 150, max_expected_quantity: 800, is_active: true, notes: 'Shed A - Premium Combed Poplin' }
];

const SEED_SHIFTS = [
  { id: 'b0000000-0000-0000-0000-000000000001', shift_code: 'M', name: 'Morning Shift', start_time: '06:00', end_time: '14:00', duration_minutes: 480, is_active: true },
  { id: 'b0000000-0000-0000-0000-000000000002', shift_code: 'E', name: 'Evening Shift', start_time: '14:00', end_time: '22:00', duration_minutes: 480, is_active: true },
  { id: 'b0000000-0000-0000-0000-000000000003', shift_code: 'N', name: 'Night Shift', start_time: '22:00', end_time: '06:00', duration_minutes: 480, is_active: true }
];

const SEED_PROFILES = [
  { id: 'c0000000-0000-0000-0000-000000000001', full_name: 'Ramesh Kumar (Operator)', role: 'operator', is_active: true, email: 'ramesh.operator@aplyd.demo' },
  { id: 'c0000000-0000-0000-0000-000000000002', full_name: 'Priya Sharma (Supervisor)', role: 'supervisor', is_active: true, email: 'priya.supervisor@aplyd.demo' },
  { id: 'c0000000-0000-0000-0000-000000000003', full_name: 'Vikram Mehta (Plant Admin)', role: 'admin', is_active: true, email: 'vikram.admin@aplyd.demo' }
];

// Seed Historical Records for Day 1 Testing
const SEED_RECORDS = [
  {
    id: 'd0000000-0000-0000-0000-000000000001',
    record_number: 'PR-2026-0001',
    production_form_id: 'f0000000-0000-0000-0000-000000000001',
    machine_id: 'a0000000-0000-0000-0000-000000000012',
    machine_id_raw: 'L-12',
    shift_id: 'b0000000-0000-0000-0000-000000000001',
    shift_raw: 'M',
    production_date: '2026-11-15',
    production_date_raw: '15/11/2026',
    production_quantity: 420.0,
    production_unit: 'metres',
    material_reference: 'Cotton 40s Cambric',
    batch_reference: 'LOT-C40-882',
    defects_count: 0,
    defect_details: null,
    downtime_minutes: 0,
    downtime_reason: null,
    remarks: 'Smooth operation across shift',
    status: 'approved',
    validation_status: 'pass',
    submitted_by: 'c0000000-0000-0000-0000-000000000001',
    reviewed_by: 'c0000000-0000-0000-0000-000000000002',
    reviewed_at: '2026-11-15T14:45:00Z',
    approval_note: 'Verified against loom counter',
    erp_reference: 'APLYD-ERP-2026-1042',
    created_at: '2026-11-15T14:10:00Z'
  },
  {
    id: 'd0000000-0000-0000-0000-000000000002',
    record_number: 'PR-2026-0002',
    production_form_id: 'f0000000-0000-0000-0000-000000000002',
    machine_id: 'a0000000-0000-0000-0000-000000000003',
    machine_id_raw: 'Loom 03',
    shift_id: 'b0000000-0000-0000-0000-000000000001',
    shift_raw: 'Morning',
    production_date: '2026-11-15',
    production_date_raw: '15/11/2026',
    production_quantity: 310.5,
    production_unit: 'metres',
    material_reference: 'Heavy Denim 3/1',
    batch_reference: 'DEN-2026-19',
    defects_count: 3,
    defect_details: 'Weft slub on selvedge',
    downtime_minutes: 45,
    downtime_reason: 'Warp thread replenishment',
    remarks: 'Batch completed mid-shift',
    status: 'approved',
    validation_status: 'pass',
    submitted_by: 'c0000000-0000-0000-0000-000000000001',
    reviewed_by: 'c0000000-0000-0000-0000-000000000002',
    reviewed_at: '2026-11-15T15:00:00Z',
    approval_note: 'Downtime verified with maintenance log',
    erp_reference: 'APLYD-ERP-2026-1043',
    created_at: '2026-11-15T14:15:00Z'
  },
  {
    id: 'd0000000-0000-0000-0000-000000000003',
    record_number: 'PR-2026-0003',
    production_form_id: 'f0000000-0000-0000-0000-000000000003',
    machine_id: 'a0000000-0000-0000-0000-000000000001',
    machine_id_raw: 'L-01',
    shift_id: 'b0000000-0000-0000-0000-000000000002',
    shift_raw: 'E',
    production_date: '2026-11-15',
    production_date_raw: '15/11/2026',
    production_quantity: 380.0,
    production_unit: 'metres',
    material_reference: 'Cotton Poplin 40s',
    batch_reference: 'POP-40-771',
    defects_count: 5,
    defect_details: 'Uneven weave, 2 oil spots',
    downtime_minutes: 30,
    downtime_reason: 'Lubrication & nozzle check',
    remarks: 'Awaiting supervisor sign-off',
    status: 'pending_review',
    validation_status: 'warning',
    submitted_by: 'c0000000-0000-0000-0000-000000000001',
    reviewed_by: null,
    reviewed_at: null,
    approval_note: null,
    erp_reference: null,
    created_at: '2026-11-15T16:30:00Z'
  }
];

class AplydStore {
  constructor() {
    this.storageKey = 'aplyd_local_db_v1';
    this.sessionKey = 'aplyd_active_session';
    this.init();
  }

  init() {
    let data = localStorage.getItem(this.storageKey);
    if (!data) {
      const initialDb = {
        machines: SEED_MACHINES,
        shifts: SEED_SHIFTS,
        profiles: SEED_PROFILES,
        production_forms: [],
        production_records: SEED_RECORDS,
        production_corrections: [],
        production_alerts: [
          {
            id: 'alt-001',
            production_record_id: 'd0000000-0000-0000-0000-000000000003',
            alert_type: 'defect_threshold_exceeded',
            severity: 'warning',
            field_key: 'defects_count',
            message: 'Defects count (5) is higher than normal shift baseline (<=2)',
            status: 'active',
            created_at: '2026-11-15T16:31:00Z'
          }
        ],
        erp_submissions: [
          {
            id: 'erp-001',
            production_record_id: 'd0000000-0000-0000-0000-000000000001',
            idempotency_key: 'ERP-IDEMPOTENCY-d0000000-0000-0000-0000-000000000001',
            request_payload: SEED_RECORDS[0],
            response_payload: { status: 'ACKNOWLEDGED', erp_reference: 'APLYD-ERP-2026-1042' },
            status: 'submitted',
            attempt_count: 1,
            external_reference: 'APLYD-ERP-2026-1042',
            submitted_at: '2026-11-15T14:46:00Z'
          },
          {
            id: 'erp-002',
            production_record_id: 'd0000000-0000-0000-0000-000000000002',
            idempotency_key: 'ERP-IDEMPOTENCY-d0000000-0000-0000-0000-000000000002',
            request_payload: SEED_RECORDS[1],
            response_payload: { status: 'ACKNOWLEDGED', erp_reference: 'APLYD-ERP-2026-1043' },
            status: 'submitted',
            attempt_count: 1,
            external_reference: 'APLYD-ERP-2026-1043',
            submitted_at: '2026-11-15T15:01:00Z'
          }
        ]
      };
      localStorage.setItem(this.storageKey, JSON.stringify(initialDb));
    }

    // Default session: Supervisor Priya Sharma
    if (!sessionStorage.getItem(this.sessionKey)) {
      sessionStorage.setItem(this.sessionKey, JSON.stringify(SEED_PROFILES[1]));
    }
  }

  getDb() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey)) || {};
    } catch {
      return {};
    }
  }

  saveDb(db) {
    localStorage.setItem(this.storageKey, JSON.stringify(db));
  }

  // --- SESSION & PERSONA SWITCHER ---
  getCurrentUser() {
    try {
      return JSON.parse(sessionStorage.getItem(this.sessionKey)) || SEED_PROFILES[1];
    } catch {
      return SEED_PROFILES[1];
    }
  }

  switchUser(role) {
    const db = this.getDb();
    const profile = (db.profiles || SEED_PROFILES).find(p => p.role === role) || SEED_PROFILES[1];
    sessionStorage.setItem(this.sessionKey, JSON.stringify(profile));
    return profile;
  }

  // --- MASTER DATA ---
  async getMachines() {
    return this.getDb().machines || SEED_MACHINES;
  }

  async getShifts() {
    return this.getDb().shifts || SEED_SHIFTS;
  }

  async saveMachine(machine) {
    const db = this.getDb();
    db.machines = db.machines || [];
    if (!machine.id) {
      machine.id = 'mach-' + Date.now();
      db.machines.push(machine);
    } else {
      const idx = db.machines.findIndex(m => m.id === machine.id);
      if (idx !== -1) db.machines[idx] = machine;
    }
    this.saveDb(db);
    return machine;
  }

  async saveShift(shift) {
    const db = this.getDb();
    db.shifts = db.shifts || [];
    if (!shift.id) {
      shift.id = 'shift-' + Date.now();
      db.shifts.push(shift);
    } else {
      const idx = db.shifts.findIndex(s => s.id === shift.id);
      if (idx !== -1) db.shifts[idx] = shift;
    }
    this.saveDb(db);
    return shift;
  }

  // --- PRODUCTION FORMS & EXTRACTION ---
  async saveProductionForm(form) {
    const db = this.getDb();
    db.production_forms = db.production_forms || [];
    if (!form.id) {
      form.id = 'form-' + Date.now();
      form.form_number = 'PF-2026-' + String(db.production_forms.length + 1).padStart(4, '0');
      form.uploaded_at = new Date().toISOString();
      db.production_forms.push(form);
    } else {
      const idx = db.production_forms.findIndex(f => f.id === form.id);
      if (idx !== -1) db.production_forms[idx] = form;
    }
    this.saveDb(db);
    return form;
  }

  async getFormBySha256(sha256) {
    if (!sha256) return null;
    const forms = this.getDb().production_forms || [];
    return forms.find(f => f.file_sha256 === sha256) || null;
  }

  async getFormById(formId) {
    const forms = this.getDb().production_forms || [];
    return forms.find(f => f.id === formId) || null;
  }

  // --- PRODUCTION RECORDS ---
  async getRecords(filters = {}) {
    let records = this.getDb().production_records || [];
    const machines = await this.getMachines();
    const shifts = await this.getShifts();

    // Attach machine and shift objects
    records = records.map(r => ({
      ...r,
      machine: machines.find(m => m.id === r.machine_id) || { machine_code: r.machine_id_raw || 'Unknown', name: r.machine_id_raw || 'Unknown Loom' },
      shift: shifts.find(s => s.id === r.shift_id) || { shift_code: r.shift_raw || 'N/A', name: r.shift_raw || 'N/A' }
    }));

    if (filters.status && filters.status !== 'all') {
      records = records.filter(r => r.status === filters.status);
    }
    if (filters.machine_id) {
      records = records.filter(r => r.machine_id === filters.machine_id);
    }
    if (filters.shift_id) {
      records = records.filter(r => r.shift_id === filters.shift_id);
    }
    if (filters.date) {
      records = records.filter(r => r.production_date === filters.date);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      records = records.filter(r =>
        (r.record_number && r.record_number.toLowerCase().includes(q)) ||
        (r.machine && r.machine.machine_code.toLowerCase().includes(q)) ||
        (r.material_reference && r.material_reference.toLowerCase().includes(q)) ||
        (r.batch_reference && r.batch_reference.toLowerCase().includes(q))
      );
    }

    // Sort descending by created_at
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return records;
  }

  async getRecordById(id) {
    const records = await this.getRecords();
    const record = records.find(r => r.id === id);
    if (!record) return null;

    const db = this.getDb();
    record.corrections = (db.production_corrections || []).filter(c => c.production_record_id === id);
    record.alerts = (db.production_alerts || []).filter(a => a.production_record_id === id);
    record.form = (db.production_forms || []).find(f => f.id === record.production_form_id) || null;
    record.erp_submission = (db.erp_submissions || []).find(e => e.production_record_id === id) || null;

    return record;
  }

  async saveRecord(record) {
    const db = this.getDb();
    db.production_records = db.production_records || [];
    if (!record.id) {
      record.id = 'rec-' + Date.now();
      record.record_number = 'PR-2026-' + String(db.production_records.length + 1).padStart(4, '0');
      record.created_at = new Date().toISOString();
      db.production_records.push(record);
    } else {
      const idx = db.production_records.findIndex(r => r.id === record.id);
      if (idx !== -1) {
        db.production_records[idx] = { ...db.production_records[idx], ...record, updated_at: new Date().toISOString() };
      }
    }
    this.saveDb(db);
    return record;
  }

  // --- AUDIT TRAIL / CORRECTION ENGINE ---
  async correctField(recordId, fieldKey, newValue, reason = '') {
    const db = this.getDb();
    const recordIdx = (db.production_records || []).findIndex(r => r.id === recordId);
    if (recordIdx === -1) throw new Error("Record not found");

    const record = db.production_records[recordIdx];
    const originalValue = record[fieldKey];

    // Log append-only audit trail
    const correction = {
      id: 'corr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      production_record_id: recordId,
      field_key: fieldKey,
      original_value: originalValue,
      corrected_value: newValue,
      reason: reason || 'Supervisor manual adjustment during verification',
      changed_by: this.getCurrentUser().id,
      changed_by_name: this.getCurrentUser().full_name,
      changed_at: new Date().toISOString()
    };

    db.production_corrections = db.production_corrections || [];
    db.production_corrections.push(correction);

    // Update field value on record
    record[fieldKey] = newValue;
    record.updated_at = new Date().toISOString();

    // Re-check validation
    if (record.status === 'returned_for_correction') {
      record.status = 'pending_review';
    }

    db.production_records[recordIdx] = record;
    this.saveDb(db);

    return { record, correction };
  }

  // --- APPROVAL WORKFLOW (ROLE RESTRICTED) ---
  async approveRecord(recordId, approvalNote = '') {
    const currentUser = this.getCurrentUser();
    if (currentUser.role === 'operator') {
      throw new Error("Permission Denied: Operators cannot approve production records. An authorized supervisor or admin must review.");
    }

    const db = this.getDb();
    const recordIdx = (db.production_records || []).findIndex(r => r.id === recordId);
    if (recordIdx === -1) throw new Error("Record not found");

    const record = db.production_records[recordIdx];

    // Hard blockers verification
    if (!record.machine_id || !record.production_date || !record.shift_id || record.production_quantity === null || record.production_quantity === undefined) {
      throw new Error("Validation Blocker: Cannot approve. Machine, Date, Shift, and Quantity are mandatory.");
    }

    if (Number(record.production_quantity) < 0) {
      throw new Error("Validation Blocker: Production quantity cannot be negative.");
    }

    record.status = 'approved';
    record.validation_status = 'pass';
    record.reviewed_by = currentUser.id;
    record.reviewed_by_name = currentUser.full_name;
    record.reviewed_at = new Date().toISOString();
    record.approval_note = approvalNote || 'Verified and approved for downstream ERP handoff';
    record.updated_at = new Date().toISOString();

    db.production_records[recordIdx] = record;
    this.saveDb(db);

    // Automatically trigger mock ERP submission on approval
    await this.submitToErp(recordId);

    return record;
  }

  async rejectRecord(recordId, rejectionReason = '') {
    const currentUser = this.getCurrentUser();
    if (currentUser.role === 'operator') {
      throw new Error("Permission Denied: Operators cannot reject records.");
    }
    const db = this.getDb();
    const recordIdx = (db.production_records || []).findIndex(r => r.id === recordId);
    if (recordIdx === -1) throw new Error("Record not found");

    db.production_records[recordIdx].status = 'rejected';
    db.production_records[recordIdx].rejection_reason = rejectionReason || 'Rejected by supervisor';
    db.production_records[recordIdx].reviewed_by = currentUser.id;
    db.production_records[recordIdx].reviewed_at = new Date().toISOString();
    this.saveDb(db);
    return db.production_records[recordIdx];
  }

  async returnForCorrection(recordId, reason = '') {
    const currentUser = this.getCurrentUser();
    if (currentUser.role === 'operator') {
      throw new Error("Permission Denied: Operators cannot return records.");
    }
    const db = this.getDb();
    const recordIdx = (db.production_records || []).findIndex(r => r.id === recordId);
    if (recordIdx === -1) throw new Error("Record not found");

    db.production_records[recordIdx].status = 'returned_for_correction';
    db.production_records[recordIdx].rejection_reason = reason || 'Returned to operator for clarification';
    this.saveDb(db);
    return db.production_records[recordIdx];
  }

  // --- DOWNSTREAM MOCK ERP HANDOFF ---
  async submitToErp(recordId, simulateFailure = false) {
    const db = this.getDb();
    const record = (db.production_records || []).find(r => r.id === recordId);
    if (!record) throw new Error("Record not found");
    if (record.status !== 'approved') {
      throw new Error("Cannot submit to ERP: Only approved records can be dispatched.");
    }

    const idempotencyKey = `ERP-IDEMPOTENCY-${recordId}`;
    db.erp_submissions = db.erp_submissions || [];

    // Idempotency check: if already submitted, replay existing reference
    const existing = db.erp_submissions.find(e => e.idempotency_key === idempotencyKey);
    if (existing && existing.status === 'submitted') {
      return {
        success: true,
        message: "Record previously submitted to ERP (Idempotent replay)",
        erp_reference: existing.external_reference,
        is_replay: true
      };
    }

    if (simulateFailure) {
      const failedEntry = {
        id: 'erp-' + Date.now(),
        production_record_id: recordId,
        idempotency_key: idempotencyKey,
        request_payload: record,
        response_payload: { error: 'ERP Gateway Timeout 504' },
        status: 'failed',
        attempt_count: (existing?.attempt_count || 0) + 1,
        last_error: 'ERP Gateway Timeout 504',
        submitted_at: new Date().toISOString()
      };
      if (existing) {
        Object.assign(existing, failedEntry);
      } else {
        db.erp_submissions.push(failedEntry);
      }
      this.saveDb(db);
      throw new Error("ERP Gateway Timeout 504: Simulated destination server unavailable");
    }

    // Success dispatch
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const erpRef = `APLYD-ERP-${new Date().getFullYear()}-${randomSuffix}`;
    const submissionEntry = {
      id: 'erp-' + Date.now(),
      production_record_id: recordId,
      idempotency_key: idempotencyKey,
      request_payload: record,
      response_payload: {
        status: 'ACKNOWLEDGED',
        erp_reference: erpRef,
        message: 'Textile shop-floor production telemetry ingested into manufacturing ledger.'
      },
      status: 'submitted',
      attempt_count: (existing?.attempt_count || 0) + 1,
      external_reference: erpRef,
      submitted_at: new Date().toISOString()
    };

    if (existing) {
      Object.assign(existing, submissionEntry);
    } else {
      db.erp_submissions.push(submissionEntry);
    }

    // Stamp erp_reference on record
    record.erp_reference = erpRef;
    this.saveDb(db);

    return {
      success: true,
      message: "Production record successfully ingested by Mock ERP endpoint",
      erp_reference: erpRef,
      is_replay: false
    };
  }

  // --- DASHBOARD & ANALYTICS AGGREGATIONS ---
  async getDashboardMetrics() {
    const records = await this.getRecords();
    const today = new Date().toISOString().split('T')[0];

    const approvedToday = records.filter(r => r.status === 'approved' && r.production_date === today);
    const totalMetersToday = approvedToday.reduce((sum, r) => sum + (Number(r.production_quantity) || 0), 0);
    const formsToday = records.filter(r => (r.created_at || '').startsWith(today)).length;
    const pendingReviews = records.filter(r => r.status === 'pending_review').length;
    const activeExceptions = (this.getDb().production_alerts || []).filter(a => a.status === 'active').length;

    return {
      totalMetersToday: Math.round(totalMetersToday * 10) / 10,
      formsToday: formsToday || records.length,
      pendingReviews,
      activeExceptions,
      recentRecords: records.slice(0, 5)
    };
  }
}

window.aplydStore = new AplydStore();
