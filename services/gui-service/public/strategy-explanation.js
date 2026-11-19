/* Evidencia de candidatas: no selecciona contratos, ordena ni evalúa spreads. */
(function (root) {
  const definitions = Object.freeze({
    BULL_CALL_SPREAD: { type: 'call', side: 'bullish', premium: 'debit', longLower: true },
    BULL_PUT_SPREAD: { type: 'put', side: 'bullish', premium: 'credit', longLower: true },
    BEAR_CALL_SPREAD: { type: 'call', side: 'bearish', premium: 'credit', longLower: false },
    BEAR_PUT_SPREAD: { type: 'put', side: 'bearish', premium: 'debit', longLower: false },
  });
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));

  function attachEvidence(candidate, contracts, underlying = null) {
    const find = (symbol, strike) => {
      if (typeof symbol !== 'string' || !symbol) return null;
      const matches = (contracts || []).filter(contract => contract.contractSymbol === symbol && contract.strike === strike && contract.type === candidate.optionType && contract.underlyingSymbol === candidate.symbol && contract.expiration === candidate.expiration);
      if (matches.length !== 1) return null;
      const { contractSymbol, underlyingSymbol, expiration, type, strike: k, bid, ask, timestamp, multiplier } = matches[0];
      return { contractSymbol, underlyingSymbol, expiration, type, strike: k, bid, ask, timestamp, multiplier };
    };
    return { ...candidate, evidence: { source: 'research-pair-enumeration', quantity: 1, underlying,
      long: find(candidate.longSymbol, candidate.longStrike), short: find(candidate.shortSymbol, candidate.shortStrike) } };
  }

  function validateCandidate(candidate, { asOf = Date.now() } = {}) {
    const issues = [], warnings = [], def = definitions[candidate?.strategy], evidence = candidate?.evidence;
    if (!def) issues.push('Estrategia no reconocida.');
    const expiration = candidate?.expiration, expiry = typeof expiration === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiration) ? new Date(expiration + 'T00:00:00Z') : null;
    if (!candidate || typeof candidate.symbol !== 'string' || !candidate.symbol || !expiry || !Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== expiration) issues.push('Ticker o vencimiento no verificable.');
    else if (Date.parse(expiration + 'T23:59:59Z') < asOf) issues.push('El vencimiento ya pasó; vuelve a analizar.');
    if (def && (candidate.optionType !== def.type || candidate.side !== def.side || candidate.premiumType !== def.premium)) issues.push('Tipo, dirección o débito/crédito no corresponde a la estrategia.');
    if (!evidence || !evidence.long || !evidence.short) issues.push('No se dispone de la identidad y cotización original de ambas patas.');
    const underlying = evidence?.underlying;
    if (!underlying || underlying.symbol !== candidate?.symbol || !Number.isFinite(underlying.price) || underlying.price <= 0) issues.push('Precio o ticker del subyacente no verificable.');
    const spotTime = typeof underlying?.timestamp === 'string' ? Date.parse(underlying.timestamp) : NaN;
    if (!Number.isFinite(spotTime)) issues.push('Fecha de referencia del subyacente no verificable.');
    else if (asOf - spotTime > 72 * 3600000 || spotTime > asOf + 60000) issues.push('Referencia del subyacente desactualizada o futura.');
    if (underlying?.source === 'último cierre de vela') warnings.push('El precio del subyacente es el último cierre, no una cotización actual.');
    const long = evidence?.long, short = evidence?.short;
    if (long && short && def) {
      if (long.contractSymbol === short.contractSymbol || !long.contractSymbol || !short.contractSymbol) issues.push('Los símbolos de las patas son ausentes o idénticos.');
      for (const [label, leg] of [['larga', long], ['corta', short]]) {
        if (leg.underlyingSymbol !== candidate.symbol || leg.expiration !== candidate.expiration || leg.type !== def.type) issues.push(`La pata ${label} no coincide en empresa, vencimiento o tipo.`);
        if (!Number.isFinite(leg.strike) || leg.strike <= 0) issues.push(`Strike inválido de la pata ${label}.`);
        if (![leg.bid, leg.ask].every(value => Number.isFinite(value) && value > 0) || leg.ask < leg.bid) issues.push(`Bid/Ask inválido o cruzado en la pata ${label}.`);
        const time = typeof leg.timestamp === 'string' ? Date.parse(leg.timestamp) : NaN;
        if (!Number.isFinite(time)) issues.push(`Fecha de cotización no verificable en la pata ${label}.`);
        else if (asOf - time > 72 * 3600000 || time > asOf + 60000) issues.push(`Cotización desactualizada o futura en la pata ${label}.`);
        if (!Number.isInteger(leg.multiplier) || leg.multiplier <= 0) issues.push(`Multiplicador no verificable en la pata ${label}.`);
      }
      if (long.multiplier !== short.multiplier) issues.push('Las patas tienen multiplicadores distintos.');
      if (evidence.quantity !== 1) issues.push('La cantidad de contratos no coincide con una unidad del ranking.');
      if (candidate.longSymbol !== long.contractSymbol || candidate.shortSymbol !== short.contractSymbol || candidate.longStrike !== long.strike || candidate.shortStrike !== short.strike || candidate.longAsk !== long.ask || candidate.longBid !== long.bid || candidate.shortAsk !== short.ask || candidate.shortBid !== short.bid || candidate.longQuoteTimestamp !== long.timestamp || candidate.shortQuoteTimestamp !== short.timestamp) issues.push('La evidencia de las patas no coincide con la candidata del ranking.');
      if (def.longLower ? !(long.strike < short.strike) : !(long.strike > short.strike)) issues.push('El orden de strikes no corresponde a la estrategia.');
      if (Number.isFinite(long.multiplier) && long.multiplier > 0) warnings.push('Alpaca normaliza el tamaño a 100 si no lo proporciona; la fuente original del multiplicador no está disponible aquí.');
    }
    for (const key of ['netPremium', 'maxProfit', 'maxLoss', 'breakEven', 'riskReward']) if (!Number.isFinite(candidate?.[key]) || candidate[key] <= 0) issues.push(`El valor ${key} del ranking no es válido.`);
    if (issues.length) return { valid: false, issues, warnings, evaluationRequest: null };
    return { valid: true, issues, warnings, evaluationRequest: {
      strategyType: candidate.strategy, symbol: candidate.symbol, expiration: candidate.expiration,
      quantity: evidence.quantity, multiplier: long.multiplier,
      legs: [
        { type: def.type, side: 'buy', strike: long.strike, price: long.ask, bid: long.bid, ask: long.ask, contractSymbol: long.contractSymbol, expiration: long.expiration, quantity: evidence.quantity },
        { type: def.type, side: 'sell', strike: short.strike, price: short.bid, bid: short.bid, ask: short.ask, contractSymbol: short.contractSymbol, expiration: short.expiration, quantity: evidence.quantity },
      ],
    } };
  }

  function verifyEvaluation(candidate, evaluation) {
    const validation = validateCandidate(candidate);
    if (!validation.valid) return { valid: false, issues: validation.issues };
    const request = validation.evaluationRequest, def = definitions[candidate.strategy], issues = [];
    if (!evaluation || evaluation.strategyType !== candidate.strategy || evaluation.symbol !== candidate.symbol || evaluation.expiration !== candidate.expiration || evaluation.spreadCategory !== def.premium || evaluation.quantity !== request.quantity || evaluation.multiplier !== request.multiplier) issues.push('Quant devolvió un contexto distinto al solicitado.');
    const compare = (label, ranking, quant) => { if (!close(ranking, quant)) issues.push(`${label}: ranking ${ranking}; Quant ${quant}.`); };
    compare('Beneficio máximo', candidate.maxProfit, evaluation?.maxProfit);
    compare('Pérdida máxima', candidate.maxLoss, evaluation?.maxLoss);
    compare('Punto de equilibrio', candidate.breakEven, evaluation?.breakEven);
    compare('Ganancia/riesgo', candidate.riskReward, evaluation?.riskRewardRatio);
    compare('Prima neta total', candidate.netPremium * request.quantity * request.multiplier, def.premium === 'debit' ? evaluation?.netDebit : evaluation?.netCredit);
    compare('Ancho', Math.abs(candidate.longStrike - candidate.shortStrike), evaluation?.width);
    const legs = Array.isArray(evaluation?.legs) ? evaluation.legs : [];
    if (legs.length !== 2) issues.push('Quant no devolvió exactamente dos patas.');
    for (const leg of request.legs) {
      const actual = legs.find(item => item.side === leg.side);
      if (!actual || actual.type !== leg.type || actual.contractSymbol !== leg.contractSymbol || !close(actual.strike, leg.strike) || !close(actual.price, leg.price)) issues.push(`La pata ${leg.side} devuelta por Quant no coincide con la solicitud.`);
    }
    return { valid: issues.length === 0, issues };
  }

  function rankContext(candidate, rows) {
    const position = rows.findIndex(row => row.candidate === candidate);
    return { position: position < 0 ? null : position + 1, total: rows.length,
      above: position > 0 ? rows[position - 1].candidate : null,
      below: position >= 0 && position + 1 < rows.length ? rows[position + 1].candidate : null };
  }

  function comparisonRows(rows, symbol) {
    return Object.keys(definitions).map(strategy => ({ strategy,
      candidates: rows.filter(row => row.candidate.symbol === symbol && row.candidate.strategy === strategy && Number.isFinite(row.candidate.score)).map(row => row.candidate) }));
  }

  const api = { definitions, attachEvidence, validateCandidate, verifyEvaluation, rankContext, comparisonRows };
  root.StrategyExplanation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
