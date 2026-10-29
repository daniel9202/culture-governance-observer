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
// 地圖只呈現縣市層級：縣轄市長在縣以下，底圖沒有對應範圍，也不該併進縣市長的圓點與人數，
// 因此兩個模式都用精確比對，縣轄市長只出現在「縣市長政見」頁。
const OFFICES={mayor:{label:'縣市長',test:record=>record.office==='縣市長'},councilor:{label:'縣市議員',test:record=>record.office==='縣市議員'}};
// 附圖內的候選人圓點位置（避開島嶼輪廓）；align 為圓點排列方向
const INSET_MARKERS={'連江縣':{x:24,y:40,align:'start'},'金門縣':{x:24,y:236,align:'start'},'澎湖縣':{x:24,y:420,align:'start'}};
const SVG_NS='http://www.w3.org/2000/svg';
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

let geometry,byOffice={mayor:new Map,councilor:new Map},office='mayor',activeCity='',incumbents=new Map,mayorIncumbents=new Map;
// 議員模式的地圖圖層：region＝區域選舉區界線（點選縣市後才畫），indigenous＝原住民選舉區。
// 原住民選舉區依身分別劃分、涵蓋全縣市或跨多個鄉鎮市區，與區域選舉區重疊，畫不成互斥的面，
// 所以該圖層不畫界線，改以縣市整體與人數徽章呈現。
let districtShapes=new Map,shapeOfDistrict=new Map,districtLayer='region',activeDistrict='';
// 縣轄市圖層（township-geometry.json）：只在縣市長模式、且該縣有縣轄市時畫。
let townshipShapes=new Map,activeTownship='';
// 議員模式點選縣市後放大到該縣市；縣市長模式不放大也不畫選舉區。
let zoomFrame=0,zoomOff=false;
const layerMatches=item=>districtLayer==='indigenous'?indigenousDistrict(item.district):!indigenousDistrict(item.district);
const layerList=city=>(byOffice.councilor.get(city)||[]).filter(layerMatches);
// 參選人數取自中選會登記名冊（data/registered_candidates.json）。
// 名冊姓名可能附原住民族傳統名字（例：林筱薇IcyangTamana），因此以「名冊姓名以本站姓名開頭」比對。
let registered={mayor:new Map,councilor:new Map},registeredSources=[];
const registeredIn=(key,city)=>registered[key].get(city)||[];
// 現任縣市長登記連任（名冊 incumbent＝是，資料端依中選會名冊判定）
const incumbentMayor=city=>registeredIn('mayor',city).find(record=>record.incumbent==='是');
// 縣轄市長不畫在地圖上（縣轄市在縣以下，底圖沒有對應範圍），但地圖是進站入口，
// 所以縣市長模式的側欄要有一行把人帶到「縣市長政見」頁的該縣市。
let township={byCity:new Map,registered:new Map};
const townshipIn=city=>township.byCity.get(city)||[];
const townshipRegisteredIn=city=>township.registered.get(city)||[];
const hasTownship=city=>Boolean(city)&&townshipRegisteredIn(city).length>0;
const townshipCandidates=shape=>townshipIn(shape.city).filter(item=>item.district===shape.town);
const townshipRegistered=shape=>townshipRegisteredIn(shape.city).filter(item=>item.district===shape.town);
const townshipNote=city=>{
  const recorded=townshipIn(city).length,registered=townshipRegisteredIn(city).length;
  if(!registered)return '';
  return recorded
    ?`<a class="map-detail-switch" href="mayors.html?city=${encodeURIComponent(city)}">本縣另有 ${recorded} 位縣轄市長候選人提出文化政策 →</a>`
    :`<span class="map-district-note">本縣另有 ${registered} 位縣轄市長登記參選，尚未收錄文化政策。</span>`;
};
const sameCandidate=(registeredName,name)=>registeredName===name||registeredName.startsWith(name);
// 議員模式的人數依目前圖層計算：區域選舉區與原住民選舉區分開算，否則面板會把全縣市的
// 登記人數掛在原住民選舉區底下。
const layerRegistered=(key,city)=>key==='councilor'&&office==='councilor'
  ?registeredIn(key,city).filter(item=>districtLayer==='indigenous'?indigenousDistrict(item.district):!indigenousDistrict(item.district))
  :registeredIn(key,city);
const layerProposed=(key,city)=>key==='councilor'&&office==='councilor'?layerList(city):(byOffice[key].get(city)||[]);
const unrecorded=(key,city)=>{const proposed=layerProposed(key,city).map(item=>item.candidate);return layerRegistered(key,city).filter(item=>!proposed.some(name=>sameCandidate(item.candidate,name)))};
const nameList=(items,limit)=>items.length>limit?`${items.slice(0,limit).map(item=>esc(item.candidate)).join('、')} 等 ${items.length} 位`:items.map(item=>esc(item.candidate)).join('、');

