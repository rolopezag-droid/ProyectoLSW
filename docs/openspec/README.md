# OpenSpec en ProyectoLSW

Adopción: 2026-11-06. Herramienta local de desarrollo, versión fijada en package.json.

## Uso
1. Instalar dependencias: npm ci.
2. Consultar cambios: npx openspec list.
3. Ver estado: npx openspec status --change validar-intervalos-de-velas.
4. Validar documentos: npx openspec validate validar-intervalos-de-velas --strict.
5. Revisar propuesta, especificación, diseño y tareas antes de implementar.
6. Implementar el cambio y ejecutar las pruebas indicadas; registrar evidencia real.
7. Archivar solo después de completar tareas y verificar resultados.

En Codex usar openspec-propose desde Skills; en Copilot /opsx-propose. Reiniciar el editor si no aparecen las integraciones generadas.

## Constitución
openspec/config.yaml contiene contexto, reglas y el requisito de proponer una estructura propia si la actual no es óptima. Es configuración del flujo; no es una especificación OpenAPI/Swagger.

## Evidencia IA y manual
El historial anterior y las mejoras anteriores a esta fecha no se presentan como desarrollo SDD. La configuración y los documentos iniciales fueron preparados por Roberto con asistencia de Codex. El primer cambio está implementado y probado; ver evidencia-intervalos-velas.md. No hay optimización manual acreditada en este cambio todavía.

Para cada intervención registrar: API, fecha, persona responsable, modalidad (IA asistida o manual verificable), archivos, commit, comparación estructural, comando de prueba y resultado. Los resultados simulados no acreditan integración real con BD o broker. No incluir secretos ni contenido de .env.

## Primer caso
openspec/changes/validar-intervalos-de-velas propone rechazar timeframe inválido en la API de velas. Es una mejora nueva, no una reconstrucción retrospectiva de las mejoras de interfaz. Las tareas completadas se marcan con evidencia real; el archivo final sigue reservado para después de la revisión.

Fuente: https://github.com/Fission-AI/OpenSpec

