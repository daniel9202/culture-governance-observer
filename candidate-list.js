const isCouncilor=record=>String(record.office).includes('議員');
const inScope=document.body.dataset.officeScope==='councilor'?isCouncilor:record=>!isCouncilor(record);
const uniq=(a)=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'zh-Hant'));
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeUrl=url=>{try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'#'}catch{return '#'}};
const options=(id,values)=>{const el=document.getElementById(id);values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;el.append(option)})};
let platforms=[];
function render(){
  const city=cityFilter.value,party=partyFilter.value,topic=topicFilter.value;
  const rows=platforms.filter(x=>(!city||x.city===city)&&(!party||x.party===party)&&(!topic||x.topics.includes(topic)));
  count.textContent=`顯示 ${rows.length} 筆已查核政見`;
  cards.innerHTML=rows.map(x=>`<article class="card"><div class="card-meta"><span class="tag">${escapeHtml(x.city)}</span><span class="tag">${escapeHtml(x.office)}</span>${x.topics.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div><h3>${escapeHtml(x.candidate)}</h3><span class="party">${escapeHtml(x.party)}</span><div class="policy-layer"><h4>政策論述</h4><p>${escapeHtml(x.policy_argument||x.summary)}</p></div><div class="policy-layer policy-actions"><h4>具體主張</h4><ul>${(x.concrete_proposals||[x.summary]).map(p=>`<li>${escapeHtml(p)}</li>`).join('')}</ul></div><div class="policy-layer policy-statements"><h4>相關發言</h4>${(x.related_statements||[]).length?`<ul>${x.related_statements.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>`:'<p>尚未收錄可核實的相關發言。</p>'}</div><div class="source-row"><span>${escapeHtml(x.published_date)}</span><a href="${escapeHtml(safeUrl(x.source_url))}" target="_blank" rel="noopener">${escapeHtml(x.source_title||'主要來源')} ↗</a>${(x.related_sources||[]).map((url,i)=>`<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener">輔助來源 ${i+1} ↗</a>`).join('')}</div><small class="verification">最後查核：${escapeHtml(x.last_verified)} · 更正 ${Number(x.corrections.length)||0} 次</small></article>`).join('');
  empty.hidden=rows.length>0;
}
fetch('data/candidates.json').then(r=>r.json()).then(data=>{
  platforms=data.records.filter(inScope);
  options('cityFilter',uniq(platforms.map(x=>x.city)));
  options('partyFilter',uniq(platforms.map(x=>x.party)));
  options('topicFilter',uniq(platforms.flatMap(x=>x.topics)));
  ['cityFilter','partyFilter','topicFilter'].forEach(id=>document.getElementById(id).addEventListener('change',render));
  render();
}).catch(()=>{count.textContent='資料載入失敗，請稍後再試。'});
