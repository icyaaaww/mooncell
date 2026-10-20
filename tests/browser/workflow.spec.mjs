import {test,expect} from '@playwright/test';
import path from 'node:path';
import {demo} from '../../web/demo.mjs';
test.beforeEach(async({page})=>{await page.goto('http://127.0.0.1:4308/MoonCell.html');await expect(page.locator('body')).toHaveAttribute('aria-busy','false')});
test('demo evidence and independently calculated repair impact',async({page})=>{
  await expect(page.locator('.finding')).toHaveCount(1);
  await expect(page.locator('#detail')).toContainText('=D7*E7');
  await page.locator('#preview').click();
  await expect(page.locator('#preview-result')).toContainText('57,876');
  await expect(page.locator('#preview-result .impact')).toHaveCount(3);
  await page.screenshot({path:'docs/screenshots/workbench.png',fullPage:true});
});
test('real XLSX import and new upload resets reviews',async({page})=>{
  await page.getByRole('button',{name:'标记合理例外',exact:true}).click();await expect(page.locator('.badge')).toHaveText('合理例外');
  await page.locator('#upload').setInputFiles(path.resolve('examples/quotation-broken.xlsx'));
  await expect(page.locator('#book-name')).toHaveText('quotation-broken.xlsx');await expect(page.locator('.badge')).toHaveText('待核查');
  await expect(page.locator('#grid')).toContainText('调研访谈');
});
test('baseline requires explicit positional correspondence',async({page})=>{
  await page.locator('#upload').setInputFiles(path.resolve('examples/quotation-overwritten.xlsx'));
  await expect(page.locator('#book-name')).toHaveText('quotation-overwritten.xlsx');
  await page.locator('#baseline').setInputFiles(path.resolve('examples/quotation-clean.xlsx'));
  await expect(page.locator('#baseline-name')).toContainText('quotation-clean.xlsx');
  await expect(page.locator('#compare')).toBeDisabled();await page.locator('#aligned').check();await page.locator('#compare').click();
  await expect(page.locator('#detail')).toContainText('变成了常量');await expect(page.locator('#findings')).toContainText('F7');
});
test('clean scenario and review report download',async({page})=>{
  await page.locator('#scenario').selectOption('clean');await page.locator('#load-demo').click();
  await expect(page.locator('#findings')).toContainText('不代表');
  const pending=page.waitForEvent('download');await page.locator('#export').click();const dl=await pending;expect(dl.suggestedFilename()).toBe('MoonCell-审查记录.json');
});
test('malformed file leaves previous workbook intact',async({page})=>{
  await page.locator('#upload').setInputFiles({name:'bad.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('bad')});
  await expect(page.locator('#status')).toContainText('不是有效');await expect(page.locator('.finding')).toHaveCount(1);
});
test('mobile layout has no page-level overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'docs/screenshots/mobile.png',fullPage:true});
});
test('workbook content is rendered as text not markup',async({page})=>{
  const data={schema:'mooncell.workbook.v1',cells:[{sheet:'S',address:'A1',formula:'',value:'<img src=x onerror="window.pwned=1">',kind:'text'}]};
  await page.locator('#upload').setInputFiles({name:'safe.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('#grid')).toContainText('<img');expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});
test('changing baseline clears stale differences',async({page})=>{
  await page.locator('#demo-baseline').click();await page.locator('#aligned').check();await page.locator('#compare').click();
  await expect(page.locator('#findings')).toContainText('公式发生变化');
  await page.locator('#baseline').setInputFiles(path.resolve('examples/quotation-broken.xlsx'));
  await page.locator('#tab-diff').click();await expect(page.locator('#findings .finding')).toHaveCount(0);
  await page.locator('#aligned').check();await page.locator('#compare').click();await expect(page.locator('#findings')).toContainText('没有发现公式变化');
});

test('save and restore retains review notes and recomputes the baseline comparison',async({page})=>{
  await page.getByRole('button',{name:'标记合理例外',exact:true}).click();
  await page.locator('#review-note').fill('这是经确认的折扣，等待财务复核');
  await page.locator('#demo-baseline').click();await page.locator('#aligned').check();await page.locator('#compare').click();
  await expect(page.locator('#findings')).toContainText('公式发生变化');
  const pending=page.waitForEvent('download');await page.locator('#save-session').click();const file=await pending;
  const saved=await file.path();
  await page.locator('#scenario').selectOption('clean');await page.locator('#load-demo').click();await expect(page.locator('#findings')).toContainText('不代表');
  await page.locator('#restore-session').setInputFiles(saved);await expect(page.locator('#status')).toContainText('审核进度已恢复');
  await expect(page.locator('.badge')).toHaveText('合理例外');await expect(page.locator('#review-note')).toHaveValue('这是经确认的折扣，等待财务复核');
  await page.locator('#tab-diff').click();await expect(page.locator('#findings')).toContainText('公式发生变化');
});
test('tampered session preserves current workspace and decisions',async({page})=>{
  await page.getByRole('button',{name:'确认是问题',exact:true}).click();
  const pending=page.waitForEvent('download');await page.locator('#save-session').click();const dl=await pending;
  const fs=await import('node:fs/promises');const bundle=JSON.parse(await fs.readFile(await dl.path(),'utf8'));bundle.payload.book.name='forged';
  await page.locator('#restore-session').setInputFiles({name:'bad.mooncell.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
  await expect(page.locator('#status')).toContainText('完整性校验失败');await expect(page.locator('.badge')).toHaveText('确认问题');await expect(page.locator('#book-name')).not.toHaveText('forged');
});
test('filtering, notes and manual address navigation',async({page})=>{
  await page.getByRole('button',{name:'标记合理例外',exact:true}).click();await page.locator('#review-filter').selectOption('pending');
  await expect(page.locator('.finding')).toHaveCount(0);await page.locator('#review-filter').selectOption('exception');await expect(page.locator('.finding')).toHaveCount(1);
  await page.locator('#review-note').fill('复核备注');await page.locator('#finding-query').fill('复核');await expect(page.locator('.finding')).toHaveCount(1);
  await page.locator('#jump-address').fill('AA120');await page.locator('#jump-form button').click();await expect(page.locator('#active-address')).toHaveText('AA120');
  await page.locator('#next-rows').click();await expect(page.locator('#active-address')).toHaveText('AA170');
});
test('HTML report is readable and includes human decisions',async({page})=>{
  await page.getByRole('button',{name:'确认是问题',exact:true}).click();await page.locator('#review-note').fill('核查了合同单价');
  const pending=page.waitForEvent('download');await page.locator('#export-html').click();const dl=await pending;
  const fs=await import('node:fs/promises'),html=await fs.readFile(await dl.path(),'utf8');
  expect(dl.suggestedFilename()).toBe('MoonCell-审查报告.html');expect(html).toContain('核查了合同单价');expect(html).toContain('确认问题');expect(html).not.toContain('<script');
});
test('cancelling file reading retains workbook and subsequent analysis works',async({page})=>{
  await page.evaluate(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){await new Promise(resolve=>setTimeout(resolve,250));return original.call(this)}});
  await page.locator('#upload').setInputFiles(path.resolve('examples/quotation-clean.xlsx'));await page.locator('#cancel').click();
  await expect(page.locator('#status')).toContainText('已取消');await expect(page.locator('.finding')).toHaveCount(1);
  await page.locator('#upload').setInputFiles(path.resolve('examples/quotation-clean.xlsx'));await expect(page.locator('#book-name')).toHaveText('quotation-clean.xlsx');await expect(page.locator('.finding')).toHaveCount(0);
});
test('standalone file runs with no network dependency',async({page})=>{
  const {pathToFileURL}=await import('node:url');await page.goto(pathToFileURL(path.resolve('dist/MoonCell.html')).href);
  await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await expect(page.locator('.finding')).toHaveCount(1);
  await page.locator('#preview').click();await expect(page.locator('#preview-result')).toContainText('57,876');
});

test('multi-sheet imports open the finding sheet and clear unrelated evidence on sheet change',async({page})=>{
  const book=demo('broken');book.sheets=['封面',...book.sheets];book.cells.unshift({sheet:'封面',address:'A1',formula:'',value:'只读说明',kind:'text'});
  await page.locator('#upload').setInputFiles({name:'多工作表.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(book))});
  await expect(page.locator('#book-name')).toHaveText('多工作表.json');
  await expect(page.locator('#sheet')).toHaveValue('项目报价');await expect(page.locator('td.selected button')).toHaveAttribute('aria-label',/F7/);
  await page.locator('#sheet').selectOption('封面');await expect(page.locator('#grid')).toContainText('只读说明');await expect(page.locator('#detail')).toBeEmpty();await expect(page.locator('td.evidence')).toHaveCount(0);
  await page.locator('#sheet').selectOption('项目报价');await expect(page.locator('#detail')).toContainText('=D7*E7');await expect(page.locator('#active-address')).toHaveText('F7');
});
