import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Check, AlertTriangle, AlertOctagon, ZoomIn, ZoomOut, RotateCcw, 
  Send, ArrowRight, CheckCircle2, FileText, CornerDownLeft, Sparkles
} from 'lucide-react';
import { validateTextileRecord } from '../services/validationEngine';
import { dispatchToErp, logAuditTelemetry } from '../services/erpService';
import { LOOM_MASTER, SORT_MASTER, SHIFT_SCHEDULE } from '../data/masterData';

interface LoomReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: any;
  imageUri: string;
  onApproved: (erpResponse: any) => void;
}

export const LoomReviewModal: React.FC<LoomReviewModalProps> = ({
  isOpen,
  onClose,
  record: initialRecord,
  imageUri,
  onApproved
}) => {
  const [record, setRecord] = useState<any>(initialRecord);
  const [validation, setValidation] = useState<any>(null);
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime] = useState(Date.now());
  const flaggedRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  useEffect(() => {
    if (initialRecord) {
      setRecord(JSON.parse(JSON.stringify(initialRecord)));
      const val = validateTextileRecord(initialRecord);
      setValidation(val);
      setModifiedFields(new Set());
    }
  }, [initialRecord]);

  if (!isOpen || !record) return null;

  // Real-time re-validation whenever supervisor edits a value
  const handleFieldChange = (section: string, field: string, value: any) => {
    const updated = { ...record };
    if (section === 'header') {
      updated.header[field] = { ...updated.header[field], value, isFlagged: false };
    } else if (section === 'readings') {
      updated.readings[field] = { ...updated.readings[field], value, isFlagged: false };
      // Auto-recalculate net picks
      const s = Number(updated.readings.startPick?.value || 0);
      const e = Number(updated.readings.endPick?.value || 0);
      updated.readings.netPicks = {
        extracted: e - s,
        calculated: e - s,
        matches: true,
        confidence: 1.0
      };
    }

    setRecord(updated);
    setValidation(validateTextileRecord(updated));
    setModifiedFields(prev => new Set(prev).add(`${section}.${field}`));
  };

  // Downtime row edit
  const handleDowntimeChange = (index: number, key: string, value: any) => {
    const updated = { ...record };
    if (updated.downtime && updated.downtime[index]) {
      updated.downtime[index][key] = value;
      setRecord(updated);
      setValidation(validateTextileRecord(updated));
      setModifiedFields(prev => new Set(prev).add(`downtime.${index}.${key}`));
    }
  };

  // Keyboard shortcut: Jump to next Amber or Red field
  const jumpToNextFlagged = () => {
    const flaggedElements = Object.values(flaggedRefs.current).filter(Boolean);
    if (flaggedElements.length > 0) {
      const activeEl = document.activeElement;
      const currentIndex = flaggedElements.indexOf(activeEl as HTMLElement);
      const nextIndex = (currentIndex + 1) % flaggedElements.length;
      flaggedElements[nextIndex]?.focus();
    }
  };

  // Commit to Mock ERP
  const handleApprove = async () => {
    if (validation?.status === 'FAILED') {
      alert("Cannot approve record with critical errors. Please resolve red flags first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const reviewTimeMs = Date.now() - startTime;
      const res = await dispatchToErp(record);

      // Log continuous learning telemetry
      logAuditTelemetry({
        formId: record.metadata?.formId || 'form-unknown',
        initialPayload: initialRecord,
        finalPayload: record,
        modifiedFields: Array.from(modifiedFields),
        reviewTimeMs
      });

      setIsSubmitting(false);
      onApproved(res);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      alert("ERP Dispatch Failed: " + err.message);
    }
  };

  const getStatusBorder = (confidence: number, hasError: boolean, isMandatoryMissing: boolean) => {
    if (isMandatoryMissing || hasError) return 'status-red';
    if (confidence < 0.85) return 'status-amber';
    return 'status-green';
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container">
        
        {/* Header Bar */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              backgroundColor: 'var(--accent-soft)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FileText size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)' }}>
                Shop-Floor Review Console — Weaving Shift Log
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                Form ID: {record.metadata?.formId || 'TX-2026-F14'}  •  Model: {record.metadata?.modelUsed || 'Qwen-2.5-VL-72B'}  •  Confidence: {Math.round((record.metadata?.overallConfidence || 0.9) * 100)}%
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {validation?.errors.length > 0 && (
              <button className="btn btn-secondary" onClick={jumpToNextFlagged} style={{ fontSize: '0.8rem' }}>
                <CornerDownLeft size={14} /> Jump to Flagged Field ({validation.errors.length})
              </button>
            )}
            <button className="btn btn-outline" onClick={onClose} style={{ padding: '8px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Split Screen Content */}
        <div className="split-screen">
          
          {/* Left Pane: Interactive Pan/Zoom Image Viewer */}
          <div className="image-panel">
            <div style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 10
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)', fontWeight: 600 }}>
                Source Clipboard Image
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 8px', height: '28px' }}
                  onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.25))}
                >
                  <ZoomIn size={14} />
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 8px', height: '28px' }}
                  onClick={() => setZoomLevel(prev => Math.max(0.75, prev - 0.25))}
                >
                  <ZoomOut size={14} />
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 8px', height: '28px' }}
                  onClick={() => setZoomLevel(1)}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>

            <div style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}>
              <img
                src={imageUri}
                alt="Source Form"
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out',
                  maxWidth: '100%',
                  borderRadius: '4px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                }}
              />
            </div>
          </div>

          {/* Right Pane: Structured Form Review */}
          <div className="form-panel">
            
            {/* Real-Time Anomaly / Warning Banners */}
            {validation?.errors.map((err: any, idx: number) => (
              <div
                key={idx}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: err.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  borderLeft: `4px solid ${err.severity === 'CRITICAL' ? 'var(--danger)' : 'var(--amber)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {err.severity === 'CRITICAL' ? (
                    <AlertOctagon size={18} color="var(--danger)" />
                  ) : (
                    <AlertTriangle size={18} color="var(--amber)" />
                  )}
                  <div>
                    <strong style={{ fontSize: '0.82rem', color: err.severity === 'CRITICAL' ? 'var(--danger)' : 'var(--amber)' }}>
                      [{err.ruleCode}]
                    </strong>
                    <span style={{ fontSize: '0.82rem', color: 'var(--ink)', marginLeft: '6px' }}>
                      {err.message}
                    </span>
                  </div>
                </div>

                {err.suggestedValue && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '3px 8px', height: '26px' }}
                    onClick={() => handleFieldChange('header', 'loomId', err.suggestedValue)}
                  >
                    Accept "{err.suggestedValue}"
                  </button>
                )}
              </div>
            ))}

            {/* Section 1: Header Metadata */}
            <div className={`field-group ${getStatusBorder(record.header?.loomId?.confidence, false, !record.header?.loomId?.value)}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-secondary)', textTransform: 'uppercase' }}>
                  Header & Machine Identification
                </span>
                <span className={`badge ${record.header?.loomId?.confidence >= 0.85 ? 'badge-green' : 'badge-amber'}`}>
                  Confidence: {Math.round((record.header?.loomId?.confidence || 0.9) * 100)}%
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Loom ID *
                  </label>
                  <input
                    ref={el => flaggedRefs.current['loomId'] = el}
                    type="text"
                    value={record.header?.loomId?.value || ''}
                    onChange={(e) => handleFieldChange('header', 'loomId', e.target.value)}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)',
                      fontWeight: 600, fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Shift *
                  </label>
                  <select
                    value={record.header?.shift?.value || ''}
                    onChange={(e) => handleFieldChange('header', 'shift', e.target.value)}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)',
                      fontWeight: 600
                    }}
                  >
                    <option value="">Select Shift...</option>
                    <option value="A">Shift A (Morning)</option>
                    <option value="B">Shift B (Evening)</option>
                    <option value="C">Shift C (Night)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    value={record.header?.date?.value || ''}
                    onChange={(e) => handleFieldChange('header', 'date', e.target.value)}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Operator Token
                  </label>
                  <input
                    type="text"
                    value={record.header?.operatorId?.value || ''}
                    onChange={(e) => handleFieldChange('header', 'operatorId', e.target.value)}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Fabric Sort Code
                  </label>
                  <input
                    type="text"
                    value={record.header?.sortCode?.value || ''}
                    onChange={(e) => handleFieldChange('header', 'sortCode', e.target.value)}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Beam No
                  </label>
                  <input
                    type="text"
                    value={record.header?.beamNumber?.value || ''}
                    onChange={(e) => handleFieldChange('header', 'beamNumber', e.target.value)}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Odometer Readings & Calculations */}
            <div className={`field-group ${validation?.calculated.netPicks < 0 ? 'status-red' : 'status-green'}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-secondary)', textTransform: 'uppercase' }}>
                  Odometer Pick Readings & Production
                </span>
                <span className="badge badge-green">
                  Auto-Reconciled
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Start Pick
                  </label>
                  <input
                    type="number"
                    value={record.readings?.startPick?.value || 0}
                    onChange={(e) => handleFieldChange('readings', 'startPick', Number(e.target.value))}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    End Pick *
                  </label>
                  <input
                    ref={el => flaggedRefs.current['endPick'] = el}
                    type="number"
                    value={record.readings?.endPick?.value || 0}
                    onChange={(e) => handleFieldChange('readings', 'endPick', Number(e.target.value))}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)',
                      fontFamily: 'var(--font-mono)', fontWeight: 700
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Net Picks (Calculated)
                  </label>
                  <div style={{
                    padding: '8px', borderRadius: '4px', background: 'var(--surface-hover)',
                    color: validation?.calculated.netPicks < 0 ? 'var(--danger)' : 'var(--leaf)',
                    fontWeight: 700, fontFamily: 'var(--font-mono)'
                  }}>
                    {validation?.calculated.netPicks.toLocaleString()} picks
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Net Production (Meters)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={record.readings?.netMeters?.value || 0}
                    onChange={(e) => handleFieldChange('readings', 'netMeters', Number(e.target.value))}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Loom RPM
                  </label>
                  <input
                    type="number"
                    value={record.readings?.loomRpm?.value || 800}
                    onChange={(e) => handleFieldChange('readings', 'loomRpm', Number(e.target.value))}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Efficiency (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={record.readings?.efficiencyPct?.value || 0}
                    onChange={(e) => handleFieldChange('readings', 'efficiencyPct', Number(e.target.value))}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '4px',
                      background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Downtime & Shift Time Balance */}
            <div className={`field-group ${validation?.calculated.totalDowntimeMins > 480 ? 'status-red' : 'status-green'}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-secondary)', textTransform: 'uppercase' }}>
                    Downtime Log & Time Balance
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: '10px' }}>
                    Run: {validation?.calculated.totalRunTimeMins}m + Stoppage: {validation?.calculated.totalDowntimeMins}m = 480m Shift
                  </span>
                </div>
              </div>

              {record.downtime?.map((dt: any, idx: number) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 100px 1fr', gap: '10px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={dt.reasonCode || ''}
                    onChange={(e) => handleDowntimeChange(idx, 'reasonCode', e.target.value)}
                    style={{
                      padding: '6px', borderRadius: '4px', background: 'var(--bg)',
                      border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '0.8rem'
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      value={dt.durationMinutes || 0}
                      onChange={(e) => handleDowntimeChange(idx, 'durationMinutes', Number(e.target.value))}
                      style={{
                        width: '70px', padding: '6px', borderRadius: '4px', background: 'var(--bg)',
                        border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '0.8rem',
                        fontWeight: 700
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>m</span>
                  </div>
                  <input
                    type="text"
                    value={dt.remarks || ''}
                    onChange={(e) => handleDowntimeChange(idx, 'remarks', e.target.value)}
                    style={{
                      padding: '6px', borderRadius: '4px', background: 'var(--bg)',
                      border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '0.8rem'
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{
              marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {modifiedFields.size > 0 ? (
                  <span style={{ color: 'var(--amber)' }}>
                    • {modifiedFields.size} field(s) modified by supervisor
                  </span>
                ) : (
                  <span style={{ color: 'var(--leaf)' }}>
                    • Zero corrections needed (100% First-Pass Clean)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleApprove}
                  disabled={isSubmitting || validation?.status === 'FAILED'}
                  style={{ minWidth: '180px' }}
                >
                  {isSubmitting ? (
                    'Committing to ERP...'
                  ) : (
                    <>
                      <Check size={16} /> Approve & Commit to ERP
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
