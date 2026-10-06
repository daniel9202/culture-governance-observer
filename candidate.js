// 候選人頁：candidate.html?city=縣市&office=mayor|councilor&name=姓名
// 以「縣市＋職務＋姓名」對應合併後的候選人卡片（與 groupCandidateRecords 的去重規則相同）。
const params=new URLSearchParams(location.search);
const city=params.get('city')||'',office=params.get('office')==='councilor'?'councilor':'mayor',candidateName=params.get('name')||'';
const OFFICE_LABEL={mayor:'縣市長',councilor:'縣市議員'};
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const listPage=key=>`${key==='councilor'?'councilors':'mayors'}.html?city=${encodeURIComponent(city)}`;

function renderContext(){
  context.innerHTML=city?`<a href="${regionUrl(city)}">← ${escapeHtml(city)}地方頁：文化預算、統計與全部候選人</a><a href="${listPage(office)}">${escapeHtml(city)}全部${OFFICE_LABEL[office]}候選人政見</a>`:'';
}

loadCandidateDataset().then(data=>{
  const inCity=groupCandidateRecords(data.records.filter(record=>record.city===city),(data.shared_policy_groups||[]).filter(policy=>policy.city===city));
  const sameOffice=inCity.filter(record=>officeKey(record.office)===office);
  const target=sameOffice.find(record=>record.candidate===candidateName);
  renderContext();
  if(!target){
    document.title='找不到候選人｜文化治理觀察站';
    kicker.textContent=city?`${city} / ${OFFICE_LABEL[office]}`:'CANDIDATE';
    title.textContent='找不到這位候選人';
    card.innerHTML='<p class="empty">本站目前沒有這位候選人的本屆競選文化政見，可能尚未收錄，或姓名已更正。可從上方連結查看該縣市的所有候選人。</p>';
  }else{
    document.title=`${target.candidate}｜${city}${OFFICE_LABEL[office]}候選人文化政見｜文化治理觀察站`;
    kicker.textContent=`${city} / ${OFFICE_LABEL[office]}候選人`;
    title.textContent=target.candidate;
    party.textContent=target.party||'政黨待確認';
    card.innerHTML=renderCandidateCard(target,{showCity:false,linkName:false,openShared:true});
  }
  const rest=sameOffice.filter(record=>record!==target).sort((a,b)=>a.candidate.localeCompare(b.candidate,'zh-Hant'));
  if(rest.length){
    othersTitle.textContent=`${city}其他${OFFICE_LABEL[office]}候選人`;
    othersList.innerHTML=rest.map(record=>`<a class="candidate-chip" href="${escapeHtml(candidateUrl(record))}">${escapeHtml(record.candidate)}<small>${escapeHtml(record.party||'')}</small></a>`).join('');
    others.hidden=false;
  }
}).catch(()=>{card.innerHTML='<p class="empty">資料載入失敗，請稍後再試。</p>'});
