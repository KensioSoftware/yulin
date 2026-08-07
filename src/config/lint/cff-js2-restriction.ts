/**
 * What the CloudFront Functions JS2 runtime will not run, as syntax selectors.
 *
 * JS2 is compliant with ECMAScript 5.1 and adds a named subset of ES 6 to 12,
 * so a Function that uses something outside that subset fails when it is
 * published, a long way from where it was written. Each entry names a
 * construct the runtime has no support for and says what to write instead, so
 * the refusal arrives in the editor.
 *
 * Every entry is drawn from the runtime's own feature list, which is an
 * allow-list: anything the documentation does not name is unsupported. Nothing
 * here is house style. A restriction on syntax JS2 accepts would send a reader
 * away from code that works, which is worse than no lint rule at all.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html
 *
 * The selector syntax is the one both ESLint and Oxlint accept, which is what
 * lets a single rule module serve either linter.
 */
export const cffJs2SyntaxRestrictions = {
  "no-import": {
    selector: "ImportDeclaration",
    message:
      "CloudFront Functions must be self-contained and should not use import syntax.",
  },
  "only-handler-export": {
    selector:
      "ExportNamedDeclaration:not([declaration.type='FunctionDeclaration'][declaration.id.name='handler']), ExportDefaultDeclaration, ExportAllDeclaration",
    message:
      "CloudFront Function files may only export the handler as `export function handler(...)`.",
  },
  "only-built-in-require": {
    selector:
      "CallExpression[callee.name='require']:not(:has(Literal[value='querystring'])):not(:has(Literal[value='crypto'])):not(:has(Literal[value='buffer']))",
    message:
      "CloudFront Functions can only require the built-in `querystring`, `crypto` and `buffer` modules. Everything else must be inlined.",
  },
  "no-class": {
    selector: "ClassDeclaration, ClassExpression",
    message:
      "CloudFront Functions JS2 does not support class syntax. Use a constructor function or a plain object instead.",
  },
  "no-generator": {
    selector:
      "YieldExpression, FunctionDeclaration[generator=true], FunctionExpression[generator=true]",
    message: "CloudFront Functions JS2 does not support generators.",
  },
  "no-destructuring": {
    selector: "ObjectPattern, ArrayPattern",
    message:
      "CloudFront Functions JS2 does not support destructuring. Read the properties one at a time instead.",
  },
  "no-spread": {
    // Rest parameters are a separate ES 6 feature that JS2 does name as
    // supported, and they share the `RestElement` node, so only spread is
    // matched here.
    selector: "SpreadElement",
    message:
      "CloudFront Functions JS2 does not support spread syntax. Rest parameters are supported, so `function f(...args)` is fine, but `[...list]` is not.",
  },
  "no-for-of": {
    selector: "ForOfStatement",
    message:
      "CloudFront Functions JS2 does not support for...of. Use an index-based loop or for...in instead.",
  },
} as const satisfies Readonly<
  Record<string, { readonly selector: string; readonly message: string }>
>;

/**
 * Globals a CloudFront Function cannot reach, and why each one is absent.
 *
 * These read as ordinary JavaScript and fail only at the edge, which is the
 * worst place to find out. The reason matters as much as the refusal: `fetch`
 * is missing because the runtime has no network, and `setTimeout` because it
 * has no event loop, and those two dead ends want different rewrites.
 *
 * `Promise` and `Buffer` are deliberately absent from this list. Both are
 * supported in runtime 2.0, and an earlier version of this config refused them.
 */
export const cffJs2UnavailableGlobals = {
  fetch: "CloudFront Functions cannot make network requests.",
  XMLHttpRequest: "CloudFront Functions cannot make network requests.",
  WebSocket: "CloudFront Functions cannot open network connections.",
  process: "CloudFront Functions do not have access to Node.js process APIs.",
  setTimeout:
    "CloudFront Functions do not support timers, and must run to completion synchronously.",
  setInterval:
    "CloudFront Functions do not support timers, and must run to completion synchronously.",
  setImmediate:
    "CloudFront Functions do not support timers, and must run to completion synchronously.",
  clearTimeout:
    "CloudFront Functions do not support timers, so there is nothing to clear.",
} as const satisfies Readonly<Record<string, string>>;

/**
 * The name of the rule that reports an unavailable global.
 *
 * It is kept apart from the syntax restrictions because it resolves names
 * through scope rather than matching a selector.
 */
export const cffJs2UnavailableGlobalRuleName = "no-unavailable-global";
