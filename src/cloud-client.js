import {createClient} from '@supabase/supabase-js';
import {SyncEngine} from './sync-engine.mjs';

const labels={pending:'尚有變更待同步',syncing:'正在同步…',synced:'✓ 已同步',error:'同步暫停・點此查看',choose:'選擇同步資料',conflict:'兩台裝置有不同變更', 'signed-out':'登入同步'};
const config=window.WORLDLUZ_CONFIG||{};
const button=document.querySelector('#cloudBtn'),dialog=document.querySelector('#cloudDialog');
let client,engine,session=null,debounce,latestStatus='signed-out',latestError='',starting=false;
function panel(){
 const bridge=window.worldluz;
 const content=document.querySelector('#cloudContent');
 if(!config.supabaseUrl||!config.supabaseKey){
  content.innerHTML='<p>本機編輯已可使用。網站管理者完成雲端設定後，就能在任何裝置登入同步。</p><p>請依專案中的「部署說明」設定 Supabase，再部署 GitHub Pages。</p>';return;
 }
 if(!session){
  content.innerHTML='<p>用同一個電子郵件登入，就能在不同裝置繼續編輯。設定、人物圖片和關係會一起保存。</p><p style="font-size:13px">目前為個人使用，請使用你 Supabase 帳號的電子郵件收取登入信。</p><form id="loginForm"><label for="loginEmail">電子郵件</label><input id="loginEmail" type="email" autocomplete="email" placeholder="you@example.com" required><button class="primary" type="submit">寄送登入連結</button></form><p id="authMessage" role="status"></p>';
  document.querySelector('#loginForm').onsubmit=async e=>{
   e.preventDefault();const submit=e.target.querySelector('button');submit.disabled=true;
   try{if(location.protocol==='file:')throw Error('請從已部署的網站網址登入；本機檔案仍可離線編輯。');const {error}=await client.auth.signInWithOtp({email:document.querySelector('#loginEmail').value.trim(),options:{emailRedirectTo:new URL('./',location.href).href}});if(error)throw error;document.querySelector('#authMessage').textContent='登入連結已寄出，請到信箱點開。若未收到，請檢查垃圾郵件。';}catch(e){document.querySelector('#authMessage').textContent=errorMessage(e);}finally{submit.disabled=false;}
  };return;
 }
 content.innerHTML=`<p class="account-email">已登入：<strong></strong></p><p id="syncMessage" role="status"></p><div id="syncChoice"></div><div class="cloud-actions"><button id="syncNow">立即同步</button><button id="cloudBackup">匯出備份</button><button id="cloudImport">匯入備份</button></div><div class="cloud-actions"><button id="recoverBackup">下載最近的保護副本</button><button id="signOut">登出</button></div><p style="font-size:12px">離線時先保存在這台裝置，連線後再同步。登出後仍保留這台裝置的本機副本。</p>`;
 content.querySelector('strong').textContent=session.user.email||'你的帳號';
 document.querySelector('#syncMessage').textContent=(labels[latestStatus]||'準備同步')+(latestError?'\n'+latestError:'');
 if(engine?.conflict){
  const row=engine.conflict.row;
  document.querySelector('#syncChoice').innerHTML='<div class="sync-notice">'+(engine.conflict.first?'這台裝置的內容還沒與帳號連結。':'雲端與這台裝置都有不同內容。')+' 請選擇要繼續使用的版本；取代前會留下可下載的保護副本。</div><div class="cloud-actions"><button id="useRemote">使用雲端版本</button><button id="useLocal">使用本機版本並上傳</button></div>';
  document.querySelector('#useRemote').disabled=!row;
  for(const [id,choice] of [['useRemote','remote'],['useLocal','local']])document.querySelector('#'+id).onclick=async()=>{try{await engine.resolve(choice);}catch(e){setStatus('error',e);}panel();};
 }
 document.querySelector('#syncNow').onclick=()=>engine?.sync();
 document.querySelector('#cloudBackup').onclick=()=>document.querySelector('#exportBtn').click();
 document.querySelector('#cloudImport').onclick=()=>{dialog.close();document.querySelector('#importBtn').click();};
 document.querySelector('#recoverBackup').onclick=async()=>{const backup=await bridge.latestBackup();if(!backup){bridge.toast('尚未產生保護副本。');return;}bridge.download(backup.payload,'worldluz-保護副本-'+backup.at.slice(0,10)+'.json');};
 document.querySelector('#signOut').onclick=async()=>{if(engine?.meta.dirty&&!confirm('目前仍有尚未同步的修改。登出會保留本機副本，確定登出？'))return;engine?.stop();const {error}=await client.auth.signOut({scope:'local'});if(error)setStatus('error',error);};
}
function errorMessage(error){const m=error?.message||String(error);if(/fetch|network|offline/i.test(m))return '目前無法連線。修改已留在本機，連線恢復後會重試。';if(/rate|too many/i.test(m))return '登入信寄送太頻繁，請稍後再試。';if(/email.*not.*authorized|sending.*email/i.test(m))return '郵件服務尚未完成設定，請聯絡網站管理者。';return m;}
function setStatus(status,error){latestStatus=status;latestError=error?errorMessage(error):'';button.textContent='☁ '+(labels[status]||'登入同步');button.title=latestError||'登入後在不同裝置繼續編輯';if(dialog.open&&session)panel();}
button.onclick=()=>{panel();dialog.showModal();};document.querySelector('#closeCloud').onclick=()=>dialog.close();
function schedule(){clearTimeout(debounce);debounce=setTimeout(()=>engine?.sync(),1200);}
async function start(){
 if(starting)return;starting=true;const bridge=window.worldluz;await bridge.ready;
 if(!config.supabaseUrl||!config.supabaseKey){button.textContent='☁ 雲端同步';return;}
 client=createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'worldluz-auth'}});
 engine=new SyncEngine({
  meta:bridge.getMeta(),snapshot:bridge.snapshot,apply:bridge.applyRemote,backup:bridge.backup,saveMeta:bridge.setMeta,status:setStatus,
  remote:{
   async read(){const {data,error}=await client.from('worldluz_worlds').select('revision,payload').maybeSingle();if(error)throw error;return data;},
   async write(owner,revision,payload){const {data,error}=await client.rpc('worldluz_save',{expected_revision:revision,new_payload:payload});if(error)throw error;return data;}
  }
 });
 bridge.onChange(()=>{engine.changed();schedule();});
 let connectedUser=null;
 const activate=async next=>{session=next;if(next?.user.id!==connectedUser){engine.stop();connectedUser=next?.user.id||null;if(connectedUser)await engine.connect(connectedUser);else setStatus('signed-out');}if(dialog.open)panel();};
 client.auth.onAuthStateChange((event,next)=>{setTimeout(()=>activate(next),0);});
 const {data,error}=await client.auth.getSession();if(error)setStatus('error',error);else await activate(data.session);
 setInterval(()=>{if(document.visibilityState==='visible')engine.sync();},20000);
 window.addEventListener('online',()=>engine.sync());window.addEventListener('focus',()=>engine.sync());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')engine.sync();});
 window.addEventListener('beforeunload',e=>{if(session&&engine.meta.dirty){e.preventDefault();e.returnValue='';}});
}
start().catch(e=>setStatus('error',e));
