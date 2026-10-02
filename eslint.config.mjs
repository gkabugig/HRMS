import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // A Next.js server action bound with .bind(null, ...extraArgs) for a
      // <form action={...}> must still declare a trailing FormData
      // parameter (Next.js appends the submitted form data there itself),
      // even when the action has nothing to read from it. An underscore
      // prefix is this codebase's existing convention for "intentionally
      // unused" (see setKnowledgeSourceActive's `_formData`) - this just
      // makes the linter actually honor that convention instead of still
      // flagging it.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
]);

export default eslintConfig;
