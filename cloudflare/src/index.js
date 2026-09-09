const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers },
});

function allowedOrigins(env) {
  return new Set(String(env.APP_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));
}

function cors(request, env) {
  const origin = request.headers.get("Origin");
  return allowedOrigins(env).has(origin) ? {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-allow-credentials": "true",
    "access-control-max-age": "86400",
    "vary": "Origin",
  } : {};
}

function response(value, request, env, status = 200) {
  return json(value, status, cors(request, env));
}

function reviewPage() {
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文化治理觀察站｜審核台</title><style>body{margin:0;background:#f4f1e8;color:#181914;font:16px system-ui,sans-serif}main{max-width:760px;margin:auto;padding:32px 20px}h1{font-size:clamp(2.2rem,9vw,5rem);margin:.2em 0}article{border:1px solid #bdb9ad;background:#fffdf8;padding:18px;margin:18px 0}label{display:block;margin:12px 0}input,select,textarea{box-sizing:border-box;width:100%;padding:9px;margin-top:4px;font:inherit}textarea{min-height:6em}button{padding:10px 14px;margin:8px 8px 0 0;font:inherit;cursor:pointer}button[data-status="approved"]{background:#e7f6c8}button[data-status="rejected"]{background:#f7d7d2}.handled{padding:10px 0;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;gap:12px}a{color:#243d73}</style><main><a href="https://daniel9202.github.io/culture-governance-observer/">← 回公開網站</a><p>REVIEW INBOX</p><h1>待審核收件匣</h1><p>AI 已預填分類與摘要；請核對來源後核准或退回。</p><p id="status">正在讀取審核資料…</p><button id="reload">重新整理</button> <strong id="count"></strong><div id="rows"></div><details><summary>已處理 <span id="handled-count">0 筆</span></summary><div id="handled"></div></details></main><script>const s=document.querySelector('#status'),r=document.querySelector('#rows'),h=document.querySelector('#handled'),c=document.querySelector('#count'),e=x=>String(x??'').replace(/[&<>"']/g,q=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[q])),f=(p,o={})=>fetch(p,{...o,headers:{...(o.body?{'Content-Type':'application/json'}:{}),...(o.headers||{})}});function card(x,done=false){let p=x.payload||{},n=p.candidate||x.subject_name||'',t=Array.isArray(p.topics)?p.topics.join(' | '):p.topics||'';if(done)return '<article class="handled"><strong>'+e(n)+'</strong><span>'+e(x.status==='approved'?'已核准':'已退回')+' · '+e(x.city||p.city||'')+'</span></article>';return '<article data-id="'+e(x.id)+'"><p>'+e(x.city||p.city||'')+' · '+e(x.published_date||p.published_date||'')+'</p><h2>'+e(n)+'</h2><a href="'+e(x.source_url||p.source_url)+'" target="_blank" rel="noreferrer">原始來源 ↗</a><form><label>候選人<input name="candidate" value="'+e(n)+'"></label><label>政黨<input name="party" value="'+e(p.party||'')+'"></label><label>職務<select name="office"><option '+(p.office==='縣市長'?'selected':'')+'>縣市長</option><option '+(String(p.office).includes('議員')?'selected':'')+'>縣市議員</option></select></label><label>縣市<input name="city" value="'+e(p.city||x.city||'')+'"></label><label>文化議題<input name="topics" value="'+e(t)+'"></label><label>摘要<textarea name="summary">'+e(p.summary||'')+'</textarea></label><button data-status="approved">核准並上架</button><button data-status="rejected">退回</button></form></article>'}async function load(){let q=await Promise.all(['pending','approved','rejected'].map(x=>f('/api/review/items?status='+x)));if(q.some(x=>!x.ok))throw Error('無法讀取資料');let [p,a,x]=await Promise.all(q.map(z=>z.json())),done=[...a.records,...x.records];c.textContent='待審 '+p.records.length+' 筆';r.innerHTML=p.records.map(card).join('')||'目前沒有待審資料。';h.innerHTML=done.map(z=>card(z,true)).join('')||'尚無已處理資料。';document.querySelector('#handled-count').textContent=done.length+' 筆';r.querySelectorAll('form').forEach(x=>x.onsubmit=save);s.textContent='可直接修正後核准。'}async function save(v){v.preventDefault();let b=v.submitter,z=Object.fromEntries(new FormData(v.currentTarget)),id=v.currentTarget.closest('[data-id]').dataset.id,payload={candidate:z.candidate,party:z.party,office:z.office,city:z.city,topics:z.topics.split('|').map(x=>x.trim()).filter(Boolean),summary:z.summary},q=await f('/api/review/items/'+id,{method:'PATCH',body:JSON.stringify({status:b.dataset.status,payload})});if(!q.ok){s.textContent='儲存失敗';return}load()}document.querySelector('#reload').onclick=()=>load().catch(x=>s.textContent=x.message);load().catch(x=>s.textContent=x.message);</script></html>`;
}

function reviewPageV2() {
  return `<!doctype html>
<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文化治理觀察站｜審核台</title>
<style>body{margin:0;background:#f4f1e8;color:#181914;font:16px system-ui,sans-serif}main{max-width:760px;margin:auto;padding:32px 20px}h1{font-size:clamp(2.2rem,9vw,5rem);margin:.2em 0}article{border:1px solid #bdb9ad;background:#fffdf8;padding:18px;margin:18px 0}label{display:block;margin:12px 0}input,select,textarea{box-sizing:border-box;width:100%;padding:9px;margin-top:4px;font:inherit}textarea{min-height:6em}button{padding:10px 14px;margin:8px 8px 0 0;font:inherit;cursor:pointer}button[data-status="approved"]{background:#e7f6c8}button[data-status="rejected"]{background:#f7d7d2}.handled{padding:10px 0;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;gap:12px}.kind{font:700 .76rem ui-monospace,monospace;color:#62665d}a{color:#243d73}</style>
<main><a href="https://daniel9202.github.io/culture-governance-observer/">← 回公開網站</a><p>REVIEW INBOX</p><h1>待審核收件匣</h1><p><strong>審核收件匣</strong>　<a href="/review/analytics">流量統計</a></p><p>候選人政見與民間文化訴求均在此核對、修正後上架。</p><label>資料類型<select id="kind-filter"><option value="">全部待審資料</option><option value="candidate">候選人政見</option><option value="civic_call">民間訴求</option></select></label><p id="status">正在讀取審核資料…</p><button id="reload">重新整理</button> <strong id="count"></strong><div id="rows"></div><details><summary>已處理 <span id="handled-count">0 筆</span></summary><div id="handled"></div></details></main>
<script>
const s=document.querySelector('#status'),r=document.querySelector('#rows'),h=document.querySelector('#handled'),c=document.querySelector('#count'),kindFilter=document.querySelector('#kind-filter'),savedPayloads=new Map,e=x=>String(x??'').replace(/[&<>"']/g,q=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[q])),f=(p,o={})=>fetch(p,{...o,headers:{...(o.body?{'Content-Type':'application/json'}:{}),...(o.headers||{})}});
const topics=p=>Array.isArray(p.topics)?p.topics.join(' | '):p.topics||'';
function kindName(kind){return kind==='civic_call'?'民間訴求':'候選人政見'}
function civicFields(p,x){return '<label>提出者<input name="proposer" value="'+e(p.proposer||x.subject_name||'')+'"></label><label>提出者類型<select name="proposer_type">'+['民間團體','公民團體','協會','聯盟','居民','文史工作者','其他'].map(v=>'<option '+(p.proposer_type===v?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label>縣市<input name="city" value="'+e(p.city||x.city||'')+'"></label><label>文化議題（以 | 分隔）<input name="topics" value="'+e(topics(p))+'"></label><label>摘要<textarea name="summary">'+e(p.summary||'')+'</textarea></label><label>具體政策訴求<textarea name="requested_action">'+e(p.requested_action||'')+'</textarea></label>'}
function candidateFields(p,x){return '<label>候選人<input name="candidate" value="'+e(p.candidate||x.subject_name||'')+'"></label><label>政黨<input name="party" value="'+e(p.party||'')+'"></label><label>職務<select name="office"><option '+(p.office==='縣市長'?'selected':'')+'>縣市長</option><option '+(String(p.office).includes('議員')?'selected':'')+'>縣市議員</option></select></label><label>縣市<input name="city" value="'+e(p.city||x.city||'')+'"></label><label>文化議題（以 | 分隔）<input name="topics" value="'+e(topics(p))+'"></label><label>摘要<textarea name="summary">'+e(p.summary||'')+'</textarea></label>'}
function card(x,done=false){let p=x.payload||{},name=x.kind==='civic_call'?(p.proposer||x.subject_name||''):(p.candidate||x.subject_name||'');if(done)return '<article class="handled"><strong>'+e(name)+'</strong><span>'+e(kindName(x.kind))+' · '+e(x.status==='approved'?'已核准':'已退回')+' · '+e(x.city||p.city||'')+'</span></article>';return '<article data-id="'+e(x.id)+'" data-kind="'+e(x.kind)+'"><p class="kind">'+e(kindName(x.kind))+' · '+e(x.city||p.city||'')+' · '+e(x.published_date||p.published_date||'')+'</p><h2>'+e(name)+'</h2><a href="'+e(x.source_url||p.source_url)+'" target="_blank" rel="noreferrer">原始來源 ↗</a><form>'+(x.kind==='civic_call'?civicFields(p,x):candidateFields(p,x))+'<button data-status="approved">核准並上架</button><button data-status="rejected">退回</button></form></article>'}
async function load(){let type=kindFilter.value,q=await Promise.all(['pending','approved','rejected'].map(status=>f('/api/review/items?status='+status+(type?'&kind='+type:''))));if(q.some(x=>!x.ok))throw Error('無法讀取資料');let [p,a,x]=await Promise.all(q.map(z=>z.json())),done=[...a.records,...x.records];savedPayloads.clear();p.records.forEach(item=>savedPayloads.set(item.id,item.payload||{}));c.textContent='待審 '+p.records.length+' 筆';r.innerHTML=p.records.map(card).join('')||'目前沒有待審資料。';h.innerHTML=done.map(z=>card(z,true)).join('')||'尚無已處理資料。';document.querySelector('#handled-count').textContent=done.length+' 筆';r.querySelectorAll('form').forEach(x=>x.onsubmit=save);s.textContent='可直接修正後核准。'}
async function save(event){event.preventDefault();let button=event.submitter,form=event.currentTarget,entry=form.closest('[data-id]'),fields=Object.fromEntries(new FormData(form)),payload={...(savedPayloads.get(entry.dataset.id)||{}),...fields,topics:fields.topics.split('|').map(x=>x.trim()).filter(Boolean)},result=await f('/api/review/items/'+entry.dataset.id,{method:'PATCH',body:JSON.stringify({status:button.dataset.status,payload})});if(!result.ok){s.textContent='儲存失敗';return}load()}
document.querySelector('#reload').onclick=()=>load().catch(x=>s.textContent=x.message);kindFilter.onchange=()=>load().catch(x=>s.textContent=x.message);load().catch(x=>s.textContent=x.message);
</script></html>`;
}

function analyticsPage() {
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文化治理觀察站｜流量統計</title>
<style>body{margin:0;background:#f4f1e8;color:#181914;font:16px system-ui,sans-serif}main{max-width:900px;margin:auto;padding:32px 20px}h1{font-size:clamp(2.2rem,9vw,5rem);margin:.2em 0}a{color:#243d73}.tabs{margin:20px 0}.tabs a,.tabs strong{display:inline-block;padding:9px 12px;border:1px solid #bdb9ad;background:#fffdf8}.tabs strong{background:#dce8c4}.summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:20px 0}.card{border:1px solid #bdb9ad;background:#fffdf8;padding:18px}.number{font-size:2rem;font-weight:700;margin:.2em 0}button{padding:9px 12px;margin-right:8px;font:inherit;cursor:pointer}.active{background:#dce8c4}table{width:100%;border-collapse:collapse;background:#fffdf8}th,td{text-align:left;padding:10px;border-bottom:1px solid #d7d3c7}th{font-size:.86rem}@media(max-width:500px){.summary{grid-template-columns:1fr}th,td{padding:8px 5px}}</style>
<main><a href="https://daniel9202.github.io/culture-governance-observer/">← 回公開網站</a><p>REVIEW INBOX</p><h1>流量統計</h1><nav class="tabs"><a href="/review">審核收件匣</a><strong>流量統計</strong></nav><p>僅統計頁面瀏覽與每日匿名訪客數，不記錄 IP、帳號或瀏覽內容。</p><p><button data-days="7">近 7 天</button><button class="active" data-days="30">近 30 天</button><button data-days="90">近 90 天</button></p><p id="status">正在讀取統計資料…</p><section class="summary"><article class="card"><div>頁面瀏覽</div><div id="views" class="number">—</div></article><article class="card"><div>不重複訪客</div><div id="visitors" class="number">—</div></article></section><h2>熱門頁面</h2><table><thead><tr><th>頁面</th><th>瀏覽</th><th>訪客</th></tr></thead><tbody id="pages"></tbody></table><h2>每日趨勢</h2><table><thead><tr><th>日期</th><th>瀏覽</th><th>訪客</th></tr></thead><tbody id="trend"></tbody></table></main>
<script>const n=x=>Number(x||0).toLocaleString('zh-TW'),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function load(days){document.querySelector('#status').textContent='正在讀取統計資料…';let r=await fetch('/api/review/analytics?days='+days);if(!r.ok)throw Error(r.status===401?'請先完成 Cloudflare Access 登入。':'無法讀取統計資料');let d=await r.json();document.querySelector('#views').textContent=n(d.totals.page_views);document.querySelector('#visitors').textContent=n(d.totals.visitors);document.querySelector('#pages').innerHTML=d.pages.map(x=>'<tr><td>'+esc(x.page_path)+'</td><td>'+n(x.page_views)+'</td><td>'+n(x.visitors)+'</td></tr>').join('')||'<tr><td colspan="3">尚無資料</td></tr>';document.querySelector('#trend').innerHTML=d.trend.map(x=>'<tr><td>'+esc(x.day)+'</td><td>'+n(x.page_views)+'</td><td>'+n(x.visitors)+'</td></tr>').join('')||'<tr><td colspan="3">尚無資料</td></tr>';document.querySelector('#status').textContent='統計已更新。'}document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-days]').forEach(x=>x.classList.remove('active'));b.classList.add('active');load(b.dataset.days).catch(e=>document.querySelector('#status').textContent=e.message)});load(30).catch(e=>document.querySelector('#status').textContent=e.message);</script></html>`;
}

function parsePayload(row) {
  return { ...row, payload: JSON.parse(row.payload) };
}

async function trafficSummary(env, days) {
  const since = `-${days - 1} days`;
  const [totals, trend, pages] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS page_views, COUNT(DISTINCT visitor_id) AS visitors FROM traffic_visits WHERE day >= DATE('now', ?)").bind(since).first(),
    env.DB.prepare("SELECT day, COUNT(*) AS page_views, COUNT(DISTINCT visitor_id) AS visitors FROM traffic_visits WHERE day >= DATE('now', ?) GROUP BY day ORDER BY day").bind(since).all(),
    env.DB.prepare("SELECT page_path, COUNT(*) AS page_views, COUNT(DISTINCT visitor_id) AS visitors FROM traffic_visits WHERE day >= DATE('now', ?) GROUP BY page_path ORDER BY page_views DESC LIMIT 10").bind(since).all(),
  ]);
  return { days, totals: { page_views: totals?.page_views || 0, visitors: totals?.visitors || 0 }, trend: trend.results || [], pages: pages.results || [] };
}

