/**
 * A CloudFront Function that stays inside what JS2 will run.
 *
 * It deliberately uses the ES 6 and ES 8 features the runtime's feature list
 * does name: `const`, `let`, template literals, arrow functions, rest
 * parameters and `async`/`await`. An earlier version of this config refused
 * all of those, so a fixture that only used ES 5.1 would have passed against
 * rules that were wrong.
 */
export const supportedCffJs2Source = `const suffix = "index.html";

const withSuffix = (uri) => \`\${uri}\${suffix}\`;

function firstDefined(...candidates) {
  for (var index = 0; index < candidates.length; index++) {
    if (candidates[index] !== undefined) {
      return candidates[index];
    }
  }

  return undefined;
}

export async function handler(event) {
  const request = event.request;
  let uri = firstDefined(request.uri, "/");

  if (uri.charAt(uri.length - 1) === "/") {
    uri = withSuffix(uri);
  }

  request.uri = await Promise.resolve(uri);

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
 * A case may trip more than one rule — unsupported syntax tends to arrive in
 * company — so what each asserts is that its own rule is among the findings.
 */
export const cffJs2Violations: readonly CffJs2Violation[] = [
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
    rule: "only-built-in-require",
    what: "requiring a module the runtime does not have",
    source: `var fs = require("node:fs");

export function handler(event) {
  return fs.readFileSync(event.request.uri);
}
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
  const { request } = event;

  return request;
}
`,
  },
  {
    rule: "no-spread",
    what: "spread syntax",
    source: `export function handler(event) {
  const headers = [event.request];

  return [...headers, event];
}
`,
  },
  {
    rule: "no-for-of",
    what: "a for...of loop",
    source: `export function handler(event) {
  let total = 0;

  for (const value of event.values) {
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

/**
 * Syntax JS2 does support, which no rule may report.
 *
 * These are here because each one was refused by an earlier version of this
 * config, and a rule that sends a reader away from working code is worse than
 * no rule at all.
 */
export const supportedCffJs2Cases: readonly {
  readonly what: string;
  readonly source: string;
}[] = [
  {
    what: "a template literal",
    source: "export function handler(event) {\n  return `/` + event.id;\n}\n",
  },
  {
    what: "an arrow function",
    source: `export function handler(event) {
  const pick = () => event.request;

  return pick();
}
`,
  },
  {
    what: "async and await",
    source: `export async function handler(event) {
  return await Promise.resolve(event.request);
}
`,
  },
  {
    what: "rest parameters",
    source: `function first(...values) {
  return values[0];
}

export function handler(event) {
  return first(event.request);
}
`,
  },
  {
    what: "a Promise",
    source: `export function handler(event) {
  return Promise.resolve(event.request);
}
`,
  },
  {
    what: "a Buffer",
    source: `export function handler(event) {
  return Buffer.from(event.request.uri, "utf8").toString("base64");
}
`,
  },
  {
    what: "requiring a built-in module",
    source: `var crypto = require("crypto");

export function handler(event) {
  return crypto.createHash("sha256").update(event.request.uri).digest("hex");
}
`,
  },
  {
    what: "const and let",
    source: `export function handler(event) {
  const request = event.request;
  let uri = request.uri;

  uri = uri + "/index.html";
  request.uri = uri;

  return request;
}
`,
  },
];
