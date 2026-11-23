import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  getAccounts,
  getDevices,
  getRecords,
  openDatabase
} from '../src/db.js';
import {
  generateBatchPdf,
  generateBlankFormPdf,
  generateRecordPdf,
  generateRecordsCsv,
  generateSopPdf,
  generateWeekPdf
} from '../src/services/exporter.js';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = join(root, 'verification', 'export-audit-20261108');
mkdirSync(outputDirectory, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), 'tianping-export-audit-'));
const { db } = openDatabase({
  dataDir: temp,
  initialPassword: 'Tp123456'
});

try {
  const devices = getDevices(db);
  const accounts = getAccounts(db);
  const names = Object.fromEntries(accounts.map((account) => [
    account.id,
    account.name
  ]));
  const records = getRecords(db, { limit: 20 });
  const verified = records.find((record) => record.status === '已复核确认');
  const weekRecords = records.filter(
    (record) => record.status === '已复核确认'
      && record.date >= '2026-09-28' && record.date <= '2026-10-04'
  );
  const allRecords = records.filter((record) =>
    record.status !== '已作废');
  const files = {
    record: join(outputDirectory, '记录导出.pdf'),
    batch: join(outputDirectory, '批量记录.pdf'),
    week: join(outputDirectory, '周统计.pdf'),
    blank: join(outputDirectory, '空白记录表.pdf'),
    sop: join(outputDirectory, '标准操作流程.pdf'),
    batch100: join(outputDirectory, '批量100条.pdf'),
    csv: join(outputDirectory, '记录清单.csv')
  };
  const verifiedDevice = verified.deviceSnapshot
    ? devices.find((device) => device.id === verified.device)
    : devices.find((device) => device.id === verified.device);
  const singleStart = performance.now();
  const singlePdf = generateRecordPdf(verified, verifiedDevice, {
    inspectorName: names[verified.inspector],
    verifierName: names[verified.verifiedBy] || '',
    exportedAt: new Date()
  });
  const singleMs = performance.now() - singleStart;
  writeFileSync(files.record, singlePdf);
  writeFileSync(files.batch, generateBatchPdf({
    records: allRecords,
    devices,
    exportedAt: new Date(),
    names
  }));
  writeFileSync(files.week, generateWeekPdf({
    records: weekRecords,
    devices,
    weekLabel: '2026-09-28 ~ 2026-10-04',
    from: '2026-09-28',
    to: '2026-10-04',
    exportedAt: new Date()
  }));
  writeFileSync(files.blank, generateBlankFormPdf({
    exportedAt: new Date()
  }));
  writeFileSync(files.sop, generateSopPdf({
    exportedAt: new Date()
  }));
  const hundredRecords = Array.from({ length: 100 }, (_, index) => ({
    ...verified,
    id: `PERF-EXPORT-${String(index).padStart(3, '0')}`,
    date: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`
  }));
  const batch100Start = performance.now();
  const batch100Pdf = generateBatchPdf({
    records: hundredRecords,
    devices,
    exportedAt: new Date(),
    names
  });
  const batch100Ms = performance.now() - batch100Start;
  writeFileSync(files.batch100, batch100Pdf);
  writeFileSync(files.csv, generateRecordsCsv(records, devices, names));

  const pdfinfo = 'C:\\Users\\CYF\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\poppler\\Library\\bin\\pdfinfo.exe';
  const inspections = {};
  for (const [name, path] of Object.entries(files).filter(([, path]) =>
    path.endsWith('.pdf'))) {
    const result = spawnSync(pdfinfo, [path], { encoding: 'utf8' });
    const fields = {};
    for (const line of String(result.stdout || '').split(/\r?\n/)) {
      const index = line.indexOf(':');
      if (index < 0) continue;
      fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    inspections[name] = {
      status: result.status,
      stderr: String(result.stderr || '').trim(),
      pages: Number(fields.Pages),
      pageSize: fields['Page size'],
      encrypted: fields.Encrypted,
      fileSize: fields['File size'],
      tagged: fields.Tagged,
      pdfVersion: fields['PDF version']
    };
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    outputDirectory,
    recordCount: records.length,
    performance: {
      singleMs,
      batch100Ms
    },
    verifiedRecord: {
      id: verified.id,
      status: verified.status,
      device: verified.device
    },
    weekRecordCount: weekRecords.length,
    files,
    inspections
  }, null, 2));
} finally {
  db.close();
  rmSync(temp, { recursive: true, force: true });
}
