import {
  existsSync,
  readdirSync,
  statSync
} from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDevices, getRecord, getTask } from '../src/db.js';
import { evaluateRecord } from '../src/rules.js';

const root = resolve(import.meta.dirname, '..');
const dataDir = join(root, 'data');
const databasePath = join(dataDir, 'tianping.db');
const db = new DatabaseSync(databasePath, { readOnly: true });

function count(sql, ...parameters) {
  return db.prepare(sql).get(...parameters).count;
}

function validCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  ));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all().map((row) => row.name);
const tableCounts = Object.fromEntries(
  tables.map((table) => [table, count(`SELECT COUNT(*) AS count FROM ${table}`)])
);

const statusCounts = Object.fromEntries(
  db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM records
    GROUP BY status
    ORDER BY status
  `).all().map((row) => [row.status, row.count])
);
const taskStatusCounts = Object.fromEntries(
  db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM tasks
    GROUP BY status
    ORDER BY status
  `).all().map((row) => [row.status, row.count])
);

const devices = getDevices(db);
const records = db.prepare('SELECT id FROM records ORDER BY id').all()
  .map((row) => getRecord(db, row.id));
const recordIssues = [];
const evaluations = [];
for (const record of records) {
  const issues = [];
  if (!validCalendarDate(record.date)) issues.push(`非法记录日期 ${record.date}`);
  if (!Array.isArray(record.readouts) || record.readouts.length !== 9) {
    issues.push(`读数数量 ${record.readouts?.length ?? 'null'}，不是 9`);
  }
  if (record.status === '已提交'
    && (!record.submittedBy || !record.submittedAt)) {
    issues.push('已提交记录缺少提交人/时间');
  }
  if (record.status === '已复核确认'
    && (!record.verifiedBy || !record.verifiedAt)) {
    issues.push('已复核记录缺少复核人/时间');
  }
  if (record.status === '已作废'
    && (!record.voidBy || !record.voidAt || !record.voidReason)) {
    issues.push('已作废记录缺少作废人/时间/理由');
  }
  for (const readout of record.readouts || []) {
    if (readout.screenshot) {
      const screenshotPath = join(dataDir, ...String(readout.screenshot).split('/'));
      if (!existsSync(screenshotPath)) {
        issues.push(`${readout.key || '未知读数'} 截图不存在：${readout.screenshot}`);
      }
    }
  }
  for (const segment of record.recognition?.segments || []) {
    if (!segment.screenshot) continue;
    const screenshotPath = join(dataDir, ...String(segment.screenshot).split('/'));
    if (!existsSync(screenshotPath)) {
      issues.push(`时序段 ${segment.sequence} 截图不存在：${segment.screenshot}`);
    }
  }
  const device = {
    ...(devices.find((item) => item.id === record.device) || {}),
    ...(record.deviceSnapshot || {})
  };
  const evaluation = evaluateRecord(
    record,
    device,
    record.tolerancePercent ?? record.templateSnapshot?.tol ?? device.tol
  );
  evaluations.push({
    id: record.id,
    status: record.status,
    conclusion: evaluation.conclusion,
    reasons: evaluation.reasons.map((reason) => reason.code),
    segments: record.recognition?.segments?.length ?? null
  });
  if (issues.length) {
    recordIssues.push({ id: record.id, status: record.status, issues });
  }
}

const taskIssues = [];
const tasks = db.prepare('SELECT id FROM tasks ORDER BY id').all()
  .map((row) => getTask(db, row.id));
for (const task of tasks) {
  const issues = [];
  if (task.filePath && !existsSync(task.filePath)) {
    issues.push(`源文件不存在：${task.filePath}`);
  }
  if (task.status === '已完成' && (!task.recordId || !getRecord(db, task.recordId))) {
    issues.push('已完成任务缺少有效记录');
  }
  if (task.status === '分析中' && !existsSync(join(root, 'data', 'server.out.log'))) {
    issues.push('分析中任务缺少运行服务证据');
  }
  if (issues.length) taskIssues.push({ id: task.id, status: task.status, issues });
}

const orphanChecks = {
  taskWithoutUser: count(`
    SELECT COUNT(*) AS count FROM tasks t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE u.id IS NULL
  `),
  recordWithoutDevice: count(`
    SELECT COUNT(*) AS count FROM records r
    LEFT JOIN devices d ON d.id = r.device_id
    WHERE d.id IS NULL
  `),
  recordWithoutInspector: count(`
    SELECT COUNT(*) AS count FROM records r
    LEFT JOIN users u ON u.id = r.inspector_id
    WHERE u.id IS NULL
  `),
  recordTaskMissing: count(`
    SELECT COUNT(*) AS count FROM records r
    LEFT JOIN tasks t ON t.id = r.task_id
    WHERE r.task_id IS NOT NULL AND t.id IS NULL
  `),
  completedTaskWithoutRecord: count(`
    SELECT COUNT(*) AS count FROM tasks t
    LEFT JOIN records r ON r.id = t.record_id
    WHERE t.status = '已完成' AND (t.record_id IS NULL OR r.id IS NULL)
  `)
};

const backupAudit = [];
const backupDirectory = join(dataDir, 'backups');
if (existsSync(backupDirectory)) {
  for (const file of readdirSync(backupDirectory).filter((name) => name.endsWith('.db'))) {
    const path = join(backupDirectory, file);
    try {
      const backup = new DatabaseSync(path, { readOnly: true });
      const quickCheck = Object.values(
        backup.prepare('PRAGMA quick_check').get()
      )[0];
      const users = backup.prepare('SELECT COUNT(*) AS count FROM users').get().count;
      const recordsCount = backup.prepare(
        'SELECT COUNT(*) AS count FROM records'
      ).get().count;
      const audits = backup.prepare(
        'SELECT COUNT(*) AS count FROM audit_logs'
      ).get().count;
      backup.close();
      backupAudit.push({
        file,
        bytes: statSync(path).size,
        quickCheck,
        users,
        records: recordsCount,
        auditLogs: audits
      });
    } catch (error) {
      backupAudit.push({ file, error: String(error.message || error) });
    }
  }
}

const journal = db.prepare('PRAGMA journal_mode').get();
const integrity = db.prepare('PRAGMA integrity_check').get();
const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
const pageSize = db.prepare('PRAGMA page_size').get();
const pageCount = db.prepare('PRAGMA page_count').get();
const freelistCount = db.prepare('PRAGMA freelist_count').get();
const sensitiveFiles = ['initial-password.txt', '.env']
  .filter((name) => existsSync(join(dataDir, name)))
  .map((name) => ({
    name,
    bytes: statSync(join(dataDir, name)).size
  }));

const output = {
  generatedAt: new Date().toISOString(),
  databasePath,
  databaseBytes: statSync(databasePath).size,
  walBytes: existsSync(`${databasePath}-wal`) ? statSync(`${databasePath}-wal`).size : 0,
  journalMode: Object.values(journal)[0],
  integrity: Object.values(integrity)[0],
  foreignKeyViolations: foreignKeys,
  pageSize: Object.values(pageSize)[0],
  pageCount: Object.values(pageCount)[0],
  freelistCount: Object.values(freelistCount)[0],
  tableCounts,
  statusCounts,
  taskStatusCounts,
  orphanChecks,
  recordIssues,
  taskIssues,
  evaluations,
  backups: backupAudit,
  sensitiveFilesInDataDirectory: sensitiveFiles
};

db.close();
console.log(JSON.stringify(output, null, 2));
