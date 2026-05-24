import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, downloadFile } from '../api';
import { KahootHostView } from './KahootGame';
import GradingSheetEditor from '../components/GradingSheetEditor';

const QUESTION_TYPES = [
  { id: 'MCQ', label: 'Multiple Choice (A-D)' },
  { id: 'TF', label: 'True / False' },
  { id: 'MATCHING', label: 'Matching' },
  { id: 'MULTIPLE_RESPONSE', label: 'Multiple Response' },
  { id: 'SEQUENCING', label: 'Sequencing' },
  { id: 'RATING_GRID', label: 'Rating Grid' },
  { id: 'WORD_HUNT', label: 'Word Hunt' },
];

function StatusBadge({ status }) {
  const map = {
    NOT_STARTED: { label: 'Not Started', cls: 'badge-warning' },
    IN_PROGRESS: { label: 'In Progress', cls: 'badge-info' },
    COMPLETED: { label: 'Completed', cls: 'badge-success' },
    BLOCKED: { label: 'Blocked', cls: 'badge-danger' },
  };
  const s = map[status] || { label: status, cls: 'badge-warning' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '0.8rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{label}</p>
      <p style={{ color: 'var(--text-bright)', fontSize: '1.3rem', fontWeight: 700 }}>{value}</p>
    </div>
  );
}

