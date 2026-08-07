/**
 * What the CloudFront Functions JS2 runtime will not run, as syntax selectors.
 *
 * JS2 is a restricted ECMAScript dialect rather than a JavaScript engine with
 * a few gaps, so a function that only fails once CloudFront rejects it fails a
 * long way from where it was written. Each entry names a construct the runtime
 * has no support for and says what to write instead, so the refusal arrives in
 * the editor rather than at deployment.
 *
 * The selector syntax is the one both ESLint and Oxlint accept, which is what
 * lets a single rule module serve either linter.
 */
export const cffJs2SyntaxRestrictions = {
  "no-template-literal": {
    selector: "TemplateLiteral",
    message:
      "CloudFront Functions JS2 does not support template literals. Use string concatenation instead.",
  },
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
  "no-class": {
    selector: "ClassDeclaration, ClassExpression",
    message: "Avoid class syntax in CloudFront Functions JS2 files.",
  },
  "no-arrow-function": {
    selector: "ArrowFunctionExpression",
    message:
      "Avoid arrow functions in CloudFront Functions JS2 files. Use function declarations/expressions instead.",
  },
  "no-async": {
    selector:
      "AwaitExpression, FunctionDeclaration[async=true], FunctionExpression[async=true], ArrowFunctionExpression[async=true]",
    message: "CloudFront Functions should not use async/await.",
  },
  "no-generator": {
    selector:
      "YieldExpression, FunctionDeclaration[generator=true], FunctionExpression[generator=true]",
    message: "CloudFront Functions should not use generators.",
  },
  "no-destructuring": {
    selector: "ObjectPattern, ArrayPattern",
    message: "Avoid destructuring in CloudFront Functions JS2 files.",
  },
  "no-spread": {
    selector: "SpreadElement, RestElement",
    message: "Avoid spread/rest syntax in CloudFront Functions JS2 files.",
  },
  "no-for-of": {
    selector: "ForOfStatement",
    message:
      "Avoid for...of in CloudFront Functions JS2 files. Use index-based loops instead.",
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
 */
export const cffJs2UnavailableGlobals = {
  fetch: "CloudFront Functions cannot make network requests.",
  XMLHttpRequest: "CloudFront Functions cannot make network requests.",
  WebSocket: "CloudFront Functions cannot open network connections.",
  require:
    "CloudFront Functions must be self-contained and cannot require modules.",
  process: "CloudFront Functions do not have access to Node.js process APIs.",
  Buffer: "CloudFront Functions do not have access to Node.js Buffer.",
  setTimeout: "CloudFront Functions do not support timers.",
  setInterval: "CloudFront Functions do not support timers.",
  setImmediate: "CloudFront Functions do not support timers.",
  Promise: "Avoid Promise usage in CloudFront Functions.",
} as const satisfies Readonly<Record<string, string>>;

/**
 * The name of the rule that reports an unavailable global.
 *
 * It is kept apart from the syntax restrictions because it resolves names
 * through scope rather than matching a selector.
 */
export const cffJs2UnavailableGlobalRuleName = "no-unavailable-global";
