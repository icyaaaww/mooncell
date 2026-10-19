import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',workers:1,timeout:30000,use:{headless:true,viewport:{width:1440,height:1000}},reporter:'list',projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'firefox',use:{browserName:'firefox'}}],webServer:{command:'node scripts/server.mjs',port:4308,reuseExistingServer:true}});
