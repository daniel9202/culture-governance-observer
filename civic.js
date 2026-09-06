const uniq=(a)=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'zh-Hant'));
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeUrl=url=>{try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'#'}catch{return '#'}};
const options=(id,values)=>{const el=document.getElementById(id);values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;el.append(option)})};
let calls=[];
function render(){
  const city=civicCityFilter.value,type=civicTypeFilter.value,topic=civicTopicFilter.value;
  const rows=calls.filter(x=>(!city||x.city===city)&&(!type||x.proposer_type===type)&&(!topic||x.topics.includes(topic)));
  civicCount.textContent=`顯示 ${rows.length} 筆已查核民間訴求`;
  civicCards.innerHTML=rows.map(x=>`<article class="card"><div class="card-meta"><span class="tag">${escapeHtml(x.city)}</span><span class="tag">${escapeHtml(x.proposer_type)}</span>${x.topics.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div><h3>${escapeHtml(x.proposer)}</h3><span class="party">民間文化政策訴求</span><p class="summary">${escapeHtml(x.summary)}</p><p class="summary"><strong>訴求行動：</strong>${escapeHtml(x.requested_action)}</p><div class="source-row"><span>${escapeHtml(x.published_date)}</span><a href="${escapeHtml(safeUrl(x.source_url))}" target="_blank" rel="noopener">查看來源 ↗</a></div><small class="verification">最後查核：${escapeHtml(x.last_verified)} · 更正 ${Number(x.corrections.length)||0} 次</small></article>`).join('');
  civicEmpty.hidden=rows.length>0;
}
fetch('data/civic_policy_calls.json').then(r=>r.json()).then(data=>{
  calls=data.records;
  options('civicCityFilter',uniq(calls.map(x=>x.city)));
  options('civicTypeFilter',uniq(calls.map(x=>x.proposer_type)));
  options('civicTopicFilter',uniq(calls.flatMap(x=>x.topics)));
  ['civicCityFilter','civicTypeFilter','civicTopicFilter'].forEach(id=>document.getElementById(id).addEventListener('change',render));
  render();
}).catch(()=>{civicCount.textContent='資料載入失敗，請稍後再試。'});
