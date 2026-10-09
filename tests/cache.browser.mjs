// 旧URLに古い内容が残っていても、Ver. 0.2がそこを読み込まないことを検証。
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright'),base=process.env.TEST_URL||'http://127.0.0.1:8766/';
for(const [name,executablePath] of [['Chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],['Edge','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']]){
 const browser=await chromium.launch({executablePath,headless:true}),page=await browser.newPage(),stale=[];
 await page.route(url=>!url.search&&['/config.js','/catalog.js','/audio.js','/config/timer.yaml'].some(path=>url.pathname.endsWith(path)),route=>{stale.push(route.request().url());return route.fulfill({contentType:'text/javascript',body:'throw new Error("Stale Ver. 0.1 resource");'});});
 await page.goto(base);await page.waitForFunction(()=>!document.querySelector('#start').disabled);await page.locator('#settings-toggle').click();await page.locator('#editable details summary').click();assert.equal(await page.locator('[data-sound=start] option').count(),11);assert.deepEqual(stale,[]);console.log(`${name}: old-URL cache guard PASS`);await browser.close();
}
