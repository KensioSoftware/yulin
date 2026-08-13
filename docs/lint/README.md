# Linting CloudFront Functions JS2

CloudFront Functions run JS2, which is ECMAScript 5.1 plus a named subset of ES 6 to 12 rather than a
current JavaScript engine. Code using a class, `for...of` or `fetch` is refused when the Function is
published, which is a long way from where it was written. Yulin publishes lint configs that refuse
the same things in the editor.

The configs apply to `**/*.cff.js` files, which is the naming
[sim CloudFront](../services/cloudfront/ "Simulated CloudFront usage docs") already uses for
CloudFront Function source.

Every restriction comes from the runtime's
[own feature list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html),
which is an allow-list: anything it does not name is unsupported. Nothing here is house style. A rule
banning syntax JS2 accepts would send you away from code that works.

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

It goes after any config whose rules it needs to turn off, which is a short list. `const`, `let`,
template literals, arrow functions, rest parameters and `async`/`await` all work in JS2, so the
rules asking for them stay on. Only `object-shorthand` is switched off, because shorthand property
names are ES 6 literal syntax the runtime does not have.

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

| Rule                            | What it refuses                                          |
| ------------------------------- | -------------------------------------------------------- |
| `cff-js2/no-import`             | `import` declarations, apart from `cloudfront`           |
| `cff-js2/only-handler-export`   | Any export other than `export function handler(...)`     |
| `cff-js2/only-built-in-require` | Requiring anything but `querystring`, `crypto`, `buffer` |
| `cff-js2/no-class`              | Class declarations and expressions                       |
| `cff-js2/no-generator`          | Generators and `yield`                                   |
| `cff-js2/no-destructuring`      | Object and array destructuring                           |
| `cff-js2/no-spread`             | Spread syntax, but not rest parameters                   |
| `cff-js2/no-for-of`             | `for...of`, in favour of an index-based loop             |
| `cff-js2/no-unavailable-global` | Globals the runtime does not have, such as `fetch`       |

`cff-js2/no-unavailable-global` covers `fetch`, `XMLHttpRequest` and `WebSocket`, which need a
network the runtime does not have; `process`, which needs Node.js; and `setTimeout`, `setInterval`,
`setImmediate` and `clearTimeout`, which need an event loop a Function does not get. It resolves
names through scope rather than matching them as text, so a local variable named `fetch` and a
property named `event.fetch` are both left alone. Each report says why the global is missing, because
`fetch` being absent for want of a network and `setTimeout` for want of an event loop call for
different rewrites.

Alongside these, both configs turn on `no-eval`, `no-new-func` and `no-implied-eval`, which the
runtime refuses outright, and set `no-unused-vars` to leave `handler` alone, since it is the entry
point CloudFront calls rather than something the file itself uses.

## What is not reported

These all work in JS2 and no rule here objects to them:

- Template literals, including interpolation and nesting
- Arrow functions and rest parameters
- `const` and `let`
- `async` and `await`
- `Promise`, including `all`, `allSettled`, `any` and `race`
- `Buffer`, and `require` of `querystring`, `crypto` or `buffer`
- `import cf from "cloudfront"`, which is how a Function reaches `cf.kvs()` and
  `cf.updateRequestOrigin()`
- `String.prototype.replaceAll`, `atob`, `btoa` and numeric separators

## Turning one restriction off

Rules are individual, so a restriction you disagree with can be switched off on its own. In ESLint:

```typescript cff-js2-eslint-relax
/**
 * Allowing class syntax in CloudFront Function files.
 */

import { defineConfig } from "eslint/config";

import { cloudFrontFunctionsJs2 } from "@kensio/yulin/eslint";

export default defineConfig(...cloudFrontFunctionsJs2, {
  files: ["**/*.cff.js"],
  rules: {
    "cff-js2/no-class": "off",
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
        "cff-js2/no-class": "off"
      }
    }
  ]
}
```

## Available functionality

- A flat ESLint config at `@kensio/yulin/eslint`, exported as `cloudFrontFunctionsJs2`
- An Oxlint config fragment at `dist/config/oxlint/cffjs2.oxlintrc.json`, with the object it is
  generated from exported as `cloudFrontFunctionsJs2Oxlint` from `@kensio/yulin/oxlint`
- Nine `cff-js2` rules, one per restriction, shared by both linters
- Scoping to `**/*.cff.js`, so a repository's own rules are untouched elsewhere

## Limitations

Where the configs knowingly stop short:

- **`async` arguments and closures are not checked.** JS2 supports `async` and `await`, but not
  `async` arguments or closures, and `await` only inside an `async` function. Where the runtime's
  wording stops short of saying exactly which forms those are, no rule guesses at it, so a Function
  can pass the lint and still be refused for one.
- **The list of unavailable globals is the useful part of one, not all of it.** It names what test
  code and Node habits reach for. A global outside that list is not reported, even if JS2 lacks it.
- **The rules are syntactic.** Nothing here knows CloudFront's size limit on Function code or its CPU
  budget, so a Function that passes the lint can still be refused at publication for being too large
  or too slow. Nothing checks which methods of a supported built-in you call either, and the runtime
  supports only some of them.
- **Only the `cff-js2` rules are shared between the linters.** ESLint and Oxlint each bring their own
  built-in rules, and their own defaults for which are on. A `.cff.js` file linted by both may pick
  up findings from one that the other does not have.
- **Oxlint's JS plugin support is in alpha.** It is what loads these rules into Oxlint, and its API
  is still moving upstream.
- **The Oxlint fragment is extended by path.** Oxlint does not resolve a package name in `extends`,
  so the path into `node_modules` is written out and depends on your installer's layout.
