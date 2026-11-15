import React, { useState } from 'react';
import { 
  Factory, Database, FileSpreadsheet, Sparkles, CheckCircle2, 
  Layers, Activity, Camera, Cpu, Table, ShieldCheck
} from 'lucide-react';
import { ProductionRegister } from './components/ProductionRegister.tsx';
import { ScanIngestView } from './components/ScanIngestView.tsx';
import { MasterDataView } from './components/MasterDataView.tsx';
import { TelemetryDashboard } from './components/TelemetryDashboard.tsx';
import { LoomReviewModal } from './components/LoomReviewModal.tsx';
import { ErpTransactionDrawer } from './components/ErpTransactionDrawer.tsx';
import { INITIAL_ERP_RECORDS } from './data/seedErpData.ts';
import { getCommittedErpRecords } from './services/erpService.ts';
import { generateSyntheticForm } from './generator/formCanvasGenerator.ts';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'register' | 'scan' | 'master' | 'telemetry'>('register');
  const [erpRecords, setErpRecords] = useState<any[]>(() => {
    const existing = getCommittedErpRecords();
    if (existing && existing.length > 0) {
      // Merge seeded records that aren't already in ledger
      const existingKeys = new Set(existing.map((e: any) => e.erpDocNo));
      const combined = [...existing];
      for (const seed of INITIAL_ERP_RECORDS) {
        if (!existingKeys.has(seed.erpDocNo)) {
          combined.push(seed);
        }
      }
      return combined;
    }
    return INITIAL_ERP_RECORDS;
  });

  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [activeImageUri, setActiveImageUri] = useState<string>('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isErpDrawerOpen, setIsErpDrawerOpen] = useState(false);
  const [lastCommitted, setLastCommitted] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Called when user selects or captures a slip in ScanIngestView
  const handleProcessFromIngest = (imageUri: string, record: any) => {
    setActiveImageUri(imageUri);
    setSelectedRecord(record);
    setIsReviewModalOpen(true);
  };

  // Called when a record is approved from the HITL Review Modal
  const handleApproved = (erpResponse: any) => {
    setLastCommitted(erpResponse);
    
    // Create new record object for the production register
    const newRecord = {
      erpDocNo: erpResponse.erpDocNo,
      idempotencyKey: erpResponse.idempotencyKey,
      committedAt: erpResponse.committedAt,
      status: erpResponse.status || 'COMMITTED',
      supervisorStatus: 'auto_approved',
      rawPayload: erpResponse.rawPayload
    };

    // Prepend to the ERP register state so it appears immediately at the top
    setErpRecords(prev => [newRecord, ...prev]);

    // Switch view back to Production Register so user immediately sees the updated ledger
    setActiveTab('register');

    showToast(`✅ Production Slip committed to ERP: ${erpResponse.erpDocNo}`);
  };

  // Called when user clicks "View" on an ERP row
  const handleSelectRecordFromRegister = (record: any) => {
    setSelectedRecord(record.rawPayload);
    // Generate corresponding synthetic slip for visual side-by-side inspection
    const imageUri = generateSyntheticForm('clean');
    setActiveImageUri(imageUri);
    setIsReviewModalOpen(true);
  };

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '20px 24px 60px' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--leaf)',
          color: '#ffffff',
          padding: '14px 22px',
          borderRadius: 'var(--radius-sm)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          fontWeight: 700,
          fontSize: '0.9rem',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <CheckCircle2 size={20} /> {toastMessage}
        </div>
      )}

      {/* Top Header Bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '20px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--line)',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: 'var(--accent-soft)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Factory size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                Athena LoomVision ERP
              </h1>
              <span className="badge badge-blue">APLYD Assessment</span>
              <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--leaf)' }} />
                Shift A Active
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', marginTop: '2px' }}>
              Vision-First Shop Floor Digitisation for Textile Manufacturing &bull; Weaving Sheds A &amp; B
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setIsErpDrawerOpen(true)}
            style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Database size={15} color="var(--accent)" />
            Raw ERP Ledger ({erpRecords.length})
          </button>
        </div>
      </header>

      {/* Primary ERP Navigation Tabs */}
      <nav style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--line)',
        marginBottom: '24px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        <button
          onClick={() => setActiveTab('register')}
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: activeTab === 'register' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'register' ? '#ffffff' : 'var(--ink-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <Table size={16} /> Production Register ({erpRecords.length})
        </button>

        <button
          onClick={() => setActiveTab('scan')}
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: activeTab === 'scan' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'scan' ? '#ffffff' : 'var(--ink-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <Camera size={16} /> Scan &amp; Ingest Slip
          <span style={{ 
            fontSize: '0.68rem', 
            padding: '2px 6px', 
            borderRadius: '10px', 
            backgroundColor: activeTab === 'scan' ? 'rgba(255,255,255,0.25)' : 'var(--leaf)', 
            color: '#fff' 
          }}>
            New
          </span>
        </button>

        <button
          onClick={() => setActiveTab('master')}
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: activeTab === 'master' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'master' ? '#ffffff' : 'var(--ink-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <Cpu size={16} /> Master Data &amp; Rules
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          style={{
            padding: '10px 18px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: activeTab === 'telemetry' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'telemetry' ? '#ffffff' : 'var(--ink-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <Activity size={16} /> Telemetry &amp; Learning
        </button>
      </nav>

      {/* Main Tab Content Views */}
      <main>
        {activeTab === 'register' && (
          <ProductionRegister
            records={erpRecords}
            onOpenScan={() => setActiveTab('scan')}
            onSelectRecord={handleSelectRecordFromRegister}
          />
        )}

        {activeTab === 'scan' && (
          <ScanIngestView
            onProcessRecord={handleProcessFromIngest}
            isLoading={false}
          />
        )}

        {activeTab === 'master' && (
          <MasterDataView />
        )}

        {activeTab === 'telemetry' && (
          <TelemetryDashboard />
        )}
      </main>

      {/* Split-Screen HITL Review Modal */}
      <LoomReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        record={selectedRecord}
        imageUri={activeImageUri}
        onApproved={handleApproved}
      />

      {/* Downstream Mock ERP Inspector Drawer */}
      <ErpTransactionDrawer
        isOpen={isErpDrawerOpen}
        onClose={() => setIsErpDrawerOpen(false)}
        lastCommitted={lastCommitted}
      />

    </div>
  );
};
