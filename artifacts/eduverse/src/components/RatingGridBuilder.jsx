import React, { useState } from 'react';

const DEFAULT_COLS = [
  { label: '1 (Poor)', value: '1' },
  { label: '2 (Fair)', value: '2' },
  { label: '3 (Good)', value: '3' },
  { label: '4 (Very Good)', value: '4' },
  { label: '5 (Excellent)', value: '5' },
];

const DEFAULT_ROWS = ['Difficulty of puzzle', 'Theme clarity', 'Grid readability', 'Word difficulty', 'Overall enjoyment'];

export default function RatingGridBuilder({ onSave, existingData }) {
  const [columns, setColumns] = useState(existingData?.columns || DEFAULT_COLS);
  const [rows, setRows] = useState(existingData?.rows || DEFAULT_ROWS);
  const [scoringMode, setScoringMode] = useState(existingData?.scoringMode || 'average');
  const [categories, setCategories] = useState(existingData?.categories || []);
  const [showPreview, setShowPreview] = useState(false);
  const [previewSelections, setPreviewSelections] = useState({});

  const addColumn = () => setColumns([...columns, { label: `${columns.length + 1}`, value: String(columns.length + 1) }]);
  const removeColumn = (idx) => setColumns(columns.filter((_, i) => i !== idx));
  const updateColumn = (idx, label) => {
    const newCols = [...columns];
    newCols[idx] = { ...newCols[idx], label };
    setColumns(newCols);
  };

  const addRow = () => setRows([...rows, '']);
  const removeRow = (idx) => setRows(rows.filter((_, i) => i !== idx));
  const updateRow = (idx, text) => {
    const newRows = [...rows];
    newRows[idx] = text;
    setRows(newRows);
  };

  const handleSave = () => {
    onSave({ columns, rows: rows.filter(Boolean), scoringMode, categories });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Left - Columns */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h4 style={{ margin: 0, color: 'var(--text-bright)' }}>Rating Scale ({columns.length})</h4>
              <button onClick={addColumn} className="btn btn-outline btn-sm" style={{ fontSize: '0.75rem' }}>+ Add</button>
            </div>
            {columns.map((col, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem', alignItems: 'center' }}>
                <input value={col.label} onChange={e => updateColumn(i, e.target.value)} style={{ flex: 1, fontSize: '0.85rem' }} />
                {columns.length > 2 && (
                  <button onClick={() => removeColumn(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>x</button>
                )}
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h4 style={{ margin: 0, color: 'var(--text-bright)' }}>Criteria ({rows.filter(Boolean).length})</h4>
              <button onClick={addRow} className="btn btn-outline btn-sm" style={{ fontSize: '0.75rem' }}>+ Add</button>
            </div>
            {rows.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.3rem', alignItems: 'center' }}>
                <input value={row} onChange={e => updateRow(i, e.target.value)} placeholder={`Criteria ${i + 1}`} style={{ flex: 1, fontSize: '0.85rem' }} />
                {rows.length > 1 && (
                  <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>x</button>
                )}
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-bright)' }}>Scoring Mode</h4>
            <select value={scoringMode} onChange={e => setScoringMode(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem' }}>
              <option value="average">Average Score Per Row</option>
              <option value="total">Total Score</option>
              <option value="category">Category Breakdown</option>
            </select>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
              {scoringMode === 'average' && 'Each row gets an average based on selected column value.'}
              {scoringMode === 'total' && `Sum all values. Max: ${rows.filter(Boolean).length} rows x ${columns.length} = ${rows.filter(Boolean).length * columns.length}`}
              {scoringMode === 'category' && 'Group rows into categories for separate scoring.'}
            </p>
          </div>

          <div className="card">
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <button onClick={() => setShowPreview(true)} className="btn btn-outline btn-sm" style={{ borderColor: '#00cec9', color: '#00cec9' }}>Preview Student View</button>
              <button onClick={() => { setColumns(DEFAULT_COLS); setRows(DEFAULT_ROWS); }} className="btn btn-outline btn-sm">Reset Grid</button>
              <button onClick={handleSave} className="btn btn-primary btn-sm">Save Template</button>
            </div>
          </div>
        </div>

        {/* Center - Live Preview */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card">
            <h4 style={{ marginBottom: '0.8rem', color: 'var(--text-bright)' }}>Live Preview</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-dim)' }}>Criteria / Scale</th>
                    {columns.map((col, i) => (
                      <th key={i} style={{ padding: '0.6rem', textAlign: 'center', borderBottom: '2px solid var(--border)', color: 'var(--text-dim)', minWidth: 60 }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(Boolean).map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.6rem', color: 'var(--text-bright)' }}>{row}</td>
                      {columns.map((col, ci) => (
                        <td key={ci} style={{ textAlign: 'center', padding: '0.4rem' }}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)', margin: '0 auto', cursor: 'default' }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Student Preview Modal */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPreview(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '2rem', maxWidth: 700, width: '95%', maxHeight: '90vh', overflow: 'auto', color: '#333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#333' }}>Student View Preview</h3>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#999' }}>x</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '0.8rem', textAlign: 'left', color: '#666' }}>Criteria</th>
                    {columns.map((col, i) => (
                      <th key={i} style={{ padding: '0.8rem', textAlign: 'center', color: '#666' }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(Boolean).map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '0.8rem', color: '#333' }}>{row}</td>
                      {columns.map((col, ci) => {
                        const selected = previewSelections[row] === col.value;
                        return (
                          <td key={ci} style={{ textAlign: 'center', padding: '0.5rem' }}>
                            <button onClick={() => setPreviewSelections(prev => ({ ...prev, [row]: col.value }))}
                              style={{
                                width: 28, height: 28, borderRadius: '50%',
                                border: `2px solid ${selected ? '#4285f4' : '#ddd'}`,
                                background: selected ? '#4285f4' : 'transparent',
                                cursor: 'pointer', transition: 'all 0.2s'
                              }} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Object.keys(previewSelections).length > 0 && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: 8 }}>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Score Summary:</p>
                {scoringMode === 'total' && (
                  <p>Total: {Object.values(previewSelections).reduce((sum, v) => sum + (Number(v) || 0), 0)} / {rows.filter(Boolean).length * columns.length}</p>
                )}
                {scoringMode === 'average' && (
                  <p>Average: {(Object.values(previewSelections).reduce((sum, v) => sum + (Number(v) || 0), 0) / Math.max(Object.keys(previewSelections).length, 1)).toFixed(1)}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
