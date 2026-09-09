const menuToggle=document.querySelector('.menu-toggle'),siteMenu=document.getElementById('site-menu');
if(menuToggle&&siteMenu){
  const closeMenu=()=>{menuToggle.setAttribute('aria-expanded','false');siteMenu.classList.remove('open')};
  menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));siteMenu.classList.toggle('open',open)});
  siteMenu.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu()});
}
const currentPage=location.pathname.split('/').pop()||'index.html';
siteMenu?.querySelectorAll('a').forEach(link=>{if(link.getAttribute('href')===currentPage)link.setAttribute('aria-current','page')});

// 僅記錄每日匿名代碼與頁面，不傳送 IP、帳號或瀏覽內容。
const analyticsEndpoint='https://culture-review-ingest-staging.b95302239.workers.dev/api/public/visit';
try{
  const analyticsDay=new Date().toISOString().slice(0,10);
  const analyticsKey=`culture-governance-visit-${analyticsDay}`;
  let anonymousVisitId=localStorage.getItem(analyticsKey);
  if(!anonymousVisitId){
    anonymousVisitId=crypto.randomUUID().replace(/-/g,'');
    localStorage.setItem(analyticsKey,anonymousVisitId);
  }
  fetch(analyticsEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:location.pathname,visitor_id:anonymousVisitId}),keepalive:true}).catch(()=>{});
}catch{}
