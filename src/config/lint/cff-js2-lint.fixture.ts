/**
 * A CloudFront Function that stays inside what JS2 will run.
 *
 * It is here so a test can show the restrictions staying quiet on code that
 * respects them, which is the half an over-broad selector breaks first.
 */
export const supportedCffJs2Source = `function normalise(uri) {
  var trimmed = uri;

  if (trimmed.charAt(trimmed.length - 1) === "/") {
    trimmed = trimmed + "index.html";
  }

  return trimmed;
}

export function handler(event) {
  var request = event.request;
  request.uri = normalise(request.uri);

  return request;
}
`;

/**
 * One construct JS2 refuses, and the rule that should say so.
 */
export interface CffJs2Violation {
  readonly rule: string;
  readonly what: string;
  readonly source: string;
}

/**
 * A case per restriction, each written the way the mistake actually shows up.
 *
 * Every rule in the plugin needs one, so that a rule whose selector stops
 * matching is a failing test rather than a quiet gap in what gets caught.
 * A case may trip more than one rule — banned syntax tends to arrive in
 * company — so what each asserts is that its own rule is among the findings.
 */
export const cffJs2Violations: readonly CffJs2Violation[] = [
  {
    rule: "no-template-literal",
    what: "a template literal",
    source: "export function handler(event) {\n  return `/` + event.id;\n}\n",
  },
  {
    rule: "no-import",
    what: "an import",
    source: `import { helper } from "./helper.js";

export function handler() {
  return helper();
}
`,
  },
  {
    rule: "only-handler-export",
    what: "an export other than the handler",
    source: `export var version = 1;

export function handler() {}
`,
  },
  {
    rule: "only-handler-export",
    what: "a default export",
    source: `export default function handler() {}
`,
  },
  {
    rule: "only-handler-export",
    what: "a re-export",
    source: `export * from "./helper.js";
`,
  },
  {
    rule: "no-class",
    what: "a class",
    source: `class Router {}

export function handler() {
  return new Router();
}
`,
  },
  {
    rule: "no-arrow-function",
    what: "an arrow function",
    source: `export function handler(event) {
  var pick = () => event.request;

  return pick();
}
`,
  },
  {
    rule: "no-async",
    what: "async and await",
    source: `export async function handler(event) {
  return await event.request;
}
`,
  },
  {
    rule: "no-generator",
    what: "a generator",
    source: `function* each() {
  yield 1;
}

export function handler() {
  return each();
}
`,
  },
  {
    rule: "no-destructuring",
    what: "destructuring",
    source: `export function handler(event) {
  var { request } = event;

  return request;
}
`,
  },
  {
    rule: "no-spread",
    what: "spread syntax",
    source: `export function handler(event) {
  var headers = [event.request];

  return [...headers, event];
}
`,
  },
  {
    rule: "no-for-of",
    what: "a for...of loop",
    source: `export function handler(event) {
  var total = 0;

  for (var value of event.values) {
    total = total + value;
  }

  return total;
}
`,
  },
  {
    rule: "no-unavailable-global",
    what: "a global the runtime does not have",
    source: `export function handler(event) {
  fetch("https://example.test");

  return event;
}
`,
  },
];
