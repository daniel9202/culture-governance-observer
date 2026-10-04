const uniqueValues=values=>[...new Set(values.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))];
const normaliseApprovedCandidate=record=>({
  ...record,
  topics:Array.isArray(record.topics)?record.topics:[],
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
const emptyCandidateGroup=record=>({...record,topics:[],policy_arguments:[],concrete_proposals:[],related_statements:[],editor_notes:[],pending_review:false,ids:[],sources:[],published_dates:[],corrections:[],shared_policies:[],party_shared_policies:[],regional_shared_policies:[]});
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
      group.shared_policies.push(policy);
      (scope==="party"?group.party_shared_policies:group.regional_shared_policies).push(policy);
      if(String(policy.last_verified||'')>String(group.last_verified||''))group.last_verified=policy.last_verified;
    });
  });
  return [...groups.values()].map(group=>({...group,
    topics:uniqueValues(group.topics),policy_arguments:uniqueValues(group.policy_arguments),concrete_proposals:uniqueValues(group.concrete_proposals),related_statements:uniqueValues(group.related_statements),editor_notes:uniqueValues(group.editor_notes),ids:uniqueValues(group.ids),
    sources:[...new Map(group.sources.map(source=>[source.url,source])).values()],published_dates:uniqueValues(group.published_dates).sort(),
    shared_policies:[...new Map(group.shared_policies.map(policy=>[policy.id,policy])).values()],
    party_shared_policies:[...new Map(group.party_shared_policies.map(policy=>[policy.id,policy])).values()],
    regional_shared_policies:[...new Map(group.regional_shared_policies.map(policy=>[policy.id,policy])).values()],
  }));
};
// 議員任內文化問政（非本屆政見）收在「現任追蹤」；地圖與議員頁依縣市計人數並連過去。
window.incumbentNamesByCity=records=>records.reduce((map,record)=>map.set(record.city,(map.get(record.city)||new Set).add(record.candidate)),new Map);
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
