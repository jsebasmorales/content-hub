import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUID v7 used for every primary key (SDD §4 conventions). */
export function newId(): string {
  return uuidv7();
}
