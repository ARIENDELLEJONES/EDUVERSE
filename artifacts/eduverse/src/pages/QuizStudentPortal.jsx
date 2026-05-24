import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { KahootPlayerView } from './KahootGame';

function genWordHuntGrid(word, size = 10) {
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Place word horizontally at random position
  const row = Math.floor(Math.random() * size);
  const col = Math.min(Math.floor(Math.random() * (size - word.length)), size - word.length);
  for (let i = 0; i < word.length; i++) grid[row][col + i] = word[i];
  // Fill rest with random letters
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!grid[r][c]) grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
  }
  return grid;
}

function MatchingQuestion({ question, answer, onAnswer }) {
  const pairs = question.extraData?.pairs || [];
  const leftItems = pairs.map(p => p.left);
  const rightItems = [...pairs.map(p => p.right)].sort(() => Math.random() - 0.5);
  const stored = (() => { try { return answer ? JSON.parse(answer) : []; } catch { return []; } })();
  const getRight = (left) => (stored.find(s => s.left === left) || {}).right || '';
  const updateMatch = (left, right) => {
    const newPairs = leftItems.map(l => ({ left: l, right: l === left ? right : getRight(l) })).filter(p => p.right);
    onAnswer(JSON.stringify(newPairs));
  };
  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      {leftItems.map((left, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', padding: '0.6rem', background: 'var(--bg-input)', borderRadius: 8 }}>
          <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-bright)' }}>{left}</span>
          <span style={{ color: 'var(--text-dim)' }}>→</span>
          <select value={getRight(left)} onChange={e => updateMatch(left, e.target.value)} style={{ flex: 1, padding: '0.4rem', borderRadius: 6, background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <option value="">Select match...</option>
            {rightItems.map((right, j) => <option key={j} value={right}>{right}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function MultipleResponseQuestion({ question, answer, onAnswer }) {
  const choices = question.choices.length > 0 ? question.choices : (question.extraData?.choices || []).map((c, i) => ({ letter: 'ABCDEF'[i], text: c }));
  const selected = new Set((answer || '').split(',').filter(Boolean));
  const toggle = (letter) => {
    const next = new Set(selected);
    if (next.has(letter)) next.delete(letter); else next.add(letter);
    onAnswer([...next].sort().join(','));
  };
  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: '0 0 0.3rem' }}>Select all that apply:</p>
      {choices.map((choice, i) => {
        const letter = choice.letter || 'ABCDEF'[i];
        const isSelected = selected.has(letter);
        return (
          <button key={i} onClick={() => toggle(letter)}
            style={{ padding: '0.8rem 1rem', borderRadius: 8, textAlign: 'left', display: 'flex', gap: '0.8rem', alignItems: 'center', background: isSelected ? 'rgba(108,92,231,0.3)' : 'var(--bg-input)', border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`, color: 'var(--text-bright)', cursor: 'pointer', transition: 'all 0.2s' }}>
            <span style={{ width: 24, height: 24, borderRadius: 4, border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`, background: isSelected ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isSelected && <span style={{ color: '#fff', fontSize: '0.8rem' }}>✓</span>}
            </span>
            <span style={{ fontWeight: 600, color: isSelected ? 'var(--primary)' : 'var(--text-dim)', minWidth: 20 }}>{letter}.</span>
            {choice.text}
          </button>
        );
      })}
    </div>
  );
}

function SequencingQuestion({ question, answer, onAnswer }) {
  const items = question.extraData?.items || [];
  const [order, setOrder] = useState(() => {
    try {
      const stored = answer ? JSON.parse(answer) : null;
      return stored || [...items].sort(() => Math.random() - 0.5);
    } catch { return [...items].sort(() => Math.random() - 0.5); }
  });
  const dragItemRef = useRef(null);
  const move = (fromIndex, toIndex) => {
    const next = [...order];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrder(next);
    const correctOrder = items;
    const indices = next.map(item => correctOrder.indexOf(item) + 1);
    onAnswer(JSON.stringify(next));
  };
  return (
    <div style={{ display: 'grid', gap: '0.4rem' }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Drag to reorder — arrange in the correct sequence:</p>
      {order.map((item, i) => (
        <div key={item} draggable
          onDragStart={() => { dragItemRef.current = i; }}
          onDragOver={e => e.preventDefault()}
          onDrop={() => { if (dragItemRef.current !== null && dragItemRef.current !== i) move(dragItemRef.current, i); dragItemRef.current = null; }}
          style={{ padding: '0.7rem 1rem', background: 'var(--bg-input)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'grab', border: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 800, color: 'var(--primary)', minWidth: 24 }}>{i + 1}</span>
          <span style={{ color: 'var(--text)', flex: 1 }}>{item}</span>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>⠿</span>
        </div>
      ))}
      <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Tip: Drag items up and down to reorder</p>
    </div>
  );
}

function RatingGridQuestion({ question, answer, onAnswer }) {
  const rows = question.extraData?.rows || [];
  const cols = question.extraData?.cols || ['1', '2', '3', '4', '5'];
  const stored = (() => { try { return answer ? JSON.parse(answer) : {}; } catch { return {}; } })();
  const setRating = (row, col) => {
    const next = { ...stored, [row]: col };
    onAnswer(JSON.stringify(next));
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Item</th>
            {cols.map(c => <th key={c} style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '0.6rem 0.5rem', color: 'var(--text)' }}>{row}</td>
              {cols.map(col => {
                const selected = stored[row] === col;
                return (
                  <td key={col} style={{ textAlign: 'center', padding: '0.4rem' }}>
                    <button onClick={() => setRating(row, col)}
                      style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`, background: selected ? 'var(--primary)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}
                      aria-label={`Rate ${row} as ${col}`} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WordHuntQuestion({ question, answer, onAnswer }) {
  const word = (question.extraData?.word || question.correctAnswer || '').toUpperCase();
  const [grid] = useState(() => genWordHuntGrid(word));
  const [highlighted, setHighlighted] = useState(new Set());
  const [wordInput, setWordInput] = useState(answer || '');
  const [selecting, setSelecting] = useState(false);
  const [startCell, setStartCell] = useState(null);
  const handleCellClick = (r, c) => {
    setHighlighted(prev => { const next = new Set(prev); const key = `${r},${c}`; if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const handleInput = (val) => {
    setWordInput(val.toUpperCase());
    onAnswer(val.toUpperCase());
  };
  return (
    <div>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>Find the hidden word in the grid below, then type it in the box:</p>
      <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(10, 32px)`, gap: 2, marginBottom: '1rem', overflowX: 'auto' }}>
        {grid.map((row, r) => row.map((cell, c) => {
          const isHL = highlighted.has(`${r},${c}`);
          return (
            <button key={`${r}-${c}`} onClick={() => handleCellClick(r, c)}
              style={{ width: 32, height: 32, borderRadius: 4, background: isHL ? 'rgba(108,92,231,0.5)' : 'var(--bg-input)', border: `1px solid ${isHL ? 'var(--primary)' : 'var(--border)'}`, color: 'var(--text-bright)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s', fontFamily: 'monospace' }}>
              {cell}
            </button>
          );
        }))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input value={wordInput} onChange={e => handleInput(e.target.value)} placeholder="Type the word you found..." style={{ flex: 1, fontFamily: 'monospace', letterSpacing: 3, fontSize: '1.1rem', textTransform: 'uppercase' }} maxLength={30} />
        {wordInput && <button onClick={() => { setWordInput(''); onAnswer(''); setHighlighted(new Set()); }} style={{ background: 'none', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>✕</button>}
      </div>
      {wordInput && <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.3rem' }}>Your answer: <strong style={{ color: 'var(--secondary)', fontFamily: 'monospace', letterSpacing: 2 }}>{wordInput}</strong></p>}
    </div>
  );
}

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
  const [isBlocked, setIsBlocked] = useState(false);
  const timerRef = useRef(null);
  const autoSaveRef = useRef(null);
  const statusRef = useRef(null);

  useEffect(() => { loadQuizzes(); loadHistory(); }, []);

  useEffect(() => {
    const pin = sessionStorage.getItem('eduverse_join_pin');
    if (pin) { sessionStorage.removeItem('eduverse_join_pin'); setLiveJoinPin(pin); setShowLiveGame(true); }
  }, []);

  const refreshPortal = async () => { await Promise.all([loadQuizzes(), loadHistory()]); };

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
      setIsBlocked(false);
      if (res.data.timeLimit > 0) setTimeLeft(res.data.timeLimit * 60);
      startAutoSave(res.data.attemptId);
      startStatusReporter(res.data.attemptId, quizId);
    } else {
      showToast(res.error || 'Failed to start quiz', 'error');
    }
    setLoading(false);
  };

  // Preserves AnswerSaver auto-save pattern
  const startAutoSave = (attemptId) => {
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    autoSaveRef.current = setInterval(() => {
      const state = { attemptId, answers, flags, currentQ, tabSwitchCount, timeLeft, ts: Date.now() };
      try { localStorage.setItem('qms_quiz_autosave', JSON.stringify(state)); } catch {}
      api.post('/quiz/attempt/autosave', { attemptId, answers: Object.entries(answers).map(([qId, ans]) => ({ questionId: parseInt(qId), answer: ans })), tabSwitchCount });
    }, 10000);
  };

  // Report status to server every 15 seconds
  const startStatusReporter = (attemptId, quizId) => {
    if (statusRef.current) clearInterval(statusRef.current);
    statusRef.current = setInterval(async () => {
      if (!quizId) return;
      const res = await api.post('/quiz/student-status', {
        quizId, attemptId, studentId: user.id || user.studentId, currentQuestion: currentQ, tabSwitchCount
      });
      if (res?.isBlocked) {
        setIsBlocked(true);
        clearInterval(statusRef.current);
        showToast('You have been blocked from this quiz by the teacher.', 'error');
      }
    }, 15000);
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
    if (statusRef.current) clearInterval(statusRef.current);
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
    if (res.success) { setShowRetakeForm(null); setRetakeReason(''); await loadHistory(); }
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (showLiveGame) {
    return <KahootPlayerView user={user} showToast={showToast} initialPin={liveJoinPin} onBack={() => { setShowLiveGame(false); setLiveJoinPin(''); }} />;
  }

  // ── Active quiz view ────────────────────────────────────────────
  if (activeQuiz) {
    const question = activeQuiz.questions[currentQ];
    const totalQ = activeQuiz.questions.length;
    const qType = (question?.questionType || 'MCQ').toUpperCase();

    if (isBlocked) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ maxWidth: 500, textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
            <h2 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Quiz Access Blocked</h2>
            <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>Your teacher has blocked your access to this quiz. Please raise your hand and wait for assistance.</p>
            <button onClick={() => { setActiveQuiz(null); setIsBlocked(false); }} className="btn btn-outline">Return to Dashboard</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
        <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--secondary)' }}>{activeQuiz.quizTitle}</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Question {currentQ + 1} of {totalQ} | Tab Switches: {tabSwitchCount}</p>
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
          <div style={{ width: 80, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '0.5rem', overflowY: 'auto', flexShrink: 0 }}>
            {activeQuiz.questions.map((q, i) => (
              <button key={i} onClick={() => setCurrentQ(i)}
                style={{ display: 'block', width: '100%', padding: '0.4rem', marginBottom: '0.3rem', borderRadius: 6, background: i === currentQ ? 'var(--primary)' : answers[q.id] ? 'var(--success)' : 'var(--bg-input)', color: '#fff', border: flags[q.id] ? '2px solid var(--warning)' : 'none', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'center' }}>
                {i + 1}
              </button>
            ))}
          </div>

          <main style={{ flex: 1, padding: '2rem', maxWidth: 800, margin: '0 auto', width: '100%' }}>
            {question && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Points: {question.points}</span>
                    <span style={{ fontSize: '0.75rem', background: 'var(--bg-input)', color: 'var(--text-dim)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>{qType}</span>
                  </div>
                  <button onClick={() => toggleFlag(question.id)} className={`btn btn-sm ${flags[question.id] ? 'btn-secondary' : 'btn-outline'}`}>
                    {flags[question.id] ? '🚩 Flagged' : 'Flag'}
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

                {/* Question type renderers */}
                {qType === 'MATCHING' ? (
                  <MatchingQuestion question={question} answer={answers[question.id] || ''} onAnswer={(a) => selectAnswer(question.id, a)} />
                ) : qType === 'MULTIPLE_RESPONSE' ? (
                  <MultipleResponseQuestion question={question} answer={answers[question.id] || ''} onAnswer={(a) => selectAnswer(question.id, a)} />
                ) : qType === 'SEQUENCING' ? (
                  <SequencingQuestion question={question} answer={answers[question.id] || ''} onAnswer={(a) => selectAnswer(question.id, a)} />
                ) : qType === 'RATING_GRID' ? (
                  <RatingGridQuestion question={question} answer={answers[question.id] || ''} onAnswer={(a) => selectAnswer(question.id, a)} />
                ) : qType === 'WORD_HUNT' ? (
                  <WordHuntQuestion question={question} answer={answers[question.id] || ''} onAnswer={(a) => selectAnswer(question.id, a)} />
                ) : qType === 'TF' ? (
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {['True', 'False'].map(opt => {
                      const isSelected = answers[question.id] === opt;
                      return (
                        <button key={opt} onClick={() => selectAnswer(question.id, opt)}
                          style={{ padding: '1rem', borderRadius: 8, textAlign: 'left', background: isSelected ? (opt === 'True' ? 'rgba(0,206,201,0.3)' : 'rgba(255,71,87,0.3)') : 'var(--bg-input)', border: `2px solid ${isSelected ? (opt === 'True' ? 'var(--secondary)' : 'var(--danger)') : 'var(--border)'}`, color: 'var(--text-bright)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600 }}>
                          {opt === 'True' ? '✓ True' : '✗ False'}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {question.choices.map((choice, ci) => {
                      const letter = choice.letter || String.fromCharCode(65 + ci);
                      const isSelected = answers[question.id] === letter;
                      return (
                        <button key={ci} onClick={() => selectAnswer(question.id, letter)}
                          style={{ padding: '0.8rem 1rem', borderRadius: 8, textAlign: 'left', background: isSelected ? 'rgba(108,92,231,0.3)' : 'var(--bg-input)', border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`, color: 'var(--text-bright)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                          <span style={{ fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--text-dim)', minWidth: 20 }}>{letter}.</span>
                          <div style={{ flex: 1 }}>
                            {choice.text}
                            {choice.mediaUrl && choice.mediaType === 'image' && <img src={choice.mediaUrl} alt="" style={{ maxWidth: 200, marginTop: 4, display: 'block', borderRadius: 4 }} />}
                          </div>
                        </button>
                      );
                    })}
                    {question.choices.length === 0 && (
                      <p style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>No choices available for this question.</p>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
                  <button onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} className="btn btn-outline" disabled={currentQ === 0}>Previous</button>
                  {currentQ < totalQ - 1 ? (
                    <button onClick={() => setCurrentQ(currentQ + 1)} className="btn btn-primary">Next →</button>
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

  // ── Result view ─────────────────────────────────────────────────
  if (result) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: 600, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{result.result === 'PASSED' ? '🎉' : '📚'}</div>
          <h2 style={{ color: result.result === 'PASSED' ? 'var(--success)' : 'var(--danger)', fontSize: '2rem', marginBottom: '0.5rem' }}>
            {result.result}
          </h2>
          <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-bright)', marginBottom: '0.5rem' }}>{result.percentage}%</p>
          <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
            Score: {result.score} / {result.totalPoints} | Tab Switches: {result.tabSwitchCount}
          </p>
          <h4 style={{ marginBottom: '0.8rem', textAlign: 'left' }}>Answers Review</h4>
          <div style={{ textAlign: 'left', maxHeight: 300, overflowY: 'auto', marginBottom: '1rem' }}>
            {(result.answers || []).map((a, i) => (
              <div key={i} style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ flex: 1, fontSize: '0.85rem', minWidth: 120 }}>{i + 1}. {(a.questionText || '').substring(0, 60)}{(a.questionText || '').length > 60 ? '...' : ''}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Your: {(a.studentAnswer || '—').substring(0, 20)}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>✓ {(a.correctAnswer || '').substring(0, 20)}</span>
                  <span className={`badge ${a.isCorrect ? 'badge-success' : 'badge-danger'}`}>{a.isCorrect ? '✓' : '✗'}</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { setResult(null); setTab('available'); }} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Back to Quizzes</button>
        </div>
      </div>
    );
  }

  // ── Main portal view ────────────────────────────────────────────
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
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => setTab('available')} className={`btn btn-sm ${tab === 'available' ? 'btn-secondary' : 'btn-outline'}`}>📝 Available Quizzes</button>
          <button onClick={() => setTab('history')} className={`btn btn-sm ${tab === 'history' ? 'btn-secondary' : 'btn-outline'}`}>My History</button>
          <button onClick={() => setShowLiveGame(true)} className="btn btn-sm btn-primary" style={{ background: 'linear-gradient(135deg, #6c5ce7, #00cec9)' }}>🎮 Join Live Game</button>
        </div>

        {tab === 'available' && (
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {quizzes.map(q => (
              <div key={q.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h4 style={{ color: 'var(--text-bright)' }}>{q.title}</h4>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    {q.type} | {(q.period || 'midterm').toUpperCase()} | {q.subject} | {q.question_count} questions | Pass: {q.passing_score}%
                    {q.time_limit > 0 && ` | ${q.time_limit} min`}
                    {q.strict_mode ? ' | ⚠ Strict Mode' : ''}
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
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <span className="badge badge-danger">{q.isExpired ? 'Expired' : 'Max Attempts'}</span>
                      <button onClick={() => setShowRetakeForm(q)} className="btn btn-outline btn-sm">Request Retake</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {quizzes.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</p>
                <p>No quizzes available for your grade level yet.</p>
                <p style={{ fontSize: '0.85rem' }}>To join a live game, use the button above.</p>
              </div>
            )}
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
