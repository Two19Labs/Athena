/**
 * APLYD - Browser data store.
 *
 * Prototype persistence (documented assumption): structured records live in
 * localStorage, form photos live in IndexedDB (photos are too large for
 * localStorage). Each browser therefore has its own data set. The production
 * design (shared Postgres + object storage) is described in docs/.
 */
(function () {
  const Rules = window.AplydRules;
  const DB_KEY = 'aplyd_db_v2';
  const LEGACY_KEYS = ['aplyd_local_db_v1'];
  const SESSION_KEY = 'aplyd_session_v2';

  const DEFAULT_MACHINES = [
    ['01', 'Air-Jet', 150, 750, 'Shed A - Fine Cotton Cambric'],
    ['02', 'Air-Jet', 150, 750, 'Shed A - Poplin 40s'],
    ['03', 'Rapier', 100, 500, 'Shed B - Heavy Twill / Denim 3/1'],
    ['04', 'Rapier', 100, 500, 'Shed B - Oxford Shirting'],
    ['05', 'Rapier', 100, 550, 'Shed B - Linen Blend'],
    ['06', 'Air-Jet', 150, 750, 'Shed A - Voile 60s'],
    ['07', 'Air-Jet', 150, 750, 'Shed A - Sheeting 30s'],
    ['08', 'Shuttle', 50, 300, 'Shed C - Selvedge Drill'],
    ['09', 'Shuttle', 50, 300, 'Shed C - Heavy Duck Canvas'],
    ['10', 'Air-Jet', 150, 750, 'Shed A - Cotton Satin 50s'],
    ['11', 'Rapier', 100, 550, 'Shed B - Yarn Dyed Check'],
    ['12', 'Air-Jet', 150, 800, 'Shed A - Premium Combed Poplin']
  ].map(([n, type, min, max, notes]) => ({
    id: `mach-${n}`, machine_code: `L-${n}`, name: `Loom ${n} (${type})`, machine_type: type,
    default_unit: 'metres', min_expected_quantity: min, max_expected_quantity: max, is_active: true, notes
  }));

  const DEFAULT_SHIFTS = [
    { id: 'shift-m', shift_code: 'M', name: 'Morning Shift', start_time: '06:00', end_time: '14:00', is_active: true },
    { id: 'shift-e', shift_code: 'E', name: 'Evening Shift', start_time: '14:00', end_time: '22:00', is_active: true },
    { id: 'shift-n', shift_code: 'N', name: 'Night Shift', start_time: '22:00', end_time: '06:00', is_active: true }
  ];

  const PROFILES = [
    { id: 'user-operator', full_name: 'Ramesh Kumar', role: 'operator' },
    { id: 'user-supervisor', full_name: 'Priya Sharma', role: 'supervisor' },
    { id: 'user-admin', full_name: 'Vikram Mehta', role: 'admin' }
  ];

  function nowIso() { return new Date().toISOString(); }
  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------------------------------------------------------------------------
  // IndexedDB for photos
  // ---------------------------------------------------------------------------
  // Two object stores: 'images' (one photo per form) and 'outbox' (photos taken with no
  // signal, waiting to be read when the phone is back online).
  const imageDb = {
    _db: null,
    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('This browser does not support IndexedDB, so photos cannot be stored.'));
        const req = indexedDB.open('aplyd_images', 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
          if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox');
        };
        req.onsuccess = () => { this._db = req.result; resolve(this._db); };
        req.onerror = () => reject(req.error || new Error('Could not open image storage.'));
      });
    },
    async put(key, value, store = 'images') {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Could not save photo (storage may be full).'));
      });
    },
    async get(key, store = 'images') {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },
    async all(store) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async remove(key, store) {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    },
    async clear() {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(['images', 'outbox'], 'readwrite');
        tx.objectStore('images').clear();
        tx.objectStore('outbox').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Store
  // ---------------------------------------------------------------------------
  class AplydStore {
    constructor() {
      LEGACY_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } });
      this._cache = { raw: null, db: null };
      const db = this._read();
      if (!db) this._write(this._freshDb());
      else {
        let changed = false;
        if (db.records.some(r => r.seed)) {
          // Older builds shipped demo history records; remove them so every record on screen is real.
          db.records = db.records.filter(r => !r.seed);
          changed = true;
        }
        if (!Array.isArray(db.downtime_reasons)) { db.downtime_reasons = this._defaultReasons(); changed = true; }
        if (changed) this._write(db);
      }
    }

    _defaultReasons() {
      return Rules.DEFAULT_DOWNTIME_REASONS.map(r => ({ id: `reason-${r.code.toLowerCase()}`, ...r, synonyms: [...r.synonyms], is_active: true }));
    }

    _freshDb() {
      return {
        version: 2,
        machines: DEFAULT_MACHINES.map(m => ({ ...m })),
        shifts: DEFAULT_SHIFTS.map(s => ({ ...s })),
        downtime_reasons: this._defaultReasons(),
        forms: [],
        records: [],
        corrections: []
      };
    }

    _read() {
      try {
        const db = JSON.parse(localStorage.getItem(DB_KEY));
        return db && db.version === 2 ? db : null;
      } catch (_) {
        return null;
      }
    }

    /** Fresh, private copy of the database: use this before changing anything. */
    _db() { return this._read() || this._freshDb(); }

    /**
     * Read-only view, parsed once and reused until the stored text changes (another tab, or a write).
     * Pages that check many records (queue, dashboard) no longer re-parse the database per record.
     * Callers must not modify what this returns.
     */
    _view() {
      let raw = null;
      try { raw = localStorage.getItem(DB_KEY); } catch (_) { /* ignore */ }
      if (raw && raw === this._cache.raw && this._cache.db) return this._cache.db;
      const db = this._db();
      this._cache = { raw, db };
      return db;
    }

    _write(db) {
      const raw = JSON.stringify(db);
      try {
        localStorage.setItem(DB_KEY, raw);
      } catch (err) {
        throw new Error('Browser storage is full. Export the register and use "Reset demo data" on the sign-in page.');
      }
      this._cache = { raw: null, db: null }; // next read re-parses, so no caller shares objects with a writer
    }

    async resetDemo() {
      this._write(this._freshDb());
      try { await imageDb.clear(); } catch (_) { /* ignore */ }
    }

    // --- Session / personas (prototype has no real authentication) ---
    getCurrentUser() {
      try {
        const u = JSON.parse(sessionStorage.getItem(SESSION_KEY));
        if (u && PROFILES.some(p => p.id === u.id)) return u;
      } catch (_) { /* ignore */ }
      return PROFILES[1];
    }

    switchUser(role) {
      const profile = PROFILES.find(p => p.role === role) || PROFILES[1];
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
      return profile;
    }

    can(action, record) {
      const u = this.getCurrentUser();
      const reviewer = u.role === 'supervisor' || u.role === 'admin';
      switch (action) {
        case 'review': return reviewer && record && record.status === 'pending_review';
        case 'edit':
          if (!record) return false;
          if (reviewer) return record.status === 'pending_review';
          return u.role === 'operator' && record.status === 'returned_for_correction' && record.submitted_by === u.id;
        case 'resubmit': return u.role === 'operator' && record && record.status === 'returned_for_correction' && record.submitted_by === u.id;
        case 'dispatch_erp': return reviewer && record && record.status === 'approved';
        case 'manage_master': return u.role === 'admin';
        default: return false;
      }
    }

    // --- Master data ---
    async getMachines() { return this._view().machines; }
    async getShifts() { return this._view().shifts; }
    async getReasons() { return this._view().downtime_reasons || []; }

    async saveReason(reason) {
      if (!this.can('manage_master')) throw new Error('Only an admin can change the downtime reason list.');
      const db = this._db();
      const code = String(reason.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9_]{2,10}$/.test(code)) throw new Error('Code must be 2-10 letters, digits or _ (e.g. CLEAN).');
      if (code === Rules.OTHER_REASON.code) throw new Error('OTHER is reserved for reasons that match nothing.');
      if (!reason.name || !String(reason.name).trim()) throw new Error('Name is required.');
      if (db.downtime_reasons.some(r => r.code === code && r.id !== reason.id)) throw new Error(`Reason ${code} already exists.`);
      const synonyms = (Array.isArray(reason.synonyms) ? reason.synonyms : String(reason.synonyms || '').split(','))
        .map(s => s.trim()).filter(Boolean).slice(0, 40);
      const clean = { ...reason, code, name: String(reason.name).trim(), synonyms, is_active: reason.is_active !== false };
      if (!clean.id) {
        clean.id = uid('reason');
        db.downtime_reasons.push(clean);
      } else {
        const i = db.downtime_reasons.findIndex(r => r.id === clean.id);
        if (i === -1) throw new Error('Reason not found.');
        db.downtime_reasons[i] = clean;
      }
      this._write(db);
      return clean;
    }

    async saveMachine(machine) {
      if (!this.can('manage_master')) throw new Error('Only an admin can change loom master data.');
      const db = this._db();
      const code = Rules.normalizeMachineCode(machine.machine_code);
      if (!code) throw new Error('Loom code must contain a number, e.g. L-13.');
      if (!machine.name || !String(machine.name).trim()) throw new Error('Loom name is required.');
      const min = Number(machine.min_expected_quantity);
      const max = Number(machine.max_expected_quantity);
      if (!(min >= 0) || !(max > 0) || min >= max) throw new Error('Expected range must satisfy 0 <= min < max.');
      if (db.machines.some(m => m.machine_code === code && m.id !== machine.id)) throw new Error(`Loom ${code} already exists.`);
      const clean = { ...machine, machine_code: code, name: String(machine.name).trim(), min_expected_quantity: min, max_expected_quantity: max, default_unit: machine.default_unit || 'metres' };
      if (!clean.id) {
        clean.id = uid('mach');
        db.machines.push(clean);
      } else {
        const i = db.machines.findIndex(m => m.id === clean.id);
        if (i === -1) throw new Error('Loom not found.');
        db.machines[i] = clean;
      }
      this._write(db);
      return clean;
    }

    async saveShift(shift) {
      if (!this.can('manage_master')) throw new Error('Only an admin can change shift schedules.');
      const db = this._db();
      const code = String(shift.shift_code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{1,3}$/.test(code)) throw new Error('Shift code must be 1-3 letters or digits.');
      if (!shift.name || !String(shift.name).trim()) throw new Error('Shift name is required.');
      if (!/^\d{2}:\d{2}$/.test(shift.start_time || '') || !/^\d{2}:\d{2}$/.test(shift.end_time || '')) throw new Error('Start and end time are required.');
      if (shift.start_time === shift.end_time) throw new Error('Start and end time cannot be the same.');
      if (db.shifts.some(s => s.shift_code === code && s.id !== shift.id)) throw new Error(`Shift code ${code} already exists.`);
      const clean = { ...shift, shift_code: code, name: String(shift.name).trim(), is_active: shift.is_active !== false };
      if (!clean.id) {
        clean.id = uid('shift');
        db.shifts.push(clean);
      } else {
        const i = db.shifts.findIndex(s => s.id === clean.id);
        if (i === -1) throw new Error('Shift not found.');
        db.shifts[i] = clean;
      }
      this._write(db);
      return clean;
    }

    // --- Forms & photos ---
    async findFormBySha256(sha256) {
      if (!sha256) return null;
      return this._view().forms.find(f => f.file_sha256 === sha256) || null;
    }

    // --- Outbox: photos captured with no signal, read automatically once back online ---
    async addToOutbox({ file, sha256, imageBlob }) {
      const user = this.getCurrentUser();
      const item = { id: uid('outbox'), file_name: file.name, file_size: file.size, sha256, blob: imageBlob, user, queued_at: nowIso() };
      await imageDb.put(item.id, item, 'outbox');
      return item;
    }
    async getOutbox() {
      try { return (await imageDb.all('outbox')).sort((a, b) => String(a.queued_at).localeCompare(String(b.queued_at))); } catch (_) { return []; }
    }
    async removeFromOutbox(id) { return imageDb.remove(id, 'outbox'); }

    async getFormImageUrl(formId) {
      if (!formId) return null;
      const blob = await imageDb.get(formId);
      return blob ? URL.createObjectURL(blob) : null;
    }

    _nextNumber(list, prefix, field) {
      const year = new Date().getFullYear();
      const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
      const max = list.reduce((acc, x) => {
        const m = String(x[field] || '').match(re);
        return m ? Math.max(acc, Number(m[1])) : acc;
      }, 0);
      return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
    }

    /**
     * Persist the photo once and one draft record per entry the AI found on it
     * (a slip gives one entry; a register page gives one per filled row).
     * extraction: { provider, model, latency_ms, data: { entries: [contract], rows_detected, incomplete, image_issues } }
     * group: optional { id, label } (a batch). Multi-entry photos outside a batch get their own sheet group,
     * so the review queue can show "this sheet" and Next record walks through its rows.
     * @returns array of created records, in row order
     */
    async createRecordsFromExtraction({ file, sha256, imageBlob, extraction, batch, user: asUser }) {
      const user = asUser && PROFILES.some(p => p.id === asUser.id) ? asUser : this.getCurrentUser(); // outbox: the person who took the photo
      // Store the photo first. Everything after this line runs without an await, so the
      // read-modify-write of the database is atomic even when several batch photos finish together.
      const formId = uid('form');
      await imageDb.put(formId, imageBlob);
      const db = this._db();
      const sheet = extraction.data;
      const entries = sheet.entries || [];
      if (!entries.length) throw new Error('No entries to save.');

      const form = {
        id: formId,
        form_number: this._nextNumber(db.forms, 'PF', 'form_number'),
        original_filename: file.name,
        mime_type: imageBlob.type,
        original_size_bytes: file.size,
        stored_size_bytes: imageBlob.size,
        file_sha256: sha256,
        uploaded_by: user.id,
        uploaded_at: nowIso(),
        extraction_provider: extraction.provider,
        extraction_model: extraction.model,
        extraction_latency_ms: extraction.latency_ms,
        extraction_attempts: Array.isArray(extraction.attempts) ? extraction.attempts.slice(0, 8) : [],
        rows_detected: sheet.rows_detected,
        incomplete: Boolean(sheet.incomplete),
        extraction_payload: sheet,
        model_output: extraction.model_output || null
      };
      db.forms.push(form);

      const group = batch || (entries.length > 1 ? { id: `sheet-${formId}`, label: `Sheet ${form.form_number}` } : null);
      const created = entries.map((contract, i) => {
        const fields = contract.fields;
        const val = (k) => fields[k] ? fields[k].value : null;
        const machine = fields.machine.value ? db.machines.find(m => m.machine_code === fields.machine.value) : null;
        const shift = fields.shift.value ? db.shifts.find(s => s.shift_code === fields.shift.value) : null;
        const record = {
          id: uid('rec'),
          record_number: this._nextNumber(db.records, 'PR', 'record_number'),
          form_id: form.id,
          form_number: form.form_number,
          file_sha256: sha256,
          batch_id: group ? group.id : null,
          batch_label: group ? group.label : null,
          sheet_row: i + 1,
          sheet_rows: entries.length,
          sheet_rows_detected: sheet.rows_detected,
          sheet_incomplete: Boolean(sheet.incomplete),
          extraction_provider: extraction.provider,
          extraction_model: extraction.model,
          extraction_latency_ms: extraction.latency_ms,
          extraction_attempts: form.extraction_attempts,
          final_payload: contract,
          machine_id: machine ? machine.id : null,
          machine_raw: fields.machine.raw_value,
          shift_id: shift ? shift.id : null,
          shift_raw: fields.shift.raw_value,
          production_date: val('production_date'),
          production_date_raw: fields.production_date.raw_value,
          production_quantity: val('production_quantity'),
          production_unit: val('production_unit') || (machine && machine.default_unit) || 'metres',
          material_reference: val('material_reference'),
          batch_reference: val('batch_reference'),
          defects_count: val('defects_count'),
          defect_details: val('defect_details'),
          downtime_minutes: val('downtime_minutes'),
          downtime_reason: val('downtime_reason'),
          remarks: val('remarks'),
          status: 'pending_review',
          submitted_by: user.id,
          submitted_by_name: user.full_name,
          created_at: new Date(Date.now() + i).toISOString() // +i ms keeps sheet rows in order when sorting by time
        };
        db.records.push(record); // pushed before the next row so record numbers stay unique
        return record;
      });

      this._write(db);
      return created;
    }

    // --- Records ---
    _hydrate(r, db) {
      return {
        ...r,
        machine: db.machines.find(m => m.id === r.machine_id) || null,
        shift: db.shifts.find(s => s.id === r.shift_id) || null,
        corrections: db.corrections.filter(c => c.record_id === r.id)
      };
    }

    async getRecords(filters = {}) {
      const db = this._view();
      let rows = db.records.map(r => this._hydrate(r, db));
      if (filters.status && filters.status !== 'all') rows = rows.filter(r => r.status === filters.status);
      if (filters.submitted_by) rows = rows.filter(r => r.submitted_by === filters.submitted_by);
      if (filters.batch_id) rows = rows.filter(r => r.batch_id === filters.batch_id);
      if (filters.machine_id) rows = rows.filter(r => r.machine_id === filters.machine_id);
      if (filters.shift_id) rows = rows.filter(r => r.shift_id === filters.shift_id);
      if (filters.date) rows = rows.filter(r => r.production_date === filters.date);
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        rows = rows.filter(r => [r.record_number, r.machine && r.machine.machine_code, r.machine_raw, r.material_reference, r.batch_reference]
          .some(v => v && String(v).toLowerCase().includes(q)));
      }
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return rows;
    }

    async getRecordById(id) {
      const db = this._view();
      const r = db.records.find(x => x.id === id);
      if (!r) return null;
      const full = this._hydrate(r, db);
      full.form = db.forms.find(f => f.id === r.form_id) || null;
      return full;
    }

    /** Everything the business rules need, read once (pass it on when checking many records). */
    validationContext() {
      const db = this._view();
      return { machines: db.machines, shifts: db.shifts, reasons: db.downtime_reasons, records: db.records, today: Rules.todayIso(), _db: db };
    }

    async validationFor(record, ctx) {
      const c = ctx || this.validationContext();
      const full = record.corrections ? record : this._hydrate(record, c._db);
      return Rules.validateRecord(full, c);
    }

    _mutate(recordId, fn) {
      const db = this._db();
      const i = db.records.findIndex(r => r.id === recordId);
      if (i === -1) throw new Error('Record not found.');
      const result = fn(db.records[i], db);
      db.records[i].updated_at = nowIso();
      this._write(db);
      return result;
    }

    _coerce(recordKey, value) {
      const def = Rules.FIELD_DEFS.find(d => d.recordKey === recordKey);
      if (!def) throw new Error(`Unknown field ${recordKey}.`);
      if (value === '' || value === undefined) return null;
      if (['number', 'integer', 'duration'].includes(def.type)) {
        const n = Number(value);
        if (Number.isNaN(n)) throw new Error(`${def.label} must be a number.`);
        if (n < 0) throw new Error(`${def.label} cannot be negative.`);
        if (def.type === 'integer' && !Number.isInteger(n)) throw new Error(`${def.label} must be a whole number.`);
        return n;
      }
      return typeof value === 'string' ? value.trim() || null : value;
    }

    /**
     * Change a field. The audit entry also notes what had raised the alarm on it, if anything
     * ("caught_by": the AI's own flag, a business rule, or neither = only the reviewer noticed),
     * so the reliability page can show which safety net caught each AI mistake.
     */
    async correctField(recordId, recordKey, newValue, reason, { kind = 'correction' } = {}) {
      const record = await this.getRecordById(recordId);
      if (!record) throw new Error('Record not found.');
      if (!this.can('edit', record)) throw new Error('You cannot edit this record in its current status.');
      const value = this._coerce(recordKey, newValue);
      const user = this.getCurrentUser();
      const v = await this.validationFor(record);
      const aiFlag = Rules.unresolvedFlags(record).some(d => d.recordKey === recordKey);
      const ruleFlag = [...v.blockers, ...v.warnings].some(m => m.field === recordKey);
      return this._mutate(recordId, (r, db) => {
        const original = r[recordKey] === undefined ? null : r[recordKey];
        if (Rules.sameValue(original, value) && kind !== 'undo') return null;
        const entry = {
          id: uid('corr'), record_id: recordId, field_key: recordKey, kind,
          original_value: original, corrected_value: value,
          reason: (reason || '').trim() || (kind === 'undo' ? 'Undone' : 'Checked against the photo'),
          caught_by: aiFlag ? 'ai_flag' : ruleFlag ? 'rule' : 'reviewer',
          changed_by: user.id, changed_by_name: user.full_name, changed_by_role: user.role, changed_at: nowIso()
        };
        db.corrections.push(entry);
        r[recordKey] = value;
        return entry;
      });
    }

    /** Put a field back to the value it had before a correction (recorded as its own audit entry). */
    async undoCorrection(recordId, entryId) {
      const db = this._view();
      const entry = db.corrections.find(c => c.id === entryId && c.record_id === recordId);
      if (!entry || entry.kind !== 'correction') throw new Error('Nothing to undo.');
      const later = db.corrections.filter(c => c.record_id === recordId && c.field_key === entry.field_key);
      if (later[later.length - 1].id !== entryId) throw new Error('This field was changed again since; edit it directly instead.');
      return this.correctField(recordId, entry.field_key, entry.original_value === null ? '' : entry.original_value, 'Undone', { kind: 'undo' });
    }

    /**
     * Change the reason on your own latest change to a field, while the record is still open for edits.
     * (Explaining an edit right after making it; the change itself is never rewritten.)
     */
    async setCorrectionReason(recordId, entryId, reason) {
      const record = await this.getRecordById(recordId);
      if (!record || !this.can('edit', record)) throw new Error('This record can no longer be edited.');
      const user = this.getCurrentUser();
      const db = this._db();
      const entry = db.corrections.find(c => c.id === entryId && c.record_id === recordId);
      if (!entry || entry.changed_by !== user.id) throw new Error('You can only explain your own change.');
      const sameField = db.corrections.filter(c => c.record_id === recordId && c.field_key === entry.field_key);
      if (sameField[sameField.length - 1].id !== entryId) throw new Error('This field was changed again since.');
      entry.reason = String(reason || '').trim().slice(0, 300) || 'Checked against the photo';
      this._write(db);
      return entry;
    }

    async confirmField(recordId, recordKey, note, kind = 'confirmation') {
      const record = await this.getRecordById(recordId);
      if (!record) throw new Error('Record not found.');
      if (!this.can('review', record)) throw new Error('Only a supervisor or admin can confirm an AI-flagged value.');
      const user = this.getCurrentUser();
      return this._mutate(recordId, (r, db) => {
        const entry = {
          id: uid('corr'), record_id: recordId, field_key: recordKey, kind,
          original_value: r[recordKey] === undefined ? null : r[recordKey], corrected_value: r[recordKey] === undefined ? null : r[recordKey],
          reason: (note || '').trim() || 'Confirmed against the photo',
          changed_by: user.id, changed_by_name: user.full_name, changed_by_role: user.role, changed_at: nowIso()
        };
        db.corrections.push(entry);
        return entry;
      });
    }

    /** "I checked this against the photo" for a value a business rule found suspicious. */
    async checkField(recordId, recordKey) {
      return this.confirmField(recordId, recordKey, 'Checked against the photo after a rule warning', 'check');
    }

    async approveRecord(recordId, note) {
      const record = await this.getRecordById(recordId);
      if (!record) throw new Error('Record not found.');
      if (!this.can('review', record)) throw new Error('Only a supervisor or admin can approve a record that is pending review.');
      const { blockers } = await this.validationFor(record);
      if (blockers.length) throw new Error('Cannot approve yet:\n- ' + blockers.map(b => b.message).join('\n- '));
      const user = this.getCurrentUser();
      this._mutate(recordId, (r) => {
        r.status = 'approved';
        r.reviewed_by = user.id;
        r.reviewed_by_name = user.full_name;
        r.reviewed_at = nowIso();
        r.approval_note = (note || '').trim() || null;
        r.erp_status = 'pending';
      });
      return this.getRecordById(recordId);
    }

    async rejectRecord(recordId, reason) {
      const record = await this.getRecordById(recordId);
      if (!record || !this.can('review', record)) throw new Error('Only a supervisor or admin can reject a record that is pending review.');
      if (!reason || !reason.trim()) throw new Error('A rejection reason is required.');
      const user = this.getCurrentUser();
      this._mutate(recordId, (r) => {
        r.status = 'rejected';
        r.rejection_reason = reason.trim();
        r.reviewed_by = user.id;
        r.reviewed_by_name = user.full_name;
        r.reviewed_at = nowIso();
      });
    }

    async returnForCorrection(recordId, reason) {
      const record = await this.getRecordById(recordId);
      if (!record || !this.can('review', record)) throw new Error('Only a supervisor or admin can return a record that is pending review.');
      if (!reason || !reason.trim()) throw new Error('Tell the operator what to fix.');
      const user = this.getCurrentUser();
      this._mutate(recordId, (r) => {
        r.status = 'returned_for_correction';
        r.return_reason = reason.trim();
        r.returned_by_name = user.full_name;
        r.returned_at = nowIso();
      });
    }

    async resubmitRecord(recordId) {
      const record = await this.getRecordById(recordId);
      if (!record || !this.can('resubmit', record)) throw new Error('Only the submitting operator can resubmit a returned record.');
      this._mutate(recordId, (r) => { r.status = 'pending_review'; r.resubmitted_at = nowIso(); });
    }

    async buildErpPayload(recordId) {
      const record = await this.getRecordById(recordId);
      const db = this._view();
      return Rules.buildErpPayload(record, { machines: db.machines, shifts: db.shifts, reasons: db.downtime_reasons });
    }

    /** POST the approved record to the mock ERP. Safe to call repeatedly (idempotent by key). */
    async submitToErp(recordId, { simulateFailure = false } = {}) {
      const record = await this.getRecordById(recordId);
      if (!record) throw new Error('Record not found.');
      if (!this.can('dispatch_erp', record)) throw new Error('Only approved records can be sent to the ERP, by a supervisor or admin.');
      const payload = await this.buildErpPayload(recordId);
      let status = 0;
      let body = null;
      try {
        const resp = await fetch(`${window.APLYD_CONFIG.API_BASE}/api/erp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, simulate_failure: simulateFailure })
        });
        status = resp.status;
        body = await resp.json().catch(() => null);
      } catch (err) {
        body = { error: `ERP endpoint unreachable: ${err.message}` };
      }

      const ok = status === 200 && body && body.status === 'ACKNOWLEDGED';
      this._mutate(recordId, (r) => {
        r.erp_attempts = (r.erp_attempts || 0) + 1;
        r.erp_payload = payload;
        r.erp_response = body;
        r.erp_last_attempt_at = nowIso();
        if (ok) {
          r.erp_status = 'submitted';
          r.erp_reference = body.erp_reference;
          r.erp_last_error = null;
        } else {
          // A failed re-send never downgrades a record the ERP already acknowledged.
          if (r.erp_status !== 'submitted') r.erp_status = 'failed';
          r.erp_last_error = (body && (body.error || (body.errors && body.errors.join('; ')))) || `HTTP ${status}`;
        }
      });
      if (!ok) throw new Error(`ERP did not accept the record: ${(body && (body.error || (body.errors && body.errors.join('; ')))) || `HTTP ${status}`}`);
      return body;
    }

    // --- Metrics ---
    /**
     * Dashboard numbers. All "today / last 7 days" comparisons use the LOCAL calendar day.
     * Approved output counts by approval date (when the work was signed off), so approving
     * an older form shows up immediately; the production-date view lives in the register.
     */
    async getDashboardMetrics() {
      const records = await this.getRecords();
      const ctx = this.validationContext();
      const localDay = (iso) => (iso ? Rules.todayIso(new Date(iso)) : '');
      const today = Rules.todayIso();
      const weekAgo = Rules.todayIso(new Date(Date.now() - 6 * 864e5));
      const approved7d = records.filter(r => r.status === 'approved' && localDay(r.reviewed_at) >= weekAgo && localDay(r.reviewed_at) <= today);
      const pending = records.filter(r => r.status === 'pending_review');
      let exceptions = 0;
      for (const r of pending) {
        const v = await this.validationFor(r, ctx);
        exceptions += v.blockers.length + v.warnings.length;
      }
      const createdToday = records.filter(r => localDay(r.created_at) === today);
      const user = this.getCurrentUser();
      const weekAgoIso = new Date(Date.now() - 7 * 864e5).toISOString();
      const mineCorrected = records.filter(r => r.submitted_by === user.id &&
        (r.corrections || []).some(c => c.changed_by !== user.id && c.changed_at >= weekAgoIso && Rules.humanChanged(r, c.field_key)));
      return {
        approvedMetres7d: Math.round(approved7d.filter(r => (r.production_unit || 'metres') === 'metres').reduce((s, r) => s + (Number(r.production_quantity) || 0), 0) * 10) / 10,
        approvedCount7d: approved7d.length,
        photosToday: new Set(createdToday.map(r => r.form_id)).size,
        recordsToday: createdToday.length,
        pendingReviews: pending.length,
        returned: records.filter(r => r.status === 'returned_for_correction').length,
        openExceptions: exceptions,
        erpFailed: records.filter(r => r.status === 'approved' && r.erp_status !== 'submitted').length,
        recentRecords: records.slice(0, 6),
        mineCorrected,
        approved7d
      };
    }
  }

  window.aplydStore = new AplydStore();
})();
