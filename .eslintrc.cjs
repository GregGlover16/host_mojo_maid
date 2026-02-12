/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.eslint.json",
    tsconfigRootDir: __dirname,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "prettier",
  ],
  rules: {
    // Force structured logging via pino, not console
    "no-console": "error",

    // Allow underscore-prefixed unused vars (common for destructuring)
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],

    // Catch floating promises (critical for async Fastify handlers)
    "@typescript-eslint/no-floating-promises": "error",

    // Require awaiting returned promises
    "@typescript-eslint/no-misused-promises": "error",

    // Fastify plugin functions and adapter stubs require async signatures
    // even when the body doesn't await. Warn instead of error.
    "@typescript-eslint/require-await": "off",
  },
  ignorePatterns: ["dist/", "node_modules/", "coverage/", "prisma/"],
};
