/* Continuous analysis screen and independent order review; existing handlers are preserved. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const research=$('analysisStrategies');
 // One continuous analysis surface; order review remains its own page.
 document.querySelector('.analysis-sections')?.remove();
 const controls=research.querySelector('.research-controls');
 const heading=research.querySelector('.research-heading');
 const evidence=$('researchEvidence');
 const market=$('analysisMarket');
 const layout=document.createElement('div');layout.className='continuous-analysis';
 research.append(layout);
 layout.append(market,evidence);
 // Market first: the chart stays above comparison controls and ranked results.
 if(heading)market.after(heading);
 market.after(...[$('analysisContext'),heading,controls,$('researchEmptyState')].filter(Boolean));
 const next=research.nextElementSibling;
 if(next?.classList.contains('section-note'))next.remove();
 const risk=document.createElement('aside');risk.id='orderRiskSummary';risk.className='order-risk-summary';risk.setAttribute('aria-label','Resumen de la operación');
 risk.innerHTML='<span class="section-eyebrow">REVISIÓN DE ORDEN · PAPER</span><h3>Resumen de riesgo</h3><p id="orderRiskStatus">Evalúa los contratos para consultar sus importes verificados.</p><dl id="orderRiskMetrics"></dl><p class="risk-footnote">Evaluar y navegar no envían órdenes. Comprueba contratos, primas y cantidad antes del envío.</p>';
 const guide=document.querySelector('.operation-guide');guide.replaceWith(risk);
 $('researchCompareSymbol').addEventListener('change',()=>{
  const symbol=$('researchCompareSymbol').value;
  if(symbol)document.dispatchEvent(new CustomEvent('research:company-selected',{detail:{symbol}}));
 });
 function syncRisk(){
  const valid=$('resultsCard').style.display!=='none';
  $('orderRiskMetrics').replaceChildren();
  $('orderRiskStatus').textContent=valid?'Resultado de la última evaluación de estos contratos.':'Evalúa los contratos para consultar sus importes verificados.';
  if(valid)for(const metric of $('resultsGrid').children){
   const label=metric.querySelector('.label'),value=metric.querySelector('.value');if(!label||!value)continue;
   const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label.textContent;dd.textContent=value.textContent;dd.className=value.className;row.append(dt,dd);$('orderRiskMetrics').append(row);
  }
 }
 new MutationObserver(syncRisk).observe($('resultsCard'),{attributes:true,attributeFilter:['style']});
 new MutationObserver(syncRisk).observe($('resultsGrid'),{childList:true,subtree:true,characterData:true});
 // Preserve the independent order navigation and the original prepare action.
 document.querySelectorAll('.home-tools [data-page]').forEach((button,index)=>{
  if(index===0){button.querySelector('strong').textContent='Mercado y estrategias';button.querySelector('p').textContent='Consulta precios, gráfica, análisis y estrategias en una sola pantalla.';}
  if(index===1){button.querySelector('strong').textContent='Comparar oportunidades';button.querySelector('p').textContent='Filtra empresas y revisa sus operaciones sugeridas en el mismo análisis.';}
 });
 syncRisk();
})(window);