function groupByCity(records,shared,officeKey){
  const test=OFFICES[officeKey].test,counts=new Map;
  records.filter(test).forEach(record=>{const key=[record.city,record.candidate].join('\u0000');counts.set(key,(counts.get(key)||0)+1)});
  const map=new Map;
  groupCandidateRecords(records.filter(test),shared).filter(test).forEach(candidate=>{
    if(!map.has(candidate.city))map.set(candidate.city,[]);
    map.get(candidate.city).push({...candidate,recordCount:counts.get([candidate.city,candidate.candidate].join('\u0000'))||0});
  });
  map.forEach(list=>list.sort(compareCandidates));
  return map;
}

function dots(candidates,x,y,align){
  const gap=13,width=(candidates.length-1)*gap,start=align==='start'?x:align==='end'?x-width:x-width/2;
  return candidates.map((item,index)=>`<circle class="map-dot" cx="${start+index*gap}" cy="${y}" r="5.5" fill="${partyInfo(item.party).fill}"${partyInfo(item.party).ring?` style="stroke:${partyInfo(item.party).ring};stroke-width:2.2px"`:''}><title>${esc(item.candidate)}（${esc(partyInfo(item.party).short)}）</title></circle>`).join('');
}

// 議員模式只標總數：各政黨人數差異多半反映本站收錄進度，不宜在地圖上呈現
function countBadge(list,x,y,align){
  const n=list.filter(layerMatches).length,w=Math.max(18,String(n).length*7+10),cx=align==='start'?x-5.5+w/2:align==='end'?x+5.5-w/2:x;
  return `<g class="map-count"><rect x="${cx-w/2}" y="${y-8}" width="${w}" height="16" rx="8"/><text x="${cx}" y="${y+3.7}" text-anchor="middle">${n}</text><title>${n} 位${districtLayer==='indigenous'?'原住民選舉區':'區域選舉區'}議員候選人（本站已收錄）</title></g>`;
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
  svg.innerHTML=`<title id="mapTitle">台灣各縣市${OFFICES[office].label}候選人文化政策提出情形</title>${insets}<g class="counties">${shapes}</g><g class="districts"></g><g class="district-labels"></g><path class="county-outline county-outline-hover" d=""/><path class="county-outline county-outline-active" d="${esc(geometry.counties.find(county=>county.name===activeCity)?.d||'')}"/><g class="markers">${markers}</g>`;
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
  renderDistricts();renderDistrictLabels();
}

// 點選縣市後才畫該縣市的選舉區界線；有收錄候選人的選舉區填色，其餘只有界線。
// 路徑的外框（畫面座標），用來算放大後的 viewBox
function pathBox(d){
  const xs=[],ys=[];
  for(const pair of d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)){xs.push(+pair[1]);ys.push(+pair[2])}
  return xs.length?[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]:null;
}

function zoomTarget(city){
  const svg=document.getElementById('taiwanMap');
  if((office!=='councilor'&&!hasTownship(city))||!city||zoomOff)return geometry.viewBox;
  const box=pathBox(geometry.counties.find(county=>county.name===city)?.d||'');
  if(!box)return geometry.viewBox;
  // 留白後維持畫面比例，避免 preserveAspectRatio 把縣市擠到一邊
  // 留白按縣市大小等比例，固定值會讓新竹市、嘉義市這類小縣市只占畫面一半
  const [x0,y0,x1,y1]=box,pad=Math.max(6,Math.max(x1-x0,y1-y0)*0.08);
  const w=x1-x0+pad*2,h=y1-y0+pad*2;
  const ratio=svg.clientWidth&&svg.clientHeight?svg.clientWidth/svg.clientHeight:geometry.viewBox[2]/geometry.viewBox[3];
  const width=Math.max(w,h*ratio),height=Math.max(h,w/ratio);
  return [x0-pad-(width-w)/2,y0-pad-(height-h)/2,width,height];
}

function applyZoom(city,{animate=true}={}){
  const svg=document.getElementById('taiwanMap'),to=zoomTarget(city);
  const from=(svg.getAttribute('viewBox')||geometry.viewBox.join(' ')).split(' ').map(Number);
  const zoomed=(office==='councilor'||hasTownship(city))&&Boolean(city)&&!zoomOff;
  svg.classList.toggle('is-zoomed',zoomed);
  document.getElementById('zoomOut').hidden=!zoomed;
  // 線寬與文字不跟著放大：路徑用 non-scaling-stroke，標籤依縮放倍率反向縮小
  svg.style.setProperty('--zoom',String(geometry.viewBox[2]/to[2]));
  cancelAnimationFrame(zoomFrame);
  if(!animate||from.length!==4){svg.setAttribute('viewBox',to.join(' '));renderDistrictLabels();return}
  const start=performance.now(),span=320;
  const step=now=>{
    const t=Math.min((now-start)/span,1),ease=t<.5?2*t*t:1-(-2*t+2)**2/2;
    svg.setAttribute('viewBox',from.map((value,index)=>value+(to[index]-value)*ease).join(' '));
    if(t<1)zoomFrame=requestAnimationFrame(step);else renderDistrictLabels();
  };
  zoomFrame=requestAnimationFrame(step);
}

