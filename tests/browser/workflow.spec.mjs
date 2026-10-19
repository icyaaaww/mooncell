import {test,expect} from '@playwright/test';
import path from 'node:path';
test.beforeEach(async({page})=>{await page.goto('http://127.0.0.1:4308/MoonCell.html')});
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
  await page.locator('#baseline').setInputFiles(path.resolve('examples/quotation-clean.xlsx'));
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
