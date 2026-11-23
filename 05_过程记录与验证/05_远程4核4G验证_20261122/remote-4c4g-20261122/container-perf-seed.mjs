import { DatabaseSync } from 'node:sqlite';

const target = Number(process.env.PERF_RECORD_COUNT || 10_000);
const db = new DatabaseSync('/app/data/tianping.db');
try {
  const current = db.prepare('SELECT COUNT(*) count FROM records').get().count;
  if (current >= target) {
    console.log(JSON.stringify({ current, target, inserted: 0 }));
    process.exit(0);
  }
  const source = db.prepare(
    "SELECT id FROM records WHERE status <> '已作废' ORDER BY id LIMIT 1",
  ).get();
  if (!source) throw new Error('seed source record missing');
  const columns = db.prepare('PRAGMA table_info(records)').all().map((row) => row.name);
  const fields = columns.filter((column) => column !== 'id');
  const selected = fields.map((field) => field === 'task_id' ? 'NULL' : field);
  const insert = db.prepare(`
    INSERT INTO records (id, ${fields.join(',')})
    SELECT ?, ${selected.join(',')}
    FROM records
    WHERE id = ?
  `);
  const update = db.prepare(`
    UPDATE records
    SET date = ?, inspector_id = ?, task_id = NULL
    WHERE id = ?
  `);
  let inserted = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let index = current; index < target; index += 1) {
      const id = `PERF-${String(index).padStart(5, '0')}`;
      insert.run(id, source.id);
      update.run(
        `2025-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
        index % 2 ? 'U001' : 'U002',
        id,
      );
      inserted += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const total = db.prepare('SELECT COUNT(*) count FROM records').get().count;
  console.log(JSON.stringify({ current, target, inserted, total }, null, 2));
} finally {
  db.close();
}
