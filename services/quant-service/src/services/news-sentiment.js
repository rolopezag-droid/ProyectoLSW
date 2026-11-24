const BULLISH_PHRASES = [
  'beats estimates',
  'beat estimates',
  'tops estimates',
  'surpasses estimates',
  'raises guidance',
  'raised guidance',
  'raises outlook',
  'raised outlook',
  'price target raised',
  'upgraded to buy',
  'receives buy rating',
  'fda approves',
  'wins approval',
  'record revenue',
  'profit rises',
  'shares rise',
  'stock rises',
  'shares rally',
  'stock rallies',
  'shares surge',
  'stock surges',
  'shares jump',
  'stock jumps',
  'supera las expectativas',
  'supera estimaciones',
  'eleva sus previsiones',
  'mejora sus previsiones',
  'objetivo de precio elevado',
  'recibe recomendacion de compra',
  'acciones suben',
  'acciones repuntan',
];

const BEARISH_PHRASES = [
  'misses estimates',
  'missed estimates',
  'falls short of estimates',
  'cuts guidance',
  'cut guidance',
  'cuts outlook',
  'lowers forecast',
  'price target cut',
  'price target lowered',
  'downgraded to sell',
  'receives sell rating',
  'fda rejects',
  'shares fall',
  'stock falls',
  'shares drop',
  'stock drops',
  'shares plunge',
  'stock plunges',
  'profit falls',
  'loss widens',
  'files for bankruptcy',
  'faces investigation',
  'fraud investigation',
  'product recall',
  'incumple las estimaciones',
  'por debajo de las expectativas',
  'recorta sus previsiones',
  'reduce sus previsiones',
  'objetivo de precio recortado',
  'recibe recomendacion de venta',
  'acciones caen',
  'acciones se desploman',
  'perdidas aumentan',
  'declara bancarrota',
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(text);
}

function confidenceFor(label, signalCount) {
  if (label === 'neutral') return 'low';
  if (signalCount >= 4) return 'high';
  if (signalCount >= 2) return 'medium';
  return 'low';
}

function classifyNewsSentiment(article = {}) {
  const text = normalizeText(`${article.headline || ''} ${article.summary || ''}`);
  const bullishSignals = BULLISH_PHRASES.filter(phrase => includesPhrase(text, phrase));
  const bearishSignals = BEARISH_PHRASES.filter(phrase => includesPhrase(text, phrase));
  const label = bullishSignals.length && bearishSignals.length
    ? 'mixed'
    : bullishSignals.length
      ? 'bullish'
      : bearishSignals.length
        ? 'bearish'
        : 'neutral';

  return {
    label,
    confidence: confidenceFor(label, bullishSignals.length + bearishSignals.length),
    signals: { bullish: bullishSignals, bearish: bearishSignals },
    method: 'heuristic-lexicon',
  };
}

module.exports = { classifyNewsSentiment };
