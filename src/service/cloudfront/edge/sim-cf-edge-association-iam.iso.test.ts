import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertResponseStatus,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";
import { SimSdk } from "../../../sdk/index.js";
import type { LambdaAtEdge } from "../typings/lambda-at-edge.namespace.js";
import { makeEdgeFunctionVersionArn } from "../../../../test/cloudfront/edge-function-fixture.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../test/cloudfront/site-fixture.js";

/**
 * A DistributionConfig whose default Behavior runs this function version at
 * the viewer request.
 */
function edgeDistributionConfig(bucketName: string, versionArn: string) {
  return simCfSiteDistributionConfig(bucketName, {
    DefaultCacheBehavior: {
      TargetOriginId: "site-origin",
      ViewerProtocolPolicy: "allow-all",
      LambdaFunctionAssociations: {
        Quantity: 1,
        Items: [{ EventType: "viewer-request", LambdaFunctionARN: versionArn }],
      },
    },
  });
}

describe("Simulated CloudFront Lambda@Edge association IAM", () => {
  it("refuses a caller without lambda:EnableReplication on the function version", async () => {
    // Given a function version, and a caller allowed only to create
    // Distributions and read the function.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-iam-site", {});

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "iam-edge",
      handler: (event: unknown) => event,
    });

    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "DistributionWriter",
        actions: ["cloudfront:CreateDistribution", "lambda:GetFunction"],
      },
      simAws,
    );

    // When that caller creates a Distribution associating the function.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().createDistribution(
          new CreateDistributionCommand({
            DistributionConfig: edgeDistributionConfig(
              "edge-iam-site",
              versionArn,
            ),
          }),
          { caller: { kind: "arn", arn: role.Arn } },
        ),
    );

    // Then the association is denied by IAM rather than refused by CloudFront.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows a caller holding both association actions on the version", async () => {
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-iam-allowed-site", {});

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "iam-allowed-edge",
      handler: (event: unknown) => event,
    });

    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "EdgeDistributionWriter",
        actions: [
          "cloudfront:CreateDistribution",
          "lambda:GetFunction",
          "lambda:EnableReplication*",
        ],
      },
      simAws,
    );

    const created = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: edgeDistributionConfig(
          "edge-iam-allowed-site",
          versionArn,
        ),
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    assertTrue(created.Distribution?.DistributionConfig?.Enabled);
  });

  it("runs the handler as its execution role, so an outbound call it may not make is denied", async () => {
    // Given a function whose execution role holds no S3 permissions, writing
    // an Object from the viewer-request handler through an intercepted client.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-outbound-site", {});

    const s3Client = new S3Client({ region: "us-east-1" });
    new SimSdk({ simAws }).intercept(s3Client);

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "outbound-edge",
      handler: async (): Promise<LambdaAtEdge.Response> => {
        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: "edge-outbound-site",
              Key: "written-by-edge.txt",
              Body: "written",
            }),
          );
        } catch (error) {
          return { status: "403", body: (error as Error).name };
        }

        return { status: "200", body: "wrote the Object" };
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      edgeDistributionConfig("edge-outbound-site", versionArn),
    );

    // When the function runs for a request.
    const response = await simCfSiteRequest(simAws, distributionId, "/");

    // Then the write was attributed to the execution role and refused.
    assertResponseStatus(response, 403);
    assertIdentical(await response.text(), "AccessDenied");
  });
});