function emailFor(request, env) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email") || "";
  return env.ALLOWED_EMAIL && email.toLowerCase() === env.ALLOWED_EMAIL.toLowerCase() ? email : "";
}

function isIngestRequest(request, env) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(env.INGEST_TOKEN && token && token === env.INGEST_TOKEN);
}

function id() {
  return crypto.randomUUID();
}

async function body(request) {
  try { return await request.json(); } catch { throw new Error("請提供有效 JSON"); }
}

function itemFields(input) {
  const kind = input.kind === "civic_call" ? "civic_call" : "candidate";
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const sourceUrl = String(input.source_url || payload.source_url || "").trim();
  if (!/^https?:\/\//.test(sourceUrl)) throw new Error("來源網址必須是 http 或 https 網址");
  return {
    kind,
    city: String(input.city || payload.city || "").trim(),
    subjectName: String(input.subject_name || payload.candidate || payload.proposer || "").trim(),
    sourceUrl,
    sourceTitle: String(input.source_title || payload.source_title || "").trim(),
    publishedDate: String(input.published_date || payload.published_date || "").trim(),
    payload,
  };
}

async function log(env, itemId, action, actor, detail = {}) {
  await env.DB.prepare("INSERT INTO review_events (item_id, action, actor, detail) VALUES (?, ?, ?, ?)")
    .bind(itemId, action, actor, JSON.stringify(detail)).run();
}

async function publicCandidates(env) {
  const { results = [] } = await env.DB.prepare(
    "SELECT id, city, subject_name, source_url, source_title, published_date, payload, reviewer_note, reviewed_at FROM review_items WHERE status = 'approved' AND kind = 'candidate' ORDER BY reviewed_at DESC"
  ).all();
  return results.map(parsePayload).map(({ payload, ...row }) => ({ ...payload, review: { ...row } }));
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const reviewer = emailFor(request, env);
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(request, env) });
  if (path === "/api/health" && request.method === "GET") return response({ ok: true }, request, env);
  if (path === "/api/public/candidates" && request.method === "GET") return response({ records: await publicCandidates(env) }, request, env);

  if (path === "/api/review/items" && request.method === "POST") {
    if (!isIngestRequest(request, env) && !reviewer) return response({ error: "未授權寫入" }, request, env, 401);
    const fields = itemFields(await body(request));
    const existing = await env.DB.prepare("SELECT id FROM review_items WHERE source_url = ?").bind(fields.sourceUrl).first();
    if (existing) return response({ error: "此來源已在審核台中", id: existing.id }, request, env, 409);
    const itemId = id();
    await env.DB.prepare("INSERT INTO review_items (id, kind, city, subject_name, source_url, source_title, published_date, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(itemId, fields.kind, fields.city, fields.subjectName, fields.sourceUrl, fields.sourceTitle, fields.publishedDate, JSON.stringify(fields.payload)).run();
    await log(env, itemId, "created", reviewer || "research-importer", { kind: fields.kind });
    return response({ id: itemId, status: "pending" }, request, env, 201);
  }

  if (!reviewer) return response({ error: "此審核台需要 Cloudflare Access 登入" }, request, env, 401);

  if (path === "/api/review/analytics" && request.method === "GET") {
    const days = [7, 30, 90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;
    return response(await trafficSummary(env, days), request, env);
  }

  if (path === "/api/review/items" && request.method === "GET") {
    const status = ["pending", "approved", "rejected"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "pending";
    const kind = ["candidate", "civic_call"].includes(url.searchParams.get("kind")) ? url.searchParams.get("kind") : null;
    const query = kind
      ? env.DB.prepare("SELECT * FROM review_items WHERE status = ? AND kind = ? ORDER BY updated_at ASC").bind(status, kind)
      : env.DB.prepare("SELECT * FROM review_items WHERE status = ? ORDER BY updated_at ASC").bind(status);
    const { results = [] } = await query.all();
    return response({ records: results.map(parsePayload) }, request, env);
  }

  const match = path.match(/^\/api\/review\/items\/([\w-]+)$/);
  if (match && request.method === "PATCH") {
    const update = await body(request);
    const status = ["pending", "approved", "rejected"].includes(update.status) ? update.status : null;
    if (!status) return response({ error: "無效的審核狀態" }, request, env, 400);
    const previous = await env.DB.prepare("SELECT id, payload FROM review_items WHERE id = ?").bind(match[1]).first();
    if (!previous) return response({ error: "找不到這筆資料" }, request, env, 404);
    const payload = update.payload && typeof update.payload === "object" ? update.payload : JSON.parse(previous.payload);
    const note = String(update.reviewer_note || "").trim();
    await env.DB.prepare("UPDATE review_items SET status = ?, payload = ?, reviewer_note = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(status, JSON.stringify(payload), note, reviewer, match[1]).run();
    await log(env, match[1], status, reviewer, { note });
    return response({ id: match[1], status }, request, env);
  }
  return response({ error: "找不到 API 路徑" }, request, env, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/review") return new Response(reviewPageV2(), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.pathname === "/review/analytics") return new Response(analyticsPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return new Response("文化治理觀察站審核 API 已啟動。", { headers: { "content-type": "text/plain; charset=utf-8" } });
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "伺服器錯誤" }, request, env, 500);
    }
  },
};
