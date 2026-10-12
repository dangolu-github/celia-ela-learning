(() => {
  'use strict';
  /* Generic learner runner for one registered assignment: long writing, short answers, choices and note tables.
     Drafts save on this device at once and to the private service a moment later; a deliberate Submit creates one
     immutable attempt. Teacher-only submission origin (submission-origin.js) is sent with Submit only. */
  const $=id=>document.getElementById(id);
  const form=$('homework');if(!form)return;
  const assignmentId=form.dataset.assignment,storageKey='celia-ela-'+assignmentId.toLowerCase()+'-v1';
  const head=$('assignment-head'),status=$('save-status'),submit=$('submit-homework'),result=$('submission-result'),conflict=$('draft-conflict'),previous=$('previous-attempts'),revisionNote=$('revision-note');
  const originForSubmit=async()=>{try{return window.PortalSubmissionOrigin?await window.PortalSubmissionOrigin.collect():null;}catch(_){return null;}};
  const warmOrigin=()=>{try{if(window.PortalSubmissionOrigin)window.PortalSubmissionOrigin.warm();}catch(_){}};
  const FB=window.CeliaFeedback;
  let a=null,rendered=false,revision=0,ready=false,submitted=false,saving=false,dirty=false,timer,pendingId='',version=0,conflictData=null,authEpoch=0,hasLocalDraft=false,startedAt='',draftOnly=false;
  const say=t=>{status.textContent=t;};
  const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x;};
  const words=t=>{const m=String(t||'').trim().match(/\S+/g);return m?m.length:0;};
  const paras=t=>String(t||'').split(/\n\s*\n/).filter(p=>p.trim()).length;
  const fmt=iso=>{const d=new Date(iso);return isNaN(d)?String(iso||''):d.toLocaleString();};
  function autosize(t){t.style.height='auto';t.style.height=Math.max(t.scrollHeight+4,Number(t.dataset.min||120))+'px';}

  /* ---------- rendering ---------- */
  function renderAssignment(){
    head.replaceChildren();form.replaceChildren();
    head.append(el('p',a.classLabel+' · '+(a.kind==='notebook'?'Notebook':'Homework'),'eyebrow'),el('h1',a.title));
    if(a.intro)head.append(el('p',a.intro,'lead'));
    if(a.instructions&&a.instructions.length){const ul=el('ul');a.instructions.forEach(t=>ul.append(el('li',t)));head.append(ul);}
    if(a.passage){const sec=el('section',null,'card passage');sec.append(el('h2',a.passage.title));if(a.passage.author)sec.append(el('p',a.passage.author,'muted'));
      if(a.passage.lines)a.passage.lines.forEach((line,i)=>{const row=el('div',null,'poem-line');row.append(el('span',(i+1)%5===0?String(i+1):'','line-number'),el('span',line));sec.append(row);});
      else(a.passage.paragraphs||[]).forEach(t=>sec.append(el('p',t)));form.append(sec);}
    a.items.forEach(it=>{
      const art=el('article',null,'item');art.dataset.itemId=it.id;
      if(it.type==='choice'){
        const fs=el('fieldset');fs.append(el('legend',(it.n?'Question '+it.n+' · '+it.stem:it.label)));const ol=el('ol',null,'options');
        it.options.forEach((o,i)=>{const li=el('li'),label=el('label'),input=el('input');input.type='radio';input.name=it.id;input.value='ABCDE'[i];label.append(input,document.createTextNode(input.value+'. '+o));li.append(label);ol.append(li);});
        fs.append(ol);art.append(fs);const clear=el('button','Clear answer','small-button');clear.type='button';clear.dataset.clear=it.id;art.append(clear);
      }else if(it.type==='short'){
        const label=el('label',it.label+(it.required?'':' (optional)'));const input=el('input');input.type='text';input.dataset.item=it.id;input.maxLength=400;input.placeholder=it.placeholder||'';input.autocomplete='off';label.append(input);art.append(label);if(it.hint)art.append(el('p',it.hint,'muted'));
      }else if(it.type==='text'){
        const label=el('label');label.append(el('span',it.label+(it.required||a.kind==='notebook'?'':' (optional)'),'item-label'));
        const t=el('textarea',null,'essay');t.dataset.item=it.id;t.dataset.min=a.kind==='notebook'?320:220;t.placeholder=it.placeholder||'';t.spellcheck=true;t.setAttribute('aria-describedby',it.id+'-count');label.append(t);art.append(label);
        if(it.hint)art.append(el('p',it.hint,'muted'));const c=el('p','','counts');c.id=it.id+'-count';c.dataset.countFor=it.id;art.append(c);
      }else if(it.type==='table'){
        art.append(el('h2',it.label));if(it.hint)art.append(el('p',it.hint,'muted'));const box=el('div',null,'table-input');box.dataset.table=it.id;art.append(box);renderRows(box,it,[]);
        const add=el('button','Add a row','small-button');add.type='button';add.dataset.addRow=it.id;art.append(add);
      }
      form.append(art);
    });
    updateCounts();
  }
  function rowEl(it,values){const row=el('div',null,'table-row');it.columns.forEach((c,i)=>{const label=el('label');label.append(el('span',c,'col-label'));const t=el('textarea');t.rows=2;t.value=values[i]||'';t.dataset.min=56;label.append(t);row.append(label);});return row;}
  function renderRows(box,it,rows){box.replaceChildren();const n=Math.max(rows.length,it.minRows||1);for(let r=0;r<n;r++)box.append(rowEl(it,rows[r]||[]));}
  function itemById(id){return a.items.find(x=>x.id===id);}
  function updateCounts(){form.querySelectorAll('[data-count-for]').forEach(c=>{const it=itemById(c.dataset.countFor),t=form.querySelector('[data-item="'+it.id+'"]');if(!t)return;const w=words(t.value),p=paras(t.value);let s=w+' word'+(w===1?'':'s')+' · '+p+' paragraph'+(p===1?'':'s');if(it.targetWords)s+=' · aim for '+it.targetWords[0]+'–'+it.targetWords[1]+' words';c.textContent=s;});}

  /* ---------- responses ---------- */
  function responses(){const out={};if(!a)return out;a.items.forEach(it=>{
    if(it.type==='choice'){const c=form.querySelector('input[name="'+it.id+'"]:checked');if(c)out[it.id]=c.value;}
    else if(it.type==='text'||it.type==='short'){const t=form.querySelector('[data-item="'+it.id+'"]');if(t&&t.value.trim())out[it.id]=t.value;}
    else if(it.type==='table'){const rows=[...form.querySelectorAll('[data-table="'+it.id+'"] .table-row')].map(r=>[...r.querySelectorAll('textarea')].map(x=>x.value)).filter(r=>r.some(c=>c.trim()));if(rows.length)out[it.id]=rows;}
  });return out;}
  function restore(r){r=r||{};a.items.forEach(it=>{const v=r[it.id];
    if(it.type==='choice')form.querySelectorAll('input[name="'+it.id+'"]').forEach(x=>{x.checked=x.value===v;});
    else if(it.type==='text'||it.type==='short'){const t=form.querySelector('[data-item="'+it.id+'"]');if(t){t.value=v||'';if(t.tagName==='TEXTAREA')autosize(t);}}
    else if(it.type==='table'){const box=form.querySelector('[data-table="'+it.id+'"]');if(box)renderRows(box,it,Array.isArray(v)?v:[]);}
  });updateCounts();}
  const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
  function persist(){hasLocalDraft=true;try{localStorage.setItem(storageKey,JSON.stringify({responses:responses(),startedAt}));}catch(_){say('Your work could not be saved on this device. Copy your text somewhere safe before leaving.');}}
  function loadLocal(){try{const x=JSON.parse(localStorage.getItem(storageKey)||'null');if(x){hasLocalDraft=true;startedAt=x.startedAt||startedAt;return x.responses||{};}}catch(_){say('A previous draft could not be loaded.');}return {};}
  function freeze(value){form.querySelectorAll('input,textarea,button').forEach(x=>{x.disabled=value;});submit.disabled=value;}
  function missing(){const r=responses();return a.items.filter(it=>it.required&&!(it.requiredUnless&&r[it.requiredUnless]!=null)&&r[it.id]==null);}

  /* ---------- submitted state, answers and feedback ---------- */
  function clearMarks(){result.hidden=true;result.replaceChildren();previous.replaceChildren();previous.hidden=true;revisionNote.hidden=true;revisionNote.replaceChildren();form.querySelectorAll('.result-item,.key-reason,.feedback-block').forEach(x=>x.remove());}
  function answerMarks(receipt){
    if(!receipt.grade)return;
    receipt.grade.items.forEach(x=>{const art=form.querySelector('[data-item-id="'+x.itemId+'"]');if(!art)return;const p=el('p',x.correct?'Correct':'Your answer: '+(x.choice||'unanswered')+' · see the correct answer below','result-item '+(x.correct?'correct':'incorrect'));art.append(p);
      const ans=(receipt.answers||[]).find(y=>y.itemId===x.itemId);if(ans){const d=el('div',null,'key-reason');d.append(el('strong','Correct answer: '+ans.key+'. '),document.createTextNode(ans.reason||''));art.append(d);}});
  }
  function feedbackBlocks(feedback){
    Object.keys(feedback.marked||{}).forEach(id=>{const art=form.querySelector('[data-item-id="'+id+'"]');if(!art)return;const d=el('div',null,'feedback-block');d.append(el('h3','Your teacher’s marked text'));const body=el('div');body.innerHTML=FB.markedHtml(feedback.marked[id]);d.append(body);art.append(d);});
  }
  function feedbackSummary(feedback,into){
    const d=el('div',null,'feedback-block');d.append(el('h3','Feedback from your teacher · '+fmt(feedback.releasedAt)));
    if(feedback.overall){const o=el('div');o.innerHTML=FB.plainHtml(feedback.overall);d.append(o);}
    if(feedback.notes){const n=el('div');n.innerHTML=FB.notesHtml(feedback.notes);d.append(n);}
    into.append(d);
  }
  function displayState(st){
    submitted=true;ready=false;dirty=false;clearTimeout(timer);restore(st.receipt.responses);freeze(true);conflict.hidden=true;clearMarks();result.hidden=false;
    result.append(el('h2','Submitted · attempt '+st.attempt));
    result.append(el('p','Received '+fmt(st.receipt.receivedAt)+'. Your work is saved exactly as you handed it in.'));
    if(st.receipt.grade){result.append(el('p','Questions: '+st.receipt.grade.score+' of '+st.receipt.grade.total+' correct. The correct answers are shown under each question.'));answerMarks(st.receipt);}
    else if(st.receipt.answersPending)result.append(el('p','Your answers are recorded. The correct answers will appear here after your teacher goes through them with you.'));
    if(st.mode==='teacher-checked'){if(st.feedback){feedbackSummary(st.feedback,result);feedbackBlocks(st.feedback);}else result.append(el('p','Your teacher will read this and return feedback here.'));}
    renderPrevious(st.previous||[]);say('Submitted.');
  }
  function renderPrevious(list){
    if(!list.length)return;previous.hidden=false;previous.append(el('h2','Earlier attempts'));
    list.forEach(p=>{const d=el('details',null,'card');d.append(el('summary','Attempt '+p.attempt+' · submitted '+fmt(p.receipt.receivedAt)));
      a.items.forEach(it=>{const v=p.receipt.responses[it.id];if(v==null)return;const h=el('h3',it.n?'Question '+it.n:it.label);d.append(h);
        if(it.type==='choice')d.append(el('p',v+'. '+(it.options['ABCDE'.indexOf(v)]||'')));
        else if(it.type==='table'){const t=el('div');t.innerHTML='<table class="grid"><tr>'+it.columns.map(c=>'<th>'+FB.esc(c)+'</th>').join('')+'</tr>'+v.map(row=>'<tr>'+row.map(c=>'<td>'+FB.esc(c)+'</td>').join('')+'</tr>').join('')+'</table>';d.append(t);}
        else{const t=el('div');t.innerHTML=p.feedback&&p.feedback.marked&&p.feedback.marked[it.id]?FB.markedHtml(p.feedback.marked[it.id]):FB.plainHtml(v);d.append(t);}});
      if(p.feedback)feedbackSummary(p.feedback,d);previous.append(d);});
  }
  function showRevision(st){
    if(!st.revision)return;revisionNote.hidden=false;revisionNote.append(el('h2','Revision open'));
    revisionNote.append(el('p','Your teacher has opened a revision'+(st.revision.note?': '+st.revision.note:'.')+' Your earlier attempt and its feedback are below. Edit your text here and submit it again when it is ready.'));
    renderPrevious(st.previous||[]);
  }

  /* ---------- load, save, submit ---------- */
  async function load(){
    if(!CeliaAPI.signedIn())return;ready=false;const when=version,generation=authEpoch;say('Loading your saved work…');
    try{
      if(!rendered){const payload=await CeliaAPI.call('assignment',{assignmentId});if(generation!==authEpoch||!CeliaAPI.signedIn())return;a=payload.assignment;draftOnly=a.mode==='draft-only';if(draftOnly)submit.hidden=true;renderAssignment();restore(loadLocal());rendered=true;}
      const data=await CeliaAPI.call('state',{assignmentId});if(generation!==authEpoch||!CeliaAPI.signedIn())return;
      if(data.submitted){displayState(data);return;}
      clearMarks();if(!data.control.receiving){freeze(true);say(data.control.intake?'This homework is not receiving new work at the moment. Your saved text stays on this device.':'This course is paused. New work is not being accepted.');return;}
      freeze(false);if(draftOnly)submit.hidden=true;showRevision(data);
      revision=data.draft?data.draft.revision:0;const local=responses(),server=data.draft?data.draft.responses:{};
      if(data.draft&&!same(local,server)&&hasLocalDraft&&Object.keys(local).length){conflictData={server,local};conflict.hidden=false;say('Choose which saved draft to use. Both copies will be kept.');return;}
      if(version===when&&data.draft){restore(server);if(data.draft.startedAt&&!startedAt)startedAt=data.draft.startedAt;}
      ready=true;if(!draftOnly)warmOrigin();say(data.draft?'Saved work loaded.':'Your work is saved on this device as you type.');
      if(!data.draft&&Object.keys(responses()).length){dirty=true;await sync();}
    }catch(e){say(e.message);}
  }
  conflict.querySelectorAll('button').forEach(button=>button.addEventListener('click',async()=>{
    if(!conflictData)return;try{localStorage.setItem(storageKey+'-conflict-backup',JSON.stringify({local:conflictData.local,server:conflictData.server,at:new Date().toISOString()}));}catch(_){say('Unable to keep both drafts. Copy your text somewhere safe before choosing.');return;}
    if(button.dataset.draft==='server')restore(conflictData.server);persist();conflict.hidden=true;conflictData=null;ready=true;dirty=true;await sync();
  }));
  async function sync(){
    if(!ready||submitted||saving||!dirty||!CeliaAPI.signedIn())return;saving=true;dirty=false;const snapshot=responses(),generation=authEpoch;say('Saving…');
    try{const data=await CeliaAPI.call('saveDraft',{assignmentId,responses:snapshot,baseRevision:revision,startedAt});if(generation!==authEpoch||!CeliaAPI.signedIn())return;if(data.submitted){displayState(data);return;}revision=data.draft.revision;say('Saved '+new Date(data.draft.savedAt).toLocaleTimeString()+'.');}
    catch(e){dirty=true;say('Saved on this device. '+e.message);if(/another page/.test(e.message)){ready=false;await load();}}
    finally{saving=false;if(dirty&&ready&&!submitted)timer=setTimeout(sync,5000);}
  }
  function changed(delay){version++;if(!startedAt)startedAt=new Date().toISOString();updateCounts();persist();dirty=true;say('Saved on this device.');clearTimeout(timer);timer=setTimeout(sync,delay);}
  form.addEventListener('input',e=>{if(e.target.tagName==='TEXTAREA'){autosize(e.target);changed(1500);}else if(e.target.type==='text')changed(1200);});
  form.addEventListener('change',e=>{if(e.target.type==='radio')changed(400);});
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('click',event=>{
    const clear=event.target.closest('[data-clear]');if(clear){form.querySelectorAll('input[name="'+clear.dataset.clear+'"]').forEach(x=>{x.checked=false;});changed(400);return;}
    const add=event.target.closest('[data-add-row]');if(add){const it=itemById(add.dataset.addRow),box=form.querySelector('[data-table="'+it.id+'"]');if(box.querySelectorAll('.table-row').length<(it.maxRows||12))box.append(rowEl(it,[]));}
  });
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();clearTimeout(timer);sync();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty){clearTimeout(timer);sync();}});
  submit.addEventListener('click',async()=>{
    if(!CeliaAPI.signedIn()){say('Please enter the website password before submitting.');document.querySelector('#account-panel input').focus();return;}
    if(!ready){say('Load your saved work and resolve any draft choice before submitting.');return;}
    const gaps=missing();if(gaps.length){say('Please complete: '+gaps.map(it=>it.n?'Question '+it.n:it.label).join('; '));const first=form.querySelector('[data-item-id="'+gaps[0].id+'"]');const f=first&&first.querySelector('textarea,input');if(f)f.focus();return;}
    if(!window.confirm('Hand in this work now? After submitting you cannot change it unless your teacher opens a revision.'))return;
    if(!pendingId){pendingId=crypto.randomUUID();try{localStorage.setItem(storageKey+'-submit-request',pendingId);}catch(_){}}
    const snapshot=responses(),generation=authEpoch,elapsedSeconds=startedAt?Math.max(0,Math.round((Date.now()-Date.parse(startedAt))/1000)):null;freeze(true);clearTimeout(timer);say('Submitting… Please keep this page open.');
    try{const submissionOrigin=await originForSubmit();const data=await CeliaAPI.call('submit',{assignmentId,responses:snapshot,requestId:pendingId,elapsedSeconds,submissionOrigin});if(generation!==authEpoch||!CeliaAPI.signedIn())return;pendingId='';try{localStorage.removeItem(storageKey+'-submit-request');}catch(_){}displayState(data.state);}
    catch(e){if(generation===authEpoch){freeze(false);say(e.message+' Click Submit again to confirm receipt.');}}
  });
  try{pendingId=localStorage.getItem(storageKey+'-submit-request')||'';}catch(_){}
  $('refresh-work').addEventListener('click',load);
  const focusBtn=$('focus-mode');if(focusBtn)focusBtn.addEventListener('click',()=>{const on=document.body.classList.toggle('focus');focusBtn.textContent=on?'Leave focus mode':'Focus mode';form.querySelectorAll('textarea.essay').forEach(autosize);});
  window.addEventListener('celia-login',()=>{authEpoch++;load();});
  window.addEventListener('celia-logout',()=>{authEpoch++;ready=false;submitted=false;dirty=false;clearTimeout(timer);clearMarks();freeze(false);conflict.hidden=true;form.replaceChildren();head.replaceChildren();rendered=false;say('Signed out. Your local draft is preserved.');});
  window.addEventListener('online',sync);load();
})();
