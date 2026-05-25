import React, { useState } from 'react';

function genWordHuntGrid(words, size = 15) {
  const DIRECTIONS = [
    { dr: 0, dc: 1 }, { dr: 0, dc: -1 }, { dr: 1, dc: 0 }, { dr: -1, dc: 0 },
    { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
  ];
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const word of (words || [])) {
    const upper = word.toUpperCase();
    for (let attempt = 0; attempt < 100; attempt++) {
      const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const r = Math.floor(Math.random() * size);
      const c = Math.floor(Math.random() * size);
      let ok = true;
      for (let i = 0; i < upper.length; i++) {
        const nr = r + i * dir.dr;
        const nc = c + i * dir.dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) { ok = false; break; }
        if (grid[nr][nc] !== '' && grid[nr][nc] !== upper[i]) { ok = false; break; }
      }
      if (ok) {
        for (let i = 0; i < upper.length; i++) grid[r + i * dir.dr][c + i * dir.dc] = upper[i];
        break;
      }
    }
  }
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!grid[r][c]) grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
  }
  return grid;
}

function PhoneFrame({ children, title }) {
  return (
    <div style={{ width: 380, maxWidth: '100%', margin: '0 auto', border: '3px solid #333', borderRadius: 32, padding: '0.5rem', background: '#111', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
      <div style={{ width: 60, height: 5, background: '#333', borderRadius: 5, margin: '0.3rem auto 0.5rem' }} />
      <div style={{ background: '#1a1a2e', borderRadius: 24, overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
        <div style={{ padding: '1rem', background: 'rgba(0,206,201,0.1)', borderBottom: '1px solid rgba(0,206,201,0.2)', textAlign: 'center' }}>
          <h4 style={{ color: '#00cec9', margin: 0, fontSize: '0.9rem' }}>{title}</h4>
        </div>
        <div style={{ padding: '1rem' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function PreviewMCQ({ question }) {
  const [selected, setSelected] = useState('');
  return (
    <div>
      <p style={{ color: '#fff', marginBottom: '0.8rem', fontSize: '0.9rem' }}>{question.questionText}</p>
      {['A', 'B', 'C', 'D'].map(letter => {
        const text = question[`choice${letter}`];
        if (!text) return null;
        return (
          <button key={letter} onClick={() => setSelected(letter)}
            style={{ display: 'block', width: '100%', padding: '0.7rem', marginBottom: '0.4rem', borderRadius: 8, textAlign: 'left', background: selected === letter ? 'rgba(108,92,231,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${selected === letter ? '#6c5ce7' : 'rgba(255,255,255,0.1)'}`, color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 700, marginRight: '0.5rem', color: '#6c5ce7' }}>{letter}.</span>{text}
          </button>
        );
      })}
    </div>
  );
}

function PreviewTF({ question }) {
  const [selected, setSelected] = useState('');
  return (
    <div>
      <p style={{ color: '#fff', marginBottom: '0.8rem', fontSize: '0.9rem' }}>{question.questionText}</p>
      {['True', 'False'].map(opt => (
        <button key={opt} onClick={() => setSelected(opt)}
          style={{ display: 'block', width: '100%', padding: '0.8rem', marginBottom: '0.4rem', borderRadius: 8, textAlign: 'center', background: selected === opt ? 'rgba(0,206,201,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${selected === opt ? '#00cec9' : 'rgba(255,255,255,0.1)'}`, color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 600 }}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function PreviewMatching({ question }) {
  const pairs = question.extraData?.pairs || [];
  return (
    <div>
      <p style={{ color: '#fff', marginBottom: '0.8rem', fontSize: '0.9rem' }}>{question.questionText}</p>
      {pairs.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
          <span style={{ flex: 1, color: '#fff', fontWeight: 600 }}>{p.left}</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}> &rarr; </span>
          <select style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 4, padding: '0.3rem' }}>
            <option>Select...</option>
            {pairs.map((p2, j) => <option key={j}>{p2.right}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function PreviewWordHunt({ question }) {
  const extraData = question.extraData || {};
  const words = extraData.words || (extraData.word ? [extraData.word] : []);
  const gridData = extraData.grid || genWordHuntGrid(words);
  const size = extraData.gridSize || (gridData.length || 15);
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ color: '#fff', marginBottom: '0.5rem', fontSize: '0.9rem' }}>{question.questionText || 'Word Search Challenge'}</p>
      {extraData.theme && <p style={{ color: '#00cec9', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Theme: {extraData.theme}</p>}
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.8rem' }}>Find all hidden words | Total: {words.length}</p>
      <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${size}, 22px)`, gap: 1 }}>
        {gridData.map((row, r) => row.map((cell, c) => (
          <div key={`${r}-${c}`} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1, color: '#fff', cursor: 'pointer' }}>{cell}</div>
        )))}
      </div>
      <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.5rem' }}>
        {words.map((_, i) => (
          <div key={i} style={{ width: 28, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)' }}>{i + 1}</div>
        ))}
      </div>
    </div>
  );
}

function PreviewRatingGrid({ question }) {
  const extraData = question.extraData || {};
  const gridRows = extraData.rows || [];
  const gridCols = extraData.cols || extraData.columns?.map(c => c.label || c) || ['1','2','3','4','5'];
  const [selections, setSelections] = useState({});
  return (
    <div>
      <p style={{ color: '#fff', marginBottom: '0.8rem', fontSize: '0.9rem' }}>{question.questionText}</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
              <th style={{ padding: '0.4rem', textAlign: 'left', color: 'rgba(255,255,255,0.5)' }}>Item</th>
              {gridCols.map((c, i) => <th key={i} style={{ padding: '0.4rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {gridRows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <td style={{ padding: '0.4rem', color: '#fff' }}>{row}</td>
                {gridCols.map((col, ci) => {
                  const sel = selections[row] === col;
                  return (
                    <td key={ci} style={{ textAlign: 'center', padding: '0.3rem' }}>
                      <button onClick={() => setSelections(prev => ({ ...prev, [row]: col }))}
                        style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? '#4285f4' : 'rgba(255,255,255,0.3)'}`, background: sel ? '#4285f4' : 'transparent', cursor: 'pointer' }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewSequencing({ question }) {
  const items = question.extraData?.items || [];
  return (
    <div>
      <p style={{ color: '#fff', marginBottom: '0.8rem', fontSize: '0.9rem' }}>{question.questionText}</p>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Drag to reorder:</p>
      {items.map((item, i) => (
        <div key={i} style={{ padding: '0.6rem', marginBottom: '0.3rem', background: 'rgba(255,255,255,0.05)', borderRadius: 6, display: 'flex', gap: '0.5rem', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontWeight: 700, color: '#6c5ce7', minWidth: 20 }}>{i + 1}</span>
          <span style={{ color: '#fff' }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewMultipleResponse({ question }) {
  const choices = question.extraData?.choices || [];
  const [selected, setSelected] = useState(new Set());
  return (
    <div>
      <p style={{ color: '#fff', marginBottom: '0.8rem', fontSize: '0.9rem' }}>{question.questionText}</p>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Select all that apply:</p>
      {choices.map((c, i) => {
        const letter = 'ABCDEF'[i];
        const isSel = selected.has(letter);
        return (
          <button key={i} onClick={() => setSelected(prev => { const n = new Set(prev); if (n.has(letter)) n.delete(letter); else n.add(letter); return n; })}
            style={{ display: 'block', width: '100%', padding: '0.7rem', marginBottom: '0.4rem', borderRadius: 8, textAlign: 'left', background: isSel ? 'rgba(108,92,231,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isSel ? '#6c5ce7' : 'rgba(255,255,255,0.1)'}`, color: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
            <span style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: 3, border: `2px solid ${isSel ? '#6c5ce7' : 'rgba(255,255,255,0.3)'}`, background: isSel ? '#6c5ce7' : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: '0.5rem', verticalAlign: 'middle', fontSize: '0.7rem' }}>
              {isSel && '\u2713'}
            </span>
            <span style={{ fontWeight: 700, marginRight: '0.4rem' }}>{letter}.</span>{c}
          </button>
        );
      })}
    </div>
  );
}

export default function QuizPreview({ quiz, onClose }) {
  const questions = quiz?.questions || [];
  const [currentQ, setCurrentQ] = useState(0);
  const [phase, setPhase] = useState('intro');

  const renderQuestion = (q) => {
    const type = q.questionType || 'MCQ';
    switch (type) {
      case 'MCQ': return <PreviewMCQ question={q} />;
      case 'TF': return <PreviewTF question={q} />;
      case 'MATCHING': return <PreviewMatching question={q} />;
      case 'WORD_HUNT': return <PreviewWordHunt question={q} />;
      case 'RATING_GRID': return <PreviewRatingGrid question={q} />;
      case 'SEQUENCING': return <PreviewSequencing question={q} />;
      case 'MULTIPLE_RESPONSE': return <PreviewMultipleResponse question={q} />;
      default: return <p style={{ color: '#fff' }}>Unknown question type: {type}</p>;
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '95%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <button onClick={onClose} style={{ background: 'rgba(255,107,107,0.2)', border: '1px solid rgba(255,107,107,0.5)', color: '#ff6b6b', padding: '0.4rem 1rem', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Close</button>
        </div>
        <PhoneFrame title={quiz?.title || 'Quiz Preview'}>
          {phase === 'intro' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '1rem' }}>{quiz?.introMessage || 'Welcome to the quiz!'}</p>
              <h3 style={{ color: '#00cec9', marginBottom: '0.5rem' }}>{quiz?.title || 'Quiz'}</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '1rem' }}>{questions.length} questions</p>
              <button onClick={() => setPhase('quiz')} style={{ padding: '0.7rem 2rem', borderRadius: 8, background: '#00cec9', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>START QUIZ</button>
            </div>
          )}
          {phase === 'quiz' && questions.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Q{currentQ + 1} / {questions.length}</span>
                <span style={{ color: '#fdcb6e', fontSize: '0.75rem' }}>{questions[currentQ].points || 1} pt(s)</span>
              </div>
              {renderQuestion(questions[currentQ])}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                <button onClick={() => setCurrentQ(Math.max(0, currentQ - 1))} disabled={currentQ === 0}
                  style={{ padding: '0.5rem 1rem', borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', opacity: currentQ === 0 ? 0.3 : 1 }}>Prev</button>
                {currentQ < questions.length - 1 ? (
                  <button onClick={() => setCurrentQ(currentQ + 1)} style={{ padding: '0.5rem 1rem', borderRadius: 6, background: '#00cec9', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Next</button>
                ) : (
                  <button onClick={() => setPhase('result')} style={{ padding: '0.5rem 1rem', borderRadius: 6, background: '#00b894', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Submit</button>
                )}
              </div>
            </div>
          )}
          {phase === 'result' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#127942;</div>
              <h3 style={{ color: '#00cec9', marginBottom: '0.5rem' }}>{quiz?.passMessage || 'Quiz Complete!'}</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: '1rem' }}>This is a simulation preview</p>
              <button onClick={() => { setPhase('intro'); setCurrentQ(0); }} style={{ padding: '0.6rem 1.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer' }}>Restart Preview</button>
            </div>
          )}
        </PhoneFrame>
      </div>
    </div>
  );
}
