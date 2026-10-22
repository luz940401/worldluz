const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('esbuild');
(async()=>{
 await esbuild.build({entryPoints:['src/cloud-client.js'],bundle:true,minify:true,format:'iife',target:['es2022'],outfile:'cloud.js',legalComments:'eof'});
 const out=path.resolve('_site');fs.mkdirSync(out,{recursive:true});
 for(const name of ['index.html','app.js','style.css','cloud.js','config.js'])fs.copyFileSync(name,path.join(out,name));
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(url||key){
  if(!url||!key||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  if(!key.startsWith('sb_publishable_')){
   let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role;}catch{}
   if(role!=='anon')throw Error('Only a publishable or legacy anon key may be exposed in the website.');
  }
  fs.writeFileSync(path.join(out,'config.js'),'window.WORLDLUZ_CONFIG = '+JSON.stringify({supabaseUrl:url,supabaseKey:key})+';\n');
 }
 fs.writeFileSync(path.join(out,'.nojekyll'),'');
 console.log('Built _site/ — static files only, no local worlds or backups.');
})().catch(e=>{console.error(e.message);process.exit(1)});
