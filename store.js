import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "model-rigging-calibration.json");

const seed = {
  items: [
    {
      code: "MR-001",
      shipType: "福船",
      scale: "1:48",
      mastCount: 3,
      riggingMaterial: "蜡线",
      owner: "周宁",
      dueDate: "2026-06-28",
      status: "校准中",
      tasks: [
        {
          id: "T-1",
          position: "前桅侧支索",
          tension: "偏松",
          status: "调整中",
          logs: [{ at: "2026-06-12", note: "已缩短2mm" }]
        }
      ],
      logs: []
    }
  ],
  batches: [
    { id: "B-001", material: "蜡线", spec: "0.4mm 本色", totalLength: 200, remaining: 160, unit: "米", expiryDate: "2027-03-31", createdAt: "2026-05-01T00:00:00.000Z" },
    { id: "B-002", material: "蜡线", spec: "0.6mm 深棕", totalLength: 120, remaining: 45, unit: "米", expiryDate: "2026-10-31", createdAt: "2026-05-01T00:00:00.000Z" },
    { id: "B-003", material: "蜡线", spec: "0.3mm 漂白", totalLength: 80, remaining: 80, unit: "米", expiryDate: "2026-06-30", createdAt: "2026-05-01T00:00:00.000Z" }
  ],
  issues: []
};

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await saveDb(seed);
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  let migrated = false;
  if (!Array.isArray(db.items)) { db.items = []; migrated = true; }
  if (!Array.isArray(db.batches)) { db.batches = structuredClone(seed.batches); migrated = true; }
  if (!Array.isArray(db.issues)) { db.issues = []; migrated = true; }
  if (migrated) await saveDb(db);
  return db;
}

export async function saveDb(db) {
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function newId(prefix) {
  return prefix + "-" + Date.now();
}
