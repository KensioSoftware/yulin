import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import { acmValueAdapter } from "./acm/sim-acm-cfn-value-adapter.js";
import { apiGatewayV2ValueAdapter } from "./apigatewayv2/sim-api-gateway-v2-cfn-value-adapter.js";
import { cloudFrontValueAdapter } from "./cloudfront/sim-cloudfront-cfn-value-adapter.js";
import { cognitoValueAdapter } from "./cognito/sim-cognito-cfn-value-adapter.js";
import { dynamoDbValueAdapter } from "./dynamodb/sim-dynamodb-cfn-value-adapter.js";
import { ecrValueAdapter } from "./ecr/sim-ecr-cfn-value-adapter.js";
import { ecsValueAdapter } from "./ecs/sim-ecs-cfn-value-adapter.js";
import { elbV2ValueAdapter } from "./elasticloadbalancingv2/sim-elbv2-cfn-value-adapter.js";
import { eventBridgeValueAdapter } from "./events/sim-event-bridge-cfn-value-adapter.js";
import { iamValueAdapter } from "./iam/sim-iam-cfn-value-adapter.js";
import { kmsValueAdapter } from "./kms/sim-kms-cfn-value-adapter.js";
import { lambdaValueAdapter } from "./lambda/sim-lambda-cfn-value-adapter.js";
import { route53ValueAdapter } from "./route53/sim-route53-cfn-value-adapter.js";
import { s3ValueAdapter } from "./s3/sim-s3-cfn-value-adapter.js";
import { schedulerValueAdapter } from "./scheduler/sim-scheduler-cfn-value-adapter.js";
import { secretsManagerValueAdapter } from "./secretsmanager/sim-secrets-manager-cfn-value-adapter.js";
import { snsValueAdapter } from "./sns/sim-sns-cfn-value-adapter.js";
import { sqsValueAdapter } from "./sqs/sim-sqs-cfn-value-adapter.js";
import { ssmValueAdapter } from "./ssm/sim-ssm-cfn-value-adapter.js";
import { SimCfnDefaultResourceValueAdapter } from "./sim-cfn-default-resource-value-adapter.js";

export interface SimCfnResourceValueAdapter {
  refValue(): SimCfnTemplateValue;

  attributeValue(attributeName: string): SimCfnTemplateValue;
}

export interface SimCfnResourceValueAdapterProperties {
  readonly logicalId: string;
  readonly type: string | undefined;
  readonly simResource: object | undefined;
}

/**
 * The adapter for a Resource type one service owns, or nothing when the
 * Resource belongs to another service.
 */
export type SimCfnServiceValueAdapter = SimCfnResourceValueAdapter | undefined;

/**
 * Build the CloudFormation-facing value adapter for a created simulated
 * Resource.
 *
 * The underlying simulated AWS service object stays service-focused; this
 * adapter owns CloudFormation-specific Ref and Fn::GetAtt behavior.
 *
 * Each service matches its own Resource types, beside that service's adapters,
 * so this registry stays a list of services. A Resource no service claims
 * falls through to the default adapter, which answers a Ref with the logical
 * ID.
 */
export function simCfnResourceValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnResourceValueAdapter {
  return (
    acmValueAdapter(properties) ??
    apiGatewayV2ValueAdapter(properties) ??
    cloudFrontValueAdapter(properties) ??
    cognitoValueAdapter(properties) ??
    dynamoDbValueAdapter(properties) ??
    ecrValueAdapter(properties) ??
    ecsValueAdapter(properties) ??
    elbV2ValueAdapter(properties) ??
    eventBridgeValueAdapter(properties) ??
    iamValueAdapter(properties) ??
    kmsValueAdapter(properties) ??
    lambdaValueAdapter(properties) ??
    route53ValueAdapter(properties) ??
    s3ValueAdapter(properties) ??
    schedulerValueAdapter(properties) ??
    secretsManagerValueAdapter(properties) ??
    snsValueAdapter(properties) ??
    sqsValueAdapter(properties) ??
    ssmValueAdapter(properties) ??
    new SimCfnDefaultResourceValueAdapter({
      logicalId: properties.logicalId,
    })
  );
}
