/*
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  block,
  field,
  properties,
  renamed,
  tags,
  templateValue,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

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
