const isCouncilor=record=>String(record.office).includes('議員');
const inScope=document.body.dataset.officeScope==='councilor'?isCouncilor:record=>!isCouncilor(record);
const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'zh-Hant'));
const options=(id,values)=>{const el=document.getElementById(id);values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;el.append(option)})};
let platforms=[],incumbents=new Map;
const isCouncilorPage=document.body.dataset.officeScope==='councilor';
function render(){
  const city=cityFilter.value,party=partyFilter.value,topic=topicFilter.value;
  const rows=platforms.filter(x=>(!city||x.city===city)&&(!party||x.party===party)&&(!topic||recordTopicCategories(x).includes(topic)));
  count.textContent=`顯示 ${rows.length} 位候選人`;
  if(isCouncilorPage){
    const note=document.getElementById('incumbentNote')||count.insertAdjacentElement('afterend',Object.assign(document.createElement('p'),{id:'incumbentNote',className:'incumbent-note'}));
    note.innerHTML=incumbentLink(city?(incumbents.get(city)||new Set).size:[...incumbents.values()].reduce((sum,names)=>sum+names.size,0),city);
  }
  cards.innerHTML=rows.map(x=>renderCandidateCard(x)).join('');
  empty.hidden=rows.length>0;
}
loadCandidateDataset().then(data=>{
  platforms=groupCandidateRecords(data.records.filter(inScope),data.shared_policy_groups||[]).filter(inScope);
  incumbents=incumbentNamesByCity(data.incumbent_records||[]);
  options('cityFilter',uniq(platforms.map(x=>x.city)).sort((a,b)=>cityRank(a)-cityRank(b)));
  options('partyFilter',uniq(platforms.map(x=>x.party)));
  options('topicFilter',uniq(platforms.flatMap(recordTopicCategories)).sort((a,b)=>topicCategoryRank(a)-topicCategoryRank(b)));
  const requestedCity=new URLSearchParams(location.search).get('city');
  if(requestedCity&&platforms.some(record=>record.city===requestedCity))cityFilter.value=requestedCity;
  ['cityFilter','partyFilter','topicFilter'].forEach(id=>document.getElementById(id).addEventListener('change',render));
  render();
}).catch(()=>{count.textContent='資料載入失敗，請稍後再試。'});
