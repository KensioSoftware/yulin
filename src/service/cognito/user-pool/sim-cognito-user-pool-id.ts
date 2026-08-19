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

/**
 * Read a requested user pool id that has to belong to one Region.
 *
 * A pool id carries the Region its pool lives in, and a pool's ARN carries the
 * Region of the simulated Cognito holding it. Registering a pool under an id
 * from another Region would name two Regions in one pool, which no real pool
 * does.
 */
export function requireSimCognitoUserPoolIdInRegion(
  value: string | undefined,
  regionName: string,
): SimCognitoUserPoolId {
  const userPoolId = requireSimCognitoUserPoolId(value);
  const idRegionName = simCognitoUserPoolRegionName(userPoolId);

  if (idRegionName !== regionName) {
    throw new SimCognitoInvalidParameterException(
      `UserPoolId '${userPoolId}' names Region ${idRegionName}, and this ` +
        `simulated Cognito is ${regionName}. Register the pool on the ` +
        `simulated Cognito of Region ${idRegionName}.`,
    );
  }

  return userPoolId;
}

/**
 * The Region a pool lives in, which its id names.
 *
 * This is where SDK code and token verifiers get it from too: splitting the id
 * on the underscore is how the region is recovered everywhere, rather than
 * being carried alongside.
 */
export function simCognitoUserPoolRegionName(userPoolId: string): string {
  const [regionName] = userPoolId.split("_", 1);

  return String(regionName);
}

/**
 * The URL a token from a pool names as its issuer.
 *
 * This is the `iss` claim of the pool's tokens, the OIDC issuer its
 * `.well-known` documents are served under, and what a JWT verifier is
 * configured with.
 */
export function simCognitoUserPoolIssuerUrl(userPoolId: string): string {
  const regionName = simCognitoUserPoolRegionName(userPoolId);

  return `https://cognito-idp.${regionName}.amazonaws.com/${userPoolId}`;
}

/**
 * The name a pool is known by where a scheme would be wrong.
 *
 * This is the issuer URL without `https://`, and it is what an identity pool
 * names a user pool provider by, and what `AWS::Cognito::UserPool` answers
 * `Fn::GetAtt ProviderName` with.
 */
export function simCognitoUserPoolProviderName(userPoolId: string): string {
  return simCognitoUserPoolIssuerUrl(userPoolId).replace("https://", "");
}
