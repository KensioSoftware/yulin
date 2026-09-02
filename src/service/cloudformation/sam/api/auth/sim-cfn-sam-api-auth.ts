import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samPropertyError } from "../../sim-cfn-sam-error.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import type {
  SamApiAuth,
  SamApiAuthApi,
  SamApiAuthorizer,
} from "./sim-cfn-sam-api-auth.types.js";
import { samIamAuthorizerName } from "./sim-cfn-sam-api-auth.types.js";
import { samUnsupportedApiAuth } from "./sim-cfn-sam-unsupported-auth.js";

/**
 * The `Auth` block an API declares, refusing every property this expansion
 * cannot model.
 *
 * A property is refused rather than dropped because dropping one deploys an
 * API that authorizes less than the template asked for, which is the failure
 * this whole expansion exists to prevent. An API declaring no `Auth` declares
 * an empty block, and the methods on it stay open.
 */
export function samApiAuthBlock(
  api: SamApiAuthApi,
  apiProperties: SimCfnTemplateValueRecord,
  supported: ReadonlySet<string>,
): SimCfnTemplateValueRecord {
  const declared = apiProperties["Auth"];

  if (declared === undefined) {
    return {};
  }

  if (!isSamTemplateRecord(declared)) {
    throw samAuthError(api, "Auth", "it is not a block of authorizer settings");
  }

  for (const name of Object.keys(declared)) {
    if (!supported.has(name)) {
      throw samAuthError(
        api,
        `Auth.${name}`,
        samUnsupportedApiAuth.get(name) ??
          "it is not an Auth property this expansion knows",
      );
    }
  }

  return declared;
}

/**
 * The authorizer IAM itself decides, which names no Resource of its own.
 */
export function samIamAuthorizer(): SamApiAuthorizer {
  return {
    authorizationType: samIamAuthorizerName,
    logicalId: undefined,
    authorizationScopes: undefined,
    resources: {},
  };
}

/**
 * The Resources every authorizer of an API is expanded into.
 */
export function samApiAuthResources(
  auth: SamApiAuth,
): Record<string, SimCfnTemplateValue> {
  return Object.fromEntries(
    auth.authorizers
      .values()
      .flatMap((authorizer) => Object.entries(authorizer.resources)),
  );
}

/**
 * The logical ID an authorizer Resource is expanded under, which is the API's
 * own with the authorizer's name after it.
 */
export function samAuthorizerLogicalId(
  api: SamApiAuthApi,
  name: string,
): string {
  return `${api.logicalId}${name}Authorizer`;
}

/**
 * The `AuthorizerResultTtlInSeconds` an authorizer caches its answer for,
 * where its `Identity` asked to be reauthorized on a period.
 */
export function samAuthorizerResultTtl(
  reauthorizeEvery: SimCfnTemplateValue | undefined,
): SimCfnTemplateValueRecord {
  return reauthorizeEvery === undefined
    ? {}
    : { AuthorizerResultTtlInSeconds: reauthorizeEvery };
}

/**
 * The error a property of an API's `Auth` block is refused with.
 */
export function samAuthError(
  api: SamApiAuthApi,
  property: string,
  reason: string,
): Error {
  return samPropertyError({ ...api, property, reason });
}
