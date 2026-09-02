import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import { samAuthError } from "./sim-cfn-sam-api-auth.js";
import type { SamApiAuthApi } from "./sim-cfn-sam-api-auth.types.js";

/**
 * The authorizers an `Auth` block declares, in the order it declares them.
 */
export function samApiAuthorizerDefinitions(
  api: SamApiAuthApi,
  auth: SimCfnTemplateValueRecord,
): readonly (readonly [string, SimCfnTemplateValueRecord])[] {
  const declared = auth["Authorizers"];

  if (declared === undefined) {
    return [];
  }

  if (!isSamTemplateRecord(declared)) {
    throw samAuthError(
      api,
      "Auth.Authorizers",
      "it is not a map of authorizers by name",
    );
  }

  return Object.entries(declared).map(([name, definition]) => {
    if (!isSamTemplateRecord(definition)) {
      throw samAuthError(
        api,
        `Auth.Authorizers.${name}`,
        "it is not a block of authorizer settings",
      );
    }

    return [name, definition] as const;
  });
}

/**
 * The `DefaultAuthorizer` an `Auth` block names, which every method it decides
 * takes when its own event names none.
 */
export function samApiDefaultAuthorizer(
  api: SamApiAuthApi,
  auth: SimCfnTemplateValueRecord,
): string | undefined {
  const declared = auth["DefaultAuthorizer"];

  if (declared === undefined) {
    return undefined;
  }

  if (typeof declared !== "string") {
    throw samAuthError(
      api,
      "Auth.DefaultAuthorizer",
      "it is not the name of one of the API's authorizers",
    );
  }

  return declared;
}
