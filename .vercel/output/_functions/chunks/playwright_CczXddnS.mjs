const chromium = {
  launch: async () => {
    throw new Error("Playwright is not available in this build");
  }
};

export { chromium };
