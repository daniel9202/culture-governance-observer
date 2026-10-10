// 文化政見地圖：以縣市為單位統計提出文化政策的候選人，底圖見 map-geometry.json（scripts/build_map_geometry.py 產生）。
const REGIONS=[
  ['北部',['臺北市','新北市','基隆市','桃園市','新竹市','新竹縣','宜蘭縣']],
  ['中部',['苗栗縣','臺中市','彰化縣','南投縣','雲林縣']],
  ['南部',['嘉義市','嘉義縣','臺南市','高雄市','屏東縣']],
  ['東部',['花蓮縣','臺東縣']],
  ['離島',['澎湖縣','金門縣','連江縣']],
];
const CITY_ORDER=REGIONS.flatMap(([,cities])=>cities);
const REGION_OF=Object.fromEntries(REGIONS.flatMap(([region,cities])=>cities.map(city=>[city,region])));
// 政黨色由 config/party_colors.json 經 build_data.py 輸出為 data/party_colors.json；未設定的政黨顯示為「其他政黨」。
let PARTY_COLORS={parties:{},other:{short:'其他政黨',color:'#7D6F8F'}};
const partyInfo=party=>{
  const item=PARTY_COLORS.parties[party]||(party?{...PARTY_COLORS.other,short:party}:{short:'政黨待確認',color:'#8C8F84'});
  // 圓點與小圖示：無黨籍為空心圈；淺色政黨（例：時代力量）加深色外框
  return {...item,fill:item.hollow?'#ffffff':item.color,ring:item.hollow?'#55584e':(item.outline||'')};
};
const partyStyle=info=>`--party:${info.color};--party-fill:${info.fill};--party-ring:${info.ring||'transparent'}`;
const OFFICES={mayor:{label:'縣市長',test:record=>!String(record.office).includes('議員')},councilor:{label:'縣市議員',test:record=>String(record.office).includes('議員')}};
// 附圖內的候選人圓點位置（避開島嶼輪廓）；align 為圓點排列方向
const INSET_MARKERS={'連江縣':{x:24,y:40,align:'start'},'金門縣':{x:24,y:236,align:'start'},'澎湖縣':{x:24,y:420,align:'start'}};
const SVG_NS='http://www.w3.org/2000/svg';
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

let geometry,byOffice={mayor:new Map,councilor:new Map},office='mayor',activeCity='',incumbents=new Map;
// 參選人數取自中選會登記名冊（data/registered_candidates.json）。
// 名冊姓名可能附原住民族傳統名字（例：林筱薇IcyangTamana），因此以「名冊姓名以本站姓名開頭」比對。
let registered={mayor:new Map,councilor:new Map},registeredSource=null;
const registeredIn=(key,city)=>registered[key].get(city)||[];
// 現任縣市長登記連任（名冊 incumbent＝是，資料端依中選會名冊判定）
const incumbentMayor=city=>registeredIn('mayor',city).find(record=>record.incumbent==='是');
const sameCandidate=(registeredName,name)=>registeredName===name||registeredName.startsWith(name);
const unrecorded=(key,city)=>{const proposed=(byOffice[key].get(city)||[]).map(item=>item.candidate);return registeredIn(key,city).filter(item=>!proposed.some(name=>sameCandidate(item.candidate,name)))};
const nameList=(items,limit)=>items.length>limit?`${items.slice(0,limit).map(item=>esc(item.candidate)).join('、')} 等 ${items.length} 位`:items.map(item=>esc(item.candidate)).join('、');

function groupByCity(records,shared,officeKey){
  const test=OFFICES[officeKey].test,counts=new Map;
  records.filter(test).forEach(record=>{const key=[record.city,record.candidate].join('\u0000');counts.set(key,(counts.get(key)||0)+1)});
  const map=new Map;
  groupCandidateRecords(records.filter(test),shared).filter(test).forEach(candidate=>{
    if(!map.has(candidate.city))map.set(candidate.city,[]);
    map.get(candidate.city).push({...candidate,recordCount:counts.get([candidate.city,candidate.candidate].join('\u0000'))||0});
  });
  map.forEach(list=>list.sort((a,b)=>b.recordCount-a.recordCount||a.candidate.localeCompare(b.candidate,'zh-Hant')));
  return map;
}

