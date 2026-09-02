// Volledig fictieve testdata. Geen echte bedragen, namen of categorieën van een gebruiker.
// build(now) maakt een state met 8 afgesloten maanden vóór `now` en een lege lopende maand.
function mk(y, m) { return y + '-' + String(m).padStart(2, '0'); }
function build(now = new Date()) {
  let r = 42; const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
  const cats = [
    { id: 'c1', name: 'Boodschappen', icon: 'cart', color: 'emerald', budget: 420, costType: 'semi', type: 'monthly' },
    { id: 'c2', name: 'Vervoer', icon: 'car', color: 'sky', budget: 140, costType: 'variable', type: 'monthly' },
    { id: 'c3', name: 'Vrije tijd', icon: 'sun', color: 'amber', budget: 180, costType: 'variable', type: 'monthly' },
    { id: 'c4', name: 'Restaurant', icon: 'coffee', color: 'rose', budget: 150, costType: 'variable', type: 'monthly' },
    { id: 'c5', name: 'Kleding', icon: 'gift', color: 'violet', budget: 90, costType: 'variable', type: 'monthly' },
    { id: 'c6', name: 'Huishouden', icon: 'home', color: 'cyan', budget: 70, costType: 'semi', type: 'monthly' },
  ];
  const shops = { c1: ['Supermarkt', 'Bakker'], c2: ['Tanken', 'Trein'], c3: ['Cinema', 'Sportclub'], c4: ['Pizzeria', 'Lunch'], c5: ['Schoenen'], c6: ['Poetsproduct'] };
  const monthlyData = {}; const transactions = [];
  for (let back = 8; back >= 1; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1); const key = mk(d.getFullYear(), d.getMonth() + 1);
    monthlyData[key] = {};
    cats.forEach(c => {
      const n = 2 + Math.round(rnd() * 4); let tot = 0;
      for (let i = 0; i < n; i++) {
        const amt = Math.round(c.budget * (0.08 + rnd() * 0.3) * 100) / 100; tot += amt;
        transactions.push({ id: 't' + key + c.id + i, catId: c.id, month: key, amount: amt, detail: shops[c.id][i % shops[c.id].length], ts: new Date(d.getFullYear(), d.getMonth(), 1 + Math.floor(rnd() * 27), 12).getTime() });
      }
      monthlyData[key][c.id] = Math.round(tot * 100) / 100;
    });
    monthlyData[key].__fixedSnapshot = 1187.5;
  }
  const fixedGroups = [
    { id: 'wonen', name: 'Wonen', icon: 'home', color: 'emerald', items: [{ id: 'huur', name: 'Hypotheek/Huur', amount: 850, period: 'm', enabled: true }] },
    { id: 'nuts', name: 'Nuts', icon: 'zap', color: 'amber', items: [{ id: 'gas', name: 'Gas', amount: 60, period: 'm', enabled: true }, { id: 'elektriciteit', name: 'Elektriciteit', amount: 80, period: 'm', enabled: true }, { id: 'water', name: 'Water', amount: 90, period: 'q', enabled: true }] },
    { id: 'abonnementen', name: 'Abonnementen', icon: 'tv', color: 'orange', items: [{ id: 'internet', name: 'Internet', amount: 45, period: 'm', enabled: true }, { id: 'gsm', name: 'GSM', amount: 15, period: 'm', enabled: true }] },
    { id: 'verzekering', name: 'Verzekering', icon: 'shield', color: 'sky', items: [{ id: 'auto_verz', name: 'Auto', amount: 540, period: 'y', enabled: true }] },
  ];
  // Twee betalingen afgeboekt op vaste kosten: één op een jaarvat, één op een kwartaalvat
  const y = now.getFullYear();
  const fixedPayments = [
    { id: 'fp1', fixedId: 'auto_verz', month: mk(y, Math.max(1, now.getMonth())), amount: 300, detail: 'Jaarpremie', ts: Date.now() - 86400000 },
    { id: 'fp2', fixedId: 'water', month: mk(y, now.getMonth() + 1), amount: 40, detail: 'Kwartaalfactuur', ts: Date.now() },
  ];
  return {
    income: { monthly: 2450, maaltijdcheques: 140, endYear: { amount: 1800, month: 11 }, vacation: { amount: 1600, month: 4 }, refund: { amount: 0, month: 0 }, otherMonthly: 0, otherYearly: { amount: 0, month: 0 }, oneTime: { amount: 0, month: now.getMonth() } },
    fixedGroups, transactions, fixedPayments, categories: cats, monthlyData, reserveBalances: {}, savingsTarget: 20,
    wealth: {
      accounts: [
        { id: 'a1', name: 'Spaarrekening', institution: 'Bank A', balance: 7200, interest: 1.5, availability: 'vrij', purpose: '', unblockDate: '' },
        { id: 'a2', name: 'Noodfonds', institution: 'Bank B', balance: 4000, interest: 2, availability: 'gereserveerd', purpose: 'onvoorziene kosten', unblockDate: '' },
      ],
      holdings: [
        // Legacy USD-holding zoals opgeslagen vóór v2026.053: currency + lastPrice in USD, geen schema-vlag
        { id: 'h1', kind: 'stock', name: 'Tech aandeel', ticker: 'AAPL', quantity: 10, currency: 'USD', avgPrice: 150, totalCostEur: 1500, lots: [{ qty: 10, costEur: 1500 }], lastPrice: 190, manualValue: 0, url: '', availability: 'belegd', purpose: '', linkedEventId: '', unblockDate: '', yearlyContribution: 0, contributionUntilYear: 0, earlyWithdrawalTax: 0, normalWithdrawalTax: 0, lastUpdate: null },
        { id: 'h2', kind: 'stock', name: 'Wereld ETF', ticker: 'IWDA', quantity: 40, currency: 'EUR', avgPrice: 80, totalCostEur: 3200, lots: [{ qty: 40, costEur: 3200 }], lastPrice: 96.5, manualValue: 0, url: '', availability: 'belegd', purpose: '', linkedEventId: '', unblockDate: '', yearlyContribution: 0, contributionUntilYear: 0, earlyWithdrawalTax: 0, normalWithdrawalTax: 0, lastUpdate: null },
        { id: 'h3', kind: 'fund', name: 'Pensioensparen', ticker: '', quantity: 0, currency: 'EUR', avgPrice: 0, totalCostEur: 0, lots: [], lastPrice: 0, manualValue: 9800, url: '', availability: 'geblokkeerd', purpose: '', linkedEventId: '', unblockDate: String(now.getFullYear() + 14) + '-01-01', yearlyContribution: 1020, contributionUntilYear: now.getFullYear() + 14, earlyWithdrawalTax: 30, normalWithdrawalTax: 8, lastUpdate: null },
      ],
      usdEurRate: 0.9, apiKey: 'LEGACYKEY123', lastSync: null,
    },
    plan: { events: [{ id: 'e1', name: 'Nieuwe wagen', startYear: now.getFullYear() + 2, endYear: now.getFullYear() + 2, amount: 15000, enabled: true }], horizon: 15, returnRate: 5, inflation: 2 },
    alertState: { dismissed: {}, lastActivity: Date.now() }, init: true,
  };
}
module.exports = { build, mk };
