const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// Página dedicada al split gráfica/panel de investigación. La preferencia debe
// escribirse en localStorage ANTES de evaluar los scripts de composición.
function page(initialView) {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:3005', runScripts: 'outside-only' }), w = dom.window;
  w.structuredClone = structuredClone;
  Object.defineProperty(w, 'crypto', { value: require('node:crypto').webcrypto });
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  if (initialView) w.localStorage.setItem('ui_workspace_view', initialView);
  for (const script of w.document.querySelectorAll('script')) {
    if (script.src) w.eval(fs.readFileSync(path.join(__dirname, '../public', new URL(script.src).pathname.replace(/^\//, '')), 'utf8'));
    else w.eval(script.textContent);
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w };
}

test('Workspace: gráfica y panel de investigación inician lado a lado por defecto', async () => {
  const { dom, w } = page(); try {
    const view = w.document.querySelector('.workspace-view');
    assert.ok(view, 'debe existir el contenedor del split');
    assert.equal(view.dataset.view, 'side');
    assert.ok(view.contains(w.document.getElementById('candlesChart')), 'la gráfica vive dentro del split');
    assert.ok(view.querySelector('.research-workspace'), 'el panel de investigación vive dentro del split');
    assert.match(w.document.getElementById('btnWorkspaceView').textContent, /Ver apilado/);
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Workspace: el botón alterna a apilado y persiste la preferencia', async () => {
  const { dom, w } = page(); try {
    const view = w.document.querySelector('.workspace-view'), btn = w.document.getElementById('btnWorkspaceView');
    btn.click();
    assert.equal(view.dataset.view, 'stacked');
    assert.match(btn.textContent, /lado a lado/);
    assert.equal(w.localStorage.getItem('ui_workspace_view'), 'stacked');
    btn.click();
    assert.equal(view.dataset.view, 'side');
    assert.equal(w.localStorage.getItem('ui_workspace_view'), 'side');
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});

test('Workspace: la preferencia guardada como apilado se respeta al recargar', async () => {
  const { dom, w } = page('stacked'); try {
    assert.equal(w.document.querySelector('.workspace-view').dataset.view, 'stacked');
    assert.match(w.document.getElementById('btnWorkspaceView').textContent, /lado a lado/);
    await new Promise(r => setImmediate(r));
  } finally { dom.window.close(); }
});
