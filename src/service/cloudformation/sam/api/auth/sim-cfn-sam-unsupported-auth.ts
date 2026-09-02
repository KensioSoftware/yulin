/**
 * The `Auth` properties an API can declare that this expansion does not model,
 * and what each one would have done.
 *
 * Every one of them is refused by name rather than dropped, because an API
 * that quietly lost part of its `Auth` block deploys open under a template
 * that reads as closed.
 */
export const samUnsupportedApiAuth: ReadonlyMap<string, string> = new Map([
  [
    "AddDefaultAuthorizerToCorsPreflight",
    "it decides whether the OPTIONS method a Cors block generates is " +
      "authorized, and Cors is not expanded here",
  ],
  ["ApiKeyRequired", "API keys and usage plans are not simulated"],
  ["UsagePlan", "API keys and usage plans are not simulated"],
  [
    "InvokeRole",
    "it names the Role API Gateway calls the integration as, and an " +
      "integration here is invoked as the API rather than as a Role",
  ],
  [
    "ResourcePolicy",
    "an API Gateway resource policy is not simulated. Close the API with an " +
      "authorizer instead",
  ],
]);

/**
 * The `Auth` properties an `Api` or `HttpApi` event can declare that this
 * expansion does not model.
 */
export const samUnsupportedEventAuth: ReadonlyMap<string, string> = new Map([
  ["ApiKeyRequired", "API keys and usage plans are not simulated"],
  [
    "InvokeRole",
    "it names the Role API Gateway calls the integration as, and an " +
      "integration here is invoked as the API rather than as a Role",
  ],
  [
    "ResourcePolicy",
    "an API Gateway resource policy is not simulated. Close the method with " +
      "an authorizer instead",
  ],
  [
    "OverrideApiAuth",
    "it lets an event replace the API's own Auth block rather than name one " +
      "of its authorizers",
  ],
]);

/**
 * The `Identity` properties of an authorizer this expansion does not model.
 */
export const samUnsupportedIdentity: ReadonlyMap<string, string> = new Map([
  [
    "ValidationExpression",
    "it turns a token that does not match into a 401 before the authorizer " +
      "runs, and that check is not simulated",
  ],
]);
