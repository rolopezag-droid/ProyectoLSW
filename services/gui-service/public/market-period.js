(function (root) {
  function marketPeriod(period, now = new Date()) {
    const end = new Date(now.getTime() - 16 * 60000);
    const start = new Date(end);
    let timeframe;
    if (period === '1Day' || period === '1Week') {
      start.setUTCDate(start.getUTCDate() - (period === '1Day' ? 1 : 7));
      timeframe = period === '1Day' ? '15Min' : '1Hour';
    } else {
      const months = { '1Month': 1, '3Month': 3, '6Month': 6, '12Month': 12 }[period];
      if (!months) throw new Error('Periodo no permitido.');
      const day = start.getUTCDate();
      start.setUTCDate(1);
      start.setUTCMonth(start.getUTCMonth() - months);
      const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
      start.setUTCDate(Math.min(day, lastDay));
      timeframe = '1Day';
    }
    return { timeframe, start: start.toISOString(), end: end.toISOString(), limit: '1000', sort: 'asc' };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = marketPeriod;
  else root.marketPeriod = marketPeriod;
})(globalThis);
