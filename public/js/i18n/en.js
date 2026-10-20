// Diccionario español → inglés. Lo usa js/core/i18n.js cuando el idioma es inglés.
//
// - exact: textos completos (se comparan sin espacios sobrantes).
// - patterns: textos con partes variables (números, importes, nombres...).
//   Cada patrón recibe la coincidencia y una función tr() para traducir sus partes.
//
// Para añadir un texto nuevo de la web basta con añadir aquí su traducción.

const exact = {
  // ---------- Comunes ----------
  'Prototipo académico': 'Academic prototype',
  'del Grado en Ingeniería Informática (UCAM). Tienda ficticia sin actividad comercial: no introduzcas datos personales reales ni medios de pago reales.':
    'of the Computer Engineering degree (UCAM). Fictitious shop with no commercial activity: do not enter real personal data or real payment details.',
  '· Grado en Ingeniería Informática (UCAM). Tienda ficticia sin actividad comercial: no introduzcas datos personales reales ni medios de pago reales.':
    '· Computer Engineering degree (UCAM). Fictitious shop with no commercial activity: do not enter real personal data or real payment details.',
  'Principal': 'Main',
  'Inicio': 'Home',
  'Catálogo': 'Catalogue',
  'Soporte': 'Support',
  'Carrito': 'Cart',
  'Soporte postventa': 'After-sales support',
  'Migas de pan': 'Breadcrumb',
  'Saltar al contenido': 'Skip to content',
  'Cargando…': 'Loading…',
  'Volver a la tienda': 'Back to the shop',
  '← Volver a la tienda': '← Back to the shop',
  'Volver al catálogo': 'Back to the catalogue',
  'Ver el catálogo': 'Browse the catalogue',
  'Email': 'Email',
  'Total': 'Total',
  'Subtotal': 'Subtotal',
  'Envío': 'Shipping',
  'Gratis': 'Free',
  'Descuento': 'Discount',
  'Resumen': 'Summary',
  'Producto': 'Product',
  'Precio': 'Price',
  'Importe': 'Amount',
  'Acciones': 'Actions',
  'Cantidad': 'Quantity',
  'Referencia': 'Reference',
  'Referencia:': 'Reference:',
  'Tipo': 'Type',
  'Temática': 'Theme',
  'Dificultad': 'Difficulty',
  'Estado': 'Status',
  'Fecha': 'Date',
  'Cliente': 'Customer',
  'Pedido': 'Order',
  'Pedidos': 'Orders',
  'Pago': 'Payment',
  'Eventos': 'Events',
  'Mensaje': 'Message',
  'Motivo': 'Reason',
  'Número de pedido': 'Order number',
  '(opcional)': '(optional)',
  'Revisa los campos marcados.': 'Please check the highlighted fields.',
  'Escribe un email válido.': 'Enter a valid email address.',
  'Enviando…': 'Sending…',
  'Página no encontrada': 'Page not found',
  'La página que buscas no existe o se ha movido.': 'The page you are looking for does not exist or has been moved.',
  'Universal': 'Universal',

  // ---------- Portada ----------
  'Escenas en miniatura para colocar entre tus libros: calles japonesas, bibliotecas, cafeterías y mundos fantásticos.':
    'Miniature scenes to place between your books: Japanese streets, libraries, cafés and fantasy worlds.',
  'Book nook de un callejón de Kioto con cerezos y farolillos, colocado entre libros':
    'Book nook of a Kyoto alley with cherry trees and lanterns, placed between books',
  'Tipos de producto': 'Product types',
  'Un pequeño mundo entre tus libros': 'A tiny world between your books',
  'Kits para montar escenas en miniatura y colocarlas en el hueco de tu estantería: callejones japoneses, bibliotecas infinitas, cafés bajo la lluvia y torres de dragones. Con luz o sin ella.':
    'Kits to build miniature scenes and slot them into the gap on your bookshelf: Japanese alleys, endless libraries, cafés in the rain and dragon towers. With or without lights.',
  'Ver los kits': 'See the kits',
  'Todo el catálogo': 'Full catalogue',
  'Explora por temática': 'Browse by theme',
  'Kits para empezar': 'Kits to get started',
  'Elige por tu estantería': 'Choose by your bookshelf',
  'De 10 a 16 cm': 'From 10 to 16 cm',
  'Es el hueco que ocupa la escena en la balda. Mide el tuyo y filtra por ancho.':
    'That is the gap the scene takes up on the shelf. Measure yours and filter by width.',
  'Kits de hasta 13 cm': 'Kits up to 13 cm',
  'Tres niveles': 'Three levels',
  'De 4 horas de montaje para principiantes a 16 horas para manos con experiencia.':
    'From 4 hours of assembly for beginners to 16 hours for experienced hands.',
  'Con o sin luz': 'With or without lights',
  'Las versiones con LED USB iluminan ventanas y farolas. Las demás admiten el kit LED después.':
    'The USB LED versions light up windows and street lamps. The rest can take the LED kit later.',
  'Ver escenas con luz': 'See lit scenes',
  'Kits completos': 'Complete kits',
  'Todo lo necesario para montar la escena.': 'Everything you need to build the scene.',
  'Accesorios': 'Accessories',
  'Iluminación, cubiertas, libros en miniatura y pintura.': 'Lighting, covers, miniature books and paint.',
  'Recambios': 'Spare parts',
  'Piezas de repuesto para tus kits.': 'Replacement parts for your kits.',
  'Entrelibros · Escenas en miniatura para tu estantería': 'Entrelibros · Miniature scenes for your bookshelf',
  'No se ha podido conectar con la tienda. Inténtalo de nuevo en unos segundos.':
    'Could not connect to the shop. Please try again in a few seconds.',

  // ---------- Catálogo ----------
  'Filtros del catálogo': 'Catalogue filters',
  'Buscar y filtrar': 'Search and filter',
  'Buscar': 'Search',
  'Kioto, dragón…': 'Kyoto, dragon…',
  'Tipo de producto': 'Product type',
  'Todos': 'All',
  'Todas': 'All',
  'Dificultad de montaje': 'Assembly difficulty',
  'Cualquiera': 'Any',
  'Principiante': 'Beginner',
  'Intermedio': 'Intermediate',
  'Avanzado': 'Advanced',
  'Iluminación': 'Lighting',
  'Indiferente': "Don't mind",
  'Disponible con luz': 'Available with lights',
  'Disponible sin luz': 'Available without lights',
  'Ancho máximo (hueco en la estantería)': 'Maximum width (gap on the shelf)',
  'Sin límite': 'No limit',
  'Hasta 11 cm (hueco estrecho)': 'Up to 11 cm (narrow gap)',
  'Hasta 13 cm': 'Up to 13 cm',
  'Hasta 15 cm': 'Up to 15 cm',
  'Precio máximo (€)': 'Maximum price (€)',
  'Quitar filtros': 'Clear filters',
  'Ordenar por': 'Sort by',
  'Destacados': 'Featured',
  'Precio: menor a mayor': 'Price: low to high',
  'Precio: mayor a menor': 'Price: high to low',
  'Nombre (A-Z)': 'Name (A-Z)',
  'Novedades': 'Newest',
  'No hay productos con estos filtros. Prueba a quitar alguno.': 'No products match these filters. Try removing some.',
  'No se ha podido cargar el catálogo. Inténtalo de nuevo en unos segundos.':
    'Could not load the catalogue. Please try again in a few seconds.',
  'Kit completo': 'Complete kit',
  'Accesorio': 'Accessory',
  'Recambio': 'Spare part',
  'Con iluminación': 'With lights',
  'Sin iluminación': 'No lights',
  'Agotado': 'Sold out',
  'Agotado.': 'Sold out.',

  // ---------- Ficha de producto ----------
  'Cargando producto…': 'Loading product…',
  'Producto': 'Product',
  'IVA incluido · gastos de envío calculados en el checkout': 'VAT included · shipping calculated at checkout',
  'Elige versión': 'Choose a version',
  'En stock · envío en 24-48 h': 'In stock · ships in 24-48 h',
  'Añadir al carrito': 'Add to cart',
  'Descripción': 'Description',
  'Características': 'Features',
  'Dimensiones (an × al × fo)': 'Dimensions (w × h × d)',
  'Número de piezas': 'Number of pieces',
  'Tiempo de montaje': 'Assembly time',
  'Compatible con estos kits': 'Compatible with these kits',
  'Accesorios y recambios compatibles': 'Compatible accessories and spare parts',
  'Producto no encontrado': 'Product not found',
  'Puede que ya no esté disponible.': 'It may no longer be available.',
  'No se ha podido cargar el producto. Inténtalo de nuevo.': 'Could not load the product. Please try again.',
  'Ver carrito': 'View cart',
  'No se ha podido añadir al carrito. Recarga la página e inténtalo de nuevo.':
    'Could not add to the cart. Reload the page and try again.',
  'Ya no está a la venta.': 'No longer for sale.',
  'Esta versión está agotada.': 'This version is sold out.',
  'Quitar una unidad': 'Remove one',
  'Añadir una unidad': 'Add one',

  // ---------- Carrito ----------
  'Tu carrito': 'Your cart',
  'Cargando carrito…': 'Loading cart…',
  'Resumen del carrito': 'Cart summary',
  'Productos del carrito': 'Products in the cart',
  'Uds.': 'Qty',
  'Eliminar': 'Remove',
  'IVA incluido. Los gastos de envío y los descuentos se calculan en el checkout.':
    'VAT included. Shipping and discounts are calculated at checkout.',
  'Tramitar pedido': 'Checkout',
  'Seguir comprando': 'Continue shopping',
  'Tu carrito está vacío.': 'Your cart is empty.',
  'Envío gratis': 'Free shipping',
  'Se cuenta el importe después de aplicar los descuentos.': 'Counted on the amount after discounts.',
  'No se ha podido comprobar el precio y el stock del carrito. Inténtalo de nuevo en unos segundos.':
    'Could not check the prices and stock of your cart. Please try again in a few seconds.',

  // ---------- Favoritos ----------
  'Favoritos': 'Favourites',
  'Tus favoritos': 'Your favourites',
  'Los productos que has guardado con el corazón. Se guardan en este navegador, sin necesidad de cuenta.':
    'The products you have saved with the heart. They are stored in this browser, no account needed.',
  'Cargando favoritos…': 'Loading favourites…',
  'Todavía no has guardado ningún producto. Pulsa el corazón de cualquier producto para guardarlo aquí.':
    'You have not saved any products yet. Press the heart on any product to save it here.',
  'Hemos quitado de tu lista 1 producto que ya no está a la venta.':
    'We removed 1 product from your list because it is no longer for sale.',
  'No se han podido cargar tus favoritos. Inténtalo de nuevo en unos segundos.':
    'Could not load your favourites. Please try again in a few seconds.',
  'Guardado en tus favoritos.': 'Saved to your favourites.',
  'Ver favoritos': 'View favourites',
  'Quitado de tus favoritos.': 'Removed from your favourites.',

  // ---------- Checkout ----------
  '← Volver al carrito': '← Back to the cart',
  'Datos ficticios:': 'Fictitious data:',
  'esto es un prototipo y el pedido no es real. Usa un nombre inventado y un email de prueba (por ejemplo,':
    'this is a prototype and the order is not real. Use a made-up name and a test email (for example,',
  'tu.nombre@example.com': 'your.name@example.com',
  'Resumen del pedido': 'Order summary',
  'Tus datos': 'Your details',
  'Nombre y apellidos': 'Full name',
  'Teléfono': 'Phone',
  'Dirección de envío': 'Shipping address',
  'Dirección': 'Address',
  'Código postal': 'Postcode',
  'Ciudad': 'City',
  'Provincia': 'Province',
  'Nota para el pedido': 'Order note',
  'Método de envío': 'Shipping method',
  'Código de descuento': 'Discount code',
  'Aplicar': 'Apply',
  'Quitar': 'Remove',
  'Confirmar pedido': 'Place order',
  'Importes orientativos: el importe final lo calcula el servidor con los precios actuales.':
    'Approximate amounts: the final amount is calculated by the server with current prices.',
  'Creando el pedido…': 'Creating your order…',
  'Escribe un código.': 'Enter a code.',
  'Pulsa "Aplicar" para usar este código o bórralo.': 'Press "Apply" to use this code, or delete it.',
  'Revisar el carrito': 'Review the cart',
  'sin métodos de envío': 'no shipping methods',
  'Algunos productos de tu carrito ya no están disponibles o no hay stock suficiente.':
    'Some products in your cart are no longer available or there is not enough stock.',
  'La tienda todavía no acepta pedidos: falta activar la función en el servidor.':
    'The shop does not accept orders yet: the function still has to be enabled on the server.',
  'No se ha podido cargar el checkout. Inténtalo de nuevo en unos segundos.':
    'Could not load the checkout. Please try again in a few seconds.',
  'No se ha podido comprobar el código. Inténtalo de nuevo.': 'Could not check the code. Please try again.',
  'No se ha podido crear el pedido. Revisa tu conexión e inténtalo de nuevo.':
    'Could not create the order. Check your connection and try again.',
  'Escribe tu nombre (entre 2 y 100 caracteres).': 'Enter your name (between 2 and 100 characters).',
  'Escribe la dirección (calle, número, piso).': 'Enter the address (street, number, floor).',
  'Escribe la ciudad.': 'Enter the city.',
  'Escribe la provincia.': 'Enter the province.',
  'El código postal tiene 5 dígitos.': 'The postcode has 5 digits.',
  'El teléfono solo puede llevar números, espacios y + ( ) -.': 'The phone number can only contain digits, spaces and + ( ) -.',
  'La nota no puede superar los 500 caracteres.': 'The note cannot exceed 500 characters.',

  // ---------- Pago ----------
  'Pago simulado:': 'Simulated payment:',
  'no se cobra nada y no se aceptan tarjetas reales. Usa una de estas tarjetas de prueba:':
    'nothing is charged and real cards are not accepted. Use one of these test cards:',
  '→ aprobada': '→ approved',
  '→ rechazada': '→ declined',
  'Usar': 'Use',
  'Método de pago': 'Payment method',
  'Tarjeta (simulada)': 'Card (simulated)',
  'Bizum (simulado)': 'Bizum (simulated)',
  'Siempre se aprueba; no hace falta ningún dato.': 'Always approved; no details needed.',
  'Número de tarjeta de prueba': 'Test card number',
  'Pagar': 'Pay',
  'Usa una tarjeta de prueba de las indicadas arriba.': 'Use one of the test cards listed above.',
  'Procesando el pago…': 'Processing payment…',
  'motivo desconocido': 'unknown reason',
  'Falta el número de pedido o no es válido.': 'The order number is missing or not valid.',
  'Ir al carrito': 'Go to the cart',
  'Ver el pedido': 'View the order',
  'El pago todavía no está disponible: falta activar la función en el servidor.':
    'Payment is not available yet: the function still has to be enabled on the server.',
  'No se ha podido procesar el pago. Revisa tu conexión e inténtalo de nuevo.':
    'Could not process the payment. Check your connection and try again.',
  // pago con Stripe
  'Has cancelado el pago en Stripe: no se ha cobrado nada. Puedes intentarlo de nuevo.':
    'You cancelled the payment on Stripe: nothing has been charged. You can try again.',
  'Pago con Stripe en modo prueba:': 'Stripe payment in test mode:',
  'no se cobra nada. En la página de Stripe usa una de estas tarjetas, con cualquier fecha futura y cualquier CVC:':
    'nothing is charged. On the Stripe page use one of these cards, with any future expiry date and any CVC:',
  '→ pide autenticación 3D Secure': '→ asks for 3D Secure authentication',
  'Tarjeta con Stripe (modo prueba)': 'Card with Stripe (test mode)',
  'Te llevamos a la página de pago de Stripe.': 'We will take you to the Stripe payment page.',
  'Pagar con Stripe': 'Pay with Stripe',
  'Te llevamos a la página de pago de Stripe…': 'Taking you to the Stripe payment page…',
  'El pago con Stripe todavía no está disponible: falta activarlo en el servidor. Mientras tanto puedes pagar con la tarjeta simulada o con Bizum.':
    'Payment with Stripe is not available yet: it still has to be enabled on the server. Meanwhile you can pay with the simulated card or with Bizum.',
  'No se ha podido conectar con Stripe. Revisa tu conexión e inténtalo de nuevo.':
    'Could not connect to Stripe. Check your connection and try again.',
  'Este pedido ya está pagado o no admite pagos.': 'This order is already paid or does not accept payments.',

  // ---------- Confirmación / consulta de pedido ----------
  'Cargando pedido…': 'Loading order…',
  'Tu pedido': 'Your order',
  '¡Gracias! Tu pedido está confirmado': 'Thank you! Your order is confirmed',
  'Pedido pendiente de pago': 'Order awaiting payment',
  'Este pedido todavía no está pagado.': 'This order has not been paid yet.',
  'Ir al pago': 'Go to payment',
  'Productos del pedido': 'Products in the order',
  'IVA incluido (21 %)': 'VAT included (21%)',
  'Entrega estimada:': 'Estimated delivery:',
  'Sin pagos todavía.': 'No payments yet.',
  '¿Algún problema?': 'Any problem?',
  'Contacta con soporte': 'Contact support',
  'indicando tu número de pedido.': 'quoting your order number.',
  'Consulta tu pedido': 'Look up your order',
  'Email del pedido': 'Order email',
  'Ver pedido': 'View order',
  'Escribe el número de pedido (EL-AAAAMMDD-XXXX) y un email válido.': 'Enter the order number (EL-YYYYMMDD-XXXX) and a valid email.',
  'No encontramos ningún pedido con ese número y ese email.': 'We could not find an order with that number and email.',
  'La consulta de pedidos todavía no está disponible: falta activar la función en el servidor.':
    'Order lookup is not available yet: the function still has to be enabled on the server.',
  'No se ha podido cargar el pedido. Inténtalo de nuevo en unos segundos.':
    'Could not load the order. Please try again in a few seconds.',

  // ---------- Soporte ----------
  '¿Te falta una pieza, ha llegado algo dañado o tienes dudas con el montaje? Cuéntanoslo.':
    'Missing a piece, something arrived damaged or have questions about assembly? Tell us.',
  'Solo se asocia a la incidencia si coincide con el email del pedido.': 'It is only linked to the request if it matches the order email.',
  'y podrás elegir el pedido de tu lista.': 'and you can pick the order from your list.',
  'Es el email de tu cuenta.': 'This is your account email.',
  'Tus pedidos aparecen al pulsar en el campo.': 'Your orders appear when you select the field.',
  // preguntas frecuentes
  'Preguntas frecuentes': 'Frequently asked questions',
  'Me falta una pieza o ha llegado rota': 'A piece is missing or arrived broken',
  'Revisa primero todas las láminas y bolsas de la caja: las piezas pequeñas suelen ir aparte.':
    'First check every sheet and bag in the box: small pieces usually come separately.',
  'Si sigue faltando o está dañada, abre una incidencia con tu número de pedido y el nombre de la pieza en la hoja de montaje: te la enviamos sin coste.':
    'If it is still missing or is damaged, open a request with your order number and the name of the piece on the assembly sheet: we will send it to you free of charge.',
  'Si se ha perdido o roto durante el montaje, tienes piezas de repuesto en los recambios.':
    'If it was lost or broken during assembly, you will find replacements among the spare parts.',
  'Avisar de una pieza que falta': 'Report a missing piece',
  'Avisar de una pieza dañada': 'Report a damaged piece',
  'Ver recambios': 'See spare parts',
  '¿Cuándo llega mi pedido?': 'When will my order arrive?',
  'Depende del método de envío que elegiste. La fecha estimada aparece en la confirmación del pedido.':
    'It depends on the shipping method you chose. The estimated date is shown on the order confirmation.',
  'Si ya ha pasado esa fecha y no ha llegado, avísanos.': 'If that date has passed and it has not arrived, let us know.',
  'Consultar mi pedido': 'Check my order',
  'Avisar de un retraso': 'Report a delay',
  'Tengo dudas con el montaje': 'I have questions about assembly',
  'En la ficha de cada kit verás la dificultad, el número de piezas y el tiempo de montaje aproximado.':
    "Each kit's page shows the difficulty, the number of pieces and the approximate assembly time.",
  'Si te atascas, cuéntanos en qué paso de las instrucciones estás y qué pieza no encaja.':
    'If you get stuck, tell us which step of the instructions you are on and which piece does not fit.',
  'Preguntar una duda de montaje': 'Ask an assembly question',
  '¿Puedo añadir luz a un kit sin iluminación?': 'Can I add lights to a kit without lighting?',
  'Sí: el kit LED USB universal es compatible con cualquier kit sin iluminación y se oculta en el techo de la escena.':
    'Yes: the universal USB LED kit works with any kit without lighting and hides in the ceiling of the scene.',
  'Ver el kit LED': 'See the LED kit',
  'Elige un motivo…': 'Choose a reason…',
  'Falta una pieza': 'A piece is missing',
  'Pieza dañada o rota': 'Damaged or broken piece',
  'Mi pedido no llega': 'My order has not arrived',
  'Duda con el montaje': 'Assembly question',
  'Otro motivo': 'Other reason',
  'Enviar incidencia': 'Send request',
  'Elige un motivo.': 'Choose a reason.',
  'El número de pedido tiene el formato EL-AAAAMMDD-XXXX (o déjalo vacío).':
    'The order number has the format EL-YYYYMMDD-XXXX (or leave it empty).',
  'Incidencia registrada': 'Request received',
  'Tu número de incidencia es': 'Your request number is',
  '. Guárdalo para cualquier consulta.': '. Keep it for any follow-up.',
  'La hemos asociado al pedido': 'We have linked it to order',
  'Es un prototipo: nadie va a contestar, pero la incidencia queda guardada y visible en el back-office.':
    'This is a prototype: nobody will reply, but the request is saved and visible in the back-office.',
  'El soporte todavía no está disponible: falta activar la función en el servidor.':
    'Support is not available yet: the function still has to be enabled on the server.',
  'No se ha podido enviar la incidencia. Revisa tu conexión e inténtalo de nuevo.':
    'Could not send the request. Check your connection and try again.',

  // ---------- Estados ----------
  'Creado': 'Created',
  'Pagado (simulado)': 'Paid (simulated)',
  'Pendiente de preparación': 'Awaiting preparation',
  'Enviado': 'Shipped',
  'Entregado': 'Delivered',
  'Cancelado': 'Cancelled',
  'Incidencia': 'Issue',
  'Aprobado': 'Approved',
  'Rechazado': 'Declined',
  'Pendiente': 'Pending',
  'Abierta': 'Open',
  'En curso': 'In progress',
  'Resuelta': 'Resolved',
  'Atender': 'Take on',
  'Marcar resuelta': 'Mark resolved',
  'Reabrir': 'Reopen',

  // ---------- Back-office ----------
  'Back-office': 'Back-office',
  'Acceso solo para administradores de la tienda.': 'Access for shop administrators only.',
  'Contraseña': 'Password',
  'Entrar': 'Sign in',
  'Acceso': 'Sign in',
  'Introduce un email válido y la contraseña (mínimo 6 caracteres).': 'Enter a valid email and the password (at least 6 characters).',
  'Email o contraseña incorrectos.': 'Incorrect email or password.',
  'Este usuario no tiene permisos de administración.': 'This user does not have admin permissions.',
  'Ver tienda': 'View shop',
  'Cerrar sesión': 'Sign out',
  'Nº de pedido o email': 'Order no. or email',
  'Artículos': 'Items',
  'Por preparar': 'To prepare',
  'Pedidos con incidencia': 'Orders with issues',
  'Soporte pendiente': 'Pending support',
  'Facturado (simulado)': 'Revenue (simulated)',
  'No hay pedidos con estos filtros.': 'No orders match these filters.',
  'No se han podido cargar los pedidos.': 'Could not load the orders.',
  'Líneas del pedido': 'Order lines',
  'Cambiar estado': 'Change status',
  'Nuevo estado': 'New status',
  'Nota interna (opcional)': 'Internal note (optional)',
  'p. ej. nº de seguimiento': 'e.g. tracking number',
  'Guardar estado': 'Save status',
  'Nota del cliente:': 'Customer note:',
  'Pagos simulados': 'Simulated payments',
  'Sin pagos registrados.': 'No payments recorded.',
  'Historial de estados': 'Status history',
  'Incidencias de soporte': 'Support requests',
  'Sin incidencias de soporte.': 'No support requests.',
  'Ver todas en Soporte →': 'See all in Support →',
  'Eventos del pedido': 'Order events',
  'Sin eventos asociados.': 'No related events.',
  'Ver en el registro de eventos →': 'See in the event log →',
  'Pedido no encontrado.': 'Order not found.',
  'No se ha podido cargar el pedido.': 'Could not load the order.',
  '¿Seguro? Cancelar es definitivo. Pulsa de nuevo para confirmar.': 'Are you sure? Cancelling is final. Press again to confirm.',
  'Estado final: no admite más cambios.': 'Final status: no further changes allowed.',
  'sistema': 'system',
  'servidor': 'server',
  'Admin pruebas': 'Test admin',
  'Incidencias que envían los clientes desde la página de soporte.': 'Requests sent by customers from the support page.',
  'Pendientes (abiertas y en curso)': 'Pending (open and in progress)',
  'Abiertas': 'Open',
  'Resueltas': 'Resolved',
  'No hay incidencias con estos filtros.': 'No requests match these filters.',
  'No se han podido cargar las incidencias.': 'Could not load the support requests.',
  'Eventos de negocio': 'Business events',
  'Registro de lo que ocurre en el proceso de compra. Se puede exportar para analizarlo o integrarlo con otros sistemas.':
    'A log of what happens during the purchase process. It can be exported for analysis or integration with other systems.',
  'Embudo': 'Funnel',
  'Desde': 'From',
  'Hasta': 'To',
  'Id de pedido': 'Order id',
  'Exportar CSV': 'Export CSV',
  'Exportar JSON': 'Export JSON',
  'Origen': 'Source',
  'Entidad': 'Entity',
  'Sesión': 'Session',
  'Datos': 'Data',
  'No hay eventos con estos filtros.': 'No events match these filters.',
  'No se han podido cargar los eventos.': 'Could not load the events.',

  // ---------- Datos de la tienda (Supabase) ----------
  // temáticas
  'Calles japonesas': 'Japanese streets',
  'Callejones con farolillos, tiendas de ramen y cerezos en flor.': 'Alleys with lanterns, ramen shops and cherry blossoms.',
  'Bibliotecas mágicas': 'Magical libraries',
  'Pasillos infinitos de estanterías, escaleras y archivos secretos.': 'Endless aisles of shelves, ladders and secret archives.',
  'Cafeterías y tiendas': 'Cafés and shops',
  'Rincones acogedores: cafés, librerías y escaparates en días de lluvia.': 'Cosy corners: cafés, bookshops and shop windows on rainy days.',
  'Mundos fantásticos': 'Fantasy worlds',
  'Bosques encantados, torres y criaturas legendarias.': 'Enchanted forests, towers and legendary creatures.',
  'Callejones europeos': 'European alleys',
  'Calles empedradas de ciudades históricas.': 'Cobbled streets of historic cities.',
  'Misterio y época': 'Mystery and period',
  'Despachos victorianos, niebla y casos por resolver.': 'Victorian studies, fog and cases to solve.',

  // productos: nombre
  'Callejón de Kioto en flor': 'Kyoto Alley in Bloom',
  'Tienda de ramen nocturna': 'Late-Night Ramen Shop',
  'Archivo del alquimista': "The Alchemist's Archive",
  'Biblioteca infinita': 'Endless Library',
  'Librería de la esquina bajo la lluvia': 'Corner Bookshop in the Rain',
  'Café parisino de 1920': '1920s Parisian Café',
  'Torre del dragón': "Dragon's Tower",
  'Bosque de las hadas': 'Fairy Forest',
  'Callejón de Praga': 'Prague Alley',
  'Despacho del detective victoriano': "Victorian Detective's Study",
  'Kit LED USB universal': 'Universal USB LED kit',
  'Cubierta antipolvo de metacrilato': 'Acrylic dust cover',
  'Set de libros en miniatura': 'Miniature book set',
  'Set de pintura y acabados': 'Paint and finishing set',
  'Recambio: farolillos de papel': 'Spare part: paper lanterns',
  'Recambio: piezas pequeñas Callejón de Praga': 'Spare part: Prague Alley small pieces',
  'Recambio: ventanas de acetato': 'Spare part: acetate windows',
  'Recambio: tira LED 30 cm': 'Spare part: 30 cm LED strip',

  // productos: descripción corta
  'Pack de 6 farolillos de papel con armazón para las escenas japonesas.': 'Pack of 6 framed paper lanterns for the Japanese scenes.',
  'Puesto de ramen de madrugada con letreros luminosos y vapor de cocina.': 'A small-hours ramen stall with glowing signs and kitchen steam.',
  'Un estrecho callejón de Kioto con cerezos, farolillos de papel y una casa de té.': 'A narrow Kyoto alley with cherry trees, paper lanterns and a tea house.',
  'Estudio de un alquimista con pergaminos, frascos y un globo celeste.': "An alchemist's study with scrolls, flasks and a celestial globe.",
  'Pasillo de estanterías que parece no tener fin gracias a un efecto espejo.': 'An aisle of shelves that seems endless thanks to a mirror effect.',
  'Escaparate de una librería con charcos, paraguas y luz cálida en las ventanas.': 'A bookshop window with puddles, umbrellas and warm light in the windows.',
  'Terraza de un café de París con toldo a rayas y mesas de mármol.': 'A Paris café terrace with a striped awning and marble tables.',
  'Escalera de caracol que asciende hacia la guarida de un dragón dormido.': "A spiral staircase climbing to a sleeping dragon's lair.",
  'Sendero entre árboles retorcidos, setas y pequeñas casas de hadas.': 'A path between twisted trees, mushrooms and little fairy houses.',
  'Plancha con farolas, balcones y piezas pequeñas del Callejón de Praga.': 'A sheet with street lamps, balconies and small pieces of the Prague Alley.',
  'Calle empedrada con fachadas de colores, farolas de hierro y un reloj astronómico.': 'A cobbled street with colourful façades, iron street lamps and an astronomical clock.',
  'Despacho londinense con chimenea, violín y pistas sobre el escritorio.': 'A London study with a fireplace, a violin and clues on the desk.',
  'Lámina de acetato precortada para ventanas y escaparates.': 'Pre-cut acetate sheet for windows and shop fronts.',
  'Tira LED de repuesto para los kits con iluminación.': 'Replacement LED strip for the lit kits.',
  'Acrílicos, pinceles finos y barniz para personalizar tus kits.': 'Acrylics, fine brushes and varnish to customise your kits.',
  'Frontal transparente que protege la escena del polvo sin ocultarla.': 'A clear front that protects the scene from dust without hiding it.',
  'Libros impresos a escala 1:24 para rellenar estanterías.': 'Printed 1:24 scale books to fill shelves.',
  'Ilumina cualquier escena: tira LED adhesiva con interruptor y cable USB.': 'Lights up any scene: adhesive LED strip with switch and USB cable.',

  // productos: descripción larga
  'Seis farolillos de papel de arroz con armazón de madera, iguales a los incluidos en los kits de calles japonesas.':
    'Six rice-paper lanterns with wooden frames, identical to those included in the Japanese street kits.',
  'Una calle de Tokio de madrugada: el puesto de ramen con su cortina noren, letreros en neón, máquinas expendedoras y cables cruzando el cielo. Diseñado para iluminarse: todas sus variantes incluyen LED.':
    'A Tokyo street in the small hours: the ramen stall with its noren curtain, neon signs, vending machines and cables crossing the sky. Designed to glow: every version includes LEDs.',
  'Recrea un callejón del barrio de Gion entre tus libros: fachadas de madera, cerezos en flor, farolillos de papel y una pequeña casa de té con la puerta entreabierta. Piezas de contrachapado cortadas con láser que encajan sin cola, más detalles en papel y resina.':
    'Recreate an alley of the Gion district between your books: wooden façades, cherry blossoms, paper lanterns and a little tea house with its door ajar. Laser-cut plywood pieces that fit together without glue, plus paper and resin details.',
  'Estanterías repletas de frascos, pergaminos y grimorios alrededor de una mesa de trabajo con globo celeste. Una escena cálida y detallada para principiantes con algo de experiencia.':
    'Shelves packed with flasks, scrolls and grimoires around a workbench with a celestial globe. A warm, detailed scene for beginners with some experience.',
  'Un pasillo de estanterías de doble altura con escaleras de mano, lámparas de lectura y un espejo al fondo que multiplica la escena hasta el infinito. Incluye más de 200 libros en miniatura impresos.':
    'A double-height aisle of shelves with ladders, reading lamps and a mirror at the back that multiplies the scene to infinity. Includes more than 200 printed miniature books.',
  'Una librería de barrio en una tarde de lluvia: escaparate repleto de libros, un gato en la ventana y charcos de resina en la acera. Pensado para iluminarse: todas sus variantes llevan LED.':
    'A neighbourhood bookshop on a rainy afternoon: a window full of books, a cat on the sill and resin puddles on the pavement. Made to glow: every version has LEDs.',
  'Un primer kit ideal: la fachada de un café parisino de los años veinte con su toldo a rayas, mesitas de mármol y pizarras con el menú. Montaje sencillo con instrucciones ilustradas paso a paso.':
    'An ideal first kit: the front of a 1920s Parisian café with its striped awning, small marble tables and menu chalkboards. Simple assembly with illustrated step-by-step instructions.',
  'Nuestro kit más ambicioso: una escalera de caracol de piedra que sube entre antorchas hasta la guarida de un dragón dormido sobre su tesoro. Para montadores con experiencia.':
    'Our most ambitious kit: a stone spiral staircase climbing between torches to the lair of a dragon asleep on its treasure. For experienced builders.',
  'Un sendero entre árboles retorcidos con casitas en los troncos, setas gigantes y luciérnagas. El kit más estrecho del catálogo: cabe incluso en baldas muy llenas.':
    'A path between twisted trees with little houses in the trunks, giant mushrooms and fireflies. The narrowest kit in the catalogue: it fits even on very full shelves.',
  'Plancha de contrachapado con las piezas más pequeñas y frágiles del kit Callejón de Praga: farolas, barandillas de balcón y agujas del reloj.':
    'A plywood sheet with the smallest and most fragile pieces of the Prague Alley kit: street lamps, balcony railings and clock hands.',
  'Fachadas barrocas de colores, adoquines, farolas de hierro forjado y, al fondo, un reloj astronómico. Inspirado en el casco antiguo de Praga.':
    "Colourful baroque façades, cobblestones, wrought-iron street lamps and, at the end, an astronomical clock. Inspired by Prague's Old Town.",
  'Un despacho del Londres victoriano con chimenea, sillones de cuero, un violín y el escritorio lleno de pistas. Niebla de algodón y farola de gas en la ventana.':
    'A study in Victorian London with a fireplace, leather armchairs, a violin and a desk full of clues. Cotton fog and a gas lamp at the window.',
  'Lámina precortada con todas las ventanas y vitrinas de los kits de biblioteca y cafetería. Útil si alguna se raya durante el montaje.':
    'A pre-cut sheet with all the windows and display cases of the library and café kits. Handy if one gets scratched during assembly.',
  'Tira LED de 30 cm con conector JST, idéntica a la que montan los kits iluminados. Para sustituir una tira dañada.':
    'A 30 cm LED strip with JST connector, identical to the one fitted in the lit kits. To replace a damaged strip.',
  'Doce acrílicos en tonos madera, piedra y vegetación, tres pinceles de detalle y barniz mate. Todo lo necesario para dar un acabado envejecido a tu escena.':
    'Twelve acrylics in wood, stone and foliage tones, three detail brushes and matt varnish. Everything you need to give your scene an aged finish.',
  'Frontal de metacrilato transparente de 2 mm con imanes para colocarlo y retirarlo fácilmente. Elige el ancho según tu kit.':
    'A 2 mm clear acrylic front with magnets so it is easy to fit and remove. Choose the width to suit your kit.',
  'Lomos de libros impresos a escala 1:24 en distintos colores y tamaños, listos para recortar y pegar en cualquier estantería de tus escenas.':
    'Printed 1:24 scale book spines in different colours and sizes, ready to cut out and glue onto any shelf in your scenes.',
  'Tira LED flexible de 1 m con interruptor en línea y alimentación USB. Compatible con cualquier kit sin iluminación: se oculta en el techo de la escena.':
    'A 1 m flexible LED strip with inline switch and USB power. Compatible with any unlit kit: it hides in the ceiling of the scene.',

  // variantes
  'Ancha (hasta 170 mm)': 'Wide (up to 170 mm)',
  'Estrecha (hasta 130 mm)': 'Narrow (up to 130 mm)',
  'Blanco cálido': 'Warm white',
  'Con LED + pintado premium': 'With LED + premium paint',
  'Con LED + sensor táctil': 'With LED + touch sensor',
  'Con LED · edición otoño': 'With LED · autumn edition',
  'Con LED · madera natural': 'With LED · natural wood',
  'Con kit LED USB': 'With USB LED kit',
  'Con luciérnagas LED': 'With LED fireflies',
  'Lámina completa': 'Full sheet',
  'Multicolor con mando': 'Multicolour with remote',
  'Pack 24 libros': 'Pack of 24 books',
  'Pack 60 libros': 'Pack of 60 books',
  'Pack 6 farolillos': 'Pack of 6 lanterns',
  'Plancha de piezas pequeñas': 'Small-parts sheet',
  'Set completo': 'Full set',
  'Tira 30 cm · conector JST': '30 cm strip · JST connector',

  // métodos de envío y códigos de descuento
  'Envío estándar a domicilio': 'Standard home delivery',
  'Envío exprés 24/48 h': 'Express delivery 24/48 h',
  'Recogida en punto de entrega': 'Collection from a pickup point',
  '10 % en tu primer pedido': '10% off your first order',
  '5 € de descuento a partir de 40 €': '€5 off orders from €40',
  '15 % en pedidos de más de 80 €': '15% off orders over €80',

  // datos de ejemplo del seed (incidencias y notas)
  'Uno de los farolillos de papel llegó roto. El resto del kit está perfecto.': 'One of the paper lanterns arrived broken. The rest of the kit is perfect.',
  'No encuentro en las instrucciones dónde va la pieza del toldo (paso 12).': "I can't find in the instructions where the awning piece goes (step 12).",
  '¿Vendéis los kits ya montados? Me gustaría regalar uno.': 'Do you sell the kits already assembled? I would like to give one as a gift.',
  'Es un regalo, sin factura': "It's a gift, no invoice",
  'Exprés 24 h': 'Express 24 h',

  // mensajes del servidor (funciones de Supabase)
  'Faltan los datos del cliente o del envío': 'Customer or shipping details are missing',
  'El email no es válido': 'The email is not valid',
  'El nombre debe tener entre 2 y 100 caracteres': 'The name must be between 2 and 100 characters',
  'El teléfono no es válido': 'The phone number is not valid',
  'El nombre del destinatario es demasiado largo': "The recipient's name is too long",
  'La dirección debe tener entre 5 y 200 caracteres': 'The address must be between 5 and 200 characters',
  'La ciudad no es válida': 'The city is not valid',
  'El código postal debe tener 5 dígitos': 'The postcode must have 5 digits',
  'La provincia no es válida': 'The province is not valid',
  'La nota no puede superar los 500 caracteres': 'The note cannot exceed 500 characters',
  'session_id no válido': 'Invalid session_id',
  'El pedido debe tener entre 1 y 20 líneas': 'The order must have between 1 and 20 lines',
  'Línea de pedido no válida': 'Invalid order line',
  'Un producto del carrito ya no está a la venta': 'A product in the cart is no longer for sale',
  'Elige un método de envío válido': 'Choose a valid shipping method',
  'Solo administradores': 'Administrators only',
  'Método de pago no válido': 'Invalid payment method',
  'Pedido no encontrado': 'Order not found',
  'Este pedido ya está pagado o no admite pagos': 'This order is already paid or does not accept payments',
  // pago con Stripe (supabase/10_stripe.sql y Edge Functions)
  'Sesión de Stripe no válida': 'Invalid Stripe session',
  'La sesión de Stripe no es de un pedido de la tienda': 'The Stripe session does not belong to an order from this shop',
  'La sesión de Stripe es de otro pedido': 'The Stripe session belongs to another order',
  'La moneda o el importe del pago no son válidos': 'The payment currency or amount is not valid',
  'El importe cobrado no coincide con el del pedido': 'The amount charged does not match the order total',
  'Stripe no ha podido procesar el pago': 'Stripe could not process the payment',
  'Falta la clave de prueba de Stripe en el servidor': 'The Stripe test key is missing on the server',
  'Error interno del pago': 'Internal payment error',
  'Importe no válido': 'Invalid amount',
  'Tarjeta no válida': 'Invalid card',
  'Usa una tarjeta de prueba': 'Use a test card',
  'Tarjeta de prueba rechazada por el simulador': 'Test card declined by the simulator',
  'Indica el número de pedido y el email': 'Enter the order number and the email',
  'Elige un motivo de la lista': 'Choose a reason from the list',
  'El mensaje debe tener entre 10 y 2000 caracteres': 'The message must be between 10 and 2000 characters',
  'El número de pedido no es válido': 'The order number is not valid',
  'Introduce un código de descuento': 'Enter a discount code',
  'Subtotal no válido': 'Invalid subtotal',
  'El código no existe o no está activo': 'The code does not exist or is not active',
  'El código todavía no está vigente': 'The code is not valid yet',
  'El código ha caducado': 'The code has expired',
  'payload demasiado grande': 'payload too large',
};

