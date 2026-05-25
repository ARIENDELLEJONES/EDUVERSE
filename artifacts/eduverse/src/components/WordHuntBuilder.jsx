import React, { useState, useCallback } from 'react';

const GRID_SIZE = 15;
const DIRECTIONS = [
  { name: 'Right', dr: 0, dc: 1 },
  { name: 'Left', dr: 0, dc: -1 },
  { name: 'Down', dr: 1, dc: 0 },
  { name: 'Up', dr: -1, dc: 0 },
  { name: 'Down-Right', dr: 1, dc: 1 },
  { name: 'Down-Left', dr: 1, dc: -1 },
  { name: 'Up-Right', dr: -1, dc: 1 },
  { name: 'Up-Left', dr: -1, dc: -1 },
];

function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(''));
}

function canPlaceWord(grid, word, row, col, dr, dc) {
  for (let i = 0; i < word.length; i++) {
    const r = row + i * dr;
    const c = col + i * dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    if (grid[r][c] !== '' && grid[r][c] !== word[i]) return false;
  }
  return true;
}

function placeWord(grid, word, row, col, dr, dc) {
  const newGrid = grid.map(r => [...r]);
  for (let i = 0; i < word.length; i++) {
    newGrid[row + i * dr][col + i * dc] = word[i];
  }
  return newGrid;
}

function autoPlaceWords(words) {
  let grid = createEmptyGrid();
  const placements = [];
  for (const word of words) {
    const upper = word.toUpperCase();
    let placed = false;
    const shuffledDirs = [...DIRECTIONS].sort(() => Math.random() - 0.5);
    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
      const dir = shuffledDirs[attempt % shuffledDirs.length];
      const row = Math.floor(Math.random() * GRID_SIZE);
      const col = Math.floor(Math.random() * GRID_SIZE);
      if (canPlaceWord(grid, upper, row, col, dir.dr, dir.dc)) {
        grid = placeWord(grid, upper, row, col, dir.dr, dir.dc);
        placements.push({ word: upper, row, col, dir: dir.name });
        placed = true;
      }
    }
    if (!placed) placements.push({ word: upper, row: -1, col: -1, dir: 'NOT PLACED' });
  }
  return { grid, placements };
}

function fillEmptyRandom(grid) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return grid.map(row => row.map(cell => cell || letters[Math.floor(Math.random() * letters.length)]));
}

