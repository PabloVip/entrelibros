# Anexo de IA · Tarea 2 · Nino Iraci

Mi parte de la declaración de uso de inteligencia artificial de la Tarea 2, con el mismo esquema que en la Tarea 1.

**Herramientas:**
- Claude Code (Anthropic, modelo Claude Opus 5.5) en Visual Studio Code, con acceso a mi copia local del repositorio.
- Claude en Word (complemento de Anthropic para Microsoft Word, modelo Claude Opus 5.5), solo para revisar la redacción
  y el formato de mis partes de la memoria.

No he usado ninguna otra herramienta de IA.

La IA no tuvo acceso a n8n, al panel de Supabase ni a Render, y nunca se le dieron las claves de Supabase, Gemini,
Telegram ni la del webhook. Gemini, el modelo del agente de soporte, es parte del sistema y no una ayuda para
hacer la tarea: lo explica la memoria.

## Para qué la he usado

- **Entender el reparto de tareas** que propuso Pablo y el aviso del profesor del 27 de octubre sobre el back-office.
  A partir del aviso revisamos `14_integracion.sql`. El primer ERP era el esquema `erp` dentro de la misma base de datos
  de la tienda, así que no cumplía lo de «almacenamiento propio y acceso independiente». Se lo planteé a Pablo con una
  propuesta: sacar el ERP a un segundo proyecto de Supabase. Así se ha hecho (`entrelibros-erp`, con su web en `erp/`).
- **Traducir al inglés la página Integración** del back-office de la tienda (`en-admin.js`). Primero traduje la página
  completa (cuadro de mando, ERP/CRM, agente y log). Al separar el ERP, la página se rehízo y ahora solo enseña la cola
  de salida, así que actualicé la traducción: 29 textos fijos y 3 reglas para los textos con partes variables. También
  quité las traducciones que ya no se usaban.
- **Escribir las pruebas del contrato** (`pruebas.md`) y los payloads de error 5 (número de pedido mal formado) y
  6 (evento fuera de orden). La IA leyó la validación de n8n (`validar-evento.js`), la definición del workflow
  (`build_workflows.py`) y las funciones del ERP para describir, en cada caso, qué responde n8n, qué queda en el registro
  y en qué estado queda la cola. Con el ERP separado, los resultados son los mismos, porque las funciones no han
  cambiado. Lo que cambia es dónde se ven, y actualicé el documento.
- **Corregir los eventos fuera de orden en stock e incidencias** (`erp/supabase/02_orden_eventos.sql`, los workflows 1 y
  4 en `build_workflows.py` y el caso 7 de las pruebas), con las tres condiciones que puso Pablo: que la conciliación
  nocturna del inventario tampoco pise un ajuste más reciente, que el cambio de n8n vaya en `build_workflows.py` y que
  estuviera antes del domingo. La IA escribió el SQL, el cambio de los workflows y las pruebas automáticas.
- **Preparar mi parte de la memoria:** el borrador de mi columna del reparto del trabajo (apartado 12) y de esta
  declaración (anexo A.3), que he revisado y corregido yo.
- **Revisar esas partes con Claude en Word:** propuso correcciones de estilo y dejó un comentario que detectó una
  contradicción: la fila «n8n y despliegue» decía que el duplicado y el fuera de orden se probaron en n8n, cuando los
  controla el back-office. Como Pablo regenera la memoria desde su script, la corrección se le pasó como texto.
- **Preparar la defensa:** una guía con lo que digo en cada diapositiva, dónde está cada evidencia que puede pedir el
  profesor y respuestas a las preguntas probables, comprobadas contra el código.

## Qué he decidido yo

- **El orden de trabajo:** primero las pruebas y este anexo, que no dependían de la arquitectura. La revisión de la
  matriz de decisión, después de acordar con Pablo cómo separar el ERP, porque la descripción de la alternativa A
  depende de eso.
- **Cómo se registra mi trabajo:** en una rama propia (`tarea2-nino`), con un commit por cada punto del reparto, revisado
  por mí antes de hacerlo. No se sube nada a GitHub sin mi permiso.
- **Quitar la firma de coautoría de la IA de los commits:** el uso de IA se declara aquí, en el anexo.
- **Las traducciones:** por ejemplo, «Último día» se traduce «Last 24 hours», porque la consulta del cuadro de mando
  mira las últimas 24 horas y no el día natural.
- **Arreglar el problema de orden que encontré en las pruebas**, en lugar de dejarlo solo como propuesta, y hacerlo con
  parámetros opcionales para que Pablo pudiera aplicar el SQL sin parar n8n.

## Cómo lo he comprobado

- **Traducción:** la IA escribió un script que reproduce la búsqueda del traductor de la web (`i18n.js`) y lo pasó por
  todos los textos de la página, con valores de ejemplo en las partes variables. Resultado:
  - todo queda traducido menos los nombres técnicos de tablas, que deben quedarse igual;
  - no hay claves duplicadas;
  - ninguna traducción que ya existía en la tienda ha cambiado.
