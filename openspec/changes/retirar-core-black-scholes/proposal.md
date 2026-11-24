# Retirar Black-Scholes como core independiente del comparador

Se elimina su selector y su estimación de probabilidad del ranking, filtros, tabla y explicaciones del comparador. Esa casilla sí aportaba puntuación; retirarla implica recalcular el orden únicamente con los cores restantes elegidos. No se eliminan precios Black-Scholes, griegas, volatilidad implícita ni los algoritmos financieros de Quant. No se afirma que el core financiero completo quede implementado por este cambio.
