# Entrelibros

Prototipo académico de canal digital de venta: eCommerce de escenas en miniatura para colocar
entre libros (*book nooks*). Tarea 1 · Soluciones Informáticas para la Empresa · UCAM.

> Tienda ficticia. No contiene datos personales reales ni medios de pago reales.

## Arquitectura

| Capa | Dónde | Qué hace |
|---|---|---|
| Presentación | `public/*.html`, `public/js/pages/` | HTML + JavaScript (módulos ES), sin framework. Desplegado en GitHub Pages. |
| Servicios (cliente) | `public/js/services/` | Orquestan la interfaz: eventos, carrito, catálogo. |
| Acceso a datos | `public/js/core/supabase.js`, `public/js/repositories/` | Consultas a Supabase. |
| Lógica de negocio (servidor) | `supabase/03_functions.sql` | Funciones PostgreSQL: crear pedido, pago simulado, cambio de estado, eventos. |
| Persistencia | `supabase/01_schema.sql` | PostgreSQL gestionado por Supabase. |
| Seguridad | `supabase/02_policies.sql` | Row Level Security: el navegador solo lee el catálogo; las escrituras van por funciones. |

## Puesta en marcha

### 1. Base de datos (Supabase)
1. Crear un proyecto en <https://supabase.com>.
2. En **SQL Editor**, ejecutar en orden: `01_schema.sql`, `02_policies.sql`, `03_functions.sql` (y `04_seed.sql` con los datos de prueba).
3. En **Project Settings > API**, copiar la *Project URL* y la *publishable key* (anon) en `public/js/config.js`.
   Esa clave es pública por diseño; **nunca** usar la *secret / service_role key* en el front.

### 2. Usuario administrador (back-office)
1. **Authentication > Users > Add user** (email + contraseña de prueba, no reales).
2. En SQL Editor:
   ```sql
   insert into public.admin_users (user_id, display_name)
   select id, 'Admin pruebas' from auth.users where email = 'admin@entrelibros.test';
   ```

### 3. Ejecutar en local
Los módulos ES necesitan servirse por HTTP (no vale abrir el fichero con doble clic):
```bash
python3 -m http.server 8000 -d public
# abrir http://localhost:8000
```

### 4. Despliegue (GitHub Pages)
1. Subir el repositorio a GitHub.
2. **Settings > Pages > Source: GitHub Actions**. El workflow `.github/workflows/pages.yml` publica `public/` en cada push a `main`.
