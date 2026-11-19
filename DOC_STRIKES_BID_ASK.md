# Vinculación de strikes con Bid/Ask de Alpaca

## Objetivo

Permitir que el usuario seleccione un **strike de compra (Long)** y un **strike de venta (Short)** en los comboboxes del dashboard, y que el sistema consulte automáticamente a Alpaca los precios reales de mercado (**Ask** para la compra, **Bid** para la venta) de esos contratos específicos, rellenando los campos de prima sin que el usuario tenga que escribirlos a mano.

---

## Problema antes

Los campos de strike eran `<select>` llenados con los strikes disponibles de Alpaca, pero los campos de prima (`priceLong` y `priceShort`) quedaban vacíos o con valores escritos manualmente por el usuario.

Esto permitía calcular el débito neto, el break-even, la máxima pérdida y ganancia con precios **ficticios** que no correspondían al mercado real.

---

## Solución implementada

Se agregó un nuevo endpoint en el backend y una función en el frontend que, dado un símbolo, vencimiento, tipo de opción y strike, consulta a Alpaca y devuelve el `bid` y `ask` de ese contrato exacto.

### Nuevo endpoint backend

```
GET /api/v1/broker/options-chain/quote?symbol=AAPL&expiration=2026-12-18&type=call&strike=190
```

**Archivos:**
- `services/quant-service/src/api/v1/routes/broker.routes.js` — registra la ruta.
- `services/quant-service/src/api/v1/controllers/broker.controller.js` — implementa `getOptionQuote`.

**Consulta interna a Alpaca:**
Recorre la cadena de opciones (`/v2/options/contracts`) para el símbolo, vencimiento y tipo dados, busca el contrato cuyo strike coincida exactamente y devuelve su `bid` y `ask`.

**Respuesta de ejemplo:**
```json
{
  "provider": "alpaca",
  "symbol": "AAPL",
  "expiration": "2026-12-18",
  "type": "call",
  "strike": 190,
  "contractSymbol": "AAPL261218C00190000",
  "bid": 4.20,
  "ask": 4.50,
  "bidSize": 15,
  "askSize": 10,
  "timestamp": "2026-11-18T14:30:00Z"
}
```

---

### Flujo en el frontend

**Archivo:** `services/gui-service/public/index.html`

1. **Al cambiar un strike en los comboboxes** (`strikeLong` o `strikeShort`), se dispara automáticamente `fetchOptionQuote(strike, side)`.
   - Para **Strike Compra (Long)**: consulta el **Ask** y lo pone en el campo *Prima de compra*.
   - Para **Strike Venta (Short)**: consulta el **Bid** y lo pone en el campo *Prima de venta*.

2. **Al darle al botón "Obtener cotizaciones (Alpaca)"** con el checkbox de selección automática **desactivado**:
   - Obtiene el precio de referencia del subyacente (spot).
   - Si hay strike seleccionado en Long, consulta y rellena su Ask.
   - Si hay strike seleccionado en Short, consulta y rellena su Bid.
   - **No borra** los strikes elegidos manualmente.

**Código clave:**
```javascript
async function fetchOptionQuote(strike, side) {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  const expiration = document.getElementById('expiration').value.trim();
  const type = selectedStrategy.includes('CALL') ? 'call' : 'put';
  const priceInput = side === 'buy' ? document.getElementById('priceLong') : document.getElementById('priceShort');

  const params = new URLSearchParams({ symbol, expiration, type, strike });
  const res = await fetch(`${QUANT_SERVICE_URL}/api/v1/broker/options-chain/quote?${params}`);
  const data = await res.json();

  const price = side === 'buy' ? data.ask : data.bid;
  priceInput.value = price.toFixed(2);
}
```

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `services/quant-service/src/api/v1/routes/broker.routes.js` | Agregada ruta `GET /options-chain/quote` |
| `services/quant-service/src/api/v1/controllers/broker.controller.js` | Agregada función `getOptionQuote` y exportada en `module.exports` |
| `services/gui-service/public/index.html` | Agregada función `fetchOptionQuote`, listeners en los comboboxes de strike y modificado el listener del botón "Obtener cotizaciones" |

---

## Cómo probarlo

1. Reinicia `quant-service` para que cargue la nueva ruta:
   ```powershell
   npm run start:quant
   ```
2. Recarga la página del GUI: `http://localhost:3005` (usa **Ctrl + F5**).
3. En la pestaña **Estrategia**:
   - Elige un ticker (ej. AAPL) y un vencimiento.
   - Los combos de strike se llenan con los disponibles de Alpaca.
   - Selecciona un strike en **Strike Compra (Long)** → el campo *Prima de compra* se rellena solo con el **Ask**.
   - Selecciona un strike en **Strike Venta (Short)** → el campo *Prima de venta* se rellena solo con el **Bid**.
   - O dale al botón **"Obtener cotizaciones (Alpaca)"** con el checkbox de selección automática desactivado para cargar ambas primas sin tocar los strikes.

---

## Notas importantes

- Si Alpaca no tiene cotización bid/ask para ese strike en ese momento, el campo de prima queda vacío y se muestra una nota informativa debajo del combobox.
- Los precios se toman de la cadena de opciones de Alpaca (`/v2/options/contracts`), que devuelve bid/ask por contrato.
- Esto asegura que los cálculos de la estrategia (débito neto, break-even, máxima pérdida/ganancia) usen precios reales del mercado y no valores inventados por el usuario.