import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { KahootPlayerView } from './KahootGame';

function genWordHuntGrid(wordOrWords, gridSize) {
  const size = gridSize || 15;
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  const wordsToPlace = Array.isArray(wordOrWords) ? wordOrWords : (wordOrWords ? [wordOrWords] : []);
  for (const word of wordsToPlace) {
    const w = word.toUpperCase();
    for (let attempt = 0; attempt < 200; attempt++) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const r = Math.floor(Math.random() * size);
      const c = Math.floor(Math.random() * size);
      let canPlace = true;
      for (let i = 0; i < w.length; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) { canPlace = false; break; }
        if (grid[nr][nc] !== '' && grid[nr][nc] !== w[i]) { canPlace = false; break; }
      }
      if (canPlace) {
        for (let i = 0; i < w.length; i++) grid[r + dr * i][c + dc * i] = w[i];
        break;
      }
    }
  }
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) grid[r][c] = letters[Math.floor(Math.random() * 26)];
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
  const extraData = question.extraData || {};
  const rows = extraData.rows || [];
  const cols = extraData.cols || extraData.columns?.map(c => c.label || c) || ['1', '2', '3', '4', '5'];
  const scoringMode = extraData.scoringMode || 'total';
  const stored = (() => { try { return answer ? JSON.parse(answer) : {}; } catch { return {}; } })();
  const setRating = (row, col) => {
    const next = { ...stored, [row]: col };
    onAnswer(JSON.stringify(next));
  };
  const answeredCount = Object.keys(stored).length;
  const totalScore = Object.values(stored).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const avgScore = answeredCount > 0 ? (totalScore / answeredCount).toFixed(1) : 0;
  const maxPossible = rows.length * cols.length;
  const pct = maxPossible > 0 ? ((totalScore / maxPossible) * 100).toFixed(0) : 0;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: '0.6rem', textAlign: 'left', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Criteria</th>
            {cols.map((c, i) => <th key={i} style={{ padding: '0.6rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', minWidth: 60 }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
              <td style={{ padding: '0.7rem 0.6rem', color: 'var(--text-bright)', fontSize: '0.9rem' }}>{row}</td>
              {cols.map((col, ci) => {
                const selected = stored[row] === col;
                return (
                  <td key={ci} style={{ textAlign: 'center', padding: '0.4rem' }}>
                    <button onClick={() => setRating(row, col)}
                      style={{ width: 30, height: 30, borderRadius: '50%', border: `2px solid ${selected ? '#4285f4' : 'var(--border)'}`, background: selected ? '#4285f4' : 'transparent', cursor: 'pointer', transition: 'all 0.2s', boxShadow: selected ? '0 0 8px rgba(66,133,244,0.3)' : 'none' }}
                      aria-label={`Rate ${row} as ${col}`} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {answeredCount > 0 && (
        <div style={{ marginTop: '0.8rem', padding: '0.8rem', background: 'rgba(0,206,201,0.05)', borderRadius: 8, border: '1px solid rgba(0,206,201,0.2)', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', color: 'var(--text-dim)' }}>
            <span>Completed: {answeredCount}/{rows.length}</span>
            {scoringMode === 'total' && <span>Total: {totalScore}</span>}
            {scoringMode === 'average' && <span>Average: {avgScore}</span>}
            <span>{pct}% satisfaction</span>
          </div>
        </div>
      )}
    </div>
  );
}

function WordHuntQuestion({ question, answer, onAnswer }) {
  const extraData = question.extraData || {};
  const words = extraData.words || (extraData.word ? [extraData.word.toUpperCase()] : [(question.correctAnswer || '').toUpperCase()]);
  const gridSize = extraData.gridSize || (extraData.grid ? extraData.grid.length : 15);
  const [grid] = useState(() => {
    if (extraData.grid) return extraData.grid;
    return genWordHuntGrid(words[0] || '', gridSize);
  });
  const [foundWords, setFoundWords] = useState(() => {
    try { return answer ? JSON.parse(answer) : []; } catch { return []; }
  });
  const [selecting, setSelecting] = useState(false);
  const [startCell, setStartCell] = useState(null);
  const [selectedCells, setSelectedCells] = useState([]);
  const [highlightedCells, setHighlightedCells] = useState(new Set());
  const [foundCells, setFoundCells] = useState(new Set());
  const [flashMsg, setFlashMsg] = useState('');
  const [wrongFlash, setWrongFlash] = useState(new Set());

  const getCellsInLine = (start, end) => {
    const cells = [];
    const dr = Math.sign(end.r - start.r);
    const dc = Math.sign(end.c - start.c);
    if (dr === 0 && dc === 0) { cells.push(`${start.r},${start.c}`); return cells; }
    let r = start.r, c = start.c;
    const maxSteps = Math.max(Math.abs(end.r - start.r), Math.abs(end.c - start.c));
    for (let i = 0; i <= maxSteps; i++) {
      cells.push(`${r},${c}`);
      r += dr; c += dc;
    }
    return cells;
  };

  const handleMouseDown = (r, c) => {
    setSelecting(true);
    setStartCell({ r, c });
    setSelectedCells([`${r},${c}`]);
  };

  const handleMouseEnter = (r, c) => {
    if (!selecting || !startCell) return;
    const cells = getCellsInLine(startCell, { r, c });
    setSelectedCells(cells);
  };

  const handleMouseUp = (r, c) => {
    if (!selecting || !startCell) return;
    setSelecting(false);
    const cells = getCellsInLine(startCell, { r, c });
    const selectedWord = cells.map(key => {
      const [cr, cc] = key.split(',').map(Number);
      return grid[cr]?.[cc] || '';
    }).join('');
    const reversed = selectedWord.split('').reverse().join('');
    const matchIdx = words.findIndex(w => w.toUpperCase() === selectedWord || w.toUpperCase() === reversed);
    if (matchIdx !== -1 && !foundWords.includes(words[matchIdx])) {
      const newFound = [...foundWords, words[matchIdx]];
      setFoundWords(newFound);
      setFoundCells(prev => { const n = new Set(prev); cells.forEach(c => n.add(c)); return n; });
      setFlashMsg(`#${newFound.length} Found`);
      setTimeout(() => setFlashMsg(''), 2000);
      onAnswer(JSON.stringify(newFound));
    } else if (matchIdx === -1) {
      setWrongFlash(new Set(cells));
      setTimeout(() => setWrongFlash(new Set()), 500);
    }
    setSelectedCells([]);
    setStartCell(null);
  };

  const allFound = foundWords.length >= words.length;

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <h4 style={{ color: 'var(--secondary)', marginBottom: '0.3rem' }}>Word Search Challenge</h4>
      {extraData.theme && <p style={{ color: 'var(--text-bright)', fontSize: '0.9rem' }}>Theme: {extraData.theme}</p>}
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Find all hidden words in the grid</p>
      <p style={{ color: 'var(--text-bright)', fontWeight: 600, marginBottom: '1rem' }}>Total Words: {words.length}</p>

      {flashMsg && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(0,206,201,0.9)', color: '#fff', padding: '1rem 2rem', borderRadius: 12, fontSize: '1.5rem', fontWeight: 800, zIndex: 1000, animation: 'fadeInOut 2s' }}>{flashMsg}</div>
      )}

      <style>{`@keyframes fadeInOut { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.5); } 20% { opacity: 1; transform: translate(-50%,-50%) scale(1.1); } 80% { opacity: 1; } 100% { opacity: 0; } }`}</style>

      <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${gridSize}, 30px)`, gap: 1, marginBottom: '1rem', touchAction: 'none' }}
        onMouseLeave={() => { if (selecting) { setSelecting(false); setSelectedCells([]); setStartCell(null); } }}>
        {grid.map((row, r) => row.map((cell, c) => {
          const key = `${r},${c}`;
          const isSelected = selectedCells.includes(key);
          const isFound = foundCells.has(key);
          const isWrong = wrongFlash.has(key);
          return (
            <div key={key}
              onMouseDown={() => handleMouseDown(r, c)}
              onMouseEnter={() => handleMouseEnter(r, c)}
              onMouseUp={() => handleMouseUp(r, c)}
              style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', borderRadius: 3, cursor: 'pointer',
                background: isWrong ? 'rgba(255,107,107,0.5)' : isFound ? 'rgba(0,206,201,0.4)' : isSelected ? 'rgba(108,92,231,0.4)' : 'var(--bg-input)',
                border: `1px solid ${isFound ? '#00cec9' : isSelected ? '#6c5ce7' : 'var(--border)'}`,
                color: 'var(--text-bright)', transition: 'background 0.15s'
              }}>
              {cell}
            </div>
          );
        }))}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <p style={{ color: 'var(--text-bright)', fontWeight: 600 }}>Words Found: {foundWords.length} / {words.length}</p>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.3rem' }}>
          {words.map((_, i) => (
            <div key={i} style={{
              width: 36, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${i < foundWords.length ? '#00b894' : 'var(--border)'}`,
              borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
              background: i < foundWords.length ? 'rgba(0,184,148,0.2)' : 'transparent',
              color: i < foundWords.length ? '#00b894' : 'var(--text-dim)'
            }}>
              {i + 1} {i < foundWords.length ? '\u2714' : ''}
            </div>
          ))}
        </div>
      </div>

      {allFound && (
        <div style={{ padding: '1.5rem', background: 'rgba(0,206,201,0.1)', borderRadius: 12, border: '1px solid rgba(0,206,201,0.3)' }}>
          <h3 style={{ color: 'var(--secondary)', marginBottom: '0.3rem' }}>All Words Found!</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{foundWords.length}/{words.length} completed</p>
        </div>
      )}
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
  const [cheatPopup, setCheatPopup] = useState(false);
  const [cheatApproved, setCheatApproved] = useState(false);
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

  // Tab switch detection + strict mode anti-cheat popup
  useEffect(() => {
    if (!activeQuiz) return;
    const isStrict = activeQuiz.strictMode || activeQuiz.strict_mode;
    const handler = () => {
      if (document.hidden) {
        setTabSwitchCount(prev => prev + 1);
        if (isStrict && !cheatApproved) {
          setCheatPopup(true);
          api.post(`/quiz/${activeQuiz.quizId || activeQuiz.id}/block-student/${user.id || user.studentId}`);
        } else {
          showToast('Tab switch detected! This is recorded.', 'error');
        }
      }
    };
    const preventScreenshot = (e) => {
      if (isStrict && (e.key === 'PrintScreen' || (e.ctrlKey && e.key === 'c') || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')))) {
        e.preventDefault();
        if (!cheatApproved) {
          setCheatPopup(true);
          api.post(`/quiz/${activeQuiz.quizId || activeQuiz.id}/block-student/${user.id || user.studentId}`);
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    if (isStrict) document.addEventListener('keydown', preventScreenshot);
    return () => { document.removeEventListener('visibilitychange', handler); if (isStrict) document.removeEventListener('keydown', preventScreenshot); };
  }, [activeQuiz, cheatApproved]);

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

    if (cheatPopup) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.9)' }}>
          <div className="card" style={{ maxWidth: 500, textAlign: 'center', border: '2px solid var(--danger)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠</div>
            <h2 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>CHEATING ISSUE</h2>
            <p style={{ color: 'var(--text)', marginBottom: '1.5rem', fontSize: '1.1rem' }}>PLEASE ASK YOUR TEACHER FOR APPROVAL TO CONTINUE.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button onClick={async () => {
                const res = await api.post('/quiz/student-status', { quizId: activeQuiz.quizId || activeQuiz.id, studentId: user.id || user.studentId, currentQuestion: currentQ, tabSwitchCount });
                if (!res?.isBlocked) { setCheatPopup(false); setCheatApproved(true); showToast('Teacher approved. You may continue.'); }
                else showToast('Waiting for teacher approval...', 'error');
              }} className="btn btn-primary" style={{ padding: '0.8rem 1.5rem' }}>
                Continue
              </button>
              <button onClick={() => { setCheatPopup(false); submitQuiz(); }} className="btn btn-danger" style={{ padding: '0.8rem 1.5rem' }}>
                Submit Answer
              </button>
            </div>
          </div>
        </div>
      );
    }

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

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ color: 'var(--text-bright)', fontSize: '1.1rem', lineHeight: 1.5, flex: 1 }}>{question.questionText}</h3>
                  <button onClick={() => { const u = new SpeechSynthesisUtterance(question.questionText); speechSynthesis.speak(u); }} title="Read aloud" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text-dim)', flexShrink: 0, padding: '0.2rem' }}>🔊</button>
                </div>

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
