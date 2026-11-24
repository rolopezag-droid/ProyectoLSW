## Why
La captura del usuario muestra SMA marcadas sin dibujar porque el core técnico está desmarcado. Dependencias invisibles causan una selección engañosa.
## What Changes
Seleccionar un indicador técnico de la gráfica activa el core técnico, informa el cambio e invalida resultados anteriores. Desactivar el core desmarca sus capas y señales; último cierre sigue independiente.
## Impact
GUI y pruebas con SVG real en JSDOM. Sin cambio de fórmulas ni consultas por redibujado. Asistencia IA Codex.
