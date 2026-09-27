// 存储层：JSON 文件读写、种子数据与基础查找
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "data", "model-rigging-calibration.json");
export const UNIT = "cm";

export function defaultBatches() {
  return [
    {
      id: "B-SEED-1",
      batchNo: "蜡线-2026-03",
      material: "蜡线",
      totalLength: 500,
      remainingLength: 500,
      unit: UNIT,
      expiryDate: "2027-03-31",
      createdAt: "2026-03-01T00:00:00.000Z"
    },
    {
      id: "B-SEED-2",
      batchNo: "蜡线-2026-07",
      material: "蜡线",
      totalLength: 80,
      remainingLength: 80,
      unit: UNIT,
      expiryDate: "2026-12-31",
      createdAt: "2026-07-05T00:00:00.000Z"
    },
    {
      id: "B-SEED-3",
      batchNo: "蜡线-2025-09",
      material: "蜡线",
      totalLength: 300,
      remainingLength: 120,
      unit: UNIT,
      expiryDate: "2026-05-31",
      createdAt: "2025-09-10T00:00:00.000Z"
    }
  ];
}

export const seed = {
  "batches": defaultBatches(),
  "requisitions": [],
  "items": [
    {
      "code": "MR-001",
      "shipType": "福船",
      "scale": "1:48",
      "mastCount": 3,
      "riggingMaterial": "蜡线",
      "owner": "周宁",
      "dueDate": "2026-06-28",
      "status": "校准中",
      "tasks": [
        {
          "id": "T-1",
          "position": "前桅侧支索",
          "tension": "偏松",
          "status": "调整中",
          "logs": [
            {
              "at": "2026-06-12",
              "note": "已缩短2mm"
            }
          ]
        }
      ],
      "logs": []
    }
  ]
};

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
    return JSON.parse(JSON.stringify(seed));
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  // 旧数据迁移：补齐批次与领用台账
  let migrated = false;
  if (!Array.isArray(db.batches)) { db.batches = defaultBatches(); migrated = true; }
  if (!Array.isArray(db.requisitions)) { db.requisitions = []; migrated = true; }
  if (migrated) await writeFile(dbPath, JSON.stringify(db, null, 2));
  return db;
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function findItem(db, idOrCode) {
  return db.items.find(x => x.id === idOrCode || x.code === idOrCode) || null;
}

export function findTask(db, taskId) {
  for (const item of db.items || []) {
    const task = (item.tasks || []).find(t => t.id === taskId);
    if (task) return { item, task };
  }
  return { item: null, task: null };
}

export function findRequisition(db, id) {
  return (db.requisitions || []).find(r => r.id === id) || null;
}

export function findBatch(db, id) {
  return (db.batches || []).find(b => b.id === id) || null;
}
