const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

test('encabezados siguen el orden visible e incluyen IA sin cambiar resultados', () => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8'), {runScripts:'outside-only'});
  const w = dom.window, d = w.document;
  try {
    // La bitácora pertenece a Historial, como en la navegación de la aplicación.
    d.getElementById('researchJournalTitle').closest('section').remove();
    w.eval(fs.readFileSync(path.join(__dirname, '../public/research-sections.js'), 'utf8'));
    const evidence = d.getElementById('researchEvidence');
    const panels = [...evidence.querySelectorAll('section.research-panel')].filter(p => p.querySelector('.research-panel-kicker') && !['researchCoreSummaryPanel','researchResultScope'].includes(p.id));
    const check = () => {
      w.document.dispatchEvent(new w.Event('research:snapshot'));
      const visible = panels.filter(p => !p.hidden);
      visible.forEach((p,i) => assert.ok(p.querySelector('.research-panel-kicker').textContent.startsWith(String(i+1).padStart(2,'0')+' · ')));
      return visible;
    };
    panels.forEach(p => {p.hidden=false;});
    assert.equal(check().length, 9);
    assert.match(d.getElementById('researchAiPanel').textContent, /02 · Interpretación del análisis/);
    const result = d.getElementById('researchAiResult'); result.textContent='Interpretación conservada';
    panels.forEach(p => {p.hidden=!['researchAiPanel','researchNewsPanel'].includes(p.id);});
    assert.equal(check().length,2);
    assert.match(d.getElementById('researchAiPanel').textContent, /01 · Interpretación del análisis/);
    assert.match(d.getElementById('researchNewsPanel').textContent, /02 · Contexto reciente/);
    assert.equal(result.textContent,'Interpretación conservada');
    assert.equal(check().length,2);
  } finally {w.close();}
});
