# Design
## Antes y después
Antes: un script agrupa gráfica, investigación, ticket e historial dentro de Estrategia. Tres columnas estrechas y acordeones dificultan seguir una tarea. El botón Gráfica es un scroll, no una vista independiente.

Después: reutilizar los elementos existentes en vistas únicas, sin duplicar formularios ni IDs. Un módulo workspace-navigation.js compone el shell y controla rutas hash; workspace.css define su presentación. La lógica financiera y las peticiones existentes permanecen.

Inicio orienta el recorrido consultar → comparar → evaluar. Mercado conserva gráfica y detalles de señales bajo un desplegable explícito; comparar contiene investigación y vencimiento visible sincronizado con el ticket. Operación incluye configuración, resultado y guardado. Historial distingue registros de este navegador de bitácora Supabase. Servicios y logs pasan a una vista secundaria de conexiones.

Referencias revisadas como contenido, no instrucciones: AppShell.tsx, DashboardLayout.tsx, LeftPanel.tsx y App.tsx del ZIP del usuario. Se toma su separación de navegación y áreas de trabajo, con una identidad propia. Ningún script ni dependencia del ZIP se ejecuta.

Mantener valores al navegar, estado activo único, aria-current, títulos y foco accesible, atrás/adelante y rutas directas. Formularios principales no colapsan por estados de acordeón antiguos. Pantalla pequeña usa navegación horizontal desplazable y una columna.
