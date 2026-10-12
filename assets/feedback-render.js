/* Renders the teacher's correction format on learner pages: **error** [correction]¹ plus numbered notes.
   Same rules as the private service's Feedback.gs. Text is escaped before the markers are interpreted. */
(() => {
  'use strict';
  const SUPS='⁰¹²³⁴⁵⁶⁷⁸⁹';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sup=n=>String(n).split('').map(d=>SUPS[Number(d)]||d).join('');
  const unsup=s=>String(s||'').split('').map(c=>{const i=SUPS.indexOf(c);return i>=0?String(i):c;}).join('');
  function markedHtml(text){
    const html=esc(text).replace(/\*\*(.+?)\*\*\s*\[([^\]]*)\]\s*([⁰¹²³⁴⁵⁶⁷⁸⁹]+|\d+)?/g,(_,err,fix,n)=>{const num=n?unsup(n):'';return '<span class="mark"><del>'+err+'</del>'+(fix?' <ins>'+fix+'</ins>':'')+(num?'<sup>'+sup(num)+'</sup>':'')+'</span>';});
    return html.split(/\n\s*\n/).map(p=>p.trim()?'<p>'+p.replace(/\n/g,'<br>')+'</p>':'').join('');
  }
  function notesHtml(notes){
    const items=String(notes||'').split('\n').map(line=>{const m=line.match(/^\s*([⁰¹²³⁴⁵⁶⁷⁸⁹]+|\d+)[.)]?\s+(.*\S)\s*$/);return m?{n:unsup(m[1]),text:m[2]}:null;}).filter(Boolean);
    return items.length?'<ol class="notes">'+items.map(x=>'<li value="'+esc(x.n)+'"><sup>'+sup(x.n)+'</sup> '+esc(x.text)+'</li>').join('')+'</ol>':'';
  }
  function plainHtml(text){return String(text||'').split(/\n\s*\n/).map(p=>p.trim()?'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>':'').join('');}
  window.CeliaFeedback={markedHtml,notesHtml,plainHtml,esc};
})();
