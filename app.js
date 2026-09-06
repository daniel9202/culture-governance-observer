const datasets=['candidates','civic_policy_calls','pledge_fulfillment','region_metrics'];
const setStat=(name,value)=>{const el=document.querySelector(`[data-stat="${name}"]`);if(el)el.textContent=Number(value).toLocaleString('zh-TW')};
Promise.all(datasets.map(name=>fetch(`data/${name}.json`).then(r=>r.json()))).then(([candidates,civic,fulfillment,regions])=>{
  const councilors=candidates.records.filter(x=>String(x.office).includes('議員'));
  setStat('mayors',candidates.records.length-councilors.length);
  setStat('councilors',councilors.length);
  setStat('regions',new Set(regions.records.map(x=>x.city)).size);
  setStat('fulfillment',fulfillment.records.length);
  setStat('civic',civic.records.length);
  updated.textContent=`最後更新 ${[candidates,civic,fulfillment,regions].map(x=>x.last_updated).sort().pop()}`;
}).catch(()=>{updated.textContent='資料載入失敗，請稍後再試。'});
