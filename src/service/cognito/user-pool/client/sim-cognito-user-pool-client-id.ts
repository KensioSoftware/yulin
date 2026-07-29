import { faker } from "@faker-js/faker";
import type { Brand } from "../../../../util/brand.type.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

export type SimCognitoUserPoolClientId = Brand<
  string,
  "SimCognitoUserPoolClientId"
>;

/**
 * Real app client ids are twenty-six lowercase alphanumerics, with nothing in
 * them naming the pool they belong to. That is why every app client operation
 * takes the pool id as well as the client id.
 */
const clientIdLength = 26;

const clientIdPattern = /^[\w+]+$/u;
const maxClientIdLength = 128;

/**
 * Allocate an app client id.
 */
export function makeSimCognitoUserPoolClientId(
  existing = new Set<string>(),
): SimCognitoUserPoolClientId {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const clientId = faker.string.alphanumeric({
      length: clientIdLength,
      casing: "lower",
    }) as SimCognitoUserPoolClientId;

    if (!existing.has(clientId)) {
      return clientId;
    }
  }

  /* v8 ignore next -- unlikely to happen in practice */
  throw new Error("Could not allocate unique Cognito app client id");
}

/**
 * Read a requested app client id, or refuse a malformed one.
 */
export function requireSimCognitoUserPoolClientId(
  value: string | undefined,
): SimCognitoUserPoolClientId {
  if (value === undefined || value === "") {
    throw new SimCognitoInvalidParameterException(
      "ClientId is required: name the app client the request is for",
    );
  }

  if (value.length > maxClientIdLength || !clientIdPattern.test(value)) {
    throw new SimCognitoInvalidParameterException(
      `ClientId '${value}' is not an app client id`,
    );
  }

  return value as SimCognitoUserPoolClientId;
}
