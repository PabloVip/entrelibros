# Entrelibros — Guía para Nino

Hola Nino 👋 Aquí tienes todo el contexto de la Tarea 1 y lo que te toca hacer. Léelo entero antes de empezar.

---

## 1. Contexto de la tarea

- **Asignatura:** Soluciones Informáticas para la Empresa (UCAM). Tarea 1: prototipo funcional de canal digital de venta.
- **Negocio (fijado por Antonio):** eCommerce de escenas en miniatura para colocar entre libros (*book nooks*). Catálogo por temática, dificultad de montaje, dimensiones e iluminación; productos con variantes; kits completos, accesorios y recambios.
- **Entrega:** **domingo 25 de octubre a las 23:59** en el Campus Virtual: código (zip), memoria PDF (5-6 páginas + anexo de IA) y enlace al vídeo.
- **Vídeo:** máximo 10 minutos, en YouTube, mínimo 1280×720, sin acelerar. **Los dos tenemos que hablar un tiempo parecido**: si uno no interviene, suspende.
- **Repositorio:** el enunciado exige commits de los dos durante todo el desarrollo. Si el historial muestra poca contribución, se suspende. **Haz commits pequeños y frecuentes con tu cuenta.**

**Web publicada:** https://pablovip.github.io/entrelibros/
**Repositorio:** https://github.com/PabloVip/entrelibros (ya eres colaborador)

---

## 2. Arquitectura

```
Navegador (GitHub Pages, HTML + JS sin framework)
   │  supabase-js con la clave PÚBLICA
   ▼
Supabase (PostgreSQL)
   ├─ Tablas            → supabase/01_schema.sql
   ├─ Seguridad (RLS)   → supabase/02_policies.sql
   ├─ Lógica de negocio → supabase/03_functions.sql  (funciones SQL que se llaman con rpc)
   └─ Datos de prueba   → supabase/04_seed.sql
```

Hay tres ideas clave:

1. **El navegador solo puede LEER el catálogo.** No puede insertar pedidos, pagos ni eventos directamente: RLS lo impide.
2. **Todo lo que escribe va por una función del servidor** (`SECURITY DEFINER`) que valida los datos y recalcula los importes. **Nunca te fíes de precios ni totales que vengan del navegador.**
3. **Capas en el front:**
   - `js/repositories/`: solo acceso a datos (consultas y `rpc`).
   - `js/services/`: reglas y lógica de la interfaz.
   - `js/pages/`: una por página, pinta la pantalla.
   - `js/components/`: piezas reutilizables.

---

## 3. ⚠️ Supabase está en la cuenta de Pablo

**No tienes acceso al panel de Supabase.** Cuando necesites algo en la base de datos (una función nueva, un cambio en una tabla, un permiso):

1. Escríbelo en un fichero SQL **nuevo** dentro del repo, por ejemplo `supabase/05_checkout.sql`. Que se pueda ejecutar varias veces sin romper nada: usa `create or replace function`.
2. Haz commit y push.
3. **Avisa a Pablo** (WhatsApp o lo que uséis) con el nombre del fichero. Él lo ejecuta en el SQL Editor y te confirma.
4. Hasta que Pablo lo ejecute, las llamadas `rpc` a esa función devolverán un error de tipo *function not found*. Es normal.

Más cosas sobre Supabase:
- No modifiques `01`-`04` sin hablarlo con Pablo, porque ya están ejecutados en producción.
- La clave de `public/js/config.js` es la **pública** y no es un secreto. **Nunca** pidas ni uses la *secret key* o la *service_role*.
- La contraseña del admin del back-office te la pasa Pablo **por privado**. No la escribas en el repo, ni en el README, ni en commits.

---

## 4. Puesta en marcha

```bash
git clone https://github.com/PabloVip/entrelibros.git
cd entrelibros
python3 -m http.server 8000 -d public
# abrir http://localhost:8000
```

En local usas la misma base de datos que la web publicada (el catálogo ya tiene datos).

**Forma de trabajar con git:**
- Haz una rama por funcionalidad (`git checkout -b carrito`) y abre un Pull Request para que Pablo lo revise y lo mezcle. Así queda clara la colaboración.
- Antes de empezar cada día: `git pull origin main`.
- Cada push a `main` despliega solo en GitHub Pages en 1-2 minutos.

---

## 5. Lo que ya está hecho (Pablo)

