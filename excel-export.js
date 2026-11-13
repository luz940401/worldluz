/* Export only the open story; no requests containing manuscript data. */
(()=>{
const button=document.querySelector('#excelBtn');
let loading;
function library(){
 if(window.ExcelJS)return Promise.resolve(window.ExcelJS);
 return loading??=new Promise((ok,fail)=>{const s=document.createElement('script');s.src='exceljs.min.js';s.onload=()=>ok(window.ExcelJS);s.onerror=()=>{s.remove();loading=null;fail(Error('無法載入匯出工具，請重新開啟網站再試一次。'));};document.head.append(s);});
}
function paragraphs(html){
 const root=document.createElement('template');root.innerHTML=html;
 const out=[];let line=[],length=0;
 function flush(){out.push(line);line=[];length=0;}
 function add(text,bold){for(const ch of text){if(ch==='\n'){flush();continue;}if(length+ch.length>900)flush();let last=line.at(-1);if(!last||!!last.font?.bold!==bold){last=bold?{text:'',font:{bold:true}}:{text:''};line.push(last);}last.text+=ch;length+=ch.length;}}
 function walk(el,bold=false){
  if(el.nodeType===3){add(el.data,bold);return;}
  if(el.nodeName==='BR'){flush();return;}
  const block=['DIV','P','LI','UL','OL'].includes(el.nodeName);
  if(block&&line.length)flush();
  if(el.nodeName==='LI')add(el.parentElement?.tagName==='OL'?(Array.from(el.parentElement.children).indexOf(el)+1)+'. ':'• ',bold);
  const start=out.length;
  for(const child of el.childNodes)walk(child,bold||el.nodeName==='B'||el.nodeName==='STRONG');
  if(block&&(line.length||start===out.length))flush();
 }
 walk(root.content);if(line.length||!out.length)flush();return out;
}
async function png(src){
 const img=new Image();img.src=src;await img.decode();
 const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);return {base64:c.toDataURL('image/png'),ratio:c.width/c.height};
}
async function report(X,story,edges,bodies){
 const wb=new X.Workbook(),where=new Map(),byId=new Map(story.nodes.map(n=>[n.id,n]));
 function sheet(name,headers,widths){
  const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});widths.forEach((v,i)=>ws.getColumn(i+1).width=v);
  const head=ws.addRow(headers);head.height=28;head.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF8E563A'}};c.alignment={vertical:'middle'};});ws.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};return ws;
 }
 function row(ws,vals){const r=ws.addRow(vals);r.eachCell(c=>{c.alignment={vertical:'top',wrapText:true};});return r;}
 function jump(cell,id){const dest=where.get(id);if(!dest)return;cell.value={text:String(cell.value||'未命名'),hyperlink:"#'"+dest.tab+"'!A"+dest.row};cell.font={color:{argb:'FF98552F'},underline:true};}
 const guide=sheet('劇本總覽',['劇本／分類','內容'],[24,75]);row(guide,['劇本名稱',story.name]);row(guide,['設定總數',story.nodes.length]);row(guide,['關係筆數',edges.length]);row(guide,['閱讀方式','各分類列出筆記全文，長文依序續列。在「關係索引」點名稱可跳至來源或對象。']);
 const sort=(a,b)=>a.name.localeCompare(b.name,'zh-Hant')||a.id.localeCompare(b.id);
 const name=id=>byId.get(id)?.name||'';
 for(const [tab,types] of [['故事線',['event','task','foreshadow']],['人物背景',['character']],['組織',['organization']],['地點',['continent','town']],['靈感便條',['note']]]){
  const nodes=story.nodes.filter(n=>types.includes(n.type)).sort((a,b)=>types.indexOf(a.type)-types.indexOf(b.type)||sort(a,b));
  const ws=sheet(tab,['名稱','類型','狀態','大陸','出生／所在城鎮','隸屬組織','目前所在地','段序','設定與背景全文','設定 ID'],[26,14,15,22,22,22,22,9,84,40]);
  row(guide,[tab,nodes.length]);for(const n of nodes){const chunks=paragraphs(bodies.get(n.id));
   chunks.forEach((runs,i)=>{const r=row(ws,[n.name,TYPES[n.type][0],n.status||'',name(n.continent),name(n.town),name(n.organization),name(n.location),i+1,runs.length?{richText:runs}:'',n.id]);if(i===0)where.set(n.id,{tab,row:r.number});const len=runs.reduce((v,t)=>v+Array.from(t.text).length,0);r.height=Math.min(400,Math.max(28,21*(1+Math.ceil(len/38))));});
  }
 }
 const rel=sheet('關係索引',['來源','來源類型','關係','對象','對象類型','依據','來源 ID','對象 ID'],[26,14,28,26,14,18,40,40]);
 for(const e of edges){const a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)continue;const r=row(rel,[a.name,TYPES[a.type][0],e.label,b.name,TYPES[b.type][0],e.formal?'手動連線':e.mention?'筆記提及':'基本設定',a.id,b.id]);jump(r.getCell(1),a.id);jump(r.getCell(4),b.id);}
 const pics=story.nodes.filter(n=>n.image||n.extraImages?.length);
 if(pics.length){const ws=sheet('圖片',['所屬設定','分類','圖片序號','圖片'],[30,16,14,44]);for(const n of pics){let i=0;for(const src of [n.image,...(n.extraImages||[])].filter(Boolean)){const r=row(ws,[n.name,TYPES[n.type][0],++i]);jump(r.getCell(1),n.id);const {base64,ratio}=await png(src);const h=Math.min(150,280/ratio);r.height=120;ws.addImage(wb.addImage({base64,extension:'png'}),{tl:{col:3,row:r.number-1},ext:{width:h*ratio,height:h},editAs:'oneCell'});}}}
 return wb.xlsx.writeBuffer();
}
button.onclick=async()=>{button.disabled=true;button.textContent='整理中…';try{
 await window.worldluz.ready;const story=structuredClone(state),edges=allLinks(),bodies=new Map(story.nodes.map(n=>[n.id,resolvedBody(n)]));
 const buf=await report(await library(),story,edges,bodies);const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=(story.name.replace(/[\\/:*?"<>|]/g,'_')||'未命名劇本')+'－設定整理.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('目前劇本已整理成 Excel。');
 }catch(e){toast('Excel 匯出失敗：'+e.message);}finally{button.disabled=false;button.textContent='匯出 Excel';}};
})();