- **Pruebas del contrato:**
  - Los casos de validación (sin email, importes que no cuadran, número de pedido mal formado) se obtuvieron
    **ejecutando el propio código del nodo de n8n** con Node sobre cada payload. Los mensajes del documento son la salida
    literal.
  - Los casos de duplicado y fuera de orden se dedujeron leyendo `erp_upsert_order`.
  - Después de separar el ERP volví a ejecutar el nodo sobre todos los payloads: los mensajes no cambian. También
    comprobé que `erp/supabase/01_erp.sql` mantiene las mismas comprobaciones de duplicado y orden.
- **Traducciones que dejaron de usarse:** antes de quitarlas, el script buscó cada una en el resto de páginas del
  back-office, para no romper otra pantalla.
- **Corrección del orden:** sin tocar el Supabase de producción.
  - Se cargaron `01_erp.sql` y `02_orden_eventos.sql` en un PostgreSQL desechable en memoria (PGlite) y se pasaron
    35 comprobaciones automáticas: duplicado, obsoleto, foto del inventario anterior y posterior a un ajuste, llamadas
    sin los parámetros nuevos (como hace n8n antes de reimportar), permisos y volver a ejecutar los ficheros.
  - Los payloads 2b y 7 pasaron por el nodo de validación y luego por el ERP, en los dos órdenes.
  - Las expresiones de n8n de los nodos cambiados se evaluaron con datos de ejemplo, y al regenerar los workflows
    solo cambian esos nodos.
- **Revisiones antes de cada commit:** los JSON nuevos son válidos, ningún fichero contiene claves y todos los enlaces
  entre documentos funcionan.
- **Página Integración en inglés:** se abrió `admin-integracion.html` en español y en inglés con Chrome sin interfaz,
  con una sesión de administrador simulada y datos de ejemplo. Todas las llamadas a Supabase se interceptaron, así que
  no hizo falta contraseña ni se tocó la base de datos. Resultado:
  - todos los textos de la página salen en inglés; solo quedan iguales los códigos y datos (tipos de evento,
    referencias, mensajes del servidor) y palabras que son iguales en los dos idiomas;
  - sin errores de JavaScript y sin scroll horizontal en el móvil (375 px).
- **Pendiente:** repetir en el n8n desplegado los casos de duplicado y de fuera de orden (5, 6 y 7). Los lanza Pablo,
  que tiene la clave del webhook.

## Errores que salieron en el proceso

- **Una clave duplicada:** la IA añadió una traducción («Caducado») que ya existía en el diccionario. En un objeto de
  JavaScript la segunda clave pisa a la primera sin avisar. La detectó el script de comprobación y se quitó.
- **El botón «Reintentar»:** en el primer borrador de las pruebas, la IA escribió que servía para reenviar un evento
  después de corregir el dato en la tienda. Al leer la función `admin_integration_retry` se vio que reenvía el mismo
  payload guardado en la cola, y se corrigió.
- **Los duplicados en el cuadro de mando:** el borrador decía que se contaban aparte de las ejecuciones correctas.
  La consulta del cuadro de mando muestra que cuentan como correctas y además se enseñan aparte. Se corrigió el texto.
- **Las versiones antiguas de las funciones:** al añadir un parámetro, PostgreSQL crea una función nueva y deja la
  antigua, y la API no sabría cuál elegir. Por eso el 02 borra las antiguas. Las pruebas mostraron además que, si se
  vuelve a ejecutar el 01, las antiguas reaparecen; se avisa en el 01 y en la guía de despliegue de que el 02 va siempre
  detrás.
- **Una prueba mal escrita:** la primera versión de las pruebas usaba una hora inexistente (30:00) y falló al
  ejecutarse. Se corrigió la prueba, no el SQL.
- **Las propuestas sin respuesta:** en la guía de la defensa, la IA escribió que una propuesta sin respuesta en 24 h
  queda «caducada». Al comprobarlo en el workflow se vio que se registra como rechazada («Sin respuesta en 24 h»), y se
  corrigió.

## Problemas detectados y propuestas

- **El ERP no era un sistema separado** (ver arriba). Resuelto: ahora es un proyecto de Supabase propio, con su base de
  datos, sus usuarios y su web, y solo n8n escribe en él.
- **Eventos fuera de orden:** la protección (`last_event_at`) solo existía para los pedidos, también en el ERP nuevo.
  Un ajuste de stock o un cambio de estado de un ticket que llegara tarde sobrescribía el valor actual con uno antiguo.
  Corregido en `erp/supabase/02_orden_eventos.sql` y en los workflows 1 y 4 (caso 7 de `pruebas.md`).
- **Ficheros que sobraban en el repositorio:** una copia duplicada del diccionario (`public/js/i18n/en-admin 2.js`) y la
  caché de la herramienta de Supabase (`supabase/.temp/`). Pablo los borró y añadió la caché a `.gitignore`.
