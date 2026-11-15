import React, { useState } from 'react';
import { 
  LOOM_MASTER, SORT_MASTER, DOWNTIME_CODES, DEFECT_TYPES, FACTORY_METADATA, SHIFT_SCHEDULE 
} from '../data/masterData.ts';
import { 
  Cpu, Layers, AlertCircle, Wrench, Clock, Search, CheckCircle2, Shield, Info
} from 'lucide-react';

export const MasterDataView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'looms' | 'sorts' | 'downtime' | 'defects' | 'shifts'>('looms');
  const [searchQuery, setSearchQuery] = useState('');

  const filterItem = (text: string) => {
    if (!searchQuery) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Banner & Search */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={20} color="var(--accent)" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)' }}>
                Plant Master Data & Deterministic Grounding Tables
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', marginTop: '4px' }}>
              Master catalogs used by the Vision AI for prompt grounding, Levenshtein fuzzy matching, and physics validation bounds.
            </p>
          </div>

          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={16} color="var(--muted)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Search master data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px', height: '36px', fontSize: '0.82rem' }}
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          borderBottom: '1px solid var(--line)', 
          marginTop: '20px',
          paddingBottom: '8px',
          overflowX: 'auto'
        }}>
          <button
            onClick={() => setActiveTab('looms')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'looms' ? 'var(--accent-soft)' : 'transparent',
              color: activeTab === 'looms' ? 'var(--accent)' : 'var(--ink-secondary)'
            }}
          >
            <Cpu size={16} /> Registered Looms ({LOOM_MASTER.length})
          </button>

          <button
            onClick={() => setActiveTab('sorts')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'sorts' ? 'var(--accent-soft)' : 'transparent',
              color: activeTab === 'sorts' ? 'var(--accent)' : 'var(--ink-secondary)'
            }}
          >
            <Layers size={16} /> Fabric Sorts ({SORT_MASTER.length})
          </button>

          <button
            onClick={() => setActiveTab('downtime')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'downtime' ? 'var(--accent-soft)' : 'transparent',
              color: activeTab === 'downtime' ? 'var(--accent)' : 'var(--ink-secondary)'
            }}
          >
            <Clock size={16} /> Downtime Codes ({DOWNTIME_CODES.length})
          </button>

          <button
            onClick={() => setActiveTab('defects')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'defects' ? 'var(--accent-soft)' : 'transparent',
              color: activeTab === 'defects' ? 'var(--accent)' : 'var(--ink-secondary)'
            }}
          >
            <AlertCircle size={16} /> Defect Taxonomy ({DEFECT_TYPES.length})
          </button>

          <button
            onClick={() => setActiveTab('shifts')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeTab === 'shifts' ? 'var(--accent-soft)' : 'transparent',
              color: activeTab === 'shifts' ? 'var(--accent)' : 'var(--ink-secondary)'
            }}
          >
            <Wrench size={16} /> Mill & Shift Config
          </button>
        </div>
      </div>

      {/* Looms Tab */}
      {activeTab === 'looms' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-header)', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>LOOM ID</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>SHED</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>WEAVING TYPE</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>MODEL & MAKE</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.78rem' }}>RATED TARGET RPM</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.78rem' }}>REED WIDTH</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.78rem' }}>VALIDATION BOUND</th>
                </tr>
              </thead>
              <tbody>
                {LOOM_MASTER.filter(l => filterItem(`${l.id} ${l.shed} ${l.type} ${l.model}`)).map((loom) => (
                  <tr key={loom.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                      {loom.id}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge badge-blue">{loom.shed}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink)', fontWeight: 600 }}>
                      {loom.type}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-secondary)' }}>
                      {loom.model}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {loom.targetRpm} RPM
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--ink-secondary)' }}>
                      {loom.widthCm} cm
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>
                        RPM &plusmn; 15%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fabric Sorts Tab */}
      {activeTab === 'sorts' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-header)', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>SORT CODE</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>FABRIC DESCRIPTION</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>WARP / WEFT COUNT</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.78rem' }}>EPI</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.78rem' }}>PPI (PICKS/INCH)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.78rem' }}>WIDTH</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.78rem' }}>TARGET EFFICIENCY</th>
                </tr>
              </thead>
              <tbody>
                {SORT_MASTER.filter(s => filterItem(`${s.code} ${s.description} ${s.warpCount}`)).map((sort) => (
                  <tr key={sort.code} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--leaf)' }}>
                      {sort.code}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>
                      {sort.description}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-secondary)', fontSize: '0.82rem' }}>
                      {sort.warpCount} &times; {sort.weftCount}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {sort.epi}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                      {sort.ppi}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--ink-secondary)' }}>
                      {sort.standardWidthInch}"
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--leaf)' }}>
                      {sort.targetEfficiencyPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Downtime Codes Tab */}
      {activeTab === 'downtime' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-header)', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>DOWNTIME CODE</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>CATEGORY</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>STOPPAGE DESCRIPTION</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.78rem' }}>ALLOWED TOLERANCE</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.78rem' }}>SUPERVISOR ESCALATION</th>
                </tr>
              </thead>
              <tbody>
                {DOWNTIME_CODES.filter(d => filterItem(`${d.code} ${d.category} ${d.label}`)).map((dt) => (
                  <tr key={dt.code} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
                      {dt.code}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge badge-blue">{dt.category}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink)', fontWeight: 600 }}>
                      {dt.label}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {dt.allowedToleranceMins} mins
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span className={`badge ${dt.allowedToleranceMins > 60 ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '0.72rem' }}>
                        {dt.allowedToleranceMins > 60 ? '> 60m Requires Signoff' : 'Standard Shift Normal'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Defect Taxonomy Tab */}
      {activeTab === 'defects' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-header)', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>DEFECT IDENTIFIER</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>DEFECT CLASSIFICATION</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.78rem' }}>SEVERITY LEVEL</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem' }}>QUALITY IMPACT</th>
                </tr>
              </thead>
              <tbody>
                {DEFECT_TYPES.filter(d => filterItem(`${d.id} ${d.label} ${d.severity}`)).map((defect) => (
                  <tr key={defect.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
                      {defect.id}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink)', fontWeight: 600 }}>
                      {defect.label}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span className={`badge ${defect.severity === 'major' ? 'badge-red' : 'badge-amber'}`}>
                        {defect.severity.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-secondary)', fontSize: '0.82rem' }}>
                      {defect.severity === 'major' 
                        ? 'Degrades roll grading from Grade A to B/C; cut point logged in ERP' 
                        : 'Minor stoppage; operator knot/re-pick acceptable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shifts & Mill Config Tab */}
      {activeTab === 'shifts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '14px' }}>
              Mill Facility Metadata
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--muted)' }}>Mill Legal Entity:</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{FACTORY_METADATA.millName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--muted)' }}>Division:</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{FACTORY_METADATA.division}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--muted)' }}>Total Weaving Sheds:</span>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{FACTORY_METADATA.sheds.length} Active Sheds</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Total Loom Capacity:</span>
                <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  {FACTORY_METADATA.sheds.reduce((s, sh) => s + sh.loomCount, 0)} Industrial Looms
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '14px' }}>
              Standard Shift Schedule (8-Hour Conservation)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {SHIFT_SCHEDULE.map((shift) => (
                <div key={shift.code} style={{ 
                  padding: '12px', 
                  borderRadius: 'var(--radius-sm)', 
                  backgroundColor: 'var(--surface-header)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <span className="badge badge-blue">Shift {shift.code}</span>
                    <span style={{ marginLeft: '10px', fontWeight: 600, fontSize: '0.85rem' }}>{shift.name}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                    <div>{shift.start} – {shift.end}</div>
                    <div style={{ color: 'var(--leaf)', fontWeight: 600 }}>{shift.hours * 60} mins duration</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
