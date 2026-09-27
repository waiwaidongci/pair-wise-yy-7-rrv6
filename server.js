import http from "node:http";

import { findItem, loadDb, saveDb, dbPath } from "./store.js";
import {
  computeStats, createBatch, createTask, returnRequisition, settleRequisition,
  submitRequisition, summarizeItem, updateTaskStatus
} from "./rules.js";
import { renderPage } from "./page.js";

const port = Number(process.env.PORT || 3038);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}
function newId() { return "MR-" + Date.now(); }

// 把规则层结果映射到 HTTP 响应；规则返回 ok:true 时由调用方持久化
function apply(res, result, db, persist) {
  if (!result.ok) return send(res, result.status, { error: result.error, code: result.code, reason: result.reason });
  if (persist !== false) return saveDb(db).then(() => send(res, result.status, result));
  return send(res, result.status, result);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();

    if (req.method === "GET" && url.pathname === "/") return html(res, renderPage());

    if (req.method === "GET" && url.pathname === "/api/state") {
      return send(res, 200, { items: db.items.map(i => summarizeItem(db, i)), batches: db.batches, requisitions: db.requisitions });
    }
    if (req.method === "GET" && url.pathname === "/api/items") {
      return send(res, 200, db.items.map(i => summarizeItem(db, i)));
    }
    if (req.method === "GET" && url.pathname === "/api/batches") return send(res, 200, db.batches);
    if (req.method === "GET" && url.pathname === "/api/requisitions") return send(res, 200, db.requisitions);
    if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, computeStats(db.items));

    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const item = { id: newId(), ...input, tasks: [], logs: [{ at: new Date().toISOString(), step: "建档", note: "创建模型" }] };
      db.items.unshift(item);
      await saveDb(db);
      return send(res, 201, item);
    }

    if (req.method === "POST" && url.pathname === "/api/batches") {
      const result = createBatch(db, await body(req));
      return apply(res, result, db);
    }

    // 某模型下新增帆索任务
    const tasksCreate = url.pathname.match(/^\/api\/items\/([^/]+)\/tasks$/);
    if (tasksCreate && req.method === "POST") {
      const result = createTask(db, tasksCreate[1], await body(req));
      return apply(res, result, db);
    }

    // 某帆索任务下登记材料领用
    const requisitionCreate = url.pathname.match(/^\/api\/tasks\/([^/]+)\/requisitions$/);
    if (requisitionCreate && req.method === "POST") {
      const result = submitRequisition(db, requisitionCreate[1], await body(req));
      // 待处理/重复提交也都已落账或命中既有记录，统一持久化
      return apply(res, result, db);
    }

    // 领用结算：登记实际用量与剩余线头
    const settle = url.pathname.match(/^\/api\/requisitions\/([^/]+)\/settle$/);
    if (settle && req.method === "POST") {
      const result = settleRequisition(db, settle[1], await body(req));
      return apply(res, result, db);
    }

    // 超范围退回核对
    const returned = url.pathname.match(/^\/api\/requisitions\/([^/]+)\/return$/);
    if (returned && req.method === "POST") {
      const result = returnRequisition(db, returned[1], await body(req));
      return apply(res, result, db);
    }

    // 任务状态（完成时校验未结领用）与任务备注
    const taskPatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskPatch && req.method === "PATCH") {
      const result = updateTaskStatus(db, taskPatch[1], await body(req));
      return apply(res, result, db);
    }
    const taskNote = url.pathname.match(/^\/api\/tasks\/([^/]+)\/notes$/);
    if (taskNote && req.method === "POST") {
      const result = updateTaskStatus(db, taskNote[1], { note: (await body(req)).note });
      return apply(res, result, db);
    }

    const itemPatch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemPatch && req.method === "PATCH") {
      const item = findItem(db, itemPatch[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      Object.assign(item, await body(req));
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
      await saveDb(db);
      return send(res, 200, item);
    }
    const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (log && req.method === "POST") {
      const item = findItem(db, log[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
      await saveDb(db);
      return send(res, 201, item);
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log(`古船模型帆索校准 listening on http://localhost:${port}，数据 ${dbPath}`));
