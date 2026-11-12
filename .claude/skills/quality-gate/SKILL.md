---
name: quality-gate
description: Decide cuándo correr /engineering:code-review y /engineering:documentation en Content Hub y las ejecuta en el orden correcto. Úsala SIEMPRE que se termine una feature, se prepare un merge o PR, se toque auth/autorización/DB/OAuth/CI/deploy, se agreguen puertos o fakes, o el usuario diga "terminé", "listo para mergear", "cerremos esta etapa", "dejemos la app completa" o "qué falta revisar/documentar", aunque no nombre ninguna de las dos skills.
---

# Quality gate: revisar y documentar en el momento correcto

Esta skill no revisa ni documenta por sí misma. Decide **si** hace falta y **en qué orden** invocar:

- `engineering:code-review` — busca errores en lo que el código hace (seguridad, rendimiento, casos borde).
- `engineering:documentation` — explica el código ya estable (README, guías, runbooks).

Va primero la revisión porque puede cambiar el código. Documentar antes obliga a reescribir los docs después.

## Paso 1: medir el cambio

Mira qué cambió desde el último punto estable (`git diff main...HEAD --stat`, o `git status` si todo está sin commitear) y clasifica.

### Dispara code-review si se cumple ALGUNA

1. **Zona de riesgo**: el diff toca autenticación, autorización o su matriz, OAuth con Atlassian, acceso a datos, migraciones o hardening de DB, pipeline de CI, o el verificador de deploy. Estas zonas fallan en silencio, y los tests solo cubren lo que ya imaginaste.
2. **Feature terminada**: se cerró una funcionalidad completa y está por integrarse a `main`.
3. **Tamaño**: el cambio supera el umbral definido en la sección "Umbral de tamaño".
4. **Duda explícita**: el usuario sospecha de N+1, inyección, errores sin manejar o casos borde.

### Dispara documentation si se cumple ALGUNA (y code-review ya pasó o no aplica)

1. **Etapa cerrada**: el contexto sigue fresco y nadie ha explicado el cambio.
2. **Cambia cómo se usa o se opera**: nuevos comandos, variables de entorno, pasos de OAuth, flujo de deploy → actualizar `docs/COMO_EJECUTAR.md` o un runbook.
3. **Nuevo puerto o fake en memoria**: documentar el contrato que cumple.
4. **Decisión de diseño no trivial**: registrarla en `docs/DECISIONES.md` con el siguiente id `D-0NN` (para un ADR formal, sugerir `engineering:architecture`).
5. **Docs desactualizados**: el código contradice `docs/SDD_Content_Hub.md`, `docs/COMO_EJECUTAR.md` o `docs/DECISIONES.md`.

### No dispares nada si

El cambio es solo formato, renombrado trivial, un typo o un cambio de comentario. Una revisión ahí cuesta más de lo que aporta.

## Umbral de tamaño

Corre esta skill al terminar cada categoría o funcionalidad.
Un cambio es grande si supera 150 líneas de código fuente o 5 archivos
(sin contar tests ni docs). Si es grande, o si toca una zona de riesgo
sin importar el tamaño, corre `engineering:code-review` y luego
`engineering:documentation`. Si es pequeño y no toca zonas de riesgo,
solo `engineering:documentation`.

## Paso 2: ejecutar en orden

1. Si aplica code-review, invoca `engineering:code-review` con la herramienta Skill sobre el diff.
2. Corrige los hallazgos confirmados. Si alguno cambia el comportamiento, vuelve a correr los tests.
3. Si aplica documentation, invoca `engineering:documentation` indicando qué archivo de `docs/` actualizar. Prefiere editar docs existentes antes que crear archivos nuevos.
4. Cierra con un resumen corto: qué disparó cada skill, qué se corrigió y qué docs cambiaron.

## Reglas de convivencia

- Propón la ejecución y espera confirmación del usuario si el repo tiene cambios sin commitear que no son tuyos. La revisión puede tocar archivos.
- No hagas commits ni push por tu cuenta. Eso lo decide el usuario.
- Si el usuario pide solo una de las dos, haz solo esa. Menciona la otra en una línea si ves que aplica.
