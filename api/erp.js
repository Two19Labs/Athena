'use strict';

/**
 * Mock ERP endpoint.
 * POST /api/erp  Body: { payload: <aplyd.production_record/v1>, simulate_failure?: boolean }
 *   200 { status:'ACKNOWLEDGED', erp_reference, received_at }
 *   422 { status:'REJECTED', errors:[...] }       payload fails the ERP contract
 *   504 { status:'TIMEOUT', retryable:true }       when simulate_failure is set (to demo retry handling)
 *
 * Idempotency without a database: the reference is a hash of the idempotency
 * key, so re-sending the same record always returns the same reference.
 */

const { send, readJson } = require('./_lib/http');
const { validateErpPayload, erpReference } = require('../aplyd/js/rules.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { status: 'ERROR', error: 'Use POST.' });

  let body;
  try {
    body = await readJson(req, 256 * 1024);
  } catch (_) {
    return send(res, 400, { status: 'ERROR', error: 'Body must be JSON.' });
  }

  if (body && body.simulate_failure) {
    return send(res, 504, { status: 'TIMEOUT', retryable: true, error: 'Simulated ERP gateway timeout. Nothing was recorded; retry is safe.' });
  }

  const payload = body && body.payload;
  const errors = validateErpPayload(payload);
  if (errors.length) return send(res, 422, { status: 'REJECTED', errors });

  return send(res, 200, {
    status: 'ACKNOWLEDGED',
    erp_reference: erpReference(payload.idempotency_key, payload.approved_at),
    idempotency_key: payload.idempotency_key,
    received_at: new Date().toISOString()
  });
};
