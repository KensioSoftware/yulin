import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";
import { samHttpApiPermissionResource } from "./sim-cfn-sam-http-api-permission.js";
import { samHttpApiRouteResource } from "./sim-cfn-sam-http-api-route.js";
import {
  samImplicitHttpApiLogicalId,
  samImplicitHttpApiResources,
} from "./sim-cfn-sam-implicit-http-api.js";

/**
 * Expand one `HttpApi` event into the Resources that put a route in front of
 * the function.
 *
 * The event becomes an integration to the function, a route pointing at it,
 * and the permission the API invokes the function under. An event naming no
 * `ApiId` brings the implicit API and its stage with it, and an event naming
 * one leaves the API to whatever declared it.
 *
 * The route and the integration are named after the function and the event, so
 * two events on one function are two routes, and two functions answering the
 * same API keep integrations of their own. They are conditioned the way the
 * function is, since a function the template conditioned out has nothing for a
 * route to reach. The implicit API keeps no condition of its own. It is shared,
 * and the other functions on it may be conditioned differently or not at all.
 */
export function samHttpApiEventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  const apiId = samHttpApiEventApiId(event.properties);
  const prefix = `${event.functionLogicalId}${event.eventName}HttpApi`;
  const integrationLogicalId = `${prefix}Integration`;

  return {
    ...(event.properties["ApiId"] === undefined &&
      samImplicitHttpApiResources()),
    [integrationLogicalId]: integrationResource(event, apiId),
    [`${prefix}Route`]: samHttpApiRouteResource({
      apiId,
      integrationLogicalId,
      event,
    }),
    [`${prefix}Permission`]: samHttpApiPermissionResource(event, apiId),
  };
}

/**
 * The API this event routes to, as the value the expanded Resources put in
 * their `ApiId`.
 *
 * An event naming an API by logical ID is answered with a `Ref` to it, which
 * an `AWS::Serverless::HttpApi` and an `AWS::ApiGatewayV2::Api` both answer
 * with the API's id. An `ApiId` already written as an intrinsic goes through
 * as it came, since `!Ref MyApi` is how a SAM template usually names one.
 */
function samHttpApiEventApiId(
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValue {
  const apiId = properties["ApiId"];

  if (apiId === undefined) {
    return { Ref: samImplicitHttpApiLogicalId };
  }

  return isSamTemplateRecord(apiId) ? apiId : { Ref: apiId };
}

/**
 * The AWS::ApiGatewayV2::Integration the route sends its requests through.
 *
 * SAM integrates an `HttpApi` event as a payload format 2.0 proxy. That is the
 * shape the function is handed the request in.
 */
function integrationResource(
  event: SamFunctionEvent,
  apiId: SimCfnTemplateValue,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::ApiGatewayV2::Integration",
    ...event.condition,
    Properties: {
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
      PayloadFormatVersion: "2.0",
    },
  };
}
