const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    supportFile: "cypress/support/e2e.js",
    video: false,
    viewportWidth: 1400,
    viewportHeight: 900,
    setupNodeEvents(on, config) {
      return config;
    },
  },
});
