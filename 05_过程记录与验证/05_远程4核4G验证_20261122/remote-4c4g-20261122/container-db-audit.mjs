import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const db = new DatabaseSync('/app/data/tianping.db', { readOnly: true });
try {
  const tasks = db.prepare(`
    SELECT id, file_name, status, duration_ms, queued_at, analysis_started_at,
           finished_at, record_id, error_code, error_reason
    FROM tasks
    WHERE file_name LIKE 'synthetic-%'
    ORDER BY rowid DESC
  `).all();
  const records = db.prepare(`
    SELECT id, status, conclusion, speech_json, recognition_json, readouts_json
    FROM records
    WHERE file_name LIKE 'synthetic-%'
    ORDER BY date DESC, id DESC
  `).all().map((row) => ({
    ...row,
    speech: JSON.parse(row.speech_json || '{}'),
    recognition: JSON.parse(row.recognition_json || '{}'),
    readouts: JSON.parse(row.readouts_json || '[]'),
    speech_json: undefined,
    recognition_json: undefined,
    readouts_json: undefined,
  }));
  const screenshotRoot = '/app/data/screenshots';
  const screenshotDirs = readdirSync(screenshotRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      id: entry.name,
      count: readdirSync(join(screenshotRoot, entry.name)).length,
    }));
  console.log(JSON.stringify({
    tasks,
    records,
    screenshotDirs,
    integrity: Object.values(db.prepare('PRAGMA integrity_check').get())[0],
    foreignKeys: db.prepare('PRAGMA foreign_keys').get(),
    foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all(),
  }, null, 2));
} finally {
  db.close();
}
