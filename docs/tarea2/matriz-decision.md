# Matriz de decisión de implantación

**Caso:** Entrelibros, pequeña tienda online de *book nooks* (1–3 personas, catálogo de decenas de productos,
pocos pedidos al día al principio). Necesita conectar la tienda con la gestión interna (pedidos, stock, atención
postventa), automatizar el proceso y usar IA de forma supervisada sin perder el control de los datos.

## Alternativas

| | Alternativa | En qué consiste |
|---|---|---|
| **A** | Híbrida: tienda propia + n8n + Gemini *(implantada)* | La tienda (GitHub Pages + Supabase) publica eventos; n8n autoalojado los valida y los lleva al ERP/CRM (esquema `erp`), con agente de IA y aprobación en Telegram |
| **B** | SaaS | Tienda en Shopify, CRM HubSpot y automatizaciones en Make, todo como servicio |
| **C** | ERP parametrizable | Odoo con sus módulos de eCommerce, CRM, inventario y helpdesk; la integración es nativa dentro del ERP |
| **D** | Desarrollo propio sin plataforma de flujos | La misma tienda, pero toda la integración, reintentos, logs, IA y aprobaciones programadas a mano en Edge Functions |

## Puntuación (1 = peor, 5 = mejor)

| Criterio | Peso | A | B | C | D |
|---|---|---|---|---|---|
| Funcionalidad para el caso (venta, ERP, soporte, IA) | 15 % | 4 | 3 | 5 | 4 |
| Coste estimado (12 meses) | 12 % | 5 | 2 | 3 | 4 |
| Esfuerzo de implantación | 10 % | 4 | 4 | 2 | 2 |
| Integración con el canal actual | 10 % | 5 | 2 | 2 | 5 |
| Seguridad y control de datos | 10 % | 4 | 3 | 4 | 4 |
| Escalabilidad | 8 % | 3 | 5 | 4 | 3 |
| Mantenimiento | 8 % | 4 | 4 | 3 | 2 |
| Trazabilidad y auditoría | 8 % | 5 | 3 | 4 | 3 |
| Dependencia del proveedor (menos es mejor) | 7 % | 4 | 1 | 3 | 5 |
| Cumplimiento normativo (RGPD, facturación) | 6 % | 3 | 4 | 5 | 3 |
| Facilidad de evolución | 4 % | 4 | 3 | 3 | 4 |
| Adecuación al tamaño de la empresa | 2 % | 5 | 4 | 3 | 4 |
| **Total ponderado (sobre 100)** | **100 %** | **83.6** | **61.2** | **69.6** | **71.8** |

Total = Σ (peso × puntuación) / 5. Los costes son estimaciones de orden de magnitud para un año, no presupuestos:
A y D se pueden mantener en planes gratuitos o de pocos euros al mes en esta fase; B suma tres suscripciones y
comisiones por venta; C requiere licencia por usuario o un servidor propio y consultoría de parametrización.

## Justificación de las puntuaciones más determinantes

- **Integración con el canal actual (A 5, D 5, B 2, C 2).** La tienda ya existe y ya emite los eventos de la Tarea 1.
  A y D los aprovechan tal cual; B y C obligan a migrar la tienda o a construir conectores hacia una plataforma nueva.
- **Coste (A 5, B 2).** A funciona con Supabase, Render y n8n autoalojado en planes gratuitos y la IA se paga por uso
  (céntimos con este volumen). B acumula cuotas mensuales de tres proveedores y comisiones de pasarela.
- **Esfuerzo de implantación (B 4, A 4, C 2, D 2).** En B casi todo es configuración; A requiere diseñar el contrato y los
  flujos, pero n8n aporta webhooks, reintentos, historial y nodos de IA ya hechos. C exige parametrizar un ERP completo y
  D programar todo lo que n8n ya trae (por eso D pierde en mantenimiento).
- **Trazabilidad (A 5).** Cada evento tiene `event_id`, cola con estados y reintentos, log por paso, historial de ejecuciones
  de n8n y registro de cada decisión del agente con su revisión humana.
- **Dependencia del proveedor (D 5, A 4, B 1).** En A los datos están en PostgreSQL estándar, los workflows se exportan en JSON
  y el modelo de IA es intercambiable (el agente no depende de Gemini). En B los datos y la lógica quedan dentro de tres SaaS.
- **Escalabilidad (B 5, C 4, A 3).** A escala bien en datos (PostgreSQL), pero el n8n en un plan gratuito se duerme y tiene
  poca memoria: con más volumen habría que pasar a un plan de pago o a modo cola con workers.
- **Cumplimiento normativo (C 5, B 4, A 3).** Odoo y Shopify traen facturación legal, impuestos y RGPD resueltos; en A la factura
  es un justificante y la parte legal tendría que completarse (o delegarse a un programa de facturación).

## Recomendación

**Alternativa A (arquitectura híbrida), con 83,6 puntos.** Es la que mejor encaja con una empresa pequeña que ya tiene su
canal digital: reutiliza la tienda y sus eventos, mantiene los datos bajo control propio, tiene coste casi nulo en esta fase
y ofrece la trazabilidad y la supervisión humana que exige el uso de IA. La plataforma de flujos evita programar a mano
reintentos, colas, aprobaciones y conectores (lo que hunde a la opción D en esfuerzo y mantenimiento).

**Condiciones y plan de evolución:**
1. Pasar n8n a un plan de pago (o a modo cola) cuando el volumen de pedidos supere lo que aguanta el plan gratuito.
2. Delegar la facturación legal en un software de facturación conectado por el mismo patrón de eventos.
3. Revisar la opción C (Odoo) si la empresa crece hasta necesitar contabilidad, compras y almacén integrados: el contrato
   `entrelibros.event.v1` permitiría sustituir el ERP académico por Odoo sin tocar la tienda.
