(() => {
  'use strict';
  const key='celia-ela-session-v1'; let token='',authenticated=false,restoring=false;
  try {token=localStorage.getItem(key)||'';} catch(_){}
  let panel=document.getElementById('account-panel');
  if(!panel){panel=document.createElement('section');panel.id='account-panel';panel.className='panel';panel.setAttribute('aria-label','Your account');panel.innerHTML='<p data-auth-message role="status" aria-live="polite"></p><form><label>Website password <input type="password" autocomplete="current-password" required maxlength="200"></label><button type="submit">Open website</button></form><button type="button" data-logout hidden>Forget this device</button>';document.querySelector('main').prepend(panel);}
  const message=panel.querySelector('[data-auth-message]'),login=panel.querySelector('form'),logout=panel.querySelector('[data-logout]');
  const title=document.createElement('h2');title.textContent='Celia · ELA 20-1';panel.prepend(title);
  const hint=document.createElement('p');hint.className='muted';hint.textContent='Enter the website password once. This browser will remember your device.';login.prepend(hint);
  login.querySelector('button').textContent='Open website';
  const retry=document.createElement('button');retry.type='button';retry.textContent='Try again';retry.hidden=true;panel.append(retry);
  function paint(){document.documentElement.classList.toggle('celia-site-locked',!authenticated);login.hidden=authenticated||!!token;logout.hidden=!authenticated;title.hidden=authenticated;retry.hidden=true;message.textContent=authenticated?'This device is remembered.':token?'Opening your website…':'Enter the website password to continue.';}
  function forget(){token='';authenticated=false;try{localStorage.removeItem(key);}catch(_){}paint();window.dispatchEvent(new Event('celia-logout'));}
  function accept(result){token=result.token;authenticated=true;let saved=true;try{localStorage.setItem(key,token);}catch(_){saved=false;}paint();if(!saved)message.textContent='Website open. Allow browser storage to remember this device next time.';window.dispatchEvent(new Event('celia-login'));}
  async function api(action,payload={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await fetch(window.CELIA_PORTAL.endpoint,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,action,token}),signal:controller.signal});
      if(!response.ok)throw Object.assign(new Error('Connection unavailable.'),{transport:true,code:'CONNECTION'});
      const data=await response.json();
      if(!data.ok){if(/Please sign in/.test(data.error||''))forget();const error=new Error(data.error||'Please try again.');['code','itemId','row','column','limitBytes','actualBytes','currentAttempt'].forEach(k=>{if(data[k]!=null)error[k]=data[k];});error.transport=false;throw error;}return data;
    }catch(e){if(e.name==='AbortError')throw Object.assign(new Error('The request took too long.'),{transport:true,code:'TIMEOUT'});if(e.transport==null)e.transport=true;throw e;}finally{clearTimeout(timer);}
  }
  login.addEventListener('submit',async event=>{
    event.preventDefault();const input=login.querySelector('input'),button=login.querySelector('button');button.disabled=true;message.textContent='Opening your website…';
    try{const result=await api('authenticate',{password:input.value});input.value='';accept(result);}
    catch(e){message.textContent=e.message;}finally{button.disabled=false;}
  });
  async function restoreDevice(){if(!token||restoring)return;restoring=true;paint();try{accept(await api('session'));}catch(e){message.textContent=e.message;if(token)retry.hidden=false;}finally{restoring=false;}}
  retry.addEventListener('click',restoreDevice);window.addEventListener('online',()=>{if(!authenticated)restoreDevice();});
  logout.addEventListener('click',forget);window.CeliaAPI={call:api,signedIn:()=>authenticated,token:()=>token};paint();restoreDevice();
})();
