import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, downloadFile } from '../api';

const C = {
  mid: 'rgba(108,92,231,0.12)',
  midH: 'rgba(108,92,231,0.08)',
  midExam: 'rgba(253,203,110,0.12)',
  midExamH: 'rgba(253,203,110,0.08)',
  finInit: 'rgba(0,206,201,0.12)',
  finInitH: 'rgba(0,206,201,0.08)',
  finFinal: 'rgba(0,184,148,0.12)',
  finFinalH: 'rgba(0,184,148,0.08)',
  finExam: 'rgba(225,112,85,0.12)',
  finExamH: 'rgba(225,112,85,0.08)',
  calc: 'rgba(99,110,114,0.12)',
  calcH: 'rgba(99,110,114,0.08)',
  total: 'rgba(253,203,110,0.18)',
  quiz: 'rgba(0,184,148,0.15)',
  quizH: 'rgba(0,184,148,0.06)',
  perf: 'rgba(214,48,49,0.10)',
  perfH: 'rgba(214,48,49,0.06)',
};

const thS = (bg) => ({
  background: bg || 'var(--bg-card)', padding: '3px 5px', border: '1px solid var(--border)',
  whiteSpace: 'nowrap', fontSize: '0.7rem', fontWeight: 600
});
const tdS = (bg) => ({
  padding: '3px 5px', border: '1px solid var(--border)', textAlign: 'right', fontSize: '0.72rem', background: bg || 'transparent'
});
const sep = { borderLeft: '3px solid var(--border)' };

function actKey(period, type, slot) { return `${period}|${type}|${slot}`; }
function examKey(side, slot) { return `${side}|${slot}`; }

function getGradeLabel(equiv) {
  const n = Number(equiv);
  if (isNaN(n) || n <= 0) return { text: '-', color: 'var(--text-dim)' };
  if (n >= 80) return { text: 'A', color: '#00b894' };
  if (n >= 75) return { text: 'AB', color: '#00cec9' };
  if (n >= 70) return { text: 'B', color: '#0984e3' };
  if (n >= 65) return { text: 'BC', color: '#6c5ce7' };
  if (n >= 60) return { text: 'C', color: '#fdcb6e' };
  if (n >= 55) return { text: 'CD', color: '#e17055' };
  if (n >= 50) return { text: 'D', color: '#d63031' };
  return { text: 'F', color: '#ff0000' };
}