| Qué | Dónde |
|---|---|
| Portada, catálogo con filtros, ficha de producto | `index.html`, `catalogo.html`, `producto.html` |
| Evento `product.viewed` | `js/pages/product.js` |
| Servicio de eventos `track()` | `js/services/eventService.js` |
| Back-office: login, pedidos, detalle, cambio de estado, eventos y exportación | `admin*.html`, `js/pages/admin/` |
| Utilidades: `escapeHtml`, `money`, `param`, `formatDate` | `js/core/utils.js` |
| Cabecera y pie comunes (`renderLayout()`) | `js/core/layout.js` |
| Id de sesión anónimo (`getSessionId()`) | `js/core/session.js` |

El menú ya enlaza a `carrito.html` y `soporte.html`, que **ahora mismo dan 404** hasta que los crees.

---

## 6. Lo que te toca

### 6.1 Carrito — `js/services/cartService.js` + `carrito.html` + `js/pages/cart.js`

La ficha de producto, al pulsar "Añadir al carrito", lanza este evento del navegador:

```js
document.addEventListener('entrelibros:add-to-cart', e => {
  // e.detail = {
  //   variantId, sku, quantity, productId, productSlug, productName,
  //   variantName, unitPrice, image
  // }
});
```

Lo que tiene que hacer `cartService.js`:
- Guardar las líneas en `localStorage`, envuelto en `try/catch` con respaldo en memoria por si el navegador lo bloquea.
- Si la variante ya está en el carrito, sumar la cantidad (máximo 10 por línea).
- Registrar el evento:
  ```js
  track(EVENTS.CART_ITEM_ADDED, { entityType: 'cart', entityId: variantId, payload: { sku, quantity, unit_price } })
  ```
- Mostrar un aviso de "Añadido al carrito" en la ficha (escribe en `#buy-msg`).
- Exportar funciones como `getCart()`, `updateQuantity()`, `removeItem()`, `clearCart()` y `count()`.
- **Importante:** la ficha tiene que importar tu servicio para que el listener exista. Añade en `public/js/pages/product.js`:
  ```js
  import '../services/cartService.js';
  ```
- Opcional: el número de artículos junto a "Carrito" en el menú (`js/core/layout.js`).

`carrito.html` tiene que:
- Listar las líneas con su imagen.
- Permitir cambiar la cantidad y eliminar líneas.
- Mostrar el subtotal.
- Tener un botón "Tramitar pedido" que lleve a `checkout.html`.
- Recargar precio y stock actuales desde `product_variants` por `id`, porque el precio guardado puede haber cambiado. Avisa si algo está agotado.

### 6.2 Checkout — `checkout.html` + `js/pages/checkout.js`

- Al cargar: `track(EVENTS.CHECKOUT_STARTED, { payload: { subtotal, items } })`.
- **Formulario con validación:**
  - Nombre.
  - Email.
  - Teléfono (opcional).
  - Dirección.
  - Ciudad.
  - Código postal (5 dígitos).
  - Provincia.
  - Nota (opcional, máximo 500 caracteres).
- **Método de envío:** se lee de `shipping_methods`, que es público.
- **Código de descuento:** con un botón "Aplicar" que llame a `rpc('validate_discount')`.
- **Resumen:** subtotal, descuento, envío, total e "IVA incluido: X €". Lo que se muestra es orientativo; **el importe que vale es el que devuelve el servidor**.
- **Al enviar:**
  1. Llamar a `rpc('create_order')`.
  2. Vaciar el carrito.
  3. Redirigir a `pago.html?pedido=EL-…`.
- Mostrar el aviso de prototipo: datos ficticios, no reales.

### 6.3 Pago simulado — `pago.html` + `js/pages/payment.js`

- Dos métodos: **tarjeta simulada** y **Bizum simulado**.
- Tarjetas de prueba (muéstralas en la página):
  - `4242 4242 4242 4242` → **aprobado**
  - `4000 0000 0000 0002` → **rechazado**
  - Cualquier otro número → error "Usa una tarjeta de prueba". **Nunca se aceptan tarjetas reales.**
- Al enviar se llama a `rpc('simulate_payment')`.
  - Si se aprueba → `pedido.html?pedido=EL-…&email=…`.
  - Si se rechaza → mensaje y opción de reintentar.

### 6.4 Confirmación — `pedido.html` + `js/pages/order-confirmation.js`

