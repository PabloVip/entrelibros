# Entrelibros — Guía para Nino

Hola Nino 👋 Esta guía está actualizada a **lunes 19 de octubre por la noche**. Tu parte inicial (carrito, checkout, pago simulado, confirmación, soporte y favoritos) ya está terminada y fusionada en `main`. Aquí tienes lo que ha cambiado desde entonces y lo que te queda: **el pago con Stripe**, tu parte de la memoria y el vídeo.

> **Antes de nada:** `git checkout main && git pull`. Hay muchos cambios nuevos en `main` y tienes que partir de ahí.

---

## 1. Contexto de la tarea

- **Asignatura:** Soluciones Informáticas para la Empresa (UCAM). Tarea 1: prototipo funcional de canal digital de venta.
- **Negocio:** eCommerce de *book nooks* (escenas en miniatura para colocar entre libros): kits, accesorios y recambios con variantes; filtros por temática, dificultad, dimensiones e iluminación.
- **Entrega:** **domingo 25 de octubre a las 23:59** en el Campus Virtual: código (zip), memoria PDF con anexo de IA, URL pública, repositorio y vídeo.
- **Vídeo:** máximo 10 minutos, en YouTube, mínimo 1280×720. **Los dos hablamos un tiempo parecido.**
- **Commits:** tienen que verse los de los dos durante toda la semana. Haz commits pequeños con tu cuenta.

**Web:** https://pablovip.github.io/entrelibros/ · **Repositorio:** https://github.com/PabloVip/entrelibros

---

## 2. Cómo está la web ahora

### 2.1 Lo tuyo (hecho ✅)

| Qué | Dónde |
|---|---|
| Carrito | `carrito.html`, `js/pages/cart.js`, `js/services/cartService.js` |
| Checkout con descuentos y envío | `checkout.html`, `js/pages/checkout.js`, `js/services/checkoutService.js` |
| Pago simulado (tarjetas de prueba y Bizum) | `pago.html`, `js/pages/payment.js` |
| Confirmación y consulta de pedido | `pedido.html`, `js/pages/order-confirmation.js` |
| Soporte postventa | `soporte.html`, `js/pages/support.js` |
| Favoritos | `favoritos.html`, `js/services/favoritesService.js`, `js/components/favoriteButton.js` |
| SQL | `supabase/05_checkout.sql`, `supabase/07_favoritos.sql` |

### 2.2 Lo nuevo de Pablo (desde tu última rama)

| Qué | Dónde | Te afecta porque… |
|---|---|---|
| **Web en inglés** (selector ES / EN) | `js/core/i18n.js`, `js/i18n/en.js`, `js/i18n/en-admin.js` | Todo texto nuevo que escribas en español necesita su traducción (ver 4.3) |
| **Back-office profesional**: panel, productos (alta, edición, stock, imágenes), clientes, ajustes (descuentos, envíos, temáticas) | `admin-*.html`, `js/pages/admin/*`, `supabase/08_admin_catalogo.sql` | Los métodos de envío y los códigos de descuento ahora se editan desde el back-office |
| **Cuentas de cliente**: registro con correo de confirmación, login, recuperar contraseña, "Mi cuenta" y **entrar con Google** | `cuenta.html`, `js/pages/account.js`, `js/services/accountService.js`, `supabase/09_cuentas_clientes.sql` | Hay **una línea nueva en tu `checkout.js`** (ver abajo) |
| Política de privacidad | `privacidad.html` | — |

**La línea que se añadió en tu `checkout.js`** (no la borres al hacer Stripe):

```js
import { prefillCheckout } from '../components/checkoutAccount.js';
// …
prefillCheckout(document.getElementById('checkout-form')); // datos de "Mi cuenta" (Pablo)
```

Si el cliente ha iniciado sesión, rellena nombre, email (bloqueado) y teléfono, y el pedido aparece en su "Mi cuenta". Si no, muestra el aviso "¿Tienes cuenta? Entra…".

### 2.3 Base de datos (orden de los SQL)

```
01_schema  02_policies  03_functions  05_checkout  06_soporte_admin  07_favoritos  04_seed  08_admin_catalogo  09_cuentas_clientes
```

Todo esto ya está ejecutado en Supabase. Tu SQL nuevo será `10_stripe.sql` (ver 3.4).

---

## 3. Lo que te toca: pago con Stripe (modo prueba)

Antonio pidió que el pago simulado sea **con Stripe en modo prueba**. Es lo único funcional que queda.

### 3.1 El problema: la web es estática

GitHub Pages no ejecuta código de servidor y Stripe necesita una **clave secreta** (`sk_test_…`) para crear pagos. Esa clave **nunca** puede estar en el navegador ni en el repositorio. La solución es usar **Supabase Edge Functions**: pequeñas funciones de servidor (Deno/TypeScript) que guardan la clave secreta como *secret* de Supabase.

### 3.2 Flujo recomendado: Stripe Checkout (página de pago de Stripe)

