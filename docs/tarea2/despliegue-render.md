# Puesta en marcha de la Tarea 2 (tienda + back-office ERP/CRM + n8n en Render + Telegram + Gemini)

Hay **dos sistemas** y cada uno es un proyecto de Supabase distinto:

| Sistema | Proyecto de Supabase | SQL | Web |
|---|---|---|---|
| Tienda (front-office, Tarea 1) | `entrelibros` | `supabase/01 … 15` | `public/` |
| Back-office ERP/CRM | `entrelibros-erp` | `erp/supabase/01_erp.sql` y `02_orden_eventos.sql` | `erp/web/` (publicada en `/erp/`) |

n8n (Render) es lo único que conecta los dos. Ningún secreto se guarda en el repositorio: las claves van en
Render (variables) o dentro de n8n (credenciales cifradas con `N8N_ENCRYPTION_KEY`).

## 0. Lo que necesitas antes

| Qué | Dónde | Para qué |
|---|---|---|
| Token del bot | Telegram → @BotFather → `/newbot` | Bot de soporte (clientes y revisión humana) |
| Clave de Gemini | aistudio.google.com → *Get API key* | Modelo del agente de IA |
| Secret key de la **tienda** | Proyecto `entrelibros` → Project Settings → API Keys → *Secret keys* | n8n confirma eventos y lee el stock de la tienda |
| Secret key del **ERP** | Proyecto `entrelibros-erp` → Project Settings → API Keys → *Secret keys* | n8n escribe en el back-office |
| Contraseña de la base de datos de la tienda | `entrelibros` → Project Settings → Database | n8n guarda sus propios datos en el esquema `n8n` |
| Session pooler | `entrelibros` → botón **Connect** → *Session pooler* | Host y usuario para `DB_POSTGRESDB_*` |
| Secreto del webhook | Inventado (≥ 24 caracteres aleatorios, sin salto de línea) | Cabecera `X-Entrelibros-Key` entre la tienda y n8n |

## 1. Back-office ERP/CRM (proyecto nuevo)

1. supabase.com → **New project** → nombre `entrelibros-erp` (misma región que la tienda).
2. SQL Editor → ejecuta `erp/supabase/01_erp.sql` y **después** `erp/supabase/02_orden_eventos.sql`
   (si alguna vez vuelves a ejecutar el 01, ejecuta otra vez el 02).
3. Authentication → Users → **Add user** (email y contraseña del personal del back-office) y después, en el SQL Editor:
   ```sql
   insert into public.staff (user_id, email, full_name)
   select id, email, 'Nombre Apellido' from auth.users where email = '<email del personal>';
   ```
4. Project Settings → API: copia la *Project URL* y la *publishable key* en `erp/web/config.js` (no son secretas).

## 2. Tienda (proyecto existente)

1. SQL Editor → ejecuta `supabase/14_integracion.sql` y **después** `supabase/15_backoffice_externo.sql`
   (si alguna vez vuelves a ejecutar el 14, ejecuta otra vez el 15).
2. Database → Extensions: comprueba que **pg_net** y **pg_cron** están activadas.

## 3. n8n en Render

1. Render → **New → Blueprint** → repositorio `PabloVip/entrelibros` (usa `render.yaml`).
2. Variables `sync: false`:
   - `N8N_WEBHOOK_URL`: `https://entrelibros-n8n.onrender.com/` (con `/` final).
   - `DB_POSTGRESDB_HOST`, `DB_POSTGRESDB_USER`, `DB_POSTGRESDB_PASSWORD`: los del *Session pooler* de la tienda.
   - `ENTRELIBROS_SUPABASE_URL`: URL del proyecto de la **tienda**.
   - `ENTRELIBROS_ERP_URL`: URL del proyecto del **ERP**.
   - `ENTRELIBROS_BOT_USERNAME`: usuario del bot sin `@`.
   - `ENTRELIBROS_OPS_CHAT_ID`: `0` de momento (paso 6).
3. Espera al despliegue y crea la cuenta de propietario de n8n.

> El plan gratuito se duerme a los 15 min sin uso y tarda ~1 min en despertar. La cola de la tienda reintenta y
> `pg_cron` llama a `/healthz` cada 10 min para mantenerlo despierto mientras la integración está activada.

## 4. Credenciales en n8n (Overview → Credentials → Create)

| Nombre (exacto) | Tipo | Valor |
|---|---|---|
| `Entrelibros · Supabase (secret key)` | Header Auth | Name `apikey`, Value `sb_secret_…` de la **tienda** |
| `Entrelibros · ERP (secret key)` | Header Auth | Name `apikey`, Value `sb_secret_…` del **ERP** |
| `Entrelibros · Webhook key` | Header Auth | Name `X-Entrelibros-Key`, Value: secreto del webhook |
| `Entrelibros · Telegram bot` | Telegram API | Access Token del bot |
| `Entrelibros · Gemini` | Google Gemini (PaLM) API | API Key de AI Studio |

## 5. Workflows

1. Importa **cada fichero en un workflow nuevo** (Overview → Create → Import from file), en este orden:
   `2-agente-soporte.json`, `1-eventos-erp.json`, `3-bot-telegram.json`, `4-carga-inventario.json`.
2. En **Eventos → Lanzar agente de soporte** elige el workflow del agente (lista desplegable).
3. Asocia en cada nodo la credencial correspondiente (n8n las propone por nombre).
4. En **Agente de soporte → Gemini** comprueba que el modelo existe en tu cuenta; por defecto
   `gemini-3.1-flash-lite` (`gemini-2.5-flash` ya no está disponible para cuentas nuevas).
5. Publica (activa) los cuatro. El 3 registra el webhook del bot en Telegram al activarse: si cambias el token del bot,
   desactívalo y actívalo otra vez.
6. Abre **Carga inicial del inventario** y pulsa *Execute workflow*: el inventario del ERP se llena con el stock de la tienda.

## 6. Chat de revisión (supervisión humana)

1. Escribe al bot `/id`: te responde con tu chat id.
2. Render → Environment → `ENTRELIBROS_OPS_CHAT_ID` = ese número → **Save**.

## 7. Activar el envío desde la tienda

En el SQL Editor de la **tienda**, en una sola línea (sin saltos dentro del secreto):

```sql
select public.integration_configure('https://entrelibros-n8n.onrender.com/webhook/entrelibros/eventos', '<secreto del webhook>', true);
```

## 8. Webs

- `public/js/config.js` → `TELEGRAM_BOT = '<usuario_del_bot>'`.
- `erp/web/config.js` → URL y clave publicable del ERP (paso 1.4).
- Commit + push: GitHub Actions publica la tienda en `/entrelibros/` y el back-office en `/entrelibros/erp/`.

## 9. Comprobación rápida

```bash
# Escenario de error: debe responder 422 y aparecer en el Registro de integración del ERP
curl -i -X POST https://entrelibros-n8n.onrender.com/webhook/entrelibros/eventos \
  -H 'Content-Type: application/json' -H 'X-Entrelibros-Key: <secreto>' \
  --data @docs/tarea2/payloads/4-error-contrato.json
```

Después: compra de prueba en la tienda, cambio de estado y ajuste de stock en su back-office e incidencia con ese
pedido. En la web del ERP (`/entrelibros/erp/`) verás el pedido con su historial, el inventario, el ticket con la nota
del agente y la propuesta; en Telegram, el aviso y los botones para aprobar o rechazar.
