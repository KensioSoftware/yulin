import { SimRestApiAuthorizer } from "../../../../apigateway/api/authorizer/sim-rest-api-authorizer.js";
import { SimRestApiDeployment } from "../../../../apigateway/api/deployment/sim-rest-api-deployment.js";
import { SimRestApiResource } from "../../../../apigateway/api/resource/sim-rest-api-resource.js";
import { SimRestApi } from "../../../../apigateway/api/sim-rest-api.js";
import { SimRestApiStage } from "../../../../apigateway/api/stage/sim-rest-api-stage.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimRestApiAuthorizerCfn } from "./sim-rest-api-authorizer-cfn.js";
import { SimRestApiCfn } from "./sim-rest-api-cfn.js";
import { SimRestApiDeploymentCfn } from "./sim-rest-api-deployment-cfn.js";
import { SimRestApiResourceCfn } from "./sim-rest-api-resource-cfn.js";
import { SimRestApiStageCfn } from "./sim-rest-api-stage-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated API Gateway REST API
 * Resource.
 *
 * `AWS::ApiGateway::Method` is missing on purpose. A REST API method is
 * addressed by its API, its resource and its HTTP verb, and has no id of its
 * own, so there is nothing for a `Ref` to answer with. CloudFormation's own
 * fallback answers with the logical ID, and nothing in a template needs the
 * value. CDK reads it only to publish `Method.methodId`.
 */
export function apiGatewayValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::ApiGateway::RestApi" &&
    properties.simResource instanceof SimRestApi
  ) {
    return new SimRestApiCfn({ restApi: properties.simResource });
  }

  if (
    properties.type === "AWS::ApiGateway::Resource" &&
    properties.simResource instanceof SimRestApiResource
  ) {
    return new SimRestApiResourceCfn({ resource: properties.simResource });
  }

  if (
    properties.type === "AWS::ApiGateway::Authorizer" &&
    properties.simResource instanceof SimRestApiAuthorizer
  ) {
    return new SimRestApiAuthorizerCfn({ authorizer: properties.simResource });
  }

  if (
    properties.type === "AWS::ApiGateway::Deployment" &&
    properties.simResource instanceof SimRestApiDeployment
  ) {
    return new SimRestApiDeploymentCfn({ deployment: properties.simResource });
  }

  if (
    properties.type === "AWS::ApiGateway::Stage" &&
    properties.simResource instanceof SimRestApiStage
  ) {
    return new SimRestApiStageCfn({ stage: properties.simResource });
  }

  return undefined;
}
