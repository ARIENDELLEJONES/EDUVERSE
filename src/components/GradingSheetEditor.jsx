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
          custom_formula: w.customFormula
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

function GradesSheetTable({ data, canEdit, onWeight, onActivity, onExam, onStudentActivity, onStudentExam }) {
  const w = data.weights || {};
  const activities = data.activities || [];
  const exams = data.exams || [];
  const students = data.students || [];

  const weightFields = [
    { key: 'midtermCollective', label: 'Midterm Collective %' },
    { key: 'finalInitial', label: 'Final Initial %' },
    { key: 'finalFinal', label: 'Final Final %' },
    { key: 'midtermExam', label: 'Midterm Exam %' },
    { key: 'finalExam', label: 'Final Exam %' },
    { key: 'passMidterm', label: 'Pass Midterm' },
    { key: 'passInitial', label: 'Pass Initial' },
    { key: 'passFinal', label: 'Pass Final' },
    { key: 'passOverall', label: 'Pass Overall' }
  ];

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
        <div style={{ marginTop: 8 }}>
          <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '0.75rem' }}>Custom Formula (optional)</span>
          <input
            type="text"
            style={{ width: '100%' }}
            disabled={!canEdit}
            value={w.customFormula ?? ''}
            onChange={(e) => onWeight('customFormula', e.target.value)}
            placeholder="Use variables: midtermCollective, finalInitial, finalFinal, midtermExam, finalExam"
          />
        </div>
      </div>

      <table style={{ fontSize: '0.8rem', minWidth: '100%' }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Student ID</th>
            <th rowSpan={2}>Thai</th>
            <th rowSpan={2}>English</th>
            <th rowSpan={2}>Section</th>
            <th rowSpan={2}>#</th>
            {activities.map((a, i) => (
              <th key={`a-${i}`} style={{ minWidth: 120, background: 'rgba(108,92,231,0.08)' }}>
                <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{PERIOD_LABELS[a.period] || a.period}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{a.type} · slot {a.slot + 1}</div>
                <input style={{ width: '100%', marginTop: 2 }} disabled={!canEdit} value={a.name || ''} placeholder="Activity name"
                  onChange={(e) => onActivity(i, 'name', e.target.value)} />
                <div style={{ fontSize: '0.7rem' }}>Perfect:
                  <input type="number" style={{ width: 48, marginLeft: 4 }} disabled={!canEdit} value={a.maxScore ?? ''}
                    onChange={(e) => onActivity(i, 'maxScore', parseFloat(e.target.value) || 0)} />
                </div>
              </th>
            ))}
            {exams.map((e, i) => (
              <th key={`e-${i}`} style={{ minWidth: 110, background: 'rgba(0,206,201,0.08)' }}>
                <div>{String(e.side || '').toUpperCase()} Exam {e.slot + 1}</div>
                <input style={{ width: '100%', marginTop: 2 }} disabled={!canEdit} value={e.typeName || ''} placeholder="Exam name"
                  onChange={(ev) => onExam(i, 'typeName', ev.target.value)} />
                <div style={{ fontSize: '0.7rem' }}>Perfect:
                  <input type="number" style={{ width: 48 }} disabled={!canEdit} value={e.maxScore ?? ''}
                    onChange={(ev) => onExam(i, 'maxScore', parseFloat(ev.target.value) || 0)} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((st, si) => (
            <tr key={st.studentId}>
              <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', fontWeight: 600 }}>{st.studentId}</td>
              <td>{st.thaiName}</td>
              <td>{st.englishName}</td>
              <td>{st.section}</td>
              <td>{st.classNumber}</td>
              {activities.map((a) => {
                const key = activityKey(a.period, a.type, a.slot);
                return (
                  <td key={key}>
                    <input type="text" inputMode="decimal" style={{ width: 56 }} disabled={!canEdit}
                      value={st.activityScores?.[key] ?? ''}
                      onChange={(e) => {
                        if (!isNumericInput(e.target.value)) return;
                        onStudentActivity(si, key, e.target.value);
                      }} />
                  </td>
                );
              })}
              {exams.map((e) => {
                const key = examKey(e.side, e.slot);
                return (
                  <td key={key}>
                    <input type="text" inputMode="decimal" style={{ width: 56 }} disabled={!canEdit}
                      value={st.examScores?.[key] ?? ''}
                      onChange={(ev) => {
                        if (!isNumericInput(ev.target.value)) return;
                        onStudentExam(si, key, ev.target.value);
                      }} />
                  </td>
                );
              })}
            </tr>
          ))}
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
