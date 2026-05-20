import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { KahootPlayerView } from './KahootGame';

export default function QuizStudentPortal({ user, onLogout, showToast }) {
  const [tab, setTab] = useState('available');
  const [quizzes, setQuizzes] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [flags, setFlags] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showRetakeForm, setShowRetakeForm] = useState(null);
  const [retakeReason, setRetakeReason] = useState('');
  const [showLiveGame, setShowLiveGame] = useState(false);
  const [liveJoinPin, setLiveJoinPin] = useState('');
  const timerRef = useRef(null);
  const autoSaveRef = useRef(null);

  useEffect(() => { loadQuizzes(); loadHistory(); }, []);

  useEffect(() => {
    const pin = sessionStorage.getItem('eduverse_join_pin');
    if (pin) {
      sessionStorage.removeItem('eduverse_join_pin');
      setLiveJoinPin(pin);
      setShowLiveGame(true);
    }
  }, []);

  const refreshPortal = async () => {
    await Promise.all([loadQuizzes(), loadHistory()]);
  };

  const loadQuizzes = async () => {
    const res = await api.get(`/quiz/available/${user.gradeLevel}?studentId=${user.id || user.studentId}`);
    if (res.success) setQuizzes(res.data);
    else showToast(res.error || res.message || 'Failed to load quizzes', 'error');
  };

  const loadHistory = async () => {
    const res = await api.get(`/quiz/student/${user.id || user.studentId}/history?gradeLevel=${user.gradeLevel}`);
    if (res.success) setHistory(res.data);
  };

  const startQuiz = async (quizId) => {
    setLoading(true);
    const res = await api.post('/quiz/attempt/start', {
      quizId, studentId: user.id || user.studentId,
      studentName: user.englishName || user.english || '',
      gradeLevel: user.gradeLevel, section: user.section, classNo: user.classNo
    });
    if (res.success) {
      setActiveQuiz(res.data);
      setAnswers({});
      setFlags({});
      setCurrentQ(0);
      setTabSwitchCount(0);
      setResult(null);
      if (res.data.timeLimit > 0) {
        setTimeLeft(res.data.timeLimit * 60);
      }
      startAutoSave(res.data.attemptId);
    } else {
      showToast(res.error || 'Failed to start quiz', 'error');
    }
    setLoading(false);
  };

  // Preserves AnswerSaver auto-save pattern from QuizTaker.html
  const startAutoSave = (attemptId) => {
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    autoSaveRef.current = setInterval(() => {
      const state = { attemptId, answers, flags, currentQ, tabSwitchCount, timeLeft, ts: Date.now() };
      try { localStorage.setItem('qms_quiz_autosave', JSON.stringify(state)); } catch (e) { /* ignore */ }
      api.post('/quiz/attempt/autosave', { attemptId, answers: Object.entries(answers).map(([qId, ans]) => ({ questionId: parseInt(qId), answer: ans })), tabSwitchCount });
    }, 10000);
  };

  // Timer effect
  useEffect(() => {
    if (!activeQuiz || activeQuiz.timeLimit <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { submitQuiz(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeQuiz]);

  // Tab switch detection (preserves anti-cheat from QuizTaker.html)
  useEffect(() => {
    if (!activeQuiz) return;
    const handler = () => {
      if (document.hidden) {
        setTabSwitchCount(prev => prev + 1);
        showToast('Tab switch detected! This is recorded.', 'error');
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [activeQuiz]);

  const submitQuiz = useCallback(async () => {
    if (!activeQuiz) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    localStorage.removeItem('qms_quiz_autosave');

    setLoading(true);
    const answerList = activeQuiz.questions.map(q => ({
      questionId: q.id, answer: answers[q.id] || ''
    }));

    const res = await api.post('/quiz/attempt/submit', {
      attemptId: activeQuiz.attemptId, answers: answerList, tabSwitchCount
    });

    if (res.success) {
      setResult(res.data);
      setActiveQuiz(null);
      loadQuizzes();
      loadHistory();
    } else {
      showToast(res.error || 'Submit failed', 'error');
    }
    setLoading(false);
  }, [activeQuiz, answers, tabSwitchCount]);

  const selectAnswer = (questionId, answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const toggleFlag = (questionId) => {
    setFlags(prev => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const requestRetake = async (quizId, quizTitle) => {
    if (!retakeReason.trim()) { showToast('Please provide a reason', 'error'); return; }
    const res = await api.post('/quiz/retake-request', {
      studentId: user.id || user.studentId, studentName: user.englishName || '',
      quizId, quizTitle, reason: retakeReason
    });
    showToast(res.message || (res.success ? 'Retake request submitted' : 'Request failed'), res.success ? 'success' : 'error');
    if (res.success) {
      setShowRetakeForm(null);
      setRetakeReason('');
      await loadHistory();
    }
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (showLiveGame) {
    return <KahootPlayerView user={user} showToast={showToast} initialPin={liveJoinPin} onBack={() => { setShowLiveGame(false); setLiveJoinPin(''); }} />;
  }

  // Active quiz view
  if (activeQuiz) {
    const question = activeQuiz.questions[currentQ];
    const totalQ = activeQuiz.questions.length;
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
        <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--secondary)' }}>{activeQuiz.quizTitle}</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Question {currentQ + 1} of {totalQ}</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {activeQuiz.timeLimit > 0 && (
              <span style={{ color: timeLeft < 60 ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, fontSize: '1.2rem' }}>
                {formatTime(timeLeft)}
              </span>
            )}
            <button onClick={submitQuiz} className="btn btn-danger btn-sm" disabled={loading}>Submit Quiz</button>
          </div>
        </header>

        <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
          <div style={{ width: 80, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '0.5rem', overflowY: 'auto' }}>
            {activeQuiz.questions.map((q, i) => (
              <button key={i} onClick={() => setCurrentQ(i)}
                style={{
                  display: 'block', width: '100%', padding: '0.4rem', marginBottom: '0.3rem', borderRadius: 6,
                  background: i === currentQ ? 'var(--primary)' : answers[q.id] ? 'var(--success)' : 'var(--bg-input)',
                  color: '#fff', border: flags[q.id] ? '2px solid var(--warning)' : 'none', cursor: 'pointer',
                  fontSize: '0.85rem', textAlign: 'center'
                }}>
                {i + 1}
              </button>
            ))}
          </div>

          <main style={{ flex: 1, padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
            {question && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Points: {question.points}</span>
                  <button onClick={() => toggleFlag(question.id)} className={`btn btn-sm ${flags[question.id] ? 'btn-secondary' : 'btn-outline'}`}>
                    {flags[question.id] ? 'Flagged' : 'Flag'}
                  </button>
                </div>
                <h3 style={{ color: 'var(--text-bright)', marginBottom: '1.5rem', fontSize: '1.1rem', lineHeight: 1.5 }}>{question.questionText}</h3>
                {question.mediaUrl && (
                  <div style={{ marginBottom: '1rem' }}>
                    {question.mediaType === 'image' && <img src={question.mediaUrl} alt="Question media" style={{ maxWidth: '100%', borderRadius: 8 }} />}
                    {question.mediaType === 'video' && <video src={question.mediaUrl} controls style={{ width: '100%', borderRadius: 8 }} />}
                    {question.mediaType === 'audio' && <audio src={question.mediaUrl} controls style={{ width: '100%' }} />}
                  </div>
                )}
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {question.choices.map((choice, ci) => {
                    const letter = choice.letter || String.fromCharCode(65 + ci);
                    const isSelected = answers[question.id] === letter;
                    return (
                      <button key={ci} onClick={() => selectAnswer(question.id, letter)}
                        style={{
                          padding: '0.8rem 1rem', borderRadius: 8, textAlign: 'left',
                          background: isSelected ? 'rgba(108,92,231,0.3)' : 'var(--bg-input)',
                          border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                          color: 'var(--text-bright)', cursor: 'pointer', transition: 'all 0.2s'
                        }}>
                        <span style={{ fontWeight: 700, marginRight: '0.8rem', color: isSelected ? 'var(--primary)' : 'var(--text-dim)' }}>{letter}.</span>
                        {choice.text}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
                  <button onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} className="btn btn-outline" disabled={currentQ === 0}>Previous</button>
                  {currentQ < totalQ - 1 ? (
                    <button onClick={() => setCurrentQ(currentQ + 1)} className="btn btn-primary">Next</button>
                  ) : (
                    <button onClick={submitQuiz} className="btn btn-danger" disabled={loading}>Submit Quiz</button>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  // Result view
  if (result) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: 600, width: '100%', textAlign: 'center' }}>
          <h2 style={{ color: result.result === 'PASSED' ? 'var(--success)' : 'var(--danger)', fontSize: '2rem', marginBottom: '0.5rem' }}>
            {result.result}
          </h2>
          <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-bright)', marginBottom: '0.5rem' }}>{result.percentage}%</p>
          <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>Score: {result.score} / {result.totalPoints} | Tab Switches: {result.tabSwitchCount}</p>
          <h4 style={{ marginBottom: '0.8rem', textAlign: 'left' }}>Answers Review</h4>
          <div style={{ textAlign: 'left' }}>
            {(result.answers || []).map((a, i) => (
              <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ flex: 1, fontSize: '0.85rem' }}>{i + 1}. {a.questionText?.substring(0, 50)}...</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Your: {a.studentAnswer || '-'}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Correct: {a.correctAnswer}</span>
                  <span className={`badge ${a.isCorrect ? 'badge-success' : 'badge-danger'}`}>{a.isCorrect ? 'Correct' : 'Wrong'}</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { setResult(null); setTab('available'); }} className="btn btn-primary" style={{ marginTop: '1.5rem' }}>Back to Quizzes</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--secondary)', fontSize: '1.2rem' }}>EDUVERSE — Quiz Arena</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
            {user.englishName || user.id || user.studentId} | {user.gradeLevel} | {user.section}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={refreshPortal} className="btn btn-outline btn-sm" disabled={loading}>Refresh</button>
          <button onClick={onLogout} className="btn btn-danger btn-sm">Logout</button>
        </div>
      </header>

      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button onClick={() => setTab('available')} className={`btn btn-sm ${tab === 'available' ? 'btn-secondary' : 'btn-outline'}`}>Available Quizzes</button>
          <button onClick={() => setTab('history')} className={`btn btn-sm ${tab === 'history' ? 'btn-secondary' : 'btn-outline'}`}>My History</button>
          <button onClick={() => setShowLiveGame(true)} className="btn btn-sm btn-primary" style={{ background: 'linear-gradient(135deg, #6c5ce7, #00cec9)' }}>Join Live Game</button>
        </div>

        {tab === 'available' && (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {quizzes.map(q => (
              <div key={q.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ color: 'var(--text-bright)' }}>{q.title}</h4>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    {q.type} | {(q.period || 'midterm').toUpperCase()} | {q.subject} | {q.question_count} questions | Pass: {q.passing_score}%
                    {q.time_limit > 0 && ` | ${q.time_limit} min`}
                  </p>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    Attempts: {q.attemptsUsed}/{q.maxAttempts}
                    {q.bestScore !== null && ` | Best: ${q.bestScore}%`}
                    {q.isExpired && ' | EXPIRED'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  {q.canTake ? (
                    <button onClick={() => startQuiz(q.id)} className="btn btn-secondary btn-sm" disabled={loading}>
                      {loading ? 'Starting...' : 'Take Quiz'}
                    </button>
                  ) : (
                    <div>
                      <span className="badge badge-danger" style={{ marginRight: '0.5rem' }}>
                        {q.isExpired ? 'Expired' : 'Max Attempts'}
                      </span>
                      <button onClick={() => setShowRetakeForm(q)} className="btn btn-outline btn-sm">Request Retake</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {quizzes.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No quizzes available for your grade level</p>}
          </div>
        )}

        {tab === 'history' && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Quiz</th><th>Subject</th><th>Score</th><th>%</th><th>Result</th><th>Date</th></tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>{h.quiz_title}</td><td>{h.subject}</td>
                    <td>{h.score}/{h.total_points}</td><td>{h.percentage}%</td>
                    <td><span className={`badge ${h.result === 'PASSED' ? 'badge-success' : 'badge-danger'}`}>{h.result}</span></td>
                    <td style={{ fontSize: '0.8rem' }}>{h.end_time}</td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan="6" style={{ color: 'var(--text-dim)', textAlign: 'center' }}>No quiz history yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {showRetakeForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div className="card" style={{ maxWidth: 400, width: '100%' }}>
              <h3 style={{ marginBottom: '0.8rem' }}>Request Retake — {showRetakeForm.title}</h3>
              <textarea placeholder="Reason for retake request..." value={retakeReason} onChange={e => setRetakeReason(e.target.value)} rows={3} style={{ width: '100%', marginBottom: '0.8rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => requestRetake(showRetakeForm.id, showRetakeForm.title)} className="btn btn-primary btn-sm">Submit</button>
                <button onClick={() => { setShowRetakeForm(null); setRetakeReason(''); }} className="btn btn-outline btn-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
