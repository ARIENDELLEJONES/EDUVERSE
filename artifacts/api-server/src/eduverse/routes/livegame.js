import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router();

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Teacher: Create live game from existing quiz
router.post('/create', (req, res) => {
  const { quizId, hostId, questionDuration, strictMode, gameMode, groupGradeLevel, groupSection } = req.body;
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.json({ success: false, error: 'Quiz not found' });

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(quizId);
  if (questions.length === 0) return res.json({ success: false, error: 'Quiz has no questions' });

  let pin = generatePin();
  let attempts = 0;
  while (db.prepare('SELECT id FROM live_games WHERE pin = ? AND status != ?').get(pin, 'ENDED') && attempts < 10) {
    pin = generatePin();
    attempts++;
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO live_games (id, quiz_id, pin, host_id, status, question_duration)
    VALUES (?, ?, ?, ?, 'LOBBY', ?)`).run(id, quizId, pin, hostId || '', questionDuration || 20);
  db.prepare('UPDATE live_games SET strict_mode = ?, game_mode = ?, group_grade_level = ?, group_section = ? WHERE id = ?')
    .run(strictMode ? 1 : 0, (gameMode || 'INDIVIDUAL').toUpperCase(), groupGradeLevel || '', groupSection || '', id);

  res.json({ success: true, data: { gameId: id, pin, questionCount: questions.length, quizTitle: quiz.title, joinUrl: `/quiz/live?pin=${pin}` } });
});

// Student: Join live game with PIN
router.post('/join', (req, res) => {
  const { pin, studentId, nickname, teamName } = req.body;
  const game = db.prepare("SELECT * FROM live_games WHERE pin = ? AND status = 'LOBBY'").get(pin);
  if (!game) return res.json({ success: false, error: 'Game not found or already started' });
  const student = db.prepare('SELECT * FROM quiz_students WHERE student_id = ?').get(studentId);
  if ((game.game_mode || 'INDIVIDUAL').toUpperCase() === 'GROUP' && student) {
    if (game.group_grade_level && student.grade_level !== game.group_grade_level) {
      return res.json({ success: false, error: `Only ${game.group_grade_level} can join this group game` });
    }
    if (game.group_section && String(student.section || '').trim() !== String(game.group_section || '').trim()) {
      return res.json({ success: false, error: `Only section ${game.group_section} can join this group game` });
    }
  }
  let effectiveTeamName = teamName || '';
  if (!effectiveTeamName && (game.game_mode || 'INDIVIDUAL').toUpperCase() === 'GROUP' && student) {
    const mapped = db.prepare(
      'SELECT group_name FROM quiz_team_groups WHERE grade_level = ? AND section = ? AND student_id = ?'
    ).get(student.grade_level, student.section || '', studentId);
    if (mapped?.group_name) effectiveTeamName = mapped.group_name;
  }

  try {
    db.prepare('INSERT INTO live_game_players (game_id, student_id, nickname, team_name) VALUES (?, ?, ?, ?)')
      .run(game.id, studentId, nickname || studentId, effectiveTeamName || '');
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.json({ success: false, error: 'Already joined' });
    throw e;
  }

  const players = db.prepare('SELECT * FROM live_game_players WHERE game_id = ? ORDER BY joined_at').all(game.id);
  res.json({ success: true, data: { gameId: game.id, teamName: effectiveTeamName || '', players: players.map(p => ({ studentId: p.student_id, nickname: p.nickname })) } });
});

// Get game state (polled by both teacher and students)
router.get('/:gameId/state', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  const players = db.prepare('SELECT * FROM live_game_players WHERE game_id = ? ORDER BY total_score DESC')
    .all(game.id);
  const quiz = db.prepare('SELECT title, question_count FROM quizzes WHERE id = ?').get(game.quiz_id);

  let currentQuestion = null;
  let answeredCount = 0;
  let timeRemaining = 0;

  if (game.current_question >= 0) {
    const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);
    if (game.current_question < questions.length) {
      const q = questions[game.current_question];
      currentQuestion = {
        index: game.current_question,
        total: questions.length,
        questionText: q.question_text,
        mediaType: q.media_type || '',
        mediaUrl: q.media_url || '',
        choices: [
          { letter: 'A', text: q.choice_a, mediaType: q.choice_a_media_type || '', mediaUrl: q.choice_a_media_url || '' },
          { letter: 'B', text: q.choice_b, mediaType: q.choice_b_media_type || '', mediaUrl: q.choice_b_media_url || '' },
          { letter: 'C', text: q.choice_c, mediaType: q.choice_c_media_type || '', mediaUrl: q.choice_c_media_url || '' },
          { letter: 'D', text: q.choice_d, mediaType: q.choice_d_media_type || '', mediaUrl: q.choice_d_media_url || '' }
        ].filter(c => c.text),
        points: q.points || 1,
        timeLimit: game.question_duration
      };
    }
    answeredCount = db.prepare('SELECT COUNT(*) as cnt FROM live_game_answers WHERE game_id = ? AND question_index = ?')
      .get(game.id, game.current_question).cnt;

    if (game.question_start_time) {
      const elapsed = (Date.now() - new Date(game.question_start_time).getTime()) / 1000;
      timeRemaining = Math.max(0, game.question_duration - elapsed);
    }
  }

  const isGroup = (game.game_mode || 'INDIVIDUAL').toUpperCase() === 'GROUP';
  let leaderboard;
  if (isGroup) {
    const teams = {};
    for (const p of players) {
      const team = (p.team_name || '').trim() || 'Unassigned';
      if (!teams[team]) {
        teams[team] = { teamName: team, nickname: team, studentId: team, score: 0, correctCount: 0, members: [] };
      }
      teams[team].score += p.total_score;
      teams[team].correctCount += p.correct_count;
      teams[team].members.push(p.nickname);
    }
    leaderboard = Object.values(teams).map((t) => ({
      ...t,
      score: t.members.length ? Math.round((t.score / t.members.length) * 100) / 100 : 0
    })).sort((a, b) => b.score - a.score);
  } else {
    leaderboard = players.map(p => ({
      studentId: p.student_id,
      nickname: p.nickname,
      teamName: p.team_name || '',
      score: p.total_score,
      correctCount: p.correct_count,
      streak: p.streak
    }));
  }

  res.json({
    success: true,
    data: {
      gameId: game.id,
      pin: game.pin,
      status: game.status,
      quizTitle: quiz?.title || '',
      questionCount: quiz?.question_count || 0,
      currentQuestion,
      answeredCount,
      totalPlayers: players.length,
      timeRemaining: Math.round(timeRemaining),
      strictMode: game.strict_mode === 1,
      gameMode: game.game_mode || 'INDIVIDUAL',
      groupGradeLevel: game.group_grade_level || '',
      groupSection: game.group_section || '',
      leaderboard
    }
  });
});

// Teacher: Start the game
router.post('/:gameId/start', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  db.prepare("UPDATE live_games SET status = 'PLAYING', current_question = 0, question_start_time = ? WHERE id = ?")
    .run(new Date().toISOString(), req.params.gameId);

  res.json({ success: true, message: 'Game started' });
});

// Teacher: Next question
router.post('/:gameId/next', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);
  const nextQ = game.current_question + 1;

  if (nextQ >= questions.length) {
    db.prepare("UPDATE live_games SET status = 'RESULTS', current_question = ? WHERE id = ?")
      .run(nextQ, req.params.gameId);
    return res.json({ success: true, data: { finished: true } });
  }

  db.prepare("UPDATE live_games SET current_question = ?, question_start_time = ?, status = 'PLAYING' WHERE id = ?")
    .run(nextQ, new Date().toISOString(), req.params.gameId);

  res.json({ success: true, data: { finished: false, questionIndex: nextQ } });
});

// Teacher: Show results between questions
router.post('/:gameId/show-results', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  db.prepare("UPDATE live_games SET status = 'SHOWING_RESULTS' WHERE id = ?").run(req.params.gameId);

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);
  const q = questions[game.current_question];
  const answers = db.prepare('SELECT * FROM live_game_answers WHERE game_id = ? AND question_index = ?')
    .all(game.id, game.current_question);

  const choiceCounts = { A: 0, B: 0, C: 0, D: 0 };
  answers.forEach(a => {
    const upper = (a.answer || '').toUpperCase();
    if (choiceCounts[upper] !== undefined) choiceCounts[upper]++;
  });

  if ((game.game_mode || 'INDIVIDUAL').toUpperCase() === 'GROUP') {
    const players = db.prepare('SELECT * FROM live_game_players WHERE game_id = ?').all(game.id);
    const byStudent = new Map(players.map((p) => [p.student_id, p]));
    const teamAgg = {};
    for (const a of answers) {
      const player = byStudent.get(a.student_id);
      const team = (player?.team_name || '').trim() || 'Unassigned';
      if (!teamAgg[team]) teamAgg[team] = { totalPoints: 0, totalCorrect: 0, count: 0, members: [] };
      teamAgg[team].totalPoints += Number(a.points_earned || 0);
      teamAgg[team].totalCorrect += Number(a.is_correct || 0);
      teamAgg[team].count += 1;
      teamAgg[team].members.push(a.student_id);
    }

    const insTeamQ = db.prepare(`
      INSERT OR REPLACE INTO live_game_team_question_scores (game_id, question_index, team_name, avg_score, avg_correct, processed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    const updPlayer = db.prepare('UPDATE live_game_players SET total_score = ?, correct_count = ? WHERE game_id = ? AND student_id = ?');

    const tx = db.transaction(() => {
      for (const [team, agg] of Object.entries(teamAgg)) {
        const avgScore = agg.count ? (agg.totalPoints / agg.count) : 0;
        const avgCorrect = agg.count ? (agg.totalCorrect / agg.count) : 0;
        insTeamQ.run(game.id, game.current_question, team, avgScore, avgCorrect);
        for (const sid of agg.members) {
          const p = byStudent.get(sid);
          if (!p) continue;
          updPlayer.run(
            Number(p.total_score || 0) + avgScore,
            Number(p.correct_count || 0) + avgCorrect,
            game.id,
            sid
          );
        }
      }
    });
    tx();
  }

  res.json({
    success: true,
    data: {
      correctAnswer: q?.correct_answer || '',
      choiceCounts,
      totalAnswered: answers.length,
      correctCount: answers.filter(a => a.is_correct).length
    }
  });
});

// Student: Submit answer for current question
router.post('/:gameId/answer', (req, res) => {
  const { studentId, answer } = req.body;
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });
  if (game.status !== 'PLAYING') return res.json({ success: false, error: 'Not accepting answers' });

  const existing = db.prepare('SELECT id FROM live_game_answers WHERE game_id = ? AND question_index = ? AND student_id = ?')
    .get(game.id, game.current_question, studentId);
  if (existing) return res.json({ success: false, error: 'Already answered' });

  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);
  const q = questions[game.current_question];
  if (!q) return res.json({ success: false, error: 'Question not found' });

  const isCorrect = String(answer || '').trim().toUpperCase() === String(q.correct_answer || '').trim().toUpperCase();

  let timeTaken = 0;
  if (game.question_start_time) {
    timeTaken = (Date.now() - new Date(game.question_start_time).getTime()) / 1000;
  }

  let points = 0;
  if (isCorrect) {
    const maxPoints = 1000;
    const timeBonus = Math.max(0, 1 - (timeTaken / game.question_duration));
    points = Math.round(maxPoints * (0.5 + 0.5 * timeBonus));
  }

  db.prepare(`INSERT INTO live_game_answers (game_id, question_index, student_id, answer, is_correct, time_taken, points_earned)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(game.id, game.current_question, studentId, answer || '', isCorrect ? 1 : 0, timeTaken, points);

  const player = db.prepare('SELECT * FROM live_game_players WHERE game_id = ? AND student_id = ?').get(game.id, studentId);
  if (player && (game.game_mode || 'INDIVIDUAL').toUpperCase() !== 'GROUP') {
    const newStreak = isCorrect ? player.streak + 1 : 0;
    const streakBonus = isCorrect && newStreak >= 3 ? Math.min(newStreak - 2, 5) * 100 : 0;
    db.prepare('UPDATE live_game_players SET total_score = ?, correct_count = ?, streak = ? WHERE game_id = ? AND student_id = ?')
      .run(player.total_score + points + streakBonus, player.correct_count + (isCorrect ? 1 : 0), newStreak, game.id, studentId);
  }

  if ((game.game_mode || 'INDIVIDUAL').toUpperCase() === 'GROUP') {
    return res.json({ success: true, data: { isCorrect, points: 0, timeTaken: timeTaken.toFixed(1), pendingTeamAverage: true } });
  }
  res.json({ success: true, data: { isCorrect, points, timeTaken: timeTaken.toFixed(1) } });
});

// Teacher: End game
router.post('/:gameId/end', (req, res) => {
  const game = db.prepare('SELECT id FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });
  db.prepare("UPDATE live_games SET status = 'ENDED' WHERE id = ?").run(req.params.gameId);
  res.json({ success: true, message: 'Game ended' });
});

// Get final results / podium
router.get('/:gameId/final', (req, res) => {
  const game = db.prepare('SELECT * FROM live_games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.json({ success: false, error: 'Game not found' });

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(game.quiz_id);
  const players = db.prepare('SELECT * FROM live_game_players WHERE game_id = ? ORDER BY total_score DESC')
    .all(game.id);
  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_num').all(game.quiz_id);

  const questionResults = questions.map((q, i) => {
    const answers = db.prepare('SELECT * FROM live_game_answers WHERE game_id = ? AND question_index = ?').all(game.id, i);
    return {
      questionText: q.question_text,
      correctAnswer: q.correct_answer,
      totalAnswered: answers.length,
      correctCount: answers.filter(a => a.is_correct).length,
      avgTime: answers.length > 0 ? (answers.reduce((s, a) => s + a.time_taken, 0) / answers.length).toFixed(1) : 0
    };
  });

  const isGroup = (game.game_mode || 'INDIVIDUAL').toUpperCase() === 'GROUP';
  let podium;
  let leaderboard;
  if (isGroup) {
    const teams = {};
    for (const p of players) {
      const team = (p.team_name || '').trim() || 'Unassigned';
      if (!teams[team]) teams[team] = { nickname: team, score: 0, correct: 0 };
      teams[team].score += p.total_score;
      teams[team].correct += p.correct_count;
    }
    const sorted = Object.values(teams).map((t) => ({
      ...t,
      score: players.filter((p) => ((p.team_name || '').trim() || 'Unassigned') === t.nickname).length
        ? (t.score / players.filter((p) => ((p.team_name || '').trim() || 'Unassigned') === t.nickname).length)
        : 0
    })).sort((a, b) => b.score - a.score);
    podium = sorted.slice(0, 3).map(t => ({ nickname: t.nickname, score: t.score, correct: t.correct }));
    leaderboard = sorted.map((t, i) => ({ rank: i + 1, nickname: t.nickname, studentId: t.nickname, score: t.score, correct: t.correct }));
  } else {
    podium = players.slice(0, 3).map(p => ({ nickname: p.nickname, score: p.total_score, correct: p.correct_count }));
    leaderboard = players.map((p, i) => ({ rank: i + 1, nickname: p.nickname, studentId: p.student_id, score: p.total_score, correct: p.correct_count }));
  }

  res.json({
    success: true,
    data: {
      quizTitle: quiz?.title || '',
      totalQuestions: questions.length,
      totalPlayers: players.length,
      gameMode: game.game_mode || 'INDIVIDUAL',
      podium,
      leaderboard,
      questionResults
    }
  });
});

// List active games
router.get('/active', (req, res) => {
  const games = db.prepare("SELECT lg.*, q.title as quiz_title, q.question_count FROM live_games lg JOIN quizzes q ON lg.quiz_id = q.id WHERE lg.status != 'ENDED' ORDER BY lg.created_at DESC").all();
  const result = games.map(g => {
    const playerCount = db.prepare('SELECT COUNT(*) as cnt FROM live_game_players WHERE game_id = ?').get(g.id).cnt;
    return { ...g, playerCount };
  });
  res.json({ success: true, data: result });
});

export default router;
