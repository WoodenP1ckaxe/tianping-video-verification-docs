import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  getDevice,
  getRecord,
  getTemplate,
  openDatabase
} from '../../src/db.js';
import { generateRecordPdf } from '../../src/services/exporter.js';

const temporary = mkdtempSync(join(tmpdir(), 'tianping-pdf-fix-'));
const output = resolve(process.argv[2] || join(import.meta.dirname, 'record-pdf-fix.pdf'));
const { db } = openDatabase({
  dataDir: temporary,
  initialPassword: 'PdfFix1234'
});
try {
  const seedId = db.prepare(
    "SELECT id FROM records WHERE status = '待提交' ORDER BY id LIMIT 1"
  ).get()?.id || db.prepare('SELECT id FROM records ORDER BY id LIMIT 1').get()?.id;
  const record = getRecord(db, seedId);
  if (!record) throw new Error('seed record missing');
  record.submittedAt = null;
  record.verifiedBy = null;
  record.verifiedAt = null;
  const device = getDevice(db, record.device);
  const template = getTemplate(db, record.templateVersion);
  const pdf = generateRecordPdf(record, device, {
    template,
    exportedAt: '2026-11-22 22:00',
    inspectorName: '李一'
  });
  writeFileSync(output, pdf);
  console.log(JSON.stringify({ output, bytes: pdf.length }, null, 2));
} finally {
  db.close();
  rmSync(temporary, { recursive: true, force: true });
}
