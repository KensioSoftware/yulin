import type { SimAwsAccountRegionContainer } from "../../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnServiceResourceFactory } from "../../factory/sim-cfn-resource-factory.type.js";
import { SimCfnCfnResourceFactory } from "../../factory/sim-cfn-cfn-resource-factory.js";
import { SimStepFunctionsCfnResourceFactory } from "../../cfn/stepfunctions/sim-step-functions-cfn-resource-factory.js";

/**
 * How one simulated service hands over its CloudFormation Resource factory,
 * given the Account and Region scope the Stack is deploying into.
 */
type SimCfnScopedServiceFactory = (
  scopedAws: SimAwsAccountRegionContainer,
) => SimCfnServiceResourceFactory;

/**
 * Certificates arrive under two service names. `AWS::CertificateManager::*` is
 * the real one, and `AWS::ACM::*` is the shorthand some templates use, so both
 * reach the same simulated service.
 */
const acmResourceFactory: SimCfnScopedServiceFactory = (
  scopedAws,
): SimCfnServiceResourceFactory => scopedAws.acm().cfnResourceFactory();

/**
 * The simulated service behind each `AWS::<Service>::*` Resource type.
 *
 * A map rather than a switch. Every entry is the same one-line delegation, and
 * the list is long enough that a switch over it is the most complex thing in
 * the CloudFormation engine without saying anything a lookup does not.
 *
 * A service name with no entry here is not created, which is what the resolver
 * turns into an unsupported-Resource error.
 */
export const simCfnServiceResourceFactories: ReadonlyMap<
  string,
  SimCfnScopedServiceFactory
> = new Map([
  ["ACM", acmResourceFactory],
  ["CertificateManager", acmResourceFactory],
  [
    "ApiGateway",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.apiGateway().cfnResourceFactory(),
  ],
  [
    "ApiGatewayV2",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.apiGatewayV2().cfnResourceFactory(),
  ],
  [
    "CloudFormation",
    (): SimCfnServiceResourceFactory => new SimCfnCfnResourceFactory(),
  ],
  [
    "CloudFront",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.cloudFront().cfnResourceFactory(),
  ],
  [
    "CloudWatch",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.cloudWatch().cfnResourceFactory(),
  ],
  [
    "Cognito",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.cognitoIdentityProvider().cfnResourceFactory(),
  ],
  [
    "DynamoDB",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.dynamoDb().cfnResourceFactory(),
  ],
  [
    "ECR",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.ecr().cfnResourceFactory(),
  ],
  [
    "ECS",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.ecs().cfnResourceFactory(),
  ],
  [
    "ElasticLoadBalancingV2",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.elbV2().cfnResourceFactory(),
  ],
  [
    "IAM",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.iam().cfnResourceFactory(),
  ],
  [
    "Kinesis",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.kinesis().cfnResourceFactory(),
  ],
  [
    "KMS",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.kms().cfnResourceFactory(),
  ],
  [
    "Lambda",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.lambda().cfnResourceFactory(),
  ],
  [
    "Logs",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.logs().cfnResourceFactory(),
  ],
  [
    "Personalize",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.personalize().cfnResourceFactory(),
  ],
  [
    "Route53",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.route53().cfnResourceFactory(),
  ],
  [
    "S3",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.s3().cfnResourceFactory(),
  ],
  [
    "SecretsManager",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.secretsManager().cfnResourceFactory(),
  ],
  [
    "Events",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.eventBridge().cfnResourceFactory(),
  ],
  [
    "Scheduler",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.scheduler().cfnResourceFactory(),
  ],
  [
    "SES",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.sesV2().cfnResourceFactory(),
  ],
  [
    "SNS",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.sns().cfnResourceFactory(),
  ],
  [
    "SQS",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.sqs().cfnResourceFactory(),
  ],
  [
    "SSM",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.ssm().cfnResourceFactory(),
  ],
  [
    "StepFunctions",
    (scopedAws): SimCfnServiceResourceFactory =>
      new SimStepFunctionsCfnResourceFactory({
        stepFunctions: scopedAws.stepFunctions(),
      }),
  ],
  [
    "WAFv2",
    (scopedAws): SimCfnServiceResourceFactory =>
      scopedAws.wafV2().cfnResourceFactory(),
  ],
]);
