# Puesta en marcha de la Tarea 2 (Supabase + n8n en Render + Telegram + Gemini)

Orden recomendado. Ningún secreto se guarda en el repositorio: las claves van en Render (variables)
o dentro de n8n (credenciales cifradas con `N8N_ENCRYPTION_KEY`).

## 0. Lo que necesitas antes

| Qué | Dónde | Para qué |
|---|---|---|
| Token del bot | Telegram → @BotFather → `/newbot` | Bot de soporte (clientes y revisión humana) |
| Clave de Gemini | aistudio.google.com → *Get API key* | Modelo del agente de IA |
| Secret key de Supabase | Supabase → Project Settings → API Keys → *Secret keys* (`sb_secret_…`) | n8n escribe en el ERP |
| Contraseña de la base de datos | Supabase → Project Settings → Database (*Reset database password* si no la tienes) | n8n guarda sus datos en el esquema `n8n` |
| Session pooler | Supabase → botón **Connect** → *Session pooler* | Host y usuario para `DB_POSTGRESDB_*` |
| Secreto del webhook | Inventado (≥ 24 caracteres aleatorios) | Cabecera `X-Entrelibros-Key` entre Supabase y n8n |

## 1. Supabase

1. SQL Editor → ejecuta `supabase/14_integracion.sql`.
2. Database → Extensions: comprueba que **pg_net** y **pg_cron** están activadas (el script lo intenta solo).
3. Todavía **no** ejecutes `integration_configure` (falta la URL de n8n).

## 2. n8n en Render

1. Render → **New → Blueprint** → elige el repositorio `PabloVip/entrelibros` (usa `render.yaml`).
2. Rellena las variables que pide (las de `sync: false`):
   - `N8N_WEBHOOK_URL`: `https://entrelibros-n8n.onrender.com/` (si Render te da otro nombre, usa el tuyo, con `/` final).
   - `DB_POSTGRESDB_HOST`: el host del *Session pooler* (`aws-0-<región>.pooler.supabase.com`).
   - `DB_POSTGRESDB_USER`: `postgres.<ref-del-proyecto>`.
   - `DB_POSTGRESDB_PASSWORD`: la contraseña de la base de datos.
   - `ENTRELIBROS_SUPABASE_URL`: `https://<ref>.supabase.co`.
   - `ENTRELIBROS_BOT_USERNAME`: el usuario del bot sin `@`.
   - `ENTRELIBROS_OPS_CHAT_ID`: pon `0` de momento (se cambia en el paso 5).
3. Espera al primer despliegue (unos minutos) y abre la URL: crea la cuenta de propietario de n8n.

> El plan gratuito se duerme a los 15 min sin uso y tarda ~1 min en despertar. La cola de Supabase reintenta, y
> `pg_cron` llama a `/healthz` cada 10 min para mantenerlo despierto mientras la integración está activada.

## 3. Credenciales en n8n (Overview → Credentials → Create)

| Nombre (exacto) | Tipo | Valor |
|---|---|---|
| `Entrelibros · Supabase (secret key)` | Header Auth | Name `apikey`, Value `sb_secret_…` |
| `Entrelibros · Webhook key` | Header Auth | Name `X-Entrelibros-Key`, Value: tu secreto del webhook |
| `Entrelibros · Telegram bot` | Telegram API | Access Token del bot |
| `Entrelibros · Gemini` | Google Gemini (PaLM) API | API Key de AI Studio |

## 4. Workflows

1. Overview → **Import from file** → importa, por este orden: `n8n/workflows/2-agente-soporte.json`,
   `n8n/workflows/1-eventos-erp.json` y `n8n/workflows/3-bot-telegram.json`.
2. En cada nodo con aviso de credencial, elige la del paso 3 (n8n las asocia por nombre si coinciden).
3. En **Agente de soporte → Gemini** comprueba que el modelo existe en tu cuenta (desplegable); por defecto
   `gemini-2.5-flash`.
4. Activa los tres workflows (interruptor *Active*). El 3 registra el webhook del bot en Telegram al activarse.

## 5. Chat de revisión (supervisión humana)

1. Desde tu Telegram escribe al bot `/id`: te responde con tu chat id.
2. Render → Environment → `ENTRELIBROS_OPS_CHAT_ID` = ese número → **Save** (redepliega solo).

## 6. Activar el envío desde Supabase

```sql
select public.integration_configure(
  'https://entrelibros-n8n.onrender.com/webhook/entrelibros/eventos',
  '<el mismo secreto del webhook>',
  true);
```

## 7. Web

`public/js/config.js` → `TELEGRAM_BOT = '<usuario_del_bot>'` y publica (commit + push).

## 8. Comprobación rápida

```bash
# Escenario de error: debe responder 422 y aparecer en Integración → Cola y log
curl -i -X POST https://entrelibros-n8n.onrender.com/webhook/entrelibros/eventos \
  -H 'Content-Type: application/json' -H 'X-Entrelibros-Key: <secreto>' \
  --data @docs/tarea2/payloads/4-error-contrato.json
```

Después haz una compra de prueba en la tienda, cambia su estado en el back-office y abre una incidencia
con ese pedido: en **Back-office → Integración** verás el pedido en el ERP, la sincronización, la propuesta
del agente y, en Telegram, el mensaje para aprobar o rechazar.