// 放大後，各選舉區標上號次與已收錄人數（全國尺度下標不下）
function renderDistrictLabels(){
  const layer=document.querySelector('#taiwanMap .district-labels');
  if(!layer)return;
  const svg=document.getElementById('taiwanMap'),zoom=Number(svg.style.getPropertyValue('--zoom'))||1;
  if(office==='mayor'){
    const towns=[...townshipShapes.values()].filter(shape=>shape.city===activeCity);
    layer.innerHTML=zoom>1.2?towns.map(shape=>{
      const count=townshipCandidates(shape).length;
      return `<text class="district-label${count?' has-records':''}" x="${shape.anchor[0]}" y="${shape.anchor[1]}" text-anchor="middle" style="font-size:${(11/zoom).toFixed(2)}px">${esc(shape.town)}</text>`;
    }).join(''):'';
    return;
  }
  if(office!=='councilor'||districtLayer!=='region'||!activeCity||zoom<=1.2){layer.innerHTML='';return}
  // 太小的選舉區（臺中市區、永和、臺南東區等）標籤放不進去，比照小型市的做法引線標註在旁邊
  const shapes=[...districtShapes.values()].filter(shape=>shape.city===activeCity);
  const inside=[],callout=[];
  shapes.forEach(shape=>{
    const box=pathBox(shape.d);
    if(!box)return;
    ((box[2]-box[0])*zoom<34||(box[3]-box[1])*zoom<16?callout:inside).push({shape,box});
  });
  const view=(document.getElementById('taiwanMap').getAttribute('viewBox')||'').split(' ').map(Number);
  const text=({shape,at,anchor='middle'})=>{
    const count=shapeCandidates(shape).length;
    return `<text class="district-label${count?' has-records':''}" x="${at[0]}" y="${at[1]}" text-anchor="${anchor}" style="font-size:${(11/zoom).toFixed(2)}px">${esc(shapeLabel(shape).replace('選舉區',''))}</text>`;
  };
  let marks=inside.map(item=>text({shape:item.shape,at:item.shape.anchor})).join('');
  if(callout.length&&view.length===4){
    // 排到整個縣市外框之外（西側多半是海），不然會壓到鄰近選舉區的標籤
    const county=pathBox(geometry.counties.find(item=>item.name===activeCity)?.d||'')||[0,0,0,0];
    const gap=10/zoom,step=15/zoom,margin=34/zoom;
    const left=county[0]-gap-margin>view[0];
    const right=!left&&county[2]+gap+margin<view[0]+view[2];
    const x=left?county[0]-gap:right?county[2]+gap:county[0]-gap;
    const sorted=callout.slice().sort((a,b)=>a.shape.anchor[1]-b.shape.anchor[1]);
    const mid=sorted.reduce((sum,item)=>sum+item.shape.anchor[1],0)/sorted.length;
    marks+=sorted.map((item,index)=>{
      const y=mid+(index-(sorted.length-1)/2)*step;
      return `<line class="district-leader" x1="${item.shape.anchor[0]}" y1="${item.shape.anchor[1]}" x2="${x}" y2="${y-step*0.28}"/>`
        +text({shape:item.shape,at:[x+(right?step*0.25:-step*0.25),y],anchor:right?'start':'end'});
    }).join('');
  }
  layer.innerHTML=marks;
}

function townshipShapesFor(city){
  if(office!=='mayor'||!city)return '';
  return [...townshipShapes.values()].filter(shape=>shape.city===city).map(shape=>{
    const count=townshipCandidates(shape).length;
    return `<path class="map-district-shape is-township${count?' has-records':''}${shape.id===activeTownship?' is-active':''}" d="${shape.d}" data-township="${esc(shape.id)}" aria-label="${esc(shape.town)}：${count?`${count} 位縣轄市長候選人提出文化政策`:'尚未收錄'}"></path>`;
  }).join('');
}

