export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>古船模型帆索校准</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:68px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; } button.danger { background:var(--warn); }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; } .card { display:grid; gap:8px; align-content:start; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:90px; overflow:auto; } .warn { color:var(--warn); font-weight:700; }
    .task { border-top:1px dashed var(--line); padding-top:8px; display:grid; gap:6px; }
    .issue { border:1px solid var(--line); border-radius:6px; padding:8px; display:grid; gap:4px; background:#fafbf8; font-size:13px; }
    .issue button { padding:6px 10px; font-size:12px; justify-self:start; }
    .batch-row { border-top:1px solid var(--line); padding:8px 0; } .batch-row:first-child { border-top:0; }
    .hint { margin-top:8px; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header><div><h1>古船模型帆索校准</h1><div class="meta">模型、帆索任务、材料领退和校准记录串联</div></div><button id="reload">刷新</button></header>
  <main>
    <section>
      <form id="createForm"><h2>新增模型</h2><div id="fields"></div><label>初始状态</label><select name="status" id="statusSelect"></select><button>保存模型</button></form>
      <form id="actionForm" style="margin-top:14px"><h2>新增帆索任务</h2><label>选择模型</label><select name="id" id="itemSelect"></select><div id="extraFields"></div><button>提交记录</button></form>
      <form id="batchForm" style="margin-top:14px"><h2>新增材料批次</h2>
        <label>材料名称</label><input name="material" value="蜡线" required>
        <label>规格</label><input name="spec" placeholder="如 0.4mm 本色">
        <label>批次总长（米）</label><input name="totalLength" type="number" step="0.01" min="0.01" required>
        <label>有效期至</label><input name="expiryDate" type="date">
        <button>登记批次</button>
      </form>
      <form id="issueForm" style="margin-top:14px"><h2>材料领用</h2>
        <label>选择模型</label><select name="itemId" id="issueItemSelect"></select>
        <label>帆索任务</label><select name="taskId" id="issueTaskSelect"></select>
        <label>材料批次</label><select name="batchId" id="issueBatchSelect"></select>
        <label>申请编号</label><input name="requestNo" placeholder="如 LY-20260927-001" required>
        <label>领用长度（米）</label><input name="issuedLength" type="number" step="0.01" min="0.01" required>
        <button>登记领用</button>
        <div class="meta hint">同一申请编号重复提交只落一次；余量不足或批次过期会停在待处理并写明原因。</div>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="panel" style="margin-bottom:14px"><h2>批次库存</h2><div id="batchList"></div></div>
      <div class="toolbar"><select id="statusFilter"></select><input id="search" placeholder="搜索编号或关键词"></div>
      <div class="panel"><h2>创建模型后可拆分帆索任务，按任务领退蜡线并逐条记录松紧状态、调整备注和完成时间。</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script>
    const fields = [["code","模型编号","text"],["shipType","船型","text"],["scale","比例","text"],["mastCount","桅杆数量","number"],["riggingMaterial","帆索材料","text"],["owner","负责人","text"],["dueDate","交付日期","date"]];
    const stages = ["待检查","校准中","待复核","已交付"];
    const taskStages = ["待检查","调整中","已完成"];
    const extraFields = [["position","索具位置"],["tension","松紧状态"],["note","调整备注"]];
    const unsettledStatuses = ["待处理","已领用","退回核对"];
    const createForm = document.querySelector('#createForm');
    const actionForm = document.querySelector('#actionForm');
    const batchForm = document.querySelector('#batchForm');
    const issueForm = document.querySelector('#issueForm');
    const cards = document.querySelector('#cards');
    const statsEl = document.querySelector('#stats');
    const itemSelect = document.querySelector('#itemSelect');
    const issueItemSelect = document.querySelector('#issueItemSelect');
    const issueTaskSelect = document.querySelector('#issueTaskSelect');
    const issueBatchSelect = document.querySelector('#issueBatchSelect');
    const batchList = document.querySelector('#batchList');
    let items = [], batches = [], issues = [];
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }
    function renderForms() {
      document.querySelector('#fields').innerHTML = fields.map(([key,label,type]) => '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='code'?'required':'')+'>').join('');
      document.querySelector('#extraFields').innerHTML = extraFields.map(([key,label]) => '<label>'+label+'</label><input name="'+key+'">').join('');
      document.querySelector('#statusSelect').innerHTML = stages.map(s => '<option>'+s+'</option>').join('');
      document.querySelector('#statusFilter').innerHTML = '<option value="">全部状态</option>' + stages.map(s => '<option>'+s+'</option>').join('');
    }
    function renderSelects() {
      const opts = items.map(item => '<option value="'+(item.id || item.code)+'">'+(item.code || item.id)+' · '+(item.shipType || '')+'</option>').join('');
      itemSelect.innerHTML = opts;
      issueItemSelect.innerHTML = opts;
      renderTaskOptions();
      issueBatchSelect.innerHTML = batches.map(b => '<option value="'+b.id+'">'+b.id+' · '+b.material+(b.spec?' · '+b.spec:'')+' · 余'+b.remaining+b.unit+' · 至'+(b.expiryDate || '—')+(b.expired?'（已过期）':'')+'</option>').join('');
    }
    function renderTaskOptions() {
      const item = items.find(x => (x.id || x.code) === issueItemSelect.value);
      const tasks = (item && item.tasks) || [];
      issueTaskSelect.innerHTML = tasks.map(t => '<option value="'+t.id+'">'+t.id+' · '+(t.position || '')+' · '+t.status+'</option>').join('');
    }
    function render() {
      const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
      stats['未结领用'] = issues.filter(x => unsettledStatuses.includes(x.status)).length;
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
      batchList.innerHTML = batches.length ? batches.map(batchRow).join('') : '<div class="meta">暂无批次，请先登记。</div>';
      const status = document.querySelector('#statusFilter').value;
      const q = document.querySelector('#search').value.trim();
      const visible = items.filter(item => (!status || item.status === status) && (!q || JSON.stringify(item).includes(q)));
      cards.innerHTML = visible.map(cardHtml).join('');
      bindCardEvents();
    }
    function batchRow(b) {
      return '<div class="batch-row"><b>'+b.id+'</b> · '+b.material+(b.spec?' · '+b.spec:'')+'<div class="meta">剩余 '+b.remaining+' / '+b.totalLength+' '+b.unit+' · 有效期至 '+(b.expiryDate || '—')+(b.expired?' <span class="warn">已过期</span>':'')+'</div></div>';
    }
    function cardHtml(item) {
      const itemId = item.id || item.code;
      const main = fields.slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+(item[key] ?? '')+'</div>').join('');
      const tasks = (item.tasks || []).map(t => taskHtml(itemId, t)).join('');
      const logs = (item.logs || []).slice(-4).map(l => '<div>'+l.step+'：'+l.note+'</div>').join('');
      return '<article class="card"><h3>'+(item.code || item.id)+'</h3><span class="pill">'+item.status+'</span>'+main
        + (tasks || '<div class="meta">暂无帆索任务</div>')
        + '<label>状态</label><select data-status="'+itemId+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select>'
        + '<button class="secondary" data-note="'+itemId+'">追加备注</button><div class="logs meta">'+(logs || '暂无记录')+'</div></article>';
    }
    function taskHtml(itemId, t) {
      const rows = issues.filter(x => x.taskId === t.id).map(issueHtml).join('');
      return '<div class="task"><div><b>任务</b> '+(t.position || '')+' · '+(t.tension || '')+'</div>'
        + '<label>任务状态</label><select data-task="'+t.id+'" data-item="'+itemId+'">'+taskStages.map(s => '<option '+(s===t.status?'selected':'')+'>'+s+'</option>').join('')+'</select>'
        + (rows || '<div class="meta">暂无领用记录</div>') + '</div>';
    }
    function issueHtml(x) {
      let extra = '';
      if (x.actualUsage !== null && x.actualUsage !== undefined) extra += '<div class="meta">实际用量 '+x.actualUsage+x.unit+' · 剩余线头 '+x.leftover+x.unit+'</div>';
      if (x.reason) extra += '<div class="warn">'+x.reason+'</div>';
      let btns = '';
      if (x.status === '已领用' || x.status === '退回核对') btns += '<button class="secondary" data-settle="'+encodeURIComponent(x.requestNo)+'" data-issued="'+x.issuedLength+'" data-unit="'+x.unit+'">登记用量结算</button>';
      if (x.status === '待处理') btns += '<button class="danger" data-cancel="'+encodeURIComponent(x.requestNo)+'">撤销申请</button>';
      return '<div class="issue"><div><b>'+x.requestNo+'</b> · '+x.batchId+' · 领用 '+x.issuedLength+x.unit+' <span class="pill">'+x.status+'</span></div>'+extra+btns+'</div>';
    }
    function bindCardEvents() {
      document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => { try { await api('/api/items/'+encodeURIComponent(sel.dataset.status), { method:'PATCH', body: JSON.stringify({ status: sel.value }) }); } catch(e){ alert(e.message); } await load(); });
      document.querySelectorAll('[data-note]').forEach(btn => btn.onclick = async () => { const note = prompt('记录备注'); if (note) { try { await api('/api/items/'+encodeURIComponent(btn.dataset.note)+'/logs', { method:'POST', body: JSON.stringify({ step:'备注', note }) }); } catch(e){ alert(e.message); } await load(); } });
      document.querySelectorAll('[data-task]').forEach(sel => sel.onchange = async () => { try { await api('/api/items/'+encodeURIComponent(sel.dataset.item)+'/tasks/'+encodeURIComponent(sel.dataset.task), { method:'PATCH', body: JSON.stringify({ status: sel.value }) }); } catch(e){ alert(e.message); } await load(); });
      document.querySelectorAll('[data-settle]').forEach(btn => btn.onclick = async () => {
        const a = prompt('实际用量（'+btn.dataset.unit+'），本次领用 '+btn.dataset.issued+btn.dataset.unit);
        if (a === null) return;
        const l = prompt('剩余线头（'+btn.dataset.unit+'）');
        if (l === null) return;
        try {
          const issue = await api('/api/issues/'+btn.dataset.settle+'/settle', { method:'POST', body: JSON.stringify({ actualUsage:Number(a), leftover:Number(l) }) });
          if (issue.status === '退回核对') alert('已退回核对：'+issue.reason);
        } catch(e){ alert(e.message); }
        await load();
      });
      document.querySelectorAll('[data-cancel]').forEach(btn => btn.onclick = async () => {
        if (!confirm('撤销该待处理申请？')) return;
        try { await api('/api/issues/'+btn.dataset.cancel+'/cancel', { method:'POST', body: '{}' }); } catch(e){ alert(e.message); }
        await load();
      });
    }
    async function load() {
      items = await api('/api/items');
      batches = await api('/api/batches');
      issues = await api('/api/issues');
      renderSelects();
      render();
    }
    createForm.onsubmit = async event => { event.preventDefault(); try { await api('/api/items', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) }); createForm.reset(); } catch(e){ alert(e.message); } await load(); };
    actionForm.onsubmit = async event => { event.preventDefault(); try { await api('/api/items/'+encodeURIComponent(itemSelect.value)+'/action', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(actionForm).entries())) }); actionForm.reset(); } catch(e){ alert(e.message); } await load(); };
    batchForm.onsubmit = async event => { event.preventDefault(); try { await api('/api/batches', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(batchForm).entries())) }); batchForm.reset(); } catch(e){ alert(e.message); } await load(); };
    issueForm.onsubmit = async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(issueForm).entries());
      if (!data.taskId) { alert('该模型还没有帆索任务，请先新增任务'); return; }
      try {
        const res = await api('/api/items/'+encodeURIComponent(data.itemId)+'/tasks/'+encodeURIComponent(data.taskId)+'/issues', { method:'POST', body: JSON.stringify(data) });
        if (res.duplicated) alert('申请编号 '+data.requestNo+' 已登记过，未重复扣减');
        else if (res.issue.status === '待处理') alert('已停在待处理：'+res.issue.reason);
        issueForm.reset();
      } catch(e){ alert(e.message); }
      await load();
    };
    issueItemSelect.onchange = renderTaskOptions;
    document.querySelector('#statusFilter').onchange = render;
    document.querySelector('#search').oninput = render;
    document.querySelector('#reload').onclick = load;
    renderForms();
    load();
  </script>
</body>
</html>`;
}
