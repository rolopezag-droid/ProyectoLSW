/**
 * Quant Workbench: selector único de método cuantitativo sobre el contrato
 * elegido (Precio Black-Scholes, Griegas, IV Newton-Raphson o los tres).
 * Reemplaza a las tres pestañas duplicadas. Los cálculos ocurren en quant-service;
 * este módulo solo arma el payload, llama a la API del mismo origen y renderiza.
 */
(function () {
  'use strict';
  let currentMethod = 'prices';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const METHODS = {
    prices: { label: 'Precio Black-Scholes', button: ' Calcular precio', path: 'prices' },
    greeks: { label: 'Griegas', button: ' Calcular griegas', path: 'greeks' },
    iv: { label: 'IV Newton-Raphson', button: ' Calcular volatilidad implícita', path: 'implied-volatility' },
  };

  function setMethod(method) {
    if (!METHODS[method]) return;
    currentMethod = method;
    document.querySelectorAll('#quantMethodGrid .method-chip').forEach(chip => {
      const active = chip.dataset.method === method;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-checked', String(active));
    });
    const extras = $('qwIvExtras');
    if (extras) extras.hidden = method !== 'iv';
    const button = $('btnCalcQuant');
    if (button) button.textContent = METHODS[method].button;
  }

  function readForm() {
    const value = id => $(id) ? $(id).value.trim() : '';
    return {
      symbol: value('qwSymbol').toUpperCase(),
      spot: Number(value('qwSpot')),
      strike: Number(value('qwStrike')),
      expiration: value('qwExpiration'),
      rate: Number(value('qwRate') || 0),
      dividendYield: Number(value('qwDividend') || 0),
      volatility: Number(value('qwVolatility')),
      optionType: $('qwOptionType') ? $('qwOptionType').value : 'call',
      marketPrice: Number(value('qwMarketPrice')),
      initialGuess: Number(value('qwInitialGuess') || 0.2),
    };
  }

  function validate(form, method) {
    if (!form.symbol) return 'Ingresa un símbolo.';
    if (!Number.isFinite(form.spot) || form.spot <= 0) return 'Ingresa un precio spot válido.';
    if (!Number.isFinite(form.strike) || form.strike <= 0) return 'Ingresa un strike válido.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expiration)) return 'Ingresa un vencimiento YYYY-MM-DD.';
    if (!Number.isFinite(form.volatility) || form.volatility <= 0) return 'Ingresa una volatilidad válida.';
    if ((method === 'iv') && (!Number.isFinite(form.marketPrice) || form.marketPrice <= 0)) return 'Para IV, ingresa el precio de mercado de la opción.';
    return null;
  }

  async function callQuant(path, body) {
    const response = await fetch('/api/v1/quant/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, data };
  }

  function metricGrid(metrics) {
    return '<div class="results-grid">' + metrics.map(m =>
      `<div class="metric-card"><div class="label">${esc(m.label)}</div><div class="value ${m.pos ? 'pos' : m.neg ? 'neg' : 'neutral'}">${esc(m.value)}</div></div>`
    ).join('') + '</div>';
  }

  function assumptionsNote(form, extra) {
    return `Supuestos: spot=$${form.spot}, strike=$${form.strike}, r=${form.rate}, q=${form.dividendYield}, σ=${form.volatility}, tipo=${form.optionType}${extra ? ' · ' + extra : ''}`;
  }

  function renderPrices(data) {
    return metricGrid([
      { label: 'Modelo', value: data.model, neutral: true },
      { label: 'Símbolo', value: data.symbol, neutral: true },
      { label: 'Precio teórico', value: '$' + Number(data.price).toFixed(4), neutral: true },
      { label: 'Moneda', value: data.currency, neutral: true },
      { label: 'Tiempo al vencimiento (años)', value: data.assumptions?.timeToMaturityYears?.toFixed(6) ?? 'N/A', neutral: true },
      { label: 'Calculado en', value: data.calculatedAt, neutral: true },
    ]);
  }

  const GREEK_ROWS = [
    ['delta', 'Delta', 'Sensibilidad del precio al cambio en el spot'],
    ['gamma', 'Gamma', 'Tasa de cambio del delta respecto al spot'],
    ['theta', 'Theta', 'Sensibilidad del precio al paso del tiempo (anualizada)'],
    ['vega', 'Vega', 'Sensibilidad al cambio en la volatilidad'],
    ['rho', 'Rho', 'Sensibilidad al cambio en la tasa de interés'],
  ];

  function renderGreeks(data) {
    const greeks = data.greeks || {};
    const rows = GREEK_ROWS.map(([key, label, desc]) =>
      `<tr><td>${label}</td><td>${Number.isFinite(greeks[key]) ? greeks[key].toFixed(6) : '—'}</td><td>${desc}</td></tr>`
    ).join('');
    return `<table><thead><tr><th>Griega</th><th>Valor</th><th>Interpretación</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function ivMetrics(data) {
    return [
      { label: 'Volatilidad Implícita (σ)', value: Number.isFinite(data.impliedVolatility) ? (data.impliedVolatility * 100).toFixed(4) + '%' : '—', neutral: true },
      { label: 'Método', value: data.method || 'Newton-Raphson', neutral: true },
      { label: 'Convergió', value: data.converged ? 'Sí' : 'No', pos: !!data.converged, neg: data.converged === false },
      { label: 'Iteraciones', value: String(data.iterations ?? '—'), neutral: true },
      { label: 'Precio del modelo', value: Number.isFinite(data.modelPrice) ? '$' + data.modelPrice.toFixed(6) : '—', neutral: true },
      { label: 'Error de precio', value: Number.isFinite(data.pricingError) ? data.pricingError.toFixed(8) : '—', neutral: true },
    ];
  }

  function ivDetailTable(form, data) {
    const rows = [
      ['Símbolo', form.symbol], ['Tipo', form.optionType], ['Spot', '$' + form.spot],
      ['Strike', '$' + form.strike], ['Vencimiento', form.expiration],
      ['Tasa libre (r)', String(form.rate)], ['Dividendos (q)', String(form.dividendYield)],
      ['Precio de mercado', '$' + form.marketPrice], ['Suposición inicial (σ)', String(form.initialGuess)],
      ['Calculado en', data.calculatedAt ?? '—'],
    ].map(([label, value]) => `<tr><td>${label}</td><td>${esc(value)}</td></tr>`).join('');
    return `<table><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function section(method, content, note) {
    return `<section class="quant-result-section"><h3 style="color:var(--accent);margin-bottom:0.5rem;">${METHODS[method].label}</h3>${content}${note ? `<div class="small-note" style="margin-top:0.5rem;">${esc(note)}</div>` : ''}</section>`;
  }

  // ── Contexto del último cálculo exitoso: lo consumen la gráfica (overlays por
  // método, vía research-ui.js) y la tabla comparativa (botón "Aplicar método"). ──
  function setWorkbenchContext(form, method, data) {
    window.__workbenchContext = {
      token: 'wb-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      method,
      symbol: form.symbol,
      spot: form.spot,
      strike: form.strike,
      expiration: form.expiration,
      rate: form.rate,
      dividendYield: form.dividendYield,
      volatility: form.volatility,
      optionType: form.optionType,
      data,
      at: new Date().toISOString(),
    };
    // Cualquier nuevo cálculo cambia el token y deja obsoleta la columna anterior.
    if (window.__workbenchTableMetrics) {
      window.__workbenchTableMetrics = null;
      if (typeof window.__renderResearchTable === 'function') { try { window.__renderResearchTable(); } catch {} }
    }
  }

  function clearWorkbenchContext() {
    window.__workbenchContext = null;
    if (window.__workbenchTableMetrics) {
      window.__workbenchTableMetrics = null;
      if (typeof window.__renderResearchTable === 'function') { try { window.__renderResearchTable(); } catch {} }
    }
  }

  function syncChartOverlays() {
    if (typeof refreshChartOverlays === 'function') { try { refreshChartOverlays(); } catch {} }
  }

  async function applyToTable() {
    if (window.__workbenchContext && window.__workbenchContext.method !== currentMethod) {
      if (typeof showAlert === 'function') showAlert('Calcula el método seleccionado antes de aplicarlo a la tabla.', 'error');
      return;
    }
    const collector = typeof window !== 'undefined' ? window.__applyWorkbenchToTable : null;
    if (typeof collector !== 'function') {
      if (typeof showAlert === 'function') showAlert('La tabla comparativa aún no está disponible; recarga la página.', 'error');
      return;
    }
    await collector();
  }

  async function run(methodOverride) {
    const method = methodOverride || currentMethod;
    const form = readForm();
    const problem = validate(form, method);
    const result = $('quantResult');
    const note = $('quantNote');
    const button = $('btnCalcQuant');
    if (problem) {
      if (typeof showAlert === 'function') showAlert(problem, 'error');
      return;
    }
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Calculando...';
    const path = METHODS[method].path;
    const name = method;
    const body = { ...form, tolerance: 1e-8, maxIterations: 200 };
    if (method !== 'iv') { delete body.marketPrice; delete body.initialGuess; }
    try {
      const { status, ok, data } = await callQuant(path, body);
      const succeeded = name === 'iv'
        ? status === 200 && data.converged !== false && Number.isFinite(data.impliedVolatility)
        : ok;
      let html = '';
      let errorText = null;
      let noteText = null;
      if (name === 'iv') {
        if (status === 422 && !Number.isFinite(data.impliedVolatility)) {
          errorText = 'IV: ' + (data.message || 'El modelo no pudo resolver ese precio.');
          html = section('iv', '<p class="small-note">El cálculo no convergió dentro del límite de iteraciones. Esto no demuestra que el precio sea imposible.</p>', data.message || '422 sin volatilidad implícita.');
          noteText = 'IV no convergió (422).';
        } else {
          html = section('iv', metricGrid(ivMetrics(data)) + ivDetailTable(form, data),
            status === 422 ? 'El cálculo no convergió dentro del límite de iteraciones. Esto no demuestra que el precio sea imposible.' : 'Método: Newton-Raphson con tolerancia 1e-8 y máximo 200 iteraciones, con respaldo por bisección en el servidor.');
          if (status === 422) noteText = 'IV no convergió (422). Revisa los detalles.';
        }
      } else if (!ok) {
        const detail = data.detail ? data.message + ' Detalle: ' + data.detail : (data.message || 'quant-service respondió ' + status);
        errorText = METHODS[name].label + ': ' + detail;
        html = section(name, `<p class="small-note">No se pudo completar el cálculo (${status}). ${esc(detail)}</p>`);
      } else {
        html = section(name, name === 'prices' ? renderPrices(data) : renderGreeks(data), assumptionsNote(form));
      }
      result.innerHTML = html;
      result.style.display = 'block';
      note.textContent = '';
      if (succeeded) setWorkbenchContext(form, method, data); else clearWorkbenchContext();
      syncChartOverlays();
      if (errorText) {
        if (typeof showAlert === 'function') showAlert(errorText, 'error');
      } else if (noteText) {
        if (typeof showAlert === 'function') showAlert(noteText, 'warning');
      } else if (typeof showAlert === 'function') {
        showAlert('Cálculo completado con ' + METHODS[method].label.toLowerCase() + '.', 'info');
      }
    } catch (error) {
      if (typeof showAlert === 'function') showAlert('Error de conexión con quant-service: ' + error.message, 'error');
      if (result) { result.style.display = 'none'; result.innerHTML = ''; }
      clearWorkbenchContext();
      syncChartOverlays();
    } finally {
      button.disabled = false;
      button.textContent = METHODS[method].button;
    }
  }

  /**
   * Prefill explícito: toma datos de la gráfica cargada o de la candidata
   * seleccionada en la tabla comparativa (fuente: research-ui.js).
   */
  function prefillFromMarket() {
    const source = typeof window !== 'undefined' && typeof window.__chartPrefillSource === 'function'
      ? window.__chartPrefillSource()
      : null;
    if (!source) {
      if (typeof showAlert === 'function') showAlert('Primero carga la gráfica o selecciona una candidata en la tabla comparativa.', 'error');
      return;
    }
    const set = (id, value) => { if ($(id) && value !== null && value !== undefined && value !== '') $(id).value = value; };
    set('qwSymbol', source.symbol);
    set('qwSpot', Number.isFinite(source.spot) ? source.spot.toFixed(2) : null);
    set('qwStrike', Number.isFinite(source.strike) ? source.strike.toFixed(2) : null);
    set('qwExpiration', source.expiration);
    set('qwVolatility', Number.isFinite(source.volatility) ? (source.volatility / 100).toFixed(4) : null);
    if (typeof showAlert === 'function') showAlert('Campos completados desde: ' + source.source + '. Revisa los valores antes de calcular.', 'info');
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#quantMethodGrid .method-chip').forEach(chip => {
      chip.addEventListener('click', () => setMethod(chip.dataset.method));
      chip.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setMethod(chip.dataset.method); } });
    });
    const calc = $('btnCalcQuant');
    if (calc) calc.addEventListener('click', () => run());
    const prefill = $('btnPrefillQuant');
    if (prefill) prefill.addEventListener('click', prefillFromMarket);
    const applyBtn = $('btnApplyQuantToTable');
    if (applyBtn) applyBtn.addEventListener('click', () => { applyToTable(); });
    setMethod(currentMethod);
  }, { once: true });

  const api = { setMethod, readForm, run, prefillFromMarket, applyToTable, METHODS, setWorkbenchContext, clearWorkbenchContext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  window.QuantWorkbench = api;
})();
