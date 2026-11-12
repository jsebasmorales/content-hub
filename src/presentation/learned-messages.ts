import type { Flash } from './admin-messages';

export type LearnedMessageCode =
  | 'saved'
  | 'unchanged'
  | 'empty'
  | 'too-long'
  | 'invalid-quarter'
  | 'invalid-request'
  | 'invalid-token';

const TEXT: Readonly<Record<LearnedMessageCode, Flash>> = {
  saved: { kind: 'ok', text: 'Guardado. Es la versión más reciente; las anteriores se conservan.' },
  unchanged: {
    kind: 'ok',
    text: 'No había cambios respecto a la última versión, así que no se guardó otra.',
  },
  empty: {
    kind: 'error',
    text: 'Escribe algo en al menos uno de los tres cuadros antes de guardar.',
  },
  'too-long': {
    kind: 'error',
    text: 'Alguno de los cuadros es demasiado largo. No se guardó nada: acórtalo e inténtalo de nuevo.',
  },
  'invalid-quarter': {
    kind: 'error',
    text: 'Ese trimestre no es válido o todavía no ha empezado.',
  },
  'invalid-request': { kind: 'error', text: 'La solicitud no es válida. Inténtalo de nuevo.' },
  'invalid-token': {
    kind: 'error',
    text: 'La sesión del formulario caducó. Recarga la página e inténtalo de nuevo.',
  },
};

export const learnedRedirect = (quarterParam: string | null, code: LearnedMessageCode): string => {
  const params = new URLSearchParams();
  if (quarterParam !== null) params.set('trimestre', quarterParam);
  params.set('learned', code);
  return `/aprendido?${params.toString()}`;
};

/** Turns `?learned=` into a message. Unknown codes show nothing (no reflected text). */
export function learnedFlashFromQuery(params: URLSearchParams): Flash | null {
  const code = params.get('learned');
  // hasOwn, not `in`: `?learned=toString` must not reach inherited object members.
  return code !== null && Object.hasOwn(TEXT, code) ? TEXT[code as LearnedMessageCode] : null;
}
