import { faker } from "@faker-js/faker";
import type { Brand } from "../../../util/brand.type.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

export type SimCognitoUserPoolId = Brand<string, "SimCognitoUserPoolId">;

/**
 * The number of random characters a user pool id carries after its region.
 *
 * Real Cognito ids look like `eu-west-2_aBcDeFgHi`: the region the pool lives
 * in, an underscore, then nine mixed-case alphanumerics.
 */
const userPoolIdSuffixLength = 9;

const userPoolIdPattern = /^[\w-]+_[0-9a-zA-Z]+$/u;

const maxUserPoolIdLength = 55;

/**
 * Allocate a user pool id for a region.
 *
 * The region is part of the id rather than decoration: SDK code routinely
 * splits a pool id on the underscore to work out which region to talk to, and
 * the hosted issuer URL is built from it the same way.
 */
export function makeSimCognitoUserPoolId(
  regionName: AwsRegionName,
  existing = new Set<string>(),
): SimCognitoUserPoolId {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const userPoolId = `${regionName}_${faker.string.alphanumeric({
      length: userPoolIdSuffixLength,
    })}` as SimCognitoUserPoolId;

    if (!existing.has(userPoolId)) {
      return userPoolId;
    }
  }

  /* v8 ignore next -- unlikely to happen in practice */
  throw new Error("Could not allocate unique Cognito user pool id");
}

/**
 * Read a requested user pool id, or refuse a malformed one.
 *
 * Real Cognito validates the id's shape before it looks anything up, so a
 * value that is not a pool id at all fails as a validation error rather than
 * as a missing pool.
 */
export function requireSimCognitoUserPoolId(
  value: string | undefined,
): SimCognitoUserPoolId {
  if (value === undefined || value === "") {
    throw new SimCognitoInvalidParameterException(
      "UserPoolId is required: name the pool the request is for",
    );
  }

  if (value.length > maxUserPoolIdLength || !userPoolIdPattern.test(value)) {
    throw new SimCognitoInvalidParameterException(
      `UserPoolId '${value}' is not a user pool id: ids take the ` +
        `'<region>_<characters>' form, such as 'eu-west-2_aBcDeFgHi'`,
    );
  }

  return value as SimCognitoUserPoolId;
}
