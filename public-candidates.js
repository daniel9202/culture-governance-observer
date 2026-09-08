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
