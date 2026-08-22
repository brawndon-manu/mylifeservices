import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

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
  // A NAME NOTHING DECLARES IS AN ERROR, NOT A RUNTIME SURPRISE.
  //
  // eslint-config-next leaves `no-undef` off because it assumes TypeScript is
  // catching this. This project is plain JavaScript, so nothing was.
  //
  // 2026-08-22: deleting the retired rest break audit out of analyze.js also
  // deleted the line declaring `last` and `first`, which the SCHEDULE matcher
  // below it still used. The file parsed, eslint said nothing, and all 880
  // tests passed - none of them calls analyzeDayProgram, which needs real PDF
  // and XLS bytes. Every day program upload would have thrown ReferenceError on
  // the first employee. Running the real files is what found it.
  //
  // Turned on across src at zero violations, so this costs nothing and refuses
  // that whole class of edit.
  {
    files: ["src/**/*.js", "src/**/*.mjs", "src/**/*.jsx"],
    languageOptions: {
      // otherwise every window/document/process/fetch reads as undefined
      globals: { ...globals.browser, ...globals.node },
    },
    rules: { "no-undef": "error" },
  },
]);

export default eslintConfig;
