import type { APIContext } from 'astro';
import type { z } from 'zod';

export function clientIp(context: Pick<APIContext, 'clientAddress'>): string | null {
  try {
    return context.clientAddress;
  } catch {
    return null;
  }
}

/** Reads a small HTML form body and validates it. Returns null for anything unexpected. */
export async function readForm<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T> | null> {
  try {
    const form = await request.formData();
    const parsed = schema.safeParse(Object.fromEntries(form));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** HTML checkboxes send "yes" when ticked and nothing otherwise. */
export const isChecked = (value: string | undefined): boolean => value === 'yes';
