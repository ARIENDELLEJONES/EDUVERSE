import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';

const GAME_DESCRIPTIONS = {
  CHOOSE_ME: 'Click a card to flip it and reveal a student. Score them on the spot!',
  ASK_ME: 'Pairs of students are randomly selected — one asks, one answers.',
  REVEAL_ME: 'Shuffle through names and reveal a student. Score them after.',
  STUDENT_ROULETTE: 'Spin the colorful wheel to randomly select a student!'
};

function ChooseMeGame({ students, scoredStudents, scores, maxScore, onSave }) {
  const [shuffledStudents, setShuffledStudents] = useState([]);
  const [flippedCard, setFlippedCard] = useState(null);
  const [flippingCard, setFlippingCard] = useState(null);
  const [cardScore, setCardScore] = useState('');

  useEffect(() => {
    const shuffled = [...students].sort(() => Math.random() - 0.5);
    setShuffledStudents(shuffled);
  }, [students]);

  const handleCardClick = (student, cardIndex) => {
    if (flippingCard !== null) return;
    setFlippingCard(cardIndex);
    setTimeout(() => {
      setFlippedCard(student);
      setCardScore(scores[student.student_id] || '');
      setFlippingCard(null);
    }, 3000);
  };

  const handleClose = () => {
    setFlippingCard(null);
    setFlippedCard(null);
    setCardScore('');
  };

  return (
    <div>
      <style>{`
        @keyframes cardFlipAnim {
          0% { transform: perspective(600px) rotateY(0deg); }
          50% { transform: perspective(600px) rotateY(90deg); }
          100% { transform: perspective(600px) rotateY(180deg); }
        }
        @keyframes cardReveal {
          0% { transform: perspective(600px) rotateY(180deg); }
          50% { transform: perspective(600px) rotateY(270deg); }
          100% { transform: perspective(600px) rotateY(360deg); }
        }
        @keyframes zoomName {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .game-tarot-card {
          width: 120px; height: 170px; border-radius: 10px; cursor: pointer;
          transition: transform 0.3s, box-shadow 0.3s; position: relative;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.3rem;
        }
        .game-tarot-card:hover { transform: translateY(-8px); box-shadow: 0 8px 30px rgba(108,92,231,0.4); }
        .card-flipping { animation: cardFlipAnim 3s ease-in-out; }
      `}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', justifyContent: 'center' }}>
        {shuffledStudents.map((s, i) => {
          const scored = scoredStudents.has(s.student_id);
          const isFlipping = flippingCard === i;
          return (
            <div key={s.student_id}
              className={`game-tarot-card ${isFlipping ? 'card-flipping' : ''}`}
              onClick={() => handleCardClick(s, i)}
              style={{
                background: scored
                  ? 'linear-gradient(145deg, #f0f0ff, #e8e8ff, #d5d5ff)'
                  : 'linear-gradient(145deg, #1a1a2e, #16213e, #0f3460)',
                border: `2px solid ${scored ? 'rgba(108,92,231,0.5)' : 'rgba(108,92,231,0.3)'}`,
                boxShadow: scored ? '0 4px 15px rgba(108,92,231,0.2)' : '0 4px 15px rgba(0,0,0,0.3)'
              }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#00cec9' }}>{i + 1}</div>
              {scored && <div style={{ fontSize: '0.6rem', color: '#6c5ce7', fontWeight: 600 }}>{(s.english_name || '').substring(0, 12)}</div>}
              {scored && <div style={{ fontSize: '0.65rem', color: '#00b894', fontWeight: 700 }}>Score: {scores[s.student_id] || 0}</div>}
            </div>
          );
        })}
      </div>

      {flippingCard !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '3rem', textAlign: 'center', border: '2px solid rgba(0,206,201,0.5)', animation: 'cardFlipAnim 3s ease-in-out' }}>
            <div style={{ fontSize: '3rem', animation: 'zoomName 3s ease-in-out' }}>?</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginTop: '1rem' }}>Flipping card...</p>
          </div>
        </div>
      )}

      {flippedCard && flippingCard === null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleClose}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '2.5rem', minWidth: 300, textAlign: 'center', border: '2px solid rgba(0,206,201,0.5)', boxShadow: '0 0 40px rgba(108,92,231,0.3)', animation: 'cardReveal 0.6s' }}>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.3rem' }}>ID: {flippedCard.student_id}</div>
            <div style={{ fontSize: '0.9rem', color: '#fdcb6e', marginBottom: '0.2rem' }}>{flippedCard.thai_name || '\u2014'}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginBottom: '1rem', animation: 'zoomName 0.8s ease-out' }}>{flippedCard.english_name || flippedCard.student_id}</div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Score (max {maxScore}):</label>
              <input type="number" value={cardScore} onChange={e => setCardScore(e.target.value)} style={{ width: 100, textAlign: 'center', fontSize: '1.5rem', marginTop: '0.3rem' }} max={maxScore} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button onClick={() => { onSave(flippedCard.student_id, cardScore); handleClose(); }} className="btn btn-primary">Save</button>
              <button onClick={handleClose} className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AskMeGame({ students, scoredStudents, scores, maxScore, onSave, showToast }) {
  const [askPair, setAskPair] = useState({ asker: null, answerer: null });
  const [askScores, setAskScores] = useState({ askerScore: '', answererScore: '' });
  const [isShuffling, setIsShuffling] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const selectRandomPair = () => {
    const available = students.filter(s => !scoredStudents.has(s.student_id));
    if (available.length < 2) {
      setAskPair({ asker: null, answerer: null });
      showToast('THE TEACHER WILL ASK', 'info');
      return;
    }
    setIsShuffling(true);
    let count = 0;
    const max = 20;
    const interval = setInterval(() => {
      const rand1 = available[Math.floor(Math.random() * available.length)];
      const rand2 = available.filter(s => s.student_id !== rand1.student_id)[Math.floor(Math.random() * (available.length - 1))];
      setDisplayName(`${rand1?.english_name || ''} & ${rand2?.english_name || ''}`);
      count++;
      if (count >= max) {
        clearInterval(interval);
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        setAskPair({ asker: shuffled[0], answerer: shuffled[1] });
        setAskScores({ askerScore: '', answererScore: '' });
        setIsShuffling(false);
      }
    }, 150);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
      <style>{`
        @keyframes shuffleText {
          0% { opacity: 0; transform: translateY(-10px); }
          50% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(10px); }
        }
      `}</style>
      {!askPair.asker && !isShuffling && (
        <button onClick={selectRandomPair} className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}>Select Pair</button>
      )}
      {isShuffling && (
        <div style={{ background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '2.5rem', textAlign: 'center', border: '2px solid rgba(0,206,201,0.5)', minWidth: 350 }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00cec9', animation: 'shuffleText 0.3s infinite' }}>{displayName}</div>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '0.5rem', fontSize: '0.85rem' }}>Shuffling names...</p>
        </div>
      )}
      {askPair.asker && !isShuffling && (
        <>
          <div style={{ background: 'linear-gradient(135deg, #2d3436, #636e72)', borderRadius: 12, padding: '1.5rem 2rem', minWidth: 350, textAlign: 'center', border: '2px solid #fdcb6e' }}>
            <div style={{ color: '#fdcb6e', fontSize: '0.8rem', marginBottom: '0.3rem' }}>WILL ASK THE QUESTION</div>
            <div style={{ color: '#fff', fontSize: '0.8rem' }}>ID: {askPair.asker.student_id}</div>
            <div style={{ color: '#fdcb6e', fontSize: '0.85rem' }}>{askPair.asker.thai_name || '\u2014'}</div>
            <div style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>{askPair.asker.english_name}</div>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', justifyContent: 'center' }}>
              <input type="number" placeholder="Score" value={askScores.askerScore} onChange={e => setAskScores(prev => ({ ...prev, askerScore: e.target.value }))} style={{ width: 80, textAlign: 'center' }} />
              <button onClick={() => onSave(askPair.asker.student_id, askScores.askerScore)} className="btn btn-secondary btn-sm">Save</button>
            </div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #0984e3, #6c5ce7)', borderRadius: 12, padding: '1.5rem 2rem', minWidth: 350, textAlign: 'center', border: '2px solid #00cec9' }}>
            <div style={{ color: '#00cec9', fontSize: '0.8rem', marginBottom: '0.3rem' }}>WILL ANSWER</div>
            <div style={{ color: '#fff', fontSize: '0.8rem' }}>ID: {askPair.answerer.student_id}</div>
            <div style={{ color: '#74b9ff', fontSize: '0.85rem' }}>{askPair.answerer.thai_name || '\u2014'}</div>
            <div style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>{askPair.answerer.english_name}</div>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', justifyContent: 'center' }}>
              <input type="number" placeholder="Score" value={askScores.answererScore} onChange={e => setAskScores(prev => ({ ...prev, answererScore: e.target.value }))} style={{ width: 80, textAlign: 'center' }} />
              <button onClick={() => onSave(askPair.answerer.student_id, askScores.answererScore)} className="btn btn-secondary btn-sm">Save</button>
            </div>
          </div>
          <button onClick={selectRandomPair} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Select Next Pair</button>
        </>
      )}
    </div>
  );
}

