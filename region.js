const city=new URLSearchParams(location.search).get('city')||'臺北市';
const safeUrl=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'#'}catch{return '#'}};
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const num=value=>value==null?'—':Number(value).toLocaleString('zh-TW');
const moneyThousand=value=>value==null?'—':`${(Number(value)/1000).toLocaleString('zh-TW',{maximumFractionDigits:1})} 百萬元`;
const metric=(label,value,unit='')=>`<div class="stat-line"><span>${label}</span><strong>${typeof value==='string'?value:num(value)}${unit}</strong></div>`;
const svgNode=(name,attrs={},text='')=>{const node=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value));if(text)node.textContent=text;return node};
const renderFinanceChart=(element,rows,series,unit)=>{
  const width=Math.max(320,Math.round(element.getBoundingClientRect().width)),height=280,margin={top:18,right:18,bottom:42,left:64};
  const values=rows.flatMap(row=>series.map(item=>Number(row[item.key]))).filter(Number.isFinite),minimum=Math.min(...values),maximum=Math.max(...values),padding=Math.max((maximum-minimum)*.12,maximum*.04),low=Math.max(0,minimum-padding),high=maximum+padding;
  const x=index=>margin.left+(width-margin.left-margin.right)*(rows.length===1?0:index/(rows.length-1));
  const y=value=>margin.top+(height-margin.top-margin.bottom)*(1-(value-low)/(high-low||1));
  const format=value=>unit==='億元'?`${value.toFixed(1)}`:`${value.toFixed(1)}%`;
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':element.dataset.label});
  svg.append(svgNode('rect',{class:'chart-frame',x:margin.left,y:margin.top,width:width-margin.left-margin.right,height:height-margin.top-margin.bottom}));
  for(let index=0;index<5;index++){
    const value=low+(high-low)*index/4,position=y(value);
    svg.append(svgNode('line',{class:'chart-grid',x1:margin.left,x2:width-margin.right,y1:position,y2:position}));
    svg.append(svgNode('text',{class:'chart-axis',x:margin.left-10,y:position+4,'text-anchor':'end'},format(value)));
  }
  const tickIndexes=[...new Set((width<500?[0,Math.floor((rows.length-1)/3),Math.floor((rows.length-1)*2/3),rows.length-1]:[0,Math.floor((rows.length-1)/4),Math.floor((rows.length-1)/2),Math.floor((rows.length-1)*3/4),rows.length-1]))];
  tickIndexes.forEach(index=>svg.append(svgNode('text',{class:'chart-axis',x:x(index),y:height-15,'text-anchor':index===0?'start':index===rows.length-1?'end':'middle'},rows[index].year)));
  series.forEach((item,seriesIndex)=>{
    const points=rows.map((row,index)=>`${x(index)},${y(Number(row[item.key]))}`).join(' ');
    svg.append(svgNode('polyline',{class:`chart-line chart-series-${seriesIndex+1}`,points}));
    rows.forEach((row,index)=>{
      const value=Number(row[item.key]),circle=svgNode('circle',{class:`chart-point chart-series-${seriesIndex+1}`,cx:x(index),cy:y(value),r:4,tabindex:0,'aria-label':`${row.year} 年${item.label}${format(value)}${unit==='億元'?' 億元':''}`});
      circle.append(svgNode('title',{},`${row.year} 年｜${item.label} ${format(value)}${unit==='億元'?' 億元':''}`));
      const show=()=>{element.nextElementSibling.textContent=`${row.year} 年｜${item.label} ${format(value)}${unit==='億元'?' 億元':''}`};
      circle.addEventListener('focus',show);circle.addEventListener('pointerenter',show);circle.addEventListener('click',show);svg.append(circle);
    });
  });
  element.replaceChildren(svg);
};
const financeChart=(id,title,label,series)=>`<article class="finance-chart"><div class="chart-heading"><h3>${title}</h3><div class="chart-legend">${series.map((item,index)=>`<span><i class="chart-series-${index+1}"></i>${item.label}</span>`).join('')}</div></div><div class="chart-canvas" id="${id}" data-label="${label}"></div><p class="chart-readout" aria-live="polite">滑過或點選資料點查看數值</p></article>`;
const renderFinanceSection=records=>{
  if(!records.length){budget.innerHTML='<p class="empty empty-dark">預算與支出資料尚待查核。</p>';return}
  const sorted=[...records].sort((a,b)=>a.year-b.year),latest=sorted.at(-1),scopeNotes=[...new Set(sorted.map(row=>row.bureau_scope_note).filter(Boolean))];
  budget.innerHTML=`<article class="gov-card"><h3>${escapeHtml(latest.year)} ${escapeHtml(latest.city)}</h3><div class="metric"><span>政事別文化支出預算</span><strong>${escapeHtml(latest.cultural_expenditure_budget_display)}</strong></div><div class="metric"><span>政事別文化支出決算</span><strong>${escapeHtml(latest.cultural_expenditure_final_display)}</strong></div><div class="metric"><span>文化局（處）預算</span><strong>${escapeHtml(latest.bureau_budget_display)}</strong></div><div class="metric"><span>文化局（處）決算</span><strong>${escapeHtml(latest.bureau_final_display)}</strong></div><p>${escapeHtml(latest.methodology)}</p>${scopeNotes.map(note=>`<p><strong>口徑提醒：</strong>${escapeHtml(note)}</p>`).join('')}<a href="${escapeHtml(safeUrl(latest.official_source_url))}" target="_blank" rel="noopener">官方來源 ↗</a></article><div class="finance-toolbar" aria-label="趨勢圖年度範圍"><span>年度趨勢</span><button type="button" data-years="all" aria-pressed="true">2011–2024</button><button type="button" data-years="5" aria-pressed="false">近 5 年</button></div><div class="finance-charts">${financeChart('spending-chart','地方政府文化支出','地方政府文化支出逐年預算與決算，單位億元',[{label:'預算',key:'cultural_expenditure_budget'},{label:'決算',key:'cultural_expenditure_final'}])}${financeChart('bureau-chart','文化局（處）預決算','文化局處逐年預算與決算，單位億元',[{label:'預算',key:'bureau_budget'},{label:'決算',key:'bureau_final'}])}${financeChart('ratio-chart','占地方政府總預算比率','文化支出與文化局處預算占地方政府總預算比率',[{label:'文化支出預算占比',key:'cultural_budget_ratio'},{label:'文化局（處）預算占比',key:'bureau_budget_ratio'}])}</div>`;
  const draw=range=>{
    const selected=range==='5'?sorted.slice(-5):sorted;
    renderFinanceChart(document.getElementById('spending-chart'),selected,[{label:'預算',key:'cultural_expenditure_budget'},{label:'決算',key:'cultural_expenditure_final'}], '億元');
    renderFinanceChart(document.getElementById('bureau-chart'),selected,[{label:'預算',key:'bureau_budget'},{label:'決算',key:'bureau_final'}], '億元');
    renderFinanceChart(document.getElementById('ratio-chart'),selected,[{label:'文化支出預算占比',key:'cultural_budget_ratio'},{label:'文化局（處）預算占比',key:'bureau_budget_ratio'}], '%');
  };
  const amountFields=['cultural_expenditure_budget','cultural_expenditure_final','bureau_budget','bureau_final'];
  sorted.forEach(row=>amountFields.forEach(key=>row[key]=Number(row[key])/100000000));
  budget.querySelectorAll('.finance-toolbar button').forEach(button=>button.addEventListener('click',()=>{budget.querySelectorAll('.finance-toolbar button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));draw(button.dataset.years)}));
  let timer;new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>draw(budget.querySelector('.finance-toolbar button[aria-pressed="true"]').dataset.years),80)}).observe(budget);
  draw('all');
};

Promise.all(['candidates','governments','local_cultural_issues','region_metrics'].map(x=>fetch('data/'+x+'.json').then(r=>r.json()))).then(([p,g,i,m])=>{
  const P=p.records.filter(x=>x.city===city),G=g.records.filter(x=>x.city===city),I=i.records.filter(x=>x.city===city),M=m.records.find(x=>x.city===city),topics=[...new Set(P.flatMap(x=>x.topics))];
  document.title=`${city}文化儀表板｜文化治理觀察站`;
  title.textContent=city+'文化儀表板';
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
    document.getElementById('stats-source').innerHTML=`<p><strong>資料來源：</strong><a href="${escapeHtml(safeUrl(M.source_url))}" target="_blank" rel="noopener">${escapeHtml(M.source_title)} ↗</a></p><p>最後查核：${escapeHtml(M.last_verified)}。${escapeHtml(M.notes)}</p>`;
    support.innerHTML=`<article class="support-card"><div><p class="kicker">PROGRAM FUNDING</p><h3>社區營造及地方文化館計畫經費</h3><p>僅包含文化部「社區營造」及「博物館與地方文化館」計畫的中央核定補助與地方配合款，不代表中央對地方的全部補助。</p></div><div>${metric('兩項計畫中央核定補助',moneyThousand(M.central_grants_thousand))}${metric('兩項計畫地方配合款',moneyThousand(M.local_matching_thousand))}${metric('社區營造－中央補助',moneyThousand(M.community_grants_thousand))}${metric('社區營造－地方配合',moneyThousand(M.community_matching_thousand))}${metric('博物館／地方文化館－中央補助',moneyThousand(M.museum_hall_grants_thousand))}${metric('博物館／地方文化館－地方配合',moneyThousand(M.museum_hall_matching_thousand))}</div></article>`;
  }else{
    stats.innerHTML='<p>縣市文化統計尚待查核。</p>';
    support.innerHTML='';
  }

  renderFinanceSection(G);
  candidates.innerHTML=P.map(x=>`<article class="card"><div class="card-meta"><span class="tag">${escapeHtml(x.office)}</span>${x.topics.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div><h3>${escapeHtml(x.candidate)}</h3><span class="party">${escapeHtml(x.party)}</span><div class="policy-layer"><h4>政策論述</h4><p>${escapeHtml(x.policy_argument||x.summary)}</p></div><div class="policy-layer policy-actions"><h4>具體主張</h4><ul>${(x.concrete_proposals||[x.summary]).map(p=>`<li>${escapeHtml(p)}</li>`).join('')}</ul></div><div class="policy-layer policy-statements"><h4>相關發言</h4>${(x.related_statements||[]).length?`<ul>${x.related_statements.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>`:'<p>尚未收錄可核實的相關發言。</p>'}</div><div class="source-row"><a href="${escapeHtml(safeUrl(x.source_url))}" target="_blank" rel="noopener">${escapeHtml(x.source_title||'主要來源')} ↗</a>${(x.related_sources||[]).map((url,i)=>`<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener">輔助來源 ${i+1} ↗</a>`).join('')}</div></article>`).join('')||'<p class="empty">候選人政見尚待收錄。</p>';
  issues.innerHTML=I.map(x=>`<article class="card"><div class="card-meta"><span class="tag">${escapeHtml(x.issue_type)}</span></div><h3>${escapeHtml(x.title)}</h3><p class="summary">${escapeHtml(x.summary)}</p><a href="${escapeHtml(safeUrl(x.source_url))}" target="_blank" rel="noopener">查看來源 ↗</a></article>`).join('')||'<p class="empty">地方文化議題尚待收錄。</p>';
}).catch(()=>{lede.textContent='資料載入失敗，請稍後再試。'});
