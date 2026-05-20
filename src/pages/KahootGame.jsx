import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import QRCode from 'qrcode';

const COLORS = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71'];
const SHAPES = ['triangle', 'diamond', 'circle', 'square'];

function CountdownBar({ timeRemaining, timeLimit }) {
  const pct = timeLimit > 0 ? (timeRemaining / timeLimit) * 100 : 100;
  return (
    <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: pct > 30 ? '#00cec9' : pct > 10 ? '#fdcb6e' : '#d63031', transition: 'width 1s linear', borderRadius: 4 }} />
    </div>
  );
}

// ─── TEACHER HOST VIEW ──────────────────────────────────────
export function KahootHostView({ user, quizzes, showToast, onBack }) {
  const [step, setStep] = useState('select');
  const [gameId, setGameId] = useState(null);
  const [pin, setPin] = useState('');
  const [lanBaseUrl, setLanBaseUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [gameState, setGameState] = useState(null);
  const [questionResults, setQuestionResults] = useState(null);
  const [duration, setDuration] = useState(20);
  const [strictMode, setStrictMode] = useState(false);
  const [gameMode, setGameMode] = useState('INDIVIDUAL');
  const [groupGradeLevel, setGroupGradeLevel] = useState('');
  const [groupSection, setGroupSection] = useState('');
  const pollRef = useRef(null);

  const createGame = async (quizId) => {
    const res = await api.post('/livegame/create', {
      quizId, hostId: user.id || user.username || '', questionDuration: duration, strictMode, gameMode,
      groupGradeLevel: gameMode === 'GROUP' ? groupGradeLevel : '',
      groupSection: gameMode === 'GROUP' ? groupSection : ''
    });
    if (res.success) {
      setGameId(res.data.gameId);
      setPin(res.data.pin);
      setStep('lobby');
      startPolling(res.data.gameId);
    } else {
      showToast(res.error || 'Failed to create game', 'error');
    }
  };

  const startPolling = (gId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await api.get(`/livegame/${gId}/state`);
      if (res.success) setGameState(res.data);
    }, 1000);
  };

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);
  useEffect(() => {
    let cancelled = false;
    let refreshTimer = null;

    const resolveJoinBaseUrl = async () => {
      const res = await api.get('/system/info');
      const lan = Array.isArray(res?.lanAddresses) && res.lanAddresses.length > 0
        ? res.lanAddresses[0]
        : '';

      if (!cancelled) {
        if (lan) {
          setLanBaseUrl(lan);
          return;
        }
        // Browser fallback when running as normal web app.
        if (window.location?.origin && window.location.origin.startsWith('http')) {
          setLanBaseUrl(window.location.origin);
        }
      }
    };

    resolveJoinBaseUrl();
    if (step === 'lobby') {
      refreshTimer = setInterval(resolveJoinBaseUrl, 5000);
    }

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [step]);

  const joinBaseUrl = lanBaseUrl || (window.location?.origin?.startsWith('http') ? window.location.origin : '');
  const joinLink = joinBaseUrl ? `${joinBaseUrl}/quiz/live?pin=${pin}` : '';
  useEffect(() => {
    let cancelled = false;
    if (!joinLink) {
      setQrDataUrl('');
      return;
    }

    QRCode.toDataURL(joinLink, { width: 180, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(''); });

    return () => { cancelled = true; };
  }, [joinLink]);
  useEffect(() => {
    if (!gameState?.strictMode) return;
    const onVisibility = () => {
      if (document.hidden) showToast('Strict mode: do not leave the game screen', 'error');
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [gameState?.strictMode]);

  const startGame = async () => {
    const res = await api.post(`/livegame/${gameId}/start`);
    if (res.success) {
      setStep('playing');
      setQuestionResults(null);
    } else {
      showToast(res.error || res.message || 'Failed to start game', 'error');
    }
  };

  const showResults = async () => {
    const res = await api.post(`/livegame/${gameId}/show-results`);
    if (res.success) {
      setQuestionResults(res.data);
      setStep('results');
    } else {
      showToast(res.error || res.message || 'Failed to show results', 'error');
    }
  };

  const nextQuestion = async () => {
    const res = await api.post(`/livegame/${gameId}/next`);
    if (!res.success) {
      showToast(res.error || res.message || 'Failed to advance', 'error');
      return;
    }
    if (res.data?.finished) {
      setStep('final');
    } else {
      setStep('playing');
      setQuestionResults(null);
    }
  };

  const endGame = async () => {
    const res = await api.post(`/livegame/${gameId}/end`);
    if (pollRef.current) clearInterval(pollRef.current);
    if (res.success) {
      setStep('final');
    } else {
      showToast(res.error || res.message || 'Failed to end game', 'error');
    }
  };

  // Select quiz screen
  if (step === 'select') {
    return (
      <div style={{ padding: '2rem' }}>
        <button onClick={onBack} className="btn btn-outline btn-sm" style={{ marginBottom: '1rem' }}>Back</button>
        <h3 style={{ color: 'var(--text-bright)', marginBottom: '1rem' }}>Start Live Game</h3>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Time per question (seconds)</label>
          <input type="number" value={duration} onChange={e => setDuration(parseInt(e.target.value) || 20)} style={{ width: 100, marginLeft: '0.5rem' }} />
          <select value={gameMode} onChange={e => setGameMode(e.target.value)} style={{ marginLeft: '0.5rem' }}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="GROUP">Group</option>
          </select>
          {gameMode === 'GROUP' && (
            <>
              <input value={groupGradeLevel} onChange={e => setGroupGradeLevel(e.target.value)} placeholder="Grade level" style={{ marginLeft: '0.5rem', width: 140 }} />
              <input value={groupSection} onChange={e => setGroupSection(e.target.value)} placeholder="Section no." style={{ marginLeft: '0.5rem', width: 110 }} />
            </>
          )}
          <label style={{ marginLeft: '0.5rem', color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={strictMode} onChange={e => setStrictMode(e.target.checked)} /> Strict mode
          </label>
        </div>
        <p style={{ color: 'var(--text-dim)', marginBottom: '1rem' }}>Select a quiz to play:</p>
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {quizzes.filter(q => q.question_count > 0).map(q => (
            <button key={q.id} onClick={() => createGame(q.id)} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--text-bright)' }}>{q.title}</strong>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{q.question_count} questions | {q.subject}</span>
            </button>
          ))}
          {quizzes.filter(q => q.question_count > 0).length === 0 && <p style={{ color: 'var(--text-dim)' }}>No quizzes with questions available.</p>}
        </div>
      </div>
    );
  }

  // Lobby: show PIN and waiting players
  if (step === 'lobby') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 100%)' }}>
        <h2 style={{ color: '#00cec9', fontSize: '1.5rem', marginBottom: '0.5rem' }}>EDUVERSE LIVE GAME</h2>
        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>Students join at the quiz portal with this PIN:</p>
        {joinLink && qrDataUrl ? (
          <img alt="Game QR" src={qrDataUrl} style={{ marginBottom: '1rem', borderRadius: 8 }} title="Scan to join with PIN pre-filled" />
        ) : (
          <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: 'var(--text-dim)' }}>
            Resolving LAN URL...
          </div>
        )}
        {joinLink && (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginBottom: '0.8rem', fontFamily: 'monospace' }}>
            {joinLink}
          </p>
        )}
        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.5rem 3rem', marginBottom: '2rem', border: '2px solid #00cec9' }}>
          <p style={{ color: '#fff', fontSize: '4rem', fontWeight: 800, letterSpacing: 12, fontFamily: 'monospace' }}>{pin}</p>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
          Mode: {gameState?.gameMode === 'GROUP' ? 'Group (teams)' : 'Individual'}
        </p>
        <p style={{ color: 'var(--text-bright)', fontSize: '1.2rem', marginBottom: '1rem' }}>
          {gameState?.totalPlayers || 0} player{(gameState?.totalPlayers || 0) !== 1 ? 's' : ''} joined
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxWidth: 500, justifyContent: 'center', marginBottom: '2rem' }}>
          {(gameState?.leaderboard || []).map((p, i) => (
            <span key={i} style={{ background: COLORS[i % 4], color: '#fff', padding: '0.4rem 0.8rem', borderRadius: 20, fontSize: '0.9rem', fontWeight: 600 }}>
              {p.nickname}
            </span>
          ))}
        </div>
        <button onClick={startGame} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.8rem 2.5rem' }}
          disabled={!gameState || gameState.totalPlayers === 0}>
          Start Game
        </button>
      </div>
    );
  }

  // Playing: show current question + answer count
  if (step === 'playing' && gameState?.currentQuestion) {
    const q = gameState.currentQuestion;
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 100%)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ color: 'var(--text-dim)' }}>Question {q.index + 1} / {q.total}</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.5rem' }}>{gameState.timeRemaining}s</span>
          <span style={{ color: 'var(--text-dim)' }}>{gameState.answeredCount} / {gameState.totalPlayers} answered</span>
        </div>
        <CountdownBar timeRemaining={gameState.timeRemaining} timeLimit={q.timeLimit} />
        <div style={{ textAlign: 'center', padding: '3rem 1rem', marginTop: '1rem' }}>
          <h2 style={{ color: '#fff', fontSize: '1.8rem', marginBottom: '2rem' }}>{q.questionText}</h2>
          {q.mediaUrl && (
            <div style={{ marginBottom: '1rem' }}>
              {q.mediaType === 'image' && <img src={q.mediaUrl} alt="Question media" style={{ maxWidth: 720, width: '100%', borderRadius: 10 }} />}
              {q.mediaType === 'video' && <video src={q.mediaUrl} controls style={{ maxWidth: 720, width: '100%', borderRadius: 10 }} />}
              {q.mediaType === 'audio' && <audio src={q.mediaUrl} controls style={{ width: '100%', maxWidth: 720 }} />}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: 700, margin: '0 auto' }}>
            {q.choices.map((c, i) => (
              <div key={i} style={{ background: COLORS[i], borderRadius: 8, padding: '1.2rem', color: '#fff', fontSize: '1.1rem', fontWeight: 600 }}>
                {(c.letter || String.fromCharCode(65 + i))}. {c.text}
              </div>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button onClick={showResults} className="btn btn-secondary" style={{ marginRight: '0.5rem' }}>Show Results</button>
          <button onClick={endGame} className="btn btn-danger">End Game</button>
        </div>
      </div>
    );
  }

  // Results between questions
  if (step === 'results' && questionResults) {
    const r = questionResults.data || questionResults;
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <h2 style={{ color: '#fff', marginBottom: '0.5rem' }}>Results</h2>
        <p style={{ color: '#00cec9', fontSize: '1.3rem', marginBottom: '1.5rem' }}>
          Correct Answer: <strong>{r.correctAnswer}</strong>
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'flex-end' }}>
          {['A', 'B', 'C', 'D'].map((letter, i) => {
            const count = r.choiceCounts?.[letter] || 0;
            const maxCount = Math.max(1, ...Object.values(r.choiceCounts || {}));
            const height = Math.max(20, (count / maxCount) * 150);
            return (
              <div key={letter} style={{ textAlign: 'center' }}>
                <div style={{ background: COLORS[i], width: 60, height, borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4 }}>
                  <span style={{ color: '#fff', fontWeight: 700 }}>{count}</span>
                </div>
                <p style={{ color: letter === r.correctAnswer ? '#00cec9' : '#888', fontWeight: 700, marginTop: 4 }}>{letter}</p>
              </div>
            );
          })}
        </div>
        <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>{r.correctCount} / {r.totalAnswered} got it right</p>
        <h3 style={{ color: '#fff', marginBottom: '0.8rem' }}>Leaderboard</h3>
        <div style={{ maxWidth: 400, width: '100%' }}>
          {(gameState?.leaderboard || []).slice(0, 5).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.8rem', background: i === 0 ? 'rgba(253,203,110,0.2)' : 'rgba(255,255,255,0.05)', borderRadius: 6, marginBottom: '0.3rem' }}>
              <span style={{ color: '#fff' }}>{i + 1}. {p.nickname}</span>
              <span style={{ color: '#00cec9', fontWeight: 700 }}>{p.score}</span>
            </div>
          ))}
        </div>
        <button onClick={nextQuestion} className="btn btn-primary" style={{ marginTop: '1.5rem', fontSize: '1.1rem', padding: '0.8rem 2rem' }}>Next Question</button>
      </div>
    );
  }

  // Final results / podium
  if (step === 'final') {
    const lb = gameState?.leaderboard || [];
    const podium = lb.slice(0, 3);
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a2e 0%, #2d1b69 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <h1 style={{ color: '#fdcb6e', fontSize: '2.5rem', marginBottom: '0.5rem' }}>Game Over!</h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>{gameState?.quizTitle}</p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem' }}>
          {podium.length >= 2 && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#c0c0c0', fontWeight: 700, fontSize: '1.1rem' }}>2nd</p>
              <div style={{ background: 'linear-gradient(180deg,#95a5a6,#7f8c8d)', width: 100, height: 100, borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#fff', fontWeight: 700 }}>{podium[1].nickname}</p>
                <p style={{ color: '#ddd', fontSize: '0.85rem' }}>{podium[1].score}</p>
              </div>
            </div>
          )}
          {podium.length >= 1 && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#fdcb6e', fontWeight: 700, fontSize: '1.3rem' }}>1st</p>
              <div style={{ background: 'linear-gradient(180deg,#fdcb6e,#e17055)', width: 120, height: 140, borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>{podium[0].nickname}</p>
                <p style={{ color: '#fff', fontSize: '1rem' }}>{podium[0].score}</p>
              </div>
            </div>
          )}
          {podium.length >= 3 && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#cd7f32', fontWeight: 700, fontSize: '1rem' }}>3rd</p>
              <div style={{ background: 'linear-gradient(180deg,#cd7f32,#a0522d)', width: 90, height: 80, borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: '#fff', fontWeight: 700 }}>{podium[2].nickname}</p>
                <p style={{ color: '#ddd', fontSize: '0.85rem' }}>{podium[2].score}</p>
              </div>
            </div>
          )}
        </div>
        <h3 style={{ color: '#fff', marginBottom: '0.8rem' }}>Full Leaderboard</h3>
        <div style={{ maxWidth: 500, width: '100%', maxHeight: 300, overflowY: 'auto' }}>
          {lb.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.8rem', background: i < 3 ? 'rgba(253,203,110,0.15)' : 'rgba(255,255,255,0.05)', borderRadius: 6, marginBottom: '0.3rem' }}>
              <span style={{ color: '#fff' }}>{i + 1}. {p.nickname}</span>
              <span style={{ color: '#00cec9', fontWeight: 700 }}>{p.score} pts ({p.correctCount} correct)</span>
            </div>
          ))}
        </div>
        <button onClick={onBack} className="btn btn-primary" style={{ marginTop: '2rem' }}>Back to Dashboard</button>
      </div>
    );
  }

  // Fallback: waiting for state
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
        <p style={{ color: 'var(--text-dim)' }}>Loading game state...</p>
      </div>
    </div>
  );
}


