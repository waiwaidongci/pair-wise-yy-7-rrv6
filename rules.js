// 业务规则：帆索任务的材料领退、结算与任务完成校验
export const stages = ["待检查", "校准中", "待复核", "已交付"];
export const taskStages = ["待检查", "调整中", "已完成"];
// 未结领用：申请还挂着、账目未对清的状态
export const unsettledStatuses = ["待处理", "已领用", "退回核对"];
// 结算允许误差（米）：实际用量 + 剩余线头 与 领用长度 的差值上限
export const SETTLE_TOLERANCE = 0.1;

export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function now() { return new Date().toISOString(); }
function today() { return now().slice(0, 10); }
function round3(n) { return Math.round(n * 1000) / 1000; }

function toLength(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail(400, label + "必须是非负数字");
  return round3(n);
}

export function findItem(db, id) {
  const item = db.items.find(x => x.id === id || x.code === id);
  if (!item) fail(404, "模型不存在");
  return item;
}

export function findTask(item, taskId) {
  const task = (item.tasks || []).find(t => t.id === taskId);
  if (!task) fail(404, "帆索任务不存在");
  return task;
}

export function findBatch(db, batchId) {
  const batch = db.batches.find(b => b.id === batchId);
  if (!batch) fail(404, "材料批次不存在");
  return batch;
}

export function isBatchExpired(batch, day = today()) {
  return Boolean(batch.expiryDate) && batch.expiryDate < day;
}

export function batchView(batch, day = today()) {
  return { ...batch, expired: isBatchExpired(batch, day) };
}

export function addBatch(db, input) {
  if (!String(input.material || "").trim()) fail(400, "材料名称必填");
  const totalLength = toLength(input.totalLength, "批次总长");
  if (totalLength <= 0) fail(400, "批次总长必须大于0");
  const batch = {
    id: "B-" + Date.now(),
    material: String(input.material).trim(),
    spec: String(input.spec || "").trim(),
    totalLength,
    remaining: totalLength,
    unit: String(input.unit || "米"),
    expiryDate: input.expiryDate || "",
    createdAt: now()
  };
  db.batches.unshift(batch);
  return batch;
}

// 材料领用：同一申请编号只落一次；余量不足或批次过期停在待处理并写明原因
export function createIssue(db, input, day = today()) {
  const requestNo = String(input.requestNo || "").trim();
  if (!requestNo) fail(400, "申请编号必填");
  const existing = db.issues.find(x => x.requestNo === requestNo);
  if (existing) return { issue: existing, duplicated: true };
  const item = findItem(db, input.itemId);
  const task = findTask(item, input.taskId);
  if (task.status === "已完成") fail(409, "任务已完成，不能再登记领用");
  const batch = findBatch(db, input.batchId);
  const issuedLength = toLength(input.issuedLength, "领用长度");
  if (issuedLength <= 0) fail(400, "领用长度必须大于0");
  const issue = {
    requestNo,
    itemId: item.id || item.code,
    taskId: task.id,
    batchId: batch.id,
    material: batch.material,
    spec: batch.spec,
    issuedLength,
    unit: batch.unit || "米",
    status: "已领用",
    reason: "",
    actualUsage: null,
    leftover: null,
    createdAt: now(),
    settledAt: null
  };
  if (isBatchExpired(batch, day)) {
    issue.status = "待处理";
    issue.reason = "批次已过期（有效期至" + batch.expiryDate + "）";
  } else if (issuedLength > batch.remaining) {
    issue.status = "待处理";
    issue.reason = "余量不足（剩余" + batch.remaining + issue.unit + "，申请" + issuedLength + issue.unit + "）";
  } else {
    batch.remaining = round3(batch.remaining - issuedLength);
  }
  db.issues.unshift(issue);
  task.logs ||= [];
  task.logs.push({ at: now(), note: "领用申请" + requestNo + "：" + issue.status + (issue.reason ? " · " + issue.reason : " · " + batch.id + " " + issuedLength + issue.unit) });
  item.logs ||= [];
  item.logs.push({ at: now(), step: "领料", note: task.position + " · " + requestNo + " · " + issue.status });
  return { issue, duplicated: false };
}

// 调整结束结算：登记实际用量和剩余线头，超范围退回核对，线头退回批次库存
export function settleIssue(db, requestNo, input) {
  const issue = db.issues.find(x => x.requestNo === requestNo);
  if (!issue) fail(404, "领用申请不存在");
  if (issue.status !== "已领用" && issue.status !== "退回核对") fail(409, "当前状态（" + issue.status + "）不能结算");
  const actualUsage = toLength(input.actualUsage, "实际用量");
  const leftover = toLength(input.leftover, "剩余线头");
  issue.actualUsage = actualUsage;
  issue.leftover = leftover;
  const diff = round3(issue.issuedLength - actualUsage - leftover);
  if (Math.abs(diff) > SETTLE_TOLERANCE) {
    issue.status = "退回核对";
    issue.reason = "超范围：领用" + issue.issuedLength + issue.unit + "，实报用量" + actualUsage + "＋线头" + leftover + "，差" + diff + issue.unit;
  } else {
    issue.status = "已结算";
    issue.reason = "";
    issue.settledAt = now();
    const batch = db.batches.find(b => b.id === issue.batchId);
    if (batch) batch.remaining = round3(batch.remaining + leftover);
  }
  const item = db.items.find(x => (x.id || x.code) === issue.itemId);
  if (item) {
    item.logs ||= [];
    item.logs.push({ at: now(), step: "退料结算", note: requestNo + " · " + issue.status + (issue.reason ? " · " + issue.reason : "") });
    const task = (item.tasks || []).find(t => t.id === issue.taskId);
    if (task) {
      task.logs ||= [];
      task.logs.push({ at: now(), note: "结算" + requestNo + "：" + issue.status });
    }
  }
  return issue;
}

// 待处理申请可撤销（未扣库存，直接作废）；已领用的请走结算退料
export function cancelIssue(db, requestNo) {
  const issue = db.issues.find(x => x.requestNo === requestNo);
  if (!issue) fail(404, "领用申请不存在");
  if (issue.status !== "待处理") fail(409, "仅待处理申请可撤销，当前状态：" + issue.status);
  issue.status = "已撤销";
  return issue;
}

export function unsettledIssues(db, taskId) {
  return db.issues.filter(x => x.taskId === taskId && unsettledStatuses.includes(x.status));
}

// 未结领用不能确认任务完成
export function changeTaskStatus(db, item, task, status) {
  if (!taskStages.includes(status)) fail(400, "未知任务状态：" + status);
  if (status === "已完成") {
    const open = unsettledIssues(db, task.id);
    if (open.length) fail(409, "存在未结领用，不能确认完成：" + open.map(x => x.requestNo + "（" + x.status + "）").join("、"));
  }
  task.status = status;
  task.logs ||= [];
  task.logs.push({ at: now(), note: "状态更新为" + status });
  item.logs ||= [];
  item.logs.push({ at: now(), step: "帆索", note: task.position + " 状态更新为" + status });
  return task;
}

export function computeStats(items) {
  const stats = Object.fromEntries(stages.map(label => [label, 0]));
  for (const item of items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
  }
  return stats;
}

export function summarize(item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount };
}
