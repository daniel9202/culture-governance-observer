const statusLabels={fulfilled:'已實現',partial:'部分實現',in_progress:'執行中',no_verified_progress:'未找到可驗證進度',not_assessable:'不適合評估'};let records=[];
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeUrl=url=>{try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'#'}catch{return '#'}};
const optionValues=(key,el)=>{[...new Set(records.map(x=>x[key]).filter(Boolean))].sort().forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=key==='status'?statusLabels[v]:v;el.append(o)})};
const byCity=(a,b)=>cityRank(a.city)-cityRank(b.city)||String(a.person).localeCompare(String(b.person),'zh-Hant')||String(a.pledge_date).localeCompare(String(b.pledge_date));
const groupBy=(rows,key)=>rows.reduce((groups,row)=>{const value=key(row),group=groups.find(item=>item.key===value);(group||groups[groups.push({key:value,rows:[]})-1]).rows.push(row);return groups},[]);

const pledgeCard=pledge=>`<article class="card pledge-card">
  <div class="card-meta"><span class="tag tag-status status-${escapeHtml(pledge.status)}">${escapeHtml(statusLabels[pledge.status]||'')}</span>${pledge.topics.map(topic=>`<span class="tag">${escapeHtml(topic)}</span>`).join('')}</div>
  <h4>${escapeHtml(pledge.pledge_title)}</h4>
  <p class="summary">${escapeHtml(pledge.pledge_summary)}</p>
  <div class="policy-layer policy-actions"><h4>查核判斷</h4><p>${escapeHtml(pledge.evidence_summary)}</p></div>
  <div class="source-row"><a href="${escapeHtml(safeUrl(pledge.pledge_source_url))}" target="_blank" rel="noopener">${escapeHtml(pledge.pledge_source_type||'原始政見')} ↗</a>${pledge.evidence_source_url?`<a href="${escapeHtml(safeUrl(pledge.evidence_source_url))}" target="_blank" rel="noopener">實現情形 ↗</a>`:''}<span class="verification">查核 ${escapeHtml(pledge.last_verified)}</span></div>
</article>`;

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
  document.getElementById('count').textContent=`共 ${shown.length} 筆已查核紀錄 · ${cities.length} 個縣市 · ${people.size} 位首長`;
  document.getElementById('empty').hidden=shown.length>0;
  document.getElementById('cards').innerHTML=cities.map(group=>`<section class="tracker-city"><h2 class="tracker-city-name">${escapeHtml(group.key)}</h2>${groupBy(group.rows,row=>row.person).map(personBlock).join('')}</section>`).join('');
};

fetch('data/pledge_fulfillment.json').then(r=>r.json()).then(data=>{records=(data.records||[]).sort(byCity);optionValues('city',document.getElementById('cityFilter'));optionValues('current_office',document.getElementById('officeFilter'));optionValues('status',document.getElementById('statusFilter'));document.querySelectorAll('select').forEach(x=>x.addEventListener('change',render));render()}).catch(()=>{document.getElementById('empty').hidden=false;document.getElementById('empty').innerHTML='<strong>資料尚未載入</strong><span>請稍後重新整理。</span>'});
