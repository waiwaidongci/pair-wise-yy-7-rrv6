// 规则层：材料领退与帆索校准的业务规则（纯函数，不碰文件）
import { findBatch, findItem, findRequisition, findTask, UNIT } from "./store.js";

export const stages = ["待检查", "校准中", "待复核", "已交付"];
export const TASK_PENDING = "待检查";
export const TASK_ADJUSTING = "调整中";
export const TASK_COMPLETED = "已完成";
export const taskStatuses = [TASK_PENDING, TASK_ADJUSTING, TASK_COMPLETED];

export const REQ_PENDING = "待处理";   // 余量不足或批次过期，停在待处理
export const REQ_ISSUED = "已领用";    // 已发料，等待结算
export const REQ_SETTLED = "已结算";   // 实际用量与剩余线头已登记
export const REQ_RETURNED = "退回核对"; // 用量超范围
// 未结状态：未结清的领用会阻止任务完成
export const OPEN_REQ_STATUSES = [REQ_ISSUED, REQ_RETURNED];

export const EPSILON = 0.01; // 用量+剩余允许的剪线损耗（cm）
export const fields = [["code", "模型编号", "text"], ["shipType", "船型", "text"], ["scale", "比例", "text"], ["mastCount", "桅杆数量", "number"], ["riggingMaterial", "帆索材料", "text"], ["owner", "负责人", "text"], ["dueDate", "交付日期", "date"]];

export function ok(status, code, data) { return { ok: true, status, code, ...data }; }
export function fail(status, code, error, reason, extra = {}) {
  return { ok: false, status, code, error, ...(reason ? { reason } : {}), ...extra };
}

function nowIso(now) { return (now || new Date()).toISOString(); }
function localDate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function isBatchExpired(batch, today = localDate()) {
  return !!batch.expiryDate && batch.expiryDate < today;
}
function positiveLength(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function pushTaskLog(task, at, note) {
  task.logs ||= [];
  task.logs.push({ at, note });
}
function pushItemLog(item, at, step, note) {
  item.logs ||= [];
  item.logs.push({ at, step, note });
}

// 新增帆索任务
export function createTask(db, itemId, input = {}, now) {
  const item = findItem(db, itemId);
  if (!item) return fail(404, "item_not_found", "模型不存在");
  const position = String(input.position || "").trim();
  if (!position) return fail(400, "position_required", "索具位置不能为空");
  const at = nowIso(now);
  const task = {
    id: "T-" + Date.now() + "-" + Math.floor(Math.random() * 900 + 100),
    position,
    tension: String(input.tension || "").trim(),
    status: TASK_PENDING,
    logs: [{ at, note: input.note ? String(input.note) : "新增帆索任务" }]
  };
  item.tasks ||= [];
  item.tasks.push(task);
  item.status = "校准中";
  pushItemLog(item, at, "帆索", `新增任务 ${position}（${task.id}）`);
  return ok(201, "task_created", { item, task });
}

// 新增材料批次
export function createBatch(db, input = {}, now) {
  const batchNo = String(input.batchNo || "").trim();
  if (!batchNo) return fail(400, "batch_no_required", "批次编号不能为空");
  const total = positiveLength(input.totalLength);
  if (total === null) return fail(400, "invalid_length", "批次总量必须为正数");
  if (input.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.expiryDate))) {
    return fail(400, "invalid_expiry", "失效日期格式应为 YYYY-MM-DD");
  }
  if ((db.batches || []).some(b => b.batchNo === batchNo)) {
    return fail(409, "batch_no_duplicate", "批次编号已存在");
  }
  const batch = {
    id: "B-" + Date.now() + "-" + Math.floor(Math.random() * 900 + 100),
    batchNo,
    material: String(input.material || "蜡线").trim() || "蜡线",
    totalLength: total,
    remainingLength: total,
    unit: UNIT,
    expiryDate: input.expiryDate ? String(input.expiryDate) : "",
    createdAt: nowIso(now)
  };
  db.batches ||= [];
  db.batches.push(batch);
  return ok(201, "batch_created", { batch });
}