```
pago.html ──(1) "Pagar con Stripe"──▶ Edge Function create-checkout-session
                                         · lee el pedido de la BD (importe del servidor, nunca del navegador)
                                         · crea la Checkout Session en Stripe (modo test, EUR)
              ◀──(2) url de Stripe──────
navegador ──(3)──▶ checkout.stripe.com (tarjeta 4242 4242 4242 4242)
          ◀──(4) vuelve a pedido.html?pedido=…&email=…&session_id=cs_test_…
pedido.html ──(5)──▶ Edge Function confirm-checkout-session
                        · pregunta a Stripe si esa sesión está pagada (payment_status = 'paid')
                        · si sí: llama a la función SQL confirm_stripe_payment(...)
```

Así el pago solo se marca como hecho cuando **el servidor lo confirma con Stripe**, no porque el navegador lo diga. Si te da tiempo, añade además un *webhook* (`checkout.session.completed`) que llame a la misma función: así se confirma aunque el cliente cierre la pestaña antes de volver.

### 3.3 Edge Functions (`supabase/functions/`)

- `create-checkout-session/index.ts`
  - Recibe `{ order_number }`.
  - Lee el pedido con el cliente de servidor (dentro de la función existe `SUPABASE_SERVICE_ROLE_KEY`; **solo ahí**, nunca en el front).
  - Solo si está en estado `creado`.
  - Crea la sesión: `mode: 'payment'`, `currency: 'eur'`, una línea con el **total del pedido en céntimos** (`Math.round(total * 100)`), `metadata: { order_number }`, `customer_email`, `success_url` y `cancel_url` (vuelta a `pago.html?pedido=…&cancelado=1`).
  - Devuelve `{ url }`.
- `confirm-checkout-session/index.ts`
  - Recibe `{ session_id }`.
  - Recupera la sesión en Stripe y comprueba `payment_status === 'paid'` y que `amount_total` coincide con el total del pedido.
  - Llama a `confirm_stripe_payment`.
- Las dos con CORS (`Access-Control-Allow-Origin` para `https://pablovip.github.io` y `http://localhost:8000`) y respuesta a `OPTIONS`.

**Claves y despliegue (lo hace Pablo, porque Supabase está en su cuenta):**
1. Tú creas la cuenta de Stripe, activas el **modo de prueba** y le pasas a Pablo **por privado** la `sk_test_…`. Nunca la subas al repositorio ni la pegues en el código.
2. Pablo la guarda en **Supabase → Edge Functions → Secrets** como `STRIPE_SECRET_KEY` y despliega las funciones (desde el editor de Edge Functions del panel o con la CLI).
3. La clave **publicable** (`pk_test_…`) sí puede ir en el front si la necesitas, pero con Stripe Checkout no hace falta.

### 3.4 SQL: `supabase/10_stripe.sql` (pásaselo a Pablo)

- Permitir el método nuevo en `payments`: la restricción `check (method in ('tarjeta_simulada','bizum_simulado'))` tiene que aceptar también `'stripe_test'`.
  ```sql
  alter table public.payments drop constraint if exists payments_method_check;
  alter table public.payments add constraint payments_method_check
    check (method in ('tarjeta_simulada', 'bizum_simulado', 'stripe_test'));
  ```
- `confirm_stripe_payment(p_order_number text, p_session_id text, p_amount numeric)`:
  - Mismo comportamiento que la rama "aprobado" de tu `simulate_payment`: inserta el pago, descuenta stock, pasa el pedido a `pago_simulado`, deja el historial y emite `payment.simulated` con `method: 'stripe_test'`.
  - Guarda en `transaction_ref` el id de la sesión de Stripe. Como es `unique`, si se llama dos veces (vuelta + webhook) no duplica el pago: comprueba primero si ya existe.
  - **Revoca la ejecución a `anon` y `authenticated`**: solo la llaman las Edge Functions con la service role. Si el navegador pudiera llamarla, cualquiera marcaría pedidos como pagados.

### 3.5 Front

- `pago.html`: añade "Pagar con tarjeta (Stripe, modo prueba)". Llama a la Edge Function con `supabase.functions.invoke('create-checkout-session', { body: { order_number } })` y haz `location.href = url`. Decide con Pablo si dejáis también Bizum simulado.
- Muestra las **tarjetas de prueba de Stripe**:
  - `4242 4242 4242 4242`: pago aprobado.
  - `4000 0000 0000 0002`: tarjeta rechazada.
  - `4000 0025 0000 3155`: pide autenticación 3D Secure.
  - Cualquier fecha futura y cualquier CVC.
- `pedido.html`: si llega `session_id`, llama a `confirm-checkout-session`, muestra "Confirmando el pago…" y después el pedido como siempre.
- `cancelado=1` en `pago.html`: mensaje de "Has cancelado el pago, puedes intentarlo de nuevo".
- `METHOD_LABELS` en `js/services/orderService.js`: añade `stripe_test: 'Tarjeta (Stripe, prueba)'` para que el back-office lo muestre bien.

### 3.6 Probarlo