export default function WordHuntBuilder({ onSave, existingData }) {
  const [theme, setTheme] = useState(existingData?.theme || '');
  const [words, setWords] = useState(existingData?.words || []);
  const [newWord, setNewWord] = useState('');
  const [grid, setGrid] = useState(existingData?.grid || createEmptyGrid());
  const [placements, setPlacements] = useState(existingData?.placements || []);
  const [showPreview, setShowPreview] = useState(false);
  const [previewGrid, setPreviewGrid] = useState(null);

  const addWord = () => {
    const w = newWord.trim().toUpperCase();
    if (!w || words.includes(w)) return;
    setWords([...words, w]);
    setNewWord('');
  };

  const removeWord = (idx) => {
    setWords(words.filter((_, i) => i !== idx));
  };

  const updateCell = (r, c, val) => {
    const newGrid = grid.map(row => [...row]);
    newGrid[r][c] = val.toUpperCase().slice(0, 1);
    setGrid(newGrid);
  };

  const handleAutoPlace = () => {
    if (words.length === 0) return;
    const result = autoPlaceWords(words);
    setGrid(result.grid);
    setPlacements(result.placements);
  };

  const handleFillRandom = () => {
    setGrid(fillEmptyRandom(grid));
  };

  const handleClear = () => {
    setGrid(createEmptyGrid());
    setPlacements([]);
  };

  const handleValidate = () => {
    const unplaced = words.filter(w => {
      const upper = w.toUpperCase();
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          for (const dir of DIRECTIONS) {
            if (canPlaceWord(grid, upper, r, c, dir.dr, dir.dc)) {
              let found = true;
              for (let i = 0; i < upper.length; i++) {
                if (grid[r + i * dir.dr][c + i * dir.dc] !== upper[i]) { found = false; break; }
              }
              if (found) return false;
            }
          }
        }
      }
      return true;
    });
    return unplaced;
  };

  const handleSave = () => {
    const filledGrid = fillEmptyRandom(grid);
    const data = { theme, words, grid: filledGrid, gridSize: GRID_SIZE };
    onSave(data);
  };

  const handlePreview = () => {
    setPreviewGrid(fillEmptyRandom(grid));
    setShowPreview(true);
  };

  const unplaced = handleValidate();

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Left - Theme & Words */}
        <div style={{ width: 250, flexShrink: 0 }}>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-bright)' }}>Theme</h4>
            <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="e.g. WORK, SCHOOL, FOOD" style={{ width: '100%' }} />
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-bright)' }}>Hidden Words ({words.length})</h4>
            <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
              <input value={newWord} onChange={e => setNewWord(e.target.value.toUpperCase())} placeholder="Add word" style={{ flex: 1, textTransform: 'uppercase', fontFamily: 'monospace' }}
                onKeyDown={e => { if (e.key === 'Enter') addWord(); }} />
              <button onClick={addWord} className="btn btn-secondary btn-sm">+</button>
            </div>
            {words.map((w, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-bright)' }}>{w}</span>
                <button onClick={() => removeWord(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>x</button>
              </div>
            ))}
          </div>

          <div className="card">
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-bright)' }}>Tools</h4>
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <button onClick={handleAutoPlace} className="btn btn-secondary btn-sm" disabled={words.length === 0}>Auto-place words</button>
              <button onClick={handleFillRandom} className="btn btn-outline btn-sm">Fill empty randomly</button>
              <button onClick={handleClear} className="btn btn-outline btn-sm">Clear grid</button>
              <button onClick={handlePreview} className="btn btn-outline btn-sm" style={{ borderColor: '#00cec9', color: '#00cec9' }}>Preview student view</button>
              {unplaced.length > 0 && (
                <div style={{ color: 'var(--danger)', fontSize: '0.75rem', padding: '0.3rem' }}>
                  Not placed: {unplaced.join(', ')}
                </div>
              )}
              {unplaced.length === 0 && words.length > 0 && (
                <div style={{ color: 'var(--success)', fontSize: '0.75rem', padding: '0.3rem' }}>All words placed!</div>
              )}
              <button onClick={handleSave} className="btn btn-primary btn-sm" disabled={words.length === 0}>Save Puzzle</button>
            </div>
          </div>
        </div>

        {/* Center - Grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card">
            <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-bright)' }}>15x15 Grid</h4>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 32px)`, gap: 1 }}>
                {grid.map((row, r) => row.map((cell, c) => (
                  <input key={`${r}-${c}`} value={cell} maxLength={1}
                    onChange={e => updateCell(r, c, e.target.value)}
                    style={{
                      width: 32, height: 32, textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase',
                      border: '1px solid var(--border)', background: cell ? 'rgba(108,92,231,0.1)' : 'var(--bg-input)', color: 'var(--text-bright)',
                      borderRadius: 2, padding: 0
                    }} />
                )))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Student Preview Modal */}
      {showPreview && previewGrid && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPreview(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-dark)', borderRadius: 16, padding: '2rem', maxWidth: 600, width: '95%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: 'var(--text-bright)', margin: 0 }}>Student Preview</h3>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-dim)' }}>x</button>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <h4 style={{ color: 'var(--secondary)' }}>Word Search Challenge</h4>
              {theme && <p style={{ color: 'var(--text-dim)' }}>Theme: {theme}</p>}
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Find all hidden words in the grid</p>
              <p style={{ color: 'var(--text-bright)', fontWeight: 600 }}>Total Words: {words.length}</p>
            </div>
            <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 28px)`, gap: 1, margin: '0 auto' }}>
              {previewGrid.map((row, r) => row.map((cell, c) => (
                <div key={`${r}-${c}`} style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', background: 'var(--bg-input)',
                  border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-bright)', cursor: 'pointer'
                }}>{cell}</div>
              )))}
            </div>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
              {words.map((_, i) => (
                <div key={i} style={{ width: 40, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