function districtShapesFor(city){
  if(office!=='councilor'||districtLayer!=='region'||!city)return '';
  return [...districtShapes.values()].filter(shape=>shape.city===city).map(shape=>{
    const count=shapeCandidates(shape).length;
    return `<path class="map-district-shape${count?' has-records':''}${shape.approximate?' is-approximate':''}${shape.id===activeDistrict?' is-active':''}" d="${shape.d}" data-shape="${esc(shape.id)}" aria-label="${esc(shapeLabel(shape))}：${count?`${count} 位候選人提出文化政策`:'尚未收錄'}"></path>`;
  }).join('');
}

// selectCity 不重畫整張地圖，所以選舉區層單獨更新
// 點選舉區：右側只看該選舉區的候選人；再點一次或按返回鍵回到整個縣市
function selectDistrict(id){
  const shape=districtShapes.get(id);
  if(!shape)return;
  if(shape.city!==activeCity){selectCity(shape.city);activeDistrict=id}
  else activeDistrict=activeDistrict===id?'':id;
  // 在全國尺度點選區時一併放大，否則選到的區塊小到看不出來
  if(activeDistrict&&zoomOff){zoomOff=false;applyZoom(activeCity)}
  renderDistricts();renderDetail();
}

// 點縣轄市：右側只看該市的縣轄市長候選人；再點一次回到整個縣
function selectTownship(id){
  const shape=townshipShapes.get(id);
  if(!shape)return;
  if(shape.city!==activeCity){selectCity(shape.city);activeTownship=id}
  else activeTownship=activeTownship===id?'':id;
  if(activeTownship&&zoomOff){zoomOff=false;applyZoom(activeCity)}
  renderDistricts();renderDetail();
}

function showTownshipTooltip(id,event){
  const tip=document.getElementById('mapTooltip'),shape=townshipShapes.get(id);
  if(!shape)return;
  const list=townshipCandidates(shape),total=townshipRegistered(shape).length;
  tip.innerHTML=`<strong>${esc(shape.city)}${esc(shape.town)}</strong>`
    +`<span class="tip-source">縣轄市・不屬於縣市長選舉</span>`
    +`<div class="tip-row is-current"><span class="tip-office">縣轄市長</span><span class="tip-count"><b>${list.length}</b> / ${total} 位已提出</span>`
    +`<span class="tip-note">${list.length?nameList(list,6):'本市尚未收錄文化政策'}</span></div>`;
  tip.hidden=false;moveTooltip(event);
}

function renderDistricts(){
  const layer=document.querySelector('#taiwanMap .districts');
  if(!layer)return;
  layer.innerHTML=districtShapesFor(activeCity)+townshipShapesFor(activeCity);
  document.getElementById('taiwanMap').classList.toggle('shows-districts',Boolean(layer.childElementCount));
  layer.querySelectorAll('.map-district-shape.is-township').forEach(node=>{
    node.addEventListener('click',()=>selectTownship(node.dataset.township));
    node.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showTownshipTooltip(node.dataset.township,event)});
    node.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')moveTooltip(event)});
    node.addEventListener('pointerleave',hideTooltip);
  });
  layer.querySelectorAll('.map-district-shape:not(.is-township)').forEach(node=>{
    // 選區圖形蓋在縣市上面，沒有這個處理的話，回到全國後再點該縣市會沒有反應
    node.addEventListener('click',()=>selectDistrict(node.dataset.shape));
    node.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showDistrictTooltip(node.dataset.shape,event)});
    node.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')moveTooltip(event)});
    node.addEventListener('pointerleave',hideTooltip);
  });
}

const shapeCandidates=shape=>(byOffice.councilor.get(shape.city)||[]).filter(item=>shape.districts.includes(item.district));
// 一塊涵蓋多個選舉區時（新竹市、竹北市以里劃分）標成「第1–5選舉區」
const shapeLabel=shape=>shape.districts.length===1
  ?districtLabel({city:shape.city,district:shape.districts[0]})
  :`第${districtNumber(shape.districts[0])}–${districtNumber(shape.districts[shape.districts.length-1])}選舉區`;

function showDistrictTooltip(id,event){
  const tip=document.getElementById('mapTooltip'),shape=districtShapes.get(id);
  const list=shapeCandidates(shape);
  const total=registeredIn('councilor',shape.city).filter(item=>shape.districts.includes(item.district)).length;
  const scope=shape.districts.length===1?districtScope(shape.districts[0]):`${shape.districts.length} 個選舉區`;
  tip.innerHTML=`<strong>${esc(shape.city)}${esc(shapeLabel(shape))}</strong>`
    +`<span class="tip-source">${esc(scope)}${shape.approximate?'：公告以村里劃分，本站無村里圖資，圖形為整個鄉鎮市區':''}・應選 ${shape.seats} 席</span>`
    +`<div class="tip-row is-current"><span class="tip-office">議員</span><span class="tip-count"><b>${list.length}</b> / ${total} 位已提出</span>`
    +`<span class="tip-note">${list.length?nameList(list,6):'本選舉區尚未收錄文化政策'}</span></div>`;
  tip.hidden=false;moveTooltip(event);
}

