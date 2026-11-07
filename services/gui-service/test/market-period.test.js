const test = require('node:test');
const assert = require('node:assert/strict');
const marketPeriod = require('../public/market-period');
const now = new Date('2026-11-06T18:00:00Z');
for (const [period, expectedDays, timeframe] of [['1Day',1,'15Min'],['1Week',7,'1Hour']]) {
  test(period + ' limita el periodo sin multiplicarlo por las velas', () => {
    const q = marketPeriod(period, now);
    assert.equal((Date.parse(q.end) - Date.parse(q.start)) / 86400000, expectedDays);
    assert.equal(q.timeframe,timeframe);
    assert.equal(Date.parse(q.end),now.getTime()-16*60000);
  });
}
for (const [period,start] of [['1Month','2026-10-06'],['3Month','2026-08-06'],['6Month','2026-05-06'],['12Month','2025-11-06']]) {
  test(period + ' resta meses naturales y utiliza velas diarias', () => {
    const q=marketPeriod(period,now);
    assert.equal(q.start.slice(0,10),start);
    assert.equal(q.timeframe,'1Day');
  });
}
test('ajusta fin de mes sin desbordar febrero',()=>{
  assert.equal(marketPeriod('1Month',new Date('2026-03-31T18:00:00Z')).start.slice(0,10),'2026-02-28');
});
test('rechaza periodos desconocidos',()=>assert.throws(()=>marketPeriod('1Hour',now)));
