import { simHttpApiDefaultRouteKey } from "../../../../apigatewayv2/api/route/key/sim-http-api-default-route-key.js";
import { simHttpApiAnyMethod } from "../../../../apigatewayv2/api/route/key/sim-http-api-route-method.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samEventAuthorization } from "../../api/auth/sim-cfn-sam-event-authorization.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";

interface SamHttpApiRouteProperties {
  /** The API the route belongs to. */
  readonly apiId: SimCfnTemplateValue;
  /** The logical ID of the integration the route targets. */
  readonly integrationLogicalId: string;
  /**
   * The logical ID of the API the route belongs to, where the API is one this
   * template declares. An event naming its API with an intrinsic this cannot
   * read names no `Auth` block either.
   */
  readonly apiLogicalId: string | undefined;
  readonly event: SamFunctionEvent;
}

/**
 * The AWS::ApiGatewayV2::Route the event's path and method are served by.
 *
 * `Auth` on the event names one of the API's authorizers, and an event naming
 * none takes the API's `DefaultAuthorizer`. A route neither of them closes
 * authorizes nothing, and every request matching it reaches the function.
 */
export function samHttpApiRouteResource(
  route: SamHttpApiRouteProperties,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::ApiGatewayV2::Route",
    ...route.event.condition,
    Properties: {
      ApiId: route.apiId,
      ...samHttpApiRouteKey(route.event.properties),
      ...samEventAuthorization(route.event, route.apiLogicalId),
      Target: {
        "Fn::Join": [
          "",
          ["integrations/", { Ref: route.integrationLogicalId }],
        ],
      },
    },
  };
}

/**
 * The `RouteKey` property the `Path` and `Method` of an `HttpApi` event name.
 *
 * A method the event leaves out is `ANY`, matching the path whatever the
 * request did to it. A method in lower case is upper-cased, the only case a
 * route key takes. A `Path` of `$default` names the catch-all route.
 *
 * An event stating no `Path` names no route key at all. The Route it expands
 * into then refuses itself by name, where a route key guessed from a missing
 * path would be a route no request ever reached.
 */
function samHttpApiRouteKey(
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const path = properties["Path"];

  if (typeof path !== "string") {
    return {};
  }

  if (path === simHttpApiDefaultRouteKey) {
    return { RouteKey: path };
  }

  return { RouteKey: `${samHttpApiMethod(properties)} ${path}` };
}

/**
 * The method half of the route key.
 */
function samHttpApiMethod(properties: SimCfnTemplateValueRecord): string {
  const method = properties["Method"];

  return typeof method === "string"
    ? method.toUpperCase()
    : simHttpApiAnyMethod;
}
