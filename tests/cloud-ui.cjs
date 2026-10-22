const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(process.cwd(),'_site',req.url==='/'?'index.html':req.url.split('?')[0]);if(!fs.existsSync(file)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForSelector('.card');await page.locator('#cloudBtn').click();assert.equal(await page.locator('#loginEmail').count(),1);await page.locator('#closeCloud').click();
 await page.locator('.card[data-id="p1"]').click();await page.locator('#nodeName').fill('雲端介面測試');await page.waitForTimeout(300);await page.reload();await page.waitForSelector('.card');assert.match(await page.locator('#cards').innerText(),/雲端介面測試/);
 await page.screenshot({path:'test-results/warm-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#addBtn').click();await page.locator('#newName').fill('手機上的靈感');await page.locator('#createBtn').click();assert.equal(await page.locator('#nodeName').inputValue(),'手機上的靈感');
 const panel=await page.locator('#inspector').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=391);await page.locator('#bodyEditor').fill('可以在手機編輯');await page.screenshot({path:'test-results/warm-mobile.png'});assert.deepEqual(errors,[]);
 await browser.close();await new Promise(r=>server.close(r));console.log('PASS: warm desktop/mobile UI, login panel, editing and persistence.');
})().catch(e=>{console.error(e);process.exit(1)});
