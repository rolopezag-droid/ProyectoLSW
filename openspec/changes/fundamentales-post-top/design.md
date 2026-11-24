# Separar selección y enriquecimiento

Se conserva el motor de puntuación. Solo en el recorrido S&P 500 se usa una copia de módulos con financial=false para preseleccionar y ordenar. Los filtros se aplican antes de extraer diez empresas. FMP enriquece esas finalistas y el resultado se conserva como contexto con alcance explícito en el snapshot; no se recalcula el orden global con cobertura fundamental exclusiva de diez empresas. Los modos manuales mantienen el comportamiento anterior. La presentación conserva la posición numerada original de Comparación.
