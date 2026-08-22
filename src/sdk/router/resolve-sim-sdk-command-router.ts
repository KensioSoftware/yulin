import type { SimAwsAccountId } from "../../service/aws/sim-aws-account.js";
import type { SimAwsAccountRegionContainer } from "../../service/aws/sim-aws-account-region-scope.js";
import type { AwsRegionName } from "../../service/aws/sim-aws-region.js";
import type { SimAws } from "../../service/aws/sim-aws.js";
import { SimSdkUnknownServiceError } from "../error/sim-sdk.error.js";
import type { SimSdkCommandRouter } from "./sim-sdk-command-router.type.js";

/**
 * How one AWS service identity reaches its scoped simulated service.
 */
type SimSdkScopedRouter = (
  scoped: SimAwsAccountRegionContainer,
) => SimSdkCommandRouter;

/**
 * Every AWS service identity SDK interception supports, and the scoped
 * simulated service each one routes to.
 *
 * A table rather than a switch, because there is one entry per simulated
 * service and the list only grows: a branch per service would put the whole of
 * this file's complexity in one function.
 *
 * The keys are the SDK's own `serviceId` values, which is why some of them
 * carry spaces.
 */
const scopedRouters: ReadonlyMap<string, SimSdkScopedRouter> = new Map<
  string,
  SimSdkScopedRouter
>([
  ["ACM", (scoped): SimSdkCommandRouter => scoped.acm().sdkCommandRouter()],
  [
    "API Gateway",
    (scoped): SimSdkCommandRouter => scoped.apiGateway().sdkCommandRouter(),
  ],
  [
    "ApiGatewayV2",
    (scoped): SimSdkCommandRouter => scoped.apiGatewayV2().sdkCommandRouter(),
  ],
  [
    "Bedrock Runtime",
    (scoped): SimSdkCommandRouter => scoped.bedrock().sdkCommandRouter(),
  ],
  [
    "CloudFormation",
    (scoped): SimSdkCommandRouter => scoped.cloudFormation().sdkCommandRouter(),
  ],
  [
    "CloudFront",
    (scoped): SimSdkCommandRouter => scoped.cloudFront().sdkCommandRouter(),
  ],
  [
    "CloudFront KeyValueStore",
    (scoped): SimSdkCommandRouter =>
      scoped.cloudFrontKeyValueStore().sdkCommandRouter(),
  ],
  [
    "CloudWatch",
    (scoped): SimSdkCommandRouter => scoped.cloudWatch().sdkCommandRouter(),
  ],
  [
    "Cognito Identity Provider",
    (scoped): SimSdkCommandRouter =>
      scoped.cognitoIdentityProvider().sdkCommandRouter(),
  ],
  [
    "DynamoDB",
    (scoped): SimSdkCommandRouter => scoped.dynamoDb().sdkCommandRouter(),
  ],
  [
    "DynamoDB Streams",
    (scoped): SimSdkCommandRouter =>
      scoped.dynamoDbStreams().sdkCommandRouter(),
  ],
  ["ECS", (scoped): SimSdkCommandRouter => scoped.ecs().sdkCommandRouter()],
  [
    "Elastic Load Balancing v2",
    (scoped): SimSdkCommandRouter => scoped.elbV2().sdkCommandRouter(),
  ],
  [
    "EventBridge",
    (scoped): SimSdkCommandRouter => scoped.eventBridge().sdkCommandRouter(),
  ],
  ["IAM", (scoped): SimSdkCommandRouter => scoped.iam().sdkCommandRouter()],
  [
    "Kinesis",
    (scoped): SimSdkCommandRouter => scoped.kinesis().sdkCommandRouter(),
  ],
  ["KMS", (scoped): SimSdkCommandRouter => scoped.kms().sdkCommandRouter()],
  [
    "Lambda",
    (scoped): SimSdkCommandRouter => scoped.lambda().sdkCommandRouter(),
  ],
  [
    "CloudWatch Logs",
    (scoped): SimSdkCommandRouter => scoped.logs().sdkCommandRouter(),
  ],
  [
    "Personalize",
    (scoped): SimSdkCommandRouter => scoped.personalize().sdkCommandRouter(),
  ],
  [
    "Personalize Events",
    (scoped): SimSdkCommandRouter =>
      scoped.personalizeEvents().sdkCommandRouter(),
  ],
  [
    "Personalize Runtime",
    (scoped): SimSdkCommandRouter =>
      scoped.personalizeRuntime().sdkCommandRouter(),
  ],
  [
    "Rekognition",
    (scoped): SimSdkCommandRouter => scoped.rekognition().sdkCommandRouter(),
  ],
  [
    "Route 53",
    (scoped): SimSdkCommandRouter => scoped.route53().sdkCommandRouter(),
  ],
  ["S3", (scoped): SimSdkCommandRouter => scoped.s3().sdkCommandRouter()],
  [
    "Scheduler",
    (scoped): SimSdkCommandRouter => scoped.scheduler().sdkCommandRouter(),
  ],
  [
    "Secrets Manager",
    (scoped): SimSdkCommandRouter => scoped.secretsManager().sdkCommandRouter(),
  ],
  ["SESv2", (scoped): SimSdkCommandRouter => scoped.sesV2().sdkCommandRouter()],
  ["SNS", (scoped): SimSdkCommandRouter => scoped.sns().sdkCommandRouter()],
  ["SQS", (scoped): SimSdkCommandRouter => scoped.sqs().sdkCommandRouter()],
  ["SSM", (scoped): SimSdkCommandRouter => scoped.ssm().sdkCommandRouter()],
  ["STS", (scoped): SimSdkCommandRouter => scoped.sts().sdkCommandRouter()],
  ["WAFV2", (scoped): SimSdkCommandRouter => scoped.wafV2().sdkCommandRouter()],
]);

/**
 * Resolve the scoped simulated service SDK Command router for an intercepted
 * client's AWS service.
 *
 * Mirrors the CloudFormation service resolver: the interception engine
 * resolves the Account/Region scope and the service identity, then the scoped
 * simulated service owns its own Command routing. Simulated services come
 * into existence lazily here, on the first intercepted Command that reaches
 * them.
 */
export function resolveSimSdkCommandRouter(
  simAws: SimAws,
  serviceId: string,
  accountId: SimAwsAccountId | string,
  regionName: AwsRegionName,
): SimSdkCommandRouter {
  const scopedRouter = scopedRouters.get(serviceId);

  if (scopedRouter === undefined) {
    throw new SimSdkUnknownServiceError(
      `Simulated AWS has no SDK interception support for service ` +
        `${serviceId} yet`,
    );
  }

  return scopedRouter(simAws.account(accountId).region(regionName));
}
