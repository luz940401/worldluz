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
 const out=[];let line=[],length=0,paragraph=1,part=1;
 function flush(continued=false){out.push({text:line.map(run=>run.text).join(''),paragraph,part});line=[];length=0;if(continued)part++;else{paragraph++;part=1;}}
 function add(text,bold){for(const ch of text){if(ch==='\n'){flush();continue;}if(length+ch.length>900)flush(true);let last=line.at(-1);if(!last||!!last.font?.bold!==bold){last=bold?{text:'',font:{bold:true}}:{text:''};line.push(last);}last.text+=ch;length+=ch.length;}}
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
 walk(root.content);if(line.length||!out.length||root.content.lastChild?.textContent?.endsWith('\n'))flush();return out;
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
 const guide=sheet('先讀我',['項目','說明'],[24,102]);
 row(guide,['劇本名稱',story.name]);row(guide,['設定總數',story.nodes.length]);row(guide,['關係筆數',edges.length]);
 const instructions=[
 ['整理任務','請根據此檔整理劇本背景。依序輸出：世界背景、人物背景與動機、組織與地點、故事事件、任務與未解伏筆、設定矛盾或待確認處。沒有原文支持的部分請標「未交代」。'],
 ['資料來源','故事線、人物背景、組織、地點、靈感便條是作者原文。每筆設定只出現在其中一張分類表；多列可能是同一筆設定的續文。'],
 ['識別同名設定','設定 ID 才是識別依據，不要因為同名就合併人物或地點。圖片與關係也使用相同 ID。'],
 ['還原全文','以設定 ID 分組，依段號、段內片號的數字排序。同一段的分片直接接回，不插空格；段與段之間換行。空白段落也保留。'],
 ['解讀關係','關係索引每列代表「來源 ID → 關係 → 對象 ID」。手動連線與基本設定均來自作者；筆記提及只代表在原文中連到對方，並不表示結盟、親屬或因果。'],
 ['時序與確定性','工作表列序不是事件年表。只按照原文明示的先後整理情節；保留任務與伏筆的狀態。靈感便條、角色猜想、傳聞不可直接當成既定事實。'],
 ['引用與矛盾','每段整理結果附上依據，例如「設定 ID／段號」或關係 ID。若兩段衝突，並列原文依據並標記待確認，不自行選定版本。'],
 ['空值與圖片','空白欄位表示未填。圖片是附件，文字欄不包含圖像描述；不可僅憑圖片猜測身分或背景。']
 ];for(const pair of instructions){const r=row(guide,pair);r.height=56;}
 const sort=(a,b)=>a.name.localeCompare(b.name,'zh-Hant')||a.id.localeCompare(b.id);
 const name=id=>byId.get(id)?.name||'';
 for(const [tab,types] of [['故事線',['event','task','foreshadow']],['人物背景',['character']],['組織',['organization']],['地點',['continent','town']],['靈感便條',['note']]]){
  const nodes=story.nodes.filter(n=>types.includes(n.type)).sort((a,b)=>types.indexOf(a.type)-types.indexOf(b.type)||sort(a,b));
  const ws=sheet(tab,['名稱','類型','狀態','大陸','出生／所在城鎮','隸屬組織','目前所在地','段號','段內片號','原文（純文字）','設定 ID'],[26,14,15,22,22,22,22,9,12,84,40]);
  row(guide,[tab,nodes.length]);for(const n of nodes){const chunks=paragraphs(bodies.get(n.id));
   chunks.forEach((chunk,i)=>{const r=row(ws,[n.name,TYPES[n.type][0],n.status||'',name(n.continent),name(n.town),name(n.organization),name(n.location),chunk.paragraph,chunk.part,chunk.text,n.id]);if(i===0)where.set(n.id,{tab,row:r.number});const len=Array.from(chunk.text).length;r.height=Math.min(400,Math.max(28,21*(1+Math.ceil(len/38))));});
  }
 }
 const rel=sheet('關係索引',['來源','來源類型','關係','對象','對象類型','依據','來源 ID','對象 ID','關係 ID'],[26,14,28,26,14,18,40,40,42]);
 for(const e of edges){const a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)continue;const r=row(rel,[a.name,TYPES[a.type][0],e.label,b.name,TYPES[b.type][0],e.formal?'手動連線':e.mention?'筆記提及':'基本設定',a.id,b.id,e.id]);jump(r.getCell(1),a.id);jump(r.getCell(4),b.id);}
 const pics=story.nodes.filter(n=>n.image||n.extraImages?.length);
 if(pics.length){const ws=sheet('圖片',['所屬設定','分類','圖片序號','圖片','設定 ID'],[30,16,14,44,40]);for(const n of pics){let i=0;for(const src of [n.image,...(n.extraImages||[])].filter(Boolean)){const r=row(ws,[n.name,TYPES[n.type][0],++i,'',n.id]);jump(r.getCell(1),n.id);const {base64,ratio}=await png(src);const h=Math.min(150,280/ratio);r.height=120;ws.addImage(wb.addImage({base64,extension:'png'}),{tl:{col:3,row:r.number-1},ext:{width:h*ratio,height:h},editAs:'oneCell'});}}}
 return wb.xlsx.writeBuffer();
}
button.onclick=async()=>{button.disabled=true;button.textContent='整理中…';try{
 await window.worldluz.ready;const story=structuredClone(state),edges=allLinks(),bodies=new Map(story.nodes.map(n=>[n.id,resolvedBody(n)]));
 const buf=await report(await library(),story,edges,bodies);const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=(story.name.replace(/[\\/:*?"<>|]/g,'_')||'未命名劇本')+'－GPT背景整理.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('GPT 背景整理檔已匯出，可直接上傳給 GPT。');
 }catch(e){toast('Excel 匯出失敗：'+e.message);}finally{button.disabled=false;button.textContent='匯出 Excel';}};
})();
