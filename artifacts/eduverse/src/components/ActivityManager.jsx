import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const PERIODS = [
  { value: 'midterm', label: 'Midterm Collective' },
  { value: 'final_initial', label: 'Final Initial' },
  { value: 'final_final', label: 'Final Final' },
];
const SLOTS = [0, 1, 2, 3, 4];

export default function ActivityManager({ databaseId, databaseName, sections, showToast, canEdit }) {
  const [activityTab, setActivityTab] = useState('individual');
  const [activities, setActivities] = useState([]);
  const [addForm, setAddForm] = useState({ name: '', period: 'midterm', slot: 0, maxScore: 100 });
  const [editingKey, setEditingKey] = useState(null); // 'period|type|slot'
  const [scoreSection, setScoreSection] = useState('');
  const [studentScores, setStudentScores] = useState([]);
  const [localScores, setLocalScores] = useState({});
  const [groups, setGroups] = useState([]);
  const [groupScores, setGroupScores] = useState({});
  const [saving, setSaving] = useState(false);
  const [loadingScores, setLoadingScores] = useState(false);

  const currentType = activityTab;
  const filteredActivities = activities.filter((a) => a.type === currentType);

  const usedSlotsForPeriod = useCallback(
    (period) => new Set(activities.filter((a) => a.period === period && a.type === currentType).map((a) => a.slot)),
    [activities, currentType]
  );

  const loadActivities = useCallback(async () => {
    if (!databaseId) return;
    const res = await api.get(`/grades/activity-config/list?databaseId=${databaseId}`);
    if (res.success) setActivities(res.activities || []);
    else showToast?.(res.message || 'Failed to load activities', 'error');
  }, [databaseId, showToast]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const parseEditingKey = (key) => {
    if (!key) return null;
    const [period, type, slotStr] = key.split('|');
    return { period, type, slot: Number(slotStr) };
  };

  const loadScores = useCallback(async () => {
    const act = parseEditingKey(editingKey);
    if (!act || !databaseId) return;
    setLoadingScores(true);
    const q = scoreSection ? `&section=${encodeURIComponent(scoreSection)}` : '';
    const res = await api.get(
      `/grades/activity-scores?databaseId=${databaseId}&period=${act.period}&type=${act.type}&slot=${act.slot}${q}`
    );
    if (res.success) {
      setStudentScores(res.students || []);
      const m = {};
      (res.students || []).forEach((s) => { m[s.studentId] = s.score === '' ? '' : String(s.score); });
      setLocalScores(m);
    } else {
      showToast?.(res.message || 'Failed to load scores', 'error');
    }
    setLoadingScores(false);
  }, [editingKey, databaseId, scoreSection, showToast]);

  useEffect(() => { if (editingKey) loadScores(); }, [loadScores]);

  const loadGroups = useCallback(async () => {
    const act = parseEditingKey(editingKey);
    if (!act || act.type !== 'group' || !scoreSection || !databaseId) return;
    const res = await api.get(
      `/grades/activity-groups/for-activity?databaseId=${databaseId}&section=${encodeURIComponent(scoreSection)}&period=${act.period}&slot=${act.slot}`
    );
    if (res.success) setGroups(res.groups || []);
  }, [editingKey, databaseId, scoreSection]);

  useEffect(() => { if (editingKey && activityTab === 'group') loadGroups(); }, [loadGroups]);

  const handleAddActivity = async () => {
    if (!canEdit) { showToast?.('View only — cannot add activities', 'error'); return; }
    const { name, period, slot, maxScore } = addForm;
    if (!name.trim()) { showToast?.('Activity name is required', 'error'); return; }
    if (usedSlotsForPeriod(period).has(Number(slot))) {
      if (!confirm(`Slot ${Number(slot) + 1} in this period already has an activity. Overwrite it?`)) return;
    }
    const res = await api.post('/grades/activity-config/upsert', {
      databaseId, period, type: currentType,
      slot: Number(slot), name: name.trim(), maxScore: Number(maxScore) || 0,
    });
    showToast?.(res.message || (res.success ? 'Activity added' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) {
      await loadActivities();
      setAddForm({ name: '', period: 'midterm', slot: 0, maxScore: 100 });
    }
  };

  const handleDeleteActivity = async (act) => {
    if (!canEdit) { showToast?.('View only — cannot delete activities', 'error'); return; }
    const label = act.name ? `"${act.name}"` : `Slot ${act.slot + 1}`;
    if (!confirm(`Delete activity ${label} and ALL its scores? This cannot be undone.`)) return;
    const res = await api.del(
      `/grades/activity-config/delete?databaseId=${databaseId}&period=${act.period}&type=${act.type}&slot=${act.slot}`
    );
    showToast?.(res.message || (res.success ? 'Deleted' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) {
      await loadActivities();
      const key = `${act.period}|${act.type}|${act.slot}`;
      if (editingKey === key) { setEditingKey(null); setStudentScores([]); setGroups([]); }
    }
  };

  const handleSaveScores = async () => {
    if (!canEdit || !editingKey) return;
    const act = parseEditingKey(editingKey);
    setSaving(true);
    const scores = Object.entries(localScores).map(([studentId, score]) => ({
      studentId, score: Number(score) || 0,
    }));
    const res = await api.post('/grades/activity-scores/save', {
      databaseId, period: act.period, type: act.type, slot: act.slot, scores,
    });
    showToast?.(res.message || (res.success ? 'Scores saved' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadScores();
    setSaving(false);
  };

  const handleAutoGenerateGroups = async () => {
    if (!canEdit || !editingKey || !scoreSection) return;
    const act = parseEditingKey(editingKey);
    const countStr = prompt('How many groups to create?', '4');
    const groupCount = parseInt(countStr, 10);
    if (!groupCount || groupCount < 1) return;
    const res = await api.post('/grades/groups/auto', {
      databaseId, section: scoreSection, period: act.period,
      activityNumber: act.slot, groupCount,
    });
    showToast?.(res.message || (res.success ? 'Groups generated' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadGroups();
  };

  const handleImportFromModeB = async () => {
    if (!canEdit || !editingKey || !scoreSection) return;
    const act = parseEditingKey(editingKey);
    const gradeLevel = prompt('Enter grade level (optional, leave blank to search all):', '') || '';
    const res = await api.post('/grades/activity-groups/import-mode-b', {
      databaseId, section: scoreSection, period: act.period, slot: act.slot,
      gradeLevel: gradeLevel.trim() || undefined,
    });
    showToast?.(res.message || (res.success ? 'Groups imported' : 'Not found'), res.success ? 'success' : 'error');
    if (res.success) await loadGroups();
  };

  const handleApplyGroupScore = async (groupNumber) => {
    if (!canEdit || !editingKey || !scoreSection) return;
    const act = parseEditingKey(editingKey);
    const score = groupScores[groupNumber];
    if (score === undefined || score === '') { showToast?.('Enter a score first', 'error'); return; }
    const res = await api.post('/grades/activity-groups/apply-score', {
      databaseId, section: scoreSection, period: act.period,
      slot: act.slot, groupNumber, score: Number(score) || 0,
    });
    showToast?.(res.message || (res.success ? 'Score applied to all members' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadScores();
  };

  const toggleActivity = (act) => {
    const key = `${act.period}|${act.type}|${act.slot}`;
    if (editingKey === key) {
      setEditingKey(null);
      setStudentScores([]);
      setGroups([]);
    } else {
      setEditingKey(key);
      setScoreSection(sections[0] || '');
      setStudentScores([]);
      setGroups([]);
      setGroupScores({});
    }
  };

  const periodLabel = (p) => PERIODS.find((x) => x.value === p)?.label || p;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => { setActivityTab('individual'); setEditingKey(null); setStudentScores([]); setGroups([]); }}
          className={`btn btn-sm ${activityTab === 'individual' ? 'btn-primary' : 'btn-outline'}`}>
          Individual Activities
        </button>
        <button
          onClick={() => { setActivityTab('group'); setEditingKey(null); setStudentScores([]); setGroups([]); }}
          className={`btn btn-sm ${activityTab === 'group' ? 'btn-primary' : 'btn-outline'}`}>
          Group Activities
        </button>
      </div>

      {canEdit && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ marginBottom: '0.8rem', color: 'var(--text-bright)' }}>
            Add {activityTab === 'individual' ? 'Individual' : 'Group'} Activity
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <div>
              <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem', display: 'block', marginBottom: '0.2rem' }}>
                Activity Name
              </label>
              <input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="e.g. Activity 1"
                onKeyDown={(e) => e.key === 'Enter' && handleAddActivity()}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem', display: 'block', marginBottom: '0.2rem' }}>Period</label>
              <select value={addForm.period} onChange={(e) => setAddForm({ ...addForm, period: e.target.value })} style={{ width: '100%' }}>
                {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem', display: 'block', marginBottom: '0.2rem' }}>Slot (1–5)</label>
              <select value={addForm.slot} onChange={(e) => setAddForm({ ...addForm, slot: Number(e.target.value) })} style={{ width: '100%' }}>
                {SLOTS.map((s) => {
                  const occupied = usedSlotsForPeriod(addForm.period).has(s);
                  return <option key={s} value={s}>{`Slot ${s + 1}${occupied ? ' ★ taken' : ''}`}</option>;
                })}
              </select>
            </div>
            <div>
              <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem', display: 'block', marginBottom: '0.2rem' }}>Perfect Score</label>
              <input
                type="number" min={0}
                value={addForm.maxScore}
                onChange={(e) => setAddForm({ ...addForm, maxScore: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <button onClick={handleAddActivity} className="btn btn-primary btn-sm">Add Activity</button>
        </div>
      )}

      {filteredActivities.length === 0 ? (
        <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>
          No {activityTab} activities yet.{canEdit ? ' Add one above to get started.' : ''}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          {filteredActivities.map((act) => {
            const key = `${act.period}|${act.type}|${act.slot}`;
            const isOpen = editingKey === key;
            return (
              <div key={key} className="card" style={{ borderColor: isOpen ? 'var(--primary)' : 'var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <strong style={{ color: 'var(--text-bright)' }}>{act.name || '(unnamed)'}</strong>
                    <span style={{ marginLeft: '0.8rem', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                      {periodLabel(act.period)} · Slot {act.slot + 1} · Perfect score: {act.maxScore}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      onClick={() => toggleActivity(act)}
                      className={`btn btn-sm ${isOpen ? 'btn-primary' : 'btn-outline'}`}>
                      {isOpen ? 'Close' : activityTab === 'group' ? 'Groups & Scores' : 'Edit Scores'}
                    </button>
                    {canEdit && (
                      <button onClick={() => handleDeleteActivity(act)} className="btn btn-danger btn-sm">Delete</button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.8rem' }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginRight: '0.3rem' }}>Section:</span>
                      {sections.map((s) => (
                        <button
                          key={s}
                          onClick={() => { setScoreSection(s); setStudentScores([]); setGroups([]); setGroupScores({}); }}
                          className={`btn btn-sm ${scoreSection === s ? 'btn-primary' : 'btn-outline'}`}>
                          {s}
                        </button>
                      ))}
                    </div>

                    {activityTab === 'group' && scoreSection && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                          <button onClick={handleAutoGenerateGroups} className="btn btn-outline btn-sm" disabled={!canEdit}>
                            Auto-Generate Groups
                          </button>
                          <button onClick={handleImportFromModeB} className="btn btn-outline btn-sm" disabled={!canEdit}>
                            Import Groups from Mode B
                          </button>
                        </div>
                        {groups.length > 0 ? (
                          <>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                              Enter a score for each group and click Apply — it sets that score for every member.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
                              {groups.map((g) => (
                                <div
                                  key={g.groupNumber}
                                  style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.7rem', border: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-bright)' }}>Group {g.groupNumber}</strong>
                                    <input
                                      type="number" min={0} max={act.maxScore}
                                      value={groupScores[g.groupNumber] ?? ''}
                                      onChange={(e) => setGroupScores({ ...groupScores, [g.groupNumber]: e.target.value })}
                                      placeholder={`/ ${act.maxScore}`}
                                      style={{ width: 70, marginLeft: 'auto', fontSize: '0.85rem' }}
                                      disabled={!canEdit}
                                    />
                                    <button
                                      onClick={() => handleApplyGroupScore(g.groupNumber)}
                                      className="btn btn-secondary btn-sm"
                                      disabled={!canEdit}
                                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                      Apply
                                    </button>
                                  </div>
                                  {g.members.map((m) => (
                                    <div key={m.studentId} style={{ fontSize: '0.78rem', color: 'var(--text-dim)', padding: '0.1rem 0' }}>
                                      {m.classNumber ? `#${m.classNumber} ` : ''}{m.englishName || m.studentId}
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                            <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                              Individual score overrides (edit any student score directly):
                            </div>
                          </>
                        ) : (
                          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
                            No groups for Section {scoreSection} yet. Auto-generate or import from Mode B.
                          </p>
                        )}
                      </div>
                    )}

                    {scoreSection ? (
                      loadingScores ? (
                        <div className="loading"><div className="spinner" /></div>
                      ) : (
                        <>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ fontSize: '0.85rem' }}>
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Student ID</th>
                                  <th>Name</th>
                                  <th>Score / {act.maxScore}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {studentScores.length === 0 && (
                                  <tr><td colSpan={4} style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '1rem' }}>No students in this section</td></tr>
                                )}
                                {studentScores.map((st) => (
                                  <tr key={st.studentId}>
                                    <td style={{ color: 'var(--text-dim)' }}>{st.classNumber}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{st.studentId}</td>
                                    <td>{st.englishName || st.thaiName}</td>
                                    <td>
                                      <input
                                        type="number" min={0} max={act.maxScore}
                                        value={localScores[st.studentId] ?? ''}
                                        onChange={(e) => setLocalScores({ ...localScores, [st.studentId]: e.target.value })}
                                        style={{ width: 80 }}
                                        disabled={!canEdit}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {canEdit && studentScores.length > 0 && (
                            <button
                              onClick={handleSaveScores}
                              className="btn btn-primary btn-sm"
                              style={{ marginTop: '0.8rem' }}
                              disabled={saving}>
                              {saving ? 'Saving…' : 'Save All Scores'}
                            </button>
                          )}
                        </>
                      )
                    ) : (
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                        Select a section above to view and edit student scores.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