// 按帆索任务领用材料：登记批次与领用长度，同一申请编号只落一次
export function submitRequisition(db, taskId, input = {}, now) {
  const { item, task } = findTask(db, taskId);
  if (!task) return fail(404, "task_not_found", "帆索任务不存在");
  const requestNo = String(input.requestNo || "").trim();
  if (!requestNo) return fail(400, "request_no_required", "申请编号不能为空");

  db.requisitions ||= [];
  const existing = db.requisitions.find(r => r.requestNo === requestNo);
  if (existing) {
    // 同一申请编号重复提交：原样返回，不再落账
    return ok(200, "duplicate_request", { requisition: existing, duplicated: true });
  }

  const batch = findBatch(db, input.batchId);
  if (!batch) return fail(404, "batch_not_found", "材料批次不存在");
  const length = positiveLength(input.length);
  if (length === null) return fail(400, "invalid_length", "领用长度必须为正数");

  const base = {
    id: "RQ-" + Date.now() + "-" + Math.floor(Math.random() * 900 + 100),
    requestNo,
    taskId: task.id,
    itemCode: item.code || item.id,
    position: task.position,
    batchId: batch.id,
    batchNo: batch.batchNo,
    material: batch.material,
    length,
    unit: batch.unit || UNIT,
    createdAt: nowIso(now)
  };

  const reasons = [];
  if (batch.material !== item.riggingMaterial) {
    reasons.push(`批次材料「${batch.material}」与本任务帆索材料「${item.riggingMaterial}」不符`);
  }
  if (isBatchExpired(batch)) reasons.push(`批次 ${batch.batchNo} 已于 ${batch.expiryDate} 过期`);
  if (batch.remainingLength + EPSILON < length) {
    reasons.push(`批次 ${batch.batchNo} 余量 ${batch.remainingLength}${batch.unit || UNIT}，不足领用 ${length}${batch.unit || UNIT}`);
  }
  if (reasons.length) {
    // 停在待处理并写明原因，不扣减批次余量
    const requisition = { ...base, status: REQ_PENDING, reason: reasons.join("；"), logs: [{ at: base.createdAt, step: "申请", note: reasons.join("；") }] };
    db.requisitions.push(requisition);
    pushTaskLog(task, base.createdAt, `材料领用待处理（${requestNo}）：${reasons.join("；")}`);
    return ok(202, "requisition_pending", { requisition, pending: true });
  }

  // 发料：扣减批次余量
  batch.remainingLength = Number((batch.remainingLength - length).toFixed(2));
  const requisition = {
    ...base,
    status: REQ_ISSUED,
    issuedAt: base.createdAt,
    usedLength: null,
    leftoverLength: null,
    settledAt: null,
    logs: [{ at: base.createdAt, step: "领用", note: `从批次 ${batch.batchNo} 领用 ${length}${batch.unit || UNIT}` }]
  };
  db.requisitions.push(requisition);
  pushTaskLog(task, base.createdAt, `材料已领用（${requestNo}）：批次 ${batch.batchNo}，${length}${batch.unit || UNIT}`);
  if (task.status === TASK_PENDING) task.status = TASK_ADJUSTING;
  return ok(201, "requisition_issued", { requisition });
}

// 调整结束：登记实际用量与剩余线头，超范围退回核对
export function settleRequisition(db, reqId, input = {}, now) {
  const requisition = findRequisition(db, reqId);
  if (!requisition) return fail(404, "requisition_not_found", "领用记录不存在");
  if (requisition.status === REQ_SETTLED) return fail(409, "already_settled", "该领用已结算", null, { requisition });

  const used = nonNegative(input.usedLength);
  if (used === null) return fail(400, "invalid_used_length", "实际用量必须为非负数");
  const leftover = nonNegative(input.leftoverLength);
  if (leftover === null) return fail(400, "invalid_leftover_length", "剩余线头必须为非负数");
  if (used > requisition.length + EPSILON) {
    return fail(422, "usage_exceeds_request", "实际用量超范围", `实际用量 ${used}${requisition.unit} 超过领用长度 ${requisition.length}${requisition.unit}`, { usedLength: used, leftoverLength: leftover });
  }
  const diff = Number((requisition.length - used - leftover).toFixed(2));
  if (Math.abs(diff) > EPSILON) {
    return fail(422, "settlement_out_of_range", "用量超范围，退回核对",
      `领用 ${requisition.length}${requisition.unit}，实际用量 ${used}${requisition.unit}、剩余线头 ${leftover}${requisition.unit}，差额 ${diff}${requisition.unit}（允许剪线损耗 ${EPSILON}${requisition.unit}）`,
      { usedLength: used, leftoverLength: leftover, difference: diff });
  }

  const at = nowIso(now);
  const batch = findBatch(db, requisition.batchId);
  if (batch) batch.remainingLength = Number((batch.remainingLength + leftover).toFixed(2));
  Object.assign(requisition, {
    status: REQ_SETTLED,
    usedLength: used,
    leftoverLength: leftover,
    difference: diff,
    settledAt: at
  });
  requisition.logs ||= [];
  requisition.logs.push({ at, step: "结算", note: `实际用量 ${used}${requisition.unit}，剩余线头 ${leftover}${requisition.unit}` });

  const { task } = findTask(db, requisition.taskId);
  if (task) pushTaskLog(task, at, `材料结算（${requisition.requestNo}）：用量 ${used}${requisition.unit}，线头 ${leftover}${requisition.unit}`);
  return ok(200, "requisition_settled", { requisition });
}

