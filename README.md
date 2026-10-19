# Entrelibros

Prototipo académico de canal digital de venta: eCommerce de **escenas en miniatura para colocar entre libros** (*book nooks*). Incluye kits completos, accesorios y recambios, con variantes y filtros por temática, dificultad de montaje, dimensiones e iluminación.

**Tarea 1 · Soluciones Informáticas para la Empresa · Grado en Ingeniería Informática (UCAM)**
Autores: Pablo ([@PabloVip](https://github.com/PabloVip)) y Nino Iraci ([@ninoiraci](https://github.com/ninoiraci))

> ⚠️ **Tienda ficticia, sin actividad comercial.** Todos los datos son de prueba. No introduzcas datos personales reales ni tarjetas reales: el pago es simulado y solo acepta tarjetas de prueba.

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
4. Paga con una **tarjeta de prueba** o con Bizum simulado.
5. Verás la confirmación con el número de pedido (`EL-AAAAMMDD-XXXX`).
6. Opcional: abre una incidencia en **Soporte** indicando ese número y el mismo email.
7. Entra en el **back-office** para ver el pedido, cambiar su estado, gestionar la incidencia y consultar los eventos.

## 2. Datos y usuarios de prueba

### Tarjetas de prueba
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
   ├─ Lógica de negocio . supabase/03_functions.sql, 05_checkout.sql, 06_soporte_admin.sql, 07_favoritos.sql
   └─ Datos de prueba ... supabase/04_seed.sql
```

| Capa | Dónde | Responsabilidad |
|---|---|---|
| Presentación | `public/*.html`, `public/js/pages/`, `public/js/components/` | Pintar pantallas y recoger acciones del usuario |
| Servicios (cliente) | `public/js/services/` | Reglas de interfaz: filtros, carrito, favoritos, validación de formularios, resumen orientativo |
| Acceso a datos | `public/js/repositories/`, `public/js/core/supabase.js` | Consultas y llamadas `rpc` a Supabase |
| Lógica de negocio | Funciones PostgreSQL `SECURITY DEFINER` | Calcular importes, crear pedidos, simular pagos, cambiar estados, registrar eventos |
| Persistencia | PostgreSQL (Supabase) | Datos maestros (catálogo, clientes, envíos, descuentos) y transaccionales (pedidos, líneas, pagos, historial, incidencias, eventos) |

**Decisiones clave**
- **El navegador no decide precios ni totales.** Solo envía `{variant_id, quantity}`. `create_order` vuelve a leer precio y stock de la base de datos y calcula descuento, envío, total e IVA.
- **Row Level Security.** Con la clave pública solo se puede leer el catálogo. Pedidos, clientes, pagos, incidencias y eventos solo los leen los administradores, y nadie puede escribir directamente en las tablas: todas las escrituras pasan por funciones que validan los datos.
- **Las líneas de pedido guardan una "foto"** (nombre, SKU, precio) del momento de la compra: si el catálogo cambia, el pedido no.
- **El stock se descuenta al aprobar el pago**, con una condición atómica (`stock >= cantidad`). Si alguna línea no llega, el pago se rechaza y no se resta nada.

## 4. Estados del pedido

```
creado ──pago aprobado──▶ pago_simulado ──▶ pendiente_preparacion ──▶ enviado ──▶ entregado
   │                           │                     │                   │            │
   └──▶ cancelado ◀────────────┴─────────────────────┘                   └──▶ incidencia ◀┘
```
El paso de `creado` a `pago_simulado` lo hace el sistema al aprobarse el pago. El resto de cambios los hace un administrador desde el back-office. La función `admin_update_order_status` valida cada transición y deja constancia en `order_status_history`. `cancelado` es un estado final.

## 5. Eventos de negocio

| Evento | Cuándo | Origen |
|---|---|---|
| `product.viewed` | Se abre la ficha de un producto | web (`log_event`) |
| `cart.item_added` | Se añade una variante al carrito | web (`log_event`) |
| `checkout.started` | Se abre el checkout con productos | web (`log_event`) |
| `wishlist.item_added` | Se guarda un producto en favoritos | web (`log_event`) |
| `order.created` | `create_order` crea el pedido | servidor |
| `payment.simulated` | `simulate_payment` aprueba o rechaza | servidor |
| `support.requested` | `create_support_request` registra la incidencia | servidor |
| `order.status_changed` | Un admin cambia el estado de un pedido | back-office |
| `support.status_changed` | Un admin cambia el estado de una incidencia | back-office |

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
| Carrito | `carrito.html` |
| Checkout | `checkout.html` |
| Pago simulado | `pago.html?pedido=…` |
| Confirmación (pide número de pedido + email) | `pedido.html` |
| Soporte postventa | `soporte.html` |
| Back-office: acceso, pedidos, detalle, soporte, eventos | `admin.html`, `admin-pedidos.html`, `admin-pedido.html?id=…`, `admin-soporte.html`, `admin-eventos.html` |

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

   Todos se pueden volver a ejecutar. `04_seed.sql` deja la tienda con los datos de prueba iniciales.
3. En **Project Settings → API**, copia la *Project URL* y la *publishable key* en `public/js/config.js`. Esa clave es pública por diseño; **nunca** pongas la *secret / service_role key* en el front.

### Administrador
1. **Authentication → Users → Add user**, con un email y una contraseña de prueba.
2. En SQL Editor:
   ```sql
   insert into public.admin_users (user_id, display_name)
   select id, 'Admin pruebas' from auth.users where email = 'admin@entrelibros.test'
   on conflict (user_id) do nothing;
   ```
3. En **Authentication → URL Configuration**, pon como *Site URL* la de la web publicada.

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
- **Clientes sin cuenta.** Los clientes se identifican solo por email y no hay registro ni inicio de sesión. Si un email ya existe, no se actualizan su nombre ni su teléfono.
- **Pago de pedidos ajenos.** Quien conozca el número de un pedido sin pagar puede simular su pago.
- **Email en la URL.** El email va en la URL de la confirmación (`pedido.html?…&email=…`) y queda en el historial del navegador.
- **Stock sin reservar.** El stock se comprueba al crear el pedido, pero solo se reserva al pagar: dos clientes pueden crear pedidos por las últimas unidades y solo el primero que pague las consigue.
- **Carrito y favoritos locales.** El carrito y la lista de favoritos se guardan en el navegador (`localStorage`) y no se sincronizan entre dispositivos.
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
