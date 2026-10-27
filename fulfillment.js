const statusLabels={fulfilled:'已實現',partial:'部分實現',in_progress:'執行中',no_verified_progress:'未找到可驗證進度',not_assessable:'不適合評估',not_checked:'尚未查核'};let records=[],mayorGov=[];
// 欄位契約（2026-10-28）：pledge_nature 為政見原文性質；related_records 指向 candidates.csv 的現任首長施政 id，build 後可能是陣列或以 | 分隔的字串。
const relatedIds=pledge=>(Array.isArray(pledge.related_records)?pledge.related_records:String(pledge.related_records||'').split('|')).map(id=>String(id).trim()).filter(Boolean);
const govAnchor=id=>`record-${String(id).replace(/[^\w-]/g,'_')}`;
const isMayorRecord=record=>['縣市長','縣轄市長'].includes(record.office);
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeUrl=url=>{try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'#'}catch{return '#'}};
const optionValues=(key,el)=>{[...new Set(records.map(x=>x[key]).filter(Boolean))].sort(key==='city'?(a,b)=>cityRank(a)-cityRank(b):undefined).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=key==='status'?statusLabels[v]:v;el.append(o)})};
const byCity=(a,b)=>cityRank(a.city)-cityRank(b.city)||String(a.person).localeCompare(String(b.person),'zh-Hant')||String(a.pledge_date).localeCompare(String(b.pledge_date));
const groupBy=(rows,key)=>rows.reduce((groups,row)=>{const value=key(row),group=groups.find(item=>item.key===value);(group||groups[groups.push({key:value,rows:[]})-1]).rows.push(row);return groups},[]);

