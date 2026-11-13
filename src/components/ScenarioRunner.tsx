import React from 'react';
import { Play, Sparkles, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { generateSyntheticForm, getScenarioCanonicalRecord } from '../generator/formCanvasGenerator';

interface ScenarioRunnerProps {
  onSelectScenario: (scenarioId: 'clean' | 'degraded' | 'failure', imageUri: string, record: any) => void;
  isLoading: boolean;
}

export const ScenarioRunner: React.FC<ScenarioRunnerProps> = ({ onSelectScenario, isLoading }) => {
  const triggerScenario = (scenarioId: 'clean' | 'degraded' | 'failure') => {
    const imageUri = generateSyntheticForm(scenarioId);
    const record = getScenarioCanonicalRecord(scenarioId);
    onSelectScenario(scenarioId, imageUri, record);
  };

  return (
    <div className="card" style={{ marginBottom: '24px', backgroundColor: 'rgba(30, 41, 59, 0.7)' }}>
      <div className="card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="var(--accent)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink)' }}>
              Interactive Assessment Scenarios (1-Click Test Harness)
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', marginTop: '2px' }}>
            Directly test the 3 required test cases from the APLYD assessment brief using authentic synthetic forms.
          </p>
        </div>
        <span className="badge badge-green">Ready to Run</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        
        {/* Scenario 1 */}
        <div
          onClick={() => triggerScenario('clean')}
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--surface)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--leaf)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--line)'}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="badge badge-green">Case 1: Golden Path</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--leaf)', fontWeight: 600 }}>100% Compliant</span>
            </div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--ink)' }}>
              Standard Shift A Production Slip
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
              Loom L-104 clean log. 96%+ AI confidence, balanced 8-hr shift math (420m run + 60m downtime). 1-click instant ERP approval.
            </p>
          </div>
          <button className="btn btn-secondary" style={{ marginTop: '12px', width: '100%', fontSize: '0.8rem' }}>
            <Play size={14} /> Run Case 1 (Clean Form)
          </button>
        </div>

        {/* Scenario 2 */}
        <div
          onClick={() => triggerScenario('degraded')}
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--surface)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--amber)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--line)'}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="badge badge-amber">Case 2: Degraded Real-World</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--amber)', fontWeight: 600 }}>Amber Flags</span>
            </div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--ink)' }}>
              Skew + Grease + Strikethrough
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
              20° perspective tilt, tube-light glare, grease thumbprint over Loom ID ("L-1O4"), and pick counter 348,200 crossed out with 349,800 written above.
            </p>
          </div>
          <button className="btn btn-secondary" style={{ marginTop: '12px', width: '100%', fontSize: '0.8rem' }}>
            <Play size={14} /> Run Case 2 (Degraded)
          </button>
        </div>

        {/* Scenario 3 */}
        <div
          onClick={() => triggerScenario('failure')}
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--surface)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--danger)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--line)'}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="badge badge-red">Case 3: Boundary Failure</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>Red Critical</span>
            </div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--ink)' }}>
              Math Violations & Reversal
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
              Missing shift header, impossible 540 min downtime in 480 min shift, and End Pick lower than Start Pick. Trips Red flags and blocks ERP handoff.
            </p>
          </div>
          <button className="btn btn-secondary" style={{ marginTop: '12px', width: '100%', fontSize: '0.8rem' }}>
            <Play size={14} /> Run Case 3 (Critical Failure)
          </button>
        </div>

      </div>
    </div>
  );
};
