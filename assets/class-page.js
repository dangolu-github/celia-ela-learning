(() => {
  'use strict';
  // Loads a protected class page (registered in the private service) after sign-in and replaces this placeholder with it.
  // The loaded page keeps a way back (2026-10-30): a nav bar above it, or on annotated pages a small fixed bar that moves
  // nothing, because the teacher's ink there is placed at page coordinates.
  const pageId=document.documentElement.dataset.page,status=document.getElementById('page-status');let loading=false;
  const here=location.href.split('#')[0],links=[...document.querySelectorAll('nav a')].map(a=>[a.textContent,a.href]);
  if(links.length){const base=new URL('.',links[0][1]);[['Vocabulary','vocabulary/index.html'],['Target Practice','practice/index.html'],['Notebook','notebook/index.html']].forEach(([text,path])=>{const href=new URL(path,base).href;if(!links.some(l=>l[1]===href))links.push([text,href]);});}
  const FLOW='#celia-site-nav{display:flex;flex-wrap:wrap;gap:6px 20px;max-width:980px;margin:0 auto;padding:14px 22px 0;font:600 14px/1.5 Arial,sans-serif}';
  const FIXED='#celia-site-nav{position:fixed;top:10px;left:10px;z-index:2147483001;display:flex;gap:14px;padding:5px 13px;background:rgba(255,255,255,.95);border:1px solid #e2dbd1;border-radius:18px;box-shadow:0 2px 8px rgba(42,37,33,.14);font:600 13px/1.4 Arial,sans-serif}';
  function addNav(){
    if(!document.body||document.getElementById('celia-site-nav'))return;const fixed=!!window.__paperPortalConfig;
    const style=document.createElement('style');style.textContent=(fixed?FIXED:FLOW)+'#celia-site-nav a{color:#7a3b4e;text-decoration:none}#celia-site-nav a:hover{text-decoration:underline}@media print{#celia-site-nav{display:none}}';(document.head||document.body).append(style);
    const nav=document.createElement('nav');nav.id='celia-site-nav';nav.setAttribute('aria-label','Main navigation');
    links.filter(l=>l[1]!==here).slice(0,fixed?2:5).forEach(([text,href],i)=>{const a=document.createElement('a');a.href=href;a.textContent=(fixed&&i===0?'← ':'')+text;nav.append(a);});
    document.body.prepend(nav);
  }
  async function load(){
    if(loading||!window.CeliaAPI||!CeliaAPI.signedIn())return;loading=true;status.textContent='Loading your handout…';
    try{const data=await CeliaAPI.call('classPage',{pageId});document.open();document.write(data.html);document.close();if(document.body)addNav();else document.addEventListener('DOMContentLoaded',addNav,{once:true});}
    catch(e){status.textContent=e.message;loading=false;}
  }
  window.addEventListener('celia-login',load);load();
})();
