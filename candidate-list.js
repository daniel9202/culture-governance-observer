const isCouncilor=record=>String(record.office).includes('議員');
const inScope=document.body.dataset.officeScope==='councilor'?isCouncilor:record=>!isCouncilor(record);
const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'zh-Hant'));
const options=(id,values,label=value=>value)=>{const el=document.getElementById(id);values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=label(value);el.append(option)})};
let platforms=[],incumbents=new Map;
const isCouncilorPage=document.body.dataset.officeScope==='councilor';
const districtFilter=document.getElementById('districtFilter');
// 選區選單只列已選縣市內、已收錄候選人所在的選區；未選縣市時停用。
function fillDistricts(selected=''){
  if(!districtFilter)return;
  const city=cityFilter.value;
  districtFilter.length=1;
  const districts=city?uniq(platforms.filter(x=>x.city===city).map(x=>x.district)).sort((a,b)=>districtNumber(a)-districtNumber(b)):[];
  options('districtFilter',districts,district=>districtFullLabel({city,district}));
  districtFilter.disabled=!districts.length;
  districtFilter.value=districts.includes(selected)?selected:'';
}
function render(){
  const city=cityFilter.value,party=partyFilter.value,topic=topicFilter.value,district=districtFilter?.value||'';
  const rows=platforms.filter(x=>(!city||x.city===city)&&(!district||x.district===district)&&(!party||x.party===party)&&(!topic||recordTopicCategories(x).includes(topic)));
  count.textContent=`顯示 ${rows.length} 位候選人`;
  if(isCouncilorPage){
    const note=document.getElementById('incumbentNote')||count.insertAdjacentElement('afterend',Object.assign(document.createElement('p'),{id:'incumbentNote',className:'incumbent-note'}));
    note.innerHTML=incumbentLink(city?(incumbents.get(city)||new Set).size:[...incumbents.values()].reduce((sum,names)=>sum+names.size,0),city);
  }
  // 縣市長、議員列表都用精簡卡（2026-10-30），完整內容在候選人頁。
  cards.innerHTML=rows.map(x=>renderCandidateCompact(x)).join('');
  empty.hidden=rows.length>0;
}
Promise.all([loadCandidateDataset({districts:isCouncilorPage}),fetch('data/party_colors.json').then(response=>response.ok?response.json():{}).catch(()=>({}))]).then(([data,colors])=>{
  window.PARTY_COLOR_MAP=colors.parties||{};
  platforms=groupCandidateRecords(data.records.filter(inScope),data.shared_policy_groups||[]).filter(inScope).sort(compareCandidates);
  incumbents=incumbentNamesByCity(data.incumbent_records||[]);
  options('cityFilter',uniq(platforms.map(x=>x.city)).sort((a,b)=>cityRank(a)-cityRank(b)));
  options('partyFilter',uniq(platforms.map(x=>x.party)));
  options('topicFilter',uniq(platforms.flatMap(recordTopicCategories)).sort((a,b)=>topicCategoryRank(a)-topicCategoryRank(b)));
  const params=new URLSearchParams(location.search),requestedCity=params.get('city');
  if(requestedCity&&platforms.some(record=>record.city===requestedCity))cityFilter.value=requestedCity;
  fillDistricts(params.get('district')||'');
  cityFilter.addEventListener('change',()=>{fillDistricts();render()});
  ['districtFilter','partyFilter','topicFilter'].forEach(id=>document.getElementById(id)?.addEventListener('change',render));
  render();
}).catch(()=>{count.textContent='資料載入失敗，請稍後再試。'});