- En local con `python3 -m http.server 8000 -d public` (las Edge Functions están en Supabase, no en local).
- Compra completa: pago aprobado, rechazado, cancelado y 3D Secure.
- Comprueba en el back-office (Pedidos y Eventos) que aparece el pago y que se descontó el stock.
- Comprueba en el **panel de Stripe (modo test)** que el pago aparece con el número de pedido en *metadata*.

---

## 4. Normas (siguen igual, más dos nuevas)

### 4.1 Supabase está en la cuenta de Pablo
- Cada cambio de BD va en un fichero **nuevo** (`10_stripe.sql`), ejecutable varias veces. Commit + aviso a Pablo, que lo ejecuta.
- No modifiques `01`-`09` sin hablarlo.
- **Nunca** uses la *service_role* ni la clave secreta de Stripe en el front ni en el repo. Solo en las Edge Functions, como *secrets*.

### 4.2 Git
- `git pull` antes de empezar; rama `stripe`; Pull Request para que Pablo lo revise y lo fusione.
- Ficheros que también toca Pablo: `js/core/layout.js`, `css/style.css`, `README.md`. Si los cambias, haz cambios pequeños para no pisaros.

### 4.3 Traducciones (nuevo)
- La web se traduce sola con un diccionario. Cada texto nuevo en español que escribas en la interfaz necesita su línea en **`public/js/i18n/en.js`** (es tu fichero; Pablo usa `en-admin.js` para no chocar):
  ```js
  'Pagar con tarjeta (Stripe, modo prueba)': 'Pay by card (Stripe, test mode)',
  ```
- Los textos con partes variables (números, importes) van en `patterns` (mira los ejemplos del final de `en.js`).
- Para comprobarlo: abre la página con `?lang=en`. Si ves algo en español que no es un dato del cliente, falta en el diccionario.

### 4.4 Código (igual que antes)
- Datos siempre con `escapeHtml()`. Textos y comentarios en español. Sin `alert()` ni `confirm()`. Páginas que funcionen en el móvil con las clases de `css/style.css`.
- Datos de prueba: emails `@example.com` o `@entrelibros.test`, nunca tarjetas reales.

---

## 5. Calendario hasta la entrega

| Día | Nino | Pablo |
|---|---|---|
| Mar 20 | Cuenta de Stripe (test); `10_stripe.sql`; `create-checkout-session` | Ejecuta SQL; guarda el secret; despliega la función |
| Mié 21 | `confirm-checkout-session`, `pago.html`, `pedido.html`; traducciones | Despliega; revisa el PR |
| Jue 22 | Pruebas en la web publicada (aprobado, rechazado, cancelado, 3DS); webhook si da tiempo | Pruebas completas; README |
| Vie 23 | Tus secciones de la memoria + tu anexo de IA | Sus secciones; diagrama |
| Sáb 24 | Guion del vídeo y diapositivas (si las hay) | Igual |
| Dom 25 | **Grabación juntos**, revisión y entrega con margen | Igual |

---

## 6. Memoria y vídeo: tu parte

**En la memoria** (Pablo te pasó el `.docx`: tus huecos están en **amarillo**, con un máximo de líneas):
- Flujo de compra: carrito → checkout → pago → confirmación.
- Cálculo de importes (IVA, envío, descuentos) y por qué se recalcula en el servidor.
- **Pago con Stripe en modo prueba**: Edge Functions, por qué la clave secreta no va en el front y cómo se confirma el pago.
- Soporte postventa y favoritos.
- Tu parte del **anexo de IA**: en qué la usaste, qué errores detectaste y qué cambiaste tú.

**Pablo escribe:** arquitectura, modelo de datos, seguridad (RLS), catálogo, eventos, back-office, cuentas de cliente, idioma y despliegue.

**En el vídeo (unos 5 minutos cada uno):** tú haces la compra completa en la web publicada (carrito, código de descuento, pago con Stripe rechazado y aprobado, confirmación e incidencia de soporte) y explicas en el código cómo se recalculan los importes en el servidor y cómo se confirma el pago con Stripe.

---

## 7. Checklist

- [ ] `git pull` de `main` y rama `stripe`
- [ ] Cuenta de Stripe en modo prueba; `sk_test_…` pasada a Pablo por privado
- [ ] `supabase/10_stripe.sql` (método `stripe_test` + `confirm_stripe_payment` solo para el servidor) → ejecutado por Pablo
- [ ] Edge Functions `create-checkout-session` y `confirm-checkout-session` → desplegadas por Pablo
- [ ] `pago.html` con Stripe + tarjetas de prueba; `pedido.html` confirma con `session_id`; mensaje de cancelado
- [ ] `METHOD_LABELS` con `stripe_test`; textos nuevos en `en.js`
- [ ] Pruebas en la web publicada: aprobado, rechazado, cancelado y 3D Secure; visible en el back-office y en Stripe
- [ ] Pull Request revisado y fusionado
- [ ] Tus secciones de la memoria y tu anexo de IA
- [ ] Tu parte del vídeo

Cualquier duda, pregunta a Pablo antes de tocar algo que ya esté hecho. ¡Ánimo, que queda poco! 💪
