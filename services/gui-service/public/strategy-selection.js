(function(root) {
  function selectVertical(contracts, strategy, symbol, expiration) {
    const rules = { BULL_CALL_SPREAD:['call',true,true], BEAR_CALL_SPREAD:['call',false,false], BULL_PUT_SPREAD:['put',true,false], BEAR_PUT_SPREAD:['put',false,true] };
    const rule = rules[strategy];
    if (!rule) throw new Error('Estrategia no soportada.');
    const [type,buyLower,debit] = rule;
    const matching = (contracts || []).filter(c => c.type === type && c.underlyingSymbol === symbol && c.expiration === expiration);
    if (matching.length < 2) throw new Error('Alpaca no devolvió al menos dos contratos '+type+' de '+symbol+' para '+expiration+'.');
    const valid = matching.filter(c => c.type === type && c.underlyingSymbol === symbol && c.expiration === expiration && typeof c.contractSymbol === 'string' && c.contractSymbol && Number.isFinite(c.strike) && c.strike > 0 && Number.isFinite(c.ask) && Number.isFinite(c.bid) && c.ask > 0 && c.bid > 0 && c.ask >= c.bid).slice().sort((a,b)=>a.strike-b.strike);
    if (valid.length < 2) throw new Error('Se recibieron '+matching.length+' contratos '+type+', pero solo '+valid.length+' tienen Bid/Ask utilizables (positivos, numéricos y sin cruce).');
    for (let i=0;i<valid.length-1;i++) {
      const lower=valid[i],higher=valid[i+1];
      const long=buyLower?lower:higher, short=buyLower?higher:lower;
      const width=higher.strike-lower.strike;
      const net=debit?long.ask-short.bid:short.bid-long.ask;
      if (width>0 && net>0 && net<width) return {long,short,width,net,category:debit?'debit':'credit',legs:[{type,side:'buy',strike:long.strike,price:long.ask},{type,side:'sell',strike:short.strike,price:short.bid}]};
    }
    throw new Error('Se revisaron '+valid.length+' contratos cotizados para '+strategy+', pero ningún par consecutivo deja un '+(debit?'débito':'crédito')+' positivo menor que el ancho. Prueba otro vencimiento.');
  }
  async function collectOptionChain(fetchPage) {
    const contracts = new Map(), seen = new Set();
    let token;
    for (let page=0;page<50;page++) {
      const data = await fetchPage(token);
      if (!Array.isArray(data.contracts)) throw new Error('La respuesta de contratos de Alpaca no es válida.');
      for(const contract of data.contracts) contracts.set(contract.contractSymbol,contract);
      token = data.nextPageToken;
      if (!token) return [...contracts.values()];
      if (typeof token !== 'string' || seen.has(token)) throw new Error('Paginación inválida o repetida; no se evaluará una cadena incompleta.');
      seen.add(token);
    }
    throw new Error('La búsqueda superó 50 páginas; no se evaluará una cadena incompleta.');
  }
  selectVertical.collectOptionChain = collectOptionChain;
  if(typeof module!=='undefined'&&module.exports) module.exports=selectVertical;
  else root.selectVertical=selectVertical;
})(globalThis);
