import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import type { SamFunctionEvent } from "../../function/event/sim-cfn-sam-declared-event.js";
import { samFunctionType } from "../../function/sim-cfn-sam-function-type.js";
import { samPropertyError } from "../../sim-cfn-sam-error.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import type {
  SamApiAuth,
  SamApiAuthorizer,
} from "./sim-cfn-sam-api-auth.types.js";
import { samNoAuthorizerName } from "./sim-cfn-sam-api-auth.types.js";
import { samUnsupportedEventAuth } from "./sim-cfn-sam-unsupported-auth.js";

/**
 * The `Auth` properties an event may state. Everything else SAM has there is
 * refused by name.
 */
const supportedProperties = new Set(["Authorizer", "AuthorizationScopes"]);

/**
 * How the method or route one event expands into is authorized.
 *
 * The event names one of the API's authorizers, or takes the API's
 * `DefaultAuthorizer` when it names none. `Authorizer: NONE` opens a method the
 * default would otherwise have closed, which is the only way SAM has of
 * leaving one path of a protected API open.
 *
 * An event naming an authorizer the API does not declare is refused. The
 * alternative is a method deployed open under a name that reads as closed.
 *
 * The API is named by logical ID, and an event naming its API with an
 * intrinsic this cannot read names no `Auth` block either. Its method carries
 * whatever the event states for itself, which is nothing more often than not.
 */
export function samEventAuthorization(
  event: SamFunctionEvent,
  apiLogicalId: string | undefined,
): SimCfnTemplateValueRecord {
  const apiAuth =
    apiLogicalId === undefined ? undefined : event.apiAuth.get(apiLogicalId);
  const auth = eventAuthBlock(event);
  const name = auth["Authorizer"] ?? apiAuth?.defaultAuthorizer;

  if (name === undefined || name === samNoAuthorizerName) {
    return { AuthorizationType: "NONE" };
  }

  const authorizer = namedAuthorizer(event, apiAuth, name);
  const scopes = auth["AuthorizationScopes"] ?? authorizer.authorizationScopes;

  return {
    AuthorizationType: authorizer.authorizationType,
    ...(authorizer.logicalId !== undefined && {
      AuthorizerId: { Ref: authorizer.logicalId },
    }),
    ...(scopes !== undefined && { AuthorizationScopes: scopes }),
  };
}

/**
 * The `Auth` block the event declares, refusing every property this expansion
 * cannot model.
 */
function eventAuthBlock(event: SamFunctionEvent): SimCfnTemplateValueRecord {
  const declared = event.properties["Auth"];

  if (declared === undefined) {
    return {};
  }

  if (!isSamTemplateRecord(declared)) {
    throw eventAuthError(event, "Auth", "it is not a block of settings");
  }

  for (const name of Object.keys(declared)) {
    if (!supportedProperties.has(name)) {
      throw eventAuthError(
        event,
        `Auth.${name}`,
        samUnsupportedEventAuth.get(name) ??
          "it is not an event Auth property this expansion knows",
      );
    }
  }

  return declared;
}

/**
 * The authorizer the event named, refusing a name the API has no authorizer
 * for.
 */
function namedAuthorizer(
  event: SamFunctionEvent,
  apiAuth: SamApiAuth | undefined,
  name: SimCfnTemplateValue,
): SamApiAuthorizer {
  if (typeof name !== "string") {
    throw eventAuthError(
      event,
      "Auth.Authorizer",
      "it is not the name of one of the API's authorizers",
    );
  }

  if (apiAuth === undefined) {
    throw eventAuthError(
      event,
      "Auth.Authorizer",
      `${name} names an authorizer of an API whose Auth block is out of ` +
        "reach. An event reaches one by naming a SAM API of this template, " +
        "as the logical ID or as a `Ref` to it",
    );
  }

  const authorizer = apiAuth.authorizers.get(name);

  if (authorizer === undefined) {
    throw eventAuthError(
      event,
      "Auth.Authorizer",
      `${name} is not an authorizer the API's Auth block declares`,
    );
  }

  return authorizer;
}

function eventAuthError(
  event: SamFunctionEvent,
  property: string,
  reason: string,
): Error {
  return samPropertyError({
    resourceType: samFunctionType,
    logicalId: event.functionLogicalId,
    property: `Events.${event.eventName}.${property}`,
    reason,
  });
}
