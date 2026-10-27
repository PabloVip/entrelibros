# Anexo de IA · Tarea 2 · Nino Iraci

Mi parte de la declaración de uso de inteligencia artificial de la Tarea 2, con el mismo esquema que en la Tarea 1.

**Herramienta:** Claude Code (Anthropic, modelo Claude Opus 5.5) en Visual Studio Code, con acceso a mi copia local
del repositorio. No he usado ninguna otra herramienta de IA.

La IA no tuvo acceso a n8n, al panel de Supabase ni a Render, y nunca se le dieron las claves de Supabase, Gemini,
Telegram ni la del webhook. Gemini, el modelo del agente de soporte, es parte del sistema y no una ayuda para
hacer la tarea: lo explica la memoria.

## Para qué la he usado

- **Entender el reparto de tareas** que propuso Pablo y el aviso del profesor del 27 de octubre sobre el back-office.
  A partir del aviso revisamos `14_integracion.sql`. El ERP es el esquema `erp` dentro de la misma base de datos de la
  tienda, así que probablemente no cumple lo de «almacenamiento propio y acceso independiente». Se lo he planteado a
  Pablo con una propuesta, sacar el ERP a un segundo proyecto, y está pendiente de decidir entre los dos.
- **Traducir al inglés la página Integración** del back-office (`en-admin.js`): 102 textos fijos y 9 reglas para
  los textos con partes variables (porcentajes, número de propuesta, totales del gráfico…).
- **Escribir las pruebas del contrato** (`pruebas.md`) y los payloads de error 5 (número de pedido mal formado) y
  6 (evento fuera de orden). La IA leyó la validación de n8n (`validar-evento.js`), la definición del workflow
  (`build_workflows.py`) y las funciones del ERP para describir, en cada caso, qué responde n8n, qué queda en el log
  y en qué estado queda la cola.

## Qué he decidido yo

- **El orden de trabajo:** primero las pruebas y este anexo, que no dependen de la arquitectura. La matriz de decisión
  la dejo para después de acordar con Pablo cómo separamos el ERP, porque su descripción de la alternativa A depende de eso.
- **Cómo se registra mi trabajo:** en una rama propia (`tarea2-nino`), con un commit por cada punto del reparto, revisado
  por mí antes de hacerlo. No se sube nada a GitHub sin mi permiso.
- **Quitar la firma de coautoría de la IA de los commits:** el uso de IA se declara aquí, en el anexo.
- **Las traducciones:** por ejemplo, «Último día» se traduce «Last 24 hours», porque la consulta del cuadro de mando
  mira las últimas 24 horas y no el día natural.

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
- **Revisiones antes de cada commit:** los JSON nuevos son válidos, ningún fichero contiene claves y todos los enlaces
  entre documentos funcionan.
- **Pendiente:**
  - probar yo la página Integración en inglés (`?lang=en`) con el usuario administrador;
  - repetir los casos de duplicado y fuera de orden en el n8n desplegado, con Pablo.

## Errores que salieron en el proceso

- **Una clave duplicada:** la IA añadió una traducción («Caducado») que ya existía en el diccionario. En un objeto de
  JavaScript la segunda clave pisa a la primera sin avisar. La detectó el script de comprobación y se quitó.
- **El botón «Reintentar»:** en el primer borrador de las pruebas, la IA escribió que servía para reenviar un evento
  después de corregir el dato en la tienda. Al leer la función `admin_integration_retry` se vio que reenvía el mismo
  payload guardado en la cola, y se corrigió.
- **Los duplicados en el cuadro de mando:** el borrador decía que se contaban aparte de las ejecuciones correctas.
  La consulta del cuadro de mando muestra que cuentan como correctas y además se enseñan aparte. Se corrigió el texto.

## Problemas detectados y propuestas

- **El ERP no es un sistema separado:** está en la misma base de datos que la tienda (ver arriba). Propuesta: un segundo
  proyecto de Supabase solo para el ERP, al que únicamente accede n8n.
- **Eventos fuera de orden:** la protección (`last_event_at`) solo existe para los pedidos. Un ajuste de stock o un
  cambio de estado de un ticket que llegara tarde sobrescribiría el valor actual con uno antiguo. Propuesta: aplicar a
  `erp.inventory` y `erp.tickets` la misma comparación que hace `erp_upsert_order`.
- **Ficheros que sobran en el repositorio:**
  - una copia duplicada del diccionario, `public/js/i18n/en-admin 2.js`;
  - la caché de la herramienta de Supabase, `supabase/.temp/`, que conviene añadir a `.gitignore`.