// nombres de estados en minúsculas (mensajes del back-office)
const STATUS = {
  creado: 'created', pago_simulado: 'paid (simulated)', pendiente_preparacion: 'awaiting preparation',
  enviado: 'shipped', entregado: 'delivered', cancelado: 'cancelled', incidencia: 'issue',
  abierta: 'open', 'en curso': 'in progress', en_curso: 'in progress', resuelta: 'resolved',
};
const st = s => STATUS[s] ?? s;
const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

const patterns = [
  // títulos de pestaña: "<nombre> · Entrelibros"
  [/^(.+) · Back-office · Entrelibros$/, (m, tr) => `${tr(m[1])} · Back-office · Entrelibros`],
  [/^(.+) · Entrelibros$/, (m, tr) => `${tr(m[1])} · Entrelibros`],
  // pie
  [/^Escenas en miniatura para colocar entre tus libros\. Tienda ficticia: proyecto de la asignatura Soluciones Informáticas para la Empresa \(UCAM\), (\d{4})\.$/,
    'Miniature scenes to place between your books. Fictitious shop: a project for the course Business IT Solutions (UCAM), $1.'],

  // catálogo y fichas
  [/^(\d+) productos?$/, m => plural(m[1], 'product', 'products')],
  [/^desde (.+)$/, 'from $1'],
  [/^([\d.,]+) cm de ancho$/, '$1 cm wide'],
  [/^Book nook (.+) colocado entre libros en una estantería \(imagen generada con IA\)$/,
    (m, tr) => `Book nook “${tr(m[1])}” placed between books on a shelf (AI-generated image)`],
  [/^Fotografía de ambientación: (.+)$/, (m, tr) => `Mood photograph: ${tr(m[1])}`],
  [/^› (.+)$/, (m, tr) => `› ${tr(m[1])}`],
  [/^(.+) 💡$/u, (m, tr) => `${tr(m[1])} 💡`],
  [/^≈ ([\d.,]+) h$/, '≈ $1 h'],
  [/^¡Últimas (\d+) unidades!$/, 'Only $1 left!'],
  [/^Indica una cantidad entre 1 y (\d+)\.$/, 'Enter a quantity between 1 and $1.'],
  // el final opcional dice por qué se ha añadido menos de lo pedido: máximo por línea (m[4]) o stock (m[5])
  [/^Añadido al carrito: (\d+) × (.+) · (.+?)\.(?: Has llegado al máximo de (\d+) unidades\.| Ya tienes en el carrito todas las unidades que quedan \((\d+)\)\.)?$/,
    (m, tr) => `Added to cart: ${m[1]} × ${tr(m[2])} · ${tr(m[3])}.`
      + (m[4] ? ` You have reached the maximum of ${m[4]} units.` : '')
      + (m[5] ? ` You now have all the remaining units in your cart (${m[5]}).` : '')],
  [/^Ya tienes el máximo de (\d+) unidades de esta versión en el carrito\.$/, 'You already have the maximum of $1 units of this version in your cart.'],
  [/^Ya tienes en el carrito todas las unidades que quedan \((\d+)\)\.$/, 'You already have all the remaining units in your cart ($1).'],

  // carrito
  [/^Cantidad de (.+)$/, (m, tr) => `Quantity of ${tr(m[1])}`],
  [/^Has eliminado (.+) \((.+)\) del carrito\.$/, (m, tr) => `You removed ${tr(m[1])} (${tr(m[2])}) from the cart.`],
  [/^Solo quedan (\d+) unidades\.$/, 'Only $1 left.'],
  [/^Te faltan (.+)$/, '$1 to go'],
  [/^(.+) · (EL-[A-Z0-9-]+)$/, (m, tr) => `${tr(m[1])} · ${m[2]}`],

  // favoritos
  [/^Guardar en favoritos: (.+)$/, (m, tr) => `Save to favourites: ${tr(m[1])}`],
  [/^Has quitado (.+) de tus favoritos\.$/, (m, tr) => `You removed ${tr(m[1])} from your favourites.`],
  [/^Hemos quitado de tu lista (\d+) productos que ya no están a la venta\.$/,
    'We removed $1 products from your list because they are no longer for sale.'],

  // checkout
  [/^(\d+-\d+) días laborables · gratis desde (.+)$/, '$1 working days · free from $2'],
  [/^(\d+-\d+) días laborables(\.?)$/, '$1 working days$2'],
  [/^(\d+) × (.+)$/, (m, tr) => `${m[1]} × ${tr(m[2])}`],
  [/^IVA incluido: (.+)$/, 'VAT included: $1'],
  [/^Código aplicado: (.+)\.$/, (m, tr) => `Code applied: ${tr(m[1])}.`],
  [/^Descuento \((.+)\)$/, 'Discount ($1)'],
  [/^Este código necesita un pedido mínimo de (.+) €$/, 'This code needs a minimum order of €$1'],
  [/^La cantidad de "(.+)" debe estar entre 1 y 10$/, (m, tr) => `The quantity of "${tr(m[1])}" must be between 1 and 10`],
  [/^No hay stock suficiente de "(.+)" \(quedan (\d+)\)$/, (m, tr) => `Not enough stock of "${tr(m[1])}" (${m[2]} left)`],

  // pago y confirmación
  [/^Pago rechazado: (.+)\. Puedes intentarlo de nuevo con otra tarjeta de prueba o con Bizum\.$/,
    (m, tr) => `Payment declined: ${tr(m[1])}. You can try again with another test card or with Bizum.`],
  [/^No queda stock suficiente de "(.+)"$/, (m, tr) => `Not enough stock left of "${tr(m[1])}"`],
  [/^(.+): (\d+-\d+) días laborables\.$/, (m, tr) => `${tr(m[1])}: ${m[2]} working days.`],
  [/^entre el (.+) y el (.+)\.$/, 'between $1 and $2.'],
  [/^(Tarjeta \(simulada\)|Bizum \(simulado\))( · .*)$/, (m, tr) => tr(m[1]) + m[2]],
  [/^(.+ · )(Tarjeta de prueba rechazada por el simulador|No queda stock suficiente de ".+")$/, (m, tr) => m[1] + tr(m[2])],
  [/^Nota: (.+)$/, (m, tr) => `Note: ${tr(m[1])}`],

  // soporte
  [/^No hemos podido asociar el pedido (.+): el número no coincide con el email indicado\. La incidencia se ha registrado igualmente\.$/,
    'We could not link order $1: the number does not match the email given. The request has been recorded anyway.'],
  [/^Cuéntanos qué pasa \(entre (\d+) y (\d+) caracteres\)\.$/, 'Tell us what is happening (between $1 and $2 characters).'],

  // back-office
  [/^Creado el (.+)$/, 'Created on $1'],
  [/^Envío · (.+)$/, (m, tr) => `Shipping · ${tr(m[1])}`],
  [/^(.+) · (\d+-\d+) días$/, (m, tr) => `${tr(m[1])} · ${m[2]} days`],
  [/^Pago (SIM-[A-Z0-9-]+)$/, 'Payment $1'],
  [/^Seguimiento (.+)$/, 'Tracking $1'],
  [/^(.+) · (sistema|servidor|Admin pruebas)$/, (m, tr) => `${m[1]} · ${tr(m[2])}`],
  [/^· (.+)$/, (m, tr) => `· ${tr(m[1])}`],
  [/^(SOP-[A-Z0-9-]+): (abierta|en curso|resuelta)\.$/, m => `${m[1]}: ${st(m[2])}.`],
  [/^(\d+) incidencias?$/, m => plural(m[1], 'request', 'requests')],
  [/^(\d+) eventos?$/, m => plural(m[1], 'event', 'events')],
  [/^(\d+) pedidos?$/, m => plural(m[1], 'order', 'orders')],
  [/^No se pudo cambiar el estado: (.+)$/, (m, tr) => `Could not change the status: ${tr(m[1])}`],
  [/^No se pudo cambiar el estado de (.+?): (.+)$/, (m, tr) => `Could not change the status of ${m[1]}: ${tr(m[2])}`],
  [/^Transición no permitida: (\S+) → (\S+)$/, m => `Transition not allowed: ${st(m[1])} → ${st(m[2])}`],
  [/^Pedido (\d+) no encontrado$/, 'Order $1 not found'],
  [/^Incidencia (\d+) no encontrada$/, 'Request $1 not found'],
  [/^Tipo de evento no permitido desde el cliente: (.+)$/, 'Event type not allowed from the client: $1'],
];

export default { exact, patterns };
