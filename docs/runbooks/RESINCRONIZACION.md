# Runbook: re-sincronización completa con Jira

Para quién es: quien opera el Hub (hoy, el Líder con apoyo técnico). Cómo funciona el sync, en
[SDD §6](../SDD_Content_Hub.md) y D-034, D-035, D-047, D-048. Cómo se comprueba, en
[PRUEBAS.md](../PRUEBAS.md) (D-063).

## Qué es y por qué casi nunca hace falta

El Hub guarda una **copia de Jira**. Cada vez que alguien abre una página (si la copia tiene más de 15
minutos) o un Líder pulsa "Resincronizar con Jira", se pide a Jira **solo lo que cambió** desde la
última vez. Eso es el sync _incremental_ y es lo normal.

Una **re-sincronización completa** lee los 1.046 tickets (unos 20 segundos) y reconstruye la copia.
Es la única forma de que desaparezcan de la copia los tickets que se **borraron** en Jira (el
incremental no puede ver lo que ya no existe). No hay nada que deshacer: la copia es derivada, Jira
sigue siendo la fuente de verdad.

## Cuándo hacerla

| Situación                                                                                     | ¿Completa?                                                 |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Primer despliegue (la base está vacía)                                                        | **Sí**, es el paso 4 del [despliegue](DESPLIEGUE.md)       |
| Se cambió **cómo se guarda o se interpreta** un campo de Jira (el mapeo, las fechas, los SLA) | **Sí**: el incremental no relee tickets que no cambiaron   |
| Se borraron tickets en Jira y siguen apareciendo en el Hub                                    | **Sí**                                                     |
| Se cambió el id de un campo de SLA (`JIRA_FIELD_SLA_RESPONSE` / `JIRA_FIELD_SLA_DONE`)        | **Sí**                                                     |
| `pnpm compare:jira --all` dice que algo **no coincide** y la causa ya está corregida          | **Sí**, y volver a comparar                                |
| Los datos están viejos pero `/estado` muestra ejecuciones correctas                           | No: espera al siguiente sync o pulsa "Resincronizar"       |
| Jira estuvo caído un rato                                                                     | No: el siguiente incremental recupera lo pendiente (D-047) |

## Antes de empezar

- [ ] Sabes a **qué base** vas a escribir. En local es `pglite:` (segura). Contra producción necesitas
      la cadena **del dueño** de la base y la usas solo en un `.env` temporal, como en el despliegue.
- [ ] `.env` con `DATABASE_URL` y las variables `JIRA_*` (la cuenta que lee Jira, D-036).
- [ ] Si es en local: **cierra `pnpm dev`** (la base embebida no debe abrirse desde dos procesos).
- [ ] Miras antes `/estado`: la última ejecución correcta y cuántos tickets hay guardados. Apunta el
      número de **Tickets guardados** para compararlo después.

## Pasos

1. **Ensayo, sin escribir nada:**
   ```bash
   pnpm sync:jira --full --dry-run
   ```
   Debe terminar con `succeeded` y dar un número de tickets leídos parecido al de Jira, y cuántos
   **quitaría**. Si va a quitar muchos, mira "Si algo sale mal".
2. **La carga completa:**
   ```bash
   pnpm sync:jira --full
   ```
   Termina con `Jira sync full succeeded: N tickets read, M removed.` (unos 20 s).
3. **Comprueba que la copia es fiel a Jira:**
   ```bash
   pnpm compare:jira --all
   ```
   Debe decir `All N tickets: N match … 0 MISMATCH` y las líneas de SLA de cada trimestre con ✔.
4. **Mira `/estado`:** la ejecución nueva aparece como **Correcta**, con los tickets leídos, y la
   "Calidad del dato" tiene sentido (tickets guardados, abiertos…).
5. **Si cambiaste reglas de cálculo,** abre `/sla` y `/trimestres` y compara una cifra con lo que
   esperabas.
6. **Borra el `.env` temporal** si apuntaba a producción.

## Si algo sale mal

| Síntoma                                                                        | Causa probable                                                | Qué hacer                                                                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Another sync is already running`                                              | Hay un sync en curso (o uno que murió hace menos de 15 min)   | Espera 15 minutos: el candado caduca solo. No lo fuerces                                                                                                |
| `Jira refused the credentials (401)` (o 403)                                   | El token de Jira caducó, se rotó o la cuenta perdió permisos  | Genera un token nuevo, actualiza `JIRA_API_TOKEN` (aquí y en Netlify) y repite. La copia anterior sigue intacta                                         |
| `Jira failed (503)` u otros 5xx, o límite de peticiones                        | Jira limita o está caído                                      | Espera unos minutos y repite. El sync reintenta solo con esperas crecientes; una carga que falla a medias **no** borra nada                             |
| `Refusing to delete N of M cached tickets`                                     | Protección: no borra más del 20 % de golpe ni con lista vacía | Es a propósito (D-047). Comprueba en Jira que de verdad se borraron tantos tickets; si es así, hay que hacerlo con apoyo técnico                        |
| `compare:jira --all` dice `MISMATCH`                                           | El Hub guarda algo distinto de lo que dice Jira               | **No enseñes las cifras.** Apunta qué ticket y qué campo (lo dice el comando) y avisa a quien mantiene el código                                        |
| Dice `changed in Jira since the last sync`                                     | Alguien cambió un ticket mientras comparabas                  | No es un error: repite `pnpm sync:jira` y vuelve a comparar                                                                                             |
| `/estado` muestra "La última falló" con "No se pudo lanzar la sincronización…" | Falla el **lanzamiento** de la función en segundo plano       | Es otro problema (la función de Netlify o `SYNC_TRIGGER_SECRET`); mira el [runbook de despliegue](DESPLIEGUE.md#el-sync-de-jira-en-segundo-plano-d-048) |

## Después

Anota en [DECISIONES.md](../DECISIONES.md) por qué la hiciste si cambiaste una regla (cada cambio de
cálculo tiene su decisión) y, si fue por un fallo, qué lo provocó.