function RevealMeGame({ students, scoredStudents, scores, maxScore, onSave }) {
  const [flippedCard, setFlippedCard] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [cardScore, setCardScore] = useState('');

  const shuffleReveal = () => {
    const available = students.filter(s => !scoredStudents.has(s.student_id));
    if (available.length === 0) return;
    setIsSpinning(true);
    let count = 0;
    const max = 12 + Math.floor(Math.random() * 8);
    const interval = setInterval(() => {
      const rand = available[Math.floor(Math.random() * available.length)];
      setFlippedCard(rand);
      count++;
      if (count >= max) { clearInterval(interval); setIsSpinning(false); }
    }, 100 + count * 10);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <style>{`
        @keyframes cardFlipReveal { 0% { transform: rotateY(0deg); } 50% { transform: rotateY(90deg); } 100% { transform: rotateY(0deg); } }
      `}</style>
      {!flippedCard && !isSpinning && (
        <button onClick={shuffleReveal} className="btn btn-primary" style={{ fontSize: '1.2rem', padding: '0.8rem 2.5rem' }}
          disabled={students.filter(s => !scoredStudents.has(s.student_id)).length === 0}>
          Shuffle & Reveal
        </button>
      )}
      {isSpinning && flippedCard && (
        <div style={{ animation: 'cardFlipReveal 0.3s', background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '2rem', display: 'inline-block', border: '2px solid rgba(0,206,201,0.5)' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#00cec9' }}>{flippedCard.english_name || flippedCard.student_id}</div>
        </div>
      )}
      {!isSpinning && flippedCard && (
        <div style={{ background: 'linear-gradient(145deg, #1a1a3e, #2a2a5e)', borderRadius: 16, padding: '2.5rem', display: 'inline-block', border: '2px solid rgba(0,206,201,0.5)', minWidth: 300 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>ID: {flippedCard.student_id}</div>
          <div style={{ color: '#fdcb6e', fontSize: '0.9rem' }}>{flippedCard.thai_name || '\u2014'}</div>
          <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>{flippedCard.english_name}</div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
            <input type="number" value={cardScore} onChange={e => setCardScore(e.target.value)} placeholder="Score" style={{ width: 80, textAlign: 'center', fontSize: '1.2rem' }} />
            <button onClick={() => { onSave(flippedCard.student_id, cardScore); setFlippedCard(null); setCardScore(''); }} className="btn btn-primary">Save</button>
          </div>
          <button onClick={shuffleReveal} className="btn btn-outline btn-sm" style={{ marginTop: '1rem', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>SHUFFLE AGAIN</button>
        </div>
      )}
    </div>
  );
}

function StudentRouletteGame({ students, scoredStudents, scores, maxScore, onSave }) {
  const canvasRef = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [cardScore, setCardScore] = useState('');
  const animRef = useRef(null);

  const available = students.filter(s => !scoredStudents.has(s.student_id));
  const segmentCount = Math.min(available.length, 20);
  const displayStudents = available.slice(0, segmentCount);
  const COLORS = ['#6c5ce7','#00cec9','#fd79a8','#fdcb6e','#55efc4','#74b9ff','#e17055','#a29bfe','#00b894','#fab1a0','#81ecec','#ffeaa7','#dfe6e9','#636e72','#b2bec3','#2d3436','#0984e3','#d63031','#e84393','#00cec9'];

  useEffect(() => {
    drawWheel(rotation);
  }, [rotation, displayStudents.length]);

  const drawWheel = (rot) => {
    const canvas = canvasRef.current;
    if (!canvas || displayStudents.length === 0) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 10;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((rot * Math.PI) / 180);

    const segAngle = (2 * Math.PI) / displayStudents.length;
    displayStudents.forEach((s, i) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, i * segAngle, (i + 1) * segAngle);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.rotate(i * segAngle + segAngle / 2);
      ctx.translate(radius * 0.55, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      const id = String(s.student_id).substring(0, 8);
      const thai = (s.thai_name || '').substring(0, 10);
      const eng = (s.english_name || '').substring(0, 12);
      const classNo = s.class_no || '';
      ctx.fillText(id, 0, -12);
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(thai, 0, 0);
      ctx.font = '9px sans-serif';
      ctx.fillText(eng, 0, 11);
      ctx.font = '7px sans-serif';
      ctx.fillText(classNo ? `#${classNo}` : '', 0, 20);
      ctx.restore();
    });

    ctx.restore();

    // Center circle
    ctx.beginPath();
    ctx.arc(center, center, 35, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(10,10,46,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,206,201,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#00cec9';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', center, center);
  };

  const spin = () => {
    if (spinning || displayStudents.length === 0) return;
    setSpinning(true);
    setSelectedStudent(null);

    const extraRotations = 5 + Math.random() * 5;
    const targetAngle = rotation + extraRotations * 360 + Math.random() * 360;
    const duration = 5000;
    const startTime = Date.now();
    const startRot = rotation;

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      const currentRot = startRot + (targetAngle - startRot) * eased;
      setRotation(currentRot);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        const finalAngle = ((currentRot % 360) + 360) % 360;
        const segAngle = 360 / displayStudents.length;
        const pointerAngle = (360 - finalAngle + 270) % 360;
        const idx = Math.floor(pointerAngle / segAngle) % displayStudents.length;
        setSelectedStudent(displayStudents[idx]);
        setCardScore('');
      }
    };
    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
      <style>{`
        @keyframes glowSelected {
          0%, 100% { box-shadow: 0 0 10px rgba(0,206,201,0.3); }
          50% { box-shadow: 0 0 30px rgba(0,206,201,0.8), 0 0 60px rgba(108,92,231,0.3); }
        }
      `}</style>
      <h2 style={{ color: '#00cec9', margin: 0, textShadow: '0 0 15px rgba(0,206,201,0.5)' }}>Student Roulette Selector</h2>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ position: 'relative' }}>
          {/* Arrow pointer at top */}
          <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderTop: '22px solid #e17055', zIndex: 3, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
          <canvas ref={canvasRef} width={400} height={400}
            style={{ borderRadius: '50%', border: '4px solid rgba(0,206,201,0.4)', boxShadow: '0 0 30px rgba(108,92,231,0.2)', cursor: spinning ? 'default' : 'pointer', background: 'rgba(0,0,0,0.2)' }}
            onClick={spin} />
        </div>

        {selectedStudent && (
          <div style={{ background: 'linear-gradient(145deg, rgba(26,26,62,0.9), rgba(42,42,94,0.9))', borderRadius: 16, padding: '2rem', minWidth: 260, border: '2px solid rgba(0,206,201,0.5)', animation: 'glowSelected 2s infinite', backdropFilter: 'blur(10px)' }}>
            <h4 style={{ color: '#00cec9', marginBottom: '1rem', textAlign: 'center' }}>Selected Student</h4>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>ID: {selectedStudent.student_id}</div>
              <div style={{ color: '#fdcb6e', fontSize: '1rem', fontWeight: 600 }}>{selectedStudent.thai_name || '\u2014'}</div>
              <div style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>{selectedStudent.english_name}</div>
              {selectedStudent.class_no && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Class #{selectedStudent.class_no}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', marginTop: '1rem' }}>
                <input type="number" value={cardScore} onChange={e => setCardScore(e.target.value)} placeholder="Score" style={{ width: 80, textAlign: 'center', fontSize: '1.2rem' }} max={maxScore} />
                <button onClick={() => { onSave(selectedStudent.student_id, cardScore); setSelectedStudent(null); setCardScore(''); }} className="btn btn-primary btn-sm">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button onClick={spin} disabled={spinning || displayStudents.length === 0}
        className="btn btn-primary"
        style={{ fontSize: '1.3rem', padding: '0.9rem 3rem', borderRadius: 50, background: spinning ? '#636e72' : 'linear-gradient(135deg, #00cec9, #6c5ce7)', border: 'none', boxShadow: spinning ? 'none' : '0 4px 20px rgba(0,206,201,0.4)', cursor: spinning ? 'default' : 'pointer', color: '#fff', fontWeight: 700, letterSpacing: 2 }}>
        {spinning ? 'SPINNING...' : 'SPIN'}
      </button>

      {displayStudents.length === 0 && (
        <p style={{ color: '#fdcb6e', fontSize: '0.9rem' }}>All students have been scored!</p>
      )}
    </div>
  );
}

export default function GameWindow({ performance, students, onClose, showToast }) {
  const [scoredStudents, setScoredStudents] = useState(new Set());
  const [scores, setScores] = useState({});

  useEffect(() => {
    loadScores();
  }, [performance?.id]);

  const loadScores = async () => {
    if (!performance?.id) return;
    const res = await api.get(`/performance/${performance.id}`);
    if (res.success) {
      const scored = new Set((res.data.scores || []).filter(s => s.score > 0).map(s => s.student_id));
      setScoredStudents(scored);
      const sc = {};
      (res.data.scores || []).forEach(s => { sc[s.student_id] = s.score; });
      setScores(sc);
    }
  };

  const savePerfScore = async (studentId, score) => {
    if (!performance) return;
    const res = await api.post(`/performance/${performance.id}/score`, { studentId, score: Number(score) || 0 });
    if (res.success) {
      showToast('Score saved');
      setScoredStudents(prev => new Set([...prev, studentId]));
      setScores(prev => ({ ...prev, [studentId]: Number(score) || 0 }));
    } else showToast(res.message || 'Failed', 'error');
  };

  const unchosenCount = students.filter(s => !scoredStudents.has(s.student_id)).length;

  const renderGame = () => {
    const props = { students, scoredStudents, scores, maxScore: performance.max_score, onSave: savePerfScore, showToast };
    switch (performance.performance_type) {
      case 'CHOOSE_ME': return <ChooseMeGame {...props} />;
      case 'ASK_ME': return <AskMeGame {...props} />;
      case 'REVEAL_ME': return <RevealMeGame {...props} />;
      case 'STUDENT_ROULETTE': return <StudentRouletteGame {...props} />;
      default: return <p style={{ color: '#fff' }}>Unknown game type</p>;
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 50%, #0d0d3a 100%)', display: 'flex', overflow: 'hidden' }}>
      {/* Left panel - Student list (1/5) */}
      <div style={{ width: '20%', minWidth: 200, maxWidth: 300, background: 'rgba(0,0,0,0.3)', borderRight: '1px solid rgba(0,206,201,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid rgba(0,206,201,0.2)' }}>
          <h4 style={{ color: '#00cec9', margin: 0, fontSize: '0.9rem' }}>Students</h4>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: '0.3rem 0 0' }}>
            {scoredStudents.size}/{students.length} scored | {unchosenCount} remaining
          </p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {students.map(s => {
            const scored = scoredStudents.has(s.student_id);
            return (
              <div key={s.student_id} style={{ padding: '0.4rem 0.6rem', marginBottom: '0.2rem', borderRadius: 6, background: scored ? 'rgba(0,184,148,0.1)' : 'transparent', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: scored ? '#00b894' : 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{s.english_name || s.student_id}</span>
                  {scored && <span style={{ color: '#00b894', fontWeight: 700 }}>{scores[s.student_id]}</span>}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>
                  {s.student_id} | #{s.class_no || '-'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel - Game area (4/5) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,206,201,0.2)' }}>
          <div>
            <h2 style={{ color: '#00cec9', margin: 0, fontSize: '1.3rem', textShadow: '0 0 10px rgba(0,206,201,0.3)' }}>{performance.title}</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
              {performance.performance_type.replace(/_/g, ' ')} | Max Score: {performance.max_score} | {GAME_DESCRIPTIONS[performance.performance_type] || ''}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,107,107,0.2)', border: '1px solid rgba(255,107,107,0.5)', color: '#ff6b6b', padding: '0.5rem 1.5rem', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
            Close Window
          </button>
        </div>

        {/* Game content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          {renderGame()}
        </div>
      </div>
    </div>
  );
}
