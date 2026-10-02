const menuToggle=document.querySelector('.menu-toggle'),siteMenu=document.getElementById('site-menu');
if(menuToggle&&siteMenu){
  const closeMenu=()=>{menuToggle.setAttribute('aria-expanded','false');siteMenu.classList.remove('open')};
  menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')!=='true';menuToggle.setAttribute('aria-expanded',String(open));siteMenu.classList.toggle('open',open)});
  siteMenu.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu()});
}
const currentPage=location.pathname.split('/').pop()||'index.html';
siteMenu?.querySelectorAll('a').forEach(link=>{if(link.getAttribute('href')===currentPage)link.setAttribute('aria-current','page')});
