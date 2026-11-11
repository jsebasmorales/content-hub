import type { APIContext } from 'astro';
import type { z } from 'zod';

export function clientIp(context: Pick<APIContext, 'clientAddress'>): string | null {
  try {
    return context.clientAddress;
  } catch {
    return null;
  }
}

/** Same ceiling as the middleware's Content-Length check (D-025). */
export const MAX_FORM_BYTES = 64 * 1024;

/** Reads at most `limit` bytes; returns null as soon as the body exceeds it (chunked uploads too). */
async function readCapped(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Reads a small HTML form body and validates it. Returns null for anything unexpected. */
export async function readForm<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T> | null> {
  try {
    const bytes = await readCapped(request, MAX_FORM_BYTES);
    if (!bytes) return null;
    const contentType = request.headers.get('content-type') ?? '';
    const form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData();
    const parsed = schema.safeParse(Object.fromEntries(form));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** HTML checkboxes send "yes" when ticked and nothing otherwise. */
export const isChecked = (value: string | undefined): boolean => value === 'yes';
