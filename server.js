import http from "node:http";
import { loadDb, saveDb, newId } from "./store.js";
import { page } from "./page.js";
import {
  summarize, computeStats, batchView, findItem, findTask,
  addBatch, createIssue, settleIssue, cancelIssue, changeTaskStatus
} from "./rules.js";

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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();
    if (req.method === "GET" && url.pathname === "/") return html(res, page());
    if (req.method === "GET" && url.pathname === "/api/items") return send(res, 200, db.items.map(summarize));
    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const item = { id: newId("MR"), ...input, logs: [{ at: new Date().toISOString(), step: "建档", note: "创建模型" }] };
      item.tasks = [];
      db.items.unshift(item);
      await saveDb(db);
      return send(res, 201, item);
    }
    if (req.method === "GET" && url.pathname === "/api/batches") return send(res, 200, db.batches.map(b => batchView(b)));
    if (req.method === "POST" && url.pathname === "/api/batches") {
      const batch = addBatch(db, await body(req));
      await saveDb(db);
      return send(res, 201, batch);
    }
    if (req.method === "GET" && url.pathname === "/api/issues") return send(res, 200, db.issues);
    const issueCreate = url.pathname.match(/^\/api\/items\/([^/]+)\/tasks\/([^/]+)\/issues$/);
    if (issueCreate && req.method === "POST") {
      const input = await body(req);
      const result = createIssue(db, { ...input, itemId: decodeURIComponent(issueCreate[1]), taskId: decodeURIComponent(issueCreate[2]) });
      if (!result.duplicated) await saveDb(db);
      return send(res, result.duplicated ? 200 : 201, result);
    }
    const settle = url.pathname.match(/^\/api\/issues\/([^/]+)\/settle$/);
    if (settle && req.method === "POST") {
      const issue = settleIssue(db, decodeURIComponent(settle[1]), await body(req));
      await saveDb(db);
      return send(res, 200, issue);
    }
    const cancel = url.pathname.match(/^\/api\/issues\/([^/]+)\/cancel$/);
    if (cancel && req.method === "POST") {
      const issue = cancelIssue(db, decodeURIComponent(cancel[1]));
      await saveDb(db);
      return send(res, 200, issue);
    }
    const taskPatch = url.pathname.match(/^\/api\/items\/([^/]+)\/tasks\/([^/]+)$/);
    if (taskPatch && req.method === "PATCH") {
      const item = findItem(db, decodeURIComponent(taskPatch[1]));
      const task = findTask(item, decodeURIComponent(taskPatch[2]));
      const input = await body(req);
      changeTaskStatus(db, item, task, input.status);
      await saveDb(db);
      return send(res, 200, task);
    }
    const patch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (patch && req.method === "PATCH") {
      const item = findItem(db, decodeURIComponent(patch[1]));
      Object.assign(item, await body(req));
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
      await saveDb(db);
      return send(res, 200, item);
    }
    const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (log && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(log[1]));
      const input = await body(req);
      item.logs ||= [];
      item.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
      await saveDb(db);
      return send(res, 201, item);
    }
    const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
    if (action && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(action[1]));
      const input = await body(req);
      item.logs ||= [];
      item.tasks ||= [];
      item.tasks.push({ id: "T-" + Date.now(), position: input.position, tension: input.tension, status: "待检查", logs: [{ at: new Date().toISOString(), note: input.note || "新增帆索任务" }] });
      item.status = "校准中";
      item.logs.push({ at: new Date().toISOString(), step: "帆索", note: input.position + " · " + input.tension });
      await saveDb(db);
      return send(res, 201, item);
    }
    if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, computeStats(db.items));
    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, error.status || 500, { error: error.message });
  }
});
server.listen(port, () => console.log("古船模型帆索校准 listening on http://localhost:" + port));
