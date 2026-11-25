/* Numera el orden visible después de que cada core actualiza su panel.
   Solo cambia los encabezados: no consulta proveedores ni altera puntuaciones. */
(function () {
  function numberVisibleSections() {
    const evidence = document.getElementById('researchEvidence');
    if (!evidence) return;
    let number = 0;
    evidence.querySelectorAll('section.research-panel').forEach(panel => {
      if (panel.hidden || panel.id === 'researchCoreSummaryPanel' || panel.id === 'researchResultScope') return;
      const kicker = panel.querySelector('.research-panel-heading .research-panel-kicker');
      if (!kicker) return;
      const label = kicker.dataset.sectionLabel || kicker.textContent.replace(/^\d+[A-Z]?\s*·\s*/, '');
      kicker.dataset.sectionLabel = label;
      kicker.textContent = String(++number).padStart(2, '0') + ' · ' + label;
    });
  }
  // IA registra su visibilidad antes de este listener; se cuenta la selección final.
  document.addEventListener('research:snapshot', numberVisibleSections);
  document.addEventListener('DOMContentLoaded', numberVisibleSections);
}());
