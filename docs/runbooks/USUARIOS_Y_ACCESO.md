# Runbook: usuarios y acceso

Cuándo usarlo: invitar a alguien, cambiar un rol, dar de baja, o cuando una persona dice que no
puede entrar. Quién puede hacerlo: un **Líder** (permiso `admin.roles`). Contexto:
[ACCESO_Y_SEGURIDAD.md](../ACCESO_Y_SEGURIDAD.md).

## Invitar a una persona

1. Entra a **Permisos**.
2. En "Invitar", escribe su correo `@holafly.com` y elige el rol.
3. Si el rol es **Líder**, marca la casilla de confirmación.
4. Pulsa **Enviar invitación**. Verás "Invitación registrada".
5. Avísale tú: la app no envía correos. Al iniciar sesión por primera vez su estado pasa de
   `invitado` a `activo`.

Errores habituales: correo de otro dominio (`invalid-email`), correo ya registrado
(`already-exists`).

## Cambiar el rol

1. **Permisos** → fila de la persona → elige el nuevo rol.
2. Confirma si es Líder.

No se permite dejar el sistema sin Líder activo ni degradarte a ti mismo. Pide a otro Líder que lo
haga.

## Dar de baja o reactivar

- **Dar de baja:** sus sesiones se cierran **al instante**. No podrá volver a entrar.
- **Reactivar:** queda como `invitado`; debe iniciar sesión otra vez.
- No puedes darte de baja a ti mismo ni a la última persona con rol Líder.

## Una persona no puede entrar

Pregunta qué pantalla ve y busca el motivo en `audit_log` (`auth.login_denied`).

| Síntoma                                     | Causa probable                                         | Qué hacer                                                                                           |
| ------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Mensaje genérico de acceso denegado         | `not-invited`: no está en la lista                     | Invitarla desde **Permisos**                                                                        |
| Igual, tras haber estado activa             | `deactivated`: fue dada de baja                        | Reactivarla y pedirle que entre de nuevo                                                            |
| Igual, con correo que no es de Holafly      | `domain-not-allowed`                                   | Usar su correo `@holafly.com`                                                                       |
| Atlassian la deja pasar pero el Hub rechaza | El perfil de Atlassian no devuelve el correo           | Que la persona haga visible su correo en el perfil de Atlassian                                     |
| Entra y vuelve al login a los minutos       | Sesión expirada: 60 min de inactividad o 12 h          | Iniciar sesión otra vez; es el comportamiento esperado                                              |
| Entra pero no ve una sección                | Su rol no tiene ese permiso (se oculta, no se bloquea) | Revisar el rol; hoy los permisos por rol se ajustan por datos (la matriz visual llega en la Fase 2) |

Para consultar la auditoría hoy hace falta acceso a la base de datos. Ejemplo:

```sql
SELECT at, action, after->>'email' AS email, after->>'reason' AS reason
FROM audit_log
WHERE action = 'auth.login_denied'
ORDER BY at DESC
LIMIT 20;
```

## Recuperar el acceso si no queda ningún Líder activo

1. Comprueba que `BOOTSTRAP_LEADER_EMAIL` tiene tu correo (en Netlify: variables de entorno).
2. Inicia sesión con ese correo. Como no hay Líder activo, la app te crea o te promueve a Líder y
   registra `auth.bootstrap_leader`.
3. Si ya había un Líder activo, esa variable no hace nada: el problema es otro (ver tabla).

## Cierre de emergencia de una cuenta

Si sospechas que una sesión fue robada: **dar de baja** a esa persona (revoca todas las sesiones) y
reactivarla después. Revisa `auth.login` en la auditoría para ver IPs y horas.

## Escalar

Si el problema no está en la tabla, guarda el `X-Request-Id` de la respuesta (cabecera) y la hora
exacta, y revisa los registros de la función en Netlify filtrando por ese id.
