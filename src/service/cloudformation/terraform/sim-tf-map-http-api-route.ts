/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  attribute,
  properties,
  renamed,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";
import type { TerraformMappedResource } from "./sim-tf-mapping.type.js";

/** A route, which needs the integration it targets to have been created. */
export function httpApiRoute(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::ApiGatewayV2::Route",
    Properties: {
      ...renamed(context, {
        ApiId: "api_id",
        RouteKey: "route_key",
        AuthorizationType: "authorization_type",
      }),
      ...properties({ Target: routeTarget(context) }),
    },
    requires: ["Target"],
  };
}

/**
 * What the route sends a request to, as `integrations/<integration id>`.
 *
 * Terraform writes that string itself, and the integration ID inside it is
 * unknown until the integration exists, which makes the whole string unknown.
 * What survives is a reference to the integration, and a reference on its own
 * is the ID without the prefix CloudFormation expects.
 */
function routeTarget(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const target = attribute(context, "target");

  if (target === undefined || typeof target === "string") {
    return target;
  }

  return { "Fn::Join": ["", ["integrations/", target]] };
}