export default function QuizTeacherDashboard({ user, onLogout, showToast }) {
  // ── Existing state ─────────────────────────────────────────────
  const [tab, setTab] = useState('quizzes');
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [quizResults, setQuizResults] = useState(null);
  const [retakeRequests, setRetakeRequests] = useState([]);
  const [deadlineRequests, setDeadlineRequests] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [studentDbs, setStudentDbs] = useState([]);
  const [showLiveGame, setShowLiveGame] = useState(false);
  const [sheetGradeLevel, setSheetGradeLevel] = useState('');
  const [importGradeLevel, setImportGradeLevel] = useState('');
  const [teamGroups, setTeamGroups] = useState([]);
  const [teamOverview, setTeamOverview] = useState({ groups: [], unassigned: [] });
  const [teamGradeLevel, setTeamGradeLevel] = useState('');
  const [teamSection, setTeamSection] = useState('');
  const [teamGroupCount, setTeamGroupCount] = useState(4);
  const [dragOverGroup, setDragOverGroup] = useState(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [scoreMappings, setScoreMappings] = useState([]);
  const [recordEntries, setRecordEntries] = useState({ quizAttempts: [], liveGames: [] });
  const [mappingForm, setMappingForm] = useState({ gradeLevel: '', targetDatabaseId: '', period: 'midterm', scoreType: 'individual', slot: 0, sourceType: 'QUIZ_ATTEMPT', sourceQuizId: '', applyMode: 'BEST' });
  const [gradeDatabases, setGradeDatabases] = useState([]);
  const [reviewAttempt, setReviewAttempt] = useState(null);
  const [slotHints, setSlotHints] = useState(null);

  // ── Quiz create/edit form state ─────────────────────────────────
  const defaultForm = { title: '', type: 'QUIZ', period: 'midterm', subject: '', passingScore: 50, attemptsAllowed: 1, timeLimit: 0, retakeAllowed: 'NO', randomizeQuestions: 'NO', randomizeChoices: 'NO', startDate: '', deadline: '', gradeLevels: [], questions: [], strictMode: false };
  const [form, setForm] = useState(defaultForm);
  const [questionForm, setQuestionForm] = useState({ questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1 });

  // ── New: Create flow ────────────────────────────────────────────
  const [createStep, setCreateStep] = useState(1);
  const [quizMode, setQuizMode] = useState('NORMAL_QUIZ');

  // ── New: Edit quiz ──────────────────────────────────────────────
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [editForm, setEditForm] = useState(defaultForm);
  const [editQForm, setEditQForm] = useState({ questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1 });

  // ── New: View Sections ──────────────────────────────────────────
  const [viewSectionsQuiz, setViewSectionsQuiz] = useState(null);
  const [viewSectionsData, setViewSectionsData] = useState(null);
  const [viewSectionsFilter, setViewSectionsFilter] = useState('ALL');
  const sectionsIntervalRef = useRef(null);

  // ── New: Normal Quiz 7 question types ──────────────────────────
  const [normalQType, setNormalQType] = useState('MCQ');
  const [matchingPairs, setMatchingPairs] = useState([{ left: '', right: '' }]);
  const [multiChoices, setMultiChoices] = useState(['', '', '', '']);
  const [multiCorrect, setMultiCorrect] = useState([]);
  const [seqItems, setSeqItems] = useState(['', '', '', '']);
  const [ratingRows, setRatingRows] = useState(['']);
  const [ratingCols, setRatingCols] = useState(['1', '2', '3', '4', '5']);
  const [wordHuntWord, setWordHuntWord] = useState('');
  const [normalQText, setNormalQText] = useState('');
  const [normalQPoints, setNormalQPoints] = useState(1);
  const [normalQMediaType, setNormalQMediaType] = useState('');
  const [normalQMediaUrl, setNormalQMediaUrl] = useState('');
  const [normalQTF, setNormalQTF] = useState('True');

  // ── New: Live Performance ───────────────────────────────────────
  const [livePerformGame, setLivePerformGame] = useState('choose-me');
  const [chooseGL, setChooseGL] = useState('');
  const [chooseSection, setChooseSection] = useState('');
  const [chooseStudents, setChooseStudents] = useState([]);
  const [chosenStudent, setChosenStudent] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const spinnerRef = useRef(null);
  const [raisedHands, setRaisedHands] = useState(new Set());
  const [askStudents, setAskStudents] = useState([]);
  const [revealItems, setRevealItems] = useState([{ text: '' }]);
  const [revealIndex, setRevealIndex] = useState(-1);

  useEffect(() => { loadQuizzes(); loadGradeLevels(); loadStudentDbs(); loadGradeDatabases(); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mappingForm.targetDatabaseId) { if (!cancelled) setSlotHints(null); return; }
      const res = await api.get(`/grades/slot-hints?databaseId=${encodeURIComponent(mappingForm.targetDatabaseId)}`);
      if (!cancelled) setSlotHints(res.success ? res.data : null);
    })();
    return () => { cancelled = true; };
  }, [mappingForm.targetDatabaseId]);

  // Auto-refresh View Sections every 5 seconds
  useEffect(() => {
    if (!viewSectionsQuiz) {
      if (sectionsIntervalRef.current) clearInterval(sectionsIntervalRef.current);
      return;
    }
    const load = () => loadSectionsStatus(viewSectionsQuiz.id);
    load();
    sectionsIntervalRef.current = setInterval(load, 5000);
    return () => clearInterval(sectionsIntervalRef.current);
  }, [viewSectionsQuiz]);

  // ── Load functions ─────────────────────────────────────────────
  const loadQuizzes = async () => {
    const res = await api.get('/quiz/list');
    if (res.success) setQuizzes(res.data);
  };
  const loadGradeLevels = async () => {
    const res = await api.get('/quiz/grade-levels');
    if (res.success) setGradeLevels(res.data);
  };
  const loadStudentDbs = async () => {
    const res = await api.get('/quiz/student-databases');
    if (res.success) setStudentDbs(res.data);
  };
  const loadGradeDatabases = async () => {
    const res = await api.get('/grades/databases');
    if (res.success) setGradeDatabases(res.databases || []);
  };
  const loadResults = async (quizId) => {
    setLoading(true);
    const res = await api.get(`/quiz/${quizId}/results`);
    if (res.success) setQuizResults(res.data);
    setLoading(false);
  };
  const loadRetakeRequests = async () => {
    const res = await api.get('/quiz/retake-requests');
    if (res.success) setRetakeRequests(res.data);
  };
  const loadDeadlineRequests = async () => {
    const res = await api.get('/quiz/deadline-requests');
    if (res.success) setDeadlineRequests(res.data);
  };
  const loadLeaderboard = async () => {
    const res = await api.get('/quiz/leaderboard');
    if (res.success) setLeaderboard(res.data);
  };

  const loadSectionsStatus = async (quizId) => {
    const res = await api.get(`/quiz/${quizId}/sections-status`);
    if (res.success) setViewSectionsData(res.data);
  };

  // ── Quiz CRUD ──────────────────────────────────────────────────
  const addQuestion = () => {
    if (!questionForm.questionText.trim()) { showToast('Question text required', 'error'); return; }
    setForm({ ...form, questions: [...form.questions, { ...questionForm, choiceMedia: { A: {}, B: {}, C: {}, D: {} } }] });
    setQuestionForm({ questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1 });
  };
  const removeQuestion = (index) => setForm({ ...form, questions: form.questions.filter((_, i) => i !== index) });

  const buildNormalQuestion = () => {
    const base = { questionText: normalQText, questionType: normalQType, mediaType: normalQMediaType, mediaUrl: normalQMediaUrl, points: normalQPoints };
    if (normalQType === 'MCQ') {
      return { ...base, choiceA: questionForm.choiceA, choiceB: questionForm.choiceB, choiceC: questionForm.choiceC, choiceD: questionForm.choiceD, correctAnswer: questionForm.correctAnswer };
    }
    if (normalQType === 'TF') {
      return { ...base, choiceA: 'True', choiceB: 'False', correctAnswer: normalQTF };
    }
    if (normalQType === 'MATCHING') {
      const extraData = JSON.stringify({ pairs: matchingPairs });
      return { ...base, correctAnswer: 'MATCH', extraData };
    }
    if (normalQType === 'MULTIPLE_RESPONSE') {
      const letters = 'ABCDEF';
      const choiceData = {};
      multiChoices.forEach((c, i) => { if (c) choiceData[`choice${letters[i]}`] = c; });
      const extraData = JSON.stringify({ choices: multiChoices.filter(Boolean) });
      return { ...base, ...choiceData, correctAnswer: [...multiCorrect].sort().join(','), extraData };
    }
    if (normalQType === 'SEQUENCING') {
      const extraData = JSON.stringify({ items: seqItems.filter(Boolean) });
      return { ...base, correctAnswer: seqItems.filter(Boolean).map((_, i) => i + 1).join(','), extraData };
    }
    if (normalQType === 'RATING_GRID') {
      const extraData = JSON.stringify({ rows: ratingRows.filter(Boolean), cols: ratingCols.filter(Boolean) });
      return { ...base, correctAnswer: 'SURVEY', extraData };
    }
    if (normalQType === 'WORD_HUNT') {
      const extraData = JSON.stringify({ word: wordHuntWord.toUpperCase() });
      return { ...base, correctAnswer: wordHuntWord.toUpperCase(), extraData };
    }
    return base;
  };

  const addNormalQuestion = () => {
    if (!normalQText.trim()) { showToast('Question text required', 'error'); return; }
    if (normalQType === 'MATCHING' && matchingPairs.some(p => !p.left || !p.right)) { showToast('Fill all matching pairs', 'error'); return; }
    if (normalQType === 'MULTIPLE_RESPONSE' && multiCorrect.length === 0) { showToast('Select at least one correct answer', 'error'); return; }
    if (normalQType === 'WORD_HUNT' && !wordHuntWord.trim()) { showToast('Enter the word to find', 'error'); return; }
    const q = buildNormalQuestion();
    setForm(prev => ({ ...prev, questions: [...prev.questions, q] }));
    setNormalQText(''); setNormalQPoints(1); setNormalQMediaType(''); setNormalQMediaUrl('');
    setMatchingPairs([{ left: '', right: '' }]); setMultiChoices(['', '', '', '']); setMultiCorrect([]);
    setSeqItems(['', '', '', '']); setWordHuntWord(''); setNormalQTF('True');
    setQuestionForm({ questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1 });
    showToast('Question added');
  };

  const createQuiz = async () => {
    if (!form.title.trim()) { showToast('Title required', 'error'); return; }
    if (form.questions.length === 0) { showToast('Add at least one question', 'error'); return; }
    const firstGl = (form.gradeLevels && form.gradeLevels[0]) ? String(form.gradeLevels[0]) : '';
    const res = await api.post('/quiz/create', { ...form, gradeLevel: firstGl, createdBy: user.name || user.id || '', quizMode, strictMode: form.strictMode });
    if (res.success) {
      showToast('Quiz created');
      setCreateStep(1); resetForm(); await loadQuizzes();
    } else showToast(res.error || res.message || 'Failed', 'error');
  };

  const resetForm = () => {
    setForm(defaultForm);
    setQuestionForm({ questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1 });
    setNormalQText(''); setNormalQType('MCQ'); setNormalQPoints(1); setMatchingPairs([{ left: '', right: '' }]);
    setMultiChoices(['', '', '', '']); setMultiCorrect([]); setSeqItems(['', '', '', '']); setWordHuntWord('');
  };

  // ── Edit quiz ──────────────────────────────────────────────────
  const openEditQuiz = async (quiz) => {
    const res = await api.get(`/quiz/${quiz.id}`);
    if (!res.success) { showToast('Could not load quiz', 'error'); return; }
    const q = res.data;
    setEditForm({
      title: q.title, type: q.type, period: q.period || 'midterm', subject: q.subject,
      passingScore: q.passing_score, attemptsAllowed: q.attempts_allowed, timeLimit: q.time_limit,
      retakeAllowed: q.retake_allowed, randomizeQuestions: q.randomize_questions, randomizeChoices: q.randomize_choices,
      startDate: q.start_date || '', deadline: q.deadline || '', gradeLevels: q.gradeLevels || [],
      questions: (q.questions || []).map(qst => ({
        questionText: qst.question_text, questionType: qst.question_type || 'MCQ',
        mediaType: qst.media_type || '', mediaUrl: qst.media_url || '',
        choiceA: qst.choice_a || '', choiceB: qst.choice_b || '', choiceC: qst.choice_c || '', choiceD: qst.choice_d || '',
        correctAnswer: qst.correct_answer || '', points: qst.points || 1, extraData: qst.extra_data || ''
      })),
      strictMode: !!q.strict_mode
    });
    setEditingQuiz({ ...quiz, quiz_mode: q.quiz_mode || 'NORMAL_QUIZ' });
  };

  const saveEditQuiz = async () => {
    if (!editForm.title.trim()) { showToast('Title required', 'error'); return; }
    const firstGl = (editForm.gradeLevels && editForm.gradeLevels[0]) ? String(editForm.gradeLevels[0]) : '';
    const res = await api.put(`/quiz/${editingQuiz.id}`, {
      ...editForm, gradeLevel: firstGl, status: editingQuiz.status,
      quizMode: editingQuiz.quiz_mode, strictMode: editForm.strictMode
    });
    if (res.success) {
      showToast('Quiz updated'); setEditingQuiz(null); await loadQuizzes();
    } else showToast(res.error || res.message || 'Failed', 'error');
  };

  const toggleEditGradeLevel = (gl) => {
    const current = editForm.gradeLevels || [];
    setEditForm({ ...editForm, gradeLevels: current.includes(gl) ? current.filter(g => g !== gl) : [...current, gl] });
  };
  const removeEditQuestion = (i) => setEditForm({ ...editForm, questions: editForm.questions.filter((_, idx) => idx !== i) });

  // ── View Sections ──────────────────────────────────────────────
  const forceRetake = async (quizId, studentId) => {
    const res = await api.post(`/quiz/${quizId}/force-retake/${studentId}`);
    showToast(res.success ? 'Retake allowed' : (res.error || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) loadSectionsStatus(quizId);
  };
  const blockStudent = async (quizId, studentId) => {
    const res = await api.post(`/quiz/${quizId}/block-student/${studentId}`);
    showToast(res.success ? 'Student blocked' : (res.error || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) loadSectionsStatus(quizId);
  };
  const unblockStudent = async (quizId, studentId) => {
    const res = await api.post(`/quiz/${quizId}/unblock-student/${studentId}`);
    showToast(res.success ? 'Student unblocked' : (res.error || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) loadSectionsStatus(quizId);
  };

  // ── Refresh ────────────────────────────────────────────────────
  const refreshTab = async () => {
    await loadQuizzes(); await loadGradeLevels(); await loadGradeDatabases();
    if (tab === 'retakes') await loadRetakeRequests();
    if (tab === 'deadlines') await loadDeadlineRequests();
    if (tab === 'leaderboard') await loadLeaderboard();
    if (tab === 'students') await loadStudentDbs();
    if (tab === 'teams') await fetchTeamGroups();
    if (tab === 'recording') { await fetchScoreMappings(); await fetchRecordEntries(); }
    if (selectedQuiz && tab === 'results') await loadResults(selectedQuiz.id);
  };

  // ── Quiz status ────────────────────────────────────────────────
  const publishQuiz = async (id) => { const res = await api.post(`/quiz/${id}/publish`); showToast(res.success ? 'Quiz published' : (res.error || 'Failed'), res.success ? 'success' : 'error'); if (res.success) await loadQuizzes(); };
  const closeQuiz = async (id) => { const res = await api.post(`/quiz/${id}/close`); showToast(res.success ? 'Quiz closed' : (res.error || 'Failed'), res.success ? 'success' : 'error'); if (res.success) await loadQuizzes(); };
  const reopenQuiz = async (id) => { const res = await api.post(`/quiz/${id}/reopen`); showToast(res.success ? 'Quiz reopened' : (res.error || 'Failed'), res.success ? 'success' : 'error'); if (res.success) await loadQuizzes(); };
  const deleteQuiz = async (id) => {
    if (!confirm('Delete this quiz and all attempts?')) return;
    const prev = quizzes; setQuizzes(q => q.filter(x => x.id !== id));
    const res = await api.del(`/quiz/${id}`);
    if (res.success) { if (selectedQuiz?.id === id) setSelectedQuiz(null); showToast('Quiz deleted'); }
    else { setQuizzes(prev); showToast(res.error || 'Delete failed', 'error'); }
  };

  const approveRetake = async (id) => { const res = await api.post(`/quiz/retake-request/${id}/approve`); showToast(res.success ? 'Approved' : (res.error || 'Failed'), res.success ? 'success' : 'error'); if (res.success) await loadRetakeRequests(); };
  const denyRetake = async (id) => { const res = await api.post(`/quiz/retake-request/${id}/deny`); showToast(res.success ? 'Denied' : (res.error || 'Failed'), res.success ? 'success' : 'error'); if (res.success) await loadRetakeRequests(); };
  const approveDeadline = async (id) => { const res = await api.post(`/quiz/deadline-request/${id}/approve`); showToast(res.success ? 'Approved' : (res.error || 'Failed'), res.success ? 'success' : 'error'); if (res.success) await loadDeadlineRequests(); };
  const denyDeadline = async (id) => { const res = await api.post(`/quiz/deadline-request/${id}/deny`); showToast(res.success ? 'Denied' : (res.error || 'Failed'), res.success ? 'success' : 'error'); if (res.success) await loadDeadlineRequests(); };

  const toggleGradeLevel = (gl) => {
    const current = form.gradeLevels || [];
    setForm({ ...form, gradeLevels: current.includes(gl) ? current.filter(g => g !== gl) : [...current, gl] });
  };

  // ── Teams ──────────────────────────────────────────────────────
  const fetchTeamGroups = async () => {
    if (!teamGradeLevel || !teamSection) return;
    const res = await api.get(`/quiz/team-groups?gradeLevel=${encodeURIComponent(teamGradeLevel)}&section=${encodeURIComponent(teamSection)}`);
    if (res.success) setTeamGroups(res.data || []);
    const ov = await api.get(`/quiz/team-groups/overview?gradeLevel=${encodeURIComponent(teamGradeLevel)}&section=${encodeURIComponent(teamSection)}`);
    if (ov.success) setTeamOverview(ov.data || { groups: [], unassigned: [] });
  };
  const autoGenerateTeams = async () => {
    if (!teamGradeLevel || !teamSection) return showToast('Select grade level and section', 'error');
    const res = await api.post('/quiz/team-groups/auto', { gradeLevel: teamGradeLevel, section: teamSection, groupCount: teamGroupCount });
    showToast(res.message || (res.success ? 'Teams generated' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) fetchTeamGroups();
  };
  const TEAM_DRAG_MIME = 'text/plain';
  const onTeamMemberDragStart = (e, studentId) => { e.dataTransfer.setData(TEAM_DRAG_MIME, String(studentId)); e.dataTransfer.effectAllowed = 'move'; };
  const onTeamDropZoneOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onTeamDropOnGroup = (e, groupName) => { e.preventDefault(); setDragOverGroup(null); const sid = e.dataTransfer.getData(TEAM_DRAG_MIME); if (sid && teamGradeLevel && teamSection) moveMember(sid, groupName); };
  const onTeamDropUnassigned = (e) => { e.preventDefault(); setDragOverGroup(null); const sid = e.dataTransfer.getData(TEAM_DRAG_MIME); if (sid) removeMember(sid); };
  const applyLocalMove = (studentId, targetGroup) => {
    setTeamOverview((prev) => {
      const groups = (prev.groups || []).map(g => ({ ...g, members: (g.members || []).filter(m => String(m.student_id) !== String(studentId)) }));
      const unassigned = (prev.unassigned || []).filter(m => String(m.student_id) !== String(studentId));
      let moved = null;
      for (const g of (prev.groups || [])) { const f = (g.members || []).find(m => String(m.student_id) === String(studentId)); if (f) { moved = f; break; } }
      if (!moved) moved = (prev.unassigned || []).find(m => String(m.student_id) === String(studentId));
      if (!moved) return prev;
      if (targetGroup == null) return { groups, unassigned: [...unassigned, moved] };
      let found = false;
      const out = groups.map(g => { if (g.groupName === targetGroup) { found = true; return { ...g, members: [...(g.members || []), moved] }; } return g; });
      if (!found) out.push({ groupName: targetGroup, members: [moved] });
      return { groups: out, unassigned };
    });
  };
  const moveMember = async (studentId, groupName) => {
    const snapshot = teamOverview; applyLocalMove(studentId, groupName); setTeamBusy(true);
    try { const res = await api.post('/quiz/team-groups/assign', { gradeLevel: teamGradeLevel, section: teamSection, studentId, groupName }); if (!res.success) { setTeamOverview(snapshot); showToast(res.message || 'Failed', 'error'); } else { showToast('Member moved', 'success'); fetchTeamGroups(); } }
    catch { setTeamOverview(snapshot); showToast('Network error', 'error'); } finally { setTeamBusy(false); }
  };
  const removeMember = async (studentId) => {
    const snapshot = teamOverview; applyLocalMove(studentId, null); setTeamBusy(true);
    try { const res = await api.post('/quiz/team-groups/remove', { gradeLevel: teamGradeLevel, section: teamSection, studentId }); if (!res.success) { setTeamOverview(snapshot); showToast(res.message || 'Failed', 'error'); } else { showToast('Member removed', 'success'); fetchTeamGroups(); } }
    catch { setTeamOverview(snapshot); showToast('Network error', 'error'); } finally { setTeamBusy(false); }
  };
  const deleteOneGroup = async (groupName) => {
    if (!confirm(`Delete group "${groupName}"?`)) return;
    const snapshot = teamOverview;
    setTeamOverview((prev) => { const target = (prev.groups || []).find(g => g.groupName === groupName); const movedMembers = target ? (target.members || []) : []; return { groups: (prev.groups || []).filter(g => g.groupName !== groupName), unassigned: [...(prev.unassigned || []), ...movedMembers] }; });
    setTeamBusy(true);
    try { const res = await api.post('/quiz/team-groups/delete-group', { gradeLevel: teamGradeLevel, section: teamSection, groupName }); if (!res.success) { setTeamOverview(snapshot); showToast(res.message || 'Failed', 'error'); } else { showToast('Group deleted', 'success'); fetchTeamGroups(); } }
    catch { setTeamOverview(snapshot); showToast('Network error', 'error'); } finally { setTeamBusy(false); }
  };
  const deleteAllGroups = async () => {
    if (!confirm('Delete ALL groups for this section?')) return;
    const snapshot = teamOverview;
    setTeamOverview((prev) => { const allMembers = [...((prev.groups || []).flatMap(g => g.members || [])), ...(prev.unassigned || [])]; return { groups: [], unassigned: allMembers }; });
    setTeamGroups([]); setTeamBusy(true);
    try { const res = await api.post('/quiz/team-groups/delete-all', { gradeLevel: teamGradeLevel, section: teamSection }); if (!res.success) { setTeamOverview(snapshot); showToast(res.message || 'Failed', 'error'); } else { showToast('Grouping deleted', 'success'); fetchTeamGroups(); } }
    catch { setTeamOverview(snapshot); showToast('Network error', 'error'); } finally { setTeamBusy(false); }
  };

  // ── Recording ──────────────────────────────────────────────────
  const fetchScoreMappings = async () => { const gl = mappingForm.gradeLevel || ''; const res = await api.get(`/quiz/score-mappings${gl ? `?gradeLevel=${encodeURIComponent(gl)}` : ''}`); if (res.success) setScoreMappings(res.data || []); };
  const createMapping = async () => { const res = await api.post('/quiz/score-mappings', { gradeLevel: mappingForm.gradeLevel, targetDatabaseId: Number(mappingForm.targetDatabaseId), period: mappingForm.period, scoreType: mappingForm.scoreType, slot: Number(mappingForm.slot) || 0, sourceType: mappingForm.sourceType, sourceQuizId: mappingForm.sourceQuizId, applyMode: mappingForm.applyMode }); showToast(res.message || (res.success ? 'Mapping created' : 'Failed'), res.success ? 'success' : 'error'); if (res.success) fetchScoreMappings(); };
  const applyMapping = async (id) => { const res = await api.post('/quiz/record-to-mode-a', { mappingId: id }); showToast(res.message || (res.success ? 'Recorded to Mode A' : 'Failed'), res.success ? 'success' : 'error'); };
  const fetchRecordEntries = async () => { const gl = mappingForm.gradeLevel || ''; const res = await api.get(`/quiz/record-entries${gl ? `?gradeLevel=${encodeURIComponent(gl)}` : ''}`); if (res.success) setRecordEntries(res.data || { quizAttempts: [], liveGames: [] }); };
  const deleteRecordEntry = async (sourceType, id) => { const res = await api.del(`/quiz/record-entries/${sourceType}/${encodeURIComponent(id)}`); showToast(res.message || (res.success ? 'Record deleted' : 'Delete failed'), res.success ? 'success' : 'error'); if (res.success) { setRecordEntries((prev) => ({ quizAttempts: sourceType === 'QUIZ_ATTEMPT' ? prev.quizAttempts.filter(x => String(x.id) !== String(id)) : prev.quizAttempts, liveGames: sourceType === 'LIVE_GAME' ? prev.liveGames.filter(x => String(x.id) !== String(id)) : prev.liveGames })); } };
  const deleteMapping = async (mappingId) => { if (!confirm('Delete this score mapping?')) return; const res = await api.del(`/quiz/score-mappings/${mappingId}`); showToast(res.message || (res.success ? 'Mapping deleted' : 'Failed'), res.success ? 'success' : 'error'); if (res.success) fetchScoreMappings(); };
  const openAttemptReview = async (attemptId) => { const res = await api.get(`/quiz/attempt/${encodeURIComponent(attemptId)}`); if (res.success && res.data) setReviewAttempt(res.data); else showToast(res.error || res.message || 'Could not load attempt', 'error'); };

  // ── Live Performance ───────────────────────────────────────────
  const loadChooseStudents = async () => {
    if (!chooseGL) { showToast('Select grade level', 'error'); return; }
    const params = new URLSearchParams({ gradeLevel: chooseGL });
    if (chooseSection) params.append('section', chooseSection);
    const res = await api.get(`/quiz/students?${params}`);
    if (res.success) { setChooseStudents(res.data || []); setAskStudents(res.data || []); setChosenStudent(null); setRaisedHands(new Set()); showToast(`Loaded ${(res.data || []).length} students`); }
    else showToast(res.error || 'Failed', 'error');
  };

  const spinChooseMe = () => {
    if (chooseStudents.length === 0) return;
    setIsSpinning(true); setChosenStudent(null);
    let count = 0; const max = 15 + Math.floor(Math.random() * 10);
    const interval = setInterval(() => {
      const rand = chooseStudents[Math.floor(Math.random() * chooseStudents.length)];
      setChosenStudent(rand); count++;
      if (count >= max) { clearInterval(interval); setIsSpinning(false); }
    }, 100 + Math.floor(count * 8));
    spinnerRef.current = interval;
  };

  const toggleHand = (studentId) => {
    setRaisedHands(prev => { const next = new Set(prev); if (next.has(studentId)) next.delete(studentId); else next.add(studentId); return next; });
  };
  const pickFromRaisedHands = () => {
    const raised = askStudents.filter(s => raisedHands.has(s.student_id));
    if (raised.length === 0) { showToast('No raised hands!', 'error'); return; }
    const pick = raised[Math.floor(Math.random() * raised.length)];
    showToast(`Selected: ${pick.english_name || pick.student_id}`, 'success');
    setChosenStudent(pick);
  };
  const clearHands = () => { setRaisedHands(new Set()); setChosenStudent(null); };

  // ── Computed ───────────────────────────────────────────────────
  const allGradeLevels = gradeLevels.length > 0 ? gradeLevels : ['MATHAYUM 1','MATHAYUM 2','MATHAYUM 3','MATHAYUM 4','MATHAYUM 5','MATHAYUM 6'];
  const liveGameQuizzes = quizzes.filter(q => q.quiz_mode === 'LIVE_GAME');
  const normalQuizzes = quizzes.filter(q => !q.quiz_mode || q.quiz_mode === 'NORMAL_QUIZ');

  const tabs = [
    { id: 'quizzes', label: 'Quizzes' }, { id: 'create', label: 'Create Quiz' },
    { id: 'results', label: 'Results' }, { id: 'retakes', label: 'Retake Requests' },
    { id: 'deadlines', label: 'Deadline Requests' }, { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'students', label: 'Student DBs' }, { id: 'teams', label: 'Team Groups' },
    { id: 'recording', label: 'Record to Mode A' }, { id: 'grading-sheet', label: 'Grading Sheet' },
    { id: 'livegame', label: 'Live Game' }, { id: 'live-performance', label: 'Live Performance' },
  ];

  if (showLiveGame) {
    return <KahootHostView user={user} quizzes={liveGameQuizzes.length > 0 ? liveGameQuizzes : quizzes} showToast={showToast} onBack={() => setShowLiveGame(false)} />;
  }

  // ── Quiz card renderer ─────────────────────────────────────────
  const renderQuizCard = (q, modeLabel) => (
    <div key={q.id} className="card" style={{ marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h4 style={{ color: 'var(--text-bright)', margin: 0 }}>{q.title}</h4>
            <span className={`badge ${q.status === 'ACTIVE' ? 'badge-success' : q.status === 'DRAFT' ? 'badge-warning' : 'badge-danger'}`}>{q.status}</span>
            <span style={{ fontSize: '0.7rem', background: modeLabel === 'LIVE' ? 'rgba(108,92,231,0.2)' : 'rgba(0,206,201,0.2)', color: modeLabel === 'LIVE' ? '#6c5ce7' : '#00cec9', padding: '0.1rem 0.4rem', borderRadius: 4, fontWeight: 700 }}>{modeLabel}</span>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
            {q.type} | {(q.period || 'midterm').toUpperCase()} | {q.subject || '—'} | {q.question_count} questions | Pass: {q.passing_score}%
            {q.strict_mode ? ' | ⚠ Strict' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setViewSectionsQuiz(q)} className="btn btn-outline btn-sm" style={{ borderColor: '#00cec9', color: '#00cec9' }}>View Sections</button>
          <button onClick={() => openEditQuiz(q)} className="btn btn-outline btn-sm">Edit</button>
          <button onClick={() => { setSelectedQuiz(q); loadResults(q.id); setTab('results'); }} className="btn btn-outline btn-sm">Results</button>
          {q.status === 'DRAFT' && <button onClick={() => publishQuiz(q.id)} className="btn btn-secondary btn-sm">Publish</button>}
          {q.status === 'ACTIVE' && <button onClick={() => closeQuiz(q.id)} className="btn btn-outline btn-sm">Close</button>}
          {q.status === 'CLOSED' && <button onClick={() => reopenQuiz(q.id)} className="btn btn-secondary btn-sm">Reopen</button>}
          {modeLabel === 'LIVE' && <button onClick={() => setShowLiveGame(true)} className="btn btn-primary btn-sm">Start Live</button>}
          <button onClick={() => deleteQuiz(q.id)} className="btn btn-danger btn-sm">Delete</button>
        </div>
      </div>
    </div>
  );

  // ── Normal Quiz question type builder ─────────────────────────
  const renderNormalQBuilder = (formRef, questionsRef, addFn) => (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h4 style={{ marginBottom: '0.8rem' }}>Add Question ({(formRef?.questions || []).length} added)</h4>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <select value={normalQType} onChange={e => setNormalQType(e.target.value)} style={{ width: '100%', fontWeight: 600 }}>
          {QUESTION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <textarea placeholder="Question text" value={normalQText} onChange={e => setNormalQText(e.target.value)} rows={2} style={{ width: '100%' }} />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select value={normalQMediaType} onChange={e => setNormalQMediaType(e.target.value)} style={{ width: 140 }}>
            <option value="">No media</option><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option>
          </select>
          {normalQMediaType && <input placeholder="Media URL" value={normalQMediaUrl} onChange={e => setNormalQMediaUrl(e.target.value)} style={{ flex: 1 }} />}
          <input type="number" placeholder="Points" value={normalQPoints} onChange={e => setNormalQPoints(parseInt(e.target.value) || 1)} style={{ width: 80 }} />
        </div>

        {normalQType === 'MCQ' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <input placeholder="Choice A" value={questionForm.choiceA} onChange={e => setQuestionForm({ ...questionForm, choiceA: e.target.value })} />
              <input placeholder="Choice B" value={questionForm.choiceB} onChange={e => setQuestionForm({ ...questionForm, choiceB: e.target.value })} />
              <input placeholder="Choice C" value={questionForm.choiceC} onChange={e => setQuestionForm({ ...questionForm, choiceC: e.target.value })} />
              <input placeholder="Choice D" value={questionForm.choiceD} onChange={e => setQuestionForm({ ...questionForm, choiceD: e.target.value })} />
            </div>
            <select value={questionForm.correctAnswer} onChange={e => setQuestionForm({ ...questionForm, correctAnswer: e.target.value })} style={{ width: '100%' }}>
              <option value="">Correct Answer</option><option>A</option><option>B</option><option>C</option><option>D</option>
            </select>
          </div>
        )}

        {normalQType === 'TF' && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={normalQTF === 'True'} onChange={() => setNormalQTF('True')} />True</label>
            <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={normalQTF === 'False'} onChange={() => setNormalQTF('False')} />False</label>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Correct answer: {normalQTF}</span>
          </div>
        )}

        {normalQType === 'MATCHING' && (
          <div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Enter matching pairs (Left item → Right item)</p>
            {matchingPairs.map((pair, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem', alignItems: 'center' }}>
                <input placeholder={`Left ${i + 1}`} value={pair.left} onChange={e => { const p = [...matchingPairs]; p[i] = { ...p[i], left: e.target.value }; setMatchingPairs(p); }} style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <input placeholder={`Right ${i + 1}`} value={pair.right} onChange={e => { const p = [...matchingPairs]; p[i] = { ...p[i], right: e.target.value }; setMatchingPairs(p); }} style={{ flex: 1 }} />
                {matchingPairs.length > 1 && <button onClick={() => setMatchingPairs(matchingPairs.filter((_, idx) => idx !== i))} style={{ background: 'none', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>✕</button>}
              </div>
            ))}
            <button onClick={() => setMatchingPairs([...matchingPairs, { left: '', right: '' }])} className="btn btn-outline btn-sm">+ Add Pair</button>
          </div>
        )}

        {normalQType === 'MULTIPLE_RESPONSE' && (
          <div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Enter choices and select all correct answers</p>
            {multiChoices.map((c, i) => {
              const letter = 'ABCDEF'[i];
              const isCorrect = multiCorrect.includes(letter);
              return (
                <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={isCorrect} onChange={() => setMultiCorrect(prev => isCorrect ? prev.filter(x => x !== letter) : [...prev, letter])} />
                  <span style={{ fontWeight: 700, minWidth: 20 }}>{letter}.</span>
                  <input placeholder={`Choice ${letter}`} value={c} onChange={e => { const nc = [...multiChoices]; nc[i] = e.target.value; setMultiChoices(nc); }} style={{ flex: 1 }} />
                </div>
              );
            })}
            <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Correct: {multiCorrect.sort().join(', ') || 'none selected'}</p>
          </div>
        )}

        {normalQType === 'SEQUENCING' && (
          <div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Enter items in the CORRECT order (students will see them shuffled)</p>
            {seqItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, minWidth: 24, color: 'var(--text-dim)' }}>{i + 1}.</span>
                <input placeholder={`Step ${i + 1}`} value={item} onChange={e => { const ni = [...seqItems]; ni[i] = e.target.value; setSeqItems(ni); }} style={{ flex: 1 }} />
                {seqItems.length > 2 && <button onClick={() => setSeqItems(seqItems.filter((_, idx) => idx !== i))} style={{ background: 'none', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>✕</button>}
              </div>
            ))}
            <button onClick={() => setSeqItems([...seqItems, ''])} className="btn btn-outline btn-sm">+ Add Step</button>
          </div>
        )}

        {normalQType === 'RATING_GRID' && (
          <div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Survey/rating grid — students rate each row on the column scale</p>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Items to rate:</label>
              {ratingRows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <input placeholder={`Item ${i + 1}`} value={row} onChange={e => { const nr = [...ratingRows]; nr[i] = e.target.value; setRatingRows(nr); }} style={{ flex: 1 }} />
                  {ratingRows.length > 1 && <button onClick={() => setRatingRows(ratingRows.filter((_, idx) => idx !== i))} style={{ background: 'none', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>✕</button>}
                </div>
              ))}
              <button onClick={() => setRatingRows([...ratingRows, ''])} className="btn btn-outline btn-sm">+ Add Item</button>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Rating scale (cols): {ratingCols.join(', ')}</label>
              <input placeholder="Columns (comma-separated)" value={ratingCols.join(',')} onChange={e => setRatingCols(e.target.value.split(',').map(c => c.trim()).filter(Boolean))} style={{ width: '100%', marginTop: '0.3rem' }} />
            </div>
          </div>
        )}

        {normalQType === 'WORD_HUNT' && (
          <div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Students find the hidden word in a grid of letters</p>
            <input placeholder="Word to find (e.g. PHOTOSYNTHESIS)" value={wordHuntWord} onChange={e => setWordHuntWord(e.target.value.toUpperCase())} style={{ width: '100%', fontFamily: 'monospace', letterSpacing: 2 }} />
            {wordHuntWord && <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginTop: '0.3rem' }}>Hidden word: <strong>{wordHuntWord}</strong> ({wordHuntWord.length} letters)</p>}
          </div>
        )}

        <button onClick={addFn} className="btn btn-secondary btn-sm">+ Add Question</button>
      </div>
    </div>
  );

  const renderQuestionList = (questions, removeFn) => {
    if (!questions || questions.length === 0) return null;
    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.5rem' }}>Questions ({questions.length})</h4>
        {questions.map((q, i) => {
          const raw = String(q.questionText || '').trim();
          const snippet = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.4rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', flex: '1 1 200px', minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{i + 1}.</span> [{q.questionType || 'MCQ'}] {snippet || '(empty)'}
                {q.correctAnswer && q.correctAnswer !== 'MATCH' && q.correctAnswer !== 'SURVEY' && <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}> ✓ {q.correctAnswer}</span>}
                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}> ({q.points || 1} pts)</span>
              </span>
              {removeFn && <button type="button" onClick={() => removeFn(i)} style={{ background: 'none', color: 'var(--danger)', fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}>Remove</button>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderQuizSettingsForm = (f, setF, glToggleFn) => (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h4 style={{ marginBottom: '0.8rem' }}>Quiz Settings</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Title</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={{ width: '100%' }} /></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Type</label>
          <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} style={{ width: '100%' }}>
            <option>QUIZ</option><option>EXAM</option><option>PRACTICE</option><option>HOMEWORK</option><option>GAME</option>
          </select></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Period</label>
          <select value={f.period} onChange={e => setF({ ...f, period: e.target.value })} style={{ width: '100%' }}>
            <option value="midterm">Midterm</option><option value="final_initial">Final Initial</option><option value="final_final">Final Final</option>
          </select></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Subject</label><input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} style={{ width: '100%' }} /></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Passing Score (%)</label><input type="number" value={f.passingScore} onChange={e => setF({ ...f, passingScore: parseInt(e.target.value) })} style={{ width: '100%' }} /></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Attempts Allowed</label><input type="number" value={f.attemptsAllowed} onChange={e => setF({ ...f, attemptsAllowed: parseInt(e.target.value) })} style={{ width: '100%' }} /></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Time Limit (min, 0=none)</label><input type="number" value={f.timeLimit} onChange={e => setF({ ...f, timeLimit: parseInt(e.target.value) })} style={{ width: '100%' }} /></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Deadline</label><input type="datetime-local" value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} style={{ width: '100%' }} /></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Randomize Questions</label>
          <select value={f.randomizeQuestions} onChange={e => setF({ ...f, randomizeQuestions: e.target.value })} style={{ width: '100%' }}><option>NO</option><option>YES</option></select></div>
        <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Randomize Choices</label>
          <select value={f.randomizeChoices} onChange={e => setF({ ...f, randomizeChoices: e.target.value })} style={{ width: '100%' }}><option>NO</option><option>YES</option></select></div>
      </div>
      {quizMode === 'NORMAL_QUIZ' && (
        <div style={{ marginTop: '0.8rem' }}>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.strictMode || false} onChange={e => setF({ ...f, strictMode: e.target.checked })} />
            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Strict Mode (anti-cheat: tab switching = auto-submit)</span>
          </label>
        </div>
      )}
      <div style={{ marginTop: '1rem' }}>
        <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Grade Levels</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
          {allGradeLevels.map(gl => (
            <button key={gl} onClick={() => glToggleFn(gl)} className={`btn btn-sm ${(f.gradeLevels || []).includes(gl) ? 'btn-secondary' : 'btn-outline'}`}>{gl}</button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Live Quiz Settings (same as normal but no strict mode) ─────
  const renderLiveQuizQBuilder = () => (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h4 style={{ marginBottom: '0.8rem' }}>Add Question ({form.questions.length} added) — MCQ only for Live Game</h4>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <textarea placeholder="Question text" value={questionForm.questionText} onChange={e => setQuestionForm({ ...questionForm, questionText: e.target.value })} rows={2} style={{ width: '100%' }} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select value={questionForm.mediaType} onChange={e => setQuestionForm({ ...questionForm, mediaType: e.target.value })} style={{ width: 140 }}>
            <option value="">No media</option><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option>
          </select>
          <input placeholder="Media URL" value={questionForm.mediaUrl} onChange={e => setQuestionForm({ ...questionForm, mediaUrl: e.target.value })} style={{ flex: 1 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <input placeholder="Choice A" value={questionForm.choiceA} onChange={e => setQuestionForm({ ...questionForm, choiceA: e.target.value })} />
          <input placeholder="Choice B" value={questionForm.choiceB} onChange={e => setQuestionForm({ ...questionForm, choiceB: e.target.value })} />
          <input placeholder="Choice C" value={questionForm.choiceC} onChange={e => setQuestionForm({ ...questionForm, choiceC: e.target.value })} />
          <input placeholder="Choice D" value={questionForm.choiceD} onChange={e => setQuestionForm({ ...questionForm, choiceD: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select value={questionForm.correctAnswer} onChange={e => setQuestionForm({ ...questionForm, correctAnswer: e.target.value })} style={{ flex: 1 }}>
            <option value="">Correct Answer</option><option>A</option><option>B</option><option>C</option><option>D</option>
          </select>
          <input type="number" placeholder="Points" value={questionForm.points} onChange={e => setQuestionForm({ ...questionForm, points: parseInt(e.target.value) })} style={{ width: 80 }} />
          <button onClick={addQuestion} className="btn btn-secondary btn-sm">Add</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--secondary)', fontSize: '1.2rem' }}>EDUVERSE — Quiz Teacher Dashboard</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{user.name || user.username || 'Teacher'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={refreshTab} className="btn btn-outline btn-sm">Refresh</button>
          <button onClick={onLogout} className="btn btn-danger btn-sm">Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        <nav style={{ width: 200, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '1rem 0', overflowY: 'auto', flexShrink: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'retakes') loadRetakeRequests(); if (t.id === 'deadlines') loadDeadlineRequests(); if (t.id === 'leaderboard') loadLeaderboard(); if (t.id === 'teams') fetchTeamGroups(); if (t.id === 'recording') { fetchScoreMappings(); fetchRecordEntries(); } }}
              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: tab === t.id ? 'rgba(0,206,201,0.15)' : 'transparent', color: tab === t.id ? 'var(--secondary)' : 'var(--text)', border: 'none', borderLeft: tab === t.id ? '3px solid var(--secondary)' : '3px solid transparent', cursor: 'pointer', fontSize: '0.85rem' }}>
              {t.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
          {/* ══════════ QUIZZES TAB ══════════ */}
          {tab === 'quizzes' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3>All Quizzes</h3>
                <button onClick={() => { setTab('create'); setCreateStep(1); }} className="btn btn-primary btn-sm">+ Create Quiz</button>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                  <h4 style={{ margin: 0, color: '#6c5ce7' }}>🎮 LIVE GAME Quizzes</h4>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>({liveGameQuizzes.length})</span>
                </div>
                {liveGameQuizzes.map(q => renderQuizCard(q, 'LIVE'))}
                {liveGameQuizzes.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '0.5rem' }}>No live game quizzes yet.</p>}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                  <h4 style={{ margin: 0, color: '#00cec9' }}>📝 NORMAL QUIZ Quizzes</h4>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>({normalQuizzes.length})</span>
                </div>
                {normalQuizzes.map(q => renderQuizCard(q, 'NORMAL'))}
                {normalQuizzes.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', padding: '0.5rem' }}>No normal quizzes yet.</p>}
              </div>
            </div>
          )}

          {/* ══════════ CREATE TAB ══════════ */}
          {tab === 'create' && (
            <div>
              {createStep === 1 && (
                <div>
                  <h3 style={{ marginBottom: '1.5rem' }}>Choose Quiz Mode</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', maxWidth: 600 }}>
                    <button onClick={() => { setQuizMode('LIVE_GAME'); setCreateStep(2); }} style={{ padding: '2rem', borderRadius: 12, background: 'rgba(108,92,231,0.1)', border: '2px solid #6c5ce7', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎮</div>
                      <h4 style={{ color: '#6c5ce7', marginBottom: '0.4rem' }}>LIVE GAME</h4>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Kahoot-style real-time game. Students join with a PIN and answer simultaneously.</p>
                    </button>
                    <button onClick={() => { setQuizMode('NORMAL_QUIZ'); setCreateStep(2); }} style={{ padding: '2rem', borderRadius: 12, background: 'rgba(0,206,201,0.1)', border: '2px solid #00cec9', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📝</div>
                      <h4 style={{ color: '#00cec9', marginBottom: '0.4rem' }}>NORMAL QUIZ</h4>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Students take the quiz at their own pace. Supports 7 question types, strict mode, and live monitoring.</p>
                    </button>
                  </div>
                </div>
              )}

              {createStep === 2 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <button onClick={() => setCreateStep(1)} className="btn btn-outline btn-sm">← Back</button>
                    <h3 style={{ margin: 0 }}>Create {quizMode === 'LIVE_GAME' ? '🎮 LIVE GAME' : '📝 NORMAL QUIZ'}</h3>
                  </div>

                  {renderQuizSettingsForm(form, setForm, toggleGradeLevel)}

                  {quizMode === 'LIVE_GAME' ? renderLiveQuizQBuilder() : renderNormalQBuilder(form, form.questions, addNormalQuestion)}

                  {renderQuestionList(form.questions, removeQuestion)}

                  <button onClick={createQuiz} className="btn btn-primary">Create Quiz</button>
                  <button onClick={() => { setCreateStep(1); resetForm(); }} className="btn btn-outline" style={{ marginLeft: '0.5rem' }}>Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* ══════════ RESULTS TAB ══════════ */}
          {tab === 'results' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Quiz Results {selectedQuiz ? `— ${selectedQuiz.title}` : ''}</h3>
              {!selectedQuiz && (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {quizzes.map(q => (
                    <button key={q.id} onClick={() => { setSelectedQuiz(q); loadResults(q.id); }} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }}>
                      <strong>{q.title}</strong> — {q.status}
                    </button>
                  ))}
                </div>
              )}
              {selectedQuiz && quizResults && (
                <div>
                  <button onClick={() => { setSelectedQuiz(null); setQuizResults(null); }} className="btn btn-outline btn-sm" style={{ marginBottom: '1rem' }}>Back to list</button>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
                    <StatCard label="Total Attempts" value={quizResults.statistics.totalAttempts} />
                    <StatCard label="Average Score" value={`${quizResults.statistics.averageScore}%`} />
                    <StatCard label="Highest" value={`${quizResults.statistics.highestScore}%`} />
                    <StatCard label="Lowest" value={`${quizResults.statistics.lowestScore}%`} />
                    <StatCard label="Passed" value={quizResults.statistics.passCount} />
                    <StatCard label="Failed" value={quizResults.statistics.failCount} />
                  </div>
                  <table>
                    <thead><tr><th>Student ID</th><th>Name</th><th>Grade</th><th>Section</th><th>Score</th><th>%</th><th>Result</th><th>Tab Switches</th><th>Review</th></tr></thead>
                    <tbody>
                      {(quizResults.attempts || []).map(a => (
                        <tr key={a.id}>
                          <td>{a.student_id}</td><td>{a.student_name}</td><td>{a.grade_level}</td><td>{a.section}</td>
                          <td>{a.score}/{a.total_points}</td><td>{a.percentage}%</td>
                          <td><span className={`badge ${a.result === 'PASSED' ? 'badge-success' : 'badge-danger'}`}>{a.result}</span></td>
                          <td>{a.tab_switch_count}</td>
                          <td><button onClick={() => openAttemptReview(a.id)} className="btn btn-outline btn-sm">Review</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════ RETAKES TAB ══════════ */}
          {tab === 'retakes' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Retake Requests</h3>
              {retakeRequests.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No retake requests</p>}
              {retakeRequests.map(r => (
                <div key={r.id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong>{r.student_name}</strong> ({r.student_id}) — {r.quiz_title}<br /><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Reason: {r.reason} | </span><span className={`badge ${r.status === 'PENDING' ? 'badge-warning' : r.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span></div>
                  {r.status === 'PENDING' && (<div style={{ display: 'flex', gap: '0.3rem' }}><button onClick={() => approveRetake(r.id)} className="btn btn-secondary btn-sm">Approve</button><button onClick={() => denyRetake(r.id)} className="btn btn-danger btn-sm">Deny</button></div>)}
                </div>
              ))}
            </div>
          )}

          {/* ══════════ DEADLINES TAB ══════════ */}
          {tab === 'deadlines' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Deadline Extension Requests</h3>
              {deadlineRequests.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No deadline requests</p>}
              {deadlineRequests.map(r => (
                <div key={r.id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong>{r.student_name}</strong> ({r.student_id}) — {r.quiz_title}<br /><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Reason: {r.reason} | </span><span className={`badge ${r.status === 'PENDING' ? 'badge-warning' : r.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span></div>
                  {r.status === 'PENDING' && (<div style={{ display: 'flex', gap: '0.3rem' }}><button onClick={() => approveDeadline(r.id)} className="btn btn-secondary btn-sm">Approve</button><button onClick={() => denyDeadline(r.id)} className="btn btn-danger btn-sm">Deny</button></div>)}
                </div>
              ))}
            </div>
          )}

          {/* ══════════ LEADERBOARD TAB ══════════ */}
          {tab === 'leaderboard' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Leaderboard</h3>
              <table>
                <thead><tr><th>Rank</th><th>Student ID</th><th>Name</th><th>Grade</th><th>Quizzes</th><th>Avg Score</th><th>Best</th><th>Passed</th></tr></thead>
                <tbody>{leaderboard.map((s, i) => (<tr key={s.student_id}><td style={{ fontWeight: 700, color: i < 3 ? 'var(--warning)' : 'var(--text)' }}>{i + 1}</td><td>{s.student_id}</td><td>{s.student_name}</td><td>{s.grade_level}</td><td>{s.quizzes_taken}</td><td>{parseFloat(s.avg_score).toFixed(1)}%</td><td>{parseFloat(s.best_score).toFixed(1)}%</td><td>{s.passed_count}</td></tr>))}</tbody>
              </table>
            </div>
          )}

          {/* ══════════ LIVE GAME TAB ══════════ */}
          {tab === 'livegame' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Kahoot-Style Live Game</h3>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>Host a live quiz game where students join with a PIN and answer questions in real-time.</p>
              <button onClick={() => setShowLiveGame(true)} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}>Start Live Game</button>
            </div>
          )}

          {/* ══════════ LIVE PERFORMANCE TAB ══════════ */}
          {tab === 'live-performance' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Live Performance Games</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'choose-me', label: '🎯 Choose Me!' },
                  { id: 'ask-me', label: '✋ Ask Me!' },
                  { id: 'reveal-me', label: '🔮 Reveal Me!' },
                  { id: 'roulette', label: '🎡 Student Roulette' },
                ].map(g => (
                  <button key={g.id} onClick={() => setLivePerformGame(g.id)} className={`btn btn-sm ${livePerformGame === g.id ? 'btn-secondary' : 'btn-outline'}`}>{g.label}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={chooseGL} onChange={e => { setChooseGL(e.target.value); setChooseStudents([]); setChosenStudent(null); }}>
                  <option value="">Grade Level</option>
                  {allGradeLevels.map(gl => <option key={gl} value={gl}>{gl}</option>)}
                </select>
                <input placeholder="Section (optional)" value={chooseSection} onChange={e => setChooseSection(e.target.value)} style={{ width: 150 }} />
                <button onClick={loadChooseStudents} className="btn btn-secondary btn-sm">Load Students</button>
                {chooseStudents.length > 0 && <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{chooseStudents.length} students loaded</span>}
              </div>

              {/* CHOOSE ME */}
              {livePerformGame === 'choose-me' && (
                <div className="card" style={{ textAlign: 'center' }}>
                  <h4 style={{ marginBottom: '1.5rem' }}>🎯 Choose Me! — Random Student Selector</h4>
                  <div style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    {isSpinning ? (
                      <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--secondary)', animation: 'pulse 0.1s infinite' }}>
                        {chosenStudent ? (chosenStudent.english_name || chosenStudent.student_id) : '...'}
                      </div>
                    ) : chosenStudent ? (
                      <div>
                        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>{chosenStudent.english_name || chosenStudent.student_id}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{chosenStudent.section} | No. {chosenStudent.class_no} | {chosenStudent.student_id}</div>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-dim)', fontSize: '1.5rem' }}>Press the button to pick!</div>
                    )}
                  </div>
                  <button onClick={spinChooseMe} disabled={isSpinning || chooseStudents.length === 0} className="btn btn-primary" style={{ fontSize: '1.2rem', padding: '0.8rem 2rem' }}>
                    {isSpinning ? 'Picking...' : '🎯 Pick Random Student'}
                  </button>
                  {chosenStudent && !isSpinning && <button onClick={() => setChosenStudent(null)} className="btn btn-outline" style={{ marginLeft: '0.5rem' }}>Reset</button>}
                </div>
              )}

              {/* ASK ME */}
              {livePerformGame === 'ask-me' && (
                <div className="card">
                  <h4 style={{ marginBottom: '1rem' }}>✋ Ask Me! — Hand Raise Tracker</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <button onClick={pickFromRaisedHands} className="btn btn-primary btn-sm" disabled={raisedHands.size === 0}>
                      Pick from {raisedHands.size} Raised Hand{raisedHands.size !== 1 ? 's' : ''}
                    </button>
                    <button onClick={clearHands} className="btn btn-outline btn-sm">Clear All Hands</button>
                  </div>
                  {chosenStudent && (
                    <div className="card" style={{ background: 'rgba(0,206,201,0.1)', marginBottom: '1rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem' }}>✋ Called on:</div>
                      <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>{chosenStudent.english_name || chosenStudent.student_id}</div>
                    </div>
                  )}
                  {askStudents.length === 0 ? (
                    <p style={{ color: 'var(--text-dim)' }}>Load students first using the grade level selector above.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.4rem' }}>
                      {askStudents.map(s => {
                        const raised = raisedHands.has(s.student_id);
                        return (
                          <button key={s.student_id} onClick={() => toggleHand(s.student_id)}
                            style={{ padding: '0.5rem', borderRadius: 8, cursor: 'pointer', textAlign: 'center', background: raised ? 'rgba(0,206,201,0.2)' : 'var(--bg-input)', border: `2px solid ${raised ? 'var(--secondary)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                            <div style={{ fontSize: '1.2rem' }}>{raised ? '✋' : '🙅'}</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: raised ? 700 : 400, color: raised ? 'var(--secondary)' : 'var(--text-dim)' }}>{s.english_name || s.student_id}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{s.section}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* REVEAL ME */}
              {livePerformGame === 'reveal-me' && (
                <div className="card">
                  <h4 style={{ marginBottom: '1rem' }}>🔮 Reveal Me! — One-by-One Reveal</h4>
                  {revealIndex < 0 ? (
                    <div>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1rem' }}>Add items to reveal one by one with suspense (answers, words, images URLs, etc.)</p>
                      {revealItems.map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                          <span style={{ fontWeight: 700, minWidth: 24, color: 'var(--text-dim)' }}>{i + 1}.</span>
                          <input placeholder={`Item ${i + 1}`} value={item.text} onChange={e => { const ni = [...revealItems]; ni[i] = { text: e.target.value }; setRevealItems(ni); }} style={{ flex: 1 }} />
                          {revealItems.length > 1 && <button onClick={() => setRevealItems(revealItems.filter((_, idx) => idx !== i))} style={{ background: 'none', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>✕</button>}
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button onClick={() => setRevealItems([...revealItems, { text: '' }])} className="btn btn-outline btn-sm">+ Add Item</button>
                        <button onClick={() => { if (revealItems.filter(i => i.text).length === 0) { showToast('Add items first', 'error'); return; } setRevealIndex(0); }} className="btn btn-primary">Start Reveal</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Item {revealIndex + 1} of {revealItems.filter(i => i.text).length}</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-bright)', padding: '2rem', background: 'var(--bg-input)', borderRadius: 12, marginBottom: '1.5rem', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {revealItems.filter(i => i.text)[revealIndex]?.text || ''}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button onClick={() => setRevealIndex(Math.max(0, revealIndex - 1))} className="btn btn-outline" disabled={revealIndex === 0}>← Previous</button>
                        {revealIndex < revealItems.filter(i => i.text).length - 1
                          ? <button onClick={() => setRevealIndex(revealIndex + 1)} className="btn btn-primary">Next →</button>
                          : <button onClick={() => { setRevealIndex(-1); }} className="btn btn-danger">Finish</button>
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STUDENT ROULETTE */}
              {livePerformGame === 'roulette' && (
                <div className="card" style={{ textAlign: 'center' }}>
                  <h4 style={{ marginBottom: '1.5rem' }}>🎡 Student Roulette — Spinning Wheel</h4>
                  {chooseStudents.length === 0 ? (
                    <p style={{ color: 'var(--text-dim)' }}>Load students first using the grade level selector above.</p>
                  ) : (
                    <div>
                      <div style={{ position: 'relative', width: 280, height: 280, margin: '0 auto 1.5rem', borderRadius: '50%', overflow: 'hidden', border: '4px solid var(--border)', background: 'var(--bg-input)' }}>
                        {chooseStudents.slice(0, 12).map((s, i, arr) => {
                          const angle = (360 / arr.length) * i;
                          const colors = ['#6c5ce7','#00cec9','#fd79a8','#fdcb6e','#55efc4','#74b9ff','#e17055','#a29bfe'];
                          return (
                            <div key={s.student_id} style={{ position: 'absolute', width: '50%', height: '50%', transformOrigin: '100% 100%', transform: `rotate(${angle}deg)`, background: colors[i % colors.length], opacity: 0.85, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '0.4rem', boxSizing: 'border-box' }}>
                              <span style={{ fontSize: '0.6rem', color: '#fff', fontWeight: 700, transform: `rotate(${-angle - (360 / arr.length) / 2}deg)`, maxWidth: 50, textAlign: 'center', wordBreak: 'break-word' }}>{(s.english_name || s.student_id).substring(0, 10)}</span>
                            </div>
                          );
                        })}
                        <div style={{ position: 'absolute', inset: '25%', borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                          {chosenStudent && !isSpinning ? <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--success)', textAlign: 'center', padding: '0.3rem' }}>{(chosenStudent.english_name || chosenStudent.student_id).substring(0, 12)}</span> : <span style={{ fontSize: '1.5rem' }}>🎡</span>}
                        </div>
                      </div>
                      {chosenStudent && !isSpinning && (
                        <div style={{ marginBottom: '1rem' }}>
                          <div style={{ fontSize: '1.5rem' }}>🎉 Selected:</div>
                          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>{chosenStudent.english_name || chosenStudent.student_id}</div>
                          <div style={{ color: 'var(--text-dim)' }}>{chosenStudent.section} | No. {chosenStudent.class_no}</div>
                        </div>
                      )}
                      <button onClick={spinChooseMe} disabled={isSpinning} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.7rem 2rem' }}>
                        {isSpinning ? 'Spinning...' : '🎡 Spin!'}
                      </button>
                      {chosenStudent && !isSpinning && <button onClick={() => setChosenStudent(null)} className="btn btn-outline" style={{ marginLeft: '0.5rem' }}>Reset</button>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══════════ GRADING SHEET TAB ══════════ */}
          {tab === 'grading-sheet' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Grading Sheet (Mode B)</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <select value={sheetGradeLevel} onChange={(e) => setSheetGradeLevel(e.target.value)} style={{ minWidth: 160 }}>
                  <option value="">Select grade level</option>
                  {allGradeLevels.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
                </select>
              </div>
              {sheetGradeLevel ? (
                <GradingSheetEditor mode="quiz" scopeId={sheetGradeLevel} scopeLabel={sheetGradeLevel} gradeLevels={allGradeLevels} canEdit showToast={showToast} />
              ) : (
                <p style={{ color: 'var(--text-dim)' }}>Choose a grade level to open the grading sheet.</p>
              )}
            </div>
          )}

          {/* ══════════ STUDENTS TAB ══════════ */}
          {tab === 'students' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Student Databases</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {allGradeLevels.map(gl => (<button key={gl} onClick={async () => { try { await downloadFile(`/api/students/export-excel?mode=quiz&gradeLevel=${encodeURIComponent(gl)}`, `quiz_${gl.replace(/\s+/g, '_')}.xlsx`); showToast('Excel downloaded'); } catch { showToast('Export failed', 'error'); } }} className="btn btn-secondary btn-sm">Export {gl}</button>))}
                {allGradeLevels.map(gl => (<button key={`${gl}-pdf`} onClick={async () => { try { await downloadFile(`/api/students/export-pdf?mode=quiz&gradeLevel=${encodeURIComponent(gl)}`, `quiz_${gl.replace(/\s+/g, '_')}.pdf`); showToast('PDF downloaded'); } catch { showToast('Export failed', 'error'); } }} className="btn btn-outline btn-sm">PDF {gl}</button>))}
                {allGradeLevels.map(gl => (<button key={`${gl}-sheet`} onClick={async () => { try { await downloadFile(`/api/quiz/grading-sheet/export?gradeLevel=${encodeURIComponent(gl)}`, `quiz_sheet_${gl.replace(/\s+/g, '_')}.xlsx`); showToast('Grading sheet downloaded'); } catch { showToast('Export failed', 'error'); } }} className="btn btn-outline btn-sm">Detailed {gl}</button>))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={importGradeLevel} onChange={(e) => setImportGradeLevel(e.target.value)} style={{ minWidth: 160 }}>
                  <option value="">Import grade level</option>
                  {allGradeLevels.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
                </select>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                  Import Students from Excel
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={async (e) => {
                    const file = e.target.files[0]; if (!file) return;
                    const gl = importGradeLevel || allGradeLevels[0];
                    if (!gl) { showToast('Select grade level for import', 'error'); return; }
                    const fd = new FormData(); fd.append('file', file); fd.append('mode', 'quiz'); fd.append('gradeLevel', gl);
                    const token = localStorage.getItem('eduverse_token');
                    try { const res = await fetch('/api/students/import-excel', { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} }); const data = await res.json(); showToast(data.message || (data.success ? 'Import complete' : 'Import failed'), data.success ? 'success' : 'error'); if (data.success) loadStudentDbs(); } catch { showToast('Import failed', 'error'); }
                    e.target.value = '';
                  }} />
                </label>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Excel must have columns: STUDENT ID, THAI NAME, ENGLISH NAME, SECTION, CLASS NUMBER, GRADE LEVEL</span>
              </div>
              {studentDbs.map(d => (<div key={d.id} className="card" style={{ marginBottom: '0.5rem' }}><strong>{d.name}</strong> — {d.grade_level}<span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>{d.status}</span></div>))}
              {studentDbs.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No student databases configured</p>}
            </div>
          )}

          {/* ══════════ TEAMS TAB ══════════ */}
          {tab === 'teams' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Mode B Team Groups</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>Drag a student row onto a group card to move them, or onto Unassigned to remove from a group.</p>
              <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={teamGradeLevel} onChange={(e) => setTeamGradeLevel(e.target.value)}><option value="">Grade level</option>{allGradeLevels.map((gl) => <option key={gl} value={gl}>{gl}</option>)}</select>
                <input placeholder="Section" value={teamSection} onChange={(e) => setTeamSection(e.target.value)} />
                <input type="number" min="1" value={teamGroupCount} onChange={(e) => setTeamGroupCount(parseInt(e.target.value, 10) || 1)} style={{ width: 90 }} />
                <button onClick={autoGenerateTeams} className="btn btn-secondary btn-sm">Auto Group</button>
                <button onClick={fetchTeamGroups} className="btn btn-outline btn-sm">Load</button>
                <button onClick={deleteAllGroups} className="btn btn-danger btn-sm">Delete Grouping</button>
              </div>
              {(teamOverview.groups || []).map((g, gi) => (
                <div key={g.groupName} className="card" style={{ marginBottom: '0.5rem', outline: dragOverGroup === g.groupName ? '2px solid var(--accent, #6c8cff)' : '1px dashed transparent', transition: 'outline-color 120ms ease', background: dragOverGroup === g.groupName ? 'rgba(108,140,255,0.08)' : undefined }}
                  onDragOver={(e) => { onTeamDropZoneOver(e); if (dragOverGroup !== g.groupName) setDragOverGroup(g.groupName); }}
                  onDragLeave={() => setDragOverGroup((d) => d === g.groupName ? null : d)}
                  onDrop={(e) => onTeamDropOnGroup(e, g.groupName)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <strong>Group {gi + 1} — {g.groupName} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({(g.members || []).length} members)</span></strong>
                    <button type="button" disabled={teamBusy} onClick={() => deleteOneGroup(g.groupName)} className="btn btn-danger btn-sm">Delete Group</button>
                  </div>
                  {(g.members || []).map((m) => (
                    <div key={m.student_id} draggable={!!teamGradeLevel && !!teamSection} onDragStart={(e) => onTeamMemberDragStart(e, m.student_id)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.4rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)', cursor: teamGradeLevel && teamSection ? 'grab' : 'default', alignItems: 'center' }}>
                      <span>{m.student_id}</span><span>{m.thai_name}</span><span>{m.english_name}</span><span>{m.class_no}</span>
                      <input placeholder="Move to group" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { moveMember(m.student_id, e.currentTarget.value.trim()); e.currentTarget.value = ''; } }} />
                      <button type="button" disabled={teamBusy} onClick={() => removeMember(m.student_id)} className="btn btn-outline btn-sm">Remove</button>
                    </div>
                  ))}
                </div>
              ))}
              {(teamOverview.unassigned || []).length > 0 && (
                <div className="card" style={{ outline: dragOverGroup === '__unassigned__' ? '2px solid var(--danger)' : '1px dashed transparent', background: dragOverGroup === '__unassigned__' ? 'rgba(255,108,108,0.06)' : undefined, transition: 'outline-color 120ms ease' }}
                  onDragOver={(e) => { onTeamDropZoneOver(e); if (dragOverGroup !== '__unassigned__') setDragOverGroup('__unassigned__'); }}
                  onDragLeave={() => setDragOverGroup((d) => d === '__unassigned__' ? null : d)} onDrop={onTeamDropUnassigned}>
                  <strong>Unassigned — drop here to remove from group ({teamOverview.unassigned.length})</strong>
                  {teamOverview.unassigned.map((m) => (
                    <div key={m.student_id} draggable={!!teamGradeLevel && !!teamSection} onDragStart={(e) => onTeamMemberDragStart(e, m.student_id)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.4rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)', cursor: teamGradeLevel && teamSection ? 'grab' : 'default', alignItems: 'center' }}>
                      <span>{m.student_id}</span><span>{m.thai_name}</span><span>{m.english_name}</span><span>{m.class_no}</span>
                      <input placeholder="Add to group" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { moveMember(m.student_id, e.currentTarget.value.trim()); e.currentTarget.value = ''; } }} />
                    </div>
                  ))}
                </div>
              )}
              {teamGroups.length === 0 && (teamOverview.groups || []).length === 0 && <p style={{ color: 'var(--text-dim)' }}>No team groups loaded yet.</p>}
            </div>
          )}

          {/* ══════════ RECORDING TAB ══════════ */}
          {tab === 'recording' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Record Quiz/Live Scores to Mode A</h3>
              <div className="card" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: '0.5rem' }}>
                <select value={mappingForm.gradeLevel} onChange={(e) => setMappingForm({ ...mappingForm, gradeLevel: e.target.value })}><option value="">Grade level</option>{allGradeLevels.map((gl) => <option key={gl} value={gl}>{gl}</option>)}</select>
                <select value={mappingForm.targetDatabaseId} onChange={(e) => setMappingForm({ ...mappingForm, targetDatabaseId: e.target.value })}><option value="">Mode A Database</option>{gradeDatabases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                <select value={mappingForm.period} onChange={(e) => setMappingForm({ ...mappingForm, period: e.target.value })}><option value="midterm">Midterm</option><option value="final_initial">Final Initial</option><option value="final_final">Final Final</option></select>
                <select value={mappingForm.scoreType} onChange={(e) => setMappingForm({ ...mappingForm, scoreType: e.target.value })}><option value="individual">Individual</option><option value="group">Group</option></select>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', minWidth: 0 }}>
                  <input type="number" min="0" max="4" placeholder="Slot (0-4)" value={mappingForm.slot} onChange={(e) => setMappingForm({ ...mappingForm, slot: e.target.value })} style={{ width: 100 }} />
                  {mappingForm.targetDatabaseId && slotHints?.[mappingForm.period]?.[mappingForm.scoreType] && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.3 }}>Free: {(slotHints[mappingForm.period][mappingForm.scoreType].freeSlots || []).join(', ') || '—'}{slotHints[mappingForm.period][mappingForm.scoreType].suggestedSlot != null ? ` · suggested ${slotHints[mappingForm.period][mappingForm.scoreType].suggestedSlot}` : ''}</span>
                  )}
                </div>
                <select value={mappingForm.sourceType} onChange={(e) => setMappingForm({ ...mappingForm, sourceType: e.target.value })}><option value="QUIZ_ATTEMPT">Quiz Attempt</option><option value="LIVE_GAME">Live Game</option></select>
                <select value={mappingForm.sourceQuizId} onChange={(e) => setMappingForm({ ...mappingForm, sourceQuizId: e.target.value })}><option value="">All quizzes/games</option>{quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}</select>
                <button onClick={createMapping} className="btn btn-primary btn-sm">Create Mapping</button>
                <button onClick={fetchScoreMappings} className="btn btn-outline btn-sm">Refresh Mappings</button>
                <button onClick={fetchRecordEntries} className="btn btn-outline btn-sm">Load Records</button>
              </div>
              {scoreMappings.length > 0 && (
                <table>
                  <thead><tr><th>ID</th><th>Grade</th><th>Target DB</th><th>Target Slot</th><th>Source</th><th>Apply</th><th /></tr></thead>
                  <tbody>{scoreMappings.map((m) => (<tr key={m.id}><td>{m.id}</td><td>{m.grade_level}</td><td>{m.target_database_id}</td><td>{m.period} / {m.score_type} / slot {m.slot + 1}</td><td>{m.source_type}{m.source_quiz_id ? ` (${m.source_quiz_id})` : ''}</td><td><button type="button" onClick={() => applyMapping(m.id)} className="btn btn-secondary btn-sm">Record Now</button></td><td><button type="button" onClick={() => deleteMapping(m.id)} className="btn btn-danger btn-sm">Delete</button></td></tr>))}</tbody>
                </table>
              )}
              {scoreMappings.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No mappings yet.</p>}
              {recordEntries.quizAttempts.length > 0 && (
                <div className="card" style={{ marginTop: '1rem' }}>
                  <h4>Quiz Attempt Records</h4>
                  {recordEntries.quizAttempts.slice(0, 120).map((r) => (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) minmax(140px,1.2fr) 72px 56px 72px 72px', gap: '0.4rem', padding: '0.25rem 0', alignItems: 'center' }}>
                      <span style={{ minWidth: 0 }}>{r.quiz_title}</span><span style={{ minWidth: 0 }}>{r.student_id} — {r.student_name}</span><span>{r.grade_level}</span><span>{r.percentage}%</span>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => openAttemptReview(r.id)}>Review</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteRecordEntry('QUIZ_ATTEMPT', r.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
              {recordEntries.liveGames.length > 0 && (
                <div className="card" style={{ marginTop: '1rem' }}>
                  <h4>Live Game Records</h4>
                  {recordEntries.liveGames.slice(0, 80).map((r) => (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '0.4rem', padding: '0.25rem 0' }}>
                      <span>{r.quiz_title} | Game ID: {r.id}</span>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteRecordEntry('LIVE_GAME', r.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ══════════ VIEW SECTIONS MODAL ══════════ */}
      {viewSectionsQuiz && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setViewSectionsQuiz(null)}>
          <div role="dialog" aria-modal="true" style={{ background: 'var(--bg-card)', borderRadius: 12, width: '95%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto', padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>View Sections — {viewSectionsQuiz.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>Auto-refreshes every 5 seconds</p>
              </div>
              <button onClick={() => setViewSectionsQuiz(null)} className="btn btn-outline btn-sm">Close</button>
            </div>

            {viewSectionsData && (
              <div>
                {/* Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                  {[
                    { label: 'Total Students', val: viewSectionsData.students?.length || 0 },
                    { label: 'Not Started', val: (viewSectionsData.students || []).filter(s => s.status === 'NOT_STARTED').length },
                    { label: 'In Progress', val: (viewSectionsData.students || []).filter(s => s.status === 'IN_PROGRESS').length },
                    { label: 'Completed', val: (viewSectionsData.students || []).filter(s => s.status === 'COMPLETED').length },
                    { label: 'Blocked', val: (viewSectionsData.students || []).filter(s => s.status === 'BLOCKED').length },
                  ].map(s => <StatCard key={s.label} label={s.label} value={s.val} />)}
                </div>

                {/* Section filter */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <button onClick={() => setViewSectionsFilter('ALL')} className={`btn btn-sm ${viewSectionsFilter === 'ALL' ? 'btn-secondary' : 'btn-outline'}`}>All</button>
                  {(viewSectionsData.sections || []).map(sec => (
                    <button key={sec.section} onClick={() => setViewSectionsFilter(sec.section)} className={`btn btn-sm ${viewSectionsFilter === sec.section ? 'btn-secondary' : 'btn-outline'}`}>{sec.section} ({sec.students.length})</button>
                  ))}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr><th>No.</th><th>Student ID</th><th>Name</th><th>Section</th><th>Status</th><th>Score</th><th>Tab Switches</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {(viewSectionsFilter === 'ALL' ? viewSectionsData.students : (viewSectionsData.sections.find(s => s.section === viewSectionsFilter)?.students || []))?.map((s, i) => (
                        <tr key={s.student_id}>
                          <td>{s.class_no || i + 1}</td>
                          <td>{s.student_id}</td>
                          <td>{s.english_name || s.thai_name}</td>
                          <td>{s.section}</td>
                          <td><StatusBadge status={s.status} /></td>
                          <td>{s.score !== null && s.score !== undefined ? `${parseFloat(s.score).toFixed(1)}%` : '—'}</td>
                          <td>{s.tabSwitchCount || 0}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              {s.status === 'COMPLETED' && <button onClick={() => forceRetake(viewSectionsQuiz.id, s.student_id)} className="btn btn-outline btn-sm" style={{ fontSize: '0.75rem' }}>Retake</button>}
                              {s.status === 'IN_PROGRESS' && <button onClick={() => blockStudent(viewSectionsQuiz.id, s.student_id)} className="btn btn-danger btn-sm" style={{ fontSize: '0.75rem' }}>Block</button>}
                              {s.status === 'BLOCKED' && <button onClick={() => unblockStudent(viewSectionsQuiz.id, s.student_id)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>Unblock</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!viewSectionsData && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>Loading...</div>}
          </div>
        </div>
      )}

      {/* ══════════ EDIT QUIZ MODAL ══════════ */}
      {editingQuiz && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setEditingQuiz(null)}>
          <div role="dialog" aria-modal="true" style={{ background: 'var(--bg-card)', borderRadius: 12, width: '95%', maxWidth: 800, maxHeight: '90vh', overflow: 'auto', padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Edit Quiz — {editingQuiz.title}</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={saveEditQuiz} className="btn btn-primary btn-sm">Save Changes</button>
                <button onClick={() => setEditingQuiz(null)} className="btn btn-outline btn-sm">Cancel</button>
              </div>
            </div>

            {renderQuizSettingsForm(editForm, setEditForm, toggleEditGradeLevel)}

            {renderQuestionList(editForm.questions, removeEditQuestion)}

            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-input)', borderRadius: 8 }}>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>To add new questions to this quiz, use the Create tab after closing. Existing questions can be removed above.</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ATTEMPT REVIEW MODAL ══════════ */}
      {reviewAttempt && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setReviewAttempt(null)}>
          <div role="dialog" aria-modal="true" className="card" style={{ maxWidth: 760, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h4 style={{ margin: 0 }}>Attempt Review</h4>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setReviewAttempt(null)}>Close</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              {reviewAttempt.student_name} ({reviewAttempt.student_id}) · {reviewAttempt.grade_level} · Section {reviewAttempt.section || '—'} · Score {reviewAttempt.score}/{reviewAttempt.total_points} ({reviewAttempt.percentage}%) ·{' '}
              <span className={`badge ${reviewAttempt.result === 'PASSED' ? 'badge-success' : 'badge-danger'}`}>{reviewAttempt.result || '—'}</span>
            </p>
            <table style={{ fontSize: '0.85rem' }}>
              <thead><tr><th>#</th><th>Question</th><th>Answer</th><th>Correct</th><th>Pts</th><th>OK</th></tr></thead>
              <tbody>
                {(reviewAttempt.answers || []).map((a, idx) => (
                  <tr key={a.question_id || idx}><td>{idx + 1}</td><td style={{ maxWidth: 240 }}>{a.question_text}</td><td>{a.student_answer}</td><td>{a.correct_answer}</td><td>{a.points_earned}</td><td>{Number(a.is_correct) === 1 ? '✓' : '—'}</td></tr>
                ))}
              </tbody>
            </table>
            {(reviewAttempt.answers || []).length === 0 && <p style={{ color: 'var(--text-dim)' }}>No answers stored for this attempt.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
