# Pruebas del contrato `entrelibros.event.v1`

Qué ocurre cuando llega a n8n un evento correcto y cuando llega uno con problemas. Cada caso se
comprueba en una de estas dos capas:

1. **n8n · «Validar y normalizar»** ([`n8n/code/validar-evento.js`](../../n8n/code/validar-evento.js)): campos
   obligatorios, formatos y cuadre de importes. Si falla, el evento no llega al ERP.
2. **ERP · funciones `erp_upsert_*` y `erp_set_stock`** ([`erp/supabase/01_erp.sql`](../../erp/supabase/01_erp.sql) y
   [`02_orden_eventos.sql`](../../erp/supabase/02_orden_eventos.sql)), en el proyecto de Supabase del back-office
   (`entrelibros-erp`), separado del de la tienda: idempotencia (`last_event_id`) y orden (`last_event_at`). Además repiten las comprobaciones básicas (email, líneas, subtotal) por si alguien
   llamara al ERP sin pasar por n8n.

La respuesta HTTP del webhook sirve para depurar. El estado de la cola de la tienda **no** depende de ella:
lo cambia la llamada `integration_ack` que n8n hace a la tienda al final de cada ejecución.

## Resumen

| # | Caso | Payload | Lo detecta | Respuesta de n8n | Registro del ERP (`integration_log`) | Cola de la tienda tras el ACK |
|---|---|---|---|---|---|---|
| 1 | Evento válido | [`1-pedido-pagado.json`](payloads/1-pedido-pagado.json) | — | `200` `result: actualizado` | `ok` · «ERP: actualizado» | `procesado` |
| 2 | Sin email del cliente | `1-pedido-pagado.json` sin `customer.email` | n8n | `422` `error_type: contrato` | `error` · `contrato` | `error` (no se reintenta) |
| 3 | Importes que no cuadran | `1-pedido-pagado.json` con un importe cambiado | n8n | `422` `error_type: coherencia` | `error` · `coherencia` | `error` (no se reintenta) |
| 4 | Número de pedido mal formado | [`5-error-formato-pedido.json`](payloads/5-error-formato-pedido.json) | n8n | `422` `error_type: formato` | `error` · `formato` | `error` (no se reintenta) |
| 5 | Evento duplicado | el mismo evento enviado dos veces | ERP | `200` `result: duplicado` | `duplicado` · «ERP: duplicado» | `procesado` |
| 6 | Evento fuera de orden | [`6-evento-fuera-de-orden.json`](payloads/6-evento-fuera-de-orden.json) después de [`2-cambio-estado.json`](payloads/2-cambio-estado.json) | ERP | `200` `result: obsoleto` | `obsoleto` · «ERP: obsoleto» | `procesado` |
| 7 | Ajuste de stock fuera de orden | [`7-stock-fuera-de-orden.json`](payloads/7-stock-fuera-de-orden.json) después de [`2b-ajuste-stock.json`](payloads/2b-ajuste-stock.json) | ERP | `200` `result: obsoleto` | `obsoleto` · «ERP: obsoleto» | `procesado` |

En todos los casos n8n escribe la fila del registro en el ERP (`erp_log`) con `workflow = eventos-erp` y
`step = resultado`. Se ve en la web del back-office ERP/CRM, en **Registro de integración**. El estado de la cola
se ve en la tienda, en **Back-office → Integración**. La respuesta siempre incluye `event_id` y `execution_id`
(el id de la ejecución en n8n).

## Detalle de cada caso

### 1. Evento válido

`payment.simulated` aprobado del pedido `EL-20261026-D5GL`, que ya estaba en el ERP por su `order.created`.

- **n8n** normaliza los datos antes de enviarlos al ERP:
  - el email, a minúsculas y sin espacios (`  Lucia.Prueba@Example.COM ` → `lucia.prueba@example.com`);
  - el teléfono, a `+34600111222`;
  - el método de pago, a «Tarjeta simulada»;
  - el estado `pago_simulado`, al del ERP, `pagado`.
