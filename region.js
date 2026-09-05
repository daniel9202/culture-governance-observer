const city=new URLSearchParams(location.search).get('city')||'臺北市';
const safeUrl=value=>{try{return new URL(value).href}catch{return '#'}};
const num=value=>value==null?'—':Number(value).toLocaleString('zh-TW');
const moneyThousand=value=>value==null?'—':`${(Number(value)/1000).toLocaleString('zh-TW',{maximumFractionDigits:1})} 百萬元`;
const metric=(label,value,unit='')=>`<div class="stat-line"><span>${label}</span><strong>${typeof value==='string'?value:num(value)}${unit}</strong></div>`;

Promise.all(['candidates','governments','local_cultural_issues','region_metrics'].map(x=>fetch('data/'+x+'.json').then(r=>r.json()))).then(([p,g,i,m])=>{
  const P=p.records.filter(x=>x.city===city),G=g.records.filter(x=>x.city===city),I=i.records.filter(x=>x.city===city),M=m.records.find(x=>x.city===city),topics=[...new Set(P.flatMap(x=>x.topics))];
  document.title=`${city}文化 Board｜文化治理觀察站`;
  title.textContent=city+'文化 Board';
  lede.textContent=`已收錄 ${new Set(P.map(x=>x.candidate)).size} 位候選人、${P.length} 筆文化政見、${I.length} 筆地方文化議題，並彙整 ${M?.year||'待查核'} 年縣市文化統計。`;
  count.textContent=`候選人 ${new Set(P.map(x=>x.candidate)).size} 位；文化主題：${topics.join('、')||'尚待查核'}`;

  if(M){
    document.getElementById('stats-note').textContent=`${M.year} 年縣市級文化統計；以下均為原始總量，尚未按人口標準化。`;
    stats.innerHTML=[
      ['文化資產',metric('古蹟',M.monuments,' 處')+metric('歷史建築',M.historical_buildings,' 處')+metric('文化景觀',M.cultural_landscapes,' 項')+metric('考古遺址',M.archaeological_sites,' 處')],
      ['文化場館',metric('文化展演場地',M.cultural_venues_total,' 處')+metric('專職藝文場地',M.dedicated_arts_venues,' 處')+metric('法定博物館',M.statutory_museums,' 家')+metric('地方文化館',M.local_cultural_halls,' 家')],
      ['藝文活動',metric('藝文活動',M.arts_events_total,' 個')+metric('出席人次',M.arts_attendance_thousands,' 千人次')+metric('藝術節慶',M.festivals,' 個')+metric('節慶參觀人次',M.festival_attendance,' 人次')],
      ['文化生態',metric('藝文團體',M.arts_groups,' 個')+metric('文化藝術基金會',M.arts_foundations,' 家')+metric('街頭展演場地',M.street_performance_venues,' 處')+metric('街頭藝人／組數',M.street_artists_or_groups)],
    ].map(([heading,body])=>`<article class="stat-card"><h3>${heading}</h3>${body}</article>`).join('');
    document.getElementById('stats-source').innerHTML=`<p><strong>資料來源：</strong><a href="${safeUrl(M.source_url)}" target="_blank" rel="noopener">${M.source_title} ↗</a></p><p>最後查核：${M.last_verified}。${M.notes}</p>`;
    support.innerHTML=`<article class="support-card"><div><p class="kicker">CENTRAL SUPPORT</p><h3>中央補助與地方配合款</h3><p>文化部社區營造、博物館與地方文化館計畫；不併入地方文化預算或文化支出。</p></div><div>${metric('中央核定補助',moneyThousand(M.central_grants_thousand))}${metric('地方配合款',moneyThousand(M.local_matching_thousand))}${metric('社區營造補助',moneyThousand(M.community_grants_thousand))}${metric('博物館及地方文化館補助',moneyThousand(M.museum_hall_grants_thousand))}</div></article>`;
  }else{
    stats.innerHTML='<p>縣市文化統計尚待查核。</p>';
    support.innerHTML='';
  }

  budget.innerHTML=G.length?G.map(x=>`<article class="gov-card"><h3>${x.year} ${x.city}</h3><div class="metric"><span>文化局／文化處預算</span><strong>${x.culture_budget_display}</strong></div><div class="metric"><span>政事別文化支出</span><strong>${x.actual_spending_display}</strong></div><p>${x.methodology}</p><a href="${safeUrl(x.official_source_url)}" target="_blank" rel="noopener">官方來源 ↗</a></article>`).join(''):'<p class="empty empty-dark">預算與支出資料尚待查核。</p>';
  candidates.innerHTML=P.map(x=>`<article class="card"><h3>${x.candidate}</h3><span class="party">${x.party}</span><p class="summary">${x.summary}</p></article>`).join('')||'<p class="empty">候選人政見尚待收錄。</p>';
  issues.innerHTML=I.map(x=>`<article class="card"><div class="card-meta"><span class="tag">${x.issue_type}</span></div><h3>${x.title}</h3><p class="summary">${x.summary}</p><a href="${safeUrl(x.source_url)}" target="_blank" rel="noopener">查看來源 ↗</a></article>`).join('')||'<p class="empty">地方文化議題尚待收錄。</p>';
}).catch(()=>{lede.textContent='資料載入失敗，請稍後再試。'});
