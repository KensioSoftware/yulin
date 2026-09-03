# Lint CloudFront Functions code

Yulin provides ESLint and Oxlint configs for the CloudFront Functions JavaScript 2.0 runtime. Both
configs apply to `**/*.cff.js`, the filename pattern used by
[simulated CloudFront](https://yulinsim.dev/services/cloudfront/ "Simulated CloudFront usage docs").

The runtime is ECMAScript 5.1 with selected features from ES 6 to 12. The lint rules follow AWS's
[runtime feature list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html).
They report unsupported syntax and globals before CloudFront rejects the function.

## Setting it up with ESLint

`@kensio/yulin/eslint` exports a flat config. Spread it into your config after any general rules it
needs to override:

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

The config keeps rules for syntax that JS2 supports, including `const`, `let`, template literals,
arrow functions, rest parameters, and `async`/`await`. It switches off `object-shorthand` because
JS2 does not support shorthand property names.

Install the optional `eslint` and `typescript-eslint` peer dependencies when you use this export.

## Setting it up with Oxlint

Extend Yulin's generated Oxlint config by its path in `node_modules`:

```json
{
  "extends": ["./node_modules/@kensio/yulin/cffjs2.oxlintrc.json"],
  "rules": {
    "no-console": "error"
  }
}
```

Oxlint's `extends` setting takes a file path. The fragment loads Yulin's JavaScript plugin and scopes
its rules to `**/*.cff.js`. Your own rules continue to apply to other files.

This config requires Oxlint 1.77 or later because it uses JavaScript plugin support.

## What is reported

Both configs load the same rules under the `cff-js2` name:

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

`cff-js2/no-unavailable-global` reports browser network APIs such as `fetch`, Node.js globals such as
`process`, and timer functions such as `setTimeout`. It resolves variables through JavaScript scope.
A local variable named `fetch` and a property such as `event.fetch` are allowed.

The configs also enable `no-eval`, `no-new-func`, and `no-implied-eval`. Their `no-unused-vars`
setting ignores the exported `handler` function because CloudFront calls it as the entry point.

## Supported JS2 syntax

The configs allow these JS2 features:

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

You can switch off one restriction without disabling the rest. For ESLint:

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

For Oxlint, add an `overrides` entry after `extends`:

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

- `@kensio/yulin/eslint` exports the `cloudFrontFunctionsJs2` flat config.
- `cffjs2.oxlintrc.json` in the package root contains the Oxlint config. The source object is exported
  as `cloudFrontFunctionsJs2Oxlint` from `@kensio/yulin/oxlint`.
- Both configs enable nine `cff-js2` rules and scope them to `**/*.cff.js`.

## Limitations

- The rules do not check the JS2 restrictions on `async` arguments and closures. They also do not
  check that `await` appears only inside an `async` function.
- `cff-js2/no-unavailable-global` covers common browser, Node.js, and timer globals. Other globals
  missing from JS2 may go unreported.
- The rules do not check CloudFront's function size or CPU limits. They also do not validate every
  method on each supported built-in.
- ESLint and Oxlint have different built-in rules. Only the `cff-js2` rules are shared.
- Oxlint's JavaScript plugin support is in alpha and may change upstream.
- Oxlint resolves the config through its path in `node_modules`. That path depends on the package
  manager's installation layout.
