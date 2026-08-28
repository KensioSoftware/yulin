# Linting CFF JS2

CloudFront Functions run JS2, ECMAScript 5.1 with a named subset of ES 6 to 12 on top, rather than
a current JavaScript engine. A class or a `for...of` is a syntax error, and CloudFront refuses the
code when you upload it. A call to `fetch` parses, and then fails at the edge, where that global is
absent and there is no network to reach. Both are a long way from where the code was written, and
Yulin publishes lint configs that refuse the same things in the editor.

The configs apply to `**/*.cff.js` files. That is the naming
[sim CloudFront](https://yulinsim.dev/services/cloudfront/ "Simulated CloudFront usage docs") already uses for
CloudFront Function source.

Every restriction comes from the runtime's
[own feature list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html),
an allow-list, and anything outside it is unsupported. None of it is house style. A rule
banning syntax JS2 accepts would send you away from code that works.

## Setting it up with ESLint

`@kensio/yulin/eslint` exports a flat config to spread into your own. It restricts itself to
`**/*.cff.js`. The rest of your config still applies everywhere else.

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

It goes after any config whose rules it needs to turn off. That is a short list. `const`, `let`,
template literals, arrow functions, rest parameters and `async`/`await` all work in JS2, and the
rules asking for them stay on. Only `object-shorthand` is switched off, because shorthand property
names are ES 6 literal syntax the runtime lacks.

`eslint` and `typescript-eslint` are optional peer dependencies, needed only if you use this export.

## Setting it up with Oxlint

`@kensio/yulin/oxlint` ships the same rules as an Oxlint config fragment to extend. The rules
themselves are one plugin loaded by both linters. The two configs report the same things in the same
places.

```json
{
  "extends": ["./node_modules/@kensio/yulin/cffjs2.oxlintrc.json"],
  "rules": {
    "no-console": "error"
  }
}
```

Oxlint's `extends` takes a file path rather than a package name. The path into `node_modules` is
written out in full. The file sits in the package root. A build that moves what it emits under
`dist/` leaves the path alone. The fragment brings its own `overrides` entry scoped to `**/*.cff.js`
and the JS plugin the rules live in, and leaves every other file to your own rules.

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

`cff-js2/no-unavailable-global` covers three groups. `fetch`, `XMLHttpRequest` and `WebSocket` need
a network the runtime lacks. `process` needs Node.js. `setTimeout`, `setInterval`, `setImmediate`
and `clearTimeout` need an event loop a Function never gets. The rule resolves names through scope
rather than matching them as text, and a local variable named `fetch` or a property named
`event.fetch` is left alone. Each report says why the global is missing, because `fetch` being
absent for want of a network and `setTimeout` for want of an event loop call for different rewrites.

Alongside these, both configs turn on `no-eval`, `no-new-func` and `no-implied-eval`, which the
runtime refuses outright. They also set `no-unused-vars` to leave `handler` alone, since it is the
entry point CloudFront calls.

## What is not reported

These all work in JS2 and no rule here objects to them:

- Template literals, including interpolation and nesting
- Arrow functions and rest parameters
- `const` and `let`
- `async` and `await`
- `Promise`, including `all`, `allSettled`, `any` and `race`
- `Buffer`, and `require` of `querystring`, `crypto` or `buffer`
- `import cf from "cloudfront"`, which a Function needs for `cf.kvs()` and
  `cf.updateRequestOrigin()`
- `String.prototype.replaceAll`, `atob`, `btoa` and numeric separators

## Turning one restriction off

Rules are individual. A restriction you disagree with can be switched off on its own. In ESLint:

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
  "extends": ["./node_modules/@kensio/yulin/cffjs2.oxlintrc.json"],
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
- An Oxlint config fragment at `cffjs2.oxlintrc.json` in the package root, with the object it is
  generated from exported as `cloudFrontFunctionsJs2Oxlint` from `@kensio/yulin/oxlint`
- Nine `cff-js2` rules, one per restriction, shared by both linters
- Scoping to `**/*.cff.js`, leaving a repository's own rules untouched elsewhere

## Limitations

Where the configs knowingly stop short:

- **`async` arguments and closures are not checked.** JS2 supports `async` and `await`, but not
  `async` arguments or closures, and `await` only inside an `async` function. Where the runtime's
  wording stops short of saying exactly which forms those are, no rule guesses at it. A Function can
  pass the lint and still be refused for one.
- **The list of unavailable globals is the useful part of one, not all of it.** It names what test
  code and Node habits reach for. A global outside that list goes unreported, even if JS2 lacks it.
- **The rules are syntactic.** Nothing here knows CloudFront's size limit on Function code or its CPU
  budget. A Function that passes the lint can still be refused at publication for being too large or
  too slow. No rule checks which methods of a supported built-in you call either, and the runtime
  supports only some of them.
- **Only the `cff-js2` rules are shared between the linters.** ESLint and Oxlint each bring their own
  built-in rules, and their own defaults for which are on. A `.cff.js` file linted by both may pick
  up findings from one that the other lacks.
- **Oxlint's JS plugin support is in alpha.** It is what loads these rules into Oxlint, and its API
  is still moving upstream.
- **The Oxlint fragment is extended by path.** Oxlint has no package-name resolution in `extends`.
  The written-out path into `node_modules` depends on your installer's layout.
