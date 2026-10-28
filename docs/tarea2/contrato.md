# Contrato de integración `entrelibros.event.v1`

La tienda (proyecto de Supabase del eCommerce) envía a n8n un mensaje por cada evento de negocio integrable, y n8n lo
aplica en el back-office ERP/CRM, que es otro sistema (otro proyecto de Supabase; las tablas de destino de abajo son suyas). El mensaje
se construye en la base de datos (`_integration_build_payload`, `supabase/14_integracion.sql`)
en la misma transacción que el evento, así que siempre refleja el estado real del pedido o la
incidencia en ese momento.

## Transporte

| Aspecto | Valor |
|---|---|
| Método | `POST` al webhook de n8n `/webhook/entrelibros/eventos` (HTTPS) |
| Autenticación | Cabecera `X-Entrelibros-Key` con un secreto compartido (Header Auth en n8n) |
| Cabeceras extra | `X-Entrelibros-Attempt`: número de intento (1, 2, 3…) |
| Respuesta correcta | `200` `{"result": "...", "event_id": "..."}` |
| Respuesta de error de datos | `422` con la lista de errores de validación (no se reintenta) |
| Confirmación (ack) | n8n llama a `integration_ack(event_id, ok, detalle, reintentar)` de la tienda cuando el back-office ha aplicado (o rechazado) el evento |
| Reintentos | `pg_cron` reenvía cada minuto lo no confirmado, con espera 2, 4, 8, 16… min (máx. 6 intentos) |
| Idempotencia | `event_id` único en la cola; el ERP guarda `last_event_id` y responde `duplicado` si llega dos veces |
| Orden | El ERP guarda `last_event_at`; un evento más antiguo que el último aplicado se marca `obsoleto` |

## Sobre (todos los eventos)

```json
{
  "contract": "entrelibros.event.v1",
  "event_id": "uuid",
  "event_type": "payment.simulated",
  "occurred_at": "2026-10-26T08:25:37.820753+00:00",
  "source": "servidor | backoffice | web",
  "environment": "prototipo-academico",
  "data": { }
}
```

| Campo | Obligatorio | Validación |
|---|---|---|
| `contract` | sí | igual a `entrelibros.event.v1` |
| `event_id` | sí | UUID |
| `event_type` | sí | uno de los 6 tipos de la tabla siguiente |
| `occurred_at` | sí | fecha ISO 8601 |
| `data` | sí | objeto; contenido según el tipo |

## Tipos de evento y destino

| Evento | Escenario | `data` | Destino en el ERP |
|---|---|---|---|
| `order.created` | 1 | `order` | `sales_orders` + líneas + historial (estado `pendiente_pago`) |
| `payment.simulated` | 1 | `order`, `attempt` | pedido `pagado` (o pago `rechazado`) |
| `order.status_changed` | 2 | `order`, `change {from, to, by}` | estado del pedido |
| `stock.adjusted` | 2 | `stock {sku, from, to, description}` | `inventory` |
| `support.requested` | 3 | `ticket`, `order` (si hay) | `tickets` + agente de IA + Telegram |
| `support.status_changed` | 3 | `ticket`, `change` | estado del ticket |

## `data.order`

| Campo | Obligatorio | Validación / normalización en n8n |
|---|---|---|
| `order_number` | sí | `EL-AAAAMMDD-XXXX` |
| `status` | sí | estado de la tienda; se traduce al del ERP (`pago_simulado` → `pagado`, `pendiente_preparacion` → `en_preparacion`…) |
| `created_at` | sí | ISO 8601 → UTC |
| `customer.email` | sí | email válido → minúsculas y sin espacios |
| `customer.full_name`, `phone` | no | espacios normalizados; teléfono español → `+34…` |
| `lines[]` | sí (≥ 1) | `sku`, `quantity` entero > 0, `unit_price × quantity = line_total` |
| `amounts.subtotal` | sí | = suma de `line_total` |
| `amounts.total` | sí | = subtotal − descuento + envío (IVA incluido) |
| `amounts.tax`, `shipping` | sí | numéricos, redondeo a 2 decimales |
| `shipping` | no | se compone `full_address`; punto de recogida si lo hay |
| `payment` | no | método legible y estado del ERP (`pagado` / `rechazado` / `pendiente`) |

## `data.ticket`

| Campo | Obligatorio | Validación / normalización |
|---|---|---|
| `ticket_number` | sí | `SOP-AAAAMMDD-XXXX` |
| `customer_email` | sí | email válido |
| `reason` | sí | `pieza_faltante`, `pieza_danada`, `retraso_envio`, `duda_montaje`, `otro` → categoría, prioridad inicial y SLA (24/48/72 h) |
| `message` | sí | texto, máx. 2000 caracteres |
| `order_number` | no | si viene, formato de pedido; el ticket se enlaza al pedido del ERP |
| `telegram_token` | no | token que la tienda enseña al cliente («Seguir la incidencia en Telegram»); el CRM lo guarda para vincular el chat |

## Errores

| Tipo (`error_type`) | Ejemplo | Qué pasa |
|---|---|---|
| `contrato` | falta el email o las líneas | 422, log `error`, aviso al canal interno de Telegram, outbox `error` (no se reintenta) |
| `formato` | fecha o número de pedido mal formados | igual que contrato |
| `coherencia` | la suma de líneas no cuadra con el subtotal | igual que contrato |
| `autenticacion` | cabecera `X-Entrelibros-Key` incorrecta | 403 del webhook; no se procesa nada |
| `negocio` | el ERP rechaza la operación | log `error`, aviso, outbox `error` |
| `tecnico` | el ERP o la red no responde | log `error`, outbox vuelve a `pendiente` y se reintenta |
| `agente` | el modelo de IA falla o devuelve un JSON no válido | la incidencia queda en el CRM, la propuesta no se crea y se avisa para revisión manual |

Los payloads reales de los tres escenarios están en [`payloads/`](payloads/).
