import React, { useState, useEffect } from 'react';
import { api, downloadFile } from '../api';
import { KahootHostView } from './KahootGame';
import GradingSheetEditor from '../components/GradingSheetEditor';

export default function QuizTeacherDashboard({ user, onLogout, showToast }) {
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
  const [scoreMappings, setScoreMappings] = useState([]);
  const [recordEntries, setRecordEntries] = useState({ quizAttempts: [], liveGames: [] });
  const [mappingForm, setMappingForm] = useState({ gradeLevel: '', targetDatabaseId: '', period: 'midterm', scoreType: 'individual', slot: 0, sourceType: 'QUIZ_ATTEMPT', sourceQuizId: '', applyMode: 'BEST' });
  const [gradeDatabases, setGradeDatabases] = useState([]);
  const [reviewAttempt, setReviewAttempt] = useState(null);
  const [slotHints, setSlotHints] = useState(null);

  // Quiz form state
  const [form, setForm] = useState({
    title: '', type: 'QUIZ', period: 'midterm', subject: '', passingScore: 50, attemptsAllowed: 1,
    timeLimit: 0, retakeAllowed: 'NO', randomizeQuestions: 'NO', randomizeChoices: 'NO',
    startDate: '', deadline: '', gradeLevels: [], questions: []
  });
  const [questionForm, setQuestionForm] = useState({
    questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '',
    choiceAMediaType: '', choiceAMediaUrl: '', choiceBMediaType: '', choiceBMediaUrl: '', choiceCMediaType: '', choiceCMediaUrl: '', choiceDMediaType: '', choiceDMediaUrl: '',
    correctAnswer: '', points: 1
  });

  useEffect(() => { loadQuizzes(); loadGradeLevels(); loadStudentDbs(); loadGradeDatabases(); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mappingForm.targetDatabaseId) {
        if (!cancelled) setSlotHints(null);
        return;
      }
      const res = await api.get(`/grades/slot-hints?databaseId=${encodeURIComponent(mappingForm.targetDatabaseId)}`);
      if (!cancelled) setSlotHints(res.success ? res.data : null);
    })();
    return () => { cancelled = true; };
  }, [mappingForm.targetDatabaseId]);

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

  const addQuestion = () => {
    if (!questionForm.questionText.trim()) { showToast('Question text required', 'error'); return; }
    setForm({
      ...form,
      questions: [...form.questions, {
        ...questionForm,
        choiceMedia: {
          A: { type: questionForm.choiceAMediaType || '', url: questionForm.choiceAMediaUrl || '' },
          B: { type: questionForm.choiceBMediaType || '', url: questionForm.choiceBMediaUrl || '' },
          C: { type: questionForm.choiceCMediaType || '', url: questionForm.choiceCMediaUrl || '' },
          D: { type: questionForm.choiceDMediaType || '', url: questionForm.choiceDMediaUrl || '' }
        }
      }]
    });
    setQuestionForm({ questionText: '', questionType: 'MCQ', mediaType: '', mediaUrl: '', choiceA: '', choiceB: '', choiceC: '', choiceD: '', choiceAMediaType: '', choiceAMediaUrl: '', choiceBMediaType: '', choiceBMediaUrl: '', choiceCMediaType: '', choiceCMediaUrl: '', choiceDMediaType: '', choiceDMediaUrl: '', correctAnswer: '', points: 1 });
  };

  const removeQuestion = (index) => {
    setForm({ ...form, questions: form.questions.filter((_, i) => i !== index) });
  };

  const createQuiz = async () => {
    if (!form.title.trim()) { showToast('Title required', 'error'); return; }
    if (form.questions.length === 0) { showToast('Add at least one question', 'error'); return; }
    const firstGl = (form.gradeLevels && form.gradeLevels[0]) ? String(form.gradeLevels[0]) : '';
    const res = await api.post('/quiz/create', { ...form, gradeLevel: firstGl, createdBy: user.name || user.id || '' });
    if (res.success) {
      showToast('Quiz created');
      setShowCreate(false);
      resetForm();
      await loadQuizzes();
    } else showToast(res.error || res.message || 'Failed', 'error');
  };

  const resetForm = () => {
    setForm({ title: '', type: 'QUIZ', period: 'midterm', subject: '', passingScore: 50, attemptsAllowed: 1, timeLimit: 0, retakeAllowed: 'NO', randomizeQuestions: 'NO', randomizeChoices: 'NO', startDate: '', deadline: '', gradeLevels: [], questions: [] });
  };

  const refreshTab = async () => {
    await loadQuizzes();
    await loadGradeLevels();
    await loadGradeDatabases();
    if (tab === 'retakes') await loadRetakeRequests();
    if (tab === 'deadlines') await loadDeadlineRequests();
    if (tab === 'leaderboard') await loadLeaderboard();
    if (tab === 'students') await loadStudentDbs();
    if (tab === 'teams') await fetchTeamGroups();
    if (tab === 'recording') { await fetchScoreMappings(); await fetchRecordEntries(); }
    if (selectedQuiz && tab === 'results') await loadResults(selectedQuiz.id);
  };

  const publishQuiz = async (id) => {
    const res = await api.post(`/quiz/${id}/publish`);
    showToast(res.success ? 'Quiz published' : (res.error || res.message || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadQuizzes();
  };
  const closeQuiz = async (id) => {
    const res = await api.post(`/quiz/${id}/close`);
    showToast(res.success ? 'Quiz closed' : (res.error || res.message || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadQuizzes();
  };
  const reopenQuiz = async (id) => {
    const res = await api.post(`/quiz/${id}/reopen`);
    showToast(res.success ? 'Quiz reopened' : (res.error || res.message || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadQuizzes();
  };
  const deleteQuiz = async (id) => {
    if (!confirm('Delete this quiz and all attempts?')) return;
    const prev = quizzes;
    setQuizzes((q) => q.filter((x) => x.id !== id));
    const res = await api.del(`/quiz/${id}`);
    if (res.success) {
      if (selectedQuiz?.id === id) setSelectedQuiz(null);
      showToast('Quiz deleted', 'success');
    } else {
      setQuizzes(prev);
      showToast(res.error || res.message || 'Delete failed', 'error');
    }
  };

  const approveRetake = async (id) => {
    const res = await api.post(`/quiz/retake-request/${id}/approve`);
    showToast(res.success ? 'Approved' : (res.error || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadRetakeRequests();
  };
  const denyRetake = async (id) => {
    const res = await api.post(`/quiz/retake-request/${id}/deny`);
    showToast(res.success ? 'Denied' : (res.error || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadRetakeRequests();
  };
  const approveDeadline = async (id) => {
    const res = await api.post(`/quiz/deadline-request/${id}/approve`);
    showToast(res.success ? 'Approved' : (res.error || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadDeadlineRequests();
  };
  const denyDeadline = async (id) => {
    const res = await api.post(`/quiz/deadline-request/${id}/deny`);
    showToast(res.success ? 'Denied' : (res.error || 'Failed'), res.success ? 'success' : 'error');
    if (res.success) await loadDeadlineRequests();
  };

  const toggleGradeLevel = (gl) => {
    const current = form.gradeLevels || [];
    setForm({ ...form, gradeLevels: current.includes(gl) ? current.filter(g => g !== gl) : [...current, gl] });
  };
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
  const onTeamMemberDragStart = (e, studentId) => {
    if (!studentId) return;
    e.dataTransfer.setData(TEAM_DRAG_MIME, String(studentId));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onTeamDropZoneOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onTeamDropOnGroup = (e, groupName) => {
    e.preventDefault();
    const sid = e.dataTransfer.getData(TEAM_DRAG_MIME);
    if (sid && teamGradeLevel && teamSection) moveMember(sid, groupName);
  };
  const onTeamDropUnassigned = (e) => {
    e.preventDefault();
    const sid = e.dataTransfer.getData(TEAM_DRAG_MIME);
    if (sid) removeMember(sid);
  };

  const moveMember = async (studentId, groupName) => {
    const res = await api.post('/quiz/team-groups/assign', { gradeLevel: teamGradeLevel, section: teamSection, studentId, groupName });
    showToast(res.message || (res.success ? 'Member moved' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) fetchTeamGroups();
  };
  const removeMember = async (studentId) => {
    const res = await api.post('/quiz/team-groups/remove', { gradeLevel: teamGradeLevel, section: teamSection, studentId });
    showToast(res.message || (res.success ? 'Member removed' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) fetchTeamGroups();
  };
  const deleteOneGroup = async (groupName) => {
    const res = await api.post('/quiz/team-groups/delete-group', { gradeLevel: teamGradeLevel, section: teamSection, groupName });
    showToast(res.message || (res.success ? 'Group deleted' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) fetchTeamGroups();
  };
  const deleteAllGroups = async () => {
    const res = await api.post('/quiz/team-groups/delete-all', { gradeLevel: teamGradeLevel, section: teamSection });
    showToast(res.message || (res.success ? 'Grouping deleted' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) fetchTeamGroups();
  };
  const fetchScoreMappings = async () => {
    const gl = mappingForm.gradeLevel || '';
    const res = await api.get(`/quiz/score-mappings${gl ? `?gradeLevel=${encodeURIComponent(gl)}` : ''}`);
    if (res.success) setScoreMappings(res.data || []);
  };
  const createMapping = async () => {
    const res = await api.post('/quiz/score-mappings', {
      gradeLevel: mappingForm.gradeLevel,
      targetDatabaseId: Number(mappingForm.targetDatabaseId),
      period: mappingForm.period,
      scoreType: mappingForm.scoreType,
      slot: Number(mappingForm.slot) || 0,
      sourceType: mappingForm.sourceType,
      sourceQuizId: mappingForm.sourceQuizId,
      applyMode: mappingForm.applyMode
    });
    showToast(res.message || (res.success ? 'Mapping created' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) fetchScoreMappings();
  };
  const applyMapping = async (id) => {
    const res = await api.post('/quiz/record-to-mode-a', { mappingId: id });
    showToast(res.message || (res.success ? 'Recorded to Mode A' : 'Failed'), res.success ? 'success' : 'error');
  };
  const fetchRecordEntries = async () => {
    const gl = mappingForm.gradeLevel || '';
    const res = await api.get(`/quiz/record-entries${gl ? `?gradeLevel=${encodeURIComponent(gl)}` : ''}`);
    if (res.success) setRecordEntries(res.data || { quizAttempts: [], liveGames: [] });
  };
  const deleteRecordEntry = async (sourceType, id) => {
    const res = await api.del(`/quiz/record-entries/${sourceType}/${encodeURIComponent(id)}`);
    showToast(res.message || (res.success ? 'Record deleted' : 'Delete failed'), res.success ? 'success' : 'error');
    if (res.success) {
      setRecordEntries((prev) => ({
        quizAttempts: sourceType === 'QUIZ_ATTEMPT' ? prev.quizAttempts.filter((x) => String(x.id) !== String(id)) : prev.quizAttempts,
        liveGames: sourceType === 'LIVE_GAME' ? prev.liveGames.filter((x) => String(x.id) !== String(id)) : prev.liveGames
      }));
    }
  };

  const deleteMapping = async (mappingId) => {
    if (!confirm('Delete this score mapping?')) return;
    const res = await api.del(`/quiz/score-mappings/${mappingId}`);
    showToast(res.message || (res.success ? 'Mapping deleted' : 'Failed'), res.success ? 'success' : 'error');
    if (res.success) fetchScoreMappings();
  };

  const openAttemptReview = async (attemptId) => {
    const res = await api.get(`/quiz/attempt/${encodeURIComponent(attemptId)}`);
    if (res.success && res.data) setReviewAttempt(res.data);
    else showToast(res.error || res.message || 'Could not load attempt', 'error');
  };

  const allGradeLevels = gradeLevels.length > 0 ? gradeLevels : ['MATHAYUM 1','MATHAYUM 2','MATHAYUM 3','MATHAYUM 4','MATHAYUM 5','MATHAYUM 6'];
  const tabs = [
    { id: 'quizzes', label: 'Quizzes' },
    { id: 'create', label: 'Create Quiz' },
    { id: 'results', label: 'Results' },
    { id: 'retakes', label: 'Retake Requests' },
    { id: 'deadlines', label: 'Deadline Requests' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'students', label: 'Student DBs' },
    { id: 'teams', label: 'Team Groups' },
    { id: 'recording', label: 'Record to Mode A' },
    { id: 'grading-sheet', label: 'Grading Sheet' },
    { id: 'livegame', label: 'Live Game' },
  ];

  if (showLiveGame) {
    return <KahootHostView user={user} quizzes={quizzes} showToast={showToast} onBack={() => setShowLiveGame(false)} />;
  }

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
        <nav style={{ width: 200, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '1rem 0' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'retakes') loadRetakeRequests(); if (t.id === 'deadlines') loadDeadlineRequests(); if (t.id === 'leaderboard') loadLeaderboard(); if (t.id === 'teams') fetchTeamGroups(); if (t.id === 'recording') { fetchScoreMappings(); fetchRecordEntries(); } }}
              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: tab === t.id ? 'rgba(0,206,201,0.15)' : 'transparent', color: tab === t.id ? 'var(--secondary)' : 'var(--text)', border: 'none', borderLeft: tab === t.id ? '3px solid var(--secondary)' : '3px solid transparent', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
          {tab === 'quizzes' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>All Quizzes</h3>
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {quizzes.map(q => (
                  <div key={q.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ color: 'var(--text-bright)' }}>{q.title}</h4>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                        {q.type} | {(q.period || 'midterm').toUpperCase()} | {q.subject} | {q.question_count} questions | Pass: {q.passing_score}%
                      </p>
                      <span className={`badge ${q.status === 'ACTIVE' ? 'badge-success' : q.status === 'DRAFT' ? 'badge-warning' : 'badge-danger'}`}>{q.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <button onClick={() => { setSelectedQuiz(q); loadResults(q.id); setTab('results'); }} className="btn btn-outline btn-sm">Results</button>
                      {q.status === 'DRAFT' && <button onClick={() => publishQuiz(q.id)} className="btn btn-secondary btn-sm">Publish</button>}
                      {q.status === 'ACTIVE' && <button onClick={() => closeQuiz(q.id)} className="btn btn-outline btn-sm">Close</button>}
                      {q.status === 'CLOSED' && <button onClick={() => reopenQuiz(q.id)} className="btn btn-secondary btn-sm">Reopen</button>}
                      <button onClick={() => deleteQuiz(q.id)} className="btn btn-danger btn-sm">Delete</button>
                    </div>
                  </div>
                ))}
                {quizzes.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No quizzes yet. Create one to get started.</p>}
              </div>
            </div>
          )}

          {tab === 'create' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Create New Quiz</h3>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Title</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Type</label>
                    <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} style={{ width: '100%' }}>
                      <option>QUIZ</option><option>EXAM</option><option>PRACTICE</option><option>HOMEWORK</option><option>GAME</option>
                    </select></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Period</label>
                    <select value={form.period} onChange={e => setForm({...form, period: e.target.value})} style={{ width: '100%' }}>
                      <option value="midterm">Midterm</option>
                      <option value="final_initial">Final Initial</option>
                      <option value="final_final">Final Final</option>
                    </select></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Subject</label><input value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Passing Score (%)</label><input type="number" value={form.passingScore} onChange={e => setForm({...form, passingScore: parseInt(e.target.value)})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Attempts Allowed</label><input type="number" value={form.attemptsAllowed} onChange={e => setForm({...form, attemptsAllowed: parseInt(e.target.value)})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Time Limit (min, 0=none)</label><input type="number" value={form.timeLimit} onChange={e => setForm({...form, timeLimit: parseInt(e.target.value)})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Deadline</label><input type="datetime-local" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} style={{ width: '100%' }} /></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Randomize Questions</label>
                    <select value={form.randomizeQuestions} onChange={e => setForm({...form, randomizeQuestions: e.target.value})} style={{ width: '100%' }}><option>NO</option><option>YES</option></select></div>
                  <div><label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Randomize Choices</label>
                    <select value={form.randomizeChoices} onChange={e => setForm({...form, randomizeChoices: e.target.value})} style={{ width: '100%' }}><option>NO</option><option>YES</option></select></div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <label style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Grade Levels</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                    {allGradeLevels.map(gl => (
                      <button key={gl} onClick={() => toggleGradeLevel(gl)}
                        className={`btn btn-sm ${(form.gradeLevels || []).includes(gl) ? 'btn-secondary' : 'btn-outline'}`}>{gl}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <h4 style={{ marginBottom: '0.8rem' }}>Add Question ({form.questions.length} added)</h4>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <textarea placeholder="Question text" value={questionForm.questionText} onChange={e => setQuestionForm({...questionForm, questionText: e.target.value})} rows={2} style={{ width: '100%' }} />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select value={questionForm.mediaType} onChange={e => setQuestionForm({...questionForm, mediaType: e.target.value})} style={{ width: 160 }}>
                      <option value="">No media</option><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option>
                    </select>
                    <input placeholder="Media URL (http:// or https://)" value={questionForm.mediaUrl} onChange={e => setQuestionForm({...questionForm, mediaUrl: e.target.value})} style={{ flex: 1 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input placeholder="Choice A" value={questionForm.choiceA} onChange={e => setQuestionForm({...questionForm, choiceA: e.target.value})} />
                    <input placeholder="Choice B" value={questionForm.choiceB} onChange={e => setQuestionForm({...questionForm, choiceB: e.target.value})} />
                    <input placeholder="Choice C" value={questionForm.choiceC} onChange={e => setQuestionForm({...questionForm, choiceC: e.target.value})} />
                    <input placeholder="Choice D" value={questionForm.choiceD} onChange={e => setQuestionForm({...questionForm, choiceD: e.target.value})} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <input placeholder="Choice A media URL" value={questionForm.choiceAMediaUrl} onChange={e => setQuestionForm({...questionForm, choiceAMediaUrl: e.target.value})} />
                    <input placeholder="Choice B media URL" value={questionForm.choiceBMediaUrl} onChange={e => setQuestionForm({...questionForm, choiceBMediaUrl: e.target.value})} />
                    <input placeholder="Choice C media URL" value={questionForm.choiceCMediaUrl} onChange={e => setQuestionForm({...questionForm, choiceCMediaUrl: e.target.value})} />
                    <input placeholder="Choice D media URL" value={questionForm.choiceDMediaUrl} onChange={e => setQuestionForm({...questionForm, choiceDMediaUrl: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select value={questionForm.correctAnswer} onChange={e => setQuestionForm({...questionForm, correctAnswer: e.target.value})} style={{ flex: 1 }}>
                      <option value="">Correct Answer</option><option>A</option><option>B</option><option>C</option><option>D</option>
                    </select>
                    <input type="number" placeholder="Points" value={questionForm.points} onChange={e => setQuestionForm({...questionForm, points: parseInt(e.target.value)})} style={{ width: 80 }} />
                    <button onClick={addQuestion} className="btn btn-secondary btn-sm">Add</button>
                  </div>
                </div>

                {form.questions.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    {form.questions.map((q, i) => {
                      const raw = String(q.questionText || '').trim();
                      const snippet = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.4rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.85rem', flex: '1 1 200px', minWidth: 0 }}>{i + 1}. {snippet || '(empty)'} (Answer: {q.correctAnswer}, Points: {q.points}{q.mediaType ? `, Media: ${q.mediaType}` : ''})</span>
                          <button type="button" onClick={() => removeQuestion(i)} style={{ background: 'none', color: 'var(--danger)', fontSize: '0.8rem' }}>Remove</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button onClick={createQuiz} className="btn btn-primary">Create Quiz</button>
            </div>
          )}

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
                    <thead><tr><th>Student ID</th><th>Name</th><th>Grade</th><th>Section</th><th>Score</th><th>%</th><th>Result</th><th>Tab Switches</th></tr></thead>
                    <tbody>
                      {quizResults.attempts.map(a => (
                        <tr key={a.id}>
                          <td>{a.student_id}</td><td>{a.student_name}</td><td>{a.grade_level}</td><td>{a.section}</td>
                          <td>{a.score}/{a.total_points}</td><td>{a.percentage}%</td>
                          <td><span className={`badge ${a.result === 'PASSED' ? 'badge-success' : 'badge-danger'}`}>{a.result}</span></td>
                          <td>{a.tab_switch_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'retakes' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Retake Requests</h3>
              {retakeRequests.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No retake requests</p>}
              {retakeRequests.map(r => (
                <div key={r.id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{r.student_name}</strong> ({r.student_id}) — {r.quiz_title}
                    <br/><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Reason: {r.reason} | Status: </span>
                    <span className={`badge ${r.status === 'PENDING' ? 'badge-warning' : r.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span>
                  </div>
                  {r.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button onClick={() => approveRetake(r.id)} className="btn btn-secondary btn-sm">Approve</button>
                      <button onClick={() => denyRetake(r.id)} className="btn btn-danger btn-sm">Deny</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'deadlines' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Deadline Extension Requests</h3>
              {deadlineRequests.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No deadline requests</p>}
              {deadlineRequests.map(r => (
                <div key={r.id} className="card" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{r.student_name}</strong> ({r.student_id}) — {r.quiz_title}
                    <br/><span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Reason: {r.reason} | </span>
                    <span className={`badge ${r.status === 'PENDING' ? 'badge-warning' : r.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span>
                  </div>
                  {r.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button onClick={() => approveDeadline(r.id)} className="btn btn-secondary btn-sm">Approve</button>
                      <button onClick={() => denyDeadline(r.id)} className="btn btn-danger btn-sm">Deny</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'leaderboard' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Leaderboard</h3>
              <table>
                <thead><tr><th>Rank</th><th>Student ID</th><th>Name</th><th>Grade</th><th>Quizzes</th><th>Avg Score</th><th>Best</th><th>Passed</th></tr></thead>
                <tbody>
                  {leaderboard.map((s, i) => (
                    <tr key={s.student_id}>
                      <td style={{ fontWeight: 700, color: i < 3 ? 'var(--warning)' : 'var(--text)' }}>{i + 1}</td>
                      <td>{s.student_id}</td><td>{s.student_name}</td><td>{s.grade_level}</td>
                      <td>{s.quizzes_taken}</td><td>{parseFloat(s.avg_score).toFixed(1)}%</td>
                      <td>{parseFloat(s.best_score).toFixed(1)}%</td><td>{s.passed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'livegame' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Kahoot-Style Live Game</h3>
              <p style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>Host a live quiz game where students join with a PIN and answer questions in real-time. Points are awarded based on speed and accuracy.</p>
              <button onClick={() => setShowLiveGame(true)} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}>Start Live Game</button>
            </div>
          )}

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
                <GradingSheetEditor
                  mode="quiz"
                  scopeId={sheetGradeLevel}
                  scopeLabel={sheetGradeLevel}
                  gradeLevels={allGradeLevels}
                  canEdit
                  showToast={showToast}
                />
              ) : (
                <p style={{ color: 'var(--text-dim)' }}>Choose a grade level to open the grading sheet.</p>
              )}
            </div>
          )}

          {tab === 'students' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Student Databases</h3>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {allGradeLevels.map(gl => (
                  <button key={gl} onClick={async () => {
                    try {
                      await downloadFile(`/api/students/export-excel?mode=quiz&gradeLevel=${encodeURIComponent(gl)}`, `quiz_${gl.replace(/\s+/g, '_')}.xlsx`);
                      showToast('Excel downloaded');
                    } catch { showToast('Export failed', 'error'); }
                  }} className="btn btn-secondary btn-sm" title={`Export ${gl} to Excel`}>Export {gl}</button>
                ))}
                {allGradeLevels.map(gl => (
                  <button key={`${gl}-pdf`} onClick={async () => {
                    try {
                      await downloadFile(`/api/students/export-pdf?mode=quiz&gradeLevel=${encodeURIComponent(gl)}`, `quiz_${gl.replace(/\s+/g, '_')}.pdf`);
                      showToast('PDF downloaded');
                    } catch { showToast('Export failed', 'error'); }
                  }} className="btn btn-outline btn-sm" title={`Export ${gl} to PDF`}>PDF {gl}</button>
                ))}
                {allGradeLevels.map(gl => (
                  <button key={`${gl}-sheet`} onClick={async () => {
                    try {
                      await downloadFile(`/api/quiz/grading-sheet/export?gradeLevel=${encodeURIComponent(gl)}`, `quiz_sheet_${gl.replace(/\s+/g, '_')}.xlsx`);
                      showToast('Grading sheet downloaded');
                    } catch { showToast('Export failed', 'error'); }
                  }} className="btn btn-outline btn-sm" title={`Detailed grading sheet ${gl}`}>Detailed {gl}</button>
                ))}
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
                    try {
                      const res = await fetch('/api/students/import-excel', { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} });
                      const data = await res.json();
                      showToast(data.message || (data.success ? 'Import complete' : 'Import failed'), data.success ? 'success' : 'error');
                      if (data.success) loadStudentDbs();
                    } catch {
                      showToast('Import failed', 'error');
                    }
                    e.target.value = '';
                  }} />
                </label>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Excel must have columns: STUDENT ID, THAI NAME, ENGLISH NAME, SECTION, CLASS NUMBER, GRADE LEVEL</span>
              </div>
              {studentDbs.map(d => (
                <div key={d.id} className="card" style={{ marginBottom: '0.5rem' }}>
                  <strong>{d.name}</strong> — {d.grade_level}
                  <span className={`badge badge-info`} style={{ marginLeft: '0.5rem' }}>{d.status}</span>
                </div>
              ))}
              {studentDbs.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No student databases configured</p>}
            </div>
          )}

          {tab === 'teams' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Mode B Team Groups</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>Drag a student row onto a group card to move them, or onto Unassigned to remove from a group. You can still type a group name and press Enter.</p>
              <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={teamGradeLevel} onChange={(e) => setTeamGradeLevel(e.target.value)}>
                  <option value="">Grade level</option>
                  {allGradeLevels.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
                </select>
                <input placeholder="Section" value={teamSection} onChange={(e) => setTeamSection(e.target.value)} />
                <input type="number" min="1" value={teamGroupCount} onChange={(e) => setTeamGroupCount(parseInt(e.target.value, 10) || 1)} style={{ width: 90 }} />
                <button onClick={autoGenerateTeams} className="btn btn-secondary btn-sm">Auto Group</button>
                <button onClick={fetchTeamGroups} className="btn btn-outline btn-sm">Load</button>
                <button onClick={deleteAllGroups} className="btn btn-danger btn-sm">Delete Grouping</button>
              </div>
              {(teamOverview.groups || []).map((g) => (
                <div
                  key={g.groupName}
                  className="card"
                  style={{ marginBottom: '0.5rem', outline: '1px dashed transparent' }}
                  onDragOver={onTeamDropZoneOver}
                  onDrop={(e) => onTeamDropOnGroup(e, g.groupName)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <strong>{g.groupName}</strong>
                    <button type="button" onClick={() => deleteOneGroup(g.groupName)} className="btn btn-danger btn-sm">Delete Group</button>
                  </div>
                  {(g.members || []).map((m) => (
                    <div
                      key={m.student_id}
                      draggable={!!teamGradeLevel && !!teamSection}
                      onDragStart={(e) => onTeamMemberDragStart(e, m.student_id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                        gap: '0.4rem',
                        padding: '0.4rem 0',
                        borderBottom: '1px solid var(--border)',
                        cursor: teamGradeLevel && teamSection ? 'grab' : 'default',
                        alignItems: 'center'
                      }}
                    >
                      <span>{m.student_id}</span><span>{m.thai_name}</span><span>{m.english_name}</span><span>{m.class_no}</span>
                      <input placeholder="Move to group" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { moveMember(m.student_id, e.currentTarget.value.trim()); e.currentTarget.value = ''; } }} />
                      <button type="button" onClick={() => removeMember(m.student_id)} className="btn btn-outline btn-sm">Remove</button>
                    </div>
                  ))}
                </div>
              ))}
              {(teamOverview.unassigned || []).length > 0 && (
                <div
                  className="card"
                  onDragOver={onTeamDropZoneOver}
                  onDrop={onTeamDropUnassigned}
                >
                  <strong>Unassigned — drop here to remove from group</strong>
                  {teamOverview.unassigned.map((m) => (
                    <div
                      key={m.student_id}
                      draggable={!!teamGradeLevel && !!teamSection}
                      onDragStart={(e) => onTeamMemberDragStart(e, m.student_id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                        gap: '0.4rem',
                        padding: '0.4rem 0',
                        borderBottom: '1px solid var(--border)',
                        cursor: teamGradeLevel && teamSection ? 'grab' : 'default',
                        alignItems: 'center'
                      }}
                    >
                      <span>{m.student_id}</span><span>{m.thai_name}</span><span>{m.english_name}</span><span>{m.class_no}</span>
                      <input placeholder="Add to group" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { moveMember(m.student_id, e.currentTarget.value.trim()); e.currentTarget.value = ''; } }} />
                    </div>
                  ))}
                </div>
              )}
              {teamGroups.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No team groups loaded yet.</p>}
            </div>
          )}

          {tab === 'recording' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Record Quiz/Live Scores to Mode A</h3>
              <div className="card" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: '0.5rem' }}>
                <select value={mappingForm.gradeLevel} onChange={(e) => setMappingForm({ ...mappingForm, gradeLevel: e.target.value })}>
                  <option value="">Grade level</option>
                  {allGradeLevels.map((gl) => <option key={gl} value={gl}>{gl}</option>)}
                </select>
                <select value={mappingForm.targetDatabaseId} onChange={(e) => setMappingForm({ ...mappingForm, targetDatabaseId: e.target.value })}>
                  <option value="">Mode A Database</option>
                  {gradeDatabases.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={mappingForm.period} onChange={(e) => setMappingForm({ ...mappingForm, period: e.target.value })}>
                  <option value="midterm">Midterm</option><option value="final_initial">Final Initial</option><option value="final_final">Final Final</option>
                </select>
                <select value={mappingForm.scoreType} onChange={(e) => setMappingForm({ ...mappingForm, scoreType: e.target.value })}>
                  <option value="individual">Individual</option><option value="group">Group</option>
                </select>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', minWidth: 0 }}>
                  <input type="number" min="0" max="4" placeholder="Slot (0-4)" value={mappingForm.slot} onChange={(e) => setMappingForm({ ...mappingForm, slot: e.target.value })} style={{ width: 100 }} />
                  {mappingForm.targetDatabaseId && slotHints?.[mappingForm.period]?.[mappingForm.scoreType] && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.3 }}>
                      Free: {(slotHints[mappingForm.period][mappingForm.scoreType].freeSlots || []).join(', ') || '—'}
                      {slotHints[mappingForm.period][mappingForm.scoreType].suggestedSlot != null
                        ? ` · suggested ${slotHints[mappingForm.period][mappingForm.scoreType].suggestedSlot}` : ''}
                    </span>
                  )}
                </div>
                <select value={mappingForm.sourceType} onChange={(e) => setMappingForm({ ...mappingForm, sourceType: e.target.value })}>
                  <option value="QUIZ_ATTEMPT">Quiz Attempt</option><option value="LIVE_GAME">Live Game</option>
                </select>
                <select value={mappingForm.sourceQuizId} onChange={(e) => setMappingForm({ ...mappingForm, sourceQuizId: e.target.value })}>
                  <option value="">All quizzes/games</option>
                  {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
                </select>
                <button onClick={createMapping} className="btn btn-primary btn-sm">Create Mapping</button>
                <button onClick={fetchScoreMappings} className="btn btn-outline btn-sm">Refresh Mappings</button>
                <button onClick={fetchRecordEntries} className="btn btn-outline btn-sm">Load Records</button>
              </div>
              {scoreMappings.length > 0 && (
                <table>
                  <thead><tr><th>ID</th><th>Grade</th><th>Target DB</th><th>Target Slot</th><th>Source</th><th>Apply</th><th /></tr></thead>
                  <tbody>
                    {scoreMappings.map((m) => (
                      <tr key={m.id}>
                        <td>{m.id}</td>
                        <td>{m.grade_level}</td>
                        <td>{m.target_database_id}</td>
                        <td>{m.period} / {m.score_type} / slot {m.slot + 1}</td>
                        <td>{m.source_type}{m.source_quiz_id ? ` (${m.source_quiz_id})` : ''}</td>
                        <td><button type="button" onClick={() => applyMapping(m.id)} className="btn btn-secondary btn-sm">Record Now</button></td>
                        <td><button type="button" onClick={() => deleteMapping(m.id)} className="btn btn-danger btn-sm">Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
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

      {reviewAttempt && (
        <div
          role="presentation"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setReviewAttempt(null)}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: 760, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h4 style={{ margin: 0 }}>Attempt review</h4>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setReviewAttempt(null)}>Close</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              {reviewAttempt.student_name} ({reviewAttempt.student_id}) · {reviewAttempt.grade_level} · Section {reviewAttempt.section || '—'} · Score {reviewAttempt.score}/{reviewAttempt.total_points} ({reviewAttempt.percentage}%) ·{' '}
              <span className={`badge ${reviewAttempt.result === 'PASSED' ? 'badge-success' : 'badge-danger'}`}>{reviewAttempt.result || '—'}</span>
            </p>
            <table style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr><th>#</th><th>Question</th><th>Answer</th><th>Correct</th><th>Pts</th><th>OK</th></tr>
              </thead>
              <tbody>
                {(reviewAttempt.answers || []).map((a, idx) => (
                  <tr key={a.question_id || idx}>
                    <td>{idx + 1}</td>
                    <td style={{ maxWidth: 240 }}>{a.question_text}</td>
                    <td>{a.student_answer}</td>
                    <td>{a.correct_answer}</td>
                    <td>{a.points_earned}</td>
                    <td>{Number(a.is_correct) === 1 ? '✓' : '—'}</td>
                  </tr>
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

function StatCard({ label, value }) {
  return (
    <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '0.8rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{label}</p>
      <p style={{ color: 'var(--text-bright)', fontSize: '1.3rem', fontWeight: 700 }}>{value}</p>
    </div>
  );
}
