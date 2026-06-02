/**
 * Stub used for Vercel/production builds so Playwright is not bundled.
 * Local full probe: ENABLE_PLAYWRIGHT=true, devDependency playwright, chromium installed.
 */
export const chromium = {
  launch: async (): Promise<never> => {
    throw new Error("Playwright is not available in this build");
  },
};
