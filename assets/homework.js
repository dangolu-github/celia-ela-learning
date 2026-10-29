(() => {
  'use strict';
  /* Generic learner runner for one registered assignment: rich-text writing, short answers, gap-fills, choices and note
     tables. Drafts save on this device at once and to the private service a moment later; a deliberate Submit creates
     one immutable attempt. Keyed choices, keyed short answers and gaps are auto-scored at submission and the result,
     answer and explanation appear at once unless the teacher has hidden them. Teacher-only submission origin
     (submission-origin.js) is sent with Submit only. */
  const $=id=>document.getElementById(id);
  const form=$('homework');if(!form)return;
  const assignmentId=form.dataset.assignment,storageKey='celia-ela-'+assignmentId.toLowerCase()+'-v1';
  const head=$('assignment-head'),status=$('save-status'),submit=$('submit-homework'),result=$('submission-result'),conflict=$('draft-conflict'),previous=$('previous-attempts'),revisionNote=$('revision-note');
  const originForSubmit=async()=>{try{return window.PortalSubmissionOrigin?await window.PortalSubmissionOrigin.collect():null;}catch(_){return null;}};
  const warmOrigin=()=>{try{if(window.PortalSubmissionOrigin)window.PortalSubmissionOrigin.warm();}catch(_){}};
  const FB=window.CeliaFeedback,RT=window.CeliaRich;
  let a=null,rendered=false,revision=0,attempt=1,ready=false,submitted=false,saving=false,submitting=false,dirty=false,timer,pendingId='',pendingAttempt=null,version=0,conflictData=null,authEpoch=0,hasLocalDraft=false,hasDeviceWork=false,startedAt='',draftOnly=false,localMeta=null,localSaved=true,lastReceipt=null,savePromise=null;
  const editors={};
  const say=t=>{status.textContent=t;};
  const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x;};
  const words=t=>{const m=String(t||'').trim().match(/\S+/g);return m?m.length:0;};
  const paras=t=>String(t||'').split(/\n\s*\n/).filter(p=>p.trim()).length;
  const fmt=iso=>{const d=new Date(iso);return isNaN(d)?String(iso||''):d.toLocaleString();};
  function autosize(t){t.style.height='auto';t.style.height=Math.max(t.scrollHeight+4,Number(t.dataset.min||120))+'px';}
  function richHtml(v){return RT.isHtml(v)?RT.sanitize(v):FB.plainHtml(v);}
  const limits=()=>Object.assign({textBytes:14000,textHtmlBytes:22000,shortBytes:600,gapBytes:200,tableCellBytes:6000,responsesBytes:120000},a&&a.limits);
  const bytes=t=>new TextEncoder().encode(String(t||'')).length;
  const clean=t=>String(t==null?'':t).replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
  const labelOf=it=>it.n?'Question '+it.n:it.label;
  const requirement=it=>it.required?(it.requiredUnless?' (paragraph or outline required)':' (required)'):(a.kind==='notebook'?'':' (optional)');
  const localNotice=()=>localSaved?'Saved on this device.':'Not saved on this device. Keep this page open and download a copy.';
  const sectionKey='celia-ela-sections:'+assignmentId;
  let sectionState={};const memoryCopies=[];try{sectionState=JSON.parse(localStorage.getItem(sectionKey)||'{}')||{};}catch(_){}
  function toggleSection(title,key,cls){const d=el('details',null,cls);d.dataset.sectionKey=key;d.open=sectionState[key]===true;d.append(el('summary',title));d.addEventListener('toggle',()=>{sectionState[key]=d.open;try{localStorage.setItem(sectionKey,JSON.stringify(sectionState));}catch(_){}});return d;}
  function reveal(target){if(!target)return;for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;target.focus();}
  const toolbar=el('section',null,'work-toolbar screen-only');toolbar.id='work-toolbar';toolbar.setAttribute('aria-label','Save and submit');
  const actions=submit.parentElement;form.before(toolbar);toolbar.append(status,actions);
  const download=el('button','Download a copy','secondary');download.type='button';download.id='download-draft';actions.append(download);
  const resolve=el('button','Choose a draft','secondary');resolve.type='button';resolve.id='resolve-draft';resolve.hidden=true;actions.append(resolve);
  resolve.addEventListener('click',()=>{conflict.scrollIntoView?.({block:'center'});reveal(conflict.querySelector('button'));});
  const sectionActions=el('div',null,'section-actions');[['Open all','open-work-sections',true],['Close all','close-work-sections',false]].forEach(([title,id,value])=>{const b=el('button',title,'small-button');b.id=id;b.type='button';b.addEventListener('click',()=>document.querySelectorAll('[data-section-key]').forEach(d=>{d.open=value;}));sectionActions.append(b);});toolbar.append(sectionActions);
  const more=el('details',null,'work-more-actions');more.append(el('summary','More options'));const moreBody=el('div',null,'more-actions');[...actions.children].filter(x=>x!==submit&&x!==download&&x!==resolve).forEach(x=>moreBody.append(x));moreBody.append(sectionActions);more.append(moreBody);actions.append(more);
  const checklist=el('p','','submission-checklist');checklist.id='submission-checklist';toolbar.append(checklist);
  const validationSummary=el('div',null,'validation-summary');validationSummary.id='validation-summary';validationSummary.setAttribute('role','alert');validationSummary.hidden=true;toolbar.append(validationSummary);
  const exportArea=el('textarea');exportArea.id='draft-copy-text';exportArea.readOnly=true;exportArea.hidden=true;exportArea.setAttribute('aria-label','Copy of your work');toolbar.append(exportArea);
  // A Submit that ends without a receipt always says so in the toolbar and in a dialog, in English and Chinese (2026-10-29).
  const submitNotice=el('div',null,'submit-notice');submitNotice.id='submit-notice';submitNotice.setAttribute('role','alert');submitNotice.hidden=true;toolbar.append(submitNotice);
  function clearRefusal(){submitNotice.hidden=true;submitNotice.replaceChildren();}
  function refuse(en,zh,dialog=true){submitNotice.replaceChildren(el('strong','Not submitted · 没有交上'),el('p',en),el('p',zh,'zh'));submitNotice.hidden=false;say('Not submitted. '+en);if(dialog)try{window.alert('Not submitted · 没有交上\n\n'+en+'\n\n'+zh);}catch(_){}}
  conflict.querySelector('p')?.append(el('span',' 这台设备上的版本和已保存的版本不一样。选一个继续写，两个版本都会保留。','zh'));
  conflict.querySelectorAll('button').forEach(b=>b.append(el('span',b.dataset.draft==='local'?' · 用这台设备上的版本':' · 用已保存的版本','zh')));
  function canonical(raw){const out={};(a?a.items:[]).forEach(it=>{let v=(raw||{})[it.id];if(v==null)return;if(it.type==='short')v=clean(v).replace(/\n+/g,' ').trim();else if(it.type==='gaps')v=v.map(x=>clean(x).replace(/\n+/g,' ').trim());else if(it.type==='text')v=RT.isHtml(v)?RT.sanitize(clean(v)):RT.fromPlain(clean(v));else if(it.type==='table')v=v.map(row=>row.map(clean)).filter(row=>row.some(x=>x.trim()));if(v!==''&&(!Array.isArray(v)||v.length))out[it.id]=v;});return out;}
  const same=(x,y)=>JSON.stringify(canonical(x))===JSON.stringify(canonical(y));
  function backup(value,reason){const copy={reason,at:new Date().toISOString(),attempt,...value};try{const key=storageKey+'-backup-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);localStorage.setItem(key,JSON.stringify(copy));return true;}catch(_){memoryCopies.push(copy);say('A safety copy could not be saved. Download a copy before choosing another draft.');return false;}}
  function copyText(responses,title){const lines=[title];(a?a.items:[]).forEach(it=>{const v=(responses||{})[it.id];if(v==null)return;lines.push('',labelOf(it));if(it.type==='table')v.forEach((row,i)=>{lines.push('Row '+(i+1));row.forEach((cell,j)=>lines.push(it.columns[j]+': '+cell));});else if(it.type==='choice')lines.push(v+'. '+(it.options['ABCDE'.indexOf(v)]||''));else if(it.type==='gaps')lines.push(v.join(' / '));else lines.push(RT.text(v));});return lines.join('\n');}
  function exportText(){const parts=[copyText(responses(),(a?a.title:'Homework')+'\nCopy saved '+new Date().toLocaleString()+'\n'+(submitted&&lastReceipt&&same(responses(),lastReceipt.responses)?'Submitted copy':'Device draft — this copy is not a submission receipt'))];if(lastReceipt&&!same(responses(),lastReceipt.responses))parts.push(copyText(lastReceipt.responses,'Submitted copy · received '+fmt(lastReceipt.receivedAt)));if(conflictData)parts.push(copyText(conflictData.server,'Alternative: saved draft'),copyText(conflictData.local,'Alternative: this device’s draft'));const add=v=>{if(v.responses)parts.push(copyText(v.responses,'Earlier safety copy · '+(v.at||'')));if(v.local)parts.push(copyText(v.local,'Earlier device copy · '+(v.at||'')));if(v.server)parts.push(copyText(v.server,'Earlier saved copy · '+(v.at||'')));};memoryCopies.forEach(add);try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key===storageKey+'-conflict-backup'||key.startsWith(storageKey+'-backup-'))add(JSON.parse(localStorage.getItem(key)));}}catch(_){}return parts.join('\n\n--------------------\n\n');}
  download.addEventListener('click',()=>{const text=exportText();try{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=el('a');link.href=url;link.download=assignmentId+'-copy-'+new Date().toISOString().slice(0,10)+'.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(_){exportArea.hidden=false;exportArea.value=text;exportArea.focus();exportArea.select();say('Select and copy the text below into a document. This does not submit your work.');}});
  function fieldTarget(error){const art=form.querySelector('[data-item-id="'+error.itemId+'"]');if(!art)return null;if(error.row!=null){const rows=[...art.querySelectorAll('.table-row')].filter(row=>error.domRow||[...row.querySelectorAll('textarea')].some(x=>x.value.trim()));const row=rows[error.row];return row&&row.querySelectorAll('textarea')[error.column||0];}if(error.column!=null)return art.querySelectorAll('[data-gap]')[error.column];return art.querySelector('input,textarea,.rt-area');}
  function clearErrors(){form.querySelectorAll('.field-error').forEach(x=>x.remove());form.querySelectorAll('[aria-invalid]').forEach(x=>{x.removeAttribute('aria-invalid');const ids=(x.getAttribute('aria-describedby')||'').split(' ').filter(s=>!s.startsWith('field-error-'));if(ids.length)x.setAttribute('aria-describedby',ids.join(' '));else x.removeAttribute('aria-describedby');});validationSummary.replaceChildren();validationSummary.hidden=true;}
  function showErrors(errors,focus){clearErrors();if(!errors.length)return;validationSummary.hidden=false;validationSummary.append(el('strong','Please check:'));const list=el('ul');errors.forEach((error,i)=>{const target=fieldTarget(error),li=el('li');if(target){const b=el('button',error.message,'error-link');b.type='button';b.addEventListener('click',()=>reveal(target));li.append(b);target.setAttribute('aria-invalid','true');const note=el('p',error.message,'field-error');note.id='field-error-'+i;target.setAttribute('aria-describedby',((target.getAttribute('aria-describedby')||'')+' '+note.id).trim());target.insertAdjacentElement('afterend',note);}else li.textContent=error.message;list.append(li);});validationSummary.append(list);if(focus)reveal(fieldTarget(errors[0]));}
  function validate(final){const r=responses(),lim=limits(),errors=[];const tooLong=(it,value,limit,extra={})=>{const n=bytes(clean(value));if(n>limit)errors.push({itemId:it.id,...extra,code:'FIELD_TOO_LONG',message:labelOf(it)+(extra.row!=null?' · row '+(extra.row+1)+', '+it.columns[extra.column]:'')+' is too long. '+Math.ceil((n-limit)/limit*100)+'% over the limit. Shorten this part or download a copy first.'});};a.items.forEach(it=>{const v=r[it.id];if(v!=null){if(it.type==='table'){const rows=form.querySelectorAll('[data-table="'+it.id+'"] .table-row');rows.forEach((row,i)=>row.querySelectorAll('textarea').forEach((cell,j)=>tooLong(it,cell.value,lim.tableCellBytes,{row:i,column:j,domRow:true})));}else if(it.type==='short')tooLong(it,v,lim.shortBytes);else if(it.type==='gaps')v.forEach((x,i)=>tooLong(it,x,lim.gapBytes,{column:i}));else if(it.type==='text'){tooLong(it,RT.text(v),lim.textBytes);if(bytes(v)>lim.textHtmlBytes&&!errors.some(e=>e.itemId===it.id))errors.push({itemId:it.id,code:'FIELD_TOO_LONG',message:labelOf(it)+' has too much formatting. Download a copy, then use Clear formatting or shorten this part.'});}}if(final&&it.required&&v==null&&!(it.requiredUnless&&r[it.requiredUnless]!=null))errors.push({itemId:it.id,code:'REQUIRED',message:'Please complete: '+labelOf(it)});});if(bytes(JSON.stringify(canonical(r)))>lim.responsesBytes)errors.push({code:'RESPONSES_TOO_LARGE',message:'This homework is too large to save as one piece. Download a copy and ask your teacher how to split it.'});return errors;}
  function errorMessage(error){const it=error.itemId&&itemById(error.itemId);let where=it?labelOf(it):'';if(it&&error.row!=null)where+=' · row '+(error.row+1)+', '+it.columns[error.column||0];return where?where+': '+error.message:error.message;}
  function handleError(error){if(error.itemId||error.code==='RESPONSES_TOO_LARGE')showErrors([{...error,message:errorMessage(error)}],true);say(localNotice()+' '+errorMessage(error));}

  /* ---------- rendering ---------- */
  function renderAssignment(){
    head.replaceChildren();form.replaceChildren();Object.keys(editors).forEach(k=>delete editors[k]);
    head.append(el('p',a.practice?a.classLabel:a.classLabel+' · '+(a.kind==='notebook'?'Notebook':'Homework'),'eyebrow'),el('h1',a.title));
    if(a.intro)head.append(el('p',a.intro,'lead'));
    if(a.instructions&&a.instructions.length){const guide=toggleSection('Instructions','instructions','work-instructions');const ul=el('ul');a.instructions.forEach(t=>ul.append(el('li',t)));guide.append(ul);head.append(guide);}
    if(a.passage){const wrap=toggleSection(a.passage.title,'passage','task-section');const sec=el('section',null,'card passage');if(a.passage.author)sec.append(el('p',a.passage.author,'muted'));
      if(a.passage.lines){const block=el('div',null,'poem-lines');block.dataset.printLines='';a.passage.lines.forEach((line,i)=>{const row=el('div',null,'poem-line');row.append(el('span',(i+1)%5===0?String(i+1):'','line-number'),el('span',line));block.append(row);});sec.append(block);}
      else(a.passage.paragraphs||[]).forEach(t=>sec.append(el('p',t)));wrap.append(sec);form.append(wrap);}
    // Word help (2026-10-22): a fixed two-column list. Each meaning is already in place but blurred; tapping a word reveals it
    // without moving anything else (the first version expanded chips and reflowed the list).
    if(a.wordHelp&&a.wordHelp.length){const wrap=toggleSection('Word help · '+a.wordHelp.length+' words · tap a word to see its meaning','word-help','task-section word-help');const list=el('div',null,'word-list');
      a.wordHelp.forEach(w=>{const row=el('button',null,'word-row');row.type='button';row.setAttribute('aria-expanded','false');const t=el('span',null,'term');t.append(el('b',w.term));if(w.line)t.append(el('span',' · line '+w.line,'line'));const m=el('span',null,'meaning');const zh=el('span',w.meaning_zh,'zh');zh.lang='zh';m.append(zh);if(w.gloss_en)m.append(el('span',w.gloss_en,'gloss'));row.append(t,m);
        row.addEventListener('click',()=>{const on=row.getAttribute('aria-expanded')!=='true';row.setAttribute('aria-expanded',String(on));});list.append(row);});
      const all=el('button','Show all meanings','small-button');all.type='button';all.addEventListener('click',()=>{const rows=[...list.querySelectorAll('.word-row')],open=rows.some(r=>r.getAttribute('aria-expanded')!=='true');rows.forEach(r=>r.setAttribute('aria-expanded',String(open)));all.textContent=open?'Hide all meanings':'Show all meanings';});
      wrap.append(list,all);form.append(wrap);}
    let setHeading='';
    a.items.forEach(it=>{
      if(it.section&&it.section!==setHeading){setHeading=it.section;form.append(el('h2',it.section==='warm-up'?'Warm-up · quick checks':'Practice questions','set-heading'));}
      const section=toggleSection(labelOf(it)+requirement(it),it.id,'task-section');const art=el('article',null,'item');art.dataset.itemId=it.id;section.append(art);
      if(it.type==='choice'){
        const fs=el('fieldset');fs.append(el('legend',(it.n?'Question '+it.n+' · '+it.stem:it.label)+requirement(it)));const ol=el('ol',null,'options');
        it.options.forEach((o,i)=>{const li=el('li'),label=el('label'),input=el('input');input.type='radio';input.name=it.id;input.value='ABCDE'[i];label.append(input,document.createTextNode(input.value+'. '+o));li.append(label);ol.append(li);});
        fs.append(ol);art.append(fs);const clear=el('button','Clear answer','small-button');clear.type='button';clear.dataset.clear=it.id;art.append(clear);
      }else if(it.type==='short'){
        const label=el('label',it.label+requirement(it));const input=el('input');input.type='text';input.dataset.item=it.id;input.placeholder=it.placeholder||'';input.autocomplete='off';if(it.required)input.setAttribute('aria-required','true');label.append(input);art.append(label);if(it.hint)art.append(el('p',it.hint,'muted'));
        const table=a.items.find(x=>x.type==='table'&&x.columns.some(c=>/theme/i.test(c)));if(table&&/theme/i.test(it.label)){const reuse=el('button','Use a theme from my table','small-button');reuse.type='button';reuse.id='reuse-table-theme';reuse.addEventListener('click',()=>{const column=table.columns.findIndex(c=>/theme/i.test(c)),rows=responses()[table.id]||[],values=rows.map((r,i)=>({text:r[column],row:i+1})).filter(x=>x.text&&x.text.trim());const old=art.querySelector('.theme-options');if(old){old.remove();return;}const options=el('div',null,'theme-options');if(!values.length)options.append(el('p','Write a theme in your table first, or type it above.','muted'));values.forEach(value=>{const b=el('button','Row '+value.row+': '+value.text,'secondary');b.type='button';b.addEventListener('click',()=>{if(input.value.trim()&&input.value!==value.text&&!window.confirm('Replace the theme field with this table theme?'))return;input.value=value.text;options.remove();changed(400);reveal(input);});options.append(b);});art.append(options);});art.append(reuse);}
      }else if(it.type==='gaps'){
        const fs=el('fieldset');fs.append(el('legend',it.label+requirement(it)));const p=el('p',null,'gaps');p.dataset.gaps=it.id;
        const parts=it.template.split('___');parts.forEach((part,i)=>{p.append(document.createTextNode(part));if(i<parts.length-1){const input=el('input');input.type='text';input.className='gap';input.dataset.gap=String(i);input.autocomplete='off';input.autocapitalize='off';input.setAttribute('aria-label','Gap '+(i+1));p.append(input);}});
        fs.append(p);art.append(fs);if(it.hint)art.append(el('p',it.hint,'muted'));
      }else if(it.type==='text'){
        art.append(el('p',it.label+requirement(it),'item-label'));
        const box=el('div',null,'rich');editors[it.id]=RT.editor(box,{placeholder:it.placeholder||'',itemId:it.id,onInput:()=>changed(1500)});art.append(box);
        editors[it.id].area.setAttribute('aria-label',it.label);if(it.required)editors[it.id].area.setAttribute('aria-required','true');
        if(it.hint)art.append(el('p',it.hint,'muted'));const c=el('p','','counts');c.id=it.id+'-count';c.dataset.countFor=it.id;art.append(c);
      }else if(it.type==='table'){
        if(it.hint)art.append(el('p',it.hint,'muted'));art.append(el('p','Each cell shows how much space is used. Your text is kept if a limit is reached; you can download a copy.','muted'));const box=el('div',null,'table-input');box.dataset.table=it.id;art.append(box);renderRows(box,it,it.seedRows||[]);
        const add=el('button','Add a row','small-button');add.type='button';add.dataset.addRow=it.id;art.append(add);
      }
      form.append(section);
    });
    updateCounts();
  }
  function rowEl(it,values,index){const group=toggleSection('Row '+(index+1)+(values[0]?' · '+values[0]:''),it.id+'-row-'+index,'table-row-group');const row=el('div',null,'table-row');it.columns.forEach((c,i)=>{const label=el('label');label.append(el('span',c,'col-label'));const t=el('textarea');t.rows=2;t.value=values[i]||'';t.dataset.min=56;t.dataset.tableItem=it.id;t.dataset.row=index;t.dataset.column=i;const meter=el('span','','cell-space');meter.id=it.id+'-'+index+'-'+i+'-space';t.setAttribute('aria-describedby',meter.id);label.append(t,meter);row.append(label);});group.append(row);group.addEventListener('toggle',()=>{if(group.open)row.querySelectorAll('textarea').forEach(autosize);});return group;}
  function renderRows(box,it,rows){box.replaceChildren();const n=Math.max(rows.length,it.minRows||1);for(let r=0;r<n;r++)box.append(rowEl(it,rows[r]||[],r));requestAnimationFrame(()=>box.querySelectorAll('textarea').forEach(autosize));}
  function itemById(id){return a.items.find(x=>x.id===id);}
  function updateCounts(){form.querySelectorAll('[data-count-for]').forEach(c=>{const it=itemById(c.dataset.countFor),ed=editors[it.id];if(!ed)return;const t=ed.getText(),w=words(t),p=paras(t);let s=w+' word'+(w===1?'':'s')+' · '+p+' paragraph'+(p===1?'':'s');if(it.targetWords)s+=' · aim for '+it.targetWords[0]+'–'+it.targetWords[1]+' words';c.textContent=s;});form.querySelectorAll('[data-table-item]').forEach(t=>{const meter=$(t.dataset.tableItem+'-'+t.dataset.row+'-'+t.dataset.column+'-space');if(meter){const percent=Math.ceil(bytes(clean(t.value))/limits().tableCellBytes*100);meter.textContent='Cell space: '+percent+'% used';meter.classList.toggle('over-limit',percent>100);}});if(a){const gaps=missing();checklist.textContent=draftOnly?'Notebook: saved as a draft; no submission needed.':submitted?'Submission confirmed.':gaps.length?'Still needed: '+gaps.map(labelOf).join(' · '):(a.practice?'Ready. Submit to check your answers and see the explanations.':'Required parts complete. Submit homework when you are ready.');}}

  /* ---------- responses ---------- */
  function responses(){const out={};if(!a)return out;a.items.forEach(it=>{
    if(it.type==='choice'){const c=form.querySelector('input[name="'+it.id+'"]:checked');if(c)out[it.id]=c.value;}
    else if(it.type==='text'){const ed=editors[it.id];if(ed&&ed.getText().trim())out[it.id]=ed.getHtml();}
    else if(it.type==='short'){const t=form.querySelector('[data-item="'+it.id+'"]');if(t&&t.value.trim())out[it.id]=t.value;}
    else if(it.type==='gaps'){const vals=[...form.querySelectorAll('[data-gaps="'+it.id+'"] input')].map(x=>x.value.trim());if(vals.some(v=>v))out[it.id]=vals;}
    else if(it.type==='table'){const rows=[...form.querySelectorAll('[data-table="'+it.id+'"] .table-row')].map(r=>[...r.querySelectorAll('textarea')].map(x=>x.value)).filter(r=>r.some(c=>c.trim()));if(rows.length)out[it.id]=rows;}
  });return out;}
  function restore(r,useSeed=false){r=r||{};a.items.forEach(it=>{const v=r[it.id];
    if(it.type==='choice')form.querySelectorAll('input[name="'+it.id+'"]').forEach(x=>{x.checked=x.value===v;});
    else if(it.type==='text'){const ed=editors[it.id],want=RT.isHtml(v)?RT.sanitize(v):RT.fromPlain(v||'');if(ed&&ed.getHtml()!==want)ed.setValue(v||'');}   // unchanged text is not rewritten, so the caret stays put
    else if(it.type==='short'){const t=form.querySelector('[data-item="'+it.id+'"]');if(t)t.value=v||'';}
    else if(it.type==='gaps'){form.querySelectorAll('[data-gaps="'+it.id+'"] input').forEach((x,i)=>{x.value=Array.isArray(v)&&v[i]?v[i]:'';});}
    else if(it.type==='table'){const box=form.querySelector('[data-table="'+it.id+'"]');if(box)renderRows(box,it,Array.isArray(v)?v:(useSeed?it.seedRows||[]:[]));}
  });updateCounts();}
  function persist(){hasDeviceWork=true;const value={responses:responses(),startedAt,attempt,savedAt:new Date().toISOString()};try{localStorage.setItem(storageKey,JSON.stringify(value));hasLocalDraft=true;localMeta=value;localSaved=true;return true;}catch(_){localSaved=false;say('Your work could not be saved on this device. Download a copy before leaving.');return false;}}
  function loadLocal(){try{const x=JSON.parse(localStorage.getItem(storageKey)||'null');if(x){hasLocalDraft=true;hasDeviceWork=true;localMeta=x;startedAt=x.startedAt||startedAt;return x.responses||{};}}catch(_){localSaved=false;say('A previous draft could not be loaded. Keep this page open and contact your teacher.');}return {};}
  function freeze(value){form.querySelectorAll('input,textarea,button').forEach(x=>{x.disabled=value;});Object.values(editors).forEach(ed=>ed.setDisabled(value));submit.disabled=value;}
  function missing(){const r=responses();return a.items.filter(it=>it.required&&!(it.requiredUnless&&r[it.requiredUnless]!=null)&&r[it.id]==null);}

  /* ---------- submitted state, auto-scored answers and feedback ---------- */
  function clearMarks(){result.hidden=true;result.replaceChildren();previous.replaceChildren();previous.hidden=true;revisionNote.hidden=true;revisionNote.replaceChildren();form.querySelectorAll('.result-item,.feedback-answer,.feedback-block').forEach(x=>x.remove());}
  function yoursText(it,x){if(it.type==='gaps')return (x.choice||[]).map((v,i)=>(v||'—')+(x.gaps&&x.gaps[i]?' ✓':' ✗')).join(' · ');return x.choice||'unanswered';}
  function answerMarks(receipt){
    if(!receipt.grade)return;
    receipt.grade.items.forEach(x=>{const art=form.querySelector('[data-item-id="'+x.itemId+'"]');if(!art)return;const it=itemById(x.itemId),ans=(receipt.answers||[]).find(y=>y.itemId===x.itemId);
      art.append(el('p',x.correct?'Correct':'Your answer: '+yoursText(it,x)+' · Review this question','result-item '+(x.correct?'correct':'incorrect')));
      if(ans&&ans.key!=null){const d=el('details',null,'feedback-answer');d.append(el('summary','Show answer and explanation'));const keyText=it.type==='choice'?ans.key+'. '+(it.options['ABCDE'.indexOf(ans.key)]||''):ans.key;const p=el('p');p.append(el('strong','Answer: '+keyText+'. '),document.createTextNode(ans.reason||''));
        if(it.type==='short'&&ans.accepted&&ans.accepted.length>1)p.append(el('span',' Also accepted: '+ans.accepted.slice(1).join(' / '),'muted'));d.append(p);art.append(d);}});
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
    if(hasDeviceWork&&!same(responses(),st.receipt.responses)&&!backup({responses:responses()},'Device copy before showing the submission receipt')){lastReceipt=st.receipt;submitted=true;ready=false;dirty=false;clearTimeout(timer);freeze(true);clearMarks();result.hidden=false;result.append(el('h2','Submission received · attempt '+st.attempt),el('p','Received '+fmt(st.receipt.receivedAt)+'. Your different device draft is still shown below because a safety copy could not be saved. Download a copy now to keep both versions.'));say('Submission received. Different device text kept on screen — download both copies before leaving.');return;}
    attempt=st.attempt;lastReceipt=st.receipt;submitted=true;ready=false;dirty=false;clearTimeout(timer);restore(st.receipt.responses);freeze(true);conflict.hidden=true;resolve.hidden=true;clearErrors();clearMarks();result.hidden=false;
    const g=st.receipt.grade;
    result.append(el('h2','Submitted · attempt '+st.attempt+(g?' · '+g.score+' / '+g.total:'')));
    result.append(el('p','Received '+fmt(st.receipt.receivedAt)+'. Your work is saved exactly as you handed it in.'),el('p','已交上。','zh'));
    if(g){result.append(el('p','Questions: '+g.score+' of '+g.total+' correct. Open “Show answer and explanation” under each question to check.'));answerMarks(st.receipt);}
    else if(st.receipt.answersPending)result.append(el('p','Your answers are recorded. The results will appear here when your teacher releases them.'));
    if(st.feedback){feedbackSummary(st.feedback,result);feedbackBlocks(st.feedback);}
    else if(st.mode==='teacher-checked')result.append(el('p','Your teacher will read this and return feedback here.'));
    renderPrevious(st.previous||[]);say('Submitted. Receipt received '+fmt(st.receipt.receivedAt)+'.');updateCounts();
  }
  function renderPrevious(list){
    if(!list.length)return;previous.hidden=false;previous.append(el('h2','Earlier attempts'));
    list.forEach(p=>{const d=el('details',null,'card');d.append(el('summary','Attempt '+p.attempt+' · submitted '+fmt(p.receipt.receivedAt)));
      a.items.forEach(it=>{const v=p.receipt.responses[it.id];if(v==null)return;d.append(el('h3',it.n?'Question '+it.n:it.label));
        if(it.type==='choice')d.append(el('p',v+'. '+(it.options['ABCDE'.indexOf(v)]||'')));
        else if(it.type==='gaps')d.append(el('p',v.join(' · ')));
        else if(it.type==='table'){const t=el('div');t.innerHTML='<table class="grid"><tr>'+it.columns.map(c=>'<th>'+FB.esc(c)+'</th>').join('')+'</tr>'+v.map(row=>'<tr>'+row.map(c=>'<td>'+FB.esc(c)+'</td>').join('')+'</tr>').join('')+'</table>';d.append(t);}
        else{const t=el('div',null,'essay-view');t.innerHTML=p.feedback&&p.feedback.marked&&p.feedback.marked[it.id]?FB.markedHtml(p.feedback.marked[it.id]):richHtml(v);d.append(t);}});
      if(p.feedback)feedbackSummary(p.feedback,d);previous.append(d);});
  }
  function showRevision(st){
    if(!st.revision)return;revisionNote.hidden=false;revisionNote.append(el('h2','Revision open'));
    revisionNote.append(el('p','Your teacher has opened a revision'+(st.revision.note?': '+st.revision.note:'.')+' Your earlier attempt and its feedback are below. Edit your text here and submit it again when it is ready.'));
    renderPrevious(st.previous||[]);
  }

  // Archived by the teacher (2026-10-22): a plain notice only; saved work stays readable and nothing is blocked.
  function archivedNote(on){let n=$('archived-note');if(!on){if(n)n.remove();return;}if(!n){n=el('p','This homework is archived: your teacher has replaced it with newer homework, so you do not need to finish it. Anything you saved stays here.','notice info');n.id='archived-note';head.append(n);}}
  /* ---------- load, save, submit ---------- */
  async function load(){
    if(!CeliaAPI.signedIn()||submitting)return;ready=false;const when=version,generation=authEpoch;say('Loading your saved work…');
    try{
      if(!rendered){const payload=await CeliaAPI.call('assignment',{assignmentId});if(generation!==authEpoch||!CeliaAPI.signedIn())return;a=payload.assignment;draftOnly=a.mode==='draft-only';if(draftOnly)submit.hidden=true;renderAssignment();const local=loadLocal();restore(local,!hasLocalDraft);rendered=true;}
      const data=await CeliaAPI.call('state',{assignmentId});if(generation!==authEpoch||!CeliaAPI.signedIn())return;
      archivedNote(!!(data.control&&data.control.archived));
      if(data.submitted){displayState(data);return;}
      submitted=false;attempt=data.attempt||1;
      clearMarks();clearErrors();if(!data.control.receiving){freeze(true);say(data.control.intake?'This homework is not receiving new work at the moment. Download a copy if needed.':'This course is paused. New work is not being accepted.');return;}
      freeze(false);if(draftOnly)submit.hidden=true;showRevision(data);
      revision=data.draft?data.draft.revision:0;const local=responses(),server=data.draft?data.draft.responses:{};
      const previousCopy=(data.previous||[]).some(x=>same(local,x.receipt.responses));
      if(data.draft&&!same(local,server)&&hasDeviceWork&&!previousCopy){conflictData={server,local,serverSavedAt:data.draft.savedAt,localSavedAt:localMeta&&localMeta.savedAt};conflict.hidden=false;resolve.hidden=false;let info=conflict.querySelector('.draft-times');if(!info){info=el('p','','draft-times muted');conflict.append(info);}info.textContent='Saved draft: '+fmt(data.draft.savedAt)+'. Device copy: '+(localMeta&&localMeta.savedAt?fmt(localMeta.savedAt):'time unavailable')+'. Download a copy to keep both.';say('Choose which draft to continue. Your answers stay here until you choose.');updateCounts();return;}
      conflict.hidden=true;resolve.hidden=true;conflictData=null;
      if(version===when&&data.draft){if(hasDeviceWork&&!same(local,server)&&!backup({responses:local},'Before opening the saved revision'))return;restore(server);if(data.draft.startedAt&&!startedAt)startedAt=data.draft.startedAt;if(hasDeviceWork)persist();}
      ready=true;dirty=false;if(!draftOnly)warmOrigin();say(data.draft?'Cloud draft loaded. '+(draftOnly?'':'Not submitted yet.'):'Start writing. Changes will be saved as a draft.');updateCounts();
      // A prefilled teacher row is a starting point, not learner work. Only a real device draft is synced here.
      if(!data.draft&&hasDeviceWork&&!previousCopy){dirty=true;await sync();}
    }catch(e){say(e.message);}
  }
  conflict.querySelectorAll('button').forEach(button=>button.addEventListener('click',async()=>{
    if(!conflictData)return;if(!backup({local:responses(),server:conflictData.server},'Draft choice'))return;
    if(button.dataset.draft==='server')restore(conflictData.server);persist();conflict.hidden=true;resolve.hidden=true;conflictData=null;ready=true;dirty=true;await sync();
  }));
  async function sync(){
    if(!ready||submitted||!dirty||!CeliaAPI.signedIn())return;if(saving)return savePromise;
    const errors=validate(false);if(errors.length){showErrors(errors,false);say(localNotice()+' Fix the marked part before it can save to the cloud.');return;}
    saving=true;dirty=false;const snapshot=responses(),generation=authEpoch,when=version;let retry=false;say('Saving cloud draft…');
    savePromise=(async()=>{try{const data=await CeliaAPI.call('saveDraft',{assignmentId,responses:snapshot,baseRevision:revision,startedAt,attempt});if(generation!==authEpoch||!CeliaAPI.signedIn())return;if(data.submitted){displayState(data);return;}revision=data.draft.revision;if(data.draft.attempt)attempt=data.draft.attempt;if(version===when&&data.draft.responses){restore(data.draft.responses);persist();}say('Cloud draft saved '+new Date(data.draft.savedAt).toLocaleTimeString()+'. '+(draftOnly?'':'Not submitted yet.')+(localSaved?'':' Download a copy before leaving.'));}
    catch(e){dirty=true;retry=!!e.transport;handleError(e);if(e.code==='DRAFT_CONFLICT'||e.code==='ATTEMPT_CHANGED'||/another page/.test(e.message)){ready=false;await load();}}
    finally{saving=false;savePromise=null;if(dirty&&ready&&!submitted&&(retry||version!==when))timer=setTimeout(sync,5000);}})();
    return savePromise;
  }
  function changed(delay){if(submitted)return;version++;if(!startedAt)startedAt=new Date().toISOString();updateCounts();persist();dirty=true;const errors=validate(false);showErrors(errors,false);say(localNotice()+(errors.length?' Fix the marked part before it can save to the cloud.':' Not submitted yet.'));clearTimeout(timer);if(!errors.length)timer=setTimeout(sync,delay);}
  form.addEventListener('input',e=>{const t=e.target;if(t.classList&&t.classList.contains('rt-area'))return;if(t.tagName==='TEXTAREA'){autosize(t);changed(1500);}else if(t.type==='text')changed(1200);});
  form.addEventListener('change',e=>{if(e.target.type==='radio')changed(400);});
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('click',event=>{
    const clear=event.target.closest('[data-clear]');if(clear){form.querySelectorAll('input[name="'+clear.dataset.clear+'"]').forEach(x=>{x.checked=false;});changed(400);return;}
    const add=event.target.closest('[data-add-row]');if(add){const it=itemById(add.dataset.addRow),box=form.querySelector('[data-table="'+it.id+'"]'),n=box.querySelectorAll('.table-row').length;if(n<(it.maxRows||12)){const row=rowEl(it,[],n);row.open=true;box.append(row);updateCounts();row.querySelector('textarea').focus();}else say('This table has reached its '+(it.maxRows||12)+'-row limit. Download a copy if you need more space.');}
  });
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();clearTimeout(timer);sync();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty){clearTimeout(timer);sync();}});
  // Another page saved a different draft and the learner wants to hand in what is on this screen: keep both copies on
  // this device, make the screen text the saved draft, then hand it in (2026-10-29; before, Submit stopped silently).
  function handInScreen(){
    if(!window.confirm('Another page saved a different version of this homework.\n另一个页面保存了不同的版本。\n\nHand in the text on this screen? Both versions stay in “Download a copy”.\n要交现在屏幕上的这一版吗？两个版本都可以用 “Download a copy” 下载。')){refuse('You chose not to hand in this version. Choose a draft above, then press Submit again.','你选择了先不交这一版。请在上面选一个版本，再点一次 Submit。',false);if(conflictData)resolve.click();return false;}
    if(!backup({local:responses(),server:conflictData.server},'Hand in the text on this screen')){refuse('The other version could not be kept on this device. Press “Download a copy” first, then press Submit again.','另一个版本无法保存在这台设备上。请先点 “Download a copy”，再点一次 Submit。');return false;}
    persist();conflict.hidden=true;resolve.hidden=true;conflictData=null;ready=true;dirty=true;return true;
  }
  submit.addEventListener('click',async()=>{
    if(submitting||submitted)return;clearRefusal();
    if(!CeliaAPI.signedIn()){refuse('Enter the website password first, then press Submit again.','请先输入网站密码，再点一次 Submit。');document.querySelector('#account-panel input').focus();return;}
    if(!ready&&!conflictData){refuse('Your saved work is still loading. Wait a moment, then press Submit again.','作业还在加载，请稍等，再点一次 Submit。');return;}
    const errors=validate(true);if(errors.length){showErrors(errors,true);say('Please check the marked parts. Your text has not been submitted.');return;}
    if(conflictData?!handInScreen():!window.confirm('Hand in this work now? After submitting you cannot change it unless your teacher opens a revision.'))return;
    persist();freeze(true);clearTimeout(timer);
    for(let tries=0;tries<3;tries++){   // the save made before handing in can still meet a draft saved on another page
      if(savePromise)await savePromise;if(dirty&&ready&&!submitted)await sync();
      if(submitted||!conflictData)break;
      freeze(false);if(!handInScreen())return;freeze(true);
    }
    if(submitted)return;
    if(!ready){freeze(false);refuse('Your work could not be saved before handing in. Check your connection, then press Submit again.','交之前没能保存作业。请检查网络，再点一次 Submit。');return;}
    if(pendingId&&pendingAttempt!==attempt){backup({requestId:pendingId,requestAttempt:pendingAttempt},'Earlier submission request');pendingId='';}
    if(!pendingId){pendingId=crypto.randomUUID();pendingAttempt=attempt;try{localStorage.setItem(storageKey+'-submit-request',pendingId);localStorage.setItem(storageKey+'-submit-attempt',String(attempt));}catch(_){}}
    const snapshot=responses(),generation=authEpoch,elapsedSeconds=startedAt?Math.max(0,Math.round((Date.now()-Date.parse(startedAt))/1000)):null;submitting=true;say('Submitting… Please keep this page open.');
    try{const submissionOrigin=await originForSubmit();const data=await CeliaAPI.call('submit',{assignmentId,responses:snapshot,requestId:pendingId,elapsedSeconds,submissionOrigin,attempt,baseRevision:revision});if(generation!==authEpoch||!CeliaAPI.signedIn())return;clearPending();displayState(data.state);result.scrollIntoView?.({block:'center'});if(data.replayed&&data.currentAttempt>data.state.attempt){submitting=false;await load();say('Your earlier submission is confirmed. A new revision is open below.');}}
    catch(e){if(generation===authEpoch){freeze(false);if(e.transport){say('Checking whether your submission arrived…');try{const st=await CeliaAPI.call('state',{assignmentId});if(st.submitted){clearPending();displayState(st);result.scrollIntoView?.({block:'center'});}else{refuse(localNotice()+' No receipt is confirmed yet. Keep this page open and press Submit again when your connection is ready.','还没有收到回执。请保持页面打开，网络正常后再点一次 Submit。');}}catch(_){refuse(localNotice()+' Receipt could not be checked. Keep this page open or download a copy; press Submit again when connected.','连不上网站，查不到回执。请保持页面打开或先点 “Download a copy”，网络正常后再点一次 Submit。');}}else if(e.code==='DRAFT_CONFLICT'||e.code==='ATTEMPT_CHANGED'){submitting=false;await load();refuse('Your saved work changed on another page. Press Submit again to choose which version to hand in.','作业在另一个页面被改过。请再点一次 Submit，选择要交的版本。');}else{handleError(e);refuse(errorMessage(e),'请按提示修改，再点一次 Submit。');}}}
    finally{submitting=false;}
  });
  function clearPending(){pendingId='';pendingAttempt=null;try{localStorage.removeItem(storageKey+'-submit-request');localStorage.removeItem(storageKey+'-submit-attempt');}catch(_){}}
  try{pendingId=localStorage.getItem(storageKey+'-submit-request')||'';pendingAttempt=Number(localStorage.getItem(storageKey+'-submit-attempt'))||null;}catch(_){}
  $('refresh-work').addEventListener('click',load);
  const focusBtn=$('focus-mode');if(focusBtn)focusBtn.addEventListener('click',()=>{const on=document.body.classList.toggle('focus');focusBtn.textContent=on?'Leave focus mode':'Focus mode';});
  window.addEventListener('celia-login',()=>{authEpoch++;load();});
  window.addEventListener('celia-logout',()=>{authEpoch++;ready=false;submitted=false;submitting=false;dirty=false;clearTimeout(timer);clearMarks();clearErrors();freeze(false);conflict.hidden=true;resolve.hidden=true;form.replaceChildren();head.replaceChildren();rendered=false;hasDeviceWork=false;hasLocalDraft=false;localMeta=null;say('Signed out. Your local draft is preserved.');});
  // Print: a passage with numbered lines prints one source line per printed line (2026-10-24). Its widest line is
  // measured in em near the printed size (system fonts space letters differently at 16px and 9pt): first at 12px, then at
  // the size that width gives on A4. site.css then shrinks that passage, not the page, never below 7pt.
  const printOpen=[],lineFits=[];
  function fitPrintLines(){form.querySelectorAll('[data-print-lines]').forEach(block=>{const lines=Array.from(block.children);if(!lines.length)return;block.classList.add('print-lines-measure');
    const widestAt=px=>{block.style.setProperty('--print-measure-size',px+'px');return Math.max(...lines.map(line=>{const r=document.createRange();r.selectNodeContents(line);return r.getBoundingClientRect().width/px;}));};
    let em=widestAt(12);if(em>0)em=Math.max(em,widestAt(Math.min(13.6,685/em)));block.classList.remove('print-lines-measure');block.style.removeProperty('--print-measure-size');
    if(em>0&&em<=72){block.style.setProperty('--print-line-em',em.toFixed(2));block.classList.add('print-lines-fit');lineFits.push(block);}});}   // above 72em even 7pt overflows A4: it keeps wrapping
  window.addEventListener('beforeprint',()=>{document.querySelectorAll('[data-section-key]').forEach(d=>{printOpen.push([d,d.open]);d.open=true;});form.querySelectorAll('textarea').forEach(autosize);fitPrintLines();});
  window.addEventListener('afterprint',()=>{printOpen.splice(0).forEach(([d,open])=>{d.open=open;});lineFits.splice(0).forEach(b=>{b.classList.remove('print-lines-fit');b.style.removeProperty('--print-line-em');});});
  window.addEventListener('online',sync);load();
})();