const relatedGovList=pledge=>{
  const related=relatedIds(pledge).map(id=>mayorGov.find(record=>record.id===id)).filter(Boolean);
  return related.length?`<div class="policy-layer pledge-related"><h4>任內相關施政</h4><ul>${related.map(record=>`<li><a href="#${govAnchor(record.id)}">${escapeHtml(record.policy_title||record.summary)}</a></li>`).join('')}</ul></div>`:'';
};
const pledgeCard=pledge=>{
  const unchecked=pledge.status==='not_checked';
  return `<article class="card pledge-card">
  <div class="card-meta"><span class="tag tag-status status-${escapeHtml(pledge.status)}">${escapeHtml(statusLabels[pledge.status]||'')}</span>${pledge.pledge_source_type?`<span class="tag tag-source">${escapeHtml(pledge.pledge_source_type)}</span>`:''}${pledge.pledge_nature?`<span class="tag tag-nature">${escapeHtml(pledge.pledge_nature)}</span>`:''}${topicTagList(pledge).map(topic=>`<span class="tag">${escapeHtml(topic)}</span>`).join('')}</div>
  <h4>${escapeHtml(pledge.pledge_title)}</h4>
  <p class="summary">${escapeHtml(pledge.pledge_summary)}</p>
  <div class="policy-layer policy-actions"><h4>查核判斷</h4>${pledge.pledge_nature==='政策方向'?'<p class="pledge-nature-note">政見原文只寫方向，沒有可驗證的作為，難以判定是否實現。</p>':''}${pledge.evidence_summary?`<p>${escapeHtml(pledge.evidence_summary)}</p>`:unchecked?'<p class="pledge-unchecked">本站尚未查核這筆政見的執行情形，不代表任何判斷。</p>':''}</div>
  ${relatedGovList(pledge)}
  <div class="source-row"><a href="${escapeHtml(safeUrl(pledge.pledge_source_url))}" target="_blank" rel="noopener">${escapeHtml(pledge.pledge_source_type||'原始政見')} ↗</a>${pledge.evidence_source_url?`<a href="${escapeHtml(safeUrl(pledge.evidence_source_url))}" target="_blank" rel="noopener">實現情形 ↗</a>`:''}${(pledge.additional_evidence||[]).map(item=>`<a href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener" title="${escapeHtml(item.title)}">${escapeHtml(item.title)} ↗</a>`).join('')}<span class="verification">${unchecked||!pledge.last_verified?'尚未查核':`查核 ${escapeHtml(pledge.last_verified)}`} · ${reportLink(pledge.id,`${pledge.city} ${pledge.person}：${pledge.pledge_title}（政見實現追蹤）`)}</span></div>
</article>`;
};

const personBlock=person=>{
  const first=person.rows[0];
  return `<article class="tracker-person">
    <div class="tracker-person-head"><h3>${escapeHtml(first.person)}</h3><p class="party">${escapeHtml(first.party)} · ${escapeHtml(first.current_office)} · ${escapeHtml(first.term)}</p><span class="tag">${escapeHtml(first.reelection_status||'')}</span><span class="tracker-person-count">${person.rows.length} 筆政見</span></div>
    <div class="cards">${person.rows.map(pledgeCard).join('')}</div>
  </article>`;
};

const render=()=>{
  const city=document.getElementById('cityFilter').value,office=document.getElementById('officeFilter').value,status=document.getElementById('statusFilter').value;
  const shown=records.filter(x=>(!city||x.city===city)&&(!office||x.current_office===office)&&(!status||x.status===status));
  const cities=groupBy(shown,row=>row.city);
  const people=new Set(shown.map(row=>`${row.city}｜${row.person}`));
  const checked=shown.filter(row=>row.status!=='not_checked').length;
  document.getElementById('count').textContent=`收錄政見 ${shown.length} 筆，其中已完成查核 ${checked} 筆 · ${cities.length} 個縣市 · ${people.size} 位首長`;
  document.getElementById('empty').hidden=shown.length>0;
  document.getElementById('cards').innerHTML=cities.map(group=>`<section class="tracker-city"><h2 class="tracker-city-name">${escapeHtml(group.key)}</h2>${groupBy(group.rows,row=>row.person).map(personBlock).join('')}</section>`).join('');
  renderMayorGov();
};
// 首長施政：跟著縣市篩選；頭銜只寫資料有的參選職務，不推定是否現任（現任職務待資料端提供欄位）。
const renderMayorGov=()=>{
  const city=document.getElementById('cityFilter').value;
  const shown=mayorGov.filter(x=>!city||x.city===city);
  document.getElementById('mayorGov').hidden=!shown.length;
  document.getElementById('mayorGovCards').innerHTML=groupBy(shown,row=>row.city).map(group=>`<section class="tracker-city"><h2 class="tracker-city-name">${escapeHtml(group.key)}</h2>${groupBy(group.rows,row=>row.candidate).map(person=>`<article class="tracker-person"><div class="tracker-person-head"><h3>${escapeHtml(person.key)}</h3><p class="party">${escapeHtml(person.rows[0].party)} · 2026 參選${escapeHtml(person.rows[0].office)}</p><span class="tracker-person-count">${person.rows.length} 筆施政紀錄</span></div><div class="cards">${person.rows.map(councilCard).join('')}</div></article>`).join('')}</section>`).join('');
};
const addCityOptions=cities=>{const select=document.getElementById('cityFilter'),existing=new Set([...select.options].map(o=>o.value));const value=select.value;[...new Set(cities)].filter(c=>c&&!existing.has(c)).forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;select.append(o)});[...select.options].slice(1).sort((a,b)=>cityRank(a.value)-cityRank(b.value)).forEach(o=>select.append(o));select.value=value};

fetch('data/pledge_fulfillment.json').then(r=>r.json()).then(data=>{records=(data.records||[]).sort(byCity);addCityOptions(records.map(x=>x.city));optionValues('current_office',document.getElementById('officeFilter'));optionValues('status',document.getElementById('statusFilter'));document.querySelectorAll('select').forEach(x=>x.addEventListener('change',render));render()}).catch(()=>{document.getElementById('empty').hidden=false;document.getElementById('empty').innerHTML='<strong>資料尚未載入</strong><span>請稍後重新整理。</span>'});

// 議員分頁：任內文化問政（非本屆政見），資料為 loadCandidateDataset() 的 incumbent_records；不評估實現狀態。
let councilRecords=[];
const councilCard=record=>`<article class="card pledge-card" id="${govAnchor(record.id)}">
  <div class="card-meta">${pendingReviewTag(record)}${['現任議員','推定現任議員'].includes(record.proposer_role)?`<span class="tag tag-status">${escapeHtml(record.proposer_role)}</span>`:''}<span class="tag">${escapeHtml(record.content_nature)}</span>${topicTagList(record).map(topic=>`<span class="tag">${escapeHtml(topic)}</span>`).join('')}</div>
  <p class="summary">${escapeHtml(record.summary)}</p>
  ${(record.concrete_proposals||[]).length?`<div class="policy-layer policy-actions"><h4>具體主張</h4><ul>${record.concrete_proposals.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`:''}
  ${(record.editor_notes||[]).length?`<div class="policy-layer policy-editor-note"><h4>本站備註</h4><ul>${record.editor_notes.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`:''}
  ${record.role_evidence?`<p class="role-evidence">判定依據：${escapeHtml(record.role_evidence)}</p>`:''}
  <div class="source-row"><a href="${escapeHtml(safeUrl(record.source_url))}" target="_blank" rel="noopener">${escapeHtml(record.source_title||'原始來源')} ↗</a><span class="verification">查核 ${escapeHtml(record.last_verified)} · ${reportLink(record.id,`${record.city} ${record.candidate}（現任紀錄）`)}</span></div>
</article>`;
const councilPerson=person=>{
  const first=person.rows[0];
  return `<article class="tracker-person">
    <div class="tracker-person-head"><h3>${escapeHtml(first.candidate)}</h3><p class="party">${escapeHtml(first.party)} · ${escapeHtml(first.city)}議員參選人</p><span class="tracker-person-count">${person.rows.length} 筆問政紀錄</span></div>
    <div class="cards">${person.rows.map(councilCard).join('')}</div>
  </article>`;
};
const setQuery=(key,value)=>{const params=new URLSearchParams(location.search);value?params.set(key,value):params.delete(key);const query=params.toString();history.replaceState(null,'',query?`?${query}`:location.pathname)};
const renderCouncil=()=>{
  const city=document.getElementById('councilCityFilter').value;
  const shown=councilRecords.filter(x=>!city||x.city===city);
  const cities=groupBy(shown,row=>row.city),people=new Set(shown.map(row=>`${row.city}｜${row.candidate}`));
  document.getElementById('councilCount').textContent=`共 ${shown.length} 筆問政紀錄 · ${cities.length} 個縣市 · ${people.size} 位議員`;
  document.getElementById('councilEmpty').hidden=shown.length>0;
  document.getElementById('councilCards').innerHTML=cities.map(group=>`<section class="tracker-city"><h2 class="tracker-city-name">${escapeHtml(group.key)}</h2>${groupBy(group.rows,row=>row.candidate).map(councilPerson).join('')}</section>`).join('');
  if(!document.getElementById('councilPanel').hidden)setQuery('city',city);
};
const setTab=tab=>{
  document.querySelectorAll('.tracker-switch button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tab===tab)));
  document.getElementById('mayorPanel').hidden=tab!=='mayor';
  document.getElementById('councilPanel').hidden=tab!=='council';
  setQuery('tab',tab==='council'?'council':'');
  setQuery('city',tab==='council'?document.getElementById('councilCityFilter').value:'');
};
const initialQuery=new URLSearchParams(location.search);
document.querySelectorAll('.tracker-switch button').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
loadCandidateDataset().then(data=>{
  mayorGov=(data.incumbent_records||[]).filter(isMayorRecord).sort((a,b)=>cityRank(a.city)-cityRank(b.city)||String(a.candidate).localeCompare(String(b.candidate),'zh-Hant'));
  addCityOptions(mayorGov.map(x=>x.city));
  render();
  councilRecords=(data.incumbent_records||[]).filter(record=>!isMayorRecord(record)).sort((a,b)=>cityRank(a.city)-cityRank(b.city)||String(a.candidate).localeCompare(String(b.candidate),'zh-Hant'));
  const select=document.getElementById('councilCityFilter');
  [...new Set(councilRecords.map(x=>x.city))].forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option)});
  if(councilRecords.some(x=>x.city===initialQuery.get('city')))select.value=initialQuery.get('city');
  select.addEventListener('change',renderCouncil);
  setTab(initialQuery.get('tab')==='council'?'council':'mayor');
  renderCouncil();
}).catch(()=>{document.getElementById('councilEmpty').hidden=false;document.getElementById('councilEmpty').innerHTML='<strong>資料尚未載入</strong><span>請稍後重新整理。</span>'});