// 退回核对落账（页面/客户端在超范围时调用，保留核对痕迹）
export function returnRequisition(db, reqId, input = {}, now) {
  const requisition = findRequisition(db, reqId);
  if (!requisition) return fail(404, "requisition_not_found", "领用记录不存在");
  if (requisition.status === REQ_SETTLED) return fail(409, "already_settled", "该领用已结算", null, { requisition });
  const used = nonNegative(input.usedLength);
  const leftover = nonNegative(input.leftoverLength);
  const at = nowIso(now);
  const reason = String(input.reason || "实际用量与剩余线头合计超出允许范围").trim();
  Object.assign(requisition, {
    status: REQ_RETURNED,
    usedLength: used === null ? null : used,
    leftoverLength: leftover === null ? null : leftover,
    returnedAt: at,
    returnReason: reason
  });
  requisition.logs ||= [];
  requisition.logs.push({ at, step: "退回", note: reason });
  const { task } = findTask(db, requisition.taskId);
  if (task) pushTaskLog(task, at, `材料退回核对（${requisition.requestNo}）：${reason}`);
  return ok(200, "requisition_returned", { requisition });
}

// 未结领用不能确认任务完成
export function updateTaskStatus(db, taskId, input = {}, now) {
  const { item, task } = findTask(db, taskId);
  if (!task) return fail(404, "task_not_found", "帆索任务不存在");
  const next = String(input.status || "").trim();
  const at = nowIso(now);

  if (input.note) pushTaskLog(task, at, String(input.note));

  if (next && next !== task.status) {
    if (!taskStatuses.includes(next)) return fail(400, "invalid_task_status", `任务状态只能是：${taskStatuses.join("、")}`);
    if (next === TASK_COMPLETED) {
      const open = (db.requisitions || []).filter(r => r.taskId === task.id && OPEN_REQ_STATUSES.includes(r.status));
      if (open.length) {
        const detail = open.map(r => `${r.requestNo}（${r.status}）`).join("、");
        return fail(409, "open_requisition_block", "存在未结领用，不能确认任务完成",
          `任务「${task.position}」有 ${open.length} 笔未结领用：${detail}`, { openCount: open.length });
      }
    }
    task.status = next;
    pushTaskLog(task, at, `任务状态更新为「${next}」`);
    pushItemLog(item, at, "任务", `${task.position} → ${next}`);
  }
  return ok(200, "task_updated", { item, task });
}

export function requisitionsForTask(db, taskId) {
  return (db.requisitions || []).filter(r => r.taskId === taskId);
}

export function summarizeItem(db, item) {
  const logCount = (item.logs || []).length + (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  const tasks = (item.tasks || []).map(t => {
    const requisitions = requisitionsForTask(db, t.id);
    return {
      ...t,
      requisitions,
      openRequisitionCount: requisitions.filter(r => OPEN_REQ_STATUSES.includes(r.status)).length,
      pendingRequisitionCount: requisitions.filter(r => r.status === REQ_PENDING).length
    };
  });
  return { ...item, tasks, logCount };
}

export function computeStats(items) {
  const stats = Object.fromEntries(stages.map(label => [label, 0]));
  for (const item of items) if (stats[item.status] !== undefined) stats[item.status] += 1;
  return stats;
}
