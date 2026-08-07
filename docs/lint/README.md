# Linting CloudFront Functions JS2

CloudFront Functions run JS2, a restricted JavaScript dialect rather than a JavaScript engine with a
few gaps missing. Code using a template literal, an arrow function or `fetch` is refused when the
Function is published, which is a long way from where it was written. Yulin publishes lint configs
that refuse the same things in the editor.

The configs apply to `**/*.cff.js` files, which is the naming
[sim CloudFront](../services/cloudfront/ "Simulated CloudFront usage docs") already uses for
CloudFront Function source.

## Setting it up with ESLint

`@kensio/yulin/eslint` exports a flat config to spread into your own. It restricts itself to
`**/*.cff.js`, so the rest of your config still applies everywhere else.

```typescript cff-js2-eslint-config
/**
 * An ESLint config that lints CloudFront Function files as JS2.
 */

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";

import { cloudFrontFunctionsJs2 } from "@kensio/yulin/eslint";

export default defineConfig(
  eslint.configs.recommended,

  // Applies only to **/*.cff.js, so it goes after the configs it relaxes.
  ...cloudFrontFunctionsJs2,
);
```

It goes after any config whose rules it needs to turn off. A JS2 file is written with `var`, string
concatenation and no shorthand properties, so the modern-JavaScript rules a repository applies
everywhere else are advice to write code that will not run.

`eslint` and `typescript-eslint` are optional peer dependencies, needed only if you use this export.

## Setting it up with Oxlint

`@kensio/yulin/oxlint` ships the same rules as an Oxlint config fragment to extend. The rules
themselves are one plugin loaded by both linters, so the two configs report the same things in the
same places.

```json
{
  "extends": [
    "./node_modules/@kensio/yulin/dist/config/oxlint/cffjs2.oxlintrc.json"
  ],
  "rules": {
    "no-console": "error"
  }
}
```

Oxlint's `extends` takes a file path rather than a package name, so the path into `node_modules` is
written out. The fragment brings its own `overrides` entry scoped to `**/*.cff.js` and the JS plugin
the rules live in, and leaves every other file to your own rules.

The plugin is loaded through Oxlint's JS plugin support, which needs Oxlint 1.77 or later.

## What is reported

Each restriction is its own rule, under the `cff-js2` name in both linters.

| Rule                            | What it refuses                                      |
| ------------------------------- | ---------------------------------------------------- |
| `cff-js2/no-template-literal`   | Template literals, in favour of string concatenation |
| `cff-js2/no-import`             | `import` declarations, since a Function is one file  |
| `cff-js2/only-handler-export`   | Any export other than `export function handler(...)` |
| `cff-js2/no-class`              | Class declarations and expressions                   |
| `cff-js2/no-arrow-function`     | Arrow functions                                      |
| `cff-js2/no-async`              | `async` functions and `await`                        |
| `cff-js2/no-generator`          | Generators and `yield`                               |
| `cff-js2/no-destructuring`      | Object and array destructuring                       |
| `cff-js2/no-spread`             | Spread and rest syntax                               |
| `cff-js2/no-for-of`             | `for...of`, in favour of an index-based loop         |
| `cff-js2/no-unavailable-global` | Globals the runtime does not have, such as `fetch`   |

`cff-js2/no-unavailable-global` resolves names through scope rather than matching them as text, so a
local variable named `fetch` and a property named `event.fetch` are both left alone. Each unavailable
global reports why it is missing, because `fetch` being absent for want of a network and `setTimeout`
being absent for want of an event loop call for different rewrites.

Alongside these, both configs turn on `no-eval`, `no-new-func` and `no-implied-eval`, and set
`no-unused-vars` to leave `handler` alone, since it is the entry point CloudFront calls rather than
something the file itself uses.

## Turning one restriction off

Rules are individual, so a restriction you disagree with can be switched off on its own. In ESLint:

```typescript cff-js2-eslint-relax
/**
 * Allowing arrow functions in CloudFront Function files.
 */

import { defineConfig } from "eslint/config";

import { cloudFrontFunctionsJs2 } from "@kensio/yulin/eslint";

export default defineConfig(...cloudFrontFunctionsJs2, {
  files: ["**/*.cff.js"],
  rules: {
    "cff-js2/no-arrow-function": "off",
  },
});
```

In Oxlint, the same thing goes in an `overrides` entry after the `extends`:

```json
{
  "extends": [
    "./node_modules/@kensio/yulin/dist/config/oxlint/cffjs2.oxlintrc.json"
  ],
  "overrides": [
    {
      "files": ["**/*.cff.js"],
      "rules": {
        "cff-js2/no-arrow-function": "off"
      }
    }
  ]
}
```

## Available functionality

- A flat ESLint config at `@kensio/yulin/eslint`, exported as `cloudFrontFunctionsJs2`
- An Oxlint config fragment at `dist/config/oxlint/cffjs2.oxlintrc.json`, with the object it is
  generated from exported as `cloudFrontFunctionsJs2Oxlint` from `@kensio/yulin/oxlint`
- Eleven `cff-js2` rules, one per restriction, shared by both linters
- Scoping to `**/*.cff.js`, so a repository's own rules are untouched elsewhere

## Limitations

Where the configs knowingly stop short:

- **Only the `cff-js2` rules are shared between the linters.** ESLint and Oxlint each bring their own
  built-in rules, and their own defaults for which are on. A `.cff.js` file linted by both may pick
  up findings from one that the other does not have.
- **The rules are syntactic.** Nothing here knows CloudFront's size limit on Function code or its
  CPU budget, so a Function that passes the lint can still be refused at publication for being too
  large or too slow.
- **The list of unavailable globals is the useful part of one, not all of it.** It names what test
  code and Node habits reach for. A global outside that list is not reported, even if JS2 lacks it.
- **Oxlint's JS plugin support is in alpha.** It is what loads these rules into Oxlint, and its API
  is still moving upstream.
- **The Oxlint fragment is extended by path.** Oxlint does not resolve a package name in `extends`,
  so the path into `node_modules` is written out and depends on your installer's layout.