- **Respuesta:** `200` `{"result": "actualizado", "event_id": "e07a6588-…", "execution_id": "…"}`. Si el ERP no tenía
  el pedido, `result` es `creado`.
- **Log:**
  - `status = ok`;
  - `message = "ERP: actualizado"`;
  - en `details`, la respuesta del ERP: `previous_status: pendiente_pago`, `status: pagado` y `sync_version`.
- **Cola:** `procesado`, con `processed_at`.
- **Telegram:** el canal interno recibe «🧾 Pedido pagado integrado en el ERP».

### 2. Sin email del cliente

- **Respuesta:** `422` `{"result": "error", "error_type": "contrato", "message": "order.customer.email: Email del cliente ausente o no válido", …}`
- **Log:**
  - `status = error`, `error_type = contrato`, con el mismo mensaje;
  - en `details.errors`, la lista de errores con su campo.
- **Cola:** `error`, con `last_error = "contrato: order.customer.email: …"`. **No se reintenta**, porque reenviar el
  mismo dato incorrecto daría el mismo error. El botón «Reintentar» de la tienda (**Back-office → Integración**)
  reenvía el mismo payload guardado en la cola, así que con un error de datos solo sirve si lo equivocado era la
  regla de n8n o del ERP y ya se ha corregido.
- **Telegram:** alerta «⚠️ Error de integración (contrato) … No se reintenta: revisar los datos.»
- **ERP:** no se crea ni se cambia ningún pedido. Solo queda la fila del registro.

### 3. Importes que no cuadran

n8n hace tres comprobaciones, con una tolerancia de 0,01 € por redondeo:

| Variante | Cambio en `1-pedido-pagado.json` | Mensaje en la respuesta y en el log |
|---|---|---|
| a | `amounts.subtotal = 99.99` | `order.amounts.subtotal: Suma de líneas 52.7 ≠ subtotal 99.99 · order.amounts.total: subtotal − descuento + envío = 104.94 ≠ total 57.65` |
| b | `lines[1].line_total = 29.8` (2 × 19,90 = 39,80) | `order.lines[1].line_total: precio × cantidad no coincide con el importe de la línea · order.amounts.subtotal: Suma de líneas 42.7 ≠ subtotal 52.7` |
| c | `amounts.total = 60` | `order.amounts.total: subtotal − descuento + envío = 57.65 ≠ total 60` |

- **Respuesta, log, cola y aviso:** igual que en el caso 2, pero con `error_type = coherencia`.
- **Un error arrastra a otros:** un importe mal puesto descuadra también las comprobaciones que dependen de él,
  y el mensaje los recoge todos.
- **Segunda barrera:** si un subtotal descuadrado llegara al ERP, `erp_upsert_order` lo rechaza con
  `coherencia: la suma de líneas (…) no coincide con el subtotal (…)`. El nodo «Clasificar error del ERP» reconoce
  el prefijo y lo trata también como `coherencia` (`422`, sin reintento).

> El payload [`4-error-contrato.json`](payloads/4-error-contrato.json) junta el caso 2 y la variante 3a. La respuesta trae
> los tres errores, pero `error_type` es `contrato`, porque n8n informa del tipo del **primer** error encontrado.

### 4. Número de pedido mal formado

`order.created` con `order_number = "el-20261026-d5gl"`, en minúsculas. El formato exigido es `EL-AAAAMMDD-XXXX`.

- **Respuesta:** `422` `{"result": "error", "error_type": "formato", "message": "order.order_number: Número de pedido con formato incorrecto", …}`
- **Log:** `status = error`, `error_type = formato` y `entity_ref = "el-20261026-d5gl"`, tal como llegó, para poder
  localizar el origen.
- **Cola y aviso:** igual que en el caso 2.
- **Por qué no se corrige solo, como el email:** el número de pedido es la clave que comparten la tienda y el ERP.
  Un número «arreglado» por n8n podría no corresponder a ningún pedido real, así que se rechaza y se revisa.

### 5. Evento duplicado

