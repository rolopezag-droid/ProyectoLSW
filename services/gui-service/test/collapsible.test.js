const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setImmediate(r)); } throw Error('La interfaz no completó la acción.'); }

function page() {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:3005', runScripts: 'outside-only' }), w = dom.window;
  w.structuredClone = structuredClone;
  Object.defineProperty(w, 'crypto', { value: require('node:crypto').webcrypto });
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  for (const script of w.document.querySelectorAll('script')) {
    if (script.src) w.eval(fs.readFileSync(path.join(__dirname, '../public', new URL(script.src).pathname.replace(/^\//, '')), 'utf8'));
    else w.eval(script.textContent);
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w };
}

const panel = (w, id) => w.document.getElementById(id);

test('Acordeón: los paneles de contexto inician colapsados y los flujos principales abiertos', async () => {
  const { dom, w } = page(); try {
    const api = w.CollapsiblePanels;
    assert.ok(api, 'el módulo debe exponerse como CollapsiblePanels');
    assert.ok(api.sections.length >= 10, 'debe gestionar paneles y tarjetas');
    // Colapsados por defecto: contexto y bitácora.
    assert.equal(api.isCollapsed(panel(w, 'researchCoreSummaryPanel')), true);
    assert.equal(api.isCollapsed(panel(w, 'researchFinancialPanel')), true);
    assert.equal(api.isCollapsed(panel(w, 'researchNewsPanel')), true);
    // Abiertos: flujos principales.
    assert.equal(api.isCollapsed(panel(w, 'researchTechnicalPanel')), false);
    const strategyCard = w.document.getElementById('strategyForm').closest('.card');
    assert.equal(api.isCollapsed(strategyCard), false);
    const chartCard = w.document.getElementById('candlesChart').closest('.card');
    assert.equal(api.isCollapsed(chartCard), false);
    // El ticket de órdenes, el workbench y el panel de investigación NO son acordeones.
    assert.equal(strategyCard.querySelector(':scope > h2 > .panel-chevron'), null, 'Nueva operación sin chevron');
    assert.equal(w.document.querySelector('#tab-quant .card h2 .panel-chevron'), null, 'Análisis cuantitativo sin chevron');
    assert.equal(w.document.querySelector('main .research-workspace .research-heading .panel-chevron'), null, 'Panel de investigación sin acordeón');
    assert.equal(api.sections.includes(w.document.querySelector('main .research-workspace')), false);
    assert.equal(api.sections.includes(strategyCard), false);
    // Chevron y aria en un panel colapsado.
    const chevron = panel(w, 'researchNewsPanel').querySelector('.panel-chevron');
    assert.ok(chevron, 'debe existir el chevron');
    assert.equal(chevron.classList.contains('expanded'), false);
    assert.equal(panel(w, 'researchNewsPanel').querySelector('.research-panel-heading').getAttribute('aria-expanded'), 'false');
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Acordeón: clic en el encabezado alterna el panel y su cuerpo se oculta', async () => {
  const { dom, w } = page(); try {
    const comparison = w.document.querySelectorAll('#researchEvidence .research-panel')[5];
    const api = w.CollapsiblePanels;
    assert.equal(api.isCollapsed(comparison), false, 'la comparación inicia abierta');
    comparison.querySelector('.research-panel-heading').click();
    assert.equal(api.isCollapsed(comparison), true);
    assert.equal(comparison.querySelector('.research-panel-heading').getAttribute('aria-expanded'), 'false');
    // El cuerpo (descripción) queda oculto por CSS.
    const body = comparison.querySelector('.research-panel-description');
    assert.equal(w.getComputedStyle(body).display, 'none');
    comparison.querySelector('.research-panel-heading').click();
    assert.equal(api.isCollapsed(comparison), false);
    assert.equal(w.getComputedStyle(body).display, 'block');
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Acordeón: el botón de refresco de Servicios no colapsa la tarjeta, pero el título sí', async () => {
  const { dom, w } = page(); try {
    const servicesCard = w.document.getElementById('servicesList').closest('.card');
    const api = w.CollapsiblePanels;
    assert.equal(api.isCollapsed(servicesCard), false);
    w.document.getElementById('btnRefreshStatus').click();
    assert.equal(api.isCollapsed(servicesCard), false, '⟳ no debe colapsar');
    servicesCard.querySelector('h2').click();
    assert.equal(api.isCollapsed(servicesCard), true);
    assert.equal(w.getComputedStyle(w.document.getElementById('servicesList')).display, 'none');
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Acordeón: el estado elegido persiste en localStorage y se restaura en una sesión nueva', async () => {
  const first = page(); try {
    const api = first.w.CollapsiblePanels;
    api.setCollapsed(panel(first.w, 'researchTechnicalPanel'), true);
    const saved = first.w.localStorage.getItem('ui_collapsed_panels');
    assert.match(saved, /researchTechnicalPanel/);
    const second = page();
    try {
      assert.equal(second.w.CollapsiblePanels.isCollapsed(panel(second.w, 'researchTechnicalPanel')), false, 'segunda sesión parte de defaults');
      assert.equal(second.w.CollapsiblePanels.applyState(saved), true);
      assert.equal(second.w.CollapsiblePanels.isCollapsed(panel(second.w, 'researchTechnicalPanel')), true);
      await new Promise(r => setImmediate(r));
    } finally { second.dom.window.close(); }
    await new Promise(r => setImmediate(r));
  } finally { first.dom.window.close(); }
});

test('Acordeón responsivo: plegar paneles marca el dashboard para reacomodar el contenido', async () => {
  const { dom, w } = page(); try {
    const api = w.CollapsiblePanels;
    const dashboard = w.document.querySelector('.research-dashboard');
    assert.ok(dashboard, 'debe existir el tablero de paneles');
    api.setAll(false); // partir de todo abierto para observar la transición
    assert.equal(dashboard.classList.contains('has-collapsed'), false);
    api.setCollapsed(panel(w, 'researchNewsPanel'), true);
    assert.equal(dashboard.classList.contains('has-collapsed'), true, 'con algo plegado los abiertos van a lo ancho');
    api.setCollapsed(panel(w, 'researchNewsPanel'), false);
    assert.equal(dashboard.classList.contains('has-collapsed'), false);
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Acordeón responsivo: la barra Colapsar/Expandir todo ya no existe y el workspace queda abierto', async () => {
  const { dom, w } = page(); try {
    assert.equal(w.document.querySelector('.workspace-heading .collapse-toolbar'), null, 'sin barra global');
    const workspace = w.document.querySelector('main .research-workspace');
    assert.ok(workspace, 'el panel de investigación debe estar en el DOM');
    const controls = w.document.querySelector('.research-controls');
    assert.notEqual(w.getComputedStyle(controls).display, 'none', 'controles de investigación siempre visibles');
    const orderCard = w.document.getElementById('strategyForm').closest('.card');
    assert.equal(w.getComputedStyle(orderCard).position, 'sticky', 'ticket de órdenes pegajoso');
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});
