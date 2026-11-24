/* Navigation only: original form elements and financial handlers retain their IDs. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const definitions = {
    inicio: ['Inicio', 'Todo empieza con una pregunta', 'Consulta una empresa, compara alternativas y evalúa una operación.'],
    mercado: ['Mercado', 'Explora el movimiento de una empresa', 'Consulta precios históricos, velas e indicadores del periodo que elijas.'],
    comparar: ['Análisis y estrategias', 'Del mercado a tu estrategia', 'Consulta la gráfica, revisa los análisis y compara Bull y Bear en un mismo espacio.'],
    operacion: ['Revisar orden', 'Revisa los contratos y el riesgo', 'Define dos contratos, consulta sus primas y revisa el riesgo antes de guardar.'],
    historial: ['Historial', 'Vuelve a tus evaluaciones', 'Distingue las evaluaciones de este navegador de tu bitácora guardada en Supabase.'],
    guia: ['Guía de uso', 'Un recorrido claro, de principio a fin', 'Qué hace cada sección, qué necesitas y qué resultado puedes esperar.'],
  };
  const aliases = { mercado:'comparar', strategy:'operacion', candles:'comparar', quant:'comparar', calculadora:'comparar', research:'comparar', history:'historial' };
  const pages = new Map();
  let current = null;
  const main = document.querySelector('main');
  const sidebar = document.querySelector('.container > aside');
  const originalStrategy = $('tab-strategy');
  const market = $('tab-candles');
  const ticket = originalStrategy.querySelector(':scope > .card');
  const research = document.querySelector('.research-workspace');
  const history = $('historyTable').closest('.card');
  const result = $('resultsCard');
  document.body.classList.add('workspace-shell');
  document.querySelector('header h1').textContent = 'Bull & Bear';
  document.querySelector('.brand-caption').textContent = 'MESA DE ANÁLISIS';
  const headerTitle = document.querySelector('.workspace-heading h2');
  const headerDescription = document.querySelector('.workspace-heading p');
  headerTitle.id = 'workspaceTitle'; headerTitle.tabIndex = -1;
  const tag = document.querySelector('.workspace-tag');
  tag.textContent = 'Opciones · USD';
  const header = document.querySelector('body > header');
  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'workspace-breadcrumb';
  breadcrumb.innerHTML = '<span>Espacio de trabajo</span><span aria-hidden="true">/</span><strong id="workspaceCrumb">Inicio</strong>';
  header.append(breadcrumb);
  const headerHelp = document.createElement('button');
  headerHelp.type = 'button'; headerHelp.className = 'header-help'; headerHelp.dataset.page = 'guia'; headerHelp.textContent = 'Cómo usar la plataforma';
  header.append(headerHelp);

  function makePage(key, element) {
    const page = element || document.createElement('section');
    if (!page.id) page.id = 'page-' + key;
    page.classList.add('workspace-page'); page.dataset.workspacePage = key;
    page.classList.remove('active', 'tab-content'); page.hidden = true;
    page.setAttribute('aria-labelledby', 'workspaceTitle');
    main.append(page); pages.set(key, page); return page;
  }
  function action(page, label, className = 'btn btn-secondary') {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.page = page; button.className = className; button.textContent = label; return button;
  }
  function note(title, text, className='section-note') {
    const box = document.createElement('div'); box.className = className;
    const strong = document.createElement('strong'); strong.textContent = title;
    const p = document.createElement('p'); p.textContent = text; box.append(strong,p); return box;
  }
  function details(title, nodes, className='workspace-details') {
    const box = document.createElement('details'); box.className = className;
    const summary = document.createElement('summary'); summary.textContent = title; box.append(summary);
    const body = document.createElement('div'); body.className = 'details-body';
    nodes.filter(Boolean).forEach(node => body.append(node)); box.append(body); return box;
  }

  const home = makePage('inicio');
  home.innerHTML = `<section class="home-intro"><div><p class="section-eyebrow">TU MESA DE TRABAJO</p><h3>Un lugar para entender<br>tu próxima estrategia.</h3><p>Del comportamiento de una empresa al riesgo de una operación. Sigue el recorrido o entra directamente a la herramienta que necesitas.</p><button type="button" class="btn btn-primary" data-page="mercado">Analizar mercado y estrategias <span aria-hidden="true">→</span></button></div><div class="home-route"><span class="route-label">EL RECORRIDO</span><ol><li><span>01</span><div><strong>Consulta una empresa</strong><p>Revisa sus precios y su gráfica.</p></div></li><li><span>02</span><div><strong>Compara alternativas</strong><p>Explora Bull y Bear con datos de mercado.</p></div></li><li><span>03</span><div><strong>Evalúa el riesgo</strong><p>Calcula el resultado de tus dos contratos.</p></div></li></ol></div></section>
  <div class="section-heading"><div><p class="section-eyebrow">HERRAMIENTAS</p><h3>¿Qué quieres hacer?</h3></div><span>Consulta, compara y prepara tu operación.</span></div>
  <div class="home-tools"><button data-page="mercado" class="tool-link" type="button"><span class="tool-number">01</span><strong>Analizar mercado y estrategias</strong><p>Empresa, periodo, gráfica e indicadores.</p><span class="tool-open">Abrir análisis →</span></button><button data-page="comparar" class="tool-link" type="button"><span class="tool-number">02</span><strong>Explorar oportunidades</strong><p>Cuatro alternativas, sus datos y sus límites.</p><span class="tool-open">Ir a comparación →</span></button><button data-page="operacion" class="tool-link" type="button"><span class="tool-number">03</span><strong>Crear una operación</strong><p>Contratos, primas, riesgo y punto de equilibrio.</p><span class="tool-open">Preparar operación →</span></button></div>
  <div class="home-bottom"><section class="session-panel"><p class="section-eyebrow">CONTEXTO DE TRABAJO</p><h3>Tu selección actual</h3><dl><div><dt>Empresa</dt><dd id="homeSymbol">Apple (AAPL)</dd></div><div><dt>Vencimiento</dt><dd id="homeExpiration"></dd></div><div><dt>Evaluaciones en este navegador</dt><dd id="homeHistory">0</dd></div></dl><button data-page="historial" type="button" class="text-action">Consultar historial →</button></section><section class="home-help"><span class="section-eyebrow">¿PRIMERA VEZ?</span><h3>Consulta, compara y después evalúa.</h3><p>Una evaluación muestra escenarios de ganancia y pérdida. Guardar un análisis y enviar una orden son acciones distintas.</p><button data-page="guia" type="button" class="text-action">Ver la guía de uso →</button></section></div>`;

  const marketPage = makePage('comparar', market);
  const marketCard = market.querySelector(':scope > .card');
  research.remove();
  marketCard.querySelector('h2').replaceChildren(document.createTextNode('Precios y gráfica'));
  const intro = marketCard.querySelector(':scope > .small-note');
  intro.textContent = 'Elige la empresa y el periodo. Los datos se consultan en Alpaca al cargar la gráfica.';
  const fields = Array.from($('candlesForm').children);
  const rangeHint = $('chRangeHint'), rangeStatus = $('chRangeStatus');
  $('candlesForm').after(details('Fechas y temporalidad personalizadas', [...fields.slice(2), rangeHint, rangeStatus], 'workspace-details market-options'));
  fields.slice(0,2).forEach((field,index) => field.querySelector('label').htmlFor = ['chSymbol','chTimeframe'][index]);
  const empty = document.createElement('div'); empty.className = 'chart-empty';
  empty.innerHTML = '<span class="empty-eyebrow">SIN CONSULTA ACTIVA</span><strong>La gráfica de tu empresa aparecerá aquí</strong><span>Selecciona un periodo y pulsa Mostrar gráfica para consultar precios reales.</span>';
  $('candlesChartContainer').after(empty);
  const signalSections = [...marketCard.querySelectorAll(':scope > .signal-mode, :scope > .chart-trigger-controls')];
  const legend = Array.from(marketCard.querySelectorAll(':scope > .small-note')).find(p=>p.textContent.includes('Marcadores:'));
  const signalHistory = marketCard.querySelector('.signal-history');
  marketCard.append(details('Indicadores y señales de la gráfica', [...signalSections, legend, signalHistory]));
  const researchPage = marketPage;
  const analysisContext=note('Una empresa, gráfica y estrategias', 'La gráfica muestra el periodo que elijas. El core técnico compara con velas diarias del último año; cambiar el zoom o el periodo visual no recalcula el ranking. Selecciona una empresa del ranking para consultar su gráfica.');
  analysisContext.id='analysisContext';
  marketPage.prepend(analysisContext);
  marketCard.id='analysisMarket';
  research.id='analysisStrategies';
  const analysisNav=document.createElement('nav');analysisNav.className='analysis-sections';analysisNav.setAttribute('aria-label','Secciones del análisis');
  analysisNav.innerHTML='<a href="#analysisMarket">Precios y gráfica</a><a href="#analysisStrategies">Análisis y comparación</a>';
  analysisNav.addEventListener('click',event=>{const link=event.target.closest('a');if(!link)return;event.preventDefault();const target=document.getElementById(link.getAttribute('href').slice(1));target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView?.({block:'start',behavior:'smooth'});});
  analysisContext.after(analysisNav);
  marketPage.append(research);
  function showCompanyChart(value){
    const symbol=String(value||'').trim().toUpperCase();
    if(!/^[A-Z0-9.-]{1,12}$/.test(symbol))return;
    if($('chSymbol').value!==symbol||root.__candlesChartState?.symbol!==symbol){
      $('chSymbol').value=symbol;
      // No change event: browsing a ranked company must not invalidate its snapshot.
      if(typeof root.loadCandles==='function')root.loadCandles();
    }
  }
  document.addEventListener('research:company-selected',event=>showCompanyChart(event.detail?.symbol));
  $('researchCompany').addEventListener('change',()=>showCompanyChart($('researchCompany').value));
  $('chSymbol').addEventListener('change',()=>{
    $('researchCompany').value=$('chSymbol').value.trim().toUpperCase();
  });
  $('researchMode').addEventListener('change',()=>{
    if($('researchMode').value==='company'){
      $('researchCompany').value=$('chSymbol').value.trim().toUpperCase();
      $('researchCompany').dispatchEvent(new Event('change',{bubbles:true}));
    }
  });
  const expirationField = document.createElement('div'); expirationField.className = 'research-expiration';
  expirationField.innerHTML = '<label for="researchExpiration">Vencimiento de los contratos</label><select id="researchExpiration" required aria-label="Vencimiento de los contratos"><option value="">Fechas disponibles al abrir el análisis…</option></select><small id="researchExpirationStatus" role="status" aria-live="polite">Las fechas se consultan automáticamente al abrir Análisis y estrategias.</small>';
  research.querySelector('.research-primary-filters').append(expirationField);
  $('researchExpiration').addEventListener('change',()=>{ $('expiration').value=$('researchExpiration').value; $('expiration').dispatchEvent(new Event('change',{bubbles:true})); });
  $('expiration').addEventListener('change',()=>{
    const select=$('researchExpiration'),date=$('expiration').value;
    if(date&&!Array.from(select.options).some(option=>option.value===date))select.add(new Option(`${date} (fecha manual)`,date));
    select.value=date;
  });
  const researchEmpty = note('La comparación comienza con tus empresas', 'Elige el top o una empresa, selecciona los cores y pulsa Analizar los cuatro spreads. Aquí aparecerán los resultados y sus explicaciones.', 'research-empty section-note');
  researchEmpty.id='researchEmptyState'; $('researchEvidence').before(researchEmpty);
  new MutationObserver(()=>{researchEmpty.hidden=!$('researchEvidence').hidden;}).observe($('researchEvidence'),{attributes:true,attributeFilter:['hidden']});
  const researchNext=note('De la comparación a tu operación', 'Revisa las primas y los contratos en Nueva operación antes de evaluar o guardar.');
  researchNext.append(action('operacion','Preparar una operación →','btn btn-primary')); researchPage.append(researchNext);

  const operationPage=makePage('operacion',originalStrategy);
  ticket.classList.add('order-panel'); ticket.id='operationTicket';
  $('btnToggleOrderPanel').remove();
  const operationLayout=document.createElement('div'); operationLayout.className='operation-layout';
  operationPage.prepend(operationLayout);
  operationLayout.append(ticket);
  const operationGuide=document.createElement('div'); operationGuide.className='operation-guide';
  operationGuide.innerHTML='<p class="section-eyebrow">ANTES DE EVALUAR</p><h3>Una operación,<br>dos contratos.</h3><ol><li><strong>Elige la dirección.</strong><span>Bull expresa una perspectiva alcista; Bear, una bajista.</span></li><li><strong>Define las dos patas.</strong><span>Long es compra y Short es venta. El tipo call o put depende de la estrategia.</span></li><li><strong>Consulta y evalúa.</strong><span>Obtén las primas de Alpaca o ingrésalas. Después revisa el riesgo y el equilibrio.</span></li></ol><p class="guide-footnote">Evaluar no envía una orden. El guardado aparece junto al resultado.</p>';
  operationLayout.append(operationGuide);
  ticket.querySelector('h2').textContent='1. Configura la estrategia';
  ticket.querySelectorAll('.strategy-chip').forEach(chip=>{
    chip.setAttribute('role','button');chip.tabIndex=0;
    chip.addEventListener('keydown',event=>{if(!chip.disabled&&(event.key==='Enter'||event.key===' ')){event.preventDefault();chip.click();}});
  });
  const fieldsIntro = note('2. Revisa los contratos y sus primas', 'Los strikes disponibles corresponden a la empresa, tipo de opción y vencimiento seleccionados.');
  $('strategyForm').before(fieldsIntro);
  const resultPlaceholder=note('3. Tu evaluación aparecerá aquí', 'Completa las primas y pulsa Evaluar estrategia. Verás pérdida máxima, ganancia máxima y punto de equilibrio sin enviar órdenes.', 'evaluation-empty section-note');
  resultPlaceholder.id='evaluationEmpty';
  operationLayout.append(resultPlaceholder,result); operationPage.prepend(operationLayout);
  new MutationObserver(()=>{resultPlaceholder.hidden=result.style.display!=='none';}).observe(result,{attributes:true,attributeFilter:['style']});
  result.querySelector('h2').textContent='3. Resultado y guardado';
  const paperButton=$('btnExecutePaper');
  const automation=ticket.querySelector('.order-panel-body > .card') || Array.from(ticket.querySelectorAll('.card')).find(c=>c.textContent.includes('Ciclo automático'));
  const paperSummary=$('executionSummary');
  const paperNodes=[paperButton,automation,paperSummary].filter(Boolean);
  const paperOptions=details('Ejecución Paper y automatización',paperNodes,'workspace-details paper-options');
  paperOptions.id='operationExecution';
  ticket.append(paperOptions);
  function openExecution(){
    navigate('operacion',{focus:false});paperOptions.open=true;
    const heading=paperOptions.querySelector('summary');heading.focus({preventScroll:true});
    paperOptions.scrollIntoView?.({block:'start',behavior:'smooth'});
  }

  const historyPage=makePage('historial');
  history.querySelector('h2').textContent='Evaluaciones de este navegador';
  history.prepend(note('Historial local', 'Estos resultados se conservan en este navegador. No confirman un guardado en Supabase.'));
  const table=history.querySelector('table'),wrap=document.createElement('div');wrap.className='table-scroll';table.before(wrap);wrap.append(table);
  historyPage.append(history);
  const journal=$('researchJournalTitle')?.closest('.research-panel');
  if(journal){journal.classList.add('journal-panel');historyPage.append(journal);}
  else {const journalPanel=$('btnLoadResearchJournal')?.closest('.research-panel');if(journalPanel)historyPage.append(journalPanel);}

  const help=makePage('guia');
  help.innerHTML='<div class="guide-intro"><span class="section-eyebrow">GUÍA RÁPIDA</span><h3>De consultar una empresa<br>a entender una operación.</h3><p>No necesitas recorrer todos los formularios. La gráfica y la comparación comparten un espacio. Después puedes preparar la operación.</p></div><div class="guide-grid"><section><span class="guide-index">01</span><h3>Consulta precios y gráfica</h3><p>Selecciona una empresa y un periodo. Carga su gráfica y observa las tarjetas de precios. Las fechas y la duración por vela se ajustan en opciones personalizadas.</p><button class="text-action" data-page="mercado">Abrir análisis →</button></section><section><span class="guide-index">02</span><h3>Compara en el mismo análisis</h3><p>Elige una empresa o una lista y un vencimiento. El análisis compara Bull Call, Bear Call, Bull Put y Bear Put. Abre la explicación para revisar los datos que se utilizaron.</p><button class="text-action" data-page="comparar">Ver análisis y comparación →</button></section><section><span class="guide-index">03</span><h3>Evalúa tu operación</h3><p>Selecciona la estrategia, las dos patas y las primas. Pulsa Evaluar para calcular riesgo, ganancia y equilibrio. El resultado permite guardar con tu cuenta.</p><button class="text-action" data-page="operacion">Abrir Nueva operación →</button></section><section><span class="guide-index">04</span><h3>Consulta tus resultados</h3><p>Historial distingue lo evaluado en este navegador de la bitácora persistida.</p><button class="text-action" data-page="historial">Abrir Historial →</button></section></div><section class="glossary"><h3>Los términos esenciales</h3><dl><div><dt>Strike</dt><dd>Precio de ejercicio fijado en el contrato de opción.</dd></div><div><dt>Prima</dt><dd>Precio que pagas por comprar la opción o recibes por venderla.</dd></div><div><dt>Long / Short</dt><dd>Long identifica la compra; Short identifica la venta.</dd></div><div><dt>Periodo / Vela</dt><dd>El periodo es todo el historial consultado; la vela resume un intervalo dentro de él.</dd></div><div><dt>Débito / Crédito</dt><dd>El débito es un pago neto; el crédito es un ingreso neto de primas.</dd></div><div><dt>Break-even</dt><dd>Precio del subyacente que equilibra el resultado al vencimiento, sin comisiones.</dd></div></dl></section>';

  const nav=document.querySelector('.tabs'); nav.replaceChildren();nav.setAttribute('aria-label','Navegación principal');
  const primary=['inicio','comparar','operacion','historial'];
  const ids={operacion:'strategy',mercado:'candles'};
  primary.forEach((key,index)=>{
    const button=action(key,definitions[key][0],'tab-btn');button.id='tab-btn-'+(ids[key]||key);
    const number=document.createElement('span'); number.className='nav-number'; number.setAttribute('aria-hidden','true');number.textContent=String(index+1).padStart(2,'0');
    button.prepend(number);button.setAttribute('aria-controls',pages.get(key).id);nav.append(button);
  });
  sidebar.replaceChildren();
  const label=document.createElement('p');label.className='sidebar-label';label.textContent='ESPACIO DE TRABAJO';sidebar.append(label,nav);
  const footer=document.createElement('div');footer.className='sidebar-footer';
  footer.append(action('guia','Guía de uso','sidebar-link'));
  const recovery=document.createElement('a');recovery.href='/auth/recuperar.html';recovery.className='sidebar-link';recovery.textContent='Recuperar acceso';footer.append(recovery);
  sidebar.append(footer);
  const menu=action('','Menú','mobile-menu');menu.removeAttribute('data-page');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-controls','workspaceSidebar');sidebar.id='workspaceSidebar';header.prepend(menu);
  menu.addEventListener('click',()=>{const open=document.body.classList.toggle('menu-open');menu.setAttribute('aria-expanded',String(open));});

  function updateContext(){
    const symbol=$('symbol');$('homeSymbol').textContent=symbol.selectedOptions?.[0]?.textContent||symbol.value;
    $('homeExpiration').textContent=$('expiration').value||'Sin seleccionar';
    let count=0;try{const rows=JSON.parse(localStorage.getItem('td_history')||'[]');if(Array.isArray(rows))count=rows.length;}catch{}
    $('homeHistory').textContent=String(count);
    if(!$('historyTable').children.length)$('historyTable').innerHTML='<tr data-history-empty><td colspan="7"><strong>Aún no tienes evaluaciones locales.</strong><br>Evalúa una estrategia en Nueva operación para empezar.</td></tr>';
  }
  function navigate(value,{write=true,focus=false}={}){
    const key=aliases[value]||value; if(!pages.has(key))return false;
    pages.forEach((page,pageKey)=>{page.hidden=pageKey!==key;page.classList.toggle('active',pageKey===key);});
    document.querySelectorAll('.tabs [data-page]').forEach(button=>{const active=button.dataset.page===key;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    const definition=definitions[key];headerTitle.textContent=definition[1];headerDescription.textContent=definition[2];$('workspaceCrumb').textContent=definition[0];
    document.title=definition[0]+' · Bull & Bear';current=key;document.body.dataset.workspacePage=key;updateContext();
    document.dispatchEvent(new CustomEvent('workspace:navigate',{detail:{page:key}}));
    if(write&&location.hash!=='#'+key)root.history.pushState({page:key},'','#'+key);
    document.body.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');
    if(focus)headerTitle.focus({preventScroll:true});
    if(typeof root.scrollTo==='function'&&!/jsdom/i.test(navigator.userAgent))root.scrollTo({top:0,behavior:'instant'});
    return true;
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-page]');if(button&&definitions[button.dataset.page])navigate(button.dataset.page,{focus:true});});
  root.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'inicio',{write:false}));
  root.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'inicio',{write:false}));
  document.addEventListener('change',updateContext);
  root.WorkspaceNavigation={navigate,openExecution,get current(){return current;}};
  if(!navigate(location.hash.slice(1)||'inicio',{write:false}))navigate('inicio',{write:false});
})(window);
