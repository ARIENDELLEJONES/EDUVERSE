import db from '../db.js';

/** Delete a grade database and all dependent rows (FK-safe). */
export function deleteGradeDatabaseCascade(databaseId) {
  const id = Number(databaseId);
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM student_groups WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM exam_scores WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM student_scores WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM exam_types WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM activity_config WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM grade_students WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM grading_weights WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM grade_teacher_permissions WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM section_database_assignments WHERE database_id = ?').run(id);
    db.prepare('DELETE FROM grade_databases WHERE id = ?').run(id);
  });
  txn();
}
