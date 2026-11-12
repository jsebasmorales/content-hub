import type { SlaMetric } from '@domain/jira/sla';

/** How each SLA metric is named on screen. One place, so every page says the same thing. */
export const METRIC_LABEL: Readonly<Record<SlaMetric, string>> = {
  first_response: 'Primera respuesta',
  done: 'Resolución',
};

/** What each metric means, for the ⓘ next to it. */
export const METRIC_TIP: Readonly<Record<SlaMetric, string>> = {
  first_response:
    'Porcentaje de solicitudes cuya primera respuesta llegó dentro de las 16 horas laborables de la meta. Lo calcula Jira; el Hub solo lo cuenta.',
  done: 'Porcentaje de solicitudes resueltas dentro de las 160 horas laborables de la meta (Time to done). Cada métrica debe llegar al 90 % por separado.',
};
