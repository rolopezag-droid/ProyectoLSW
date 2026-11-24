# Cliente y presentación

La caché anterior guardaba la fila completa por seis horas incluso cuando faltaban recursos por un error transitorio. Cada ticker disparaba cuatro peticiones paralelas y 429 solo bloqueaba un recurso de un símbolo. Se separa un cliente de proveedor: caché de éxitos por endpoint/símbolo/huella de clave, solicitudes en vuelo compartidas y cola por credencial. Un 429 pausa las peticiones siguientes de esa credencial respetando Retry-After o 60 segundos si no existe; no se presume cuándo se renueva la cuota diaria. Un 402 no bloquea otras empresas.

Los éxitos se reutilizan seis horas. Ante errores se permite mostrar datos previamente obtenidos hasta 24 horas, marcados como caché sin actualizar y con fecha original. No se persiste la clave ni se genera un reemplazo sintético. No se ejecutan reintentos automáticos. El catálogo público del S&P se solicita sin tocar FMP; el adaptador FMP del universo solo actúa como alternativa si el público falla.
