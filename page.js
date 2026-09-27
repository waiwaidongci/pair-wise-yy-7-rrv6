// 页面层：帆索校准 + 材料领退的界面与浏览器端脚本
import { stages } from "./rules.js";

export function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>古船模型帆索校准</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --hold:#9a6a1f; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } main { display:grid; grid-template-columns:400px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    form + form { margin-top:14px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:68px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; } button.warn { background:var(--warn); } button.mini { padding:5px 9px; font-size:12px; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:12px; } .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .pill.hold { color:var(--hold); border-color:var(--hold); } .pill.warn { color:var(--warn); border-color:var(--warn); } .pill.done { color:var(--accent); border-color:var(--accent); }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:90px; overflow:auto; } .warn-text { color:var(--warn); font-weight:700; } .hold-text { color:var(--hold); }
    .task { border:1px solid var(--line); border-radius:6px; padding:10px; display:grid; gap:6px; background:#fafcf8; }
    .req { border-top:1px dashed var(--line); padding-top:6px; font-size:13px; display:grid; gap:4px; }
    .row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; } .row input { width:86px; padding:6px; }
    .batchline { display:flex; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px dashed var(--line); font-size:13px; }
    .expired { color:var(--warn); font-weight:700; } .low { color:var(--hold); font-weight:700; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header><div><h1>古船模型帆索校准</h1><div class="meta">帆索任务 → 批次领用 → 用量/线头结算，材料台账随校准流程闭环</div></div><button id="reload">刷新</button></header>
  <main>
    <section>
      <form id="createForm"><h2>新增模型</h2><div id="fields"></div><label>初始状态</label><select name="status">` + stages.map(s => "<option>" + s + "</option>").join("") + `</select><button>保存模型</button></form>
      <form id="taskForm"><h2>新增帆索任务</h2><label>选择模型</label><select name="itemId" id="taskItemSelect"></select><div id="extraFields"></div><button>提交任务</button></form>
      <form id="batchForm"><h2>新增材料批次</h2>
        <label>批次编号</label><input name="batchNo" placeholder="如 蜡线-2026-10" required>
        <label>材料</label><input name="material" value="蜡线">
        <div class="row"><div style="flex:1"><label>总长度(cm)</label><input name="totalLength" type="number" step="0.1" min="0" required></div><div style="flex:1"><label>失效日期</label><input name="expiryDate" type="date"></div></div>
        <button>登记批次</button>
      </form>
      <form id="reqForm"><h2>材料领用</h2>
        <label>帆索任务</label><select name="taskId" id="reqTaskSelect"></select>
        <label>申请编号（重复提交只落一次）</label><input name="requestNo" placeholder="如 SQ-20260927-01" required>
        <label>材料批次</label><select name="batchId" id="batchSelect"></select>
        <label>领用长度(cm)</label><input name="length" type="number" step="0.1" min="0" required>
        <button>登记领用</button>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>` + stages.map(s => "<option>" + s + "</option>").join("") + `</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div class="panel" style="margin-bottom:14px"><h2>材料批次台账</h2><div id="batches"></div></div>
      <div class="panel"><h2>帆索任务卡片</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script>
    const fields = [["code","模型编号","text"],["shipType","船型","text"],["scale","比例","text"],["mastCount","桅杆数量","number"],["riggingMaterial","帆索材料","text"],["owner","负责人","text"],["dueDate","交付日期","date"]];
    const stages = ["待检查","校准中","待复核","已交付"];
    const taskStatuses = ["待检查","调整中","已完成"];
    const extraFields = [["position","索具位置"],["tension","松紧状态"],["note","调整备注"]];
    let items = [], batches = [];
    const $ = s => document.querySelector(s);
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers: { "Content-Type": "application/json" } } : options);
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.reason || data.error || "请求失败"), { data });
      return data;
    }
    function esc(v) { return String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
    function renderForms() {
      $("#fields").innerHTML = fields.map(([key, label, type]) => '<label>' + label + '</label><input name="' + key + '" type="' + type + '" ' + (key === "code" ? "required" : "") + ">").join("");
      $("#extraFields").innerHTML = extraFields.map(([key, label]) => '<label>' + label + '</label><input name="' + key + '">').join("");
    }
    function itemRef(item) { return item.id || item.code; }
    function pill(status) {
      const cls = status === "待处理" ? "hold" : (status === "退回核对" ? "warn" : (status === "已结算" || status === "已完成" ? "done" : ""));
      return '<span class="pill ' + cls + '">' + esc(status) + "</span>";
    }
    function renderBatches() {
      $("#batches").innerHTML = batches.map(b => {
        const expired = b.expiryDate && b.expiryDate < new Date().toLocaleDateString("en-CA");
        const low = b.remainingLength < 100;
        return '<div class="batchline"><span>' + esc(b.batchNo) + " · " + esc(b.material) + (expired ? ' <span class="expired">已过期(' + esc(b.expiryDate) + ")</span>" : ' · 失效 ' + esc(b.expiryDate || "—")) + '</span><span class="' + (expired ? "expired" : (low ? "low" : "")) + '">余量 ' + b.remainingLength + " / " + b.totalLength + esc(b.unit) + "</span></div>";
      }).join("") || '<div class="meta">暂无批次</div>';
      $("#batchSelect").innerHTML = batches.map(b => {
        const expired = b.expiryDate && b.expiryDate < new Date().toLocaleDateString("en-CA");
        return '<option value="' + b.id + '">' + esc(b.batchNo) + " · 余量" + b.remainingLength + b.unit + (expired ? "（已过期）" : "") + "</option>";
      }).join("");
    }
    function renderSelectors() {
      $("#taskItemSelect").innerHTML = items.map(i => '<option value="' + esc(itemRef(i)) + '">' + esc(i.code) + " · " + esc(i.shipType) + "</option>").join("");
      const tasks = items.flatMap(i => (i.tasks || []).map(t => ({ i, t })));
      $("#reqTaskSelect").innerHTML = tasks.map(({ i, t }) => '<option value="' + esc(t.id) + '">' + esc(i.code) + " / " + esc(t.position) + " · " + esc(t.status) + "</option>").join("");
    }
    function reqHtml(r) {
      let body = '<div class="row"><span>' + pill(r.status) + '</span><b>' + esc(r.requestNo) + "</b><span class='meta'>" + esc(r.batchNo) + " · 领 " + r.length + esc(r.unit) + "</span></div>";
      if (r.status === "待处理") body += '<div class="warn-text">停在待处理：' + esc(r.reason) + "</div>";
      if (r.status === "已领用" || r.status === "退回核对") {
        body += '<div class="row"><input type="number" step="0.1" min="0" placeholder="实际用量" data-used="' + r.id + '" value="' + (r.usedLength == null ? "" : r.usedLength) + '"><input type="number" step="0.1" min="0" placeholder="剩余线头" data-left="' + r.id + '" value="' + (r.leftoverLength == null ? "" : r.leftoverLength) + '">'
          + '<button class="mini" data-settle="' + r.id + '">登记结算</button><button class="mini warn" data-return="' + r.id + '">退回核对</button></div>';
        if (r.status === "退回核对") body += '<div class="warn-text">退回原因：' + esc(r.returnReason) + "</div>";
      }
      if (r.status === "已结算") body += '<div class="meta">用量 ' + r.usedLength + esc(r.unit) + " · 线头 " + r.leftoverLength + esc(r.unit) + " · 差额 " + (r.difference || 0) + esc(r.unit) + "</div>";
      return '<div class="req">' + body + "</div>";
    }
    function taskHtml(item, t) {
      const reqs = t.requisitions || [];
      const open = reqs.filter(r => r.status === "已领用" || r.status === "退回核对").length;
      return '<div class="task"><div class="row"><b>' + esc(t.position) + "</b>" + pill(t.status)
        + '<select data-task-status="' + t.id + '" style="width:auto;padding:5px">' + taskStatuses.map(s => '<option ' + (s === t.status ? "selected" : "") + ">" + s + "</option>").join("") + "</select></div>"
        + '<div class="meta">松紧：' + esc(t.tension || "—") + (open ? ' · <span class="warn-text">' + open + " 笔未结领用，不能完成</span>" : "") + "</div>"
        + (reqs.length ? reqs.map(reqHtml).join("") : '<div class="meta">暂无材料领用</div>')
        + '<button class="mini secondary" data-task-note="' + t.id + '">追加任务备注</button></div>';
    }
    function cardHtml(item) {
      const main = fields.slice(0, 4).map(([key, label]) => "<div><b>" + label + "</b> " + esc(item[key] ?? "") + "</div>").join("");
      const logs = (item.logs || []).slice(-4).map(l => "<div>" + esc(l.step) + "：" + esc(l.note) + "</div>").join("");
      return '<article class="card"><h3>' + esc(item.code) + "</h3>" + pill(item.status) + main
        + (item.tasks || []).map(t => taskHtml(item, t)).join("")
        + '<label>模型状态</label><select data-item-status="' + esc(itemRef(item)) + '">' + stages.map(s => '<option ' + (s === item.status ? "selected" : "") + ">" + s + "</option>").join("") + "</select>"
        + '<button class="secondary" data-item-note="' + esc(itemRef(item)) + '">追加模型备注</button>'
        + '<div class="logs meta">' + (logs || "暂无记录") + "</div></article>";
    }
    function render() {
      renderBatches();
      renderSelectors();
      const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
      $("#stats").innerHTML = Object.entries(stats).map(([k, v]) => '<div class="stat"><span>' + k + "</span><strong>" + v + "</strong></div>").join("");
      const status = $("#statusFilter").value, q = $("#search").value.trim();
      const visible = items.filter(i => (!status || i.status === status) && (!q || JSON.stringify(i).includes(q)));
      $("#cards").innerHTML = visible.map(cardHtml).join("");
    }
    async function load() {
      const state = await api("/api/state");
      items = state.items; batches = state.batches;
      render();
    }
    $("#createForm").onsubmit = async e => { e.preventDefault(); await api("/api/items", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData($("#createForm")).entries())) }); $("#createForm").reset(); await load(); };
    $("#taskForm").onsubmit = async e => { e.preventDefault(); const data = Object.fromEntries(new FormData($("#taskForm")).entries()); await api("/api/items/" + data.itemId + "/tasks", { method: "POST", body: JSON.stringify(data) }); $("#taskForm").reset(); await load(); };
    $("#batchForm").onsubmit = async e => { e.preventDefault(); await api("/api/batches", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData($("#batchForm")).entries())) }); $("#batchForm").reset(); await load(); };
    $("#reqForm").onsubmit = async e => { e.preventDefault(); const data = Object.fromEntries(new FormData($("#reqForm")).entries()); try { const r = await api("/api/tasks/" + data.taskId + "/requisitions", { method: "POST", body: JSON.stringify(data) }); alert(r.duplicated ? "申请编号 " + data.requestNo + " 已登记，重复提交只落一次" : (r.requisition.status === "待处理" ? "停在待处理：" + r.requisition.reason : "材料已领用")); } catch (err) { alert(err.message); } $("#reqForm").reset(); await load(); };
    document.addEventListener("change", async e => {
      const sel = e.target;
      try {
        if (sel.dataset.itemStatus) { await api("/api/items/" + sel.dataset.itemStatus, { method: "PATCH", body: JSON.stringify({ status: sel.value }) }); await load(); }
        if (sel.dataset.taskStatus) { await api("/api/tasks/" + sel.dataset.taskStatus, { method: "PATCH", body: JSON.stringify({ status: sel.value }) }); await load(); }
      } catch (err) { alert(err.message); await load(); }
    });
    document.addEventListener("click", async e => {
      const btn = e.target;
      try {
        if (btn.dataset.itemNote) { const note = prompt("模型备注"); if (note) { await api("/api/items/" + btn.dataset.itemNote + "/logs", { method: "POST", body: JSON.stringify({ step: "备注", note }) }); await load(); } }
        else if (btn.dataset.taskNote) { const note = prompt("任务备注"); if (note) { await api("/api/tasks/" + btn.dataset.taskNote + "/notes", { method: "POST", body: JSON.stringify({ note }) }); await load(); } }
        else if (btn.dataset.settle) {
          const r = btn.dataset.settle;
          const payload = {
            usedLength: document.querySelector('[data-used="' + r + '"]').value,
            leftoverLength: document.querySelector('[data-left="' + r + '"]').value
          };
          try {
            await api("/api/requisitions/" + r + "/settle", { method: "POST", body: JSON.stringify(payload) });
          } catch (err) {
            if (err.data && (err.data.code === "settlement_out_of_range" || err.data.code === "usage_exceeds_request")) {
              if (!confirm("超范围，将退回核对：\\n" + (err.data.reason || "") + "\\n\\n确定退回？")) { await load(); return; }
              await api("/api/requisitions/" + r + "/return", { method: "POST", body: JSON.stringify({ ...payload, reason: err.data.reason }) });
            } else { throw err; }
          }
          await load();
        }
        else if (btn.dataset["return"]) {
          const r = btn.dataset["return"];
          const reason = prompt("退回核对原因", "实际用量与剩余线头合计超出允许范围");
          if (reason === null) return;
          await api("/api/requisitions/" + r + "/return", { method: "POST", body: JSON.stringify({
            usedLength: document.querySelector('[data-used="' + r + '"]').value,
            leftoverLength: document.querySelector('[data-left="' + r + '"]').value,
            reason
          }) });
          await load();
        }
      } catch (err) { alert(err.message); await load(); }
    });
    $("#statusFilter").onchange = render; $("#search").oninput = render; $("#reload").onclick = load;
    renderForms(); load();
  </script>
</body>
</html>`;
}
