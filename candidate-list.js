const isCouncilor=record=>String(record.office).includes('議員');
const inScope=document.body.dataset.officeScope==='councilor'?isCouncilor:record=>!isCouncilor(record);
const uniq=(a)=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'zh-Hant'));
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeUrl=url=>{try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'#'}catch{return '#'}};
const options=(id,values)=>{const el=document.getElementById(id);values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;el.append(option)})};
let platforms=[];
const bulletList=(values,emptyText)=>values.length?`<ul>${values.map(value=>`<li>${escapeHtml(value)}</li>`).join('')}</ul>`:`<p>${escapeHtml(emptyText)}</p>`;
const sourceList=record=>record.sources.length?`<ul class="source-list">${record.sources.map((source,index)=>`<li><a href="${escapeHtml(safeUrl(source.url))}" target="_blank" rel="noopener">${escapeHtml(source.title||`來源 ${index+1}`)} ↗</a></li>`).join('')}</ul>`:'<p>尚未收錄來源。</p>';
function render(){
  const city=cityFilter.value,party=partyFilter.value,topic=topicFilter.value;
  const rows=platforms.filter(x=>(!city||x.city===city)&&(!party||x.party===party)&&(!topic||x.topics.includes(topic)));
  count.textContent=`顯示 ${rows.length} 位候選人`;
  cards.innerHTML=rows.map(x=>`<article class="card candidate-card"><div class="card-meta"><span class="tag">${escapeHtml(x.city)}</span><span class="tag">${escapeHtml(x.office)}</span>${x.topics.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div><h3>${escapeHtml(x.candidate)}</h3><span class="party">${escapeHtml(x.party)}</span><div class="policy-layer"><h4>政策論述</h4>${bulletList(x.policy_arguments,'尚未收錄可核實的政策論述。')}</div><div class="policy-layer policy-actions"><h4>具體主張</h4>${bulletList(x.concrete_proposals,'尚未收錄具體主張。')}</div><div class="policy-layer policy-statements"><h4>相關發言</h4>${bulletList(x.related_statements,'尚未收錄可核實的相關發言。')}</div><div class="policy-layer policy-sources"><h4>相關來源</h4>${sourceList(x)}</div><small class="verification">發布：${escapeHtml(x.published_dates.join('、')||'待查核')} · 最後查核：${escapeHtml(x.last_verified)} · 更正 ${Number(x.corrections.length)||0} 次</small></article>`).join('');
  empty.hidden=rows.length>0;
}
loadCandidateDataset().then(data=>{
  platforms=groupCandidateRecords(data.records.filter(inScope));
  options('cityFilter',uniq(platforms.map(x=>x.city)));
  options('partyFilter',uniq(platforms.map(x=>x.party)));
  options('topicFilter',uniq(platforms.flatMap(x=>x.topics)));
  ['cityFilter','partyFilter','topicFilter'].forEach(id=>document.getElementById(id).addEventListener('change',render));
  render();
}).catch(()=>{count.textContent='資料載入失敗，請稍後再試。'});
