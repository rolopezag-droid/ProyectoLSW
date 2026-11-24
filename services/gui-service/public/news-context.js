// Contexto textual explicable; no predice retornos ni participa en el score.
(function(root){
  function assess(item){
    const text=`${item.headline||''}. ${item.summary||''}`.toLowerCase();
    const favorable=[/\b(?:raises?|raised|increases?|increased) (?:its |the )?(?:price target|guidance|forecast|dividend)\b/g,/\b(?:upgraded?|buyback|repurchase|record earnings|earnings beat|beats estimates|profit growth|revenue growth|crecimiento de ingresos|mejora de previsiones)\b/g];
    const adverse=[/\b(?:cuts?|cut|lowers?|lowered|reduces?|reduced|slashed) (?:its |the )?(?:price target|target price|guidance|forecast)\b/g,/\b(?:downgraded?|losses|earnings miss|misses estimates|bankruptcy|lawsuit|investigation|service outage|spending slowdowns|profit falls|profits fall|quiebra|pérdidas|recorte de previsiones)\b/g];
    const collect=patterns=>[...new Set(patterns.flatMap(pattern=>[...text.matchAll(pattern)].filter(match=>!/(?:not|no|never|failed to|fails to)\s+(?:\w+\s+){0,2}$/.test(text.slice(Math.max(0,match.index-35),match.index))).map(match=>match[0])))];
    const up=collect(favorable),down=collect(adverse);
    const label=up.length&&down.length?'Señales mixtas':up.length?'Posible sesgo alcista':down.length?'Posible sesgo bajista':'Sin dirección clara';
    const explanation=up.length||down.length?`${up.length?'Contexto favorable: '+up.join(', ')+'. ':''}${down.length?'Contexto adverso: '+down.join(', ')+'. ':''}Se identifican eventos del texto, no la reacción efectiva de la acción.`:'El titular y resumen no aportan un evento direccional reconocido; no se infiere una subida o caída.';
    return {label,explanation,matched:{favorable:up,adverse:down},method:'explicit-text-events-v1'};
  }
  const api={assess};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NewsContext=api;
})(globalThis);
