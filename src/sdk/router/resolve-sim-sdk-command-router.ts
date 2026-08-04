import type { SimAwsAccountId } from "../../service/aws/sim-aws-account.js";
import type { AwsRegionName } from "../../service/aws/sim-aws-region.js";
import type { SimAws } from "../../service/aws/sim-aws.js";
import { SimSdkUnknownServiceError } from "../error/sim-sdk.error.js";
import type { SimSdkCommandRouter } from "./sim-sdk-command-router.type.js";

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
  const scoped = simAws.account(accountId).region(regionName);

  switch (serviceId) {
    case "ACM": {
      return scoped.acm().sdkCommandRouter();
    }
    case "ApiGatewayV2": {
      return scoped.apiGatewayV2().sdkCommandRouter();
    }
    case "CloudFormation": {
      return scoped.cloudFormation().sdkCommandRouter();
    }
    case "CloudFront": {
      return scoped.cloudFront().sdkCommandRouter();
    }
    case "Cognito Identity Provider": {
      return scoped.cognitoIdentityProvider().sdkCommandRouter();
    }
    case "DynamoDB": {
      return scoped.dynamoDb().sdkCommandRouter();
    }
    case "DynamoDB Streams": {
      return scoped.dynamoDbStreams().sdkCommandRouter();
    }
    case "IAM": {
      return scoped.iam().sdkCommandRouter();
    }
    case "KMS": {
      return scoped.kms().sdkCommandRouter();
    }
    case "Lambda": {
      return scoped.lambda().sdkCommandRouter();
    }
    case "Route 53": {
      return scoped.route53().sdkCommandRouter();
    }
    case "S3": {
      return scoped.s3().sdkCommandRouter();
    }
    case "Secrets Manager": {
      return scoped.secretsManager().sdkCommandRouter();
    }
    case "SQS": {
      return scoped.sqs().sdkCommandRouter();
    }
    case "SSM": {
      return scoped.ssm().sdkCommandRouter();
    }
    case "STS": {
      return scoped.sts().sdkCommandRouter();
    }
    default: {
      throw new SimSdkUnknownServiceError(
        `Simulated AWS has no SDK interception support for service ` +
          `${serviceId} yet`,
      );
    }
  }
}