function tooltipRow(key,city,label){
  const proposed=layerProposed(key,city).length,total=layerRegistered(key,city).length,missing=unrecorded(key,city);
  const bar=`<span class="tip-bar"><span style="width:${Math.min(proposed/Math.max(total,1),1)*100}%"></span></span>`;
  const note=!total?'名冊無資料':!missing.length?'登記參選人皆已收錄':key==='mayor'?`未收錄：${nameList(missing,6)}`:`未收錄 ${missing.length} 位${districtNote(city)}`;
  return `<div class="tip-row${key===office?' is-current':''}"><span class="tip-office">${label}</span><span class="tip-count"><b>${proposed}</b> / ${total} 位已提出</span>${bar}<span class="tip-note">${note}</span></div>`;
}
// 議員：該縣市共幾個選舉區、其中幾個已有收錄的候選人（選舉區數含原住民選舉區）
function districtNote(city){
  const all=cityDistricts(city).filter(record=>districtLayer==='indigenous'
    ?record.district_type!=='區域':record.district_type==='區域').length;
  if(!all)return '';
  const covered=new Set(layerList(city).map(item=>item.district).filter(Boolean)).size;
  return `・${covered}／${all} 個選舉區有收錄`;
}
function showTooltip(city,event){
  const tip=document.getElementById('mapTooltip');
  const incumbent=incumbentMayor(city);
  // 只顯示目前切換的職務；兩者並陳在下方的「縣市比較」表與各縣市地方頁
  tip.innerHTML=`<strong>${esc(city)}</strong>${office==='mayor'&&incumbent?`<span class="tip-incumbent">現任縣市長 ${esc(incumbent.candidate)} 登記連任</span>`:''}${tooltipRow(office,city,office==='councilor'?`${districtLayer==='indigenous'?'原住民':'區域'}選舉區議員`:OFFICES[office].label)}<span class="tip-source">參選人數：中選會登記名冊・縣市長與議員並陳見下方「縣市比較」</span>`;
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

// 現任縣市長卡片：2022 政見實現追蹤（pledge_fulfillment.json）與任內施政（office_category＝首長的公職政績）。
// 任內施政只取參選縣市長者，縣轄市長的施政不放在縣市層級。
const FULFILLMENT_STATUS=[['fulfilled','已實現'],['partial','部分實現'],['in_progress','執行中'],['no_verified_progress','未找到可驗證進度'],['not_assessable','不適合評估'],['not_checked','尚未查核']];
function buildMayorIncumbents(pledges,records){
  const map=new Map;
  const ensure=(city,name,party,currentOffice)=>{
    const key=`${city}\u0000${name}`;
    if(!map.has(key))map.set(key,{city,candidate:name,party,current_office:currentOffice,pledges:[],gov:[]});
    const item=map.get(key);item.party=item.party||party;item.current_office=item.current_office||currentOffice;return item;
  };
  pledges.forEach(row=>ensure(row.city,row.person,row.party,row.current_office).pledges.push(row));
  records.filter(row=>incumbentKind(row)==='mayor'&&row.office==='縣市長').forEach(row=>ensure(row.city,row.candidate,row.party,row.current_office).gov.push(row));
  const byCity=new Map;
  map.forEach(item=>byCity.set(item.city,[...(byCity.get(item.city)||[]),item]));
  return byCity;
}
function incumbentCard(item){
  const party=partyInfo(item.party),checked=item.pledges.filter(row=>row.status!=='not_checked').length;
  const counts=FULFILLMENT_STATUS.map(([key,label])=>[key,label,item.pledges.filter(row=>row.status===key).length]).filter(([, ,count])=>count);
  const lead=[item.pledges.length?`2022 年文化政見 ${item.pledges.length} 筆，已查核 ${checked} 筆`:'',item.gov.length?`任內文化施政 ${item.gov.length} 筆`:''].filter(Boolean).join(' · ');
  return `<a class="map-incumbent" href="fulfillment.html?city=${encodeURIComponent(item.city)}" style="${partyStyle(party)}">
    <p class="map-incumbent-label">${esc(item.current_office||'現任縣市長')}</p>
    <div class="map-candidate-head"><div><h3>${esc(item.candidate)}</h3><span class="map-party"><i></i>${esc(item.party||party.short)}</span></div></div>
    <p>${esc(lead)}</p>
    ${counts.length?`<ul class="map-incumbent-status">${counts.map(([key,label,count])=>`<li class="status-${key}">${esc(label)} <strong>${count}</strong></li>`).join('')}</ul>`:''}
    <span class="map-candidate-more">看政見實現與任內施政 →</span>
  </a>`;
}

function candidateCard(item,{district=true}={}){
  const party=partyInfo(item.party),counts=candidateSummaryCounts(item);
  const shared=item.shared_policies.length?`<span class="map-shared">共同政見 ${item.shared_policies.length} 項</span>`:'';
  return `<a class="map-candidate" href="${esc(candidateUrl(item))}" style="${partyStyle(party)}">
    <div class="map-candidate-head"><div><h3>${esc(item.candidate)}</h3><span class="map-party"><i></i>${esc(item.party||party.short)}</span>${district&&item.district?`<span class="map-district">${esc(districtLabel(item))}</span>`:''}</div></div>
    <p class="map-count">收錄 ${counts.proposals} 項政見 · 相關新聞 ${counts.news} 則</p>${shared?`<div class="map-topics">${shared}</div>`:''}
    <span class="map-candidate-more">看文化政見與來源 →</span>
  </a>`;
}

// 議員依選舉區分組：區域選舉區照號次，原住民選舉區另成一段（範圍與區域選舉區重疊），
// 查不到選舉區的（名冊有同名候選人）排在最後。
function districtGroups(list,city){
  const groups=new Map;
  list.forEach(item=>groups.set(item.district||'',[...(groups.get(item.district||'')||[]),item]));
  const section=key=>{
    const detail=districtDetail(key);
    // 涵蓋全縣市的原住民選舉區不重複寫縣市名（標題已經是「平地原住民選區」）
    const towns=districtScope(key).replace(/之(平地|山地)原住民$/,'');
    const note=[towns===city?'':towns,detail?`應選 ${detail.seats} 席`:''].filter(Boolean).join('・');
    const head=key
      ?`<h3 class="map-district-head">${esc(districtLabel({city,district:key}))}${note?`<span>${esc(note)}</span>`:''}</h3>`
      :'<h3 class="map-district-head">選舉區待確認<span>中選會名冊中有同名候選人，本站未推定其選舉區</span></h3>';
    return `<div class="map-district-group">${head}<div class="map-candidates">${groups.get(key).map(item=>candidateCard(item,{district:false})).join('')}</div></div>`;
  };
  const keys=[...groups.keys()].sort((a,b)=>districtNumber(a)-districtNumber(b));
  const indigenous=keys.filter(key=>key&&indigenousDistrict(key));
  if(districtLayer==='indigenous')return indigenous.length
    ?indigenous.map(section).join('')
    :'<p class="map-district-note">本縣市的原住民選舉區尚未收錄文化政策。</p>';
  return keys.filter(key=>key&&!indigenousDistrict(key)).map(section).join('')
    +(indigenous.length?`<p class="map-district-note">原住民選舉區依身分別劃分，範圍與區域選舉區重疊。</p>${indigenous.map(section).join('')}`:'')
    +keys.filter(key=>!key).map(section).join('');
}

function renderDetail(){
  const detail=document.getElementById('mapDetail'),city=activeCity;
  const shape=activeDistrict?districtShapes.get(activeDistrict):null;
  const town=office==='mayor'&&activeTownship?townshipShapes.get(activeTownship):null;
  const list=town?townshipCandidates(town):shape?shapeCandidates(shape):office==='councilor'?layerList(city):(byOffice[office].get(city)||[]);
  const other=office==='mayor'?'councilor':'mayor',otherCount=(byOffice[other].get(city)||[]).length;
  const inShape=shape?registeredIn('councilor',city).filter(item=>shape.districts.includes(item.district)):[];
  const missing=town?townshipRegistered(town).filter(item=>!list.some(x=>sameCandidate(item.candidate,x.candidate)))
    :shape?inShape.filter(item=>!list.some(x=>sameCandidate(item.candidate,x.candidate))):unrecorded(office,city);
  const total=town?townshipRegistered(town).length:shape?inShape.length:layerRegistered(office,city).length;
  const missingNote=missing.length?`<p class="map-detail-missing">${office==='mayor'?`尚未收錄文化政策：${nameList(missing,12)}`:(shape?`本選舉區另有 ${missing.length} 位登記參選人尚未收錄文化政策：${nameList(missing,12)}`:`另有 ${missing.length} 位登記參選人尚未收錄文化政策`)}</p>`:'';
  const switchLink=otherCount?`<button type="button" class="map-detail-switch" data-switch="${other}">此縣市另有 ${otherCount} 位${OFFICES[other].label}候選人 →</button>`:'';
  const incumbentNote=incumbentLink((incumbents.get(city)||new Set).size,city,'map-detail-switch');
  const townshipLine=office==='mayor'&&!shape&&!town?townshipNote(city):'';
  const regionLink=`<a class="map-detail-link" href="${regionUrl(city)}">${esc(city)}地方頁：預算、統計與全部候選人 →</a>`;
  const foot=switchLink||incumbentNote||townshipLine?`<div class="map-detail-foot">${switchLink}${townshipLine}${incumbentNote}</div>`:'';
  if(!city){detail.innerHTML='<p class="kicker">選擇縣市</p><h2>從地圖開始</h2><p class="map-detail-lead">點選地圖上的縣市，查看提出文化政策的候選人與政黨。</p>';return}
  const head=town
    ?`<p class="kicker">${esc(city)} / 縣轄市長</p><h2>${esc(town.town)}</h2>`
      +`<p class="map-detail-scope">縣轄市，不屬於縣市長選舉</p>`
      +`<button type="button" class="map-detail-switch" data-back="1">← 回到${esc(city)}</button>`
    :shape
    ?`<p class="kicker">${esc(city)} / ${OFFICES[office].label}</p><h2>${esc(shapeLabel(shape))}</h2>`
      +`<p class="map-detail-scope">${esc(shape.districts.length===1?districtScope(shape.districts[0]):`${shape.districts.length} 個選舉區`)}・應選 ${shape.seats} 席</p>`
      +`<button type="button" class="map-detail-switch" data-back="1">← 回到${esc(city)}全部選舉區</button>`
    :`<p class="kicker">${esc(REGION_OF[city]||'')} / ${OFFICES[office].label}</p><h2>${esc(city)}</h2>`;
  const incumbentBlock=office==='mayor'&&!shape&&!town?(mayorIncumbents.get(city)||[]).map(incumbentCard).join(''):'';
  detail.innerHTML=head+incumbentBlock+(list.length
    ?`<p class="map-detail-lead">登記參選 ${total} 位，其中 ${list.length} 位提出文化政策，共 ${list.reduce((sum,item)=>sum+item.recordCount,0)} 筆紀錄。</p>${office==='councilor'&&!shape?districtGroups(list,city):`<div class="map-candidates">${list.map(item=>candidateCard(item,{district:!shape})).join('')}</div>`}${missingNote}${regionLink}`
    :`<p class="map-detail-lead">登記參選 ${total} 位，目前尚未收錄符合口徑的文化政策。這不代表候選人沒有提出，只是本站還沒有可查核的資料。</p>${office==='mayor'&&missing.length?`<p class="map-detail-missing">登記參選人：${nameList(missing,12)}</p>`:''}${regionLink}`)+foot;
  detail.querySelector('[data-back]')?.addEventListener('click',()=>{activeDistrict='';activeTownship='';renderDistricts();renderDetail()});
  detail.querySelector('[data-switch]:not([data-back])')?.addEventListener('click',event=>setOffice(event.currentTarget.dataset.switch));
}

function selectCity(city,{scroll=false}={}){
  if(city!==activeCity){activeDistrict='';activeTownship=''}
  activeCity=city;
  document.querySelectorAll('#taiwanMap .county').forEach(node=>node.classList.toggle('is-active',node.dataset.city===city));
  document.querySelector('#taiwanMap .county-outline-active')?.setAttribute('d',document.querySelector(`#taiwanMap .county[data-city="${CSS.escape(city)}"]`)?.getAttribute('d')||'');
  document.querySelectorAll('.compare-row').forEach(node=>node.classList.toggle('is-active',node.dataset.city===city));
  renderDistricts();zoomOff=false;applyZoom(city);renderDetail();
  if(scroll)document.getElementById('map').scrollIntoView({behavior:'smooth',block:'start'});
}

function setOffice(next){
  office=next;activeDistrict='';activeTownship='';
  document.querySelectorAll('[data-office]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.office===office)));
  document.getElementById('layerSwitch').hidden=office!=='councilor';
  // drawMap 會重建整張 svg（含空的圖層群組），兩個圖層都要重畫
  drawMap();renderDistricts();applyZoom(activeCity);renderDetail();renderLegend();renderParties();
}

function setLayer(next){
  districtLayer=next;activeDistrict='';
  document.querySelectorAll('[data-layer]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layer===districtLayer)));
  drawMap();applyZoom(activeCity);renderDetail();renderLegend();
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
  if(office==='councilor'){
    document.getElementById('partyLegend').innerHTML=districtLayer==='indigenous'
      ?'<span><b class="legend-count">1</b>數字＝原住民選舉區已收錄的議員人數。原住民選舉區依身分別劃分，範圍涵蓋全縣市或跨多個鄉鎮市區，與區域選舉區重疊，因此不畫界線。</span>'
      :'<span><b class="legend-count">7</b>數字＝本站已收錄、提出文化政策的議員人數</span><span class="legend-district"><i></i>點選縣市後顯示選舉區界線，已收錄候選人的選舉區填色</span>';
    return}
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
// 名冊由 loadCandidateDataset 一併載入（同時供議員選區查詢），不另外重複讀取。
Promise.all([loadJson('map-geometry.json','無法讀取地圖'),loadCandidateDataset({districts:true}),loadJson('data/party_colors.json','無法讀取政黨色'),
  // 選舉區界線讀不到時只是沒有界線，不影響其餘地圖
  fetch('district-geometry.json').then(response=>response.ok?response.json():null).catch(()=>null),
  // 縣轄市界線讀不到時只是沒有那一層，不影響其餘地圖
  fetch('township-geometry.json').then(response=>response.ok?response.json():null).catch(()=>null),
  // 政見實現追蹤讀不到時只是沒有現任縣市長卡片
  fetch('data/pledge_fulfillment.json').then(response=>response.ok?response.json():null).catch(()=>null)]).then(([geo,data,colors,shapes,towns,fulfillment])=>{
  if(shapes){districtShapes=new Map(shapes.districts.map(shape=>[shape.id,shape]));
    shapes.districts.forEach(shape=>shape.districts.forEach(name=>shapeOfDistrict.set(name,shape)));}
  if(towns)townshipShapes=new Map(towns.townships.map(shape=>[shape.id,shape]));
  const roster=data.registered_candidates;
  if(!roster)throw Error('無法讀取登記名冊');
  geometry=geo;PARTY_COLORS=colors;registeredSources=roster.sources||(roster.source?[roster.source]:[]);incumbents=incumbentNamesByCity(data.incumbent_records||[]);
  mayorIncumbents=buildMayorIncumbents(fulfillment?.records||[],data.incumbent_records||[]);
  roster.records.forEach(record=>{
    // 縣轄市長不進地圖的圓點與人數統計，只記每縣的登記人數，供側欄的導向連結使用
    if(record.office==='縣轄市長'){
      if(!township.registered.has(record.city))township.registered.set(record.city,[]);
      township.registered.get(record.city).push(record);return;
    }
    const key=record.office==='縣市長'?'mayor':record.office==='縣市議員'?'councilor':'';
    if(!key)return;
    if(!registered[key].has(record.city))registered[key].set(record.city,[]);
    registered[key].get(record.city).push(record);
  });
  const shared=data.shared_policy_groups||[];
  byOffice={mayor:groupByCity(data.records,shared,'mayor'),councilor:groupByCity(data.records,shared,'councilor')};
  groupCandidateRecords(data.records.filter(record=>record.office==='縣轄市長'),shared).forEach(item=>{
    if(!township.byCity.has(item.city))township.byCity.set(item.city,[]);
    township.byCity.get(item.city).push(item);
  });
  const cities=new Set([...byOffice.mayor.keys(),...byOffice.councilor.keys()]);
  const all=[...byOffice.mayor.values(),...byOffice.councilor.values()].flat();
  statCities.textContent=`${cities.size}/22`;
  const registeredTotal=key=>[...registered[key].values()].flat().length.toLocaleString('zh-TW');
  statMayors.innerHTML=`${[...byOffice.mayor.values()].flat().length}<small>/${registeredTotal('mayor')}</small>`;
  statCouncilors.innerHTML=`${[...byOffice.councilor.values()].flat().length}<small>/${registeredTotal('councilor')}</small>`;
  // 縣市長／議員與縣轄市長取自不同公告，來源依標題去重後全部列出
  const citations=[...new Map(registeredSources.map(item=>[item.title+item.as_of,item])).values()];
  if(citations.length)registeredNote.innerHTML='參選人數：'+citations.map(item=>`<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>（製表日期 ${esc(item.as_of)}）`).join('、');
  statParties.textContent=new Set(all.map(item=>item.party)).size;
  document.querySelectorAll('[data-office]').forEach(button=>button.addEventListener('click',()=>setOffice(button.dataset.office)));
  document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>setLayer(button.dataset.layer)));
  document.getElementById('zoomOut').addEventListener('click',()=>{zoomOff=true;applyZoom(activeCity)});
  window.addEventListener('resize',()=>applyZoom(activeCity,{animate:false}));
  const requested=new URLSearchParams(location.search).get('city');
  activeCity=CITY_ORDER.includes(requested)?requested:CITY_ORDER.find(city=>byOffice.mayor.has(city))||'';
  drawMap();renderCompare();renderLegend();renderParties();selectCity(activeCity);
}).catch(error=>{
  console.error(error);
  document.getElementById('mapDetail').innerHTML='<p class="kicker">ERROR</p><h2>資料暫時無法載入</h2><p class="map-detail-lead">請稍後再試。</p>';
});
