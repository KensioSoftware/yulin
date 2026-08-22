import { acmValueAdapter } from "./acm/sim-acm-cfn-value-adapter.js";
import { apiGatewayValueAdapter } from "./apigateway/sim-api-gateway-cfn-value-adapter.js";
import { apiGatewayV2ValueAdapter } from "./apigatewayv2/sim-api-gateway-v2-cfn-value-adapter.js";
import { cloudFrontValueAdapter } from "./cloudfront/sim-cloudfront-cfn-value-adapter.js";
import { cloudWatchValueAdapter } from "./cloudwatch/sim-cloudwatch-cfn-value-adapter.js";
import { cognitoValueAdapter } from "./cognito/sim-cognito-cfn-value-adapter.js";
import { dynamoDbValueAdapter } from "./dynamodb/sim-dynamodb-cfn-value-adapter.js";
import { ecrValueAdapter } from "./ecr/sim-ecr-cfn-value-adapter.js";
import { logsValueAdapter } from "./logs/sim-logs-cfn-value-adapter.js";
import { ecsValueAdapter } from "./ecs/sim-ecs-cfn-value-adapter.js";
import { elbV2ValueAdapter } from "./elasticloadbalancingv2/sim-elbv2-cfn-value-adapter.js";
import { eventBridgeValueAdapter } from "./events/sim-event-bridge-cfn-value-adapter.js";
import { iamValueAdapter } from "./iam/sim-iam-cfn-value-adapter.js";
import { kinesisValueAdapter } from "./kinesis/sim-kinesis-cfn-value-adapter.js";
import { kmsValueAdapter } from "./kms/sim-kms-cfn-value-adapter.js";
import { lambdaValueAdapter } from "./lambda/sim-lambda-cfn-value-adapter.js";
import { personalizeValueAdapter } from "./personalize/sim-personalize-cfn-value-adapter.js";
import { route53ValueAdapter } from "./route53/sim-route53-cfn-value-adapter.js";
import { s3ValueAdapter } from "./s3/sim-s3-cfn-value-adapter.js";
import { schedulerValueAdapter } from "./scheduler/sim-scheduler-cfn-value-adapter.js";
import { secretsManagerValueAdapter } from "./secretsmanager/sim-secrets-manager-cfn-value-adapter.js";
import { sesValueAdapter } from "./ses/sim-ses-cfn-value-adapter.js";
import { snsValueAdapter } from "./sns/sim-sns-cfn-value-adapter.js";
import { sqsValueAdapter } from "./sqs/sim-sqs-cfn-value-adapter.js";
import { ssmValueAdapter } from "./ssm/sim-ssm-cfn-value-adapter.js";
import { stepFunctionsValueAdapter } from "./stepfunctions/sim-step-functions-cfn-value-adapter.js";
import { wafV2ValueAdapter } from "./wafv2/sim-wafv2-cfn-value-adapter.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "./sim-cfn-resource-value-adapter.js";

/**
 * Every service that claims Resource types of its own, in the order they are
 * asked.
 *
 * A list rather than a chain of `??`. Each entry is the same one-line
 * delegation and the list only grows, so a chain over it became the most
 * complex expression in the CloudFormation engine without saying anything a
 * list does not, in the same way the service Resource factories are a map.
 */
export const simCfnServiceValueAdapters: readonly ((
  properties: SimCfnResourceValueAdapterProperties,
) => SimCfnServiceValueAdapter)[] = [
  acmValueAdapter,
  apiGatewayValueAdapter,
  apiGatewayV2ValueAdapter,
  cloudFrontValueAdapter,
  cloudWatchValueAdapter,
  cognitoValueAdapter,
  dynamoDbValueAdapter,
  ecrValueAdapter,
  logsValueAdapter,
  ecsValueAdapter,
  elbV2ValueAdapter,
  eventBridgeValueAdapter,
  iamValueAdapter,
  kinesisValueAdapter,
  kmsValueAdapter,
  lambdaValueAdapter,
  personalizeValueAdapter,
  route53ValueAdapter,
  s3ValueAdapter,
  schedulerValueAdapter,
  secretsManagerValueAdapter,
  sesValueAdapter,
  snsValueAdapter,
  sqsValueAdapter,
  ssmValueAdapter,
  stepFunctionsValueAdapter,
  wafV2ValueAdapter,
];
