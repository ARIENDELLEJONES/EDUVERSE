import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, downloadFile } from '../api';
import { weightsToApiPayload } from '../utils/gradeWeights';

const PERIOD_LABELS = {
  midterm: 'Midterm',
  final_initial: 'Final Initial',
  final_final: 'Final Final'
};

function activityKey(period, type, slot) {
  return `${period}|${type}|${slot}`;
}

function examKey(side, slot) {
  return `${side}|${slot}`;
}

function Toolbar({ children, style }) {
  return <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', ...style }}>{children}</div>;
}

function sanitizeFilenamePart(str, maxLen = 72) {
  const t = String(str ?? 'NA').trim().replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
  const out = t.slice(0, maxLen);
  return out.length ? out : 'NA';
}

function isNumericInput(value) {
  return value === '' || /^-?\d*\.?\d*$/.test(value);
}

export default function GradingSheetEditor({
  mode,
  scopeId,
  scopeLabel,
  canEdit = true,
  showToast,
  sections: externalSections = [],
  gradeLevels = [],
  onScopeChange,
  exportNameSuffix = ''
}) {
  const [section, setSection] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [localScope, setLocalScope] = useState(scopeId || '');

  const effectiveScope = scopeId ?? localScope;

  const loadSheet = useCallback(async () => {
    if (!effectiveScope) return;
    setLoading(true);
    const q = section ? `&section=${encodeURIComponent(section)}` : '';
    const url = mode === 'grades'
      ? `/grades/grading-sheet?databaseId=${effectiveScope}${q}`
      : `/quiz/grading-sheet?gradeLevel=${encodeURIComponent(effectiveScope)}${q}`;
    const res = await api.get(url);
    if (res.success) {
      setData(res);
    } else {
      showToast?.(res.message || 'Failed to load grading sheet', 'error');
      setData(null);
    }
    setLoading(false);
  }, [mode, effectiveScope, section, showToast]);

  useEffect(() => {
    if (effectiveScope) loadSheet();
    else setData(null);
  }, [effectiveScope, section, loadSheet]);

  useEffect(() => {
    if (scopeId) setLocalScope(scopeId);
  }, [scopeId]);

  const derivedSections = useMemo(() => {
    if (externalSections?.length) return externalSections;
    if (!data?.students) return [];
    return [...new Set(data.students.map((s) => s.section).filter(Boolean))].sort();
  }, [externalSections, data]);

  const updateActivity = (idx, field, value) => {
    setData((prev) => {
      const activities = [...(prev.activities || [])];
      activities[idx] = { ...activities[idx], [field]: value };
      return { ...prev, activities };
    });
  };

  const updateExam = (idx, field, value) => {
    setData((prev) => {
      const exams = [...(prev.exams || [])];
      exams[idx] = { ...exams[idx], [field]: value };
      return { ...prev, exams };
    });
  };

  const updateWeight = (field, value) => {
    setData((prev) => ({
      ...prev,
      weights: { ...(prev.weights || {}), [field]: value }
    }));
  };

  const updateStudentActivity = (studentIdx, key, value) => {
    setData((prev) => {
      const students = [...prev.students];
      students[studentIdx] = {
        ...students[studentIdx],
        activityScores: { ...students[studentIdx].activityScores, [key]: value }
      };
      return { ...prev, students };
    });
  };

  const updateStudentExam = (studentIdx, key, value) => {
    setData((prev) => {
      const students = [...prev.students];
      students[studentIdx] = {
        ...students[studentIdx],
        examScores: { ...students[studentIdx].examScores, [key]: value }
      };
      return { ...prev, students };
    });
  };

  const updateStudentQuiz = (studentIdx, quizId, value) => {
    setData((prev) => {
      const students = [...prev.students];
      students[studentIdx] = {
        ...students[studentIdx],
        quizScores: { ...students[studentIdx].quizScores, [quizId]: value }
      };
      return { ...prev, students };
    });
  };

  const saveSheet = async () => {
    if (!canEdit || !data) return;
    setSaving(true);
    if (mode === 'grades') {
      const scores = [];
      const examScores = [];
      (data.students || []).forEach((st) => {
        Object.entries(st.activityScores || {}).forEach(([key, score]) => {
          const [period, type, slot] = key.split('|');
          scores.push({
            studentId: st.studentId,
            period,
            scoreType: type,
            slot: Number(slot),
            score: Number(score) || 0
          });
        });
        Object.entries(st.examScores || {}).forEach(([key, score]) => {
          const [side, slot] = key.split('|');
          examScores.push({
            studentId: st.studentId,
            side,
            slot: Number(slot),
            score: Number(score) || 0
          });
        });
      });
      const w = data.weights || {};
      const res = await api.post('/grades/grading-sheet/save', {
        databaseId: Number(effectiveScope),
        weights: weightsToApiPayload(Number(effectiveScope), {
          midterm_collective: w.midtermCollective,
          final_initial: w.finalInitial,
          final_final: w.finalFinal,
          midterm_exam: w.midtermExam,
          final_exam: w.finalExam,
          pass_midterm: w.passMidterm,
          pass_initial: w.passInitial,
          pass_final: w.passFinal,
          pass_overall: w.passOverall,
          freeze_final: w.freezeFinal,
          custom_formula: w.customFormula,
          other_activities_midterm: w.otherActivitiesMidterm,
          other_activities_final: w.otherActivitiesFinal
        }),
        activityUpdates: (data.activities || []).map((a) => ({
          period: a.period,
          type: a.type,
          slot: a.slot,
          name: a.name,
          maxScore: Number(a.maxScore) || 0
        })),
        examUpdates: (data.exams || []).map((e) => ({
          side: e.side,
          slot: e.slot,
          typeName: e.typeName,
          maxScore: Number(e.maxScore) || 0
        })),
        scores,
        examScores
      });
      showToast?.(res.message || (res.success ? 'Grading sheet saved' : 'Save failed'), res.success ? 'success' : 'error');
      if (res.success) await loadSheet();
    } else {
      const scores = [];
      (data.students || []).forEach((st) => {
        Object.entries(st.quizScores || {}).forEach(([quizId, score]) => {
          if (score === '' || score == null) return;
          scores.push({
            studentId: st.studentId,
            quizId,
            score: Number(score) || 0,
            studentName: st.englishName,
            section: st.section,
            classNumber: st.classNumber
          });
        });
      });
      const res = await api.post('/quiz/grading-sheet/save', {
        gradeLevel: effectiveScope,
        scores
      });
      showToast?.(res.message || (res.success ? 'Grading sheet saved' : 'Save failed'), res.success ? 'success' : 'error');
      if (res.success) await loadSheet();
    }
    setSaving(false);
  };

  const saveQuizStudent = async (student) => {
    if (!canEdit || !student) return;
    const scores = [];
    Object.entries(student.quizScores || {}).forEach(([quizId, score]) => {
      if (score === '' || score == null) return;
      scores.push({
        quizId,
        score: Number(score) || 0,
        studentName: student.englishName,
        section: student.section,
        classNumber: student.classNumber
      });
    });
    if (!scores.length) {
      showToast?.('No scores to save for this student', 'error');
      return;
    }
    const res = await api.post('/quiz/grading-sheet/save-student', {
      gradeLevel: effectiveScope,
      studentId: student.studentId,
      scores
    });
    showToast?.(res.message || (res.success ? 'Student scores saved' : 'Save failed'), res.success ? 'success' : 'error');
    if (res.success) await loadSheet();
  };

  const exportSheet = async () => {
    try {
      const labelRaw = scopeLabel != null && String(scopeLabel).trim() !== '' ? scopeLabel : String(effectiveScope);
      const labelPart = sanitizeFilenamePart(labelRaw);
      const sectionPart = section ? sanitizeFilenamePart(section, 48) : 'all_sections';
      const suffixRaw = String(exportNameSuffix || '').trim();
      const suffixSegment = suffixRaw ? `_${sanitizeFilenamePart(suffixRaw, 48)}` : '';
      const stem = mode === 'grades' ? 'grading_sheet' : 'quiz_sheet';
      const filename = `${stem}_${labelPart}_${sectionPart}${suffixSegment}.xlsx`;

      if (mode === 'grades') {
        const q =
          `databaseId=${encodeURIComponent(String(effectiveScope))}` +
          (section ? `&section=${encodeURIComponent(section)}` : '');
        await downloadFile(`/api/grades/grading-sheet/export?${q}`, filename);
      } else {
        const q =
          `gradeLevel=${encodeURIComponent(String(effectiveScope))}` +
          (section ? `&section=${encodeURIComponent(section)}` : '');
        await downloadFile(`/api/quiz/grading-sheet/export?${q}`, filename);
      }
      showToast?.('Excel downloaded');
    } catch {
      showToast?.('Export failed', 'error');
    }
  };

  const scopeOptions = mode === 'quiz' ? gradeLevels : [];

  if (!effectiveScope && mode === 'quiz' && scopeOptions.length) {
    return (
      <div>
        <p style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>Select a grade level to open the grading sheet.</p>
        <select value={localScope} onChange={(e) => { setLocalScope(e.target.value); onScopeChange?.(e.target.value); }}>
          <option value="">Grade level…</option>
          {scopeOptions.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div>
      <Toolbar style={{ marginBottom: '1rem' }}>
        {scopeLabel && <h3 style={{ margin: 0, flex: '1 1 200px' }}>Grading Sheet — {scopeLabel}</h3>}
        {mode === 'quiz' && scopeOptions.length > 0 && (
          <select value={effectiveScope} onChange={(e) => { setLocalScope(e.target.value); onScopeChange?.(e.target.value); }}>
            {scopeOptions.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
          </select>
        )}
        <select value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All sections</option>
          {derivedSections.map((s) => <option key={s} value={s}>Section {s}</option>)}
        </select>
        <button type="button" onClick={loadSheet} className="btn btn-outline btn-sm" disabled={loading}>Refresh</button>
        <button type="button" onClick={exportSheet} className="btn btn-secondary btn-sm">Export Excel</button>
        {canEdit && (
          <button type="button" onClick={saveSheet} className="btn btn-primary btn-sm" disabled={saving || loading || !data}>
            {saving ? 'Saving…' : 'Save All'}
          </button>
        )}
        {!canEdit && <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>View only</span>}
      </Toolbar>

      {loading && <p style={{ color: 'var(--text-dim)' }}>Loading grading sheet…</p>}
      {!loading && !data && effectiveScope && <p style={{ color: 'var(--text-dim)' }}>No data for this selection.</p>}

      {!loading && data && mode === 'grades' && (
        <GradesSheetTable
          data={data}
          canEdit={canEdit}
          onWeight={updateWeight}
          onActivity={updateActivity}
          onExam={updateExam}
          onStudentActivity={updateStudentActivity}
          onStudentExam={updateStudentExam}
        />
      )}

      {!loading && data && mode === 'quiz' && (
        <QuizSheetTable
          data={data}
          canEdit={canEdit}
          onStudentQuiz={updateStudentQuiz}
          onSaveStudent={saveQuizStudent}
          saving={saving}
        />
      )}
    </div>
  );
}

function getGradeLabel(equiv) {
  if (equiv === '' || equiv == null || isNaN(equiv)) return '';
  const n = Number(equiv);
  if (n > 100) return { text: 'TOO MUCH', color: '#d63031' };
  if (n >= 80) return { text: 'Excellent — A — 4', color: '#00b894' };
  if (n >= 75) return { text: 'Very Good — AB — 3.5', color: '#00cec9' };
  if (n >= 70) return { text: 'Good — B — 3', color: '#0984e3' };
  if (n >= 65) return { text: 'Fairly Good — BC — 2.5', color: '#6c5ce7' };
  if (n >= 60) return { text: 'Fair — C — 2', color: '#fdcb6e' };
  if (n >= 55) return { text: 'Poor — CD — 1.5', color: '#e17055' };
  if (n >= 50) return { text: 'Very Poor — D — 1', color: '#d63031' };
  return { text: 'FAIL — F — F', color: '#ff0000' };
}

function CaseHeader({ num, title, bg }) {
  return (
    <th style={{ background: bg || 'rgba(108,92,231,0.08)', padding: '4px 8px', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)' }}>
      <div style={{ color: 'var(--primary)', fontSize: '0.65rem' }}>CASE {num}</div>
      <div>{title}</div>
    </th>
  );
}

function GradesSheetTable({ data, canEdit, onWeight, onActivity, onExam, onStudentActivity, onStudentExam }) {
  const w = data.weights || {};
  const activities = data.activities || [];
  const exams = data.exams || [];
  const students = data.students || [];

  const midActs = activities.filter(a => a.period === 'midterm' && a.type !== 'other');
  const midOther = activities.filter(a => a.period === 'midterm' && a.type === 'other');
  const finInitActs = activities.filter(a => a.period === 'final_initial' && a.type !== 'other');
  const finOther = activities.filter(a => a.period === 'final_initial' && a.type === 'other');
  const finFinalActs = activities.filter(a => a.period === 'final_final' && a.type !== 'other');
  const midExams = exams.filter(e => e.side === 'midterm');
  const finExams = exams.filter(e => e.side === 'final');

  const weightFields = [
    { key: 'midtermCollective', label: 'Midterm Collective %' },
    { key: 'otherActivitiesMidterm', label: 'Other Activities-Midterm %' },
    { key: 'midtermExam', label: 'Midterm Exam %' },
    { key: 'finalInitial', label: 'Final Collective-Initial %' },
    { key: 'otherActivitiesFinal', label: 'Other Activities-Final %' },
    { key: 'finalFinal', label: 'Final Collective-Final %' },
    { key: 'finalExam', label: 'Final Exam %' },
    { key: 'passMidterm', label: 'Pass Midterm' },
    { key: 'passInitial', label: 'Pass Final Initial' },
    { key: 'passFinal', label: 'Pass Final Final' },
    { key: 'passOverall', label: 'Pass Overall' }
  ];

  const computeStudentRow = (st) => {
    const score = (key) => Number(st.activityScores?.[key]) || 0;
    const eScore = (key) => Number(st.examScores?.[key]) || 0;

    // CASE 1: Midterm collective scores
    let case1Total = 0, case1Max = 0;
    midActs.forEach(a => { case1Total += score(activityKey(a.period, a.type, a.slot)); case1Max += Number(a.maxScore) || 0; });

    // CASE 2: Other Activities Midterm
    let case2Total = 0, case2Max = 0;
    midOther.forEach(a => { case2Total += score(activityKey(a.period, a.type, a.slot)); case2Max += Number(a.maxScore) || 0; });

    // CASE 3: Total & Equivalent
    const case3TotalScore = case1Total + case2Total;
    const case3TotalMax = case1Max + case2Max;
    const midCollWt = (Number(w.midtermCollective) || 0) / 100;
    const otherMidWt = (Number(w.otherActivitiesMidterm) || 0) / 100;
    const case3Equiv = case3TotalMax > 0 ? ((case3TotalScore / case3TotalMax) * (midCollWt + otherMidWt)) * 100 : 0;

    // CASE 4: Midterm Exam
    let case4Total = 0, case4Max = 0;
    midExams.forEach(e => { case4Total += eScore(examKey(e.side, e.slot)); case4Max += Number(e.maxScore) || 0; });

    // CASE 5: Midterm Exam Equivalent
    const midExamWt = (Number(w.midtermExam) || 0) / 100;
    const case5Equiv = case4Max > 0 ? ((case4Total / case4Max) * midExamWt) * 100 : 0;

    // CASE 6: Total & Remarks (Midterm)
    const case6Total = case3Equiv + case5Equiv;
    const passMidterm = Number(w.passMidterm) || 0;
    const case6Remarks = case6Total >= passMidterm ? 'PASSED' : 'FAILED';

    // CASE 7: Final Collective Initial
    let case7Total = 0, case7Max = 0;
    finInitActs.forEach(a => { case7Total += score(activityKey(a.period, a.type, a.slot)); case7Max += Number(a.maxScore) || 0; });

    // CASE 8: Other Activities Final
    let case8Total = 0, case8Max = 0;
    finOther.forEach(a => { case8Total += score(activityKey(a.period, a.type, a.slot)); case8Max += Number(a.maxScore) || 0; });

    // CASE 9: Final Collective Final
    let case9Total = 0, case9Max = 0;
    finFinalActs.forEach(a => { case9Total += score(activityKey(a.period, a.type, a.slot)); case9Max += Number(a.maxScore) || 0; });

    // CASE 10: Total & Equivalent (Final Collective Initial)
    const case10TotalScore = case7Total + case8Total;
    const case10TotalMax = case7Max + case8Max;
    const finInitWt = (Number(w.finalInitial) || 0) / 100;
    const otherFinWt = (Number(w.otherActivitiesFinal) || 0) / 100;
    const case10Equiv = case10TotalMax > 0 ? ((case10TotalScore / case10TotalMax) * (finInitWt + otherFinWt)) * 100 : 0;

    // CASE 11: Total & Equivalent (Final Collective Final)
    const finFinalWt = (Number(w.finalFinal) || 0) / 100;
    const case11Equiv = case9Max > 0 ? ((case9Total / case9Max) * finFinalWt) * 100 : 0;

    // CASE 12: Total & Remarks (Collective + Exam up to Final)
    const case12Total = case3Equiv + case5Equiv + case10Equiv + case11Equiv;
    const passFinalInit = Number(w.passInitial) || 0;
    const passFinalFin = Number(w.passFinal) || 0;
    const case12Remarks = case12Total >= (passFinalInit + passFinalFin) ? 'PASSED' : 'FAILED';

    // CASE 13: Final Exam
    let case13Total = 0, case13Max = 0;
    finExams.forEach(e => { case13Total += eScore(examKey(e.side, e.slot)); case13Max += Number(e.maxScore) || 0; });

    // CASE 14: Final Exam Equivalent
    const finExamWt = (Number(w.finalExam) || 0) / 100;
    const case14Equiv = case13Max > 0 ? ((case13Total / case13Max) * finExamWt) * 100 : 0;

    // CASE 15: Overall Total & Grade
    const case15Total = case3Equiv + case5Equiv + case10Equiv + case11Equiv + case14Equiv;
    const gradeInfo = getGradeLabel(case15Total);

    return {
      case1Total, case1Max, case2Total, case2Max,
      case3TotalScore, case3TotalMax, case3Equiv,
      case4Total, case4Max, case5Equiv,
      case6Total, case6Remarks,
      case7Total, case7Max, case8Total, case8Max, case9Total, case9Max,
      case10TotalScore, case10TotalMax, case10Equiv,
      case11Equiv, case12Total, case12Remarks,
      case13Total, case13Max, case14Equiv,
      case15Total, gradeInfo
    };
  };

  const thStyle = { minWidth: 90, background: 'rgba(108,92,231,0.08)', fontSize: '0.7rem', padding: '4px 6px' };
  const thExam = { minWidth: 90, background: 'rgba(0,206,201,0.08)', fontSize: '0.7rem', padding: '4px 6px' };
  const thCalc = { minWidth: 70, background: 'rgba(253,203,110,0.12)', fontSize: '0.7rem', padding: '4px 6px', fontWeight: 600 };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="card" style={{ marginBottom: '1rem', padding: '0.8rem' }}>
        <h4 style={{ marginBottom: '0.5rem' }}>Grading Weights</h4>
        <Toolbar>
          {weightFields.map(({ key, label }) => (
            <label key={key} style={{ fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-dim)', display: 'block' }}>{label}</span>
              <input type="number" style={{ width: 90 }} disabled={!canEdit} value={w[key] ?? ''}
                onChange={(e) => onWeight(key, parseFloat(e.target.value) || 0)} />
            </label>
          ))}
          <label style={{ fontSize: '0.8rem', alignSelf: 'flex-end' }}>
            <input type="checkbox" disabled={!canEdit} checked={Boolean(w.freezeFinal)}
              onChange={(e) => onWeight('freezeFinal', e.target.checked)} /> Freeze Final
          </label>
        </Toolbar>
      </div>

      <table style={{ fontSize: '0.75rem', minWidth: '100%', borderCollapse: 'collapse' }}>
        <thead>
          {/* CASE group headers */}
          <tr style={{ background: 'var(--bg-card)' }}>
            <th colSpan={5} style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 3 }}></th>
            {midActs.length > 0 && <CaseHeader num={1} title="Midterm Collective" />}
            {midActs.slice(1).map((_, i) => <th key={`c1p-${i}`} style={thStyle}></th>)}
            {midOther.length > 0 && <CaseHeader num={2} title="Other Act. Midterm" />}
            {midOther.slice(1).map((_, i) => <th key={`c2p-${i}`} style={thStyle}></th>)}
            <CaseHeader num={3} title="Total" />
            <th style={thCalc}>Equiv</th>
            {midExams.length > 0 && <CaseHeader num={4} title="Midterm Exam" />}
            {midExams.slice(1).map((_, i) => <th key={`c4p-${i}`} style={thExam}></th>)}
            <CaseHeader num={5} title="Equiv" />
            <CaseHeader num={6} title="Total" />
            <th style={thCalc}>Remarks</th>
            {finInitActs.length > 0 && <CaseHeader num={7} title="Final Init." />}
            {finInitActs.slice(1).map((_, i) => <th key={`c7p-${i}`} style={thStyle}></th>)}
            {finOther.length > 0 && <CaseHeader num={8} title="Other Act. Final" />}
            {finOther.slice(1).map((_, i) => <th key={`c8p-${i}`} style={thStyle}></th>)}
            {finFinalActs.length > 0 && <CaseHeader num={9} title="Final Final" />}
            {finFinalActs.slice(1).map((_, i) => <th key={`c9p-${i}`} style={thStyle}></th>)}
            <CaseHeader num={10} title="Total" />
            <th style={thCalc}>Equiv</th>
            <CaseHeader num={11} title="Total" />
            <th style={thCalc}>Equiv</th>
            <CaseHeader num={12} title="Total" />
            <th style={thCalc}>Remarks</th>
            {finExams.length > 0 && <CaseHeader num={13} title="Final Exam" />}
            {finExams.slice(1).map((_, i) => <th key={`c13p-${i}`} style={thExam}></th>)}
            <CaseHeader num={14} title="Equiv" />
            <CaseHeader num={15} title="Total" />
            <th style={{ ...thCalc, minWidth: 140 }}>Grade</th>
          </tr>
          {/* Column detail headers */}
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>ID</th>
            <th>Thai Name</th><th>English Name</th><th>Section</th><th>#</th>
            {midActs.map((a, i) => (
              <th key={`ma-${i}`} style={thStyle}>
                <input style={{ width: '100%', fontSize: '0.7rem' }} disabled={!canEdit} value={a.name || ''} placeholder={`Slot ${a.slot + 1}`}
                  onChange={(e) => onActivity(activities.indexOf(a), 'name', e.target.value)} />
                <div style={{ fontSize: '0.65rem' }}>Max: <input type="number" style={{ width: 40 }} disabled={!canEdit} value={a.maxScore ?? ''}
                  onChange={(e) => onActivity(activities.indexOf(a), 'maxScore', parseFloat(e.target.value) || 0)} /></div>
              </th>
            ))}
            {midOther.map((a, i) => (
              <th key={`mo-${i}`} style={thStyle}>
                <input style={{ width: '100%', fontSize: '0.7rem' }} disabled={!canEdit} value={a.name || ''} placeholder={`Other ${a.slot + 1}`}
                  onChange={(e) => onActivity(activities.indexOf(a), 'name', e.target.value)} />
                <div style={{ fontSize: '0.65rem' }}>Max: <input type="number" style={{ width: 40 }} disabled={!canEdit} value={a.maxScore ?? ''}
                  onChange={(e) => onActivity(activities.indexOf(a), 'maxScore', parseFloat(e.target.value) || 0)} /></div>
              </th>
            ))}
            <th style={thCalc}>Total</th><th style={thCalc}>Equiv</th>
            {midExams.map((e, i) => (
              <th key={`me-${i}`} style={thExam}>
                <input style={{ width: '100%', fontSize: '0.7rem' }} disabled={!canEdit} value={e.typeName || ''} placeholder={`Exam ${e.slot + 1}`}
                  onChange={(ev) => onExam(exams.indexOf(e), 'typeName', ev.target.value)} />
                <div style={{ fontSize: '0.65rem' }}>Max: <input type="number" style={{ width: 40 }} disabled={!canEdit} value={e.maxScore ?? ''}
                  onChange={(ev) => onExam(exams.indexOf(e), 'maxScore', parseFloat(ev.target.value) || 0)} /></div>
              </th>
            ))}
            <th style={thCalc}>Equiv</th>
            <th style={thCalc}>Total</th><th style={thCalc}>Result</th>
            {finInitActs.map((a, i) => (
              <th key={`fi-${i}`} style={thStyle}>
                <input style={{ width: '100%', fontSize: '0.7rem' }} disabled={!canEdit} value={a.name || ''} placeholder={`Slot ${a.slot + 1}`}
                  onChange={(e) => onActivity(activities.indexOf(a), 'name', e.target.value)} />
                <div style={{ fontSize: '0.65rem' }}>Max: <input type="number" style={{ width: 40 }} disabled={!canEdit} value={a.maxScore ?? ''}
                  onChange={(e) => onActivity(activities.indexOf(a), 'maxScore', parseFloat(e.target.value) || 0)} /></div>
              </th>
            ))}
            {finOther.map((a, i) => (
              <th key={`fo-${i}`} style={thStyle}>
                <input style={{ width: '100%', fontSize: '0.7rem' }} disabled={!canEdit} value={a.name || ''} placeholder={`Other ${a.slot + 1}`}
                  onChange={(e) => onActivity(activities.indexOf(a), 'name', e.target.value)} />
                <div style={{ fontSize: '0.65rem' }}>Max: <input type="number" style={{ width: 40 }} disabled={!canEdit} value={a.maxScore ?? ''}
                  onChange={(e) => onActivity(activities.indexOf(a), 'maxScore', parseFloat(e.target.value) || 0)} /></div>
              </th>
            ))}
            {finFinalActs.map((a, i) => (
              <th key={`ff-${i}`} style={thStyle}>
                <input style={{ width: '100%', fontSize: '0.7rem' }} disabled={!canEdit} value={a.name || ''} placeholder={`Slot ${a.slot + 1}`}
                  onChange={(e) => onActivity(activities.indexOf(a), 'name', e.target.value)} />
                <div style={{ fontSize: '0.65rem' }}>Max: <input type="number" style={{ width: 40 }} disabled={!canEdit} value={a.maxScore ?? ''}
                  onChange={(e) => onActivity(activities.indexOf(a), 'maxScore', parseFloat(e.target.value) || 0)} /></div>
              </th>
            ))}
            <th style={thCalc}>Total</th><th style={thCalc}>Equiv</th>
            <th style={thCalc}>Total</th><th style={thCalc}>Equiv</th>
            <th style={thCalc}>Total</th><th style={thCalc}>Result</th>
            {finExams.map((e, i) => (
              <th key={`fe-${i}`} style={thExam}>
                <input style={{ width: '100%', fontSize: '0.7rem' }} disabled={!canEdit} value={e.typeName || ''} placeholder={`Exam ${e.slot + 1}`}
                  onChange={(ev) => onExam(exams.indexOf(e), 'typeName', ev.target.value)} />
                <div style={{ fontSize: '0.65rem' }}>Max: <input type="number" style={{ width: 40 }} disabled={!canEdit} value={e.maxScore ?? ''}
                  onChange={(ev) => onExam(exams.indexOf(e), 'maxScore', parseFloat(ev.target.value) || 0)} /></div>
              </th>
            ))}
            <th style={thCalc}>Equiv</th>
            <th style={thCalc}>Total</th>
            <th style={{ ...thCalc, minWidth: 140 }}>Grade</th>
          </tr>
        </thead>
        <tbody>
          {students.map((st, si) => {
            const r = computeStudentRow(st);
            return (
              <tr key={st.studentId}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', fontWeight: 600 }}>{st.studentId}</td>
                <td>{st.thaiName}</td>
                <td>{st.englishName}</td>
                <td>{st.section}</td>
                <td>{st.classNumber}</td>
                {/* CASE 1 */}
                {midActs.map(a => {
                  const key = activityKey(a.period, a.type, a.slot);
                  return <td key={key}><input type="text" inputMode="decimal" style={{ width: 48 }} disabled={!canEdit} value={st.activityScores?.[key] ?? ''}
                    onChange={e => { if (isNumericInput(e.target.value)) onStudentActivity(si, key, e.target.value); }} /></td>;
                })}
                {/* CASE 2 */}
                {midOther.map(a => {
                  const key = activityKey(a.period, a.type, a.slot);
                  return <td key={key}><input type="text" inputMode="decimal" style={{ width: 48 }} disabled={!canEdit} value={st.activityScores?.[key] ?? ''}
                    onChange={e => { if (isNumericInput(e.target.value)) onStudentActivity(si, key, e.target.value); }} /></td>;
                })}
                {/* CASE 3 */}
                <td style={{ fontWeight: 600, background: 'rgba(253,203,110,0.06)' }}>{r.case3TotalScore}/{r.case3TotalMax}</td>
                <td style={{ fontWeight: 600, background: 'rgba(253,203,110,0.06)' }}>{r.case3Equiv.toFixed(1)}</td>
                {/* CASE 4 */}
                {midExams.map(e => {
                  const key = examKey(e.side, e.slot);
                  return <td key={key}><input type="text" inputMode="decimal" style={{ width: 48 }} disabled={!canEdit} value={st.examScores?.[key] ?? ''}
                    onChange={ev => { if (isNumericInput(ev.target.value)) onStudentExam(si, key, ev.target.value); }} /></td>;
                })}
                {/* CASE 5 */}
                <td style={{ fontWeight: 600, background: 'rgba(0,206,201,0.06)' }}>{r.case5Equiv.toFixed(1)}</td>
                {/* CASE 6 */}
                <td style={{ fontWeight: 600 }}>{r.case6Total.toFixed(1)}</td>
                <td style={{ fontWeight: 700, color: r.case6Remarks === 'PASSED' ? '#00b894' : '#d63031' }}>{r.case6Remarks}</td>
                {/* CASE 7 */}
                {finInitActs.map(a => {
                  const key = activityKey(a.period, a.type, a.slot);
                  return <td key={key}><input type="text" inputMode="decimal" style={{ width: 48 }} disabled={!canEdit} value={st.activityScores?.[key] ?? ''}
                    onChange={e => { if (isNumericInput(e.target.value)) onStudentActivity(si, key, e.target.value); }} /></td>;
                })}
                {/* CASE 8 */}
                {finOther.map(a => {
                  const key = activityKey(a.period, a.type, a.slot);
                  return <td key={key}><input type="text" inputMode="decimal" style={{ width: 48 }} disabled={!canEdit} value={st.activityScores?.[key] ?? ''}
                    onChange={e => { if (isNumericInput(e.target.value)) onStudentActivity(si, key, e.target.value); }} /></td>;
                })}
                {/* CASE 9 */}
                {finFinalActs.map(a => {
                  const key = activityKey(a.period, a.type, a.slot);
                  return <td key={key}><input type="text" inputMode="decimal" style={{ width: 48 }} disabled={!canEdit} value={st.activityScores?.[key] ?? ''}
                    onChange={e => { if (isNumericInput(e.target.value)) onStudentActivity(si, key, e.target.value); }} /></td>;
                })}
                {/* CASE 10 */}
                <td style={{ fontWeight: 600, background: 'rgba(253,203,110,0.06)' }}>{r.case10TotalScore}/{r.case10TotalMax}</td>
                <td style={{ fontWeight: 600, background: 'rgba(253,203,110,0.06)' }}>{r.case10Equiv.toFixed(1)}</td>
                {/* CASE 11 */}
                <td style={{ fontWeight: 600, background: 'rgba(253,203,110,0.06)' }}>{r.case9Total}/{r.case9Max}</td>
                <td style={{ fontWeight: 600, background: 'rgba(253,203,110,0.06)' }}>{r.case11Equiv.toFixed(1)}</td>
                {/* CASE 12 */}
                <td style={{ fontWeight: 600 }}>{r.case12Total.toFixed(1)}</td>
                <td style={{ fontWeight: 700, color: r.case12Remarks === 'PASSED' ? '#00b894' : '#d63031' }}>{r.case12Remarks}</td>
                {/* CASE 13 */}
                {finExams.map(e => {
                  const key = examKey(e.side, e.slot);
                  return <td key={key}><input type="text" inputMode="decimal" style={{ width: 48 }} disabled={!canEdit} value={st.examScores?.[key] ?? ''}
                    onChange={ev => { if (isNumericInput(ev.target.value)) onStudentExam(si, key, ev.target.value); }} /></td>;
                })}
                {/* CASE 14 */}
                <td style={{ fontWeight: 600, background: 'rgba(0,206,201,0.06)' }}>{r.case14Equiv.toFixed(1)}</td>
                {/* CASE 15 */}
                <td style={{ fontWeight: 700 }}>{r.case15Total.toFixed(1)}</td>
                <td style={{ fontWeight: 700, color: r.gradeInfo?.color || 'var(--text)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{r.gradeInfo?.text || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {students.length === 0 && <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>No students in this section.</p>}
    </div>
  );
}

function QuizSheetTable({ data, canEdit, onStudentQuiz, onSaveStudent, saving }) {
  const quizzes = data.quizzes || [];
  const students = data.students || [];

  return (
    <div style={{ overflowX: 'auto' }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
        {data.weights?.note || 'Scores are percentages (0–100). Passing % shown per quiz.'}
      </p>
      <table style={{ fontSize: '0.8rem' }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)' }}>Student ID</th>
            <th>English</th>
            <th>Section</th>
            <th>#</th>
            <th>Grade</th>
            {canEdit && <th>Action</th>}
            {quizzes.map((q) => (
              <th key={q.id} style={{ minWidth: 100 }}>
                <div style={{ fontWeight: 600 }}>{q.title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{q.type} · pass {q.passingScore}%</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((st, si) => (
            <tr key={st.studentId}>
              <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', fontWeight: 600 }}>{st.studentId}</td>
              <td>{st.englishName}</td>
              <td>{st.section}</td>
              <td>{st.classNumber}</td>
              <td>{st.gradeLevel}</td>
              {canEdit && (
                <td>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={saving}
                    onClick={() => onSaveStudent?.(st)}
                  >
                    Save
                  </button>
                </td>
              )}
              {quizzes.map((q) => (
                <td key={q.id}>
                  <input type="text" inputMode="decimal" style={{ width: 56 }} disabled={!canEdit}
                    value={st.quizScores?.[q.id] ?? ''}
                    onChange={(e) => {
                      if (!isNumericInput(e.target.value)) return;
                      onStudentQuiz(si, q.id, e.target.value);
                    }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {students.length === 0 && <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>No students for this grade level.</p>}
    </div>
  );
}
