// Draait index.html headless in Chromium met fictieve data en controleert de rekenkern.
// Gebruik: npm test   (vereist devDependency playwright met een Chromium-build)
// De CDN wordt geblokkeerd: de tests dekken ook de werking zónder grafiekbibliotheek.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { build, mk } = require('./fixtures/seed.js');
const ROOT = path.join(__dirname, '..');
const tests = []; const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'ongelijk') + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'verwachtte waar'); };

test('rekenbalk: parser zonder eval', async ({ page }) => {
  const cases = [['2+3', 5], ['10/4', 2.5], ['3,5*2', 7], ['(2+3)*4', 20], ['-5+2', -3], ['2*(3+4)/7', 2], ['abc', null], ['2++3', null], ['1.2.3', null], ['(2+3', null], ['', null], ['7', 7], ['100-12,5', 87.5], ['1/0', null]];
  const got = await page.evaluate(cs => cs.map(([e]) => calc(e)), cases);
  eq(got, cases.map(c => c[1]));
});
test('migratie: oude holdings naar één totaalbedrag, eenmalig', async ({ page }) => {
  // Legacy USD-post: 190 USD × 0,90 = 171 EUR per stuk, 10 stuks → 1710 EUR totale waarde.
  // De euro-post: 40 × 96,50 = 3860. Het ingelegde bedrag blijft staan, per-aandeel velden verdwijnen.
  const r = await page.evaluate(() => {
    const [a, b, c] = S.wealth.holdings;
    return { schema: S.wealth.schema, a: a.manualValue, aIn: a.totalCostEur, b: b.manualValue, bIn: b.totalCostEur, c: c.manualValue,
      rest: Object.keys(a).filter(k => ['kind', 'ticker', 'quantity', 'avgPrice', 'lastPrice', 'lots', 'totalCost', 'currency'].includes(k)), key: S.wealth.apiKey };
  });
  eq(r, { schema: 3, a: 1710, aIn: 1500, b: 3860, bIn: 3200, c: 9800, rest: [] }, 'aantal × koers → totaalbedrag; sleutel en per-aandeel velden weg');
  const again = await page.evaluate(() => { hydrateState(JSON.parse(JSON.stringify(S))); return { schema: S.wealth.schema, a: S.wealth.holdings[0].manualValue }; });
  eq(again, { schema: 3, a: 1710 }, 'tweede hydrate mag niets opnieuw omrekenen');
});
test('belegging: één totaalbedrag toevoegen en bijwerken', async ({ page }) => {
  const r = await page.evaluate(() => {
    const voor = getTotalWealth().belegd;
    openHoldingModal();
    document.getElementById('h-name').value = 'Portefeuille';
    document.getElementById('h-value').value = '5000';
    document.getElementById('h-invested').value = '4000';
    document.getElementById('h-save').click();
    const h = S.wealth.holdings.find(x => x.name === 'Portefeuille');
    const naToevoegen = getTotalWealth().belegd;
    // Bijwerken: nieuwe waarde, datum schuift mee
    const eersteDatum = h.lastUpdate;
    openHoldingModal(h.id);
    document.getElementById('h-value').value = '5500';
    document.getElementById('h-save').click();
    const na = S.wealth.holdings.find(x => x.id === h.id);
    return {
      erbij: Math.round(naToevoegen - voor), waarde: na.manualValue, ingelegd: na.totalCostEur,
      rendement: Math.round(getHoldingPnLEur(na)), datumGezet: eersteDatum > 0, geenVelden: 'quantity' in na || 'lastPrice' in na || 'ticker' in na,
    };
  });
  eq(r, { erbij: 5000, waarde: 5500, ingelegd: 4000, rendement: 1500, datumGezet: true, geenVelden: false },
    'één bedrag in, rendement = waarde − inleg');
});
test('belegging: waarde is verplicht, ongeldige link wordt geweigerd', async ({ page }) => {
  const r = await page.evaluate(() => {
    const n = S.wealth.holdings.length;
    openHoldingModal();
    document.getElementById('h-name').value = 'Leeg';
    document.getElementById('h-value').value = '';
    document.getElementById('h-save').click();
    const naLeeg = S.wealth.holdings.length;
    document.getElementById('h-value').value = '100';
    document.getElementById('h-url').value = 'javascript:alert(1)';
    document.getElementById('h-save').click();
    const naLink = S.wealth.holdings.length;
    document.getElementById('h-url').value = 'broker.example';
    document.getElementById('h-save').click();
    return { n, naLeeg, naLink, na: S.wealth.holdings.length, url: (S.wealth.holdings.find(h => h.name === 'Leeg') || {}).url };
  });
  eq({ leeg: r.naLeeg - r.n, link: r.naLink - r.n, ok: r.na - r.n, url: r.url },
    { leeg: 0, link: 0, ok: 1, url: 'https://broker.example' }, 'geen waarde en geen http(s)-link → niet opgeslagen');
});
test('vermogen: buckets tellen op tot totaal, geblokkeerd netto na heffing', async ({ page }) => {
  const t = await page.evaluate(() => getTotalWealth());
  eq(Math.round(t.vrij + t.gereserveerd + t.belegd + t.geblokkeerd), Math.round(t.total));
  eq(Math.round(t.geblokkeerd), 6860, '9800 × (1 − 30%)');
  eq(Math.round(t.belegd), 1710 + 3860, 'som van de twee totaalbedragen');
});
test('gespaard: afgesloten maand gebruikt inkomen-snapshot', async ({ page }) => {
  const r = await page.evaluate(() => {
    const prev = new Date(); prev.setMonth(prev.getMonth() - 1); const m = mkd(prev);
    const live = getSaved(m);
    S.monthlyData[m].__incomeSnapshot = _calcMonthlyIncome() + 500; _invalidateCaches();
    return { live, snap: getSaved(m), cur: getMonthlyIncome() };
  });
  eq(Math.round(r.snap - r.live), 500, 'snapshot +500 → gespaard +500');
});
test('maand wissen verwijdert totalen én transacties', async ({ page }) => {
  const r = await page.evaluate(() => {
    const prev = new Date(); prev.setMonth(prev.getMonth() - 1); const m = mkd(prev);
    const before = S.transactions.filter(t => t.month === m).length;
    viewMonth = new Date(prev.getFullYear(), prev.getMonth(), 1);
    document.getElementById('d-del-month').click();
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Maand wissen'); btn.click();
    return { before, after: S.transactions.filter(t => t.month === m).length, md: !!S.monthlyData[m] };
  });
  ok(r.before > 0); eq(r.after, 0); eq(r.md, false);
});
test('score: geen score zonder data, wel voor afgesloten maand, delen tellen op', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cur = calcHealthScore(mkd(new Date()));
    const prev = new Date(); prev.setMonth(prev.getMonth() - 2);
    const past = calcHealthScore(mkd(prev));
    return { curReady: cur.ready, pastReady: past.ready, score: past.score, sum: past.components.reduce((s, c) => s + c.val, 0), maxSum: past.components.reduce((s, c) => s + c.max, 0) };
  });
  eq(r.curReady, false, 'lopende maand zonder uitgaven'); eq(r.pastReady, true);
  eq(r.sum, r.score); eq(r.maxSum, 100); ok(r.score >= 0 && r.score <= 100);
});
test('vaten: betaling op een vaste kost vult het vat en raakt de maandbudgetten niet', async ({ page }) => {
  const r = await page.evaluate(() => {
    const m = mkd(new Date());
    const voor = { spent: getMonthSpent(m), budget: getMonthBudget(), saved: getSaved(m) };
    const pot0 = getFixedPot('auto_verz', m);
    addFixedPayment('auto_verz', m, 300, 'Restant');
    const pot1 = getFixedPot('auto_verz', m);
    const na = { spent: getMonthSpent(m), budget: getMonthBudget(), saved: getSaved(m) };
    return { voor, na, gebruikt0: pot0.used, gebruikt1: pot1.used, capaciteit: pot1.capacity, over: pot1.over, venster: pot1.win.label };
  });
  eq(r.voor, r.na, 'maandcijfers mogen niet wijzigen');
  eq(r.gebruikt1 - r.gebruikt0, 300, 'vat moet met 300 vullen');
  eq(r.capaciteit, 540, 'jaarvat = het jaarbedrag van de vaste kost');
  eq(r.venster, String(new Date().getFullYear()), 'jaarvat loopt over het kalenderjaar');
  ok(r.over === true, '300 + 300 > 540 moet als overschrijding gelden');
});
test('vaten: alleen gemarkeerde kosten staan in de afboeklijst', async ({ page }) => {
  const r = await page.evaluate(() => {
    const namen = getTrackedFixedItems().map(x => x.item.name).sort();
    const alle = getFixedItems().length;
    const m = mkd(new Date());
    // Huur is een domiciliëring zonder vat; water staat uit maar heeft wel een betaling
    const huur = getFixedItem('huur').item, water = getFixedItem('water').item;
    return { namen, alle, huurPot: hasPot(huur, m), waterTrack: water.track === true, waterPot: hasPot(water, m) };
  });
  eq(r.namen, ['Auto', 'Onderhoud', 'Reizen'], 'enkel posten met track: true');
  ok(r.alle > r.namen.length, 'er zijn meer vaste kosten dan vaten');
  eq(r.huurPot, false, 'domiciliëring krijgt geen vat');
  eq(r.waterTrack, false); eq(r.waterPot, true, 'uitgezet vat met betalingen blijft zichtbaar');
});
test('vaten: schakelaar zet een vat aan en uit', async ({ page }) => {
  const r = await page.evaluate(() => {
    const voor = getTrackedFixedItems().length;
    toggleFixedTrack('gas');
    const aan = getTrackedFixedItems().length;
    toggleFixedTrack('gas');
    return { voor, aan, terug: getTrackedFixedItems().length, opgeslagen: JSON.parse(localStorage.getItem('buddy-budget-v5')).fixedGroups.flatMap(g => g.items).find(i => i.id === 'gas').track };
  });
  eq(r.aan, r.voor + 1); eq(r.terug, r.voor); eq(r.opgeslagen, false, 'stand wordt bewaard');
});
test('vaten: venster volgt de periode (maand, kwartaal, jaar)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const y = new Date().getFullYear();
    const w = p => fixedPotWindow(p, y + '-05');
    const kwartaal = getFixedPot('water', y + '-05');
    const buiten = getFixedPot('water', y + '-11');   // ander kwartaal: eigen vat
    return {
      jaar: w('y'), kw: w('q'), maand: w('m'),
      kwGebruikt: kwartaal.used, buitenGebruikt: buiten.used,
    };
  });
  eq(r.jaar.from.slice(5), '01'); eq(r.jaar.to.slice(5), '12'); eq(r.jaar.months, 12);
  eq(r.kw.from.slice(5), '04'); eq(r.kw.to.slice(5), '06'); eq(r.kw.months, 3);
  eq(r.maand.from, r.maand.to); eq(r.maand.months, 1);
  ok(r.kwGebruikt !== r.buitenGebruikt || r.kwGebruikt === 0, 'kwartaalvaten staan los van elkaar');
});
test('vaten: verwijderen leegt het vat weer', async ({ page }) => {
  const r = await page.evaluate(() => {
    const m = mkd(new Date());
    addFixedPayment('gas', m, 75, 'Test');
    const na = getFixedPot('gas', m).used;
    const id = S.fixedPayments.find(p => p.fixedId === 'gas').id;
    deleteFixedPayment(id);
    return { na, terug: getFixedPot('gas', m).used };
  });
  eq(r.na, 75); eq(r.terug, 0);
});
test('prognose: te vroeg in de maand → één rustige melding, geen σ-signalen', async ({ page }) => {
  await page.click('.nav-btn[data-s=analytics]'); await page.click('.an-tab[data-tab=prognose]');
  const txt = await page.evaluate(() => document.getElementById('fc-signals').textContent);
  ok(/Nog te vroeg/.test(txt), 'melding ontbreekt'); ok(!/σ/.test(txt), 'σ-signaal zichtbaar');
});
test('plan: projectie is deterministisch en de band groeit met de schommeling', async ({ page }) => {
  const r = await page.evaluate(() => {
    const a = projectWealth().map(s => Math.round(s.totalP50)); const b = projectWealth().map(s => Math.round(s.totalP50));
    S.plan.volatility = 5; const narrow = projectWealth(); S.plan.volatility = 30; const wide = projectWealth(); S.plan.volatility = 15;
    const last = s => s[s.length - 1];
    return { same: JSON.stringify(a) === JSON.stringify(b), narrow: last(narrow).totalP90 - last(narrow).totalP10, wide: last(wide).totalP90 - last(wide).totalP10 };
  });
  ok(r.same, 'twee runs verschillen'); ok(r.wide > r.narrow * 2, 'band schaalt niet met volatiliteit');
});
test('prognose: nooit lager dan wat al uitgegeven is, en het anker dooft uit', async ({ page }) => {
  const r = await page.evaluate(() => {
    const m = mkd(new Date()), cats = S.categories.filter(c => c.type === 'monthly');
    const echt = calcPace, fouten = [], gewichten = [];
    const hist = calcStats(getMonthHistory(12).map(h => h.spent)).mean;
    for (const d of [1, 3, 7, 14, 21, 28, 30]) {
      window.calcPace = () => ({ dayOfMonth: d, daysInMonth: 30, pctElapsed: d / 30, isCurrentMonth: true, daysLeft: 31 - d });
      for (const f of [0.2, 0.9, 1.5, 2.2, 4]) {
        const besteed = hist * f * (d / 30);
        S.monthlyData[m] = {}; cats.forEach(c => { S.monthlyData[m][c.id] = besteed * (c.budget / getMonthBudget()); });
        _invalidateCaches();
        const fc = calcMonthEndForecast(); if (!fc) continue;
        const echtBesteed = getMonthSpent(m);
        if (fc.point < echtBesteed - 0.5) fouten.push(`dag ${d}, tempo ${f}: prognose ${Math.round(fc.point)} < besteed ${Math.round(echtBesteed)}`);
        if (fc.p10 < echtBesteed - 0.5) fouten.push(`dag ${d}, tempo ${f}: p10 onder besteed`);
        if (fc.p90 < fc.point - 0.5) fouten.push(`dag ${d}, tempo ${f}: p90 onder punt`);
        if (d === 30) gewichten.push(Math.round(fc.point) === Math.round(Math.max(echtBesteed, echtBesteed)) || fc.point >= echtBesteed - 0.5);
      }
    }
    // Op de laatste dag mag de historiek de prognose niet meer sturen
    window.calcPace = () => ({ dayOfMonth: 30, daysInMonth: 30, pctElapsed: 1, isCurrentMonth: true, daysLeft: 1 });
    S.monthlyData[m] = {}; cats.forEach(c => { S.monthlyData[m][c.id] = hist * 1.5 * (c.budget / getMonthBudget()); });
    _invalidateCaches();
    const slot = calcMonthEndForecast();
    const besteedSlot = getMonthSpent(m);
    window.calcPace = echt; _invalidateCaches();
    return { fouten, ankerUit: Math.abs(slot.point - besteedSlot) < 0.5, hist: Math.round(hist), slot: Math.round(slot.point), besteedSlot: Math.round(besteedSlot) };
  });
  eq(r.fouten, [], 'prognose-invarianten geschonden');
  ok(r.ankerUit, `op de laatste dag moet de prognose gelijk zijn aan het bestede (${r.slot} vs ${r.besteedSlot}, historisch ${r.hist})`);
});
test('plan: een ongedekte uitgave wordt een tekort, geen negatieve portefeuille', async ({ page }) => {
  const r = await page.evaluate(() => {
    const y = new Date().getFullYear();
    S.plan.events = [{ id: 'x', name: 'Enorm', startYear: y + 1, endYear: y + 1, amount: 500000, enabled: true }];
    S.plan.horizon = 10; _invalidateCaches();
    const ser = projectWealth();
    const w = getTotalWealth();
    return {
      belegdMin: Math.min(...ser.map(s => s.invest)),
      geblokkeerdMin: Math.min(...ser.map(s => s.blocked)),
      tekortNa: Math.round(ser[1].debt),
      tekortEind: Math.round(ser[10].debt),
      // totaal moet exact cash + belegd + geblokkeerd − tekort zijn
      klopt: Math.abs((ser[1].p50 + ser[1].invest + ser[1].blocked - ser[1].debt) - ser[1].totalP50) < Math.max(50, Math.abs(ser[1].totalP50) * 0.05),
      start: Math.round(ser[0].totalP50), nu: Math.round(w.total),
    };
  });
  ok(r.belegdMin >= -0.01, 'beleggingen mogen nooit negatief worden: ' + r.belegdMin);
  ok(r.geblokkeerdMin >= -0.01, 'geblokkeerd mag nooit negatief worden');
  ok(r.tekortNa > 0, 'een onbetaalbare uitgave moet een tekort opleveren');
  ok(r.tekortEind < r.tekortNa, 'de buffer moet het tekort afbouwen: ' + r.tekortNa + ' → ' + r.tekortEind);
  ok(r.klopt, 'totaal ≠ cash + belegd + geblokkeerd − tekort');
  ok(Math.abs(r.start - r.nu) <= Math.max(1, r.nu * 0.001), 'jaar 0 moet het huidige vermogen zijn');
});
test('rekenkern: statistiek komt overeen met bekende waarden', async ({ page }) => {
  const r = await page.evaluate(() => ({
    cdf: [normCdf(0), normCdf(1), normCdf(1.96), normCdf(-1)].map(v => +v.toFixed(6)),
    reg: (l => [+l.slope.toFixed(6), +l.intercept.toFixed(6), +l.r2.toFixed(6)])(linReg([1, 3, 5, 7, 9])),
    st: (t => [t.mean, +t.std.toFixed(6)])(calcStats([2, 4, 4, 4, 5, 5, 7, 9])),
    z: [zScore(110, 100, 5), zScore(100, 100, 0)],
  }));
  eq(r.cdf, [0.5, 0.841345, 0.975002, 0.158655], 'normale CDF');
  eq(r.reg, [2, 1, 1], 'lineaire regressie op y=2x+1');
  eq(r.st, [5, +Math.sqrt(32 / 7).toFixed(6)], 'gemiddelde en steekproef-standaardafwijking');
  eq(r.z, [2, 0], 'z-score, met nul-deling afgevangen');
});
test('rekenkern: identiteiten kloppen op de seed', async ({ page }) => {
  const r = await page.evaluate(() => {
    const m = mkd(new Date()), y = new Date().getFullYear();
    const cats = S.categories.filter(c => c.type === 'monthly');
    const w = getTotalWealth();
    let jaar = 0; for (let i = 1; i <= 12; i++) jaar += getMonthSpent(y + '-' + String(i).padStart(2, '0'));
    const vast = S.fixedGroups.flatMap(g => g.items).filter(i => i.enabled)
      .reduce((s, i) => s + (i.period === 'y' ? i.amount / 12 : i.period === 'q' ? i.amount / 3 : i.amount), 0);
    return {
      maandVsCats: [getMonthSpent(m), cats.reduce((s, c) => s + getCatSpent(c.id, m), 0)],
      emmers: [+(w.vrij + w.gereserveerd + w.belegd + w.geblokkeerd).toFixed(2), +w.total.toFixed(2)],
      jaar: [+getYearTotal(y).toFixed(2), +jaar.toFixed(2)],
      ytdBinnenJaar: getYTDTotal(y, 12) <= getYearTotal(y) + 0.01,
      vast: [+getFixedCosts().toFixed(2), +vast.toFixed(2)],
    };
  });
  eq(r.maandVsCats[0], r.maandVsCats[1], 'maandtotaal ≠ som categorieën');
  eq(r.emmers[0], r.emmers[1], 'vermogensemmers ≠ totaal');
  eq(r.jaar[0], r.jaar[1], 'jaartotaal ≠ som van de maanden');
  ok(r.ytdBinnenJaar, 'YTD groter dan jaartotaal');
  eq(r.vast[0], r.vast[1], 'vaste kosten ≠ genormaliseerde som');
});
test('vault: v2-formaat met iteratiegetal, legacy-blob leesbaar, fout wachtwoord faalt', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const data = { a: 1, lijst: [1, 2, 3] };
    const b64 = await encryptVault(data, 'test-wachtwoord');
    const back = await decryptVault(b64, 'test-wachtwoord');
    const iterV2 = _vaultIter;
    // Legacy-blob nabouwen: salt|iv|ct met 200k iteraties, zonder header
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveVaultKey('oud-ww', salt, VAULT_ITER_LEGACY);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))));
    const legacy = new Uint8Array(28 + ct.length); legacy.set(salt, 0); legacy.set(iv, 16); legacy.set(ct, 28);
    let bin = ''; legacy.forEach(x => bin += String.fromCharCode(x));
    const backLegacy = await decryptVault(btoa(bin), 'oud-ww');
    let wrong = false; try { await decryptVault(b64, 'fout'); } catch (e) { wrong = true; }
    return { header: b64.slice(0, 4), back, iterV2, backLegacy, iterLegacy: _vaultIter, wrong };
  });
  eq(r.header, 'QlYC'); eq(r.back, { a: 1, lijst: [1, 2, 3] }); eq(r.iterV2, 600000);
  eq(r.backLegacy, { a: 1, lijst: [1, 2, 3] }); eq(r.iterLegacy, 200000); ok(r.wrong, 'fout wachtwoord moet falen');
});
test('geen scriptfouten bij navigatie door alle schermen en modals', async ({ page, errors }) => {
  for (const t of ['trends', 'prognose', 'vermogen', 'plan']) { await page.click('.nav-btn[data-s=analytics]'); await page.click('.an-tab[data-tab=' + t + ']'); }
  await page.evaluate(() => { openHoldingModal(); openAccountModal(); openEventModal(); openMetricDetail('health'); openMetricDetail('uitgegeven'); openQuickEntry(); });
  await page.evaluate(() => { closeDetailModal(); document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open')); showScreen('settings'); });
  eq(errors, []);
});

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; const url = `http://127.0.0.1:${port}/index.html`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  let failed = 0;
  for (const t of tests) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'nl-BE' });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/cdn\.jsdelivr|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
    await page.route('https://cdn.jsdelivr.net/**', r => r.abort());
    try {
      await page.goto(url); await page.evaluate(s => localStorage.setItem('buddy-budget-v5', JSON.stringify(s)), build());
      await page.goto(url, { waitUntil: 'networkidle' });
      await t.fn({ page, errors });
      if (errors.length) throw new Error('scriptfouten: ' + errors.join(' | '));
      console.log('  ✓ ' + t.name);
    } catch (e) { failed++; console.log('  ✗ ' + t.name + '\n      ' + (e.message || e)); }
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(`\n${tests.length - failed}/${tests.length} tests geslaagd`);
  process.exit(failed ? 1 : 0);
})();