export default function UnifiedGradingSheet({ databaseId, databaseName, sections = [], showToast }) {
  const [section, setSection] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [perfData, setPerfData] = useState(null);

  const load = useCallback(async () => {
    if (!databaseId) return;
    setLoading(true);
    const q = section ? `&section=${encodeURIComponent(section)}` : '';
    const [res, perfRes] = await Promise.all([
      api.get(`/grades/grading-sheet/combined?databaseId=${databaseId}${q}`),
      api.get(`/performance/section-summary?databaseId=${databaseId}${section ? `&section=${encodeURIComponent(section)}` : ''}`).catch(() => ({ success: false }))
    ]);
    if (res.success) setData(res);
    else showToast?.(res.message || 'Failed to load unified sheet', 'error');
    if (perfRes.success) setPerfData(perfRes);
    setLoading(false);
  }, [databaseId, section, showToast]);

  useEffect(() => { load(); }, [load]);

  const exportExcel = async () => {
    try {
      const q = section ? `&section=${encodeURIComponent(section)}` : '';
      const safeName = String(databaseName || databaseId).replace(/[^\w]/g, '_').slice(0, 30);
      await downloadFile(`/api/grades/grading-sheet/combined/export?databaseId=${databaseId}${q}`, `Unified_Sheet_${safeName}.xlsx`);
      showToast?.('Excel downloaded');
    } catch { showToast?.('Export failed', 'error'); }
  };

  if (!databaseId) return <p style={{ color: 'var(--text-dim)' }}>Select a database first.</p>;

  const activities = data?.activities || [];
  const exams = data?.exams || [];
  const weights = data?.weights || {};
  const quizCols = data?.quizColumns || [];
  const students = data?.students || [];
  const hasData = data !== null;

  const midActs = useMemo(() => activities.filter(a => a.period === 'midterm' && a.type !== 'other'), [activities]);
  const midOther = useMemo(() => activities.filter(a => a.period === 'midterm' && a.type === 'other'), [activities]);
  const finInitActs = useMemo(() => activities.filter(a => a.period === 'final_initial' && a.type !== 'other'), [activities]);
  const finOther = useMemo(() => activities.filter(a => a.period === 'final_initial' && a.type === 'other'), [activities]);
  const finFinalActs = useMemo(() => activities.filter(a => a.period === 'final_final' && a.type !== 'other'), [activities]);
  const midExams = useMemo(() => exams.filter(e => e.side === 'midterm'), [exams]);
  const finExams = useMemo(() => exams.filter(e => e.side === 'final'), [exams]);

  const getPerfAvg = (studentId) => {
    if (!perfData?.data?.students) return 0;
    const s = perfData.data.students.find(st => st.studentId === studentId);
    return s ? Number(s.avgPerformanceScore || 0) : 0;
  };

  const safeNum = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const fmt = (v) => { const n = safeNum(v); return n === 0 ? '-' : n.toFixed(2); };

  const computeRow = (st) => {
    const sc = (period, type, slot) => safeNum(st.activityScores?.[actKey(period, type, slot)]);
    const ex = (side, slot) => safeNum(st.examScores?.[examKey(side, slot)]);
    const w = weights;
    const perfAvg = getPerfAvg(st.studentId);

    let c1Total = 0, c1Max = 0;
    midActs.forEach(a => { c1Total += sc(a.period, a.type, a.slot); c1Max += safeNum(a.maxScore); });
    let c2Total = 0, c2Max = 0;
    midOther.forEach(a => { c2Total += sc(a.period, a.type, a.slot); c2Max += safeNum(a.maxScore); });
    const c3Total = c1Total + c2Total;
    const c3Max = c1Max + c2Max;
    const midCollWt = (safeNum(w.midterm_collective || w.midtermCollective) / 100);
    const otherMidWt = (safeNum(w.other_activities_midterm || w.otherActivitiesMidterm) / 100);
    const c3Equiv = c3Max > 0 ? ((c3Total / c3Max) * (midCollWt + otherMidWt)) * 100 : 0;

    let c4Total = 0, c4Max = 0;
    midExams.forEach(e => { c4Total += ex(e.side, e.slot); c4Max += safeNum(e.maxScore); });
    const midExamWt = safeNum(w.midterm_exam || w.midtermExam) / 100;
    const c5Equiv = c4Max > 0 ? ((c4Total / c4Max) * midExamWt) * 100 : 0;

    const c6Total = c3Equiv + c5Equiv;
    const passMid = safeNum(w.pass_midterm || w.passMidterm) || 50;
    const c6Result = c6Total >= passMid ? 'PASS' : 'FAIL';

    let c7Total = 0, c7Max = 0;
    finInitActs.forEach(a => { c7Total += sc(a.period, a.type, a.slot); c7Max += safeNum(a.maxScore); });
    let c8Total = 0, c8Max = 0;
    finOther.forEach(a => { c8Total += sc(a.period, a.type, a.slot); c8Max += safeNum(a.maxScore); });

    let c9Total = 0, c9Max = 0;
    finFinalActs.forEach(a => { c9Total += sc(a.period, a.type, a.slot); c9Max += safeNum(a.maxScore); });

    const c10Score = c7Total + c8Total;
    const c10Max = c7Max + c8Max;
    const finInitWt = safeNum(w.final_initial || w.finalInitial) / 100;
    const otherFinWt = safeNum(w.other_activities_final || w.otherActivitiesFinal) / 100;
    const c10Equiv = c10Max > 0 ? ((c10Score / c10Max) * (finInitWt + otherFinWt)) * 100 : 0;

    const finFinalWt = safeNum(w.final_final || w.finalFinal) / 100;
    const c11Equiv = c9Max > 0 ? ((c9Total / c9Max) * finFinalWt) * 100 : 0;

    const c12Total = c3Equiv + c5Equiv + c10Equiv + c11Equiv;

    let c13Total = 0, c13Max = 0;
    finExams.forEach(e => { c13Total += ex(e.side, e.slot); c13Max += safeNum(e.maxScore); });
    const finExamWt = safeNum(w.final_exam || w.finalExam) / 100;
    const c14Equiv = c13Max > 0 ? ((c13Total / c13Max) * finExamWt) * 100 : 0;

    const c15Total = c3Equiv + c5Equiv + c10Equiv + c11Equiv + c14Equiv;
    const grade = getGradeLabel(c15Total);

    return {
      c1Total, c1Max, c2Total, c2Max, c3Total, c3Max, c3Equiv,
      c4Total, c4Max, c5Equiv, c6Total, c6Result,
      c7Total, c7Max, c8Total, c8Max, c9Total, c9Max,
      c10Score, c10Max, c10Equiv, c11Equiv,
      c12Total, c13Total, c13Max, c14Equiv, c15Total, grade, perfAvg
    };
  };

  const c1Span = Math.max(midActs.length, 1);
  const c2Span = Math.max(midOther.length, 1);
  const c4Span = Math.max(midExams.length, 1);
  const c7Span = Math.max(finInitActs.length, 1);
  const c8Span = Math.max(finOther.length, 1);
  const c9Span = Math.max(finFinalActs.length, 1);
  const c13Span = Math.max(finExams.length, 1);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={section} onChange={(e) => setSection(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All sections</option>
          {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="btn btn-outline btn-sm">
          {loading ? 'Loading\u2026' : 'Refresh'}
        </button>
        <button onClick={exportExcel} className="btn btn-secondary btn-sm" disabled={!hasData}>Export Excel</button>
        {hasData && <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{students.length} students | Unified: Mode A + B + Performance</span>}
      </div>

      {loading && <div className="loading"><div className="spinner" /></div>}

      {!loading && hasData && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: '0.7rem', borderCollapse: 'collapse', minWidth: 1400 }}>
            <thead>
              <tr>
                <th colSpan={4} style={{ ...thS(), textAlign: 'center' }}>Student</th>
                <th colSpan={c1Span + 1} style={{ ...thS(C.mid), textAlign: 'center', color: '#6c5ce7', ...sep }}>CASE 1: Midterm Collective</th>
                {midOther.length > 0 && <th colSpan={c2Span + 1} style={{ ...thS(C.mid), textAlign: 'center', color: '#6c5ce7', ...sep }}>CASE 2: Other Act. Midterm</th>}
                <th colSpan={2} style={{ ...thS(C.calc), textAlign: 'center', ...sep }}>CASE 3</th>
                <th colSpan={c4Span} style={{ ...thS(C.midExam), textAlign: 'center', color: '#e17055', ...sep }}>CASE 4: Midterm Exam</th>
                <th style={{ ...thS(C.midExamH), textAlign: 'center', ...sep }}>CASE 5</th>
                <th colSpan={2} style={{ ...thS(C.calc), textAlign: 'center', ...sep }}>CASE 6</th>
                <th colSpan={c7Span + 1} style={{ ...thS(C.finInit), textAlign: 'center', color: '#00cec9', ...sep }}>CASE 7: Final Init</th>
                {finOther.length > 0 && <th colSpan={c8Span + 1} style={{ ...thS(C.finInit), textAlign: 'center', color: '#00cec9', ...sep }}>CASE 8: Other Act. Final</th>}
                <th colSpan={c9Span + 1} style={{ ...thS(C.finFinal), textAlign: 'center', color: '#00b894', ...sep }}>CASE 9: Final Final</th>
                <th colSpan={2} style={{ ...thS(C.calc), textAlign: 'center', ...sep }}>CASE 10</th>
                <th colSpan={2} style={{ ...thS(C.calc), textAlign: 'center', ...sep }}>CASE 11</th>
                <th style={{ ...thS(C.calc), textAlign: 'center', ...sep }}>CASE 12</th>
                <th colSpan={c13Span} style={{ ...thS(C.finExam), textAlign: 'center', color: '#e17055', ...sep }}>CASE 13: Final Exam</th>
                <th style={{ ...thS(C.finExamH), textAlign: 'center', ...sep }}>CASE 14</th>
                <th style={{ ...thS(C.total), textAlign: 'center', fontWeight: 800, ...sep }}>CASE 15</th>
                <th style={{ ...thS(C.total), textAlign: 'center' }}>Grade</th>
                <th style={{ ...thS(C.perf), textAlign: 'center', ...sep }}>Perf Avg</th>
                {quizCols.length > 0 && <th colSpan={quizCols.length} style={{ ...thS(C.quiz), textAlign: 'center', color: '#00b894', ...sep }}>Mode B Quizzes</th>}
              </tr>
              <tr>
                <th style={{ ...thS(), position: 'sticky', left: 0, zIndex: 2 }}>ID</th>
                <th style={thS()}>Name</th>
                <th style={thS()}>Sec</th>
                <th style={thS()}>#</th>
                {/* Case 1 slots */}
                {midActs.length > 0 ? midActs.map((a, i) => (
                  <th key={`ma-${i}`} style={{ ...thS(C.midH), ...(i === 0 ? sep : {}) }}>{a.name || `Ind ${a.slot + 1}`}<div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>/{a.maxScore}</div></th>
                )) : <th style={{ ...thS(C.midH), ...sep }}>-</th>}
                <th style={thS(C.midH)}>Tot</th>
                {/* Case 2 slots */}
                {midOther.length > 0 && midOther.map((a, i) => (
                  <th key={`mo-${i}`} style={{ ...thS(C.midH), ...(i === 0 ? sep : {}) }}>{a.name || `Other ${a.slot + 1}`}<div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>/{a.maxScore}</div></th>
                ))}
                {midOther.length > 0 && <th style={thS(C.midH)}>Tot</th>}
                {/* Case 3 */}
                <th style={{ ...thS(C.calcH), ...sep }}>Total</th>
                <th style={thS(C.calcH)}>Equiv</th>
                {/* Case 4 slots */}
                {midExams.length > 0 ? midExams.map((e, i) => (
                  <th key={`me-${i}`} style={{ ...thS(C.midExamH), ...(i === 0 ? sep : {}) }}>{e.typeName || `Exam ${e.slot + 1}`}<div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>/{e.maxScore}</div></th>
                )) : <th style={{ ...thS(C.midExamH), ...sep }}>-</th>}
                {/* Case 5 */}
                <th style={{ ...thS(C.midExamH), ...sep }}>Equiv</th>
                {/* Case 6 */}
                <th style={{ ...thS(C.calcH), ...sep }}>Total</th>
                <th style={thS(C.calcH)}>Result</th>
                {/* Case 7 slots */}
                {finInitActs.length > 0 ? finInitActs.map((a, i) => (
                  <th key={`fi-${i}`} style={{ ...thS(C.finInitH), ...(i === 0 ? sep : {}) }}>{a.name || `Ind ${a.slot + 1}`}<div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>/{a.maxScore}</div></th>
                )) : <th style={{ ...thS(C.finInitH), ...sep }}>-</th>}
                <th style={thS(C.finInitH)}>Tot</th>
                {/* Case 8 slots */}
                {finOther.length > 0 && finOther.map((a, i) => (
                  <th key={`fo-${i}`} style={{ ...thS(C.finInitH), ...(i === 0 ? sep : {}) }}>{a.name || `Other ${a.slot + 1}`}<div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>/{a.maxScore}</div></th>
                ))}
                {finOther.length > 0 && <th style={thS(C.finInitH)}>Tot</th>}
                {/* Case 9 slots */}
                {finFinalActs.length > 0 ? finFinalActs.map((a, i) => (
                  <th key={`ff-${i}`} style={{ ...thS(C.finFinalH), ...(i === 0 ? sep : {}) }}>{a.name || `Ind ${a.slot + 1}`}<div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>/{a.maxScore}</div></th>
                )) : <th style={{ ...thS(C.finFinalH), ...sep }}>-</th>}
                <th style={thS(C.finFinalH)}>Tot</th>
                {/* Case 10-11 */}
                <th style={{ ...thS(C.calcH), ...sep }}>Total</th>
                <th style={thS(C.calcH)}>Equiv</th>
                <th style={{ ...thS(C.calcH), ...sep }}>Total</th>
                <th style={thS(C.calcH)}>Equiv</th>
                {/* Case 12 */}
                <th style={{ ...thS(C.calcH), ...sep, fontWeight: 700 }}>Combined</th>
                {/* Case 13 slots */}
                {finExams.length > 0 ? finExams.map((e, i) => (
                  <th key={`fe-${i}`} style={{ ...thS(C.finExamH), ...(i === 0 ? sep : {}) }}>{e.typeName || `Exam ${e.slot + 1}`}<div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>/{e.maxScore}</div></th>
                )) : <th style={{ ...thS(C.finExamH), ...sep }}>-</th>}
                {/* Case 14-15 */}
                <th style={{ ...thS(C.finExamH), ...sep }}>Equiv</th>
                <th style={{ ...thS(C.total), ...sep, fontWeight: 800 }}>TOTAL</th>
                <th style={thS(C.total)}>Grade</th>
                <th style={{ ...thS(C.perfH), ...sep }}>Mode B</th>
                {quizCols.map((q) => (
                  <th key={q.id} style={{ ...thS(C.quizH), ...sep, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${q.title} (Pass: ${q.passingScore}%)`}>
                    {q.title.length > 8 ? q.title.slice(0, 8) + '\u2026' : q.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((st, idx) => {
                const r = computeRow(st);
                const bg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
                const stickyBg = idx % 2 === 0 ? 'var(--bg-dark)' : 'var(--bg-card)';
                return (
                  <tr key={st.studentId}>
                    <td style={{ ...tdS(stickyBg), position: 'sticky', left: 0, zIndex: 1, fontFamily: 'monospace', textAlign: 'left' }}>{st.studentId}</td>
                    <td style={{ ...tdS(bg), textAlign: 'left', whiteSpace: 'nowrap' }}>{st.englishName}</td>
                    <td style={{ ...tdS(bg), textAlign: 'center' }}>{st.section}</td>
                    <td style={{ ...tdS(bg), textAlign: 'center' }}>{st.classNumber}</td>
                    {/* Case 1 */}
                    {midActs.length > 0 ? midActs.map((a, i) => (
                      <td key={`ma-${i}`} style={{ ...tdS(C.midH), ...(i === 0 ? sep : {}) }}>{fmt(st.activityScores?.[actKey(a.period, a.type, a.slot)])}</td>
                    )) : <td style={{ ...tdS(C.midH), ...sep }}>-</td>}
                    <td style={{ ...tdS(C.midH), fontWeight: 600 }}>{r.c1Total}/{r.c1Max}</td>
                    {/* Case 2 */}
                    {midOther.length > 0 && midOther.map((a, i) => (
                      <td key={`mo-${i}`} style={{ ...tdS(C.midH), ...(i === 0 ? sep : {}) }}>{fmt(st.activityScores?.[actKey(a.period, a.type, a.slot)])}</td>
                    ))}
                    {midOther.length > 0 && <td style={{ ...tdS(C.midH), fontWeight: 600 }}>{r.c2Total}/{r.c2Max}</td>}
                    {/* Case 3 */}
                    <td style={{ ...tdS(C.calcH), ...sep, fontWeight: 600 }}>{r.c3Total}/{r.c3Max}</td>
                    <td style={{ ...tdS(C.calcH), fontWeight: 600 }}>{r.c3Equiv.toFixed(1)}</td>
                    {/* Case 4 */}
                    {midExams.length > 0 ? midExams.map((e, i) => (
                      <td key={`me-${i}`} style={{ ...tdS(C.midExamH), ...(i === 0 ? sep : {}) }}>{fmt(st.examScores?.[examKey(e.side, e.slot)])}</td>
                    )) : <td style={{ ...tdS(C.midExamH), ...sep }}>-</td>}
                    {/* Case 5 */}
                    <td style={{ ...tdS(C.midExamH), ...sep, fontWeight: 600 }}>{r.c5Equiv.toFixed(1)}</td>
                    {/* Case 6 */}
                    <td style={{ ...tdS(C.calcH), ...sep, fontWeight: 700 }}>{r.c6Total.toFixed(1)}</td>
                    <td style={{ ...tdS(C.calcH), textAlign: 'center' }}>
                      <span style={{ color: r.c6Result === 'PASS' ? '#00b894' : '#e17055', fontWeight: 700 }}>{r.c6Result}</span>
                    </td>
                    {/* Case 7 */}
                    {finInitActs.length > 0 ? finInitActs.map((a, i) => (
                      <td key={`fi-${i}`} style={{ ...tdS(C.finInitH), ...(i === 0 ? sep : {}) }}>{fmt(st.activityScores?.[actKey(a.period, a.type, a.slot)])}</td>
                    )) : <td style={{ ...tdS(C.finInitH), ...sep }}>-</td>}
                    <td style={{ ...tdS(C.finInitH), fontWeight: 600 }}>{r.c7Total}/{r.c7Max}</td>
                    {/* Case 8 */}
                    {finOther.length > 0 && finOther.map((a, i) => (
                      <td key={`fo-${i}`} style={{ ...tdS(C.finInitH), ...(i === 0 ? sep : {}) }}>{fmt(st.activityScores?.[actKey(a.period, a.type, a.slot)])}</td>
                    ))}
                    {finOther.length > 0 && <td style={{ ...tdS(C.finInitH), fontWeight: 600 }}>{r.c8Total}/{r.c8Max}</td>}
                    {/* Case 9 */}
                    {finFinalActs.length > 0 ? finFinalActs.map((a, i) => (
                      <td key={`ff-${i}`} style={{ ...tdS(C.finFinalH), ...(i === 0 ? sep : {}) }}>{fmt(st.activityScores?.[actKey(a.period, a.type, a.slot)])}</td>
                    )) : <td style={{ ...tdS(C.finFinalH), ...sep }}>-</td>}
                    <td style={{ ...tdS(C.finFinalH), fontWeight: 600 }}>{r.c9Total}/{r.c9Max}</td>
                    {/* Case 10 */}
                    <td style={{ ...tdS(C.calcH), ...sep }}>{(r.c10Score)}/{r.c10Max}</td>
                    <td style={{ ...tdS(C.calcH), fontWeight: 600 }}>{r.c10Equiv.toFixed(1)}</td>
                    {/* Case 11 */}
                    <td style={{ ...tdS(C.calcH), ...sep }}>{r.c9Total}/{r.c9Max}</td>
                    <td style={{ ...tdS(C.calcH), fontWeight: 600 }}>{r.c11Equiv.toFixed(1)}</td>
                    {/* Case 12 */}
                    <td style={{ ...tdS(C.calcH), ...sep, fontWeight: 700 }}>{r.c12Total.toFixed(1)}</td>
                    {/* Case 13 */}
                    {finExams.length > 0 ? finExams.map((e, i) => (
                      <td key={`fe-${i}`} style={{ ...tdS(C.finExamH), ...(i === 0 ? sep : {}) }}>{fmt(st.examScores?.[examKey(e.side, e.slot)])}</td>
                    )) : <td style={{ ...tdS(C.finExamH), ...sep }}>-</td>}
                    {/* Case 14 */}
                    <td style={{ ...tdS(C.finExamH), ...sep, fontWeight: 600 }}>{r.c14Equiv.toFixed(1)}</td>
                    {/* Case 15 */}
                    <td style={{ ...tdS(C.total), ...sep, fontWeight: 800, fontSize: '0.78rem' }}>{r.c15Total.toFixed(1)}</td>
                    <td style={{ ...tdS(C.total), textAlign: 'center' }}>
                      <span style={{ color: r.grade.color, fontWeight: 700 }}>{r.grade.text}</span>
                    </td>
                    {/* Performance */}
                    <td style={{ ...tdS(C.perfH), ...sep, fontWeight: 600 }}>{r.perfAvg > 0 ? r.perfAvg.toFixed(1) : '-'}</td>
                    {/* Quiz scores */}
                    {quizCols.map((q) => {
                      const val = st.quizScores[q.id];
                      const hasPct = val !== null && val !== undefined;
                      const passed = hasPct && val >= q.passingScore;
                      return (
                        <td key={q.id} style={{ ...tdS(C.quizH), ...sep }}>
                          {hasPct ? <span style={{ color: passed ? '#00b894' : '#e17055', fontWeight: 600 }}>{Number(val).toFixed(1)}%</span> : <span style={{ color: 'var(--text-dim)' }}>-</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr><td colSpan={99} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem', border: '1px solid var(--border)' }}>No students found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasData && (
        <div style={{ marginTop: '1rem', padding: '0.6rem 0.8rem', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          <strong>Cases:</strong> 1: Midterm Collective (Ind+Grp) | 2: Other Act. Midterm | 3: Total+Equiv | 4: Mid Exam | 5: Mid Exam Equiv | 6: Midterm Result | 7: Final Init (Ind+Grp) | 8: Other Act. Final | 9: Final Final (Ind+Grp) | 10: Fin Init Total+Equiv | 11: Fin Final Total+Equiv | 12: Combined All | 13: Final Exam | 14: Fin Exam Equiv | 15: Grand Total+Grade
          <br /><strong>Note:</strong> Each activity/exam slot from Mode A is shown as individual columns. Mode B Performance averages and Quiz scores are included. Slot columns expand dynamically as you add more in Edit Sheet.
        </div>
      )}
    </div>
  );
}
