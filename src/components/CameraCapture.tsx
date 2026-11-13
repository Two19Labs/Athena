import React, { useState, useRef } from 'react';
import { Camera, Upload, AlertTriangle, CheckCircle, RefreshCw, Eye } from 'lucide-react';
import { analyzeImageQuality, enhanceAndDeskewImage } from '../services/imageQualityGate';

interface CameraCaptureProps {
  onImageProcessed: (imageUri: string, qualityReport: any) => void;
  isLoading: boolean;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onImageProcessed, isLoading }) => {
  const [dragActive, setDragActive] = useState(false);
  const [qualityReport, setQualityReport] = useState<any>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const uri = e.target?.result as string;
      setPreviewUri(uri);

      // Run image quality pre-flight heuristics
      const img = new Image();
      img.onload = async () => {
        const report = await analyzeImageQuality(img);
        setQualityReport(report);
        
        // Auto-deskew if needed
        const processedUri = report.metrics.skewAngleDeg !== 0
          ? enhanceAndDeskewImage(img, report.metrics.skewAngleDeg)
          : uri;

        onImageProcessed(processedUri, report);
      };
      img.src = uri;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div className="card-header">
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)' }}>
            1. Shop-Floor Document Ingestion
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', marginTop: '2px' }}>
            Capture a live photo using your phone camera or upload a scan of the daily weaving slip.
          </p>
        </div>
        <span className="badge badge-blue">
          Client Pre-Flight Active
        </span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--line-strong)'}`,
          borderRadius: 'var(--radius)',
          padding: '36px 20px',
          textAlign: 'center',
          backgroundColor: dragActive ? 'var(--accent-soft)' : 'rgba(30, 41, 59, 0.4)',
          cursor: 'pointer',
          transition: 'all 0.2s'
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
              processFile(e.target.files[0]);
            }
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Camera size={28} />
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ink)' }}>
              Take Photo / Tap to Upload Weaving Slip
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '4px' }}>
              Supports camera snapshots, PNG, JPG, or WebP. Evaluated in real-time for glare, blur, and lighting.
            </p>
          </div>
        </div>
      </div>

      {/* Pre-Flight Health Feedback Banner */}
      {qualityReport && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: qualityReport.passed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              border: `1px solid ${qualityReport.passed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {qualityReport.passed ? (
                <CheckCircle size={20} color="var(--leaf)" />
              ) : (
                <AlertTriangle size={20} color="var(--amber)" />
              )}
              <div>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: qualityReport.passed ? 'var(--leaf)' : 'var(--amber)' }}>
                  {qualityReport.passed ? 'Capture Quality Passed Pre-Flight Gate' : 'Quality Warnings Detected'}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                  Luminance: {qualityReport.metrics.meanLuminance}/255  |  Glare: {qualityReport.metrics.glarePercentage}%  |  Sharpness: {qualityReport.metrics.laplacianVariance}  |  Skew: {qualityReport.metrics.skewAngleDeg}°
                </p>
              </div>
            </div>

            <span className={`badge ${qualityReport.passed ? 'badge-green' : 'badge-amber'}`}>
              Health: {Math.round(qualityReport.score * 100)}%
            </span>
          </div>

          {qualityReport.warnings.length > 0 && (
            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--radius-xs)', borderLeft: '3px solid var(--danger)' }}>
              {qualityReport.warnings.map((w: string, i: number) => (
                <p key={i} style={{ fontSize: '0.78rem', color: 'var(--danger)', marginBottom: '2px' }}>
                  • {w} — <span style={{ color: 'var(--ink-secondary)' }}>{qualityReport.recommendations[i]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
