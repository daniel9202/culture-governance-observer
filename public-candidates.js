// 議題大類（docs/TOPIC-TAXONOMY.md，順序同 config/issue_tags.json）。篩選與卡片標籤用大類；細標籤 topics 只在缺大類時備用。
window.TOPIC_CATEGORIES=['文化治理與預算','文化資產','文化場館','表演藝術','視覺藝術','博物館與地方文化館','閱讀與圖書館','影視與流行音樂','文化產業與文創','地方文化與社區營造','民俗節慶','藝文節慶','原住民族文化','客家文化','語言與族群','文化教育','文化平權與參與','高齡與世代共融','永續與ESG','數位文化與科技','文化觀光','文化空間與城市再生','國際與兩岸交流','青年'];
window.topicCategoryRank=category=>{const index=TOPIC_CATEGORIES.indexOf(category);return index===-1?TOPIC_CATEGORIES.length:index};
window.recordTopicCategories=record=>Array.isArray(record?.topic_categories)?record.topic_categories:[];
// 卡片標籤：大類依固定順序；有子類別時以「大類／子類別」取代該大類。
window.topicTagList=record=>{
  const categories=recordTopicCategories(record),subcategories=Array.isArray(record?.topic_subcategories)?record.topic_subcategories:[];
  if(!categories.length)return Array.isArray(record?.topics)?record.topics:[];
  return [...new Set(categories)].sort((a,b)=>topicCategoryRank(a)-topicCategoryRank(b)).map(category=>subcategories.find(item=>item.startsWith(`${category}／`))||category);
};
const uniqueValues=values=>[...new Set(values.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))];
const normaliseApprovedCandidate=record=>({
  ...record,
  topics:Array.isArray(record.topics)?record.topics:[],
  topic_categories:Array.isArray(record.topic_categories)?record.topic_categories:[],
  topic_subcategories:Array.isArray(record.topic_subcategories)?record.topic_subcategories:[],
  policy_argument:record.policy_argument||record.summary||'',
  concrete_proposals:Array.isArray(record.concrete_proposals)?record.concrete_proposals:[record.summary].filter(Boolean),
  related_statements:Array.isArray(record.related_statements)?record.related_statements:[],
  editor_notes:Array.isArray(record.editor_notes)?record.editor_notes:[],
  related_sources:Array.isArray(record.related_sources)?record.related_sources:[],
  corrections:Array.isArray(record.corrections)?record.corrections:[],
  source_type:record.source_type||'審核上架',
  review_status:record.review_status||'人工審核',
});
// 先行上架、尚待人工複核的資料（資料方法：AI 初審，人工複核）。
window.isPendingReview=record=>record?.review_status==='AI初審待複核';
window.pendingReviewTag=record=>record?.pending_review||isPendingReview(record)?'<span class="tag tag-pending" title="由 AI 初審先行上架，每週由人工複核">AI 初審・待複核</span>':'';
const sourceTitle=(title,url)=>{
  const clean=String(title||'').trim();
  if(clean&&!/^相關來源 \d+$/.test(clean)&&clean!=='來源')return clean;
  try{return `延伸來源（${new URL(url).hostname.replace(/^www\./,'')}）`;}catch{return '延伸來源';}
};
const sourceEntries=record=>{
  const entries=[];
  const add=(title,url)=>{if(typeof url==='string'&&url.trim())entries.push({title:sourceTitle(title,url.trim()),url:url.trim()})};
  add(record.source_title,record.source_url);
  Object.values(record.field_sources||{}).flat().forEach(source=>add(source?.title,source?.url));
  (record.related_sources||[]).forEach((source,index)=>{
    if(typeof source==='string')add('',source);
    else add(source?.title,source?.url);
  });
  return entries;
};
const emptyCandidateGroup=record=>({...record,topics:[],topic_categories:[],topic_subcategories:[],policy_titles:[],policy_arguments:[],concrete_proposals:[],related_statements:[],editor_notes:[],pending_review:false,ids:[],sources:[],published_dates:[],corrections:[],shared_policies:[],party_shared_policies:[],regional_shared_policies:[]});
const groupKey=record=>[record.city,record.office,record.candidate].join('\u0000');
// 候選人個人資料與多人共同提出的政見分開保存，但在同一張候選人卡片呈現。
window.groupCandidateRecords=(records,sharedPolicies=[])=>{
  const groups=new Map;
  const ensureGroup=record=>{
    const key=groupKey(record);
    if(!groups.has(key))groups.set(key,emptyCandidateGroup(record));
    return groups.get(key);
  };
  records.forEach(raw=>{
    const record=normaliseApprovedCandidate(raw),group=ensureGroup(record);
    group.party=record.party||group.party;
    group.topics.push(...record.topics);
    group.topic_categories.push(...record.topic_categories);
    group.topic_subcategories.push(...record.topic_subcategories);
    if(record.policy_title)group.policy_titles.push(record.policy_title);
    group.policy_arguments.push(record.policy_argument||record.summary);
    group.concrete_proposals.push(...(record.concrete_proposals.length?record.concrete_proposals:[record.summary]));
    group.related_statements.push(...record.related_statements);
    group.editor_notes.push(...record.editor_notes);
    if(isPendingReview(record))group.pending_review=true;
    if(record.id)group.ids.push(record.id);
    group.sources.push(...sourceEntries(record));
    if(record.published_date)group.published_dates.push(record.published_date);
    group.corrections.push(...record.corrections);
    if(String(record.last_verified||'')>String(group.last_verified||''))group.last_verified=record.last_verified;
  });
  [...sharedPolicies].sort((a,b)=>(a.scope==="party")-(b.scope==="party")).forEach(policy=>{
    const scope=policy.scope||"regional";
    const candidates=scope==="party"
      ? [...groups.values()].filter(record=>record.party===policy.party&&record.office===policy.office)
      : (policy.candidates||[]).map(candidate=>({city:policy.city,office:policy.office,candidate,party:policy.party,last_verified:policy.last_verified}));
    candidates.forEach(candidate=>{
      const group=ensureGroup(candidate);
      group.party=group.party||policy.party;
      group.topics.push(...(policy.topics||[]));
      group.topic_categories.push(...(policy.topic_categories||[]));
      group.topic_subcategories.push(...(policy.topic_subcategories||[]));
      group.shared_policies.push(policy);
      (scope==="party"?group.party_shared_policies:group.regional_shared_policies).push(policy);
      if(String(policy.last_verified||'')>String(group.last_verified||''))group.last_verified=policy.last_verified;
    });
  });
  return [...groups.values()].map(group=>({...group,
    topics:uniqueValues(group.topics),topic_categories:uniqueValues(group.topic_categories),topic_subcategories:uniqueValues(group.topic_subcategories),policy_titles:uniqueValues(group.policy_titles),policy_arguments:uniqueValues(group.policy_arguments),concrete_proposals:uniqueValues(group.concrete_proposals),related_statements:uniqueValues(group.related_statements),editor_notes:uniqueValues(group.editor_notes),ids:uniqueValues(group.ids),
    sources:[...new Map(group.sources.map(source=>[source.url,source])).values()],published_dates:uniqueValues(group.published_dates).sort(),
    shared_policies:[...new Map(group.shared_policies.map(policy=>[policy.id,policy])).values()],
    party_shared_policies:[...new Map(group.party_shared_policies.map(policy=>[policy.id,policy])).values()],
    regional_shared_policies:[...new Map(group.regional_shared_policies.map(policy=>[policy.id,policy])).values()],
  }));
};
// 議員任內文化問政（非本屆政見）收在「現任追蹤」；地圖與議員頁依縣市計人數並連過去。
// 只算議員；縣市長的任內施政另列在現任追蹤首長分頁。
window.incumbentNamesByCity=records=>records.filter(record=>record.office!=='縣市長').reduce((map,record)=>map.set(record.city,(map.get(record.city)||new Set).add(record.candidate)),new Map);
window.incumbentLink=(count,city,className='incumbent-link')=>count?`<a class="${className}" href="fulfillment.html?tab=council${city?`&city=${encodeURIComponent(city)}`:''}">${city?'本縣市':''}另有 ${count} 位議員的任內文化問政紀錄（非本屆政見）→</a>`:'';
window.loadCandidateDataset=async()=>{
  const [staticData,sharedData]=await Promise.all([
    fetch('data/candidates.json').then(response=>{if(!response.ok)throw Error('無法讀取候選人資料');return response.json()}),
    fetch('data/shared_policy_groups.json').then(response=>{if(!response.ok)throw Error('無法讀取共同政見資料');return response.json()}),
  ]);
  // 只使用經 build_data.py 驗證的正式資料；Cloudflare 已核准 API 屬舊流程，已停用。
  // 前台的政見與統計只收「本屆競選政見」；現任議員個人頁內容與問政／提案另存 incumbent_records（依資料端的 content_nature 欄位）。
  const records=staticData.records||[];
  return {...staticData,records:records.filter(record=>record.content_nature==='本屆競選政見'),incumbent_records:records.filter(record=>record.content_nature!=='本屆競選政見'),shared_policy_groups:sharedData.records||[]};
};
// 候選人卡片與網址：縣市長／議員列表、地方頁、候選人頁共用。
// 包在區塊內，避免和各頁自己宣告的 escapeHtml 等常數撞名。
{
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const safe=url=>{try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'#'}catch{return '#'}};
  const bullets=(values,emptyText)=>values.length?`<ul>${values.map(value=>`<li>${esc(value)}</li>`).join('')}</ul>`:`<p>${esc(emptyText)}</p>`;
  const sourceHeadline=(headline,outlet)=>headline.replace(` - ${outlet}`,'').replace(/\s*-\s*(政治|地方|生活|社會|文化|財經|國際|娛樂|焦點)\s*$/,'').trim();
  const sourceContent=(source,index)=>{
    const title=String(source.title||`來源連結 ${index+1}`).trim(),parts=title.split('｜').map(part=>part.trim()).filter(Boolean);
    if(/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(parts[0]||'')&&parts.length>=3)return `<span class="source-date">${esc(parts[0])}</span><span class="source-outlet">${esc(parts[1])}</span><span class="source-headline">${esc(sourceHeadline(parts.slice(2).join('｜'),parts[1]))}</span>`;
    return `<span class="source-headline">${esc(title)}</span>`;
  };
  const sourceList=record=>record.sources.length?`<ul class="source-list">${record.sources.map((source,index)=>`<li><a class="source-link" href="${esc(safe(source.url))}" target="_blank" rel="noopener">${sourceContent(source,index)}<span aria-hidden="true">↗</span></a></li>`).join('')}</ul>`:'<p>尚未收錄來源。</p>';
  const sharedPolicyList=policies=>policies.map(policy=>`<section class="shared-policy-item"><h5>${esc(policy.title)}</h5><p>${esc(policy.summary)}</p>${bullets(policy.concrete_proposals||[],'尚未收錄具體主張。')}<a href="${esc(safe(policy.source_url))}" target="_blank" rel="noopener">${esc(policy.source_title||'查看共同政見來源')} ↗</a></section>`).join('');
  const sharedPolicySection=(title,policies,open=false)=>policies.length?`<details class="policy-layer policy-shared"${open?' open':''}><summary><h4>${title}</h4><span class="shared-toggle">${policies.length} 項</span></summary>${sharedPolicyList(policies)}</details>`:'';
  window.officeKey=office=>String(office).includes('議員')?'councilor':'mayor';
  window.candidateUrl=record=>`candidate.html?${new URLSearchParams({city:record.city,office:officeKey(record.office),name:record.candidate})}`;
  window.regionUrl=city=>`region.html?city=${encodeURIComponent(city)}`;
  window.renderCandidateCard=(x,{showCity=true,linkName=true,openShared=false}={})=>{
    const name=linkName?`<a class="candidate-name-link" href="${esc(candidateUrl(x))}">${esc(x.candidate)}</a>`:esc(x.candidate);
    const shared=officeKey(x.office)==='councilor'?`${sharedPolicySection('政黨共同政見',x.party_shared_policies||[],openShared)}${sharedPolicySection('區域共同政見',x.regional_shared_policies||[],openShared)}`:'';
    return `<article class="card candidate-card"><div class="card-meta">${pendingReviewTag(x)}${showCity?`<span class="tag">${esc(x.city)}</span>`:''}<span class="tag">${esc(x.office)}</span>${topicTagList(x).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><h3>${name}</h3><span class="party">${esc(x.party)}</span>${(x.policy_titles||[]).length?`<p class="policy-titles">${x.policy_titles.map(t=>`<span>${esc(t)}</span>`).join('')}</p>`:''}<div class="policy-layer"><h4>政策論述</h4>${bullets(x.policy_arguments,'尚未收錄可核實的政策論述。')}</div><div class="policy-layer policy-actions"><h4>具體主張</h4>${bullets(x.concrete_proposals,'尚未收錄具體主張。')}</div><div class="policy-layer policy-statements"><h4>相關發言</h4>${bullets(x.related_statements,'尚未收錄可核實的相關發言。')}</div>${x.editor_notes.length?`<div class="policy-layer policy-editor-note"><h4>本站備註</h4>${bullets(x.editor_notes,'')}</div>`:''}${shared}<div class="policy-layer policy-sources"><h4>相關來源</h4>${sourceList(x)}</div><small class="verification">發布：${esc(x.published_dates.join('、')||'待查核')} · 最後查核：${esc(x.last_verified)} · ${reportLink(x.ids,`${x.city} ${x.office} ${x.candidate}`)}</small></article>`;
  };
}
