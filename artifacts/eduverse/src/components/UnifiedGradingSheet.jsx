import React, { useState, useEffect, useCallback } from 'react';
import { api, downloadFile } from '../api';

export default function UnifiedGradingSheet({ databaseId, databaseName, sections = [], showToast }) {
  const [section, setSection] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!databaseId) return;
    setLoading(true);
    const q = section ? `&section=${encodeURIComponent(section)}` : '';
    const res = await api.get(`/grades/grading-sheet/combined?databaseId=${databaseId}${q}`);
    if (res.success) setData(res);
    else showToast?.(res.message || 'Failed to load unified sheet', 'error');
    setLoading(false);
  }, [databaseId, section, showToast]);

  useEffect(() => { load(); }, [load]);

  const exportExcel = async () => {
    try {
      const q = section ? `&section=${encodeURIComponent(section)}` : '';
      const safeName = String(databaseName || databaseId).replace(/[^\w]/g, '_').slice(0, 30);
      await downloadFile(
        `/api/grades/grading-sheet/combined/export?databaseId=${databaseId}${q}`,
        `Unified_Sheet_${safeName}.xlsx`
      );
      showToast?.('Excel downloaded');
    } catch { showToast?.('Export failed', 'error'); }
  };

  if (!databaseId) return <p style={{ color: 'var(--text-dim)' }}>Select a database first.</p>;

  const quizCols = data?.quizColumns || [];
  const students = data?.students || [];
  const hasData = data !== null;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={section} onChange={(e) => setSection(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All sections</option>
          {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="btn btn-outline btn-sm">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button onClick={exportExcel} className="btn btn-secondary btn-sm" disabled={!hasData}>
          Export Excel
        </button>
        {hasData && (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            {students.length} student{students.length !== 1 ? 's' : ''} · {quizCols.length} quiz{quizCols.length !== 1 ? 'zes' : ''}
          </span>
        )}
      </div>

      {loading && <div className="loading"><div className="spinner" /></div>}

      {!loading && hasData && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ background: 'var(--bg-card)', position: 'sticky', left: 0, zIndex: 2, padding: '0.4rem 0.6rem', border: '1px solid var(--border)' }}>ID</th>
                <th rowSpan={2} style={{ background: 'var(--bg-card)', padding: '0.4rem 0.6rem', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>English Name</th>
                <th rowSpan={2} style={{ background: 'var(--bg-card)', padding: '0.4rem 0.4rem', border: '1px solid var(--border)' }}>Sec</th>
                <th rowSpan={2} style={{ background: 'var(--bg-card)', padding: '0.4rem 0.4rem', border: '1px solid var(--border)' }}>#</th>
                <th colSpan={7} style={{ background: 'rgba(108,92,231,0.18)', textAlign: 'center', color: 'var(--primary)', padding: '0.3rem', border: '1px solid var(--border)', fontWeight: 700 }}>
                  Mode A — Activity &amp; Exam Totals
                </th>
                {quizCols.length > 0 && (
                  <th colSpan={quizCols.length} style={{ background: 'rgba(0,184,148,0.18)', textAlign: 'center', color: '#00b894', padding: '0.3rem', border: '1px solid var(--border)', fontWeight: 700 }}>
                    Mode B — Quiz Best Scores (%)
                  </th>
                )}
              </tr>
              <tr>
                {['Midterm', 'Fin.Init.', 'Fin.Final', 'Mid.Exam', 'Fin.Exam'].map((label) => (
                  <th key={label} style={{ background: 'rgba(108,92,231,0.09)', padding: '0.3rem 0.5rem', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{label}</th>
                ))}
                <th style={{ background: 'rgba(108,92,231,0.09)', padding: '0.3rem 0.5rem', border: '1px solid var(--border)', fontWeight: 700 }}>Overall</th>
                <th style={{ background: 'rgba(108,92,231,0.09)', padding: '0.3rem 0.5rem', border: '1px solid var(--border)' }}>A Result</th>
                {quizCols.map((q) => (
                  <th key={q.id} title={`${q.title} (Pass: ${q.passingScore}%)`}
                    style={{ background: 'rgba(0,184,148,0.07)', padding: '0.3rem 0.5rem', border: '1px solid var(--border)', maxWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <div style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {q.title.length > 13 ? q.title.slice(0, 13) + '…' : q.title}
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '0.68rem', color: 'var(--text-dim)' }}>Pass {q.passingScore}%</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((st, idx) => (
                <tr key={st.studentId} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={{ position: 'sticky', left: 0, background: idx % 2 === 0 ? 'var(--bg-dark)' : 'var(--bg-card)', zIndex: 1, fontFamily: 'monospace', fontSize: '0.75rem', padding: '0.3rem 0.5rem', border: '1px solid var(--border)' }}>
                    {st.studentId}
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{st.englishName}</td>
                  <td style={{ padding: '0.3rem 0.4rem', border: '1px solid var(--border)', textAlign: 'center' }}>{st.section}</td>
                  <td style={{ padding: '0.3rem 0.4rem', border: '1px solid var(--border)', textAlign: 'center' }}>{st.classNumber}</td>
                  {[st.midtermTotal, st.finalInitialTotal, st.finalFinalTotal, st.midtermExamTotal, st.finalExamTotal].map((val, i) => (
                    <td key={i} style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', textAlign: 'right' }}>
                      {val === '0.00' ? <span style={{ color: 'var(--text-dim)' }}>-</span> : val}
                    </td>
                  ))}
                  <td style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 }}>
                    {st.overallTotal}
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <span className={`badge ${st.modeAResult === 'PASSED' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.68rem' }}>
                      {st.modeAResult}
                    </span>
                  </td>
                  {quizCols.map((q) => {
                    const val = st.quizScores[q.id];
                    const hasPct = val !== null && val !== undefined;
                    const passed = hasPct && val >= q.passingScore;
                    return (
                      <td key={q.id} style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', textAlign: 'right' }}>
                        {hasPct ? (
                          <span style={{ color: passed ? '#00b894' : 'var(--danger)', fontWeight: 600 }}>
                            {Number(val).toFixed(1)}%
                          </span>
                        ) : <span style={{ color: 'var(--text-dim)' }}>-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={11 + quizCols.length} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem', border: '1px solid var(--border)' }}>
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
