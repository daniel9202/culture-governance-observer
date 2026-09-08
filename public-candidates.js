const APPROVED_CANDIDATES_API='https://culture-review-ingest-staging.b95302239.workers.dev/api/public/candidates';
const normaliseApprovedCandidate=record=>({
  ...record,
  topics:Array.isArray(record.topics)?record.topics:[],
  policy_argument:record.policy_argument||record.summary||'',
  concrete_proposals:Array.isArray(record.concrete_proposals)?record.concrete_proposals:[record.summary].filter(Boolean),
  related_statements:Array.isArray(record.related_statements)?record.related_statements:[],
  related_sources:Array.isArray(record.related_sources)?record.related_sources:[],
  corrections:Array.isArray(record.corrections)?record.corrections:[],
  source_type:record.source_type||'審核上架',
});
const uniqueValues=values=>[...new Set(values.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))];
const sourceEntries=record=>{
  const entries=[];
  const add=(title,url)=>{if(typeof url==='string'&&url.trim())entries.push({title:(title||'來源').trim(),url:url.trim()})};
  add(record.source_title,record.source_url);
  Object.values(record.field_sources||{}).flat().forEach(source=>add(source?.title,source?.url));
  (record.related_sources||[]).forEach((source,index)=>{
    if(typeof source==='string')add(`相關來源 ${index+1}`,source);
    else add(source?.title||`相關來源 ${index+1}`,source?.url);
  });
  return entries;
};
// The public data feed contains one record per verified finding.  Pages that
// introduce candidates combine these findings into one living candidate card.
window.groupCandidateRecords=records=>{
  const groups=new Map;
  records.forEach(raw=>{
    const record=normaliseApprovedCandidate(raw);
    const key=[record.city,record.office,record.candidate].join('\u0000');
    if(!groups.has(key))groups.set(key,{...record,topics:[],policy_arguments:[],concrete_proposals:[],related_statements:[],sources:[],published_dates:[],corrections:[]});
    const group=groups.get(key);
    group.party=record.party||group.party;
    group.topics.push(...record.topics);
    group.policy_arguments.push(record.policy_argument||record.summary);
    group.concrete_proposals.push(...(record.concrete_proposals.length?record.concrete_proposals:[record.summary]));
    group.related_statements.push(...record.related_statements);
    group.sources.push(...sourceEntries(record));
    if(record.published_date)group.published_dates.push(record.published_date);
    group.corrections.push(...record.corrections);
    if(String(record.last_verified||'')>String(group.last_verified||''))group.last_verified=record.last_verified;
  });
  return [...groups.values()].map(group=>({
    ...group,
    topics:uniqueValues(group.topics),
    policy_arguments:uniqueValues(group.policy_arguments),
    concrete_proposals:uniqueValues(group.concrete_proposals),
    related_statements:uniqueValues(group.related_statements),
    sources:[...new Map(group.sources.map(source=>[source.url,source])).values()],
    published_dates:uniqueValues(group.published_dates).sort(),
  }));
};
window.loadCandidateDataset=async()=>{
  const staticData=await fetch('data/candidates.json').then(response=>{if(!response.ok)throw Error('無法讀取候選人資料');return response.json()});
  try{
    const approved=await fetch(APPROVED_CANDIDATES_API).then(response=>{if(!response.ok)throw Error('無法讀取已核准資料');return response.json()});
    return {...staticData,records:[...staticData.records,...(approved.records||[]).map(normaliseApprovedCandidate)]};
  }catch(error){
    console.warn('已核准資料暫時無法載入',error);
    return staticData;
  }
};