Ocurre, por ejemplo, cuando n8n procesa el evento pero su ACK no llega a Supabase: Render tarda en responder y la
cola sigue en `enviado`. `pg_cron` reenvía entonces el mismo mensaje con el mismo `event_id`. Hay dos barreras:

1. **Cola:** `event_id` es único. La tienda nunca encola dos veces el mismo evento (`on conflict do nothing`).
2. **ERP:** si `last_event_id` del pedido coincide con el `event_id` recibido, `erp_upsert_order` no toca nada y
   devuelve `duplicado`.

Resultado:
- **Respuesta:** `200` `{"result": "duplicado", …}`.
- **Log:** `status = duplicado`. El cuadro de mando del ERP lo cuenta como evento aplicado y lo muestra además aparte,
  en «Eventos aplicados»: «N de M · K duplicados · J obsoletos».
- **Cola:** `procesado`, porque ya no hay nada pendiente.
- **Telegram:** no hay aviso al canal interno.
- **Si es un `support.requested` repetido:** el agente **no** se lanza otra vez, porque solo se lanza cuando el ticket
  se crea (`result = creado`). No hay una segunda propuesta ni un segundo mensaje al cliente.

> **Ojo con un matiz:** el ERP compara solo con el **último** evento aplicado. Si entre las dos copias se aplicó un evento más
> reciente del mismo pedido, la copia repetida sale como `obsoleto` (caso 6) y no como `duplicado`. El efecto es el
> mismo: no se sobrescribe nada.

### 6. Evento fuera de orden

`order.status_changed` a `pendiente_preparacion`, ocurrido a las 08:27:10. Llega **después** del cambio a `enviado`,
ocurrido a las 08:28:51 (`2-cambio-estado.json`). Pasa, por ejemplo, cuando el primer envío falló y su reintento
llega tarde.

- **n8n:** el payload es válido.
- **ERP:** `last_event_at` del pedido (08:28:51) es posterior a `occurred_at` (08:27:10), así que `erp_upsert_order`
  devuelve `obsoleto`. El pedido **sigue en `enviado`** y `sync_version` no cambia.
- **Respuesta:** `200` `{"result": "obsoleto", …}`.
- **Log:** `status = obsoleto`. Cuenta como evento aplicado: el sistema ha hecho lo que debía.
- **Cola:** `procesado`. No se reintenta, porque reintentarlo daría el mismo resultado.

### 7. Ajuste de stock fuera de orden

`stock.adjusted` de `EL-ACC-PINT` de 30 a 29, ocurrido a las 08:27:40. Llega **después** del ajuste de 29 a 28,
ocurrido a las 08:28:52 (`2b-ajuste-stock.json`).

- **n8n:** el payload es válido.
- **ERP:** `last_event_at` del SKU (08:28:52) es posterior a `occurred_at` (08:27:40), así que `erp_set_stock`
  devuelve `obsoleto`. El stock **sigue en 28**.
- **Respuesta, log y cola:** igual que en el caso 6.
- **Incidencias:** `erp_upsert_ticket` hace la misma comparación. Un `support.status_changed` antiguo que llegue tarde
  no reabre una incidencia ya resuelta ni añade actividad al ticket.
- **Conciliación nocturna (workflow 4):** la tienda manda la foto de su stock con la hora en que la tomó (`taken_at`).
  - Un SKU con un ajuste posterior a esa hora no se toca y se cuenta como «omitido»: aparece en el registro y en el
    resumen de Telegram.
  - Los demás quedan fechados a la hora de la foto, así que un ajuste anterior que llegue después ya es `obsoleto`.

## Fallos de transporte

| Caso | Respuesta | Log | Cola |
|---|---|---|---|
| Cabecera `X-Entrelibros-Key` incorrecta o ausente | `403` del webhook; el workflow no llega a ejecutarse | Nada | Sigue en `enviado`. `pg_cron` reenvía a los 2, 4, 8, 16 y 32 min; tras 6 intentos pasa a `error` («Sin confirmación de n8n · reintentos agotados») |
| n8n caído o dormido (Render gratuito) | Ninguna: `pg_net` corta a los 8 s | Nada | Igual que la fila anterior. Cuando n8n responde, el evento se procesa con normalidad. Si una copia anterior sí se había procesado, sale `duplicado` (caso 5) |
| El ERP no responde o da un error 5xx | `503`, `error_type: tecnico` | `error` · `tecnico` | Vuelve a `pendiente` y se reintenta a los 2 min. La alerta de Telegram dice «Se reintentará automáticamente.» |

