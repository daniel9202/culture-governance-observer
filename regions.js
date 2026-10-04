const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
Promise.all([loadCandidateDataset(),...['governments','local_cultural_issues','civic_policy_calls','region_metrics'].map(x=>fetch('data/'+x+'.json').then(r=>r.json()))]).then(([p,g,i,c,m])=>{
  const available=new Set([p,g,i,c,m].flatMap(x=>x.records.map(r=>r.city)));
  const cities=CITY_ORDER.filter(city=>available.has(city));
  regions.innerHTML=cities.map(city=>{
    const n=p.records.filter(x=>x.city===city),q=i.records.filter(x=>x.city===city),v=c.records.filter(x=>x.city===city),years=g.records.filter(x=>x.city===city).map(x=>Number(x.year)).filter(Number.isFinite),stats=m.records.find(x=>x.city===city);
    return `<article class="card region-card"><div class="card-meta"><span class="tag">${escapeHtml(city)}</span><span class="tag">${escapeHtml(stats?.year||'待查核')} 文化統計</span></div><h3>${escapeHtml(city)}文化儀表板</h3><p class="summary">藝文活動 ${escapeHtml(stats?.arts_events_total?.toLocaleString('zh-TW')||'—')} 個 · 文化展演場地 ${escapeHtml(stats?.cultural_venues_total?.toLocaleString('zh-TW')||'—')} 處<br>候選人 ${new Set(n.map(x=>x.candidate)).size} 位 · 政見 ${n.length} 筆 · 地區文化議題 ${q.length} 筆 · 民間訴求 ${v.length} 筆<br>文化預算 ${years.length?`${Math.min(...years)}–${Math.max(...years)} 年`:'尚待查核'}</p><div class="source-row"><a href="region.html?city=${encodeURIComponent(city)}">查看儀表板 →</a></div></article>`;
  }).join('');
}).catch(()=>{regions.innerHTML='<p class="empty">資料載入失敗，請稍後再試。</p>'});
