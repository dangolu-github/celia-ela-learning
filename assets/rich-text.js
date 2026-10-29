/* Rich-text writing area for long responses: bold, italic, underline, headings, lists, quote, undo/redo.
   Output is HTML limited to p, br, strong, em, u, h2, h3, ul, ol, li, blockquote with every attribute removed;
   the private service applies the same rules again before storing or rendering anything. */
(() => {
  'use strict';
  const ALLOWED={p:1,br:1,strong:1,em:1,u:1,h2:1,h3:1,ul:1,ol:1,li:1,blockquote:1};
  const ALIAS={b:'strong',i:'em',div:'p',h1:'h2',h4:'h3',h5:'h3',h6:'h3'};
  function sanitize(html){
    let s=String(html||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|embed|textarea|select|svg|math)[^>]*>[\s\S]*?<\/\1>/gi,'');
    s=s.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g,(m,tag)=>{const t=tag.toLowerCase(),name=ALIAS[t]||t;if(!ALLOWED[name])return '';const close=m.charAt(1)==='/';if(name==='br')return close?'':'<br>';return (close?'</':'<')+name+'>';});
    s=s.replace(/\u00a0|&nbsp;/g,' ').replace(/<p>\s*(<(?:h2|h3|blockquote|ul|ol)>)/g,'$1').replace(/(<\/(?:h2|h3|blockquote|ul|ol)>)\s*<\/p>/g,'$1');
    return s.replace(/(<p>\s*<\/p>)+/g,'').trim();
  }
  const isHtml=v=>/<[a-z]/i.test(String(v||''));
  function text(v){
    const s=String(v==null?'':v);if(!isHtml(s))return s;
    return s.replace(/<\/(p|h2|h3|blockquote)>/gi,'\n\n').replace(/<\/li>/gi,'\n').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n{3,}/g,'\n\n').trim();
  }
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function fromPlain(t){return String(t||'').split(/\n\s*\n/).filter(p=>p.trim()).map(p=>'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>').join('');}
  // Caret as a character count, so rewriting the content (e.g. after a cloud save) leaves it where the writer was typing (2026-10-29).
  function caretAt(area){const s=window.getSelection&&getSelection();if(!s||!s.rangeCount||!area.contains(s.focusNode))return -1;const r=document.createRange();r.selectNodeContents(area);r.setEnd(s.focusNode,s.focusOffset);return r.toString().length;}
  function placeCaret(area,n){const walk=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);let node,last=null;while((node=walk.nextNode())){last=node;if(n<=node.length)break;n-=node.length;}const r=document.createRange();if(node)r.setStart(node,n);else if(last)r.setStart(last,last.length);else{r.selectNodeContents(area);r.collapse(false);}r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);}
  const BUTTONS=[['Bold (Ctrl/Cmd+B)','bold','B','rt-b'],['Italic (Ctrl/Cmd+I)','italic','I','rt-i'],['Underline (Ctrl/Cmd+U)','underline','U','rt-u'],['Heading','formatBlock:<h2>','Heading',''],['Subheading','formatBlock:<h3>','Sub',''],['Normal paragraph','formatBlock:<p>','¶',''],['Bulleted list','insertUnorderedList','• List',''],['Numbered list','insertOrderedList','1. List',''],['Quotation','formatBlock:<blockquote>','“ Quote',''],['Clear formatting','removeFormat','Clear',''],['Undo','undo','Undo',''],['Redo','redo','Redo','']];
  function editor(container,{placeholder='',onInput=null,itemId=''}={}){
    const bar=document.createElement('div');bar.className='rt-toolbar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Text formatting');
    const area=document.createElement('div');area.className='rt-area essay';area.contentEditable='true';area.dataset.placeholder=placeholder;area.dataset.item=itemId;area.setAttribute('role','textbox');area.setAttribute('aria-multiline','true');area.spellcheck=true;
    const run=cmd=>{area.focus();const i=cmd.indexOf(':');const c=i<0?cmd:cmd.slice(0,i),arg=i<0?null:cmd.slice(i+1);try{document.execCommand(c,false,arg);}catch(_){}if(onInput)onInput();};
    BUTTONS.forEach(([label,cmd,glyph,cls])=>{const b=document.createElement('button');b.type='button';b.className='rt-btn '+cls;b.title=label;b.setAttribute('aria-label',label);b.dataset.cmd=cmd;b.textContent=glyph;b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>run(cmd));bar.append(b);});
    area.addEventListener('paste',e=>{e.preventDefault();const t=(e.clipboardData||window.clipboardData).getData('text/plain');try{document.execCommand('insertText',false,t);}catch(_){area.append(document.createTextNode(t));}if(onInput)onInput();});
    area.addEventListener('input',()=>{if(onInput)onInput();});
    container.append(bar,area);
    return {area,bar,
      getHtml:()=>sanitize(area.innerHTML),
      setValue:v=>{const at=document.activeElement===area?caretAt(area):-1;area.innerHTML=isHtml(v)?sanitize(v):fromPlain(v);if(at>=0)placeCaret(area,at);},
      getText:()=>text(sanitize(area.innerHTML)),
      setDisabled:v=>{area.contentEditable=v?'false':'true';area.classList.toggle('disabled',!!v);bar.querySelectorAll('button').forEach(b=>{b.disabled=!!v;});}};
  }
  window.CeliaRich={sanitize,text,isHtml,fromPlain,editor};
})();
