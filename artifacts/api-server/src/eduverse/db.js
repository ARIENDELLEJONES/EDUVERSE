import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.EDUVERSE_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'eduverse.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function initDatabase() {
  db.exec(`
    -- ============================================================
    -- SYSTEM TABLES
    -- ============================================================
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      data TEXT,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      size INTEGER DEFAULT 0
    );

    -- ============================================================
    -- MODE A: STUDENT GRADING SYSTEM (preserves STUDENT-GRADING logic)
    -- ============================================================

    -- Database configurations (preserves existing multi-database system)
    CREATE TABLE IF NOT EXISTS grade_databases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      spreadsheet_link TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Students table (preserves tblDatabase columns A-BY mapping)
    CREATE TABLE IF NOT EXISTS grade_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      database_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      thai_name TEXT DEFAULT '',
      english_name TEXT DEFAULT '',
      section TEXT DEFAULT '',
      class_number TEXT DEFAULT '',
      password TEXT DEFAULT 'default',
      password_reset_request TEXT DEFAULT '',
      password_reset_date TEXT DEFAULT '',
      FOREIGN KEY (database_id) REFERENCES grade_databases(id),
      UNIQUE(database_id, student_id)
    );

    -- Grading weights (preserves tblGradingWeights)
    CREATE TABLE IF NOT EXISTS grading_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      database_id INTEGER NOT NULL UNIQUE,
      midterm_collective REAL DEFAULT 0,
      final_initial REAL DEFAULT 0,
      final_final REAL DEFAULT 0,
      midterm_exam REAL DEFAULT 0,
      final_exam REAL DEFAULT 0,
      pass_midterm REAL DEFAULT 0,
      pass_initial REAL DEFAULT 0,
      pass_final REAL DEFAULT 0,
      pass_overall REAL DEFAULT 0,
      freeze_final INTEGER DEFAULT 0,
      FOREIGN KEY (database_id) REFERENCES grade_databases(id)
    );

    -- Activity names and scores (preserves tblActivityName + tblActivityScore)
    CREATE TABLE IF NOT EXISTS activity_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      database_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      type TEXT NOT NULL,
      slot INTEGER NOT NULL,
      name TEXT DEFAULT '',
      max_score REAL DEFAULT 0,
      FOREIGN KEY (database_id) REFERENCES grade_databases(id),
      UNIQUE(database_id, period, type, slot)
    );

    -- Student scores for activities
    -- Preserves the column mapping from tblDatabase:
    -- Cols F-K: Midterm Individual 1-5 + Total
    -- Cols L-Q: Midterm Group 1-5 + Total
    -- Col R: Midterm Collective Total, Col S: Midterm Equivalent
    -- Cols T-Y: Final Initial Individual 1-5 + Total
    -- Cols Z-AE: Final Initial Group 1-5 + Total
    -- etc.
    CREATE TABLE IF NOT EXISTS student_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      database_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      period TEXT NOT NULL,
      score_type TEXT NOT NULL,
      slot INTEGER NOT NULL DEFAULT 0,
      score REAL DEFAULT 0,
      FOREIGN KEY (database_id) REFERENCES grade_databases(id),
      UNIQUE(database_id, student_id, period, score_type, slot)
    );

    -- Exam types (preserves tblExamTypes + tblExamTypesScore)
    CREATE TABLE IF NOT EXISTS exam_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      database_id INTEGER NOT NULL,
      side TEXT NOT NULL,
      slot INTEGER NOT NULL,
      type_name TEXT DEFAULT '',
      max_score REAL DEFAULT 0,
      FOREIGN KEY (database_id) REFERENCES grade_databases(id),
      UNIQUE(database_id, side, slot)
    );

    -- Exam scores per student
    CREATE TABLE IF NOT EXISTS exam_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      database_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      side TEXT NOT NULL,
      slot INTEGER NOT NULL,
      score REAL DEFAULT 0,
      FOREIGN KEY (database_id) REFERENCES grade_databases(id),
      UNIQUE(database_id, student_id, side, slot)
    );

    -- Groups (preserves tblGroupDatabase, tblMidtermGroup, etc.)
    CREATE TABLE IF NOT EXISTS student_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      database_id INTEGER NOT NULL,
      section TEXT NOT NULL,
      period TEXT NOT NULL,
      activity_number INTEGER NOT NULL,
      group_number INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      FOREIGN KEY (database_id) REFERENCES grade_databases(id)
    );

    -- Admin users for Mode A
    CREATE TABLE IF NOT EXISTS grade_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL DEFAULT 'admin123',
      name TEXT DEFAULT 'Admin',
      role TEXT DEFAULT 'admin'
    );

    -- Teacher users for Mode A
    CREATE TABLE IF NOT EXISTS grade_teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL DEFAULT 'teacher123',
      name TEXT DEFAULT 'Teacher',
      assigned_databases TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS grade_teacher_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_user_id TEXT NOT NULL,
      database_id INTEGER NOT NULL,
      access_level TEXT NOT NULL DEFAULT 'NO_ACCESS',
      UNIQUE(teacher_user_id, database_id)
    );

    -- ============================================================
    -- MODE B: QUIZ/GAME SYSTEM (preserves quiz-spa logic)
    -- ============================================================

    -- Quiz teacher accounts
    CREATE TABLE IF NOT EXISTS quiz_teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL DEFAULT 'teacher123',
      name TEXT DEFAULT 'Teacher',
      subjects TEXT DEFAULT '',
      grade_levels TEXT DEFAULT ''
    );

    -- Student databases linked to quiz system
    CREATE TABLE IF NOT EXISTS quiz_student_databases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spreadsheet_url TEXT DEFAULT '',
      name TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      teacher_id TEXT DEFAULT '',
      date_added TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'active'
    );

    -- Quiz students (imported from databases)
    CREATE TABLE IF NOT EXISTS quiz_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      thai_name TEXT DEFAULT '',
      english_name TEXT DEFAULT '',
      section TEXT DEFAULT '',
      class_no TEXT DEFAULT '',
      grade_level TEXT NOT NULL,
      password TEXT DEFAULT 'default',
      database_id INTEGER,
      UNIQUE(student_id, grade_level)
    );
    CREATE TABLE IF NOT EXISTS section_database_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      section TEXT NOT NULL,
      database_id INTEGER NOT NULL,
      UNIQUE(mode, grade_level, section)
    );

    -- Quizzes
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'QUIZ',
      period TEXT DEFAULT 'midterm',
      subject TEXT DEFAULT '',
      grade_level TEXT DEFAULT '',
      passing_score REAL DEFAULT 50,
      attempts_allowed INTEGER DEFAULT 1,
      time_limit INTEGER DEFAULT 0,
      retake_allowed TEXT DEFAULT 'NO',
      randomize_questions TEXT DEFAULT 'NO',
      randomize_choices TEXT DEFAULT 'NO',
      status TEXT DEFAULT 'DRAFT',
      created_by TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      deadline TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      question_count INTEGER DEFAULT 0
    );

    -- Quiz grade level assignments
    CREATE TABLE IF NOT EXISTS quiz_grade_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
      UNIQUE(quiz_id, grade_level)
    );

    -- Questions
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT DEFAULT 'MCQ',
      media_type TEXT DEFAULT '',
      media_url TEXT DEFAULT '',
      choice_a TEXT DEFAULT '',
      choice_a_media_type TEXT DEFAULT '',
      choice_a_media_url TEXT DEFAULT '',
      choice_b TEXT DEFAULT '',
      choice_b_media_type TEXT DEFAULT '',
      choice_b_media_url TEXT DEFAULT '',
      choice_c TEXT DEFAULT '',
      choice_c_media_type TEXT DEFAULT '',
      choice_c_media_url TEXT DEFAULT '',
      choice_d TEXT DEFAULT '',
      choice_d_media_type TEXT DEFAULT '',
      choice_d_media_url TEXT DEFAULT '',
      correct_answer TEXT DEFAULT '',
      points REAL DEFAULT 1,
      question_time_limit INTEGER DEFAULT 0,
      order_num INTEGER DEFAULT 0,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    );

    -- Quiz attempts
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT DEFAULT '',
      grade_level TEXT DEFAULT '',
      section TEXT DEFAULT '',
      class_no TEXT DEFAULT '',
      start_time TEXT DEFAULT (datetime('now')),
      end_time TEXT DEFAULT '',
      score REAL DEFAULT 0,
      total_points REAL DEFAULT 0,
      percentage REAL DEFAULT 0,
      result TEXT DEFAULT '',
      tab_switch_count INTEGER DEFAULT 0,
      submitted INTEGER DEFAULT 0,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    );

    -- Quiz answers
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      student_answer TEXT DEFAULT '',
      is_correct INTEGER DEFAULT 0,
      points_earned REAL DEFAULT 0,
      FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    -- Retake requests
    CREATE TABLE IF NOT EXISTS retake_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      student_name TEXT DEFAULT '',
      quiz_id TEXT NOT NULL,
      quiz_title TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    );

    -- Deadline extension requests
    CREATE TABLE IF NOT EXISTS deadline_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      student_name TEXT DEFAULT '',
      quiz_id TEXT NOT NULL,
      quiz_title TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    );

    -- Quiz types configuration
    CREATE TABLE IF NOT EXISTS quiz_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT ''
    );

    -- ============================================================
    -- KAHOOT-STYLE LIVE GAME SESSIONS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS live_games (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      pin TEXT NOT NULL UNIQUE,
      host_id TEXT NOT NULL,
      status TEXT DEFAULT 'LOBBY',
      current_question INTEGER DEFAULT -1,
      question_start_time TEXT DEFAULT '',
      question_duration INTEGER DEFAULT 20,
      strict_mode INTEGER DEFAULT 0,
      game_mode TEXT DEFAULT 'INDIVIDUAL',
      group_grade_level TEXT DEFAULT '',
      group_section TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    );

    CREATE TABLE IF NOT EXISTS live_game_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      team_name TEXT DEFAULT '',
      total_score INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (game_id) REFERENCES live_games(id),
      UNIQUE(game_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS live_game_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      answer TEXT DEFAULT '',
      is_correct INTEGER DEFAULT 0,
      time_taken REAL DEFAULT 0,
      points_earned INTEGER DEFAULT 0,
      answered_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (game_id) REFERENCES live_games(id),
      UNIQUE(game_id, question_index, student_id)
    );

    CREATE TABLE IF NOT EXISTS live_game_team_question_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      avg_score REAL DEFAULT 0,
      avg_correct REAL DEFAULT 0,
      processed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(game_id, question_index, team_name)
    );

    CREATE TABLE IF NOT EXISTS quiz_team_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_level TEXT NOT NULL,
      section TEXT NOT NULL,
      group_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(grade_level, section, student_id)
    );

    CREATE TABLE IF NOT EXISTS quiz_score_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_level TEXT NOT NULL,
      target_database_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      score_type TEXT NOT NULL,
      slot INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL DEFAULT 'QUIZ_ATTEMPT',
      source_quiz_id TEXT DEFAULT '',
      apply_mode TEXT NOT NULL DEFAULT 'BEST',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ============================================================
    -- SEED DEFAULT DATA
    -- ============================================================
    INSERT OR IGNORE INTO settings (key, value) VALUES ('app_name', 'EDUVERSE');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('app_version', '1.0.0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('author', 'JOSEPH BRYLLE D. EGAY');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('year', '2026');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('lan_port', '3000');

    INSERT OR IGNORE INTO grade_admins (user_id, password, name, role) VALUES ('admin', 'admin123', 'Administrator', 'admin');
    INSERT OR IGNORE INTO grade_teachers (user_id, password, name) VALUES ('teacher', 'teacher123', 'Default Teacher');

    INSERT OR IGNORE INTO quiz_teachers (username, password, name, subjects, grade_levels)
      VALUES ('teacher', 'teacher123', 'Default Teacher', 'ALL', 'MATHAYUM 1,MATHAYUM 2,MATHAYUM 3,MATHAYUM 4,MATHAYUM 5,MATHAYUM 6');

    INSERT OR IGNORE INTO quiz_types (name) VALUES ('QUIZ');
    INSERT OR IGNORE INTO quiz_types (name) VALUES ('EXAM');
    INSERT OR IGNORE INTO quiz_types (name) VALUES ('PRACTICE');
    INSERT OR IGNORE INTO quiz_types (name) VALUES ('SURVEY');
    INSERT OR IGNORE INTO quiz_types (name) VALUES ('HOMEWORK');
    INSERT OR IGNORE INTO quiz_types (name) VALUES ('GAME');
  `);

  const migrate = (sql) => { try { db.exec(sql); } catch {} };
  migrate("ALTER TABLE live_games ADD COLUMN strict_mode INTEGER DEFAULT 0");
  migrate("ALTER TABLE live_games ADD COLUMN game_mode TEXT DEFAULT 'INDIVIDUAL'");
  migrate("ALTER TABLE live_games ADD COLUMN group_grade_level TEXT DEFAULT ''");
  migrate("ALTER TABLE live_games ADD COLUMN group_section TEXT DEFAULT ''");
  migrate("ALTER TABLE live_game_players ADD COLUMN team_name TEXT DEFAULT ''");
  migrate("ALTER TABLE grading_weights ADD COLUMN custom_formula TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN media_type TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN media_url TEXT DEFAULT ''");
  migrate("ALTER TABLE quizzes ADD COLUMN period TEXT DEFAULT 'midterm'");
  migrate("ALTER TABLE questions ADD COLUMN choice_a_media_type TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN choice_a_media_url TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN choice_b_media_type TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN choice_b_media_url TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN choice_c_media_type TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN choice_c_media_url TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN choice_d_media_type TEXT DEFAULT ''");
  migrate("ALTER TABLE questions ADD COLUMN choice_d_media_url TEXT DEFAULT ''");
  migrate("ALTER TABLE quizzes ADD COLUMN quiz_mode TEXT DEFAULT 'NORMAL_QUIZ'");
  migrate("UPDATE quizzes SET quiz_mode = 'NORMAL_QUIZ' WHERE quiz_mode IS NULL");
  migrate("ALTER TABLE quizzes ADD COLUMN strict_mode INTEGER DEFAULT 0");
  migrate("ALTER TABLE questions ADD COLUMN extra_data TEXT DEFAULT ''");
  migrate(`CREATE TABLE IF NOT EXISTS quiz_student_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT DEFAULT '',
    grade_level TEXT DEFAULT '',
    section TEXT DEFAULT '',
    status TEXT DEFAULT 'in_progress',
    current_question INTEGER DEFAULT 0,
    tab_switch_count INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    is_blocked INTEGER DEFAULT 0,
    UNIQUE(quiz_id, student_id)
  )`);

  migrate('CREATE INDEX IF NOT EXISTS idx_quiz_students_grade ON quiz_students(grade_level)');
  migrate('CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_student ON quiz_attempts(quiz_id, student_id)');
  migrate('CREATE INDEX IF NOT EXISTS idx_grade_students_db ON grade_students(database_id)');
  migrate('CREATE INDEX IF NOT EXISTS idx_live_games_pin ON live_games(pin)');
  migrate('CREATE INDEX IF NOT EXISTS idx_live_game_players_game ON live_game_players(game_id)');
  migrate('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');
  migrate("UPDATE quiz_teachers SET password = 'teacher123' WHERE username = 'teacher' AND password = 'teacher'");

  // ── Live Performance tables ────────────────────────────────────
  migrate(`CREATE TABLE IF NOT EXISTS performances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    database_id INTEGER NOT NULL,
    grade_level TEXT NOT NULL,
    section TEXT NOT NULL,
    title TEXT NOT NULL,
    lesson_number TEXT DEFAULT '',
    performance_type TEXT NOT NULL,
    max_score REAL DEFAULT 100,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (database_id) REFERENCES grade_databases(id)
  )`);

  migrate(`CREATE TABLE IF NOT EXISTS performance_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    performance_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    score REAL DEFAULT 0,
    saved_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (performance_id) REFERENCES performances(id),
    UNIQUE(performance_id, student_id)
  )`);

  migrate(`CREATE TABLE IF NOT EXISTS performance_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    database_id INTEGER NOT NULL,
    allowed_percentage_weight REAL DEFAULT 100,
    midterm_slot INTEGER DEFAULT -1,
    final_slot INTEGER DEFAULT -1,
    UNIQUE(database_id)
  )`);

  // ── Grading weights: add Other Activities columns ──────────────
  migrate("ALTER TABLE grading_weights ADD COLUMN other_activities_midterm REAL DEFAULT 0");
  migrate("ALTER TABLE grading_weights ADD COLUMN other_activities_final REAL DEFAULT 0");

  // ── Quiz intro/result customization ────────────────────────────
  migrate("ALTER TABLE quizzes ADD COLUMN intro_message TEXT DEFAULT ''");
  migrate("ALTER TABLE quizzes ADD COLUMN pass_message TEXT DEFAULT ''");
  migrate("ALTER TABLE quizzes ADD COLUMN fail_message TEXT DEFAULT ''");

  // ── Per-question scoring options ───────────────────────────────
  migrate("ALTER TABLE questions ADD COLUMN question_time_limit INTEGER DEFAULT 0");
  migrate("ALTER TABLE questions ADD COLUMN minus_points REAL DEFAULT 0");
  migrate("ALTER TABLE questions ADD COLUMN points_per_correct REAL DEFAULT 0");
  migrate("ALTER TABLE questions ADD COLUMN points_per_wrong REAL DEFAULT 0");

  return db;
}

export default db;
