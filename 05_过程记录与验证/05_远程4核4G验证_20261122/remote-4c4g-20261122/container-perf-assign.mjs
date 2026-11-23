import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('/app/data/tianping.db');
try {
  const records = db.prepare(
    "SELECT id FROM records WHERE id LIKE 'PERF-%' ORDER BY id LIMIT 5",
  ).all();
  if (records.length !== 5) throw new Error(`expected 5 PERF records, got ${records.length}`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = 0; index < records.length; index += 1) {
      db.prepare('UPDATE records SET inspector_id = ? WHERE id = ?')
        .run(`U10${index + 1}`, records[index].id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  console.log(JSON.stringify({
    records: records.map((record, index) => ({
      id: record.id,
      inspector: `U10${index + 1}`,
    })),
    integrity: Object.values(db.prepare('PRAGMA integrity_check').get())[0],
    foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all().length,
  }, null, 2));
} finally {
  db.close();
}
