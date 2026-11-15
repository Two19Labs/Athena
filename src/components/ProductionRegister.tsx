import React, { useState } from 'react';
import { 
  PlusCircle, FileSpreadsheet, Search, Filter, CheckCircle2, 
  AlertTriangle, Clock, Activity, Layers, ArrowUpRight, Eye, Calendar, Sparkles
} from 'lucide-react';
import { exportToSapCsv } from '../services/erpService.ts';

interface ProductionRegisterProps {
  records: any[];
  onOpenScan: () => void;
  onSelectRecord: (record: any) => void;
}

export const ProductionRegister: React.FC<ProductionRegisterProps> = ({
  records,
  onOpenScan,
  onSelectRecord
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShift, setSelectedShift] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Compute live KPI metrics across all committed ERP records
  const totalMeters = records.reduce((sum, r) => sum + Number(r.rawPayload?.readings?.netMeters?.value || 0), 0);
  const totalPicks = records.reduce((sum, r) => sum + Number(r.rawPayload?.readings?.netPicks?.calculated || 0), 0);
  const avgEfficiency = records.length > 0 
    ? (records.reduce((sum, r) => sum + Number(r.rawPayload?.readings?.efficiencyPct?.value || 0), 0) / records.length).toFixed(1)
    : '0.0';
  const totalDowntimeMinutes = records.reduce((sum, r) => {
    const dts = r.rawPayload?.downtime || [];
    return sum + dts.reduce((s: number, d: any) => s + Number(d.durationMinutes || 0), 0);
  }, 0);

  // Filter records
  const filteredRecords = records.filter(r => {
    const p = r.rawPayload;
    const loom = p?.header?.loomId?.value || '';
    const operator = p?.header?.operatorName?.value || p?.header?.operatorId?.value || '';
    const sort = p?.header?.sortCode?.value || '';
    const docNo = r.erpDocNo || '';
    const matchesSearch = 
      loom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      operator.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sort.toLowerCase().includes(searchTerm.toLowerCase()) ||
      docNo.toLowerCase().includes(searchTerm.toLowerCase());

    const shift = p?.header?.shift?.value || '';
    const matchesShift = selectedShift === 'ALL' || shift === selectedShift;

    const status = r.supervisorStatus || 'auto_approved';
    const matchesStatus = statusFilter === 'ALL' || status === statusFilter;

    return matchesSearch && matchesShift && matchesStatus;
  });

  return (
    <div>
      
      {/* Top ERP KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-secondary)', fontSize: '0.8rem' }}>
            <span>Today's Total Production</span>
            <Layers size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {totalMeters.toFixed(1)} <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--muted)' }}>meters</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--leaf)', marginTop: '4px', fontWeight: 600 }}>
            {totalPicks.toLocaleString()} cumulative picks
          </div>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-secondary)', fontSize: '0.8rem' }}>
            <span>Active Shift Orders</span>
            <CheckCircle2 size={18} color="var(--leaf)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {records.length} <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--muted)' }}>committed</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '4px' }}>
            Shift A (Morning) currently active
          </div>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-secondary)', fontSize: '0.8rem' }}>
            <span>Average Mill Efficiency</span>
            <Activity size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {avgEfficiency}%
          </div>
          <div style={{ fontSize: '0.75rem', color: Number(avgEfficiency) >= 85 ? 'var(--leaf)' : 'var(--amber)', marginTop: '4px', fontWeight: 600 }}>
            {Number(avgEfficiency) >= 85 ? 'Optimal Weaving Target Met' : 'Below Target (88%)'}
          </div>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-secondary)', fontSize: '0.8rem' }}>
            <span>Shift Downtime Stoppages</span>
            <Clock size={18} color="var(--amber)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {(totalDowntimeMinutes / 60).toFixed(1)} <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--muted)' }}>hrs</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '4px' }}>
            Across {records.length} reported looms
          </div>
        </div>

      </div>

      {/* Main ERP Ledger Card */}
      <div className="card">
        
        {/* Action & Filter Toolbar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--line)'
        }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={16} color="var(--muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input
              type="text"
              placeholder="Search Loom, Operator, Sort..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                backgroundColor: 'var(--bg)',
                color: 'var(--ink)',
                fontSize: '0.85rem'
              }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--muted)', marginRight: '4px' }}>
              <Filter size={14} /> Shift:
            </div>
            {['ALL', 'A', 'B', 'C'].map((shift) => (
              <button
                key={shift}
                onClick={() => setSelectedShift(shift)}
                className={`btn ${selectedShift === shift ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '0.78rem', height: '30px' }}
              >
                {shift === 'ALL' ? 'All Shifts' : `Shift ${shift}`}
              </button>
            ))}
          </div>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => exportToSapCsv(records)}
              style={{ fontSize: '0.82rem' }}
            >
              <FileSpreadsheet size={15} /> Export SAP CSV
            </button>
            <button
              className="btn btn-primary"
              onClick={onOpenScan}
              style={{ fontSize: '0.82rem', backgroundColor: 'var(--accent)' }}
            >
              <PlusCircle size={16} /> Scan &amp; Ingest New Form
            </button>
          </div>

        </div>

        {/* The Live Production Table */}
        <div style={{ overflowX: 'auto', marginTop: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ color: 'var(--ink-secondary)', borderBottom: '1px solid var(--line)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 8px' }}>ERP Doc #</th>
                <th style={{ padding: '12px 8px' }}>Loom &amp; Shed</th>
                <th style={{ padding: '12px 8px' }}>Date / Shift</th>
                <th style={{ padding: '12px 8px' }}>Operator</th>
                <th style={{ padding: '12px 8px' }}>Fabric Sort</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Net Picks</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Meters</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Eff. %</th>
                <th style={{ padding: '12px 8px', textAlign: 'center' }}>ERP Status</th>
                <th style={{ padding: '12px 8px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    No production logs match your filters. Click <strong>Scan &amp; Ingest New Form</strong> to digitize a paper slip.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, i) => {
                  const p = r.rawPayload;
                  const loom = p?.header?.loomId?.value || 'N/A';
                  const shift = p?.header?.shift?.value || 'A';
                  const date = p?.header?.date?.value || 'N/A';
                  const operator = p?.header?.operatorName?.value || p?.header?.operatorId?.value || 'N/A';
                  const sort = p?.header?.sortCode?.value || 'N/A';
                  const netPicks = p?.readings?.netPicks?.calculated || 0;
                  const netMeters = Number(p?.readings?.netMeters?.value || 0);
                  const eff = Number(p?.readings?.efficiencyPct?.value || 0);
                  const status = r.supervisorStatus || 'auto_approved';

                  return (
                    <tr
                      key={i}
                      style={{
                        borderBottom: '1px solid var(--line)',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.3)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                        {r.erpDocNo}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: 'var(--ink)' }}>{loom}</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>
                          {p?.header?.loomType?.value || 'Airjet'} Shed
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--ink-secondary)' }}>
                        <div>{date}</div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink)' }}>
                          Shift {shift}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--ink)' }}>
                        {operator}
                      </td>
                      <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
                        {sort}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
                        {netPicks.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--leaf)', fontFamily: 'var(--font-mono)' }}>
                        {netMeters.toFixed(1)} m
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: eff >= 85 ? 'var(--leaf)' : 'var(--amber)', fontWeight: 600 }}>
                          {eff}%
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <span className={`badge ${status === 'auto_approved' ? 'badge-green' : status === 'manually_corrected' ? 'badge-amber' : 'badge-red'}`}>
                          {status === 'auto_approved' ? 'Approved' : status === 'manually_corrected' ? 'Verified' : 'Rejected'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', height: '26px' }}
                          onClick={() => onSelectRecord(r)}
                        >
                          <Eye size={13} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Ledger Footer Status */}
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--muted)' }}>
          <div>
            Showing <strong>{filteredRecords.length}</strong> of <strong>{records.length}</strong> production shift records
          </div>
          <div>
            Enterprise Status: <span style={{ color: 'var(--leaf)', fontWeight: 600 }}>Connected to SAP Production Planning (PP-PI)</span>
          </div>
        </div>

      </div>

    </div>
  );
};
