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

test('rango personalizado incluye la fecha final y respeta temporalidad y límite',()=>{
  const query=marketPeriod('custom',now,{start:'2026-01-01',end:'2026-03-31',timeframe:'1Day',limit:'500'});
  assert.equal(query.start,'2026-01-01T00:00:00.000Z');
  assert.equal(query.end,'2026-03-31T23:59:59.999Z');
  assert.equal(query.timeframe,'1Day');
  assert.equal(query.limit,'500');
});
test('fechas, límites y temporalidades inválidos se rechazan antes de consultar',()=>{
  for(const options of [
    {start:'2026-02-30',end:'2026-03-01'}, {start:'2026-03-01',end:'2026-03-01'},
    {start:'2026-03-02',end:'2026-03-01'}, {start:'2026-01-01',end:'2027-01-01'},
    {start:'2026-01-01',end:'2026-02-01',limit:'2001'}, {start:'2026-01-01',end:'2026-02-01',limit:'1.5'},
    {start:'2026-01-01',end:'2026-02-01',timeframe:'bad'},
  ]) assert.throws(()=>marketPeriod('custom',now,options));
});

test('formatea fechas en UTC independientemente de la zona local',()=>{
  assert.equal(marketPeriod.formatUtc('2025-01-01T00:00:00.000Z'),'01/01/2025 00:00:00 UTC');
  assert.equal(marketPeriod.formatUtc('2025-03-31T23:59:59.999Z',{milliseconds:true}),'31/03/2025 23:59:59.999 UTC');
});

test('un rango personalizado que termina hoy informa el corte sin pedir datos futuros',()=>{
  const query=marketPeriod('custom',now,{start:'2026-11-01',end:'2026-11-06',timeframe:'1Day'});
  assert.equal(query.start,'2026-11-01T00:00:00.000Z');
  assert.equal(query.end,'2026-11-06T17:44:00.000Z');
});