function dots(candidates,x,y,align){
  const gap=13,width=(candidates.length-1)*gap,start=align==='start'?x:align==='end'?x-width:x-width/2;
  return candidates.map((item,index)=>`<circle class="map-dot" cx="${start+index*gap}" cy="${y}" r="5.5" fill="${partyInfo(item.party).fill}"${partyInfo(item.party).ring?` style="stroke:${partyInfo(item.party).ring};stroke-width:2.2px"`:''}><title>${esc(item.candidate)}（${esc(partyInfo(item.party).short)}）</title></circle>`).join('');
}

// 議員模式只標總數：各政黨人數差異多半反映本站收錄進度，不宜在地圖上呈現
function countBadge(list,x,y,align){
  const n=list.length,w=Math.max(18,String(n).length*7+10),cx=align==='start'?x-5.5+w/2:align==='end'?x+5.5-w/2:x;
  return `<g class="map-count"><rect x="${cx-w/2}" y="${y-8}" width="${w}" height="16" rx="8"/><text x="${cx}" y="${y+3.7}" text-anchor="middle">${n}</text><title>${n} 位議員候選人（本站已收錄）</title></g>`;
}

function drawMap(){
  const svg=document.getElementById('taiwanMap'),groups=byOffice[office];
  svg.setAttribute('viewBox',geometry.viewBox.join(' '));
  const insets=geometry.insets.map(inset=>{const [x,y,w,h]=inset.box,[lx,ly,anchor]=inset.label_at;return `<rect class="inset-frame" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="inset-label" x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(inset.label)}</text>`}).join('');
  const shapes=geometry.counties.map(county=>{
    const count=(groups.get(county.name)||[]).length;
    return `<path class="county${county.name===activeCity?' is-active':''}${office==='mayor'&&incumbentMayor(county.name)?' is-incumbent':''}" d="${county.d}" data-city="${esc(county.name)}" tabindex="0" role="button" aria-label="${esc(county.name)}：${count?`${count} 位${OFFICES[office].label}候選人提出文化政策`:'尚未收錄'}"></path>`;
  }).join('');
  const mark=office==='councilor'?countBadge:dots;
  const markers=geometry.counties.map(county=>{
    const list=groups.get(county.name)||[],inset=INSET_MARKERS[county.name];
    if(inset)return list.length?`<g class="map-marker" data-city="${esc(county.name)}">${mark(list,inset.x,inset.y,inset.align)}</g>`:'';
    const [ax,ay]=county.anchor,[x,y]=county.callout||county.anchor;
    // 引線標註朝海面方向排列圓點與名稱，避免壓到陸地
    const align=county.callout?(x<ax?'end':'start'):'middle',textAnchor={start:'start',end:'end',middle:'middle'}[align];
    const leader=county.callout?`<line class="map-leader" x1="${ax}" y1="${ay}" x2="${x}" y2="${y+(list.length?0:-4)}"/><circle class="map-leader-end" cx="${ax}" cy="${ay}" r="1.8"/>`:'';
    const labelY=list.length?y+(office==='councilor'?19:17):y,labelX=align==='start'?x-5.5:align==='end'?x+5.5:x;
    return `<g class="map-marker${list.length?'':' is-empty'}" data-city="${esc(county.name)}">${leader}${list.length?mark(list,x,y,align):''}<text class="map-label" x="${labelX}" y="${labelY}" text-anchor="${textAnchor}">${esc(county.name)}</text></g>`;
  }).join('');
  svg.innerHTML=`<title id="mapTitle">台灣各縣市${OFFICES[office].label}候選人文化政策提出情形</title>${insets}<g class="counties">${shapes}</g><path class="county-outline county-outline-hover" d=""/><path class="county-outline county-outline-active" d="${esc(geometry.counties.find(county=>county.name===activeCity)?.d||'')}"/><g class="markers">${markers}</g>`;
  svg.querySelectorAll('.county').forEach(node=>{
    const choose=()=>selectCity(node.dataset.city);
    node.addEventListener('click',choose);
    node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose()}});
    // 外框另畫一層蓋在所有縣市上面，避免相鄰縣市的白邊蓋住一半，造成邊線粗細不一。
    const hoverOutline=svg.querySelector('.county-outline-hover');
    node.addEventListener('pointerenter',event=>{hoverOutline.setAttribute('d',node.getAttribute('d'));if(event.pointerType!=='touch')showTooltip(node.dataset.city,event)});
    node.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')moveTooltip(event)});
    node.addEventListener('pointerleave',()=>{hoverOutline.setAttribute('d','');hideTooltip()});
    node.addEventListener('focus',()=>{const box=node.getBoundingClientRect();showTooltip(node.dataset.city,{clientX:box.left+box.width/2,clientY:box.top+box.height/2})});
    node.addEventListener('blur',hideTooltip);
  });
  svg.querySelectorAll('.map-marker').forEach(node=>node.addEventListener('click',()=>selectCity(node.dataset.city)));
}

