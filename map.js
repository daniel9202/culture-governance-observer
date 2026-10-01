const CITY_POINTS={
  '基隆市':[286,113],'新北市':[248,136],'臺北市':[266,145],'桃園市':[229,169],'新竹縣':[215,205],
  '新竹市':[198,214],'臺中市':[244,294],'彰化縣':[225,341],'雲林縣':[222,385],'嘉義市':[213,420],
  '嘉義縣':[230,432],'臺南市':[235,476],'高雄市':[257,531],'屏東縣':[282,601],'宜蘭縣':[346,173],
  '花蓮縣':[337,330],'臺東縣':[324,487],'澎湖縣':[116,248],'金門縣':[103,510],'連江縣':[126,82]
};
const CITY_ORDER=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const mayorOnly=record=>!String(record.office).includes('議員');
const sortedCities=values=>[...values].sort((a,b)=>CITY_ORDER.indexOf(a)-CITY_ORDER.indexOf(b));
let cityGroups=new Map,activeCity='';
function showCity(city){
  if(!cityGroups.has(city))return;
  activeCity=city;
  document.querySelectorAll('.map-marker').forEach(marker=>marker.classList.toggle('is-active',marker.dataset.city===city));
  const records=cityGroups.get(city),candidateCount=records.length,recordCount=records.reduce((sum,item)=>sum+item.recordCount,0);
  detailCity.textContent=city;
  detailLead.textContent=`已收錄 ${candidateCount} 位候選人的 ${recordCount} 筆文化政策紀錄。`;
  detailCandidates.innerHTML=records.map(item=>`<article class="map-candidate"><div><h3>${esc(item.candidate)}</h3><span>${esc(item.party||'政黨待確認')}</span></div><strong>${item.recordCount}<small>筆</small></strong><p>${esc(item.summary)}</p><a href="mayors.html?city=${encodeURIComponent(city)}">查看政策與來源</a></article>`).join('');
}
function marker(city,records){
  const [x,y]=CITY_POINTS[city]||[]; if(x===undefined)return '';
  const count=records.length,kind=count>1?'many':'one',label=`${city}，${count}位候選人`;
  return `<g class="map-marker ${kind}" tabindex="0" role="button" aria-label="${esc(label)}" data-city="${esc(city)}"><circle cx="${x}" cy="${y}" r="${count>1?15:11}"></circle><text x="${x}" y="${y+4}" text-anchor="middle">${count}</text><text class="map-city-label" x="${x+18}" y="${y+4}">${esc(city.replace('縣','').replace('市',''))}</text></g>`;
}
loadCandidateDataset().then(data=>{
  const grouped=new Map;
  data.records.filter(mayorOnly).forEach(record=>{
    const city=record.city,key=[city,record.candidate,record.party||''].join('\u0000');
    if(!grouped.has(city))grouped.set(city,new Map);
    const bucket=grouped.get(city);
    if(!bucket.has(key))bucket.set(key,{candidate:record.candidate,party:record.party,recordCount:0,summary:record.summary||record.policy_argument||''});
    const item=bucket.get(key);item.recordCount+=1;
    if((record.summary||'').length>item.summary.length)item.summary=record.summary;
  });
  cityGroups=new Map(sortedCities(grouped.keys()).map(city=>[city,[...grouped.get(city).values()].sort((a,b)=>b.recordCount-a.recordCount||a.candidate.localeCompare(b.candidate,'zh-Hant'))]));
  const candidates=[...cityGroups.values()].flat(),recordCount=data.records.filter(mayorOnly).length;
  mapCityCount.textContent=cityGroups.size;mapCandidateCount.textContent=candidates.length;mapRecordCount.textContent=recordCount;
  mapMarkers.innerHTML=[...cityGroups.entries()].map(([city,records])=>marker(city,records)).join('');
  document.querySelectorAll('.map-marker').forEach(node=>{
    const choose=()=>showCity(node.dataset.city);
    node.addEventListener('click',choose);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose()}});
  });
  const requested=new URLSearchParams(location.search).get('city');
  showCity(cityGroups.has(requested)?requested:[...cityGroups.keys()][0]);
}).catch(()=>{detailCity.textContent='資料暫時無法載入';detailLead.textContent='請稍後再試。'});
