(function (root) {
  const utcFormatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  function formatUtc(value, { milliseconds = false } = {}) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Fecha no disponible';
    const parts = utcFormatter.formatToParts(date);
    const get = type => parts.find(part => part.type === type).value;
    const fraction = milliseconds ? `.${String(date.getUTCMilliseconds()).padStart(3, '0')}` : '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}${fraction} UTC`;
  }
  function marketPeriod(period, now = new Date(), options = {}) {
    const end = new Date(now.getTime() - 16 * 60000);
    const start = new Date(end);
    let timeframe;
    if (period === 'custom') {
      const validDate = value => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(value + 'T00:00:00.000Z');
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };
      if (!validDate(options.start) || !validDate(options.end)) throw new Error('Ingresa fechas inicial y final válidas.');
      const first = Date.parse(options.start + 'T00:00:00.000Z');
      const lastDay = Date.parse(options.end + 'T00:00:00.000Z');
      if (first >= lastDay) throw new Error('La fecha inicial debe ser anterior a la fecha final.');
      if (lastDay > now.getTime()) throw new Error('No se permiten fechas futuras.');
      start.setTime(first);
      end.setTime(Math.min(lastDay + 86400000 - 1, end.getTime()));
      timeframe = '1Day';
    } else if (period === '1Day' || period === '1Week') {
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
    if (options.timeframe && options.timeframe !== 'auto') {
      if (!['15Min', '1Hour', '1Day', '1Week', '1Month', '3Month', '6Month', '12Month'].includes(options.timeframe)) throw new Error('Temporalidad no permitida.');
      timeframe = options.timeframe;
    }
    const limit = options.limit === undefined ? '1000' : String(options.limit);
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 2000) throw new Error('La cantidad máxima de velas debe ser un entero entre 1 y 2000.');
    return { timeframe, start: start.toISOString(), end: end.toISOString(), limit, sort: 'asc' };
  }
  marketPeriod.formatUtc = formatUtc;
  if (typeof module !== 'undefined' && module.exports) module.exports = marketPeriod;
  else root.marketPeriod = marketPeriod;
})(globalThis);