function tooltipRow(key,city,label){
  const proposed=(byOffice[key].get(city)||[]).length,total=registeredIn(key,city).length,missing=unrecorded(key,city);
  const bar=`<span class="tip-bar"><span style="width:${Math.min(proposed/Math.max(total,1),1)*100}%"></span></span>`;
  const note=!total?'名冊無資料':!missing.length?'登記參選人皆已收錄':key==='mayor'?`未收錄：${nameList(missing,6)}`:`未收錄 ${missing.length} 位`;
  return `<div class="tip-row${key===office?' is-current':''}"><span class="tip-office">${label}</span><span class="tip-count"><b>${proposed}</b> / ${total} 位已提出</span>${bar}<span class="tip-note">${note}</span></div>`;
}
function showTooltip(city,event){
  const tip=document.getElementById('mapTooltip');
  const incumbent=incumbentMayor(city);
  tip.innerHTML=`<strong>${esc(city)}</strong>${incumbent?`<span class="tip-incumbent">現任縣市長 ${esc(incumbent.candidate)} 登記連任</span>`:''}${tooltipRow('mayor',city,'縣市長')}${tooltipRow('councilor',city,'議員')}<span class="tip-source">參選人數：中選會登記名冊</span>`;
  tip.hidden=false;moveTooltip(event);
}
function moveTooltip(event){
  const tip=document.getElementById('mapTooltip'),wrap=tip.parentElement.getBoundingClientRect();
  if(tip.hidden)return;
  let x=event.clientX-wrap.left+16,y=event.clientY-wrap.top+16;
  if(x+tip.offsetWidth>wrap.width)x=event.clientX-wrap.left-tip.offsetWidth-16;
  if(y+tip.offsetHeight>wrap.height)y=Math.max(0,event.clientY-wrap.top-tip.offsetHeight-16);
  tip.style.transform=`translate(${Math.max(0,x)}px,${y}px)`;
}
function hideTooltip(){document.getElementById('mapTooltip').hidden=true}

function candidateCard(item){
  const party=partyInfo(item.party),summary=item.summary||item.policy_arguments[0]||'';
  const shared=item.shared_policies.length?`<span class="map-shared">共同政見 ${item.shared_policies.length} 項</span>`:'';
  return `<a class="map-candidate" href="${esc(candidateUrl(item))}" style="${partyStyle(party)}">
    <div class="map-candidate-head"><div><h3>${esc(item.candidate)}</h3><span class="map-party"><i></i>${esc(item.party||party.short)}</span></div><strong>${item.recordCount}<small>筆紀錄</small></strong></div>
    ${summary?`<p>${esc(summary)}</p>`:''}
    <div class="map-topics">${topicTagList(item).slice(0,6).map(topic=>`<span>${esc(topic)}</span>`).join('')}${shared}</div>
    <span class="map-candidate-more">看政見與來源 →</span>
  </a>`;
}

