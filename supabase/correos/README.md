# Plantillas de correo de Supabase Auth

Supabase envía los correos de las cuentas de cliente. Para que salgan en español y con el estilo de la tienda,
copia estas plantillas en **Supabase → Authentication → Emails → Templates**:

| Plantilla de Supabase | Asunto | Cuerpo (pegar el HTML) |
|---|---|---|
| **Confirm signup** | `Confirma tu cuenta de Entrelibros` | `confirmar-cuenta.html` |
| **Reset password** | `Cambia tu contraseña de Entrelibros` | `recuperar-contrasena.html` |

`{{ .ConfirmationURL }}` lo sustituye Supabase por el enlace con el token. No hay que tocarlo.