- El navegador **no puede leer** la tabla `orders` (RLS). Usa `rpc('get_order_summary', { p_order_number, p_email })`, que solo devuelve datos si el email coincide.
- Hay que mostrar:
  - Número de pedido.
  - Estado.
  - Líneas e importes.
  - Dirección.
  - Plazo de entrega.
  - Enlace a soporte.

### 6.5 Soporte postventa — `soporte.html` + `js/pages/support.js`

- **Campos del formulario:**
  - Email.
  - Número de pedido (opcional).
  - Motivo: `pieza_faltante`, `pieza_danada`, `retraso_envio`, `duda_montaje` u `otro`.
  - Mensaje (entre 10 y 2000 caracteres).
- Se llama a `rpc('create_support_request')` y se muestra el número de incidencia.
- Opcional, para lucirse: una página `admin-soporte.html` en el back-office para listar incidencias. Primero pídele a Pablo la política RLS de lectura para admins: ya existe, es `admin lee soporte`.

---

## 7. Funciones SQL que tienes que escribir (`supabase/05_checkout.sql`)

Sigue **el mismo patrón** que `admin_update_order_status` en `03_functions.sql`:
- `language plpgsql security definer set search_path = public`.
- Valida **todos** los parámetros y lanza `raise exception '…' using errcode = '22023'` con mensajes en español.
- Registra los eventos con la función interna `public._emit_event(...)`, usando `source = 'servidor'`.
- Al final de cada función: `grant execute on function … to anon, authenticated;`.

### Reglas de cálculo (son las mismas que usan los pedidos de ejemplo del seed)

```
línea          = precio actual de product_variants × cantidad   (cantidad 1..10 y ≤ stock)
subtotal       = Σ líneas                                       (los precios YA llevan IVA)
descuento      = porcentaje   → round(subtotal × valor / 100, 2)
                 importe_fijo → least(valor, subtotal)
                 (código activo, dentro de fechas y subtotal ≥ min_subtotal)
envío          = shipping_methods.price, pero 0 si free_from no es null y (subtotal − descuento) ≥ free_from
total          = subtotal − descuento + envío
IVA desglosado = total − round(total / 1.21, 2)                 (tax_rate = 21)
```

Ejemplo del seed: subtotal 87,80, OTONO15 −13,17, envío gratis (74,63 ≥ 60), total 74,63 e IVA 12,95.

### Firmas propuestas

```sql
-- Devuelve {valid, code, description, discount_amount} o {valid:false, reason}
validate_discount(p_code text, p_subtotal numeric) returns jsonb

-- p_customer: {email, full_name, phone}
-- p_shipping: {name, address, city, postcode, province, notes}
-- p_items:    [{variant_id, quantity}, ...]
-- Devuelve {order_number, total, ...}
create_order(p_customer jsonb, p_shipping jsonb, p_items jsonb,
             p_shipping_code text, p_discount_code text, p_session_id text) returns jsonb

-- p_method: 'tarjeta_simulada' | 'bizum_simulado'
-- Devuelve {status, transaction_ref, failure_reason}
simulate_payment(p_order_number text, p_method text, p_card_number text) returns jsonb

get_order_summary(p_order_number text, p_email text) returns jsonb   -- null si no coincide

-- Devuelve {ticket_number}
create_support_request(p_email text, p_order_number text, p_reason text, p_message text) returns jsonb
```

### Qué debe hacer cada una

**`create_order`**
1. Valida email, código postal y longitudes, y que haya entre 1 y 20 líneas.
2. Busca el cliente por email o lo crea en `customers` (con `is_test = true`).
3. Lee **precio y stock de la BD**: ignora cualquier precio que mande el navegador.
4. Calcula los importes con las reglas de arriba.
5. Genera el número de pedido con el formato `EL-AAAAMMDD-XXXX`, siendo XXXX 4 caracteres alfanuméricos en mayúscula.
6. Inserta en `orders` (estado `creado`) y en `order_items`. Las líneas guardan una copia del nombre, el SKU y el precio.
7. Inserta en `order_status_history` (null → `creado`, `changed_by = 'sistema'`).
8. Emite `order.created` con el payload `{order_number, total, items}`, `order_id` y `customer_id`.

