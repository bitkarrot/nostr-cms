import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import htmlEslint from "@html-eslint/eslint-plugin";
import htmlParser from "@html-eslint/parser";
import customRules from "./eslint-rules/index.js";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error", // Reports unused disable directives as errors
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "custom": customRules,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true,
        },
      ],
      "custom/no-placeholder-comments": "error",
      "no-warning-comments": [
        "error",
        { terms: ["fixme"] },
      ],
    },
  },
  {
    // SRV-01 / T-01-04: server-only import guard scoped to src/**.
    // Server-only packages (resend, better-sqlite3, csv-parse, pg) and any
    // relative import reaching into server/ are forbidden in client code so
    // secrets/Node-only code never leak into the public SPA bundle.
    // server/ files legitimately import these deps and are NOT matched here.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "resend", message: "resend is server-only. Import it from server/ only." },
          { name: "better-sqlite3", message: "better-sqlite3 is server-only. Import it from server/ only." },
          { name: "csv-parse", message: "csv-parse is server-only. Import it from server/ only." },
          { name: "pg", message: "pg is server-only. Import it from server/ only." },
        ],
        patterns: [
          {
            // WR-06: cover relative imports reaching into server/ at any depth.
            // The finite list (server/*, ../server/*, ../../server/*, ...)
            // had a depth ceiling — a 4+-deep src/ file could bypass the guard.
            // `**/server/*` matches `server/*` and any `../.../server/*` depth.
            group: ["**/server/*", "**/../server/*", "../../server/*", "../../../server/*", "../../../../server/*", "../../../../../server/*"],
            message: "Importing from server/ is forbidden in src/ (server-only boundary).",
          },
        ],
      }],
    },
  },
  {
    files: ["**/*.html"],
    plugins: {
      "@html-eslint": htmlEslint,
      "custom": customRules,
    },
    languageOptions: {
      parser: htmlParser,
    },
    rules: {
      "@html-eslint/require-title": "error",
      "@html-eslint/require-meta-charset": "error",
      "@html-eslint/require-meta-description": "error",
      "@html-eslint/require-meta-viewport": "error",
      "@html-eslint/require-open-graph-protocol": [
        "error",
        [
          "og:type",
          "og:title",
          "og:description",
        ],
      ],
      "custom/no-inline-script": "error",
      "custom/require-webmanifest": "error",
    },
  }
);
