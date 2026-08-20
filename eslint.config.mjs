import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // AppleDouble sidecars. A Mac writes "._name" next to "name" to hold the
    // resource fork, and they ride along through Drive and zips. They are binary,
    // eslint tries to parse them as JavaScript, and every one becomes "Parsing
    // error: Unexpected character". There were 226 of them drowning 13 real
    // errors. None is tracked by git, so this only ever affects a local run.
    "**/._*",
    // generated Prisma client - not ours to lint
    "src/generated/**",
    // gitignored working notes, and the pre-Next static site kept for reference
    "docs/**",
    "local-docs/**",
    "archive/**",
    "mls-handoff/**",
  ]),
]);

export default eslintConfig;
