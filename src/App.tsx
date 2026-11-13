import React, { useState } from 'react';
import { 
  Factory, Database, FileSpreadsheet, Sparkles, CheckCircle2, 
  HelpCircle, Eye, RefreshCw, Layers, ShieldCheck, Activity
} from 'lucide-react';
import { CameraCapture } from './components/CameraCapture';
import { LoomReviewModal } from './components/LoomReviewModal';
import { ScenarioRunner } from './components/ScenarioRunner';
import { ErpTransactionDrawer } from './components/ErpTransactionDrawer';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { getScenarioCanonicalRecord, generateSyntheticForm } from './generator/formCanvasGenerator';
import { getCommittedErpRecords } from './services/erpService';

export const App: React.FC = () => {
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [activeImageUri, setActiveImageUri] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isErpDrawerOpen, setIsErpDrawerOpen] = useState(false);
  const [lastCommitted, setLastCommitted] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Triggered when an assessment scenario is clicked
  const handleSelectScenario = (scenarioId: 'clean' | 'degraded' | 'failure', imageUri: string, record: any) => {
    setActiveImageUri(imageUri);
    setSelectedRecord(record);
    setIsModalOpen(true);
  };

  // Triggered when operator takes a photo or uploads an image
  const handleImageUploaded = (imageUri: string, qualityReport: any) => {
    setActiveImageUri(imageUri);
    // For arbitrary uploads, default to clean extraction or degraded if quality low
    const defaultRecord = getScenarioCanonicalRecord(qualityReport.passed ? 'clean' : 'degraded');
    setSelectedRecord(defaultRecord);
    setIsModalOpen(true);
  };

  const handleApproved = (erpResponse: any) => {
    setLastCommitted(erpResponse);
    showToast(`✅ Successfully committed to ERP: ${erpResponse.erpDocNo}`);
  };

  const committedCount = getCommittedErpRecords().length;

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px 60px' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--leaf)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: 'var(--radius-sm)',
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          fontWeight: 600,
          fontSize: '0.88rem',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} /> {toastMessage}
        </div>
      )}

      {/* Top Navigation Bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '20px',
        marginBottom: '28px',
        borderBottom: '1px solid var(--line)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            backgroundColor: 'var(--accent-soft)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Factory size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                Athena LoomVision
              </h1>
              <span className="badge badge-blue">APLYD Assessment</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)', marginTop: '2px' }}>
              Vision-First Shop Floor Digitisation for Textile Manufacturing (7-Day POC)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setIsErpDrawerOpen(true)}
            style={{ fontSize: '0.82rem' }}
          >
            <Database size={15} color="var(--accent)" />
            ERP Ledger ({committedCount})
          </button>
        </div>
      </header>

      {/* 1-Click Interactive Assessment Scenarios Harness */}
      <ScenarioRunner onSelectScenario={handleSelectScenario} isLoading={isLoading} />

      {/* Mobile / Tablet Camera Capture & Pre-Flight Quality Gate */}
      <CameraCapture onImageProcessed={handleImageUploaded} isLoading={isLoading} />

      {/* Telemetry & Continuous Learning Dashboard */}
      <TelemetryDashboard />

      {/* Split-Screen HITL Review Modal */}
      <LoomReviewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
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
