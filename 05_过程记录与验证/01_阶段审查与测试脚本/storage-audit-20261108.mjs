import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db.js';
import { StorageService } from '../src/services/storage.js';

const temp = mkdtempSync(join(tmpdir(), 'tianping-storage-audit-'));
const { db } = openDatabase({
  dataDir: temp,
  initialPassword: 'Tp123456'
});

try {
  const videoRoot = join(temp, 'videos');
  mkdirSync(videoRoot, { recursive: true });
  const specs = [
    { id: 'T-QUOTA-OLD', name: 'old.mp4', size: 300 * 1024, status: '已完成', ageDays: 4 },
    { id: 'T-QUOTA-ACTIVE', name: 'active.mp4', size: 300 * 1024, status: '分析中', ageDays: 3 },
    { id: 'T-QUOTA-NEW', name: 'new.mp4', size: 800 * 1024, status: '已完成', ageDays: 2 }
  ];
  for (const spec of specs) {
    const path = join(videoRoot, spec.name);
    writeFileSync(path, Buffer.alloc(spec.size, 0x31));
    const date = new Date(Date.now() - spec.ageDays * 86_400_000);
    utimesSync(path, date, date);
    db.prepare(`
      INSERT INTO tasks (
        id, file_name, file_path, size_bytes, user_id, device_id, status,
        started_at, queued_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'U001', 'F001', ?, '2026-11-08 10:00',
        '2026-11-08 10:00', '2026-11-08 10:00', '2026-11-08 10:00')
    `).run(spec.id, spec.name, path, spec.size, spec.status);
  }
  db.prepare("UPDATE settings SET value_json = '0.001' WHERE key = 'videoQuotaGb'").run();
  const recordsBefore = db.prepare('SELECT COUNT(*) AS count FROM records').get().count;
  const storage = new StorageService({
    db,
    config: {
      dataDir: temp,
      minFreeDiskBytes: 0
    }
  });
  const before = storage.getStats();
  const cleaned = storage.enforceQuota(null);
  const after = storage.getStats();
  const recordsAfter = db.prepare('SELECT COUNT(*) AS count FROM records').get().count;
  const cleanupLogs = db.prepare(
    'SELECT file_path, size_bytes, reason FROM cleanup_log ORDER BY id'
  ).all();
  const warningAudits = db.prepare(`
    SELECT type, object_id, result
    FROM audit_logs
    WHERE type = '容量告警'
    ORDER BY id
  `).all();

  console.log(JSON.stringify({
    before: {
      usedBytes: before.usedBytes,
      percent: before.percent,
      warning: before.warning,
      videoCount: before.videoCount
    },
    cleaned: cleaned.map((item) => ({
      file: item.path,
      size: item.size
    })),
    after: {
      usedBytes: after.usedBytes,
      percent: after.percent,
      warning: after.warning,
      videoCount: after.videoCount
    },
    activeFilePreserved: existsSync(join(videoRoot, 'active.mp4')),
    recordsBefore,
    recordsAfter,
    cleanupLogs,
    warningAudits
  }, null, 2));
} finally {
  db.close();
  rmSync(temp, { recursive: true, force: true });
}
