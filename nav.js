const menuToggle=document.querySelector('.menu-toggle'),siteMenu=document.getElementById('site-menu');
if(menuToggle&&siteMenu){
  const closeMenu=()=>{menuToggle.setAttribute('aria-expanded','false');siteMenu.classList.remove('open')};
  menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));siteMenu.classList.toggle('open',open)});
  siteMenu.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu()});
}
const currentPage=location.pathname.split('/').pop()||'index.html';
siteMenu?.querySelectorAll('a').forEach(link=>{if(link.getAttribute('href')===currentPage)link.setAttribute('aria-current','page')});
// 「候選人文化政見」子選單：點按鈕展開，點外面或按 Esc 收起；目前頁在子選單內（含候選人頁）時標示整組。
document.querySelectorAll('.nav-group').forEach(group=>{
  const toggle=group.querySelector('.nav-group-toggle');
  const close=()=>toggle.setAttribute('aria-expanded','false');
  toggle.addEventListener('click',event=>{event.stopPropagation();toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded')!=='true'))});
  document.addEventListener('click',event=>{if(!group.contains(event.target))close()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
  if(group.querySelector('a[aria-current="page"]')||currentPage==='candidate.html')group.classList.add('is-current');
});
// 錯誤回報：Google 表單，從卡片帶入資料 ID、頁面網址與資料名稱。
const REPORT_FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSfK1HIeywCxHnlY_4U8m_SOT2or1siO69ZsiN9I-dOIdUsOHw/viewform';
window.reportUrl=(ids,name)=>{
  const params=new URLSearchParams({usp:'pp_url'});
  const idText=[].concat(ids||[]).filter(Boolean).join(', ');
  if(idText)params.set('entry.1936902863',idText);
  params.set('entry.747551258',location.href);
  if(name)params.set('entry.216136148',name);
  return `${REPORT_FORM_URL}?${params}`;
};
window.reportLink=(ids,name)=>`<a class="report-link" href="${reportUrl(ids,name).replace(/&/g,'&amp;')}" target="_blank" rel="noopener">回報錯誤</a>`;
document.querySelector('footer p:last-child')?.insertAdjacentHTML('beforeend',` · <a href="${reportUrl().replace(/&/g,'&amp;')}" target="_blank" rel="noopener">意見回報</a>`);
// 匿名流量統計：只在正式站與公測站送出，沒有 Cookie 與訪客 ID，失敗不影響頁面。
// 在網址加 ?no_track=1 可讓這個瀏覽器不再計入（管理者自用），?no_track=0 恢復。
(()=>{
  try{
    const path=location.pathname,host=location.hostname;
    const enabled=host==='culturalpolicywatch.tw'||(host==='daniel9202.github.io'&&path.startsWith('/culture-governance-observer-beta/'));
    if(!enabled||!navigator.sendBeacon||navigator.globalPrivacyControl||navigator.doNotTrack==='1')return;
    const query=new URLSearchParams(location.search);
    const flag=query.get('no_track');
    try{
      if(flag==='1')localStorage.setItem('cpw_no_track','1');
      if(flag==='0')localStorage.removeItem('cpw_no_track');
      if(localStorage.getItem('cpw_no_track'))return;
    }catch{}
    const send=()=>{
      let seen=false;
      try{seen=sessionStorage.getItem('cpw_seen')==='1';sessionStorage.setItem('cpw_seen','1')}catch{}
      let sameSite=false;
      try{sameSite=!!document.referrer&&new URL(document.referrer).host===location.host}catch{}
      const pick=(...keys)=>Object.fromEntries(keys.filter(key=>query.has(key)).map(key=>[key,query.get(key)]));
      navigator.sendBeacon('https://collect.culturalpolicywatch.tw/collect',JSON.stringify({
        p:path,
        q:pick('city','office','name'),
        r:document.referrer,
        u:{s:query.get('utm_source')||'',m:query.get('utm_medium')||'',c:query.get('utm_campaign')||''},
        e:!seen&&!sameSite?1:0,
      }));
    };
    if(document.prerendering)document.addEventListener('prerenderingchange',send,{once:true});else send();
  }catch{}
})();