// ─── STUDENT PLAYER VIEW ────────────────────────────────────
export function KahootPlayerView({ user, showToast, onBack, initialPin = '' }) {
  const [step, setStep] = useState('join');
  const [pinInput, setPinInput] = useState(initialPin);
  const [nickname, setNickname] = useState(user.englishName || user.id || user.studentId || '');
  const [teamName, setTeamName] = useState('');
  const [gameId, setGameId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastQIndex, setLastQIndex] = useState(-1);
  const pollRef = useRef(null);

  useEffect(() => {
    if (initialPin) setPinInput(initialPin);
  }, [initialPin]);

  const joinGame = async () => {
    if (!pinInput.trim()) { showToast('Enter game PIN', 'error'); return; }
    const res = await api.post('/livegame/join', { pin: pinInput.trim(), studentId: user.id || user.studentId, nickname, teamName });
    if (res.success) {
      setGameId(res.data.gameId);
      if (res.data.teamName) setTeamName(res.data.teamName);
      setStep('waiting');
      startPolling(res.data.gameId);
    } else {
      showToast(res.error || 'Could not join', 'error');
    }
  };

  const startPolling = (gId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await api.get(`/livegame/${gId}/state`);
      if (res.success) {
        setGameState(res.data);
        if (res.data.status === 'PLAYING') setStep('playing');
        else if (res.data.status === 'SHOWING_RESULTS') setStep('question-results');
        else if (res.data.status === 'RESULTS' || res.data.status === 'ENDED') setStep('final');
        else if (res.data.status === 'LOBBY') setStep('waiting');
      }
    }, 1200);
  };

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  useEffect(() => {
    if (gameState?.currentQuestion && gameState.currentQuestion.index !== lastQIndex) {
      setAnswered(false);
      setLastResult(null);
      setLastQIndex(gameState.currentQuestion.index);
    }
  }, [gameState?.currentQuestion?.index]);

  const submitAnswer = async (answer) => {
    if (answered) return;
    setAnswered(true);
    const res = await api.post(`/livegame/${gameId}/answer`, { studentId: user.id || user.studentId, answer });
    if (res.success) {
      setLastResult(res.data);
    } else {
      showToast(res.error || 'Failed to submit', 'error');
      setAnswered(false);
    }
  };

  // Join screen
  if (step === 'join') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 100%)' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, width: '100%' }}>
          <h2 style={{ color: '#00cec9', fontSize: '2rem', marginBottom: '0.5rem' }}>EDUVERSE LIVE</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>Enter the game PIN shown on screen</p>
          <input value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="Game PIN"
            style={{ width: '100%', textAlign: 'center', fontSize: '2rem', letterSpacing: 8, padding: '1rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.1)', border: '2px solid #00cec9', borderRadius: 12, color: '#fff', fontFamily: 'monospace' }} />
          <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Nickname"
            style={{ width: '100%', textAlign: 'center', fontSize: '1.1rem', padding: '0.8rem', marginBottom: '1.5rem' }} />
          <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Team (for group mode)"
            style={{ width: '100%', textAlign: 'center', fontSize: '1rem', padding: '0.7rem', marginBottom: '1rem' }} />
          <button onClick={joinGame} className="btn btn-primary" style={{ width: '100%', fontSize: '1.2rem', padding: '0.8rem' }}>Join Game</button>
          <button onClick={onBack} className="btn btn-outline" style={{ marginTop: '0.8rem', width: '100%' }}>Back</button>
        </div>
      </div>
    );
  }

  // Waiting in lobby
  if (step === 'waiting') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 100%)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#00cec9', marginBottom: '1rem' }}>You're in!</h2>
          <p style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{nickname}</p>
          <p style={{ color: 'var(--text-dim)' }}>Waiting for the host to start the game...</p>
          <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>{gameState?.totalPlayers || 0} players joined</p>
          <div className="loading-spinner" style={{ margin: '2rem auto' }} />
        </div>
      </div>
    );
  }

  // Playing: show answer buttons
  if (step === 'playing' && gameState?.currentQuestion) {
    const q = gameState.currentQuestion;

    if (answered && lastResult) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: lastResult.isCorrect ? 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)' : 'linear-gradient(135deg, #d63031 0%, #e17055 100%)' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: '#fff', fontSize: '3rem', marginBottom: '0.5rem' }}>{lastResult.isCorrect ? 'Correct!' : 'Wrong!'}</h1>
            {lastResult.isCorrect && <p style={{ color: '#fff', fontSize: '1.5rem' }}>+{lastResult.points} points</p>}
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.5rem' }}>Time: {lastResult.timeTaken}s</p>
            <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '1rem' }}>Waiting for next question...</p>
          </div>
        </div>
      );
    }

    if (answered) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 100%)' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
            <p style={{ color: '#fff', fontSize: '1.2rem' }}>Answer submitted!</p>
            <p style={{ color: 'var(--text-dim)' }}>Waiting...</p>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 100%)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Q{q.index + 1}/{q.total}</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.5rem' }}>{gameState.timeRemaining}s</span>
        </div>
        <CountdownBar timeRemaining={gameState.timeRemaining} timeLimit={q.timeLimit} />
        {q.mediaUrl && (
          <div style={{ padding: '0.8rem', textAlign: 'center' }}>
            {q.mediaType === 'image' && <img src={q.mediaUrl} alt="Question media" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} />}
            {q.mediaType === 'video' && <video src={q.mediaUrl} controls style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} />}
            {q.mediaType === 'audio' && <audio src={q.mediaUrl} controls style={{ width: '100%' }} />}
          </div>
        )}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '0.5rem', padding: '0.5rem' }}>
          {q.choices.map((choice, i) => (
            <button key={i} onClick={() => submitAnswer(choice.letter || String.fromCharCode(65 + i))}
              style={{ background: COLORS[i], border: 'none', borderRadius: 12, color: '#fff', fontSize: '1.2rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', minHeight: 80 }}>
              <span style={{ marginRight: '0.5rem', opacity: 0.7 }}>{choice.letter || String.fromCharCode(65 + i)}.</span> {choice.text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Question results screen
  if (step === 'question-results') {
    const isGroup = (gameState?.gameMode || '').toUpperCase() === 'GROUP';
    const myKey = isGroup ? (teamName || 'Unassigned') : (user.id || user.studentId);
    const myRank = (gameState?.leaderboard || []).findIndex(p => p.studentId === myKey) + 1;
    const myScore = (gameState?.leaderboard || []).find(p => p.studentId === myKey);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 100%)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#fff', marginBottom: '0.5rem' }}>Standings</h2>
          <p style={{ color: '#fdcb6e', fontSize: '2rem', fontWeight: 800 }}>#{myRank}</p>
          <p style={{ color: '#00cec9', fontSize: '1.2rem' }}>{myScore?.score || 0} points</p>
          <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>Waiting for next question...</p>
        </div>
      </div>
    );
  }

  // Final screen
  if (step === 'final') {
    const isGroup = (gameState?.gameMode || '').toUpperCase() === 'GROUP';
    const myKey = isGroup ? (teamName || 'Unassigned') : (user.id || user.studentId);
    const myRank = (gameState?.leaderboard || []).findIndex(p => p.studentId === myKey) + 1;
    const myScore = (gameState?.leaderboard || []).find(p => p.studentId === myKey);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0a0a2e 0%, #2d1b69 100%)' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: '#fdcb6e', fontSize: '2.5rem', marginBottom: '0.5rem' }}>Game Over!</h1>
          <p style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '0.5rem' }}>You finished #{myRank}</p>
          <p style={{ color: '#00cec9', fontSize: '2rem', fontWeight: 800 }}>{myScore?.score || 0} points</p>
          <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem' }}>{myScore?.correctCount || 0} correct answers</p>
          <button onClick={onBack} className="btn btn-primary" style={{ marginTop: '2rem' }}>Back to Quizzes</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loading-spinner" />
    </div>
  );
}
