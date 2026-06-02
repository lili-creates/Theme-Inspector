// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

const playwrightStub = fileURLToPath(new URL("./src/lib/stubs/playwright.ts", import.meta.url));

/** Solo el build de Vercel/CI usa stub; en `pnpm dev` local va Playwright real (devDependency). */
const usePlaywrightStub = process.env.VERCEL === "1" || process.env.CI === "true";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: vercel({
    maxDuration: 10,
    imageService: true,
  }),
  vite: {
    resolve: {
      alias: usePlaywrightStub ? { playwright: playwrightStub } : {},
    },
    ssr: {
      external: usePlaywrightStub ? [] : ["playwright"],
    },
  },
});
