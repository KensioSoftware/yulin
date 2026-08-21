/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import {
  block,
  field,
  properties,
  renamed,
  tags,
  templateValue,
  type TerraformMappingContext,
} from "./sim-tf-attributes.js";
import type { TerraformMappedResource } from "./sim-tf-mapping.type.js";

/** An HTTP API. */
export function httpApi(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::ApiGatewayV2::Api",
    Properties: {
      ...renamed(context, { Name: "name", ProtocolType: "protocol_type" }),
      ...properties({
        CorsConfiguration: cors(block(context, "cors_configuration")),
        Tags: tags(context),
      }),
    },
  };
}

function cors(
  configured: Record<string, unknown> | undefined,
): SimCfnTemplateValue | undefined {
  if (configured === undefined) {
    return undefined;
  }

  return properties({
    AllowOrigins: templateValue(field(configured, "allow_origins")),
    AllowMethods: templateValue(field(configured, "allow_methods")),
    AllowHeaders: templateValue(field(configured, "allow_headers")),
  });
}

/**
 * An integration. Its URI is the value a plan most often cannot resolve,
 * because it names a function that does not exist yet.
 */
export function httpApiIntegration(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::ApiGatewayV2::Integration",
    Properties: renamed(context, {
      ApiId: "api_id",
      IntegrationType: "integration_type",
      IntegrationUri: "integration_uri",
      PayloadFormatVersion: "payload_format_version",
    }),
    requires: ["IntegrationUri"],
  };
}

/** A route, which needs the integration it targets to have been created. */
export function httpApiRoute(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::ApiGatewayV2::Route",
    Properties: renamed(context, {
      ApiId: "api_id",
      RouteKey: "route_key",
      Target: "target",
      AuthorizationType: "authorization_type",
    }),
    requires: ["Target"],
  };
}

/** A stage. */
export function httpApiStage(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::ApiGatewayV2::Stage",
    Properties: renamed(context, {
      ApiId: "api_id",
      StageName: "name",
      AutoDeploy: "auto_deploy",
    }),
  };
}
