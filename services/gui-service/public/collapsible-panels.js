/**
 * Acordeones estilo VS Code: cualquier panel o tarjeta se colapsa dejando solo
 * su encabezado; el usuario abre únicamente lo que desea ver. El estado se
 * recuerda en localStorage y la primera visita aplica valores por defecto
 * (colapsados los paneles de contexto, abiertos los flujos principales).
 *
 * No toca IDs ni handlers existentes: solo inserta un chevron en el encabezado,
 * alterna la clase `is-collapsed` y el CSS oculta el cuerpo del panel.
 */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'ui_collapsed_panels';
  // Primera visita: solo lo esencial abierto (comparable al explorador de VS Code).
  const DEFAULT_COLLAPSED = [
    'panel:researchCoreSummaryPanel',   // 00 · Resumen del análisis
    'panel:researchFinancialPanel',     // 02 · Análisis fundamental
    'panel:researchMoversPanel',        // 03 · Ganadores y perdedores
    'panel:researchNewsPanel',          // 04 · Noticias
    'panel:Bitácora del análisis',      // 06 · Bitácora (sin id)
    'card:Registro de actividad',       // aside: log
    'card:Automatización (opcional)',
    'card:Historial local de Estrategias',
  ];

  let managed = [];
  let state = {};

  function sectionKey(section, header) {
    const prefix = section.classList.contains('research-panel') ? 'panel:' : 'card:';
    return prefix + (section.id || (header.textContent || '').replace(/\s+/g, ' ').trim());
  }

  function loadState() {
    try { return JSON.parse(root.localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function saveState() {
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* almacenamiento no disponible */ }
  }

  function isCollapsed(section) {
    return section.classList.contains('is-collapsed');
  }

  function setCollapsed(section, collapsed, persist = true) {
    section.classList.toggle('is-collapsed', collapsed);
    const chevron = section.querySelector(':scope > h2 > .panel-chevron, :scope > .research-panel-heading > .panel-chevron');
    if (chevron) chevron.classList.toggle('expanded', !collapsed);
    const header = section.querySelector(':scope > h2, :scope > .research-panel-heading');
    if (header) header.setAttribute('aria-expanded', String(!collapsed));
    if (persist) {
      const key = section.__collapseKey;
      if (key) { state[key] = collapsed; saveState(); }
    }
  }

  function toggle(section) {
    setCollapsed(section, !isCollapsed(section));
  }

  function makeCollapsible(section) {
    const isPanel = section.classList.contains('research-panel');
    const header = section.querySelector(':scope > h2, :scope > .research-panel-heading');
    if (!header || header.querySelector(':scope > .panel-chevron')) return;
    const chevron = document.createElement('button');
    chevron.type = 'button';
    chevron.className = 'panel-chevron';
    chevron.textContent = '▸';
    chevron.setAttribute('aria-label', 'Expandir o colapsar panel');
    header.insertBefore(chevron, header.firstChild);
    header.setAttribute('aria-expanded', 'true');
    header.classList.add('collapsible-header');
    section.__collapseKey = sectionKey(section, header);
    header.addEventListener('click', event => {
      // No interceptar controles reales del encabezado (p. ej. ⟳ de Servicios).
      if (event.target.closest('a,input,select,textarea,label') && !event.target.closest('.panel-chevron')) return;
      if (event.target.closest('button') && !event.target.closest('.panel-chevron')) return;
      toggle(section);
    });
    managed.push(section);
    setCollapsed(section, state[section.__collapseKey] ?? DEFAULT_COLLAPSED.includes(section.__collapseKey), false);
  }

  function setAll(collapsed) {
    managed.forEach(section => setCollapsed(section, collapsed, false));
    managed.forEach(section => { state[section.__collapseKey] = collapsed; });
    saveState();
  }

  function applyState(json) {
    let incoming;
    try { incoming = JSON.parse(json); } catch { return false; }
    if (!incoming || typeof incoming !== 'object') return false;
    state = { ...state, ...incoming };
    managed.forEach(section => {
      if (section.__collapseKey in state) setCollapsed(section, Boolean(state[section.__collapseKey]), false);
    });
    saveState();
    return true;
  }

  function addToolbar() {
    const heading = document.querySelector('.workspace-heading');
    if (!heading || heading.querySelector('.collapse-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'collapse-toolbar';
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.textContent = 'Colapsar todo';
    collapseBtn.className = 'collapse-toolbar-btn';
    collapseBtn.addEventListener('click', () => setAll(true));
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.textContent = 'Expandir todo';
    expandBtn.className = 'collapse-toolbar-btn';
    expandBtn.addEventListener('click', () => setAll(false));
    toolbar.append(collapseBtn, expandBtn);
    heading.append(toolbar);
  }

  function init() {
    state = loadState();
    managed = [];
    document.querySelectorAll('main .card, aside .card, #researchEvidence .research-panel').forEach(makeCollapsible);
    addToolbar();
  }

  const api = { init, toggle, setCollapsed, isCollapsed, setAll, applyState, get sections() { return managed.slice(); } };
  root.CollapsiblePanels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : globalThis);
