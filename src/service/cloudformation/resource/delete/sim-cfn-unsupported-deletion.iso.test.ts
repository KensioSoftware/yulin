import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCfnResource } from "../sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";
import { SimCfnCfnResourceFactory } from "../factory/sim-cfn-cfn-resource-factory.js";
import { SimCdkBucketDeploymentResourceFactory } from "../../cdk/s3/bucket-deployment/sim-cdk-bucket-deployment.js";

interface UnsupportedDeletion {
  readonly serviceName: string;
  readonly factory: (simAws: SimAws) => SimCfnServiceResourceFactory;
}

/**
 * Every service factory, asked to delete a Resource type it does not have.
 *
 * A service is free to create Resource types it cannot delete, and this is how
 * it says so: the same unsupported-Resource error creation raises, which the
 * Stack teardown records and steps over rather than failing on.
 */
const unsupportedDeletions: readonly UnsupportedDeletion[] = [
  {
    serviceName: "ACM",
    factory: (simAws) => simAws.acm().cfnResourceFactory(),
  },
  {
    serviceName: "API Gateway v2",
    factory: (simAws) => simAws.apiGatewayV2().cfnResourceFactory(),
  },
  {
    serviceName: "CloudFormation",
    factory: () => new SimCfnCfnResourceFactory(),
  },
  {
    serviceName: "CDK BucketDeployment",
    factory: () => new SimCdkBucketDeploymentResourceFactory(),
  },
  {
    serviceName: "CloudFront",
    factory: (simAws) => simAws.cloudFront().cfnResourceFactory(),
  },
  {
    serviceName: "Cognito",
    factory: (simAws) => simAws.cognitoIdentityProvider().cfnResourceFactory(),
  },
  {
    serviceName: "DynamoDB",
    factory: (simAws) => simAws.dynamoDb().cfnResourceFactory(),
  },
  {
    serviceName: "IAM",
    factory: (simAws) => simAws.iam().cfnResourceFactory(),
  },
  {
    serviceName: "KMS",
    factory: (simAws) => simAws.kms().cfnResourceFactory(),
  },
  {
    serviceName: "Lambda",
    factory: (simAws) => simAws.lambda().cfnResourceFactory(),
  },
  {
    serviceName: "Route53",
    factory: (simAws) => simAws.route53().cfnResourceFactory(),
  },
  { serviceName: "S3", factory: (simAws) => simAws.s3().cfnResourceFactory() },
  {
    serviceName: "Secrets Manager",
    factory: (simAws) => simAws.secretsManager().cfnResourceFactory(),
  },
  {
    serviceName: "SQS",
    factory: (simAws) => simAws.sqs().cfnResourceFactory(),
  },
  {
    serviceName: "SSM",
    factory: (simAws) => simAws.ssm().cfnResourceFactory(),
  },
];

describe("Unsupported sim CloudFormation Resource deletion", () => {
  it.each(unsupportedDeletions)(
    "reports a $serviceName Resource type nothing deletes",
    async ({ serviceName, factory }) => {
      // Given a Resource of a type its service factory has no deletion for.
      const simAws = new SimAws();
      const resource = new SimCfnResource({
        logicalId: "Unsimulated",
        template: { Type: `AWS::${serviceName}::Unsimulated` },
      });

      // When the factory is asked to delete it.
      const error = await assertThrowsErrorAsync(async () =>
        factory(simAws).delete("Unsimulated", resource, {
          simAws,
          resources: new Map(),
          // The API Gateway Resource types are addressed by the API they
          // belong to, which is read before the type is judged.
          resolvedProperties: { ApiId: "unsimulated-api" },
        }),
      );

      // Then the refusal names the Resource type, so a Stack teardown can
      // record what it could not remove.
      assertStringIncludes(error.message, "Unsupported sim");
      assertStringIncludes(error.message, "Unsimulated");
    },
  );
});
