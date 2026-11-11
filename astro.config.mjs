// @ts-check
import netlify from '@astrojs/netlify';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  // Sessions live in our own database (SDD §2), not in Netlify Blobs.
  session: false,
  security: {
    // CSRF protection for POST/PUT/PATCH/DELETE (SDD §2, mandatory).
    checkOrigin: true,
  },
});