## Limitación detectada y corregida

Al escribir estas pruebas se vio que la protección contra eventos fuera de orden (`last_event_at`) solo existía para
los **pedidos**. Un `stock.adjusted` o un `support.status_changed` antiguo que llegara tarde sobrescribía el stock o el
estado del ticket con un valor ya superado, y la conciliación nocturna podía pisar un ajuste posterior a la foto.

Se corrige en [`erp/supabase/02_orden_eventos.sql`](../../erp/supabase/02_orden_eventos.sql) y en n8n:
- `inventory` y `tickets` guardan `last_event_at`;
- `erp_set_stock` y `erp_upsert_ticket` reciben la fecha del evento y responden `obsoleto` si es más antigua que la
  última aplicada, como `erp_upsert_order`;
- `erp_load_inventory` recibe la hora de la foto y no pisa un ajuste posterior;
- los workflows 1 y 4 mandan esas fechas ([`n8n/build_workflows.py`](../../n8n/build_workflows.py)).

Los parámetros nuevos son opcionales: el SQL se puede aplicar antes de reimportar los workflows sin romper nada.

## Cómo se ha comprobado y cómo repetirlo

- **Capa n8n (casos 1–4 y validez del 6 y el 7):** se ejecutó `validar-evento.js` con Node sobre cada payload,
  reproduciendo el nodo Code de n8n. Los mensajes de las tablas son la salida literal.
- **Capa ERP (casos 5 y 6):** el resultado se deduce de `erp_upsert_order`.
- **Corrección del orden (caso 7, incidencias y conciliación):** se probó en un PostgreSQL desechable en memoria
  (PGlite), con `01_erp.sql` y `02_orden_eventos.sql`, sin tocar Supabase.
  - 35 comprobaciones: duplicado, obsoleto, misma hora, foto anterior y posterior a un ajuste, llamadas sin los
    parámetros nuevos, errores de contrato, permisos y volver a ejecutar los ficheros.
  - Los payloads 2b y 7, pasando antes por `validar-evento.js`, en los dos órdenes: 28 → `obsoleto` (sigue en 28),
    y 29 → 28 (`actualizado`).
- **En el n8n desplegado:**

```bash
# La clave no está en el repositorio. Con read -s no queda en el historial de la terminal.
read -s ENTRELIBROS_KEY && export ENTRELIBROS_KEY
curl -s -X POST https://entrelibros-n8n.onrender.com/webhook/entrelibros/eventos \
  -H 'Content-Type: application/json' \
  -H "X-Entrelibros-Key: $ENTRELIBROS_KEY" \
  --data @docs/tarea2/payloads/6-evento-fuera-de-orden.json
```

- **Casos 5 y 6 por esta vía:** el ERP nuevo no tiene `EL-20261026-D5GL`, así que se envían `2-cambio-estado.json`,
  `6-evento-fuera-de-orden.json` y otra vez el 2. Deben salir `creado`, `obsoleto` y `duplicado`.
- **Caso 7 por esta vía, sin tocar el stock real:** después de aplicar el 02 y reimportar los workflows, se ejecuta a
  mano el workflow 4 (la foto queda fechada ahora) y se envía `7-stock-fuera-de-orden.json`. Debe salir `obsoleto` y
  `EL-ACC-PINT` conserva su stock.
- **Límite de curl:** un evento enviado así no existe en la cola de la tienda, así que `integration_ack` devuelve
  `desconocido` y la cola no cambia. La respuesta y la fila del registro del ERP sí aparecen. Para ver la cola y los
  reintentos (caso 5 y fallos de transporte), hay que generar el evento desde la tienda y usar
  **Back-office → Integración**.