function renderDetail(){
  const detail=document.getElementById('mapDetail'),city=activeCity,list=byOffice[office].get(city)||[];
  const other=office==='mayor'?'councilor':'mayor',otherCount=(byOffice[other].get(city)||[]).length;
  const missing=unrecorded(office,city),total=registeredIn(office,city).length;
  const missingNote=missing.length?`<p class="map-detail-missing">${office==='mayor'?`尚未收錄文化政策：${nameList(missing,12)}`:`另有 ${missing.length} 位登記參選人尚未收錄文化政策`}</p>`:'';
  const switchLink=otherCount?`<button type="button" class="map-detail-switch" data-switch="${other}">此縣市另有 ${otherCount} 位${OFFICES[other].label}候選人 →</button>`:'';
  const incumbentNote=incumbentLink((incumbents.get(city)||new Set).size,city,'map-detail-switch');
  const regionLink=`<a class="map-detail-link" href="${regionUrl(city)}">${esc(city)}地方頁：預算、統計與全部候選人 →</a>`;
  const foot=switchLink||incumbentNote?`<div class="map-detail-foot">${switchLink}${incumbentNote}</div>`:'';
  if(!city){detail.innerHTML='<p class="kicker">選擇縣市</p><h2>從地圖開始</h2><p class="map-detail-lead">點選地圖上的縣市，查看提出文化政策的候選人與政黨。</p>';return}
  detail.innerHTML=`<p class="kicker">${esc(REGION_OF[city]||'')} / ${OFFICES[office].label}</p><h2>${esc(city)}</h2>`+(list.length
    ?`<p class="map-detail-lead">登記參選 ${total} 位，其中 ${list.length} 位提出文化政策，共 ${list.reduce((sum,item)=>sum+item.recordCount,0)} 筆紀錄。</p><div class="map-candidates">${list.map(candidateCard).join('')}</div>${missingNote}${regionLink}`
    :`<p class="map-detail-lead">登記參選 ${total} 位，目前尚未收錄符合口徑的文化政策。這不代表候選人沒有提出，只是本站還沒有可查核的資料。</p>${office==='mayor'&&missing.length?`<p class="map-detail-missing">登記參選人：${nameList(missing,12)}</p>`:''}${regionLink}`)+foot;
  detail.querySelector('[data-switch]')?.addEventListener('click',event=>setOffice(event.currentTarget.dataset.switch));
}

function selectCity(city,{scroll=false}={}){
  activeCity=city;
  document.querySelectorAll('#taiwanMap .county').forEach(node=>node.classList.toggle('is-active',node.dataset.city===city));
  document.querySelector('#taiwanMap .county-outline-active')?.setAttribute('d',document.querySelector(`#taiwanMap .county[data-city="${CSS.escape(city)}"]`)?.getAttribute('d')||'');
  document.querySelectorAll('.compare-row').forEach(node=>node.classList.toggle('is-active',node.dataset.city===city));
  renderDetail();
  if(scroll)document.getElementById('map').scrollIntoView({behavior:'smooth',block:'start'});
}

