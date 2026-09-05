const files={civic_policy_calls:{file:'civic_policy_calls.csv'},candidate_sources:{file:'candidate_sources.csv'}};
let kind='civic_policy_calls',headers=[],rows=[],reviewToken='';
const localBridge=['localhost','127.0.0.1'].includes(location.hostname);
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const safeUrl=url=>{try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.href:'#'}catch{return '#'}};
const parseCSV=text=>{const output=[];let row=[],cell='',quoted=false;for(let index=0;index<text.length;index++){const char=text[index],next=text[index+1];if(char==='"'&&quoted&&next==='"'){cell+='"';index++}else if(char==='"')quoted=!quoted;else if(char===','&&!quoted){row.push(cell);cell=''}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')index++;row.push(cell);if(row.some(value=>value!==''))output.push(row);row=[];cell=''}else cell+=char}if(cell||row.length){row.push(cell);output.push(row)}return output};
const escCSV=value=>/[",\n\r]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value;
const key=()=>`culture-review-${kind}`;
const saved=()=>JSON.parse(localStorage.getItem(key())||'{}');
const save=(id,value)=>{const state=saved();state[id]={...(state[id]||{}),...value};localStorage.setItem(key(),JSON.stringify(state))};

function render(){
  const stateByUrl=saved(),indexByName=Object.fromEntries(headers.map((header,index)=>[header,index]));
  const rowState=(row,index)=>{const id=row[indexByName.source_url]||String(index),local=stateByUrl[id]||{};return{id,status:local.status||row[indexByName.review_status]||'pending',note:local.note||row[indexByName.review_note]||''}};
  const rejected=rows.filter((row,index)=>rowState(row,index).status==='rejected').length;
  const visible=rows.map((row,index)=>({row,index,value:rowState(row,index)})).filter(item=>item.value.status!=='rejected');
  const decided=rows.filter((row,index)=>rowState(row,index).status!=='pending').length;
  document.getElementById('count').textContent=`顯示 ${visible.length} 筆；${rejected} 筆已拒絕且隱藏；已決定 ${decided} 筆`;
  document.getElementById('github').href=`https://github.com/daniel9202/culture-governance-observer/edit/main/data/inbox/${files[kind].file}`;
  document.getElementById('rows').innerHTML=visible.map(({row,index,value})=>{
    const title=row[indexByName.source_title]||'未命名來源',city=row[indexByName.city]||'',date=row[indexByName.published_date]||'';
    return `<article class="review-card"><p class="kicker">${escapeHtml(city)} · ${escapeHtml(date)}</p><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(row[indexByName.source_name]||'')}</p><a class="source" href="${escapeHtml(safeUrl(row[indexByName.source_url]))}" target="_blank" rel="noopener">開啟原始來源 ↗</a><div class="review-actions"><button class="yes ${value.status==='accepted'?'active':''}" data-id="${index}" data-status="accepted">Yes｜收錄</button><button class="no" data-id="${index}" data-status="rejected">No｜不收錄</button></div><label>查核備註<textarea data-note="${index}" placeholder="可寫判斷理由、團體名稱或政策重點">${escapeHtml(value.note)}</textarea></label></article>`;
  }).join('');
  document.querySelectorAll('[data-status]').forEach(button=>button.onclick=async()=>{
    const index=Number(button.dataset.id),row=rows[index],id=row[indexByName.source_url]||button.dataset.id,note=document.querySelector(`[data-note="${index}"]`).value;
    try{
      if(localBridge){
        document.getElementById('sync').textContent='正在寫入 CSV 並同步 GitHub…';button.disabled=true;
        const response=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Token':reviewToken},body:JSON.stringify({kind,source_url:row[indexByName.source_url],status:button.dataset.status,note})});
        const output=await response.json();if(!response.ok)throw Error(output.error||'同步失敗');
        document.getElementById('sync').textContent=`已同步 GitHub：${output.commit}`;await load();
      }else{save(id,{status:button.dataset.status,note});render()}
    }catch(error){document.getElementById('sync').textContent=`未同步：${error.message}`;alert(`沒有寫入 GitHub：${error.message}`)}
  });
  document.querySelectorAll('[data-note]').forEach(input=>input.oninput=()=>{const row=rows[Number(input.dataset.note)],id=row[indexByName.source_url]||input.dataset.note;save(id,{note:input.value})});
}

async function load(){kind=document.getElementById('type').value;const response=await fetch(`data/inbox/${files[kind].file}`);[headers,...rows]=parseCSV(await response.text());if(localBridge)document.getElementById('sync').textContent='本機同步模式：每次 Yes／No 都會 commit 並推送 GitHub。';render()}
async function init(){if(localBridge){const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)throw Error('無法建立安全的本機查核工作階段');reviewToken=(await response.json()).token}await load()}
document.getElementById('type').onchange=load;
download.onclick=()=>{const indexByName=Object.fromEntries(headers.map((header,index)=>[header,index])),stateByUrl=saved(),output=[headers,...rows.map((row,index)=>{const id=row[indexByName.source_url]||String(index),value=stateByUrl[id]||{},copy=[...row];copy[indexByName.review_status]=value.status||copy[indexByName.review_status]||'pending';copy[indexByName.review_note]=value.note||copy[indexByName.review_note]||'';return copy})].map(row=>row.map(escCSV).join(',')).join('\r\n')+'\r\n',url=URL.createObjectURL(new Blob([output],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=files[kind].file;link.click();URL.revokeObjectURL(url)};
init().catch(error=>{document.getElementById('sync').textContent=error.message});
