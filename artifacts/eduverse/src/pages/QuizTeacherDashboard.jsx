import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, downloadFile, uploadFile } from '../api';
import { KahootHostView } from './KahootGame';
import GradingSheetEditor from '../components/GradingSheetEditor';
import GameWindow from '../components/GameWindow';
import WordHuntBuilder from '../components/WordHuntBuilder';
import RatingGridBuilder from '../components/RatingGridBuilder';
import QuizPreview from '../components/QuizPreview';

const QUESTION_TYPES = [
  { id: 'MCQ', label: 'Multiple Choice (A-D)' },
  { id: 'TF', label: 'True / False' },
  { id: 'MATCHING', label: 'Matching' },
  { id: 'MULTIPLE_RESPONSE', label: 'Multiple Response' },
  { id: 'SEQUENCING', label: 'Sequencing' },
  { id: 'RATING_GRID', label: 'Rating Grid' },
  { id: 'WORD_HUNT', label: 'Word Hunt' },
];

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function StatusBadge({ status }) {
  const map = {
    NOT_STARTED: { label: 'Logging in', cls: 'badge-warning' },
    IN_PROGRESS: { label: 'Taking the exam', cls: 'badge-info' },
    COMPLETED: { label: 'Finished', cls: 'badge-success' },
    BLOCKED: { label: 'Blocked', cls: 'badge-danger' },
  };
  const s = map[status] || { label: status, cls: 'badge-warning' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

function MediaPreview({ mediaType, mediaUrl }) {
  if (!mediaUrl) return null;
  if (mediaType === 'image') return <img src={mediaUrl} alt="" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 4, objectFit: 'cover' }} />;
  if (mediaType === 'audio') return <audio src={mediaUrl} controls style={{ height: 28, maxWidth: 160 }} />;
  if (mediaType === 'video') return <video src={mediaUrl} controls style={{ maxWidth: 160, maxHeight: 90, borderRadius: 4 }} />;
  return <a href={mediaUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem' }}>View Media</a>;
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
  const [activePart, setActivePart] = useState('QUIZ');
  const [introMessage, setIntroMessage] = useState('Welcome to the quiz!');
  const [passMessage, setPassMessage] = useState('Congratulations. You passed!');
  const [failMessage, setFailMessage] = useState('I\'m so sorry. You Failed!');
  const [editingQuestionIdx, setEditingQuestionIdx] = useState(-1);

  // ── New: Edit quiz ──────────────────────────────────────────────
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [editForm, setEditForm] = useState(defaultForm);
  const [editQForm, setEditQForm] = useState({ questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1 });

  // ── New: View Sections ──────────────────────────────────────────
  const [viewSectionsQuiz, setViewSectionsQuiz] = useState(null);
  const [viewSectionsData, setViewSectionsData] = useState(null);
  const [viewSectionsFilter, setViewSectionsFilter] = useState('ALL');
  const [viewSectionsPopup, setViewSectionsPopup] = useState(null);
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
  const [perfDbId, setPerfDbId] = useState('');
  const [perfSection, setPerfSection] = useState('');
  const [perfSections, setPerfSections] = useState([]);
  const [perfList, setPerfList] = useState([]);
  const [perfStudents, setPerfStudents] = useState([]);
  const [perfScores, setPerfScores] = useState({});
  const [perfActiveGame, setPerfActiveGame] = useState(null);
  const [perfAddPopup, setPerfAddPopup] = useState(false);
  const [perfAddForm, setPerfAddForm] = useState({ title: '', lessonNumber: '', performanceType: 'CHOOSE_ME', maxScore: 100 });
  const [perfSettings, setPerfSettings] = useState({ allowedPercentageWeight: 100 });
  const [perfScoredStudents, setPerfScoredStudents] = useState(new Set());
  const [perfShuffledStudents, setPerfShuffledStudents] = useState([]);
  const [perfFlippedCard, setPerfFlippedCard] = useState(null);
  const [perfCardScore, setPerfCardScore] = useState('');
  const [perfAskPair, setPerfAskPair] = useState({ asker: null, answerer: null });
  const [perfAskScores, setPerfAskScores] = useState({ askerScore: '', answererScore: '' });
  const [perfGameWindow, setPerfGameWindow] = useState(null);
  const [quizPreview, setQuizPreview] = useState(null);

  useEffect(() => { loadQuizzes(); loadGradeLevels(); loadStudentDbs(); loadGradeDatabases(); }, []);

  // Shuffle students for Choose Me whenever perfStudents changes
  useEffect(() => {
    if (perfStudents.length > 0) {
      setPerfShuffledStudents(shuffleArray(perfStudents));
    } else {
      setPerfShuffledStudents([]);
    }
  }, [perfStudents]);

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
    const res = await api.post('/quiz/create', { ...form, gradeLevel: firstGl, createdBy: user.name || user.id || '', quizMode, strictMode: form.strictMode, introMessage, passMessage, failMessage });
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

  // ── Performance functions ──────────────────────────────────────
  const loadPerfSections = async (dbId) => {
    if (!dbId) return;
    const res = await api.get(`/grades/database/${dbId}`);
    if (res.success) {
      const secs = [...new Set((res.students || []).map(s => s.section).filter(Boolean))].sort();
      setPerfSections(secs);
    }
  };
  const loadPerfList = async () => {
    if (!perfDbId || !perfSection) return;
    const res = await api.get(`/performance/list?databaseId=${perfDbId}&section=${encodeURIComponent(perfSection)}`);
    if (res.success) setPerfList(res.data || []);
  };
  const loadPerfStudents = async (glOverride, secOverride) => {
    const gl = glOverride || chooseGL;
    const sec = secOverride || perfSection;
    if (!sec) return;
    // Try loading from database first if grade level not set
    if (perfDbId && sec) {
      const dbRes = await api.get(`/grades/database/${perfDbId}`);
      if (dbRes.success && dbRes.students) {
        const filtered = dbRes.students.filter(s => s.section === sec);
        if (filtered.length > 0) {
          const mapped = filtered.map(s => ({
            student_id: s.student_id, thai_name: s.thai_name, english_name: s.english_name,
            class_no: s.class_no, section: s.section, grade_level: s.grade_level
          })).sort((a, b) => {
            const aNo = parseInt(a.class_no) || 999999;
            const bNo = parseInt(b.class_no) || 999999;
            return aNo - bNo;
          });
          setPerfStudents(mapped);
          setChooseStudents(mapped);
          setAskStudents(mapped);
          return;
        }
      }
    }
    if (!gl) return;
    const params = new URLSearchParams({ gradeLevel: gl, section: sec });
    const res = await api.get(`/quiz/students?${params}`);
    if (res.success) {
      setPerfStudents(res.data || []);
      setChooseStudents(res.data || []);
      setAskStudents(res.data || []);
    }
  };
  const createPerformance = async () => {
    if (!perfDbId || !perfSection || !perfAddForm.title) { showToast('Fill required fields', 'error'); return; }
    const res = await api.post('/performance/create', { databaseId: Number(perfDbId), gradeLevel: chooseGL, section: perfSection, ...perfAddForm });
    if (res.success) { showToast('Performance created'); setPerfAddPopup(false); setPerfAddForm({ title: '', lessonNumber: '', performanceType: 'CHOOSE_ME', maxScore: 100 }); loadPerfList(); }
    else showToast(res.message || 'Failed', 'error');
  };
  const deletePerformance = async (id) => {
    if (!confirm('Delete this performance?')) return;
    const res = await api.del(`/performance/${id}`);
    if (res.success) { showToast('Deleted'); loadPerfList(); }
    else showToast(res.message || 'Failed', 'error');
  };
  const startPerfGame = async (perf) => {
    const res = await api.get(`/performance/${perf.id}`);
    if (res.success) {
      setPerfActiveGame({ ...perf, scores: res.data.scores || [] });
      const scored = new Set((res.data.scores || []).filter(s => s.score > 0).map(s => s.student_id));
      setPerfScoredStudents(scored);
      setPerfScores({});
      (res.data.scores || []).forEach(s => { setPerfScores(prev => ({ ...prev, [s.student_id]: s.score })); });
    }
  };
  const savePerfScore = async (studentId, score) => {
    if (!perfActiveGame) return;
    const res = await api.post(`/performance/${perfActiveGame.id}/score`, { studentId, score: Number(score) || 0 });
    if (res.success) {
      showToast('Score saved');
      setPerfScoredStudents(prev => new Set([...prev, studentId]));
      setPerfScores(prev => ({ ...prev, [studentId]: Number(score) || 0 }));
    } else showToast(res.message || 'Failed', 'error');
  };
  const savePerfSettings = async () => {
    if (!perfDbId) return;
    const res = await api.post('/performance/settings', { databaseId: Number(perfDbId), allowedPercentageWeight: perfSettings.allowedPercentageWeight });
    if (res.success) showToast('Settings saved');
    else showToast(res.message || 'Failed', 'error');
  };
  const selectRandomPair = () => {
    const available = perfStudents.filter(s => !perfScoredStudents.has(s.student_id));
    if (available.length < 2) {
      setPerfAskPair({ asker: null, answerer: null });
      showToast('THE TEACHER WILL ASK', 'info');
      return;
    }
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    setPerfAskPair({ asker: shuffled[0], answerer: shuffled[1] });
    setPerfAskScores({ askerScore: '', answererScore: '' });
  };
  const shuffleRevealStudent = () => {
    const available = perfStudents.filter(s => !perfScoredStudents.has(s.student_id));
    if (available.length === 0) { showToast('All students scored!'); return; }
    setIsSpinning(true);
    let count = 0;
    const max = 12 + Math.floor(Math.random() * 8);
    const interval = setInterval(() => {
      const rand = available[Math.floor(Math.random() * available.length)];
      setPerfFlippedCard(rand);
      count++;
      if (count >= max) { clearInterval(interval); setIsSpinning(false); }
    }, 100 + count * 10);
  };

  // ── Computed ───────────────────────────────────────────────────
  // ── Media upload helper ─────────────────────────────────────────
  const handleMediaUpload = async (file) => {
    const res = await uploadFile('/quiz/media/upload', file);
    if (res.success) return res.data;
    showToast(res.message || 'Upload failed', 'error');
    return null;
  };

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
          <button onClick={() => setViewSectionsPopup(q)} className="btn btn-outline btn-sm" style={{ borderColor: '#00cec9', color: '#00cec9' }}>View Sections</button>
          <button onClick={async () => { const res = await api.get(`/quiz/${q.id}`); if (res.success) setQuizPreview({ ...q, questions: res.data?.questions || [], introMessage: res.data?.intro_message, passMessage: res.data?.pass_message, failMessage: res.data?.fail_message }); else showToast('Failed to load quiz', 'error'); }} className="btn btn-outline btn-sm" style={{ borderColor: '#00cec9', color: '#00cec9' }}>View Quiz</button>
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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="number" placeholder="Points" value={normalQPoints} onChange={e => setNormalQPoints(parseInt(e.target.value) || 1)} style={{ width: 80 }} />
          <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Media:</label>
          <input type="file" accept="image/*,video/*,audio/*" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const data = await handleMediaUpload(f); if (data) { setNormalQMediaType(data.mediaType); setNormalQMediaUrl(data.url); } }} style={{ maxWidth: 200, fontSize: '0.75rem' }} />
          {normalQMediaUrl && <MediaPreview mediaType={normalQMediaType} mediaUrl={normalQMediaUrl} />}
          {normalQMediaUrl && <button onClick={() => { setNormalQMediaType(''); setNormalQMediaUrl(''); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem' }}>Remove</button>}
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
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Build a customizable rating scale grid (Google Forms style)</p>
            <RatingGridBuilder onSave={(data) => {
              const extraData = JSON.stringify({ rows: data.rows, cols: data.columns.map(c => c.label), columns: data.columns, scoringMode: data.scoringMode });
              const q = { questionText: normalQText || 'Rating Grid', questionType: 'RATING_GRID', points: normalQPoints, mediaType: normalQMediaType, mediaUrl: normalQMediaUrl, correctAnswer: 'SURVEY', extraData };
              setForm(prev => ({ ...prev, questions: [...prev.questions, q] }));
              showToast('Rating Grid added');
              setNormalQText(''); setNormalQPoints(1);
            }} />
          </div>
        )}

        {normalQType === 'WORD_HUNT' && (
          <div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.4rem' }}>Create a word search puzzle with theme and hidden words</p>
            <WordHuntBuilder onSave={(data) => {
              const extraData = JSON.stringify(data);
              const q = { questionText: normalQText || `Word Hunt: ${data.theme || 'Puzzle'}`, questionType: 'WORD_HUNT', points: normalQPoints, mediaType: normalQMediaType, mediaUrl: normalQMediaUrl, correctAnswer: data.words.join(','), extraData };
              setForm(prev => ({ ...prev, questions: [...prev.questions, q] }));
              showToast('Word Hunt puzzle added');
              setNormalQText(''); setNormalQPoints(1);
            }} />
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
  const [liveQType, setLiveQType] = useState('MCQ');
  const renderLiveQuizQBuilder = () => (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h4 style={{ marginBottom: '0.8rem' }}>Add Question ({form.questions.length} added) — MCQ + True/False for Live Game</h4>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Type:</label>
          <select value={liveQType} onChange={e => setLiveQType(e.target.value)} style={{ width: 180 }}>
            <option value="MCQ">Multiple Choice (A-D)</option>
            <option value="TF">True / False</option>
          </select>
        </div>
        <textarea placeholder="Question text" value={questionForm.questionText} onChange={e => setQuestionForm({ ...questionForm, questionText: e.target.value })} rows={2} style={{ width: '100%' }} />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Media:</label>
          <input type="file" accept="image/*,video/*,audio/*" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const data = await handleMediaUpload(f); if (data) { setQuestionForm(prev => ({ ...prev, mediaType: data.mediaType, mediaUrl: data.url })); } }} style={{ maxWidth: 200, fontSize: '0.75rem' }} />
          {questionForm.mediaUrl && <MediaPreview mediaType={questionForm.mediaType} mediaUrl={questionForm.mediaUrl} />}
          {questionForm.mediaUrl && <button onClick={() => setQuestionForm(prev => ({ ...prev, mediaType: '', mediaUrl: '' }))} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem' }}>Remove</button>}
        </div>
        {liveQType === 'MCQ' && (
          <>
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
          </>
        )}
        {liveQType === 'TF' && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
              <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={normalQTF === 'True'} onChange={() => setNormalQTF('True')} />True</label>
              <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}><input type="radio" checked={normalQTF === 'False'} onChange={() => setNormalQTF('False')} />False</label>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Correct answer: {normalQTF}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="number" placeholder="Points" value={questionForm.points} onChange={e => setQuestionForm({ ...questionForm, points: parseInt(e.target.value) })} style={{ width: 80 }} />
              <button onClick={() => { if (!questionForm.questionText.trim()) { showToast('Question text required', 'error'); return; } setForm(prev => ({ ...prev, questions: [...prev.questions, { ...questionForm, questionType: 'TF', choiceA: 'True', choiceB: 'False', choiceC: '', choiceD: '', correctAnswer: normalQTF }] })); setQuestionForm({ questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '', correctAnswer: '', points: 1 }); showToast('TF Question added'); }} className="btn btn-secondary btn-sm">Add TF Question</button>
            </div>
          </div>
        )}
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
                  <h3 style={{ marginBottom: '1.5rem' }}>Create Quiz</h3>
                  {renderQuizSettingsForm(form, setForm, toggleGradeLevel)}
                  <div style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ marginBottom: '1rem' }}>Select Mode:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', maxWidth: 600, marginBottom: '1.5rem' }}>
                      <button onClick={() => setQuizMode('NORMAL_QUIZ')} style={{ padding: '1.5rem', borderRadius: 12, background: quizMode === 'NORMAL_QUIZ' ? 'rgba(0,206,201,0.2)' : 'var(--bg-input)', border: `2px solid ${quizMode === 'NORMAL_QUIZ' ? '#00cec9' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.3rem' }}>📝</div>
                        <h4 style={{ color: '#00cec9', marginBottom: '0.2rem', fontSize: '0.95rem' }}>1. NORMAL QUIZ</h4>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Individual student, 7 question types</p>
                      </button>
                      <button onClick={() => setQuizMode('LIVE_GAME')} style={{ padding: '1.5rem', borderRadius: 12, background: quizMode === 'LIVE_GAME' ? 'rgba(108,92,231,0.2)' : 'var(--bg-input)', border: `2px solid ${quizMode === 'LIVE_GAME' ? '#6c5ce7' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.3rem' }}>🎮</div>
                        <h4 style={{ color: '#6c5ce7', marginBottom: '0.2rem', fontSize: '0.95rem' }}>2. LIVE GAME</h4>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Kahoot-style, MCQ + True/False</p>
                      </button>
                    </div>
                    <button onClick={() => { if (!form.title.trim()) { showToast('Title required', 'error'); return; } setCreateStep(2); setActivePart('QUIZ'); }} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.7rem 2.5rem' }}>
                      SAVE & Continue to Quiz Editor
                    </button>
                  </div>
                </div>
              )}

              {createStep === 2 && quizMode === 'NORMAL_QUIZ' && (
                <div style={{ display: 'flex', gap: '0', minHeight: 'calc(100vh - 200px)' }}>
                  {/* LEFT PANEL — Parts Navigation (1/3) */}
                  <div style={{ width: '33%', minWidth: 220, maxWidth: 320, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '1rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <button onClick={() => setCreateStep(1)} className="btn btn-outline btn-sm">← Back</button>
                      <h4 style={{ margin: 0, fontSize: '0.9rem' }}>📝 NORMAL QUIZ</h4>
                    </div>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '1rem' }}>{form.title || 'Untitled Quiz'}</p>

                    {['INTRO', 'QUIZ', 'RESULT'].map(part => (
                      <button key={part} onClick={() => { setActivePart(part); setEditingQuestionIdx(-1); }}
                        style={{ display: 'block', width: '100%', padding: '0.8rem', marginBottom: '0.4rem', textAlign: 'left', borderRadius: 8, cursor: 'pointer', fontWeight: activePart === part ? 700 : 400,
                          background: activePart === part ? 'rgba(0,206,201,0.15)' : 'var(--bg-input)', border: `1px solid ${activePart === part ? '#00cec9' : 'var(--border)'}`, color: activePart === part ? '#00cec9' : 'var(--text)' }}>
                        {part === 'INTRO' ? '🏠 INTRO PART' : part === 'QUIZ' ? '📋 THE QUIZ PART' : '🏆 RESULT PART'}
                        {part === 'QUIZ' && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block' }}>{form.questions.length} question(s)</span>}
                      </button>
                    ))}

                    {activePart === 'QUIZ' && form.questions.length > 0 && (
                      <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.4rem' }}>Questions:</p>
                        {form.questions.map((q, i) => (
                          <div key={i} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.3rem' }}>
                            <button onClick={() => setEditingQuestionIdx(i)} style={{ flex: 1, textAlign: 'left', padding: '0.3rem 0.5rem', borderRadius: 4, background: editingQuestionIdx === i ? 'rgba(0,206,201,0.1)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text)' }}>
                              {i + 1}. [{q.questionType || 'MCQ'}] {(q.questionText || '').substring(0, 25)}{(q.questionText || '').length > 25 ? '...' : ''}
                            </button>
                            <button onClick={() => removeQuestion(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                      <button onClick={createQuiz} className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: '0.5rem' }}>Create Quiz</button>
                      <button onClick={() => { setCreateStep(1); resetForm(); }} className="btn btn-outline btn-sm" style={{ width: '100%' }}>Cancel</button>
                    </div>
                  </div>

                  {/* RIGHT PANEL — Content Editor (2/3) */}
                  <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
                    {activePart === 'INTRO' && (
                      <div>
                        <h3 style={{ marginBottom: '1rem' }}>🏠 INTRO PART</h3>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1rem' }}>Students will see this before starting the quiz.</p>
                        <div className="card" style={{ marginBottom: '1rem' }}>
                          <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Intro Message:</label>
                          <textarea value={introMessage} onChange={e => setIntroMessage(e.target.value)} rows={2} style={{ width: '100%', marginTop: '0.3rem' }} />
                        </div>
                        <div className="card" style={{ marginBottom: '1rem' }}>
                          <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Exam Title:</label>
                          <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-bright)' }}>{form.title || '(set in quiz settings)'}</p>
                        </div>
                        <div className="card" style={{ marginBottom: '1rem' }}>
                          <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Description:</label>
                          <p style={{ color: 'var(--text)' }}>Please click the &quot;START QUIZ&quot; button to start.</p>
                        </div>
                        <div className="card" style={{ background: 'rgba(0,206,201,0.05)', padding: '2rem', textAlign: 'center', borderRadius: 12 }}>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>Preview:</p>
                          <h2 style={{ color: 'var(--text-bright)', marginBottom: '0.5rem' }}>{introMessage}</h2>
                          <h3 style={{ color: 'var(--secondary)', marginBottom: '1rem' }}>{form.title}</h3>
                          <p style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>Please click the &quot;START QUIZ&quot; button to start.</p>
                          <button className="btn btn-primary" disabled>START QUIZ</button>
                        </div>
                      </div>
                    )}

                    {activePart === 'RESULT' && (
                      <div>
                        <h3 style={{ marginBottom: '1rem' }}>🏆 RESULT PART</h3>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '1rem' }}>Messages shown after quiz completion.</p>
                        <div className="card" style={{ marginBottom: '1rem' }}>
                          <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Passing Score Message:</label>
                          <textarea value={passMessage} onChange={e => setPassMessage(e.target.value)} rows={2} style={{ width: '100%', marginTop: '0.3rem' }} />
                        </div>
                        <div className="card" style={{ marginBottom: '1rem' }}>
                          <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Failed Score Message:</label>
                          <textarea value={failMessage} onChange={e => setFailMessage(e.target.value)} rows={2} style={{ width: '100%', marginTop: '0.3rem' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className="card" style={{ background: 'rgba(0,206,201,0.05)', textAlign: 'center', padding: '2rem' }}>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>If PASSED:</p>
                            <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)' }}>{passMessage}</p>
                          </div>
                          <div className="card" style={{ background: 'rgba(225,112,85,0.05)', textAlign: 'center', padding: '2rem' }}>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>If FAILED:</p>
                            <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--danger)' }}>{failMessage}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {activePart === 'QUIZ' && (
                      <div>
                        <h3 style={{ marginBottom: '1rem' }}>📋 THE QUIZ PART</h3>
                        {renderNormalQBuilder(form, form.questions, addNormalQuestion)}
                        {renderQuestionList(form.questions, removeQuestion)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {createStep === 2 && quizMode === 'LIVE_GAME' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                    <button onClick={() => setCreateStep(1)} className="btn btn-outline btn-sm">← Back</button>
                    <h3 style={{ margin: 0 }}>🎮 LIVE GAME Quiz Editor</h3>
                  </div>

                  {renderLiveQuizQBuilder()}
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
              <h3 style={{ marginBottom: '1rem' }}>Live Performance</h3>
              <style>{`
                @keyframes pixieDust { 0% { opacity: 1; transform: scale(1) translateY(0); } 100% { opacity: 0; transform: scale(0.3) translateY(-40px); } }
                @keyframes firefly { 0%, 100% { opacity: 0.2; transform: translate(0,0); } 50% { opacity: 0.8; transform: translate(${Math.random()*20-10}px, ${Math.random()*20-10}px); } }
                @keyframes glowPulse { 0%, 100% { text-shadow: 0 0 8px rgba(0,206,201,0.5); } 50% { text-shadow: 0 0 20px rgba(0,206,201,1), 0 0 40px rgba(108,92,231,0.5); } }
                @keyframes cardFlip { 0% { transform: rotateY(0deg); } 50% { transform: rotateY(90deg); } 100% { transform: rotateY(0deg); } }
                .enchanted-bg { background: linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 50%, #0d0d3a 100%); position: relative; overflow: hidden; }
                .tarot-card { width: 130px; height: 190px; border-radius: 10px; cursor: pointer; perspective: 1000px; transition: transform 0.3s, box-shadow 0.3s; position: relative; }
                .tarot-card:hover { transform: translateY(-8px); box-shadow: 0 8px 30px rgba(108,92,231,0.4); }
                .tarot-dark { background: linear-gradient(145deg, #1a1a2e, #16213e, #0f3460); border: 2px solid rgba(108,92,231,0.3); box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
                .tarot-light { background: linear-gradient(145deg, #f0f0ff, #e8e8ff, #d5d5ff); border: 2px solid rgba(108,92,231,0.5); box-shadow: 0 4px 15px rgba(108,92,231,0.2); }
                .tarot-number { font-size: 1.8rem; font-weight: 800; animation: glowPulse 2s infinite; color: #00cec9; }
              `}</style>

              {/* Database & Section selector */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={perfDbId} onChange={e => { const v = e.target.value; setPerfDbId(v); setPerfSection(''); setPerfList([]); if (v) loadPerfSections(v); }}>
                  <option value="">Select Database</option>
                  {gradeDatabases.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={chooseGL} onChange={e => setChooseGL(e.target.value)}>
                  <option value="">Grade Level</option>
                  {allGradeLevels.map(gl => <option key={gl} value={gl}>{gl}</option>)}
                </select>
                {perfSections.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {perfSections.map(sec => (
                      <button key={sec} onClick={() => { setPerfSection(sec); setTimeout(() => { loadPerfList(); loadPerfStudents(chooseGL, sec); }, 50); }} className={`btn btn-sm ${perfSection === sec ? 'btn-secondary' : 'btn-outline'}`}>
                        Section {sec}
                      </button>
                    ))}
                  </div>
                )}
                {perfSection && <button onClick={() => { loadPerfList(); loadPerfStudents(); }} className="btn btn-secondary btn-sm">Reload</button>}
              </div>

              {perfSection && (
                <div style={{ display: 'flex', gap: '1rem', minHeight: 'calc(100vh - 300px)' }}>
                  {/* Left navigation */}
                  <div style={{ width: 300, flexShrink: 0, background: 'var(--bg-card)', borderRadius: 8, padding: '1rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Performances</h4>
                      <button onClick={() => setPerfAddPopup(true)} className="btn btn-primary btn-sm" disabled={!perfSection}>+ ADD</button>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Allowed % Weight:</label>
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <input type="number" value={perfSettings.allowedPercentageWeight} onChange={e => setPerfSettings({ ...perfSettings, allowedPercentageWeight: Number(e.target.value) || 0 })} style={{ width: 70, fontSize: '0.85rem' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>%</span>
                        <button onClick={savePerfSettings} className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem' }}>Save</button>
                      </div>
                    </div>
                    {perfList.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No performances yet. Click + ADD to create one.</p>}
                    {perfList.map(p => {
                      const pScored = (perfActiveGame?.id === p.id) ? perfScoredStudents.size : 0;
                      const pTotal = perfStudents.length;
                      const unchosen = (perfActiveGame?.id === p.id) ? (pTotal - pScored) : null;
                      return (
                        <div key={p.id} style={{ padding: '0.5rem', marginBottom: '0.4rem', borderRadius: 6, background: perfActiveGame?.id === p.id ? 'rgba(0,206,201,0.15)' : 'var(--bg-input)', border: `1px solid ${perfActiveGame?.id === p.id ? '#00cec9' : 'var(--border)'}` }}>
                          <div onClick={() => startPerfGame(p)} style={{ cursor: 'pointer' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.title}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Lesson {p.lesson_number || '\u2014'} | {p.performance_type.replace(/_/g, ' ')} | Max: {p.max_score}</div>
                            {unchosen !== null && <div style={{ fontSize: '0.7rem', color: unchosen > 0 ? '#fdcb6e' : '#00b894', marginTop: '0.2rem' }}>{unchosen > 0 ? `${unchosen} students not chosen yet` : 'All students scored!'}</div>}
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.2rem', fontStyle: 'italic' }}>
                              {p.performance_type === 'CHOOSE_ME' && 'Click cards to flip & reveal students'}
                              {p.performance_type === 'ASK_ME' && 'Random pairs: one asks, one answers'}
                              {p.performance_type === 'REVEAL_ME' && 'Shuffle names to reveal a student'}
                              {p.performance_type === 'STUDENT_ROULETTE' && 'Spin the wheel to pick a student'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => { startPerfGame(p).then(() => setPerfGameWindow(p)); }} className="btn btn-primary btn-sm" style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem' }}>PLAY</button>
                            <button onClick={() => deletePerformance(p.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0.2rem' }} title="Delete">&#128465;</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right content — Game or scores */}
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {!perfActiveGame && (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                        <p style={{ fontSize: '1.2rem' }}>Select a performance from the list to start the game.</p>
                      </div>
                    )}

                    {perfActiveGame && (
                      <div>
                        {/* Game area with enchanted background */}
                        <div className="enchanted-bg" style={{ borderRadius: 12, padding: '2rem', marginBottom: '1rem', minHeight: 400 }}>
                          {/* Firefly dots */}
                          {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', background: '#fdcb6e', animation: `firefly ${3 + i}s infinite ${i * 0.5}s`, left: `${10 + i * 12}%`, top: `${15 + (i % 3) * 25}%`, pointerEvents: 'none' }} />
                          ))}

                          <h3 style={{ textAlign: 'center', color: '#00cec9', marginBottom: '0.5rem', animation: 'glowPulse 3s infinite' }}>{perfActiveGame.title}</h3>
                          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>{perfActiveGame.performance_type} | Max Score: {perfActiveGame.max_score}</p>

                          {/* CHOOSE ME - Tarot Cards */}
                          {perfActiveGame.performance_type === 'CHOOSE_ME' && (
                            <div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', justifyContent: 'center' }}>
                                {perfShuffledStudents.map((s, i) => {
                                  const scored = perfScoredStudents.has(s.student_id);
                                  return (
                                    <div key={s.student_id} className={`tarot-card ${scored ? 'tarot-light' : 'tarot-dark'}`}
                                      onClick={() => { if (!scored || true) { setPerfFlippedCard(s); setPerfCardScore(perfScores[s.student_id] || ''); } }}
                                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                                      <div className="tarot-number">{i + 1}</div>
                                      {scored && <div style={{ fontSize: '0.65rem', color: '#6c5ce7', fontWeight: 600 }}>{(s.english_name || '').substring(0, 12)}</div>}
                                      {scored && <div style={{ fontSize: '0.7rem', color: '#00b894', fontWeight: 700 }}>Score: {perfScores[s.student_id] || 0}</div>}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Flipped card modal */}
                              {perfFlippedCard && (
                                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPerfFlippedCard(null)}>
                                  <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '2.5rem', minWidth: 280, textAlign: 'center', border: '2px solid rgba(0,206,201,0.5)', boxShadow: '0 0 40px rgba(108,92,231,0.3)', animation: 'cardFlip 0.6s' }}>
                                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem' }}>ID: {perfFlippedCard.student_id}</div>
                                    <div style={{ fontSize: '0.9rem', color: '#fdcb6e', marginBottom: '0.2rem' }}>{perfFlippedCard.thai_name || '—'}</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', marginBottom: '1rem' }}>{perfFlippedCard.english_name || perfFlippedCard.student_id}</div>
                                    <div style={{ marginBottom: '1rem' }}>
                                      <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Score (max {perfActiveGame.max_score}):</label>
                                      <input type="number" value={perfCardScore} onChange={e => setPerfCardScore(e.target.value)} style={{ width: 100, textAlign: 'center', fontSize: '1.5rem', marginTop: '0.3rem' }} max={perfActiveGame.max_score} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                      <button onClick={() => { savePerfScore(perfFlippedCard.student_id, perfCardScore); setPerfFlippedCard(null); }} className="btn btn-primary">Save</button>
                                      <button onClick={() => setPerfFlippedCard(null)} className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>Close</button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ASK ME - Two landscape cards */}
                          {perfActiveGame.performance_type === 'ASK_ME' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                              {!perfAskPair.asker && <button onClick={selectRandomPair} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}>Select First Pair</button>}
                              {perfAskPair.asker && (
                                <>
                                  {/* Asker card */}
                                  <div style={{ background: 'linear-gradient(135deg, #2d3436, #636e72)', borderRadius: 12, padding: '1.5rem 2rem', minWidth: 350, textAlign: 'center', border: '2px solid #fdcb6e' }}>
                                    <div style={{ color: '#fdcb6e', fontSize: '0.8rem', marginBottom: '0.3rem' }}>WILL ASK THE QUESTION</div>
                                    <div style={{ color: '#fff', fontSize: '0.8rem' }}>ID: {perfAskPair.asker.student_id}</div>
                                    <div style={{ color: '#fdcb6e', fontSize: '0.85rem' }}>{perfAskPair.asker.thai_name || '—'}</div>
                                    <div style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>{perfAskPair.asker.english_name}</div>
                                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', justifyContent: 'center' }}>
                                      <input type="number" placeholder="Score" value={perfAskScores.askerScore} onChange={e => setPerfAskScores(prev => ({ ...prev, askerScore: e.target.value }))} style={{ width: 80, textAlign: 'center' }} />
                                      <button onClick={() => savePerfScore(perfAskPair.asker.student_id, perfAskScores.askerScore)} className="btn btn-secondary btn-sm">Save</button>
                                    </div>
                                    <button onClick={() => { const avail = perfStudents.filter(s => !perfScoredStudents.has(s.student_id) && s.student_id !== perfAskPair.answerer?.student_id); if (avail.length === 0) { showToast('No more students'); return; } setPerfAskPair(prev => ({ ...prev, asker: avail[Math.floor(Math.random() * avail.length)] })); }} className="btn btn-outline btn-sm" style={{ marginTop: '0.5rem', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>Change</button>
                                  </div>
                                  {/* Answerer card */}
                                  <div style={{ background: 'linear-gradient(135deg, #0984e3, #6c5ce7)', borderRadius: 12, padding: '1.5rem 2rem', minWidth: 350, textAlign: 'center', border: '2px solid #00cec9' }}>
                                    <div style={{ color: '#00cec9', fontSize: '0.8rem', marginBottom: '0.3rem' }}>WILL ANSWER</div>
                                    <div style={{ color: '#fff', fontSize: '0.8rem' }}>ID: {perfAskPair.answerer.student_id}</div>
                                    <div style={{ color: '#74b9ff', fontSize: '0.85rem' }}>{perfAskPair.answerer.thai_name || '—'}</div>
                                    <div style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>{perfAskPair.answerer.english_name}</div>
                                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', justifyContent: 'center' }}>
                                      <input type="number" placeholder="Score" value={perfAskScores.answererScore} onChange={e => setPerfAskScores(prev => ({ ...prev, answererScore: e.target.value }))} style={{ width: 80, textAlign: 'center' }} />
                                      <button onClick={() => savePerfScore(perfAskPair.answerer.student_id, perfAskScores.answererScore)} className="btn btn-secondary btn-sm">Save</button>
                                    </div>
                                    <button onClick={() => { const avail = perfStudents.filter(s => !perfScoredStudents.has(s.student_id) && s.student_id !== perfAskPair.asker?.student_id); if (avail.length === 0) { showToast('No more students'); return; } setPerfAskPair(prev => ({ ...prev, answerer: avail[Math.floor(Math.random() * avail.length)] })); }} className="btn btn-outline btn-sm" style={{ marginTop: '0.5rem', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>Change</button>
                                  </div>
                                  <button onClick={selectRandomPair} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Select Next Pair</button>
                                </>
                              )}
                            </div>
                          )}

                          {/* REVEAL ME - Shuffle and reveal */}
                          {perfActiveGame.performance_type === 'REVEAL_ME' && (
                            <div style={{ textAlign: 'center' }}>
                              {!perfFlippedCard && !isSpinning && (
                                <button onClick={shuffleRevealStudent} className="btn btn-primary" style={{ fontSize: '1.2rem', padding: '0.8rem 2.5rem' }} disabled={perfStudents.filter(s => !perfScoredStudents.has(s.student_id)).length === 0}>
                                  Shuffle & Reveal
                                </button>
                              )}
                              {isSpinning && perfFlippedCard && (
                                <div style={{ animation: 'cardFlip 0.3s', background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '2rem', display: 'inline-block', border: '2px solid rgba(0,206,201,0.5)' }}>
                                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#00cec9' }}>{perfFlippedCard.english_name || perfFlippedCard.student_id}</div>
                                </div>
                              )}
                              {!isSpinning && perfFlippedCard && (
                                <div style={{ background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '2.5rem', display: 'inline-block', border: '2px solid rgba(0,206,201,0.5)', minWidth: 300 }}>
                                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>ID: {perfFlippedCard.student_id}</div>
                                  <div style={{ color: '#fdcb6e', fontSize: '0.9rem' }}>{perfFlippedCard.thai_name || '—'}</div>
                                  <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>{perfFlippedCard.english_name}</div>
                                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                    <input type="number" value={perfCardScore} onChange={e => setPerfCardScore(e.target.value)} placeholder="Score" style={{ width: 80, textAlign: 'center', fontSize: '1.2rem' }} />
                                    <button onClick={() => { savePerfScore(perfFlippedCard.student_id, perfCardScore); setPerfFlippedCard(null); setPerfCardScore(''); }} className="btn btn-primary">Save</button>
                                  </div>
                                  <button onClick={shuffleRevealStudent} className="btn btn-outline btn-sm" style={{ marginTop: '1rem', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>SHUFFLE AGAIN</button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* STUDENT ROULETTE - Spinning wheel */}
                          {perfActiveGame.performance_type === 'STUDENT_ROULETTE' && (
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ position: 'relative', width: 300, height: 300, margin: '0 auto 1.5rem', borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(0,206,201,0.5)', background: 'rgba(0,0,0,0.3)' }}>
                                {perfStudents.filter(s => !perfScoredStudents.has(s.student_id)).slice(0, 12).map((s, i, arr) => {
                                  const angle = (360 / arr.length) * i;
                                  const colors = ['#6c5ce7','#00cec9','#fd79a8','#fdcb6e','#55efc4','#74b9ff','#e17055','#a29bfe'];
                                  return (
                                    <div key={s.student_id} style={{ position: 'absolute', width: '50%', height: '50%', transformOrigin: '100% 100%', transform: `rotate(${angle}deg)`, background: colors[i % colors.length], opacity: 0.85 }}>
                                      <span style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.55rem', color: '#fff', fontWeight: 700, transform: `rotate(${-angle}deg)` }}>{(s.english_name || s.student_id).substring(0, 8)}</span>
                                    </div>
                                  );
                                })}
                                <div style={{ position: 'absolute', inset: '30%', borderRadius: '50%', background: 'rgba(10,10,46,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, border: '2px solid rgba(0,206,201,0.3)' }}>
                                  {perfFlippedCard && !isSpinning ? <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#00cec9', textAlign: 'center' }}>{(perfFlippedCard.english_name || '').substring(0, 12)}</span> : <span style={{ fontSize: '2rem' }}>🎡</span>}
                                </div>
                                {/* Arrow */}
                                <div style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '16px solid #e17055', zIndex: 3 }} />
                              </div>
                              {perfFlippedCard && !isSpinning && (
                                <div style={{ background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '1.5rem', display: 'inline-block', border: '2px solid rgba(0,206,201,0.5)', minWidth: 280, marginBottom: '1rem' }}>
                                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>ID: {perfFlippedCard.student_id}</div>
                                  <div style={{ color: '#fdcb6e' }}>{perfFlippedCard.thai_name || '—'}</div>
                                  <div style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>{perfFlippedCard.english_name}</div>
                                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                    <input type="number" value={perfCardScore} onChange={e => setPerfCardScore(e.target.value)} placeholder="Score" style={{ width: 80, textAlign: 'center' }} />
                                    <button onClick={() => { savePerfScore(perfFlippedCard.student_id, perfCardScore); setPerfFlippedCard(null); setPerfCardScore(''); }} className="btn btn-primary btn-sm">Save</button>
                                  </div>
                                </div>
                              )}
                              <div>
                                <button onClick={shuffleRevealStudent} disabled={isSpinning} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.7rem 2rem' }}>
                                  {isSpinning ? 'Spinning...' : 'SPIN AGAIN'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Student scores table */}
                        <div className="card">
                          <h4 style={{ marginBottom: '0.5rem' }}>Student Scores — {perfActiveGame.title}</h4>
                          <table style={{ fontSize: '0.8rem', width: '100%' }}>
                            <thead>
                              <tr><th>ID</th><th>Thai Name</th><th>English Name</th><th>#</th><th>Score / {perfActiveGame.max_score}</th></tr>
                            </thead>
                            <tbody>
                              {perfStudents.map(s => (
                                <tr key={s.student_id}>
                                  <td>{s.student_id}</td>
                                  <td>{s.thai_name || '—'}</td>
                                  <td>{s.english_name || '—'}</td>
                                  <td>{s.class_no || '—'}</td>
                                  <td style={{ fontWeight: 600, color: perfScoredStudents.has(s.student_id) ? '#00b894' : 'var(--text-dim)' }}>{perfScores[s.student_id] ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Add Performance Popup */}
              {perfAddPopup && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPerfAddPopup(false)}>
                  <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '2rem', maxWidth: 400, width: '90%' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3>Add Performance</h3>
                      <button onClick={() => setPerfAddPopup(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-dim)' }}>✕</button>
                    </div>
                    <div style={{ display: 'grid', gap: '0.8rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Performance Type:</label>
                        <select value={perfAddForm.performanceType} onChange={e => setPerfAddForm({ ...perfAddForm, performanceType: e.target.value })} style={{ width: '100%' }}>
                          <option value="CHOOSE_ME">Choose Me!</option>
                          <option value="ASK_ME">Ask Me!</option>
                          <option value="REVEAL_ME">Reveal Me!</option>
                          <option value="STUDENT_ROULETTE">Student Roulette</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Title:</label>
                        <input value={perfAddForm.title} onChange={e => setPerfAddForm({ ...perfAddForm, title: e.target.value })} placeholder="Performance title" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Lesson Number:</label>
                        <input value={perfAddForm.lessonNumber} onChange={e => setPerfAddForm({ ...perfAddForm, lessonNumber: e.target.value })} placeholder="e.g. Lesson 1" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Maximum Score:</label>
                        <input type="number" value={perfAddForm.maxScore} onChange={e => setPerfAddForm({ ...perfAddForm, maxScore: Number(e.target.value) || 100 })} style={{ width: '100%' }} />
                      </div>
                      <button onClick={createPerformance} className="btn btn-primary">SAVE</button>
                    </div>
                  </div>
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
                      <tr><th>No.</th><th>Student ID</th><th>Name</th><th>Section</th><th>Tab Switches</th><th>Score</th><th>STATUS</th><th>REMARKS</th></tr>
                    </thead>
                    <tbody>
                      {(viewSectionsFilter === 'ALL' ? viewSectionsData.students : (viewSectionsData.sections.find(s => s.section === viewSectionsFilter)?.students || []))?.map((s, i) => (
                        <tr key={s.student_id}>
                          <td>{s.class_no || i + 1}</td>
                          <td>{s.student_id}</td>
                          <td>{s.english_name || s.thai_name}</td>
                          <td>{s.section}</td>
                          <td>{s.tabSwitchCount || 0}</td>
                          <td>{s.score !== null && s.score !== undefined ? `${parseFloat(s.score).toFixed(1)}%` : '—'}</td>
                          <td><StatusBadge status={s.status} /></td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              {s.status === 'BLOCKED' && (
                                <button onClick={() => unblockStudent(viewSectionsQuiz.id, s.student_id)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer' }}>Allow</button>
                              )}
                              {(s.status === 'COMPLETED' && (s.result === 'PASSED' || s.result === 'FAILED')) && (
                                <button onClick={() => forceRetake(viewSectionsQuiz.id, s.student_id)} className="btn btn-outline btn-sm" style={{ fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', color: '#e17055' }}>Retake</button>
                              )}
                              {s.status === 'IN_PROGRESS' && (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>—</span>
                              )}
                              {s.status === 'NOT_STARTED' && (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>—</span>
                              )}
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

      {/* ══════════ VIEW SECTIONS POPUP (2 options) ══════════ */}
      {viewSectionsPopup && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setViewSectionsPopup(null)}>
          <div role="dialog" aria-modal="true" style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '2rem', maxWidth: 400, width: '90%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1.5rem' }}>View Sections — {viewSectionsPopup.title}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button onClick={() => { setViewSectionsFilter('ALL'); setViewSectionsQuiz(viewSectionsPopup); setViewSectionsPopup(null); }} className="btn btn-primary" style={{ padding: '1rem', fontSize: '1rem' }}>
                VIEW ENTIRE SECTIONS
              </button>
              <div>
                <p style={{ color: 'var(--text-dim)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Or select a specific section:</p>
                {viewSectionsPopup && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {(viewSectionsData?.sections || []).map(sec => (
                      <button key={sec.section} onClick={() => { setViewSectionsFilter(sec.section); setViewSectionsQuiz(viewSectionsPopup); setViewSectionsPopup(null); }} className="btn btn-outline btn-sm">
                        {sec.section}
                      </button>
                    ))}
                    {!(viewSectionsData?.sections?.length) && (
                      <button onClick={() => { loadSectionsStatus(viewSectionsPopup.id).then(() => { setViewSectionsFilter('ALL'); setViewSectionsQuiz(viewSectionsPopup); setViewSectionsPopup(null); }); }} className="btn btn-secondary btn-sm">
                        VIEW SPECIFIC SECTION (load first)
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setViewSectionsPopup(null)} className="btn btn-outline btn-sm" style={{ marginTop: '1.5rem' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Game Window Overlay */}
      {perfGameWindow && perfStudents.length > 0 && (
        <GameWindow
          performance={perfGameWindow}
          students={perfStudents}
          onClose={() => { setPerfGameWindow(null); if (perfActiveGame) startPerfGame(perfActiveGame); }}
          showToast={showToast}
        />
      )}

      {/* Quiz Preview Overlay */}
      {quizPreview && (
        <QuizPreview quiz={quizPreview} onClose={() => setQuizPreview(null)} />
      )}
    </div>
  );
}
