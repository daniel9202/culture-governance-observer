const isCouncilor=record=>String(record.office).includes('議員');
const inScope=document.body.dataset.officeScope==='councilor'?isCouncilor:record=>!isCouncilor(record);
const uniq=(a)=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'zh-Hant'));
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeUrl=url=>{try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'#'}catch{return '#'}};
const options=(id,values)=>{const el=document.getElementById(id);values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;el.append(option)})};
let platforms=[];
const sourceLinks=(record,field)=>{const sources=record.field_sources?.[field]||[{title:record.source_title||'主要來源',url:record.source_url}];return `<div class="field-sources"><span>對應來源</span>${sources.map((source,index)=>`<a href="${escapeHtml(safeUrl(source.url))}" title="${escapeHtml(source.title)}" target="_blank" rel="noopener">${escapeHtml(source.title||`來源 ${index+1}`)} ↗</a>`).join('')}</div>`};
const collapsible=(html,plainText,field)=>plainText.length>220?`<div class="field-content is-collapsed" data-field-content="${field}">${html}</div><button class="expand-field" type="button" data-expand-field="${field}" aria-expanded="false">展開全文</button>`:`<div class="field-content">${html}</div>`;
function render(){
  const city=cityFilter.value,party=partyFilter.value,topic=topicFilter.value;
  const rows=platforms.filter(x=>(!city||x.city===city)&&(!party||x.party===party)&&(!topic||x.topics.includes(topic)));
  count.textContent=`顯示 ${rows.length} 筆已查核政見`;
  cards.innerHTML=rows.map(x=>{const argument=x.policy_argument||x.summary,proposals=x.concrete_proposals||[x.summary],statements=x.related_statements||[],statementHtml=statements.length?`<ul>${statements.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>`:'<p>尚未收錄可核實的相關發言。</p>';return `<article class="card"><div class="card-meta"><span class="tag">${escapeHtml(x.city)}</span><span class="tag">${escapeHtml(x.office)}</span>${x.topics.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div><h3>${escapeHtml(x.candidate)}</h3><span class="party">${escapeHtml(x.party)}</span><div class="policy-layer"><h4>政策論述</h4>${collapsible(`<p>${escapeHtml(argument)}</p>`,argument,'argument')}${sourceLinks(x,'policy_argument')}</div><div class="policy-layer policy-actions"><h4>具體主張</h4>${collapsible(`<ul>${proposals.map(p=>`<li>${escapeHtml(p)}</li>`).join('')}</ul>`,proposals.join(' '),'proposals')}${sourceLinks(x,'concrete_proposals')}</div><div class="policy-layer policy-statements"><h4>相關發言</h4>${collapsible(statementHtml,statements.join(' '),'statements')}${sourceLinks(x,'related_statements')}</div><small class="verification">發布：${escapeHtml(x.published_date)} · 最後查核：${escapeHtml(x.last_verified)} · 更正 ${Number(x.corrections.length)||0} 次</small></article>`}).join('');
  document.querySelectorAll('[data-expand-field]').forEach(button=>button.onclick=()=>{const content=button.previousElementSibling,collapsed=content.classList.toggle('is-collapsed');button.textContent=collapsed?'展開全文':'收合內容';button.setAttribute('aria-expanded',String(!collapsed))});
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
