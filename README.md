# Entrelibros

Prototipo académico de canal digital de venta: eCommerce de **escenas en miniatura para colocar entre libros** (*book nooks*). Incluye kits completos, accesorios y recambios, con variantes y filtros por temática, dificultad de montaje, dimensiones e iluminación.

**Tarea 1 · Soluciones Informáticas para la Empresa · Grado en Ingeniería Informática (UCAM)**
Autores: Pablo ([@PabloVip](https://github.com/PabloVip)) y Nino Iraci ([@ninoiraci](https://github.com/ninoiraci))

> ⚠️ **Tienda ficticia, sin actividad comercial.** Todos los datos son de prueba. No introduzcas datos personales reales ni tarjetas reales: el pago es con Stripe en modo prueba o simulado, y solo acepta tarjetas de prueba.

| | |
|---|---|
| **Web publicada** | <https://pablovip.github.io/entrelibros/> |
| **Back-office** | <https://pablovip.github.io/entrelibros/admin.html> |
| **Repositorio** | <https://github.com/PabloVip/entrelibros> |

---

## 1. Cómo probarlo (sin instalar nada)

1. Abre la [tienda](https://pablovip.github.io/entrelibros/), filtra el catálogo y entra en una ficha. Si quieres, guarda productos en **Favoritos** con el corazón.
2. Elige una variante (con o sin iluminación) y añádela al carrito.
3. Tramita el pedido con **datos inventados** y, si quieres, un código de descuento.
4. Paga con **Stripe en modo prueba** (te lleva a la página de pago de Stripe) con una tarjeta de prueba, o con la tarjeta simulada o Bizum simulado.
5. Verás la confirmación con el número de pedido (`EL-AAAAMMDD-XXXX`).
6. Opcional: abre una incidencia en **Soporte** indicando ese número y el mismo email.
7. Opcional: crea una cuenta en **Mi cuenta** (recibirás un correo para confirmarla). Con sesión, el checkout se rellena solo y ves tus pedidos e incidencias.
8. Entra en el **back-office**: panel con ventas y alertas, pedidos (cambio de estado), productos (alta, edición, stock, imágenes), clientes, soporte, eventos y ajustes (descuentos, envíos y temáticas).

## 2. Datos y usuarios de prueba

### Tarjetas de prueba de Stripe (modo prueba)
Se escriben en la página de pago de Stripe, con cualquier fecha futura y cualquier CVC. No se cobra nada.

| Número | Resultado |
|---|---|
| `4242 4242 4242 4242` | Pago aprobado |
| `4000 0025 0000 3155` | Pide autenticación 3D Secure (aprobado si se completa) |
| `4000 0000 0000 0002` | Tarjeta rechazada |
| `4000 0000 0000 9995` | Rechazada por fondos insuficientes |

El rechazo lo muestra Stripe en su página: el pedido sigue en `creado` y no se registra ningún pago. Si se cancela, se vuelve a `pago.html` con un aviso.

### Tarjetas del simulador (tarjeta simulada y Bizum)
| Número | Resultado |
|---|---|
| `4242 4242 4242 4242` | Pago aprobado |
| `4000 0000 0000 0002` | Pago rechazado (el pedido sigue en `creado` y se puede reintentar) |
| Cualquier otro número | No se acepta: el simulador nunca admite tarjetas reales |
| *Bizum simulado* | Siempre aprobado, sin pedir datos |

### Códigos de descuento
| Código | Condición |
|---|---|
| `BIENVENIDA10` | 10 % sobre el subtotal |
| `NOOK5` | 5 € de descuento con subtotal ≥ 40 € |
| `OTONO15` | 15 % con subtotal ≥ 80 € (válido del 1/10 al 30/11/2026) |

### Envíos
| Método | Precio | Gratis desde |
|---|---|---|
| Estándar (3-5 días) | 4,95 € | 60 € |
| Exprés 24/48 h | 8,95 € | — |
| Recogida en punto (3-6 días) | 2,95 € | 40 € |

El umbral de envío gratis se aplica sobre el subtotal ya descontado. Los precios llevan el IVA (21 %) incluido; el pedido lo guarda desglosado.

### Clientes ficticios (con pedidos de ejemplo)
`lucia.martin@entrelibros.test`, `javier.ruiz@entrelibros.test`, `marta.sanchez@entrelibros.test`, `carlos.lopez@entrelibros.test`

Para nuevas compras usa cualquier email de prueba, por ejemplo `tu.nombre@example.com`.

### Administrador del back-office
- **Usuario:** `admin@entrelibros.test`
- **Contraseña:** se facilita en la memoria entregada en el Campus Virtual. No se publica aquí porque el repositorio es público.

### Catálogo de prueba
- 6 temáticas y 18 productos (10 kits, 4 accesorios, 4 recambios) con 31 variantes.
- Hay una variante agotada y otras con pocas unidades, para ver los avisos de stock.
- Los recambios y accesorios están enlazados a los kits con los que son compatibles.
- Hay 4 pedidos de ejemplo en distintos estados y 3 incidencias de soporte.

## 3. Arquitectura

```
Navegador ── GitHub Pages (HTML + JavaScript, módulos ES, sin framework)
   │  supabase-js con la clave PÚBLICA (anon / publishable)
   ▼
Supabase · PostgreSQL
   ├─ Tablas ............ supabase/01_schema.sql
   ├─ Seguridad (RLS) ... supabase/02_policies.sql
   ├─ Lógica de negocio . supabase/03_functions.sql, 05_checkout.sql, 06_soporte_admin.sql, 07_favoritos.sql,
   │                      08_admin_catalogo.sql, 10_stripe.sql
   ├─ Edge Functions .... supabase/functions/ (pago con Stripe: crear la sesión, confirmarla y webhook)
   ├─ Imágenes .......... Supabase Storage (bucket "productos", lo crea 08_admin_catalogo.sql)
   └─ Datos de prueba ... supabase/04_seed.sql
```

| Capa | Dónde | Responsabilidad |
|---|---|---|
| Presentación | `public/*.html`, `public/js/pages/`, `public/js/components/` | Pintar pantallas y recoger acciones del usuario |
| Servicios (cliente) | `public/js/services/` | Reglas de interfaz: filtros, carrito, favoritos, validación de formularios, resumen orientativo |
| Acceso a datos | `public/js/repositories/`, `public/js/core/supabase.js` | Consultas y llamadas `rpc` a Supabase |
| Lógica de negocio | Funciones PostgreSQL `SECURITY DEFINER` | Calcular importes, crear pedidos, simular pagos, cambiar estados, registrar eventos |
| Pago con Stripe | Edge Functions (`supabase/functions/`, Deno) | Crear la página de pago de Stripe, confirmar el pago con Stripe y recibir su webhook; son las únicas que tienen las claves secretas |
| Persistencia | PostgreSQL (Supabase) | Datos maestros (catálogo, clientes, envíos, descuentos) y transaccionales (pedidos, líneas, pagos, historial, incidencias, eventos) |

**Decisiones clave**
- **El navegador no decide precios ni totales.** Solo envía `{variant_id, quantity}`. `create_order` vuelve a leer precio y stock de la base de datos y calcula descuento, envío, total e IVA.
- **Row Level Security.** Con la clave pública solo se puede leer el catálogo. Pedidos, clientes, pagos, incidencias y eventos solo los leen los administradores, y nadie puede escribir directamente en las tablas: todas las escrituras pasan por funciones que validan los datos.
- **Las líneas de pedido guardan una "foto"** (nombre, SKU, precio) del momento de la compra: si el catálogo cambia, el pedido no.
- **El pago con Stripe solo se confirma en el servidor.** El navegador nunca marca un pedido como pagado: una Edge Function pregunta a Stripe si la sesión está pagada y llama a `confirm_stripe_payment`, que solo puede ejecutar el servidor. Si llegan la vuelta del cliente y el webhook, el pago se registra una sola vez.
- **El stock se descuenta al aprobar el pago**, con una condición atómica (`stock >= cantidad`). Si alguna línea no llega, el pago se rechaza y no se resta nada.

## 4. Estados del pedido

```
creado ──pago aprobado──▶ pago_simulado ──▶ pendiente_preparacion ──▶ enviado ──▶ entregado
   │                           │                     │                   │            │
   └──▶ cancelado ◀────────────┴─────────────────────┘                   └──▶ incidencia ◀┘
```
El paso de `creado` a `pago_simulado` lo hace el sistema al aprobarse el pago (simulado o con Stripe). Si Stripe cobra pero ya no queda stock, el pedido pasa a `incidencia` para revisarlo. El resto de cambios los hace un administrador desde el back-office. La función `admin_update_order_status` valida cada transición y deja constancia en `order_status_history`. `cancelado` es un estado final.

## 5. Eventos de negocio

| Evento | Cuándo | Origen |
|---|---|---|
| `product.viewed` | Se abre la ficha de un producto | web (`log_event`) |
| `cart.item_added` | Se añade una variante al carrito | web (`log_event`) |
| `checkout.started` | Se abre el checkout con productos | web (`log_event`) |
| `wishlist.item_added` | Se guarda un producto en favoritos | web (`log_event`) |
| `order.created` | `create_order` crea el pedido | servidor |
| `payment.simulated` | `simulate_payment` aprueba o rechaza, o `confirm_stripe_payment` registra un pago de Stripe (`method: stripe_test`) | servidor |
| `support.requested` | `create_support_request` registra la incidencia | servidor |
| `order.status_changed` | Un admin cambia el estado de un pedido | back-office |
| `support.status_changed` | Un admin cambia el estado de una incidencia | back-office |
| `product.created` / `product.updated` / `product.deleted` | Un admin crea, edita o elimina un producto | back-office |
| `product.published` / `product.archived` | Un admin publica o archiva un producto | back-office |
| `stock.adjusted` | Cambia el stock de una variante (desde la ficha o el listado) | back-office |
| `discount.saved` / `shipping_method.saved` / `theme.saved` / `theme.deleted` | Cambios en los ajustes de la tienda | back-office |
| `customer.registered` | Un cliente crea su cuenta | servidor (trigger de Auth) |
| `customer.profile_updated` | Un cliente cambia sus datos en "Mi cuenta" | web (`update_my_profile`) |

- **Dónde se guardan:** en la tabla `events`, un registro de solo inserción, sin claves foráneas a propósito. Cada evento lleva `event_id` (UUID), tipo, fecha, origen, sesión anónima, cliente, pedido, entidad y `payload` JSON.
- **Seguridad:** desde el navegador solo se aceptan los cuatro eventos de navegación, mediante una lista blanca en `log_event`. Los de negocio los emite el propio servidor, así que no se pueden falsificar.
- **Consumo (Tarea 2):**
  - Exportación CSV/JSON desde `admin-eventos.html`.
  - Lectura por API REST de Supabase con un usuario administrador.
  - Un consumidor externo puede leer por `occurred_at` incremental y usar `event_id` para no procesar un evento dos veces.

## 6. Páginas

| Página | Fichero |
|---|---|
| Portada | `index.html` |
| Catálogo con filtros (en la URL, compartibles) | `catalogo.html` |
| Ficha de producto | `producto.html?slug=…` |
| Favoritos (guardados en el navegador) | `favoritos.html` |
| Mi cuenta: entrar, crear cuenta, recuperar contraseña, mis pedidos, mis incidencias y mis datos | `cuenta.html` |
| Política de privacidad (la pide Google para el acceso con Google) | `privacidad.html` |
| Carrito | `carrito.html` |
| Checkout | `checkout.html` |
| Pago: Stripe en modo prueba, tarjeta simulada o Bizum simulado | `pago.html?pedido=…` |
| Confirmación (pide número de pedido + email; al volver de Stripe confirma el pago) | `pedido.html` |
| Soporte postventa | `soporte.html` |
| Back-office: acceso | `admin.html` |
| Back-office: panel (ventas, más vendidos, stock, embudo, últimos pedidos) | `admin-panel.html` |
| Back-office: pedidos y detalle con cambio de estado | `admin-pedidos.html`, `admin-pedido.html?id=…` |
| Back-office: productos (listado, ajuste rápido de stock, archivar/publicar) | `admin-productos.html` |
| Back-office: editor de producto (alta, edición, versiones, imágenes, compatibilidades, textos en inglés, duplicar, eliminar) | `admin-producto.html`, `?id=…`, `?duplicar=…` |
| Back-office: clientes (pedidos, gasto, ticket medio) | `admin-clientes.html` |
| Back-office: soporte y eventos | `admin-soporte.html`, `admin-eventos.html` |
| Back-office: ajustes (códigos de descuento, envíos, temáticas) | `admin-ajustes.html` |

### Back-office de catálogo
- **Todo lo que se guarda pasa por funciones del servidor** (`08_admin_catalogo.sql`): comprueban que quien llama es administrador (`is_admin()`), validan cada dato y registran un evento con el nombre del admin. El navegador valida lo mismo antes de enviar, para avisar sin esperar.
- **Productos con pedidos no se borran:** se archivan (dejan de verse en la tienda, pero los pedidos antiguos siguen apuntando a ellos). Las versiones con pedidos que se quitan del formulario se desactivan en lugar de borrarse.
- **Imágenes:** se pueden subir (se recortan en el navegador a 800×840 y se guardan en Supabase Storage; solo los admins pueden subir) o indicar una dirección `img/…` o `https://…`.
- **Textos en inglés:** cada producto, versión y temática tiene campos opcionales en inglés (`name_en`, `description_en`…). La web en inglés los usa; si faltan, muestra el texto en español.

## 7. Instalación propia

### Base de datos (Supabase)
1. Crea un proyecto en <https://supabase.com>.
2. En **SQL Editor**, ejecuta en este orden:
   1. `01_schema.sql`
   2. `02_policies.sql`
   3. `03_functions.sql`
   4. `05_checkout.sql`
   5. `06_soporte_admin.sql`
   6. `07_favoritos.sql`
   7. `04_seed.sql`
   8. `08_admin_catalogo.sql`
   9. `09_cuentas_clientes.sql`
   10. `10_stripe.sql`

   Todos se pueden volver a ejecutar. `04_seed.sql` deja la tienda con los datos de prueba iniciales; si se vuelve a cargar, hay que ejecutar después `08_admin_catalogo.sql` (rellena los textos en inglés de los productos de ejemplo).
3. En **Project Settings → API**, copia la *Project URL* y la *publishable key* en `public/js/config.js`. Esa clave es pública por diseño; **nunca** pongas la *secret / service_role key* en el front.

### Administrador
1. **Authentication → Users → Add user**, con un email y una contraseña de prueba.
2. En SQL Editor:
   ```sql
   insert into public.admin_users (user_id, display_name)
   select id, 'Admin pruebas' from auth.users where email = 'admin@entrelibros.test'
   on conflict (user_id) do nothing;
   ```
3. En **Authentication → URL Configuration**, pon como *Site URL* la de la web publicada y añade en *Redirect URLs* `https://pablovip.github.io/entrelibros/**` y `http://localhost:8000/**` (los enlaces de los correos vuelven a `cuenta.html`).

### Cuentas de cliente y correos
- **Registro e inicio de sesión** con Supabase Auth (email y contraseña). En **Authentication → Sign In / Providers → Email** deja activado *Confirm email*: la cuenta no se puede usar hasta abrir el enlace del correo.
- **Entrar con Google** (botón en `cuenta.html`): en Google Cloud Console crea un *ID de cliente de OAuth* de tipo *Aplicación web* con el URI de redirección `https://<tu-proyecto>.supabase.co/auth/v1/callback`, y pega el ID y el secreto en **Authentication → Sign In / Providers → Google**. El email de Google ya viene verificado, así que no se envía correo de confirmación; si ese email ya tenía cuenta o pedidos de invitado, se enlazan.
- **Correos en español:** copia las plantillas de `supabase/correos/` en **Authentication → Emails → Templates** (confirmar cuenta y cambiar contraseña).
- **Servidor de correo:** el de Supabase por defecto solo entrega a los emails del equipo del proyecto (Organization → Team) y unos pocos correos por hora. Para la demo basta con invitar al equipo las cuentas que se vayan a usar; para que cualquiera pueda registrarse hay que configurar un SMTP propio (por ejemplo Brevo o Resend, con plan gratuito) en **Authentication → Emails → SMTP Settings**.
- **Qué hace el servidor** (`09_cuentas_clientes.sql`): al registrarse se crea la ficha de cliente o se enlaza con la que ya existía si había comprado como invitado con ese email. Con el email confirmado, RLS deja a cada cliente leer **solo** sus datos, pedidos, líneas, pagos, historial e incidencias. El perfil se cambia con `update_my_profile`.

### Pago con Stripe (modo prueba)
1. Crea una cuenta de Stripe y quédate en **modo prueba** (no hacen falta datos bancarios).
2. En Supabase, **Edge Functions → Secrets**: `STRIPE_SECRET_KEY` (la `sk_test_…`) y `STRIPE_WEBHOOK_SECRET` (paso 4). Las funciones rechazan las claves reales (`sk_live_…`).
3. Despliega las funciones con la CLI: `supabase functions deploy --project-ref <tu-proyecto>`. `supabase/config.toml` indica qué funciones piden JWT (`stripe-webhook` no: Stripe no tiene uno y la función comprueba su firma).
4. En Stripe, **Developers → Webhooks**: endpoint `https://<tu-proyecto>.supabase.co/functions/v1/stripe-webhook` con los eventos `checkout.session.completed` y `checkout.session.async_payment_succeeded`. Copia su *signing secret* (`whsec_…`) en `STRIPE_WEBHOOK_SECRET`.
5. Las direcciones a las que vuelve el cliente están en una lista cerrada en `supabase/functions/_shared/stripe.ts` (la web publicada y `localhost:8000`).

### Ejecutar en local
Los módulos ES necesitan servirse por HTTP; no basta con abrir el fichero:
```bash
python3 -m http.server 8000 -d public
# abrir http://localhost:8000
```

### Despliegue (GitHub Pages)
En el repositorio, ve a **Settings → Pages → Source: GitHub Actions**. El workflow `.github/workflows/pages.yml` publica `public/` en cada push a `main`.

> GitHub Pages guarda los ficheros en caché unos minutos. Tras un despliegue, recarga con **Cmd+Shift+R** (Mac) o **Ctrl+Shift+R** (Windows).

## 8. Limitaciones conocidas

- **Back-office público en cuanto a páginas.** GitHub Pages es estático, así que cualquiera puede abrir `admin*.html`, pero sin una sesión de administrador las políticas RLS no devuelven ningún dato.
- **Sin límite de peticiones.** La API no limita cuántos pedidos o incidencias se pueden crear por minuto. En producción haría falta *rate limiting* o un captcha.
- **Cuenta opcional.** Se puede comprar sin cuenta (solo con el email). Si un email ya existe y se compra como invitado, no se actualizan su nombre ni su teléfono. No hay borrado de cuenta desde la web.
- **Correos de Supabase.** Sin SMTP propio, Supabase solo envía a los emails del equipo del proyecto y con un límite de correos por hora.
- **Pago de pedidos ajenos.** Quien conozca el número de un pedido sin pagar puede pagarlo (simulado o con Stripe).
- **Stripe solo en modo prueba y sin reembolsos.** No se aceptan claves ni sesiones reales. Si Stripe cobra un pedido que ya no tiene stock, o el mismo pedido se paga en dos sesiones, el reembolso habría que hacerlo a mano desde Stripe.
- **Email en la URL.** El email va en la URL de la confirmación (`pedido.html?…&email=…`) y queda en el historial del navegador.
- **Stock sin reservar.** El stock se comprueba al crear el pedido (y antes de abrir la página de Stripe), pero solo se reserva al pagar: dos clientes pueden crear pedidos por las últimas unidades y solo el primero que pague las consigue.
- **Carrito y favoritos locales.** El carrito y la lista de favoritos se guardan en el navegador (`localStorage`) y no se sincronizan entre dispositivos.
- **Traducciones manuales.** Los textos en inglés de productos, versiones y temáticas los escribe el administrador; los códigos de descuento y métodos de envío nuevos se muestran en español también en la web en inglés.
- **Sin notificaciones.** No se envían emails de confirmación ni de seguimiento.
- **Imágenes ilustrativas.** Las de los kits están generadas con IA (Google Gemini) y las de accesorios y recambios son fotos de ambientación de Unsplash. Ninguna muestra un producto real, porque la tienda es ficticia.

## 9. Uso de IA

En el desarrollo se han usado herramientas de IA generativa. El detalle (tareas, errores detectados y cambios hechos por los autores) está en el anexo de la memoria.

## 10. Créditos de las imágenes

- **Kits (10):** imágenes generadas con IA (Google Gemini) a partir de una descripción de cada escena; se declaran en el anexo de IA de la memoria.
- **Accesorios y recambios (8):** fotos de [Unsplash](https://unsplash.com) con la [licencia de Unsplash](https://unsplash.com/license) (uso gratuito sin necesidad de atribución; la incluimos por cortesía).

Todas están recortadas a 800×840 px y comprimidas.

| Producto | Origen |
|---|---|
| Callejón de Kioto en flor | Generada con IA (Google Gemini) |
| Tienda de ramen nocturna | Generada con IA (Google Gemini) |
| Biblioteca infinita | Generada con IA (Google Gemini) |
| Archivo del alquimista | Generada con IA (Google Gemini) |
| Café parisino de 1920 | Generada con IA (Google Gemini) |
| Librería de la esquina bajo la lluvia | Generada con IA (Google Gemini) |
| Bosque de las hadas | Generada con IA (Google Gemini) |
| Torre del dragón | Generada con IA (Google Gemini) |
| Callejón de Praga | Generada con IA (Google Gemini) |
| Despacho del detective victoriano | Generada con IA (Google Gemini) |
| Kit LED USB universal | Foto de Zishan khan en [Unsplash](https://unsplash.com/photos/assorted-colored-led-lights-NHnW3cmrCeo) |
| Set de libros en miniatura | Foto de Alan Cheung en [Unsplash](https://unsplash.com/photos/many-small-open-books-arranged-on-a-wooden-surface-bAOopOtWkbc) |
| Cubierta antipolvo de metacrilato | Foto de T en [Unsplash](https://unsplash.com/photos/diorama-displayed-in-a-framed-box-on-brick-wall-Lj8Cllwi8Tw) |
| Set de pintura y acabados | Foto de Jennie Razumnaya en [Unsplash](https://unsplash.com/photos/a-group-of-brushes-XbcfTH69aAc) |
| Recambio: farolillos de papel | Foto de Leongsan en [Unsplash](https://unsplash.com/photos/four-japanese-lanterns-hanging-in-a-row-MFFkjcTF-i0) |
| Recambio: tira LED 30 cm | Foto de superlightingled en [Unsplash](https://unsplash.com/photos/a-large-group-of-lights-IGPhiyH9t-A) |
| Recambio: ventanas de acetato | Foto de Adrien Olichon en [Unsplash](https://unsplash.com/photos/photo-of-multicolored-glass-mosaic-windowpane-wGXRVgvCVWA) |
| Recambio: piezas pequeñas Callejón de Praga | Foto de Josh Davies en [Unsplash](https://unsplash.com/photos/laser-cut-wooden-pieces-on-a-cardboard-surface-ZgmkmQp62P0) |
