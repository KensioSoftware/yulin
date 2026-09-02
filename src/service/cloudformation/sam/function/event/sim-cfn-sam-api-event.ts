import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samEventAuthorization } from "../../api/auth/sim-cfn-sam-event-authorization.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import { samApiInvokePermissionResource } from "./sim-cfn-sam-api-invoke-permission.js";
import {
  samApiEventPathParts,
  samApiEventPathResources,
  samApiEventResourceId,
} from "./sim-cfn-sam-api-event-path.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-function-events.js";
import {
  samImplicitRestApiLogicalId,
  samImplicitRestApiResources,
} from "./sim-cfn-sam-implicit-rest-api.js";

/**
 * The method an event stating none is served under, matching the path whatever
 * the request did to it.
 */
const anyMethod = "ANY";

/**
 * Expand one `Api` event into the Resources that put a method in front of the
 * function.
 *
 * The event becomes the nodes of the path it states, a method on the last of
 * them carrying a proxy integration to the function, and the permission the
 * API invokes the function under. An event naming no `RestApiId` brings the
 * implicit API, its deployment and its stage with it, and an event naming one
 * leaves all three to whatever declared it.
 *
 * The method and the permission are named after the function and the event, so
 * two events on one function are two methods, and two functions answering the
 * same API keep permissions of their own. Both are conditioned the way the
 * function is, since a function the template conditioned out has nothing for a
 * method to reach.
 */
export function samApiEventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  const restApiId = event.properties["RestApiId"];
  const apiLogicalId = samApiEventApiLogicalId(restApiId);
  const path = samApiEventPath(event.properties);

  if (apiLogicalId === undefined || path === undefined) {
    return {};
  }

  const prefix = `${event.functionLogicalId}${event.eventName}`;

  return {
    ...(restApiId === undefined &&
      samImplicitRestApiResources(event.apiGlobals)),
    ...samApiEventPathResources(apiLogicalId, path),
    [`${prefix}Method`]: methodResource({ event, apiLogicalId, path }),
    [`${prefix}Permission`]: samApiInvokePermissionResource({
      event,
      apiId: { Ref: apiLogicalId },
      sourceArnSuffix: "/*/*/*",
    }),
  };
}

/**
 * The logical ID of the API this event puts its method on.
 *
 * An event naming no `RestApiId` gets the implicit API. An event naming one
 * states it as the logical ID or as a `Ref` to it, which is what SAM accepts,
 * and both name a Resource of this template.
 *
 * A `RestApiId` written as anything else names an API whose root resource
 * nothing here can reach, and a REST API path tree is built downwards from
 * that root. Such an event expands into nothing, the way an event of a type
 * this has no entry for does, and the function deploys with nothing in front
 * of it.
 */
function samApiEventApiLogicalId(
  restApiId: SimCfnTemplateValue | undefined,
): string | undefined {
  if (restApiId === undefined) {
    return samImplicitRestApiLogicalId;
  }

  if (typeof restApiId === "string") {
    return restApiId;
  }

  const reference = isSamTemplateRecord(restApiId)
    ? restApiId["Ref"]
    : undefined;

  return typeof reference === "string" ? reference : undefined;
}

/**
 * The segments of the `Path` the event states.
 *
 * An event stating no path states no method either, since a REST API method
 * hangs off a node of the tree and there is no node to hang it on. Nothing is
 * expanded for it.
 */
function samApiEventPath(
  properties: SimCfnTemplateValueRecord,
): readonly string[] | undefined {
  const path = properties["Path"];

  return typeof path === "string" ? samApiEventPathParts(path) : undefined;
}

interface SamApiEventMethodProperties {
  readonly event: SamFunctionEvent;
  readonly apiLogicalId: string;
  readonly path: readonly string[];
}

/**
 * The AWS::ApiGateway::Method the event's path and method are served by.
 *
 * SAM integrates an `Api` event as a proxy, which is the shape the function is
 * handed the request in, and the REST API declares an integration as a block
 * of the method.
 *
 * `Auth` on the event names one of the API's authorizers, and an event naming
 * none takes the API's `DefaultAuthorizer`. A method neither of them closes
 * authorizes nothing, and every request matching it reaches the function.
 */
function methodResource(
  properties: SamApiEventMethodProperties,
): SimCfnTemplateValueRecord {
  const { event, apiLogicalId, path } = properties;

  return {
    Type: "AWS::ApiGateway::Method",
    ...event.condition,
    Properties: {
      RestApiId: { Ref: apiLogicalId },
      ResourceId: samApiEventResourceId(apiLogicalId, path),
      HttpMethod: samApiEventHttpMethod(event.properties),
      ...samEventAuthorization(event, apiLogicalId),
      Integration: {
        Type: "AWS_PROXY",
        IntegrationHttpMethod: "POST",
        Uri: {
          "Fn::Join": [
            "",
            [
              "arn:",
              { Ref: "AWS::Partition" },
              ":apigateway:",
              { Ref: "AWS::Region" },
              ":lambda:path/2015-03-31/functions/",
              { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
              "/invocations",
            ],
          ],
        },
      },
    },
  };
}

/**
 * The HTTP method the event asked for.
 *
 * A method in lower case is upper-cased, the only case API Gateway takes, so
 * the `any` a SAM template usually writes becomes `ANY`. An event stating no
 * method gets `ANY` as well.
 */
function samApiEventHttpMethod(properties: SimCfnTemplateValueRecord): string {
  const method = properties["Method"];

  return typeof method === "string" ? method.toUpperCase() : anyMethod;
}
