import React, { useState, useEffect } from 'react';
import { Database, Download, CheckCircle, ExternalLink, X, FileSpreadsheet } from 'lucide-react';
import { getCommittedErpRecords, exportToSapCsv, ErpResponse } from '../services/erpService';

interface ErpTransactionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lastCommitted: ErpResponse | null;
}

export const ErpTransactionDrawer: React.FC<ErpTransactionDrawerProps> = ({
  isOpen,
  onClose,
  lastCommitted
}) => {
  const [records, setRecords] = useState<ErpResponse[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ErpResponse | null>(null);

  useEffect(() => {
    setRecords(getCommittedErpRecords());
  }, [isOpen, lastCommitted]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: '580px',
        maxWidth: '90vw',
        backgroundColor: 'var(--bg)',
        borderLeft: '1px solid var(--line)',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1100
      }}>
        
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--line)',
          backgroundColor: 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={20} color="var(--accent)" />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                Downstream ERP Integration Ledger
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
                Mock REST Endpoint: POST /api/v1/erp/production-logs
              </p>
            </div>
          </div>
          
          <button className="btn btn-outline" onClick={onClose} style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Action Toolbar */}
        <div style={{
          padding: '12px 20px',
          backgroundColor: 'var(--surface-hover)',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--ink)' }}>
            <strong>{records.length}</strong> Shift Production Orders Committed
          </span>
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            onClick={() => exportToSapCsv(records)}
          >
            <FileSpreadsheet size={14} /> Export SAP PP / Infor CSV
          </button>
        </div>

        {/* Records List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
              No production records dispatched yet. Approve a form to simulate live ERP ingestion.
            </div>
          ) : (
            records.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--line)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s'
                }}
                onClick={() => setSelectedRecord(r)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={15} color="var(--leaf)" />
                    <strong style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{r.erpDocNo}</strong>
                  </div>
                  <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                    {r.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
                  <div>Loom: <strong style={{ color: 'var(--ink)' }}>{r.summary.loomId}</strong></div>
                  <div>Shift: <strong style={{ color: 'var(--ink)' }}>{r.summary.shift}</strong></div>
                  <div>Picks: <strong style={{ color: 'var(--ink)' }}>{r.summary.netPicks.toLocaleString()}</strong></div>
                  <div>Meters: <strong style={{ color: 'var(--ink)' }}>{r.summary.netMeters}m</strong></div>
                </div>

                <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{r.idempotencyKey.slice(0, 24)}...</span>
                  <span>{new Date(r.committedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected Record Raw JSON Inspector */}
        {selectedRecord && (
          <div style={{
            padding: '14px 20px',
            backgroundColor: '#050b14',
            borderTop: '1px solid var(--line)',
            maxHeight: '240px',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)' }}>
                Payload Inspector ({selectedRecord.erpDocNo})
              </span>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                onClick={() => setSelectedRecord(null)}
              >
                Close
              </button>
            </div>
            <pre style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(selectedRecord.rawPayload, null, 2)}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
};
