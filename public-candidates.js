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
  // 政策論述只用來源有的原文，空就是空，不拿摘要補位（顯示「資料彙整中。」）。
  policy_argument:record.policy_argument||'',
  concrete_proposals:Array.isArray(record.concrete_proposals)?record.concrete_proposals:[record.summary].filter(Boolean),
  related_statements:Array.isArray(record.related_statements)?record.related_statements:[],
  // 前台唯一顯示的本站說明：只交代出處。editor_notes 留給後台與審核，前台不渲染。
  public_note:typeof record.public_note==='string'?record.public_note.trim():'',
  related_sources:Array.isArray(record.related_sources)?record.related_sources:[],
  corrections:Array.isArray(record.corrections)?record.corrections:[],
  source_type:record.source_type||'審核上架',
  review_status:record.review_status||'人工審核',
});
const hasRealTitle=title=>{
  const clean=String(title||'').trim();
  return Boolean(clean)&&!/^相關來源 \d+$/.test(clean)&&clean!=='來源';
};
const sourceTitle=(title,url)=>{
  if(hasRealTitle(title))return String(title).trim();
  try{return `延伸來源（${new URL(url).hostname.replace(/^www\./,'')}）`;}catch{return '延伸來源';}
};
const sourceEntries=record=>{
  const entries=[];
  const add=(title,url)=>{if(typeof url==='string'&&url.trim())entries.push({title:sourceTitle(title,url.trim()),url:url.trim(),hasTitle:hasRealTitle(title)})};
  add(record.source_title,record.source_url);
  Object.values(record.field_sources||{}).flat().forEach(source=>add(source?.title,source?.url));
  (record.related_sources||[]).forEach((source,index)=>{
    if(typeof source==='string')add('',source);
    else add(source?.title,source?.url);
  });
  return entries;
};
// 同一網址只留一條，維持第一次出現的位置；有真實標題的優先，不被後來的裸網址蓋掉。
const uniqueSources=sources=>{
  const byUrl=new Map;
  sources.forEach(source=>{
    const existing=byUrl.get(source.url);
    if(!existing||(!existing.hasTitle&&source.hasTitle))byUrl.set(source.url,source);
  });
  return [...byUrl.values()];
};
const emptyCandidateGroup=record=>({...record,topics:[],topic_categories:[],topic_subcategories:[],policy_titles:[],policy_arguments:[],concrete_proposals:[],related_statements:[],public_notes:[],ids:[],sources:[],published_dates:[],corrections:[],shared_policies:[],party_shared_policies:[],regional_shared_policies:[]});
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
    if(record.policy_argument)group.policy_arguments.push(record.policy_argument);
    group.concrete_proposals.push(...(record.concrete_proposals.length?record.concrete_proposals:[record.summary]));
    group.related_statements.push(...record.related_statements);
    // 出處說明逐筆保留並帶上該筆標題，不去重合併；標題為空時只印備註句。
    if(record.public_note)group.public_notes.push({title:record.policy_title||'',note:record.public_note});
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
  return [...groups.values()].map(group=>({...group,district:councilDistrict(group),
    topics:uniqueValues(group.topics),topic_categories:uniqueValues(group.topic_categories),topic_subcategories:uniqueValues(group.topic_subcategories),policy_titles:uniqueValues(group.policy_titles),policy_arguments:uniqueValues(group.policy_arguments),concrete_proposals:uniqueValues(group.concrete_proposals),related_statements:uniqueValues(group.related_statements),ids:uniqueValues(group.ids),
    sources:uniqueSources(group.sources),published_dates:uniqueValues(group.published_dates).sort(),
    shared_policies:[...new Map(group.shared_policies.map(policy=>[policy.id,policy])).values()],
    party_shared_policies:[...new Map(group.party_shared_policies.map(policy=>[policy.id,policy])).values()],
    regional_shared_policies:[...new Map(group.regional_shared_policies.map(policy=>[policy.id,policy])).values()],
  }));
};
// 議員任內文化問政（非本屆政見）收在「現任追蹤」；地圖與議員頁依縣市計人數並連過去。
// 只算議員；縣市長的任內施政另列在現任追蹤首長分頁。
// 現任紀錄的身分（docs/FIELD-CONTRACT-INCUMBENT.md）：只讀 office_category（首長／民意代表），current_office 只用來顯示，不從文字推斷身分。
// 尚未補 office_category 的舊資料暫依參選職務 office 判斷，59 筆補完、欄位改必填後拿掉這段。
const OFFICE_CATEGORY_KINDS={首長:'mayor',民意代表:'representative'};
window.incumbentKind=record=>OFFICE_CATEGORY_KINDS[record?.office_category]||(['縣市長','縣轄市長'].includes(record?.office)?'mayor':'representative');
window.incumbentNamesByCity=records=>records.filter(record=>incumbentKind(record)!=='mayor').reduce((map,record)=>map.set(record.city,(map.get(record.city)||new Set).add(record.candidate)),new Map);
window.incumbentLink=(count,city,className='incumbent-link')=>count?`<a class="${className}" href="fulfillment.html?tab=council${city?`&city=${encodeURIComponent(city)}`:''}">${city?'本縣市':''}另有 ${count} 位民意代表的任內文化問政紀錄（非本屆政見）→</a>`:'';
// 議員選區：資料本身有 district 欄位（資料端日後新增）就用資料的值；
// 沒有時依中選會名冊（registered_candidates.json）以「縣市＋姓名」查詢，姓名比對規則同地圖（名冊姓名可能附原住民族傳統名字）。
// 名冊同縣市有兩位以上符合時不猜，留空。名冊約 400 KB，只有需要選區的頁面才以 loadCandidateDataset({districts:true}) 載入。
let councilRoster=[];
window.councilDistrict=record=>{
  if(record?.district)return record.district;
  if(!String(record?.office).includes('議員'))return '';
  const inCity=councilRoster.filter(item=>item.city===record.city);
  const exact=inCity.filter(item=>item.candidate===record.candidate);
  const matches=exact.length?exact:inCity.filter(item=>item.candidate.startsWith(record.candidate));
  return matches.length===1?matches[0].district:'';
};
// 中選會選舉區劃分公告（data/election_districts.json）：選舉區的範圍與類別。
// 原住民選舉區涵蓋全縣市或跨多個鄉鎮市區，與區域選舉區重疊，標籤不用「第N選舉區」。
let districtScopes=new Map;
window.districtDetail=district=>districtScopes.get(district)||null;
window.cityDistricts=city=>[...districtScopes.values()].filter(record=>record.city===city);
window.indigenousDistrict=district=>districtDetail(district)?.district_type.includes('原住民')||false;
// 「新北市第5選舉區」→「第5選舉區」；原住民選舉區→「平地原住民選區」
window.districtLabel=record=>{
  const district=record?.district||'';
  const detail=districtDetail(district);
  if(detail&&detail.district_type!=='區域')return `${detail.district_type}選區`;
  return record?.city&&district.startsWith(record.city)?district.slice(record.city.length):district;
};
// 選舉區範圍：區域選舉區列鄉鎮市區；新竹市與竹北市以村里劃分，只報里數；原住民選舉區照公告原文。
window.districtScope=district=>{
  const detail=districtDetail(district);
  if(!detail)return '';
  if(detail.district_type!=='區域')return detail.scope;
  if(detail.unit_level==='村里')return `${detail.scope_prefix}${detail.units.length} 個里`;
  return detail.units.join('、');
};
// 標籤加上範圍：「第1選舉區（北投區、士林區）」；原住民選舉區涵蓋全縣市時不重複寫縣市名
window.districtFullLabel=record=>{
  const label=districtLabel(record),scope=districtScope(record?.district);
  if(!scope)return label;
  if(!indigenousDistrict(record?.district))return `${label}（${scope}）`;
  const towns=scope.replace(/之(平地|山地)原住民$/,'');
  return towns===record?.city?label:`${label}（${towns}）`;
};
// 原住民選舉區排在區域選舉區之後
window.districtNumber=district=>(indigenousDistrict(district)?1e6:0)+Number(String(district).match(/第(\d+)選舉區/)?.[1]||Infinity);
window.loadCandidateDataset=async({districts=false}={})=>{
  const [staticData,sharedData,roster,districtTable]=await Promise.all([
    fetch('data/candidates.json').then(response=>{if(!response.ok)throw Error('無法讀取候選人資料');return response.json()}),
    fetch('data/shared_policy_groups.json').then(response=>{if(!response.ok)throw Error('無法讀取共同政見資料');return response.json()}),
    // 名冊讀取失敗時只是不顯示選區，不影響政見本身
    districts?fetch('data/registered_candidates.json').then(response=>response.ok?response.json():null).catch(()=>null):null,
    districts?fetch('data/election_districts.json').then(response=>response.ok?response.json():null).catch(()=>null):null,
  ]);
  if(roster)councilRoster=(roster.records||[]).filter(record=>record.office==='縣市議員');
  if(districtTable)districtScopes=new Map((districtTable.records||[]).map(record=>[record.district,record]));
  // 只使用經 build_data.py 驗證的正式資料；Cloudflare 已核准 API 屬舊流程，已停用。
  // 前台的政見與統計只收「本屆競選政見」；公職政績（含舊值現任議員個人頁內容、問政／提案、首長施政）另存 incumbent_records（依資料端的 content_nature 欄位）。
  // 目前沒有任何公職身分的候選人當一般候選人處理（2026-10-28 使用者決定），office_category 為「已卸任」的紀錄不進現任追蹤。
  const records=staticData.records||[];
  return {...staticData,records:records.filter(record=>record.content_nature==='本屆競選政見'),incumbent_records:records.filter(record=>record.content_nature!=='本屆競選政見'&&record.office_category!=='已卸任'),shared_policy_groups:sharedData.records||[],registered_candidates:roster};
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
    return `<article class="card candidate-card"><div class="card-meta">${showCity?`<span class="tag">${esc(x.city)}</span>`:''}${x.district?`<span class="tag tag-district">${esc(districtFullLabel(x))}</span>`:''}<span class="tag">${esc(x.office)}</span>${topicTagList(x).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><h3>${name}</h3><span class="party">${esc(x.party)}</span>${(x.policy_titles||[]).length?`<p class="policy-titles">${x.policy_titles.map(t=>`<span>${esc(t)}</span>`).join('')}</p>`:''}<div class="policy-layer"><h4>政策論述</h4>${bullets(x.policy_arguments,'資料彙整中。')}</div><div class="policy-layer policy-actions"><h4>具體主張</h4>${bullets(x.concrete_proposals,'尚未收錄具體主張。')}</div><div class="policy-layer policy-statements"><h4>相關發言</h4>${bullets(x.related_statements,'尚未收錄可核實的相關發言。')}</div>${(x.public_notes||[]).length?`<div class="policy-layer policy-editor-note"><h4>本站備註</h4><ul>${x.public_notes.map(item=>`<li>${item.title?`<strong>${esc(item.title)}</strong>：`:''}${esc(item.note)}</li>`).join('')}</ul></div>`:''}${shared}<div class="policy-layer policy-sources"><h4>相關來源</h4>${sourceList(x)}</div><small class="verification">發布：${esc(x.published_dates.join('、')||'來源未載日期')} · 最後查核：${esc(x.last_verified)} · ${reportLink(x.ids,`${x.city} ${x.office} ${x.candidate}`)}</small></article>`;
  };
}
