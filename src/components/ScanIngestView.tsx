import React, { useState, useRef } from 'react';
import { 
  Camera, Upload, AlertTriangle, CheckCircle, RefreshCw, Eye, Sparkles, 
  ArrowRight, ShieldCheck, FileText, Image as ImageIcon, Zap
} from 'lucide-react';
import { analyzeImageQuality, enhanceAndDeskewImage } from '../services/imageQualityGate.ts';
import { generateSyntheticForm, getScenarioCanonicalRecord } from '../generator/formCanvasGenerator.ts';

interface ScanIngestViewProps {
  onProcessRecord: (imageUri: string, record: any) => void;
  isLoading: boolean;
}

export const ScanIngestView: React.FC<ScanIngestViewProps> = ({
  onProcessRecord,
  isLoading
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [qualityReport, setQualityReport] = useState<any>(null);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [extractedRecord, setExtractedRecord] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle uploaded / captured image
  const processImageFile = async (file: File) => {
    setActiveScenario(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const uri = e.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        const report = await analyzeImageQuality(img);
        setQualityReport(report);
        const processedUri = report.metrics.skewAngleDeg !== 0
          ? enhanceAndDeskewImage(img, report.metrics.skewAngleDeg)
          : uri;
        setPreviewUri(processedUri);
        // Default canonical model record (or degraded if quality low)
        const record = getScenarioCanonicalRecord(report.passed ? 'clean' : 'degraded');
        setExtractedRecord(record);
      };
      img.src = uri;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  // Load one of the 3 assessment sample slips
  const handleLoadSample = (scenarioId: 'clean' | 'degraded' | 'failure') => {
    setActiveScenario(scenarioId);
    const imageUri = generateSyntheticForm(scenarioId);
    const record = getScenarioCanonicalRecord(scenarioId);
    
    // Create image to run real-time pre-flight analysis
    const img = new Image();
    img.onload = async () => {
      const report = await analyzeImageQuality(img);
      setQualityReport(report);
      setPreviewUri(imageUri);
      setExtractedRecord(record);
    };
    img.src = imageUri;
  };

  const handleTriggerReview = () => {
    if (previewUri && extractedRecord) {
      onProcessRecord(previewUri, extractedRecord);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Banner */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Camera size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)' }}>
                Vision-First Shop-Floor Ingestion Station
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', marginTop: '4px' }}>
              Snap a physical paper slip from the loom or upload a scan. Real-time pre-flight gates test lighting, glare, and blur before multimodal AI extraction.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={14} /> Edge Quality Gate Active
            </span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Ingest Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        
        {/* Left Column: Upload / Camera Zone & Evaluation Test Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--line-strong)'}`,
              borderRadius: 'var(--radius)',
              padding: '40px 24px',
              textAlign: 'center',
              backgroundColor: dragActive ? 'var(--accent-soft)' : 'rgba(30, 41, 59, 0.4)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  processImageFile(e.target.files[0]);
                }
              }}
            />

            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Upload size={30} />
            </div>

            <div>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)' }}>
                Take Photo or Drag & Drop Production Slip
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '4px' }}>
                Supports camera snapshot, PNG, JPG, or WebP.
              </p>
            </div>

            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ fontSize: '0.82rem', marginTop: '6px' }}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Camera size={15} /> Select File / Open Camera
            </button>
          </div>

          {/* Evaluation Quick-Load Scenarios */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Sparkles size={16} color="var(--accent)" />
              <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)' }}>
                Or Load Official Assessment Evaluation Forms:
              </h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              
              {/* Clean */}
              <div 
                onClick={() => handleLoadSample('clean')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${activeScenario === 'clean' ? 'var(--leaf)' : 'var(--line)'}`,
                  backgroundColor: activeScenario === 'clean' ? 'rgba(16, 185, 129, 0.08)' : 'var(--surface-header)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>Case 1</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)' }}>Golden Path Clean Slip</span>
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'var(--ink-secondary)', marginTop: '2px' }}>
                    Loom L-104 • 100% compliant math • Instant ERP auto-approval
                  </p>
                </div>
                <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>Load</span>
              </div>

              {/* Degraded */}
              <div 
                onClick={() => handleLoadSample('degraded')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${activeScenario === 'degraded' ? 'var(--amber)' : 'var(--line)'}`,
                  backgroundColor: activeScenario === 'degraded' ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface-header)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>Case 2</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)' }}>Degraded Real-World Slip</span>
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'var(--ink-secondary)', marginTop: '2px' }}>
                    20° tilt • Glare • Oil thumbprint • Strikethrough overwrite
                  </p>
                </div>
                <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>Load</span>
              </div>

              {/* Failure */}
              <div 
                onClick={() => handleLoadSample('failure')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${activeScenario === 'failure' ? 'var(--danger)' : 'var(--line)'}`,
                  backgroundColor: activeScenario === 'failure' ? 'rgba(239, 68, 68, 0.08)' : 'var(--surface-header)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-red" style={{ fontSize: '0.68rem' }}>Case 3</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)' }}>Critical Boundary Failure</span>
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'var(--ink-secondary)', marginTop: '2px' }}>
                    540 min downtime in 480 min shift • Negative pick counter
                  </p>
                </div>
                <span className="badge badge-red" style={{ fontSize: '0.72rem' }}>Load</span>
              </div>

            </div>
          </div>

        </div>

        {/* Right Column: Pre-Flight Analysis & Live Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {previewUri ? (
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ImageIcon size={18} color="var(--accent)" />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                    Image Pre-Flight Analysis
                  </h3>
                </div>
                {qualityReport && (
                  <span className={`badge ${qualityReport.passed ? 'badge-green' : 'badge-amber'}`}>
                    Health: {Math.round(qualityReport.score * 100)}%
                  </span>
                )}
              </div>

              {/* Image Preview Canvas */}
              <div style={{
                position: 'relative',
                maxHeight: '260px',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: '1px solid var(--line)',
                backgroundColor: '#0f172a',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <img 
                  src={previewUri} 
                  alt="Captured Slip" 
                  style={{ maxHeight: '260px', maxWidth: '100%', objectFit: 'contain' }} 
                />
              </div>

              {/* Quality Metrics Grid */}
              {qualityReport && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--surface-header)', borderRadius: 'var(--radius-xs)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Luminance</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {qualityReport.metrics.meanLuminance} / 255
                    </div>
                  </div>

                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--surface-header)', borderRadius: 'var(--radius-xs)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Specular Glare</div>
                    <div style={{ 
                      fontSize: '0.9rem', 
                      fontWeight: 700, 
                      fontFamily: 'var(--font-mono)',
                      color: qualityReport.metrics.glarePercentage > 15 ? 'var(--amber)' : 'var(--leaf)'
                    }}>
                      {qualityReport.metrics.glarePercentage}%
                    </div>
                  </div>

                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--surface-header)', borderRadius: 'var(--radius-xs)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Laplacian Sharpness</div>
                    <div style={{ 
                      fontSize: '0.9rem', 
                      fontWeight: 700, 
                      fontFamily: 'var(--font-mono)',
                      color: qualityReport.metrics.laplacianVariance < 100 ? 'var(--amber)' : 'var(--leaf)'
                    }}>
                      {qualityReport.metrics.laplacianVariance}
                    </div>
                  </div>

                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--surface-header)', borderRadius: 'var(--radius-xs)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Perspective Skew</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {qualityReport.metrics.skewAngleDeg}&deg;
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings List */}
              {qualityReport?.warnings?.length > 0 && (
                <div style={{ padding: '10px 14px', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  {qualityReport.warnings.map((w: string, i: number) => (
                    <div key={i} style={{ fontSize: '0.76rem', color: 'var(--amber)', marginBottom: '2px' }}>
                      &bull; {w} &mdash; <span style={{ color: 'var(--ink-secondary)' }}>{qualityReport.recommendations[i]}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Big Action: Launch AI Review */}
              <button
                className="btn btn-primary"
                onClick={handleTriggerReview}
                style={{
                  padding: '14px 20px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <Zap size={18} />
                Process Slip with Vision AI &amp; Open HITL Console
                <ArrowRight size={18} />
              </button>

            </div>
          ) : (
            <div className="card" style={{ 
              padding: '40px 24px', 
              textAlign: 'center', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              minHeight: '320px',
              backgroundColor: 'rgba(30, 41, 59, 0.3)'
            }}>
              <FileText size={48} color="var(--muted)" />
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                  Awaiting Document Input
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '4px', maxWidth: '320px' }}>
                  Take a photo, drag and drop an image file, or select one of the 3 assessment test cases on the left to begin extraction.
                </p>
              </div>
            </div>
          )}

          {/* Shop-Floor Capture Guidelines */}
          <div className="card" style={{ padding: '16px' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>
              Shop-Floor Capture Best Practices
            </h4>
            <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>&bull; <strong>Alignment:</strong> Hold camera parallel to the paper clipboard to minimize perspective tilt.</div>
              <div>&bull; <strong>Lighting:</strong> Angle away from direct overhead fluorescent tube glare.</div>
              <div>&bull; <strong>Framing:</strong> Keep all four outer form borders and printed labels inside the frame.</div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