**`simulate_payment`**
- Solo acepta pedidos en estado `creado`.
- Guarda en `payments` el importe del pedido, una `transaction_ref` única tipo `SIM-…` y **solo los 4 últimos dígitos** de la tarjeta.
- **Si se aprueba:**
  - El pedido pasa a `pago_simulado` y se guarda en el historial.
  - **Se descuenta el stock** de cada variante; si no llega, se rechaza con el motivo correspondiente.
- **Si se rechaza:** el pedido sigue en `creado` y se puede reintentar.
- En los dos casos emite `payment.simulated` con `{order_number, method, status, amount}`.

**`get_order_summary`**
- Devuelve el pedido con sus líneas y su último pago **solo si** el email coincide con el del cliente.

**`create_support_request`**
- Valida los campos.
- Si se indica número de pedido, lo enlaza **solo si** el email coincide.
- Genera un número de incidencia `SOP-AAAAMMDD-XXXX`.
- Emite `support.requested`.

Para probar tus funciones en local antes de pasárselas a Pablo, pregúntale. Él puede montarte un Postgres de prueba o ejecutarlas y probarlas contigo.

---

## 8. Normas del código

- Pinta **siempre** los datos con `escapeHtml()` (evita XSS).
- Pon los textos de la interfaz y los comentarios en español.
- Los fallos de eventos no deben romper la compra: `track()` ya no lanza excepciones.
- Nada de datos personales reales. En las pruebas usa emails `@entrelibros.test` o `@example.com`.
- Para confirmar acciones, no uses `alert()` ni `confirm()`: muestra mensajes en la página. Mira cómo lo hace `confirmInline()` en `js/pages/admin/order-detail.js`.
- Haz páginas que funcionen en el móvil. Reutiliza las clases de `css/style.css`: `btn`, `card-form`, `field`, `data-table`, `form-msg`…

---

## 9. Calendario

| Día | Nino | Pablo |
|---|---|---|
| Lun 19 | Carrito + listener en la ficha | Revisa PR; fotos de producto |
| Mar 20 | Checkout (página) + `05_checkout.sql` (`validate_discount`, `create_order`) → **pasar a Pablo** | Ejecuta SQL; revisa |
| Mié 21 | Pago simulado + confirmación (`simulate_payment`, `get_order_summary`) → **pasar a Pablo** | Ejecuta SQL; README |
| Jue 22 | Soporte (`create_support_request`) → **pasar a Pablo**; pruebas | Pruebas de compra completa en la web publicada |
| Vie 23 | Corregir fallos | Corregir fallos |
| Sáb 24 | Memoria (tus secciones) + tu parte del anexo de IA | Memoria (sus secciones) + README final |
| Dom 25 | Diapositivas, **grabación del vídeo juntos**, entrega con margen | Igual |

---

## 10. Memoria y vídeo: tu parte

**Tus secciones de la memoria:**
- Flujo de compra: carrito → checkout → pago → confirmación.
- Cálculo de importes (IVA, envío, descuentos).
- Pago simulado y estados del pedido.
- Soporte postventa.
- Limitaciones y mejoras futuras.

**Pablo escribe:**
- Arquitectura.
- Modelo de datos.
- Seguridad (RLS).
- Catálogo.
- Eventos.
- Back-office.

**Anexo de IA:** si usas IA, apunta en qué tareas la usaste, qué errores detectaste y qué cambiaste tú. Es obligatorio y lo revisan.

**Vídeo (unos 5 minutos cada uno):** tú haces la demo de una compra completa en la web publicada, con el carrito, un código de descuento, un pago rechazado y otro aprobado, la confirmación y una incidencia de soporte. Explica en el código cómo `create_order` recalcula los precios en el servidor. Tienes que demostrar que entiendes el código.

---

## 11. Checklist

- [ ] `cartService.js` + import en `product.js` + evento `cart.item_added`
- [ ] `carrito.html`
- [ ] `checkout.html` + evento `checkout.started`
- [ ] `supabase/05_checkout.sql` → enviado a Pablo y ejecutado
- [ ] `pago.html` con tarjetas de prueba (aprobada y rechazada)
- [ ] `pedido.html` (confirmación)
- [ ] `soporte.html` + evento `support.requested`
- [ ] Compra completa probada en https://pablovip.github.io/entrelibros/ y visible en el back-office
- [ ] Commits propios repartidos durante la semana
- [ ] Secciones de la memoria y anexo de IA
- [ ] Tu parte del vídeo

Cualquier duda, pregunta a Pablo antes de tocar algo que ya esté hecho. ¡Ánimo!