function setOffice(next){
  office=next;
  document.querySelectorAll('.map-switch button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.office===office)));
  drawMap();renderDetail();renderLegend();renderParties();
}

const chips=list=>list.length?list.map(item=>`<a class="compare-chip" href="${esc(candidateUrl(item))}" style="${partyStyle(partyInfo(item.party))}"><i></i>${esc(item.candidate)}<small>${esc(partyInfo(item.party).short)}</small></a>`).join(''):'<span class="compare-none">尚未收錄</span>';
function renderCompare(){
  document.getElementById('compareList').innerHTML=REGIONS.map(([region,cities])=>`<div class="compare-region"><h3>${region}</h3>${cities.map(city=>{
    const mayors=byOffice.mayor.get(city)||[],councilors=byOffice.councilor.get(city)||[];
    // 縣市名稱在地圖上選取；姓名連到候選人頁（連結不能放在按鈕裡，所以整列不再是按鈕）
    return `<div class="compare-row${mayors.length||councilors.length?'':' is-empty'}" data-city="${esc(city)}"><button type="button" class="compare-city" data-city="${esc(city)}" aria-label="在地圖上查看${esc(city)}">${esc(city)}<span aria-hidden="true">↑</span></button><span class="compare-cell" data-label="縣市長"><span class="compare-ratio">${mayors.length}/${registeredIn('mayor',city).length}</span>${chips(mayors)}</span><span class="compare-cell" data-label="議員"><span class="compare-ratio">${councilors.length}/${registeredIn('councilor',city).length}</span>${chips(councilors)}</span></div>`;
  }).join('')}</div>`).join('');
  document.querySelectorAll('.compare-city').forEach(button=>button.addEventListener('click',()=>selectCity(button.dataset.city,{scroll:true})));
}

function partyTotals(){
  const totals=new Map;
  ['mayor','councilor'].forEach(key=>byOffice[key].forEach(list=>list.forEach(item=>{
    const party=item.party||'政黨待確認';
    if(!totals.has(party))totals.set(party,{party,mayor:0,councilor:0,cities:new Set});
    const row=totals.get(party);row[key]+=1;row.cities.add(item.city);
  })));
  return [...totals.values()].sort((a,b)=>(b.mayor+b.councilor)-(a.mayor+a.councilor)||b.mayor-a.mayor);
}
function renderLegend(){
  if(office==='councilor'){document.getElementById('partyLegend').innerHTML='<span><b class="legend-count">7</b>數字＝本站已收錄、提出文化政策的議員人數；點選縣市可看政黨與名單</span>';return}
  const present=new Set([...byOffice[office].values()].flat().map(item=>item.party));
  document.getElementById('partyLegend').innerHTML=partyTotals().filter(row=>present.has(row.party)).map(row=>`<span style="${partyStyle(partyInfo(row.party))}"><i></i>${esc(partyInfo(row.party).short)}</span>`).join('')+([...registered.mayor.keys()].some(incumbentMayor)?'<span class="legend-incumbent"><i></i>現任縣市長登記連任</span>':'');
}
function renderParties(){
  const rows=partyTotals(),max=Math.max(...rows.map(row=>row.mayor+row.councilor),1);
  document.getElementById('partyBars').innerHTML=`<div class="party-bar-key"><span><i class="solid"></i>縣市長候選人</span><span><i class="light"></i>議員候選人</span></div>`+rows.map(row=>{
    const info=partyInfo(row.party);
    return `<div class="party-bar" style="${partyStyle(info)}"><span class="party-bar-name"><i></i>${esc(row.party)}</span><span class="party-bar-track"><span class="solid" style="width:${row.mayor/max*100}%"></span><span class="light" style="width:${row.councilor/max*100}%"></span></span><span class="party-bar-num">縣市長 <b>${row.mayor}</b>・議員 <b>${row.councilor}</b>・${row.cities.size} 縣市</span></div>`;
  }).join('');
}

const loadJson=(url,message)=>fetch(url).then(response=>{if(!response.ok)throw Error(message);return response.json()});
Promise.all([loadJson('map-geometry.json','無法讀取地圖'),loadCandidateDataset(),loadJson('data/registered_candidates.json','無法讀取登記名冊'),loadJson('data/party_colors.json','無法讀取政黨色')]).then(([geo,data,roster,colors])=>{
  geometry=geo;PARTY_COLORS=colors;registeredSource=roster.source;incumbents=incumbentNamesByCity(data.incumbent_records||[]);
  roster.records.forEach(record=>{
    const key=record.office==='縣市長'?'mayor':'councilor';
    if(!registered[key].has(record.city))registered[key].set(record.city,[]);
    registered[key].get(record.city).push(record);
  });
  const shared=data.shared_policy_groups||[];
  byOffice={mayor:groupByCity(data.records,shared,'mayor'),councilor:groupByCity(data.records,shared,'councilor')};
  const cities=new Set([...byOffice.mayor.keys(),...byOffice.councilor.keys()]);
  const all=[...byOffice.mayor.values(),...byOffice.councilor.values()].flat();
  statCities.textContent=`${cities.size}/22`;
  const registeredTotal=key=>[...registered[key].values()].flat().length.toLocaleString('zh-TW');
  statMayors.innerHTML=`${[...byOffice.mayor.values()].flat().length}<small>/${registeredTotal('mayor')}</small>`;
  statCouncilors.innerHTML=`${[...byOffice.councilor.values()].flat().length}<small>/${registeredTotal('councilor')}</small>`;
  if(registeredSource)registeredNote.innerHTML=`參選人數：<a href="${esc(registeredSource.url)}" target="_blank" rel="noopener">${esc(registeredSource.title)}</a>（製表日期 ${esc(registeredSource.as_of)}）`;
  statParties.textContent=new Set(all.map(item=>item.party)).size;
  document.querySelectorAll('.map-switch button').forEach(button=>button.addEventListener('click',()=>setOffice(button.dataset.office)));
  const requested=new URLSearchParams(location.search).get('city');
  activeCity=CITY_ORDER.includes(requested)?requested:CITY_ORDER.find(city=>byOffice.mayor.has(city))||'';
  drawMap();renderCompare();renderLegend();renderParties();selectCity(activeCity);
}).catch(error=>{
  console.error(error);
  document.getElementById('mapDetail').innerHTML='<p class="kicker">ERROR</p><h2>資料暫時無法載入</h2><p class="map-detail-lead">請稍後再試。</p>';
});
