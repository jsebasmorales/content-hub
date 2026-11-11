import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUID v7 used for every primary key (SDD §4 conventions). */
export function newId(): string {
  return uuidv7();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed UUID. Lookups by id must check this before querying (never a 500). */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
