/// <reference types="astro/client" />
import type { Principal } from '@application/use-cases/resolve-session';

declare global {
  namespace App {
    interface Locals {
      /** Correlates logs and responses for one request (SDD §14). */
      requestId: string;
      /** The signed-in user and their permissions, or null for visitors. */
      principal: Principal | null;
    }
  }
}
