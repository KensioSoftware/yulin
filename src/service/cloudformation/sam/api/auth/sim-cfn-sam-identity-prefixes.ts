/**
 * How a REST API names the parts of a request an authorizer reads.
 */
export const samRestIdentityPrefixes: ReadonlyMap<string, string> = new Map([
  ["Headers", "method.request.header."],
  ["QueryStrings", "method.request.querystring."],
  ["StageVariables", "stageVariables."],
  ["Context", "context."],
]);

/**
 * How an HTTP API names the same parts.
 */
export const samHttpIdentityPrefixes: ReadonlyMap<string, string> = new Map([
  ["Headers", "$request.header."],
  ["QueryStrings", "$request.querystring."],
  ["StageVariables", "$stageVariables."],
  ["Context", "$context."],
]);

/**
 * The `Identity` properties this expansion reads. `Header` is the singular a
 * Cognito or `TOKEN` authorizer states, and reads as a `Headers` of one.
 */
export const samIdentityPropertyNames = new Set([
  "Header",
  "Headers",
  "QueryStrings",
  "StageVariables",
  "Context",
  "ReauthorizeEvery",
]);
