const NOT_FOUND_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Página no encontrada</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">
<main><h1>Página no encontrada</h1><p><a href="/">Volver al inicio</a></p></main></body></html>`;

/**
 * The one response used for "does not exist" AND "exists but you may not see it", so the
 * two cannot be told apart (SDD §10.3). API paths get an empty body.
 */
export function notFoundResponse(pathname: string): Response {
  if (pathname.startsWith('/api/')) return new Response(null, { status: 404 });
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function tooManyRequestsResponse(retryAfterSeconds: number): Response {
  return new Response('Demasiadas solicitudes. Inténtalo de nuevo en un momento.', {
    status: 429,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': String(retryAfterSeconds),
    },
  });
}

export function redirectResponse(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
