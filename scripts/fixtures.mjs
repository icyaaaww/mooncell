import {mkdir,writeFile} from 'node:fs/promises';
import {demo} from '../web/demo.mjs';
await mkdir(new URL('../examples/',import.meta.url),{recursive:true});
for(const name of ['clean','broken','exception','overwritten'])await writeFile(new URL(`../examples/quotation-${name}.json`,import.meta.url),JSON.stringify(demo(name),null,2));
console.log('Generated 4 synthetic JSON fixtures. XLSX files are regenerated with scripts/fixtures.py.');
