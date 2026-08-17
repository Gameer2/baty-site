const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = '/home/ameer/Desktop/baty site the new arc';
const lessons = fs.readFileSync('/tmp/lessons.txt','utf8').trim().split('\n');
(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const rel of lessons) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    const abs = path.join(ROOT, rel);
    const url = 'file://' + encodeURI(abs);
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 }); await page.waitForTimeout(1500); }
    catch (e) { errs.push('LOAD: ' + (e.message||'').split('\n')[0]); }
    const filtered = errs.filter(e => !e.includes('file:///math-lab') && !e.includes('note-taker'));
    if (filtered.length) results.push({ rel, errs: filtered.slice(0,4) });
    await page.close();
  }
  await browser.close();
  fs.writeFileSync('/tmp/anim_sweep.json', JSON.stringify({ total: lessons.length, withErrors: results.length, results }, null, 1));
})();
