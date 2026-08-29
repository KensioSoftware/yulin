import { PutDeliverySourceCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simLogsDeliveryDistributionArn } from "../../../../../test/logs/delivery-distribution-fixture.js";

const sourceName = "site-access-logs";
const vendedLogDeliveryAction = "cloudfront:AllowVendedLogDeliveryForResource";

/**
 * A Role holding one policy statement, as a caller a request can be made as.
 *
 * Every statement here allows every `logs:` action, because the permission
 * under test is the one a policy written from the `logs:` side leaves out.
 */
async function roleAllowedLogsAnd(
  simAws: SimAws,
  statement?: object,
): Promise<SimAwsCaller> {
  const roleName = "SiteLoggingDeployer";
  const created = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "cloudformation.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "SetUpLogging",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: [
          { Effect: "Allow", Action: "logs:*", Resource: "*" },
          ...(statement === undefined ? [] : [statement]),
        ],
      }),
    }),
  );

  assertNonNullable(created.Role.Arn);

  return { kind: "arn", arn: created.Role.Arn };
}

/**
 * Put a delivery source over a resource as the caller given.
 */
async function putSourceAs(
  simAws: SimAws,
  resourceArn: string,
  caller: SimAwsCaller,
): Promise<void> {
  await simAws.logs().putDeliverySource(
    new PutDeliverySourceCommand({
      name: sourceName,
      resourceArn,
      logType: "ACCESS_LOGS",
    }),
    { caller },
  );
}

describe("the CloudFront permission a delivery source over a distribution needs", () => {
  it("refuses a source over a distribution under a caller denied CloudFront", async () => {
    // Given a Role allowed every CloudWatch Logs action and nothing of
    // CloudFront, which is the policy a delivery source looks like it needs.
    const simAws = new SimAws();
    const resourceArn = await simLogsDeliveryDistributionArn(simAws);
    const caller = await roleAllowedLogsAnd(simAws);

    // When it puts a delivery source over the distribution.
    const error = await assertThrowsErrorAsync(async () => {
      await putSourceAs(simAws, resourceArn, caller);
    });

    // Then CloudWatch Logs refuses it on an action of CloudFront, the way a
    // real account refuses it, and no source was put behind the refusal.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, vendedLogDeliveryAction);
    assertStringIncludes(error.message, "role/SiteLoggingDeployer");
    assertUndefined(simAws.logs().findDeliverySource(sourceName));
  });

  it("allows a source over the distribution a policy names", async () => {
    // Given a Role allowed to deliver the logs of one distribution by ARN.
    const simAws = new SimAws();
    const resourceArn = await simLogsDeliveryDistributionArn(simAws);
    const caller = await roleAllowedLogsAnd(simAws, {
      Effect: "Allow",
      Action: vendedLogDeliveryAction,
      Resource: resourceArn,
    });

    // When it puts a delivery source over that distribution.
    await putSourceAs(simAws, resourceArn, caller);

    // Then the source is there, so the distribution ARN is what the request
    // authorized against.
    assertIdentical(
      simAws.logs().findDeliverySource(sourceName)?.name,
      sourceName,
    );
  });

  it("refuses a source over a distribution the policy does not name", async () => {
    // Given a Role allowed to deliver the logs of one distribution, and a
    // second distribution beside it.
    const simAws = new SimAws();
    const allowedArn = await simLogsDeliveryDistributionArn(
      simAws,
      "allowed-site",
    );
    const otherArn = await simLogsDeliveryDistributionArn(simAws, "other-site");
    const caller = await roleAllowedLogsAnd(simAws, {
      Effect: "Allow",
      Action: vendedLogDeliveryAction,
      Resource: allowedArn,
    });

    // When it puts a delivery source over the second one.
    const error = await assertThrowsErrorAsync(async () => {
      await putSourceAs(simAws, otherArn, caller);
    });

    // Then it is refused, so the permission is held per distribution rather
    // than over CloudFront as a whole.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, otherArn);
    assertUndefined(simAws.logs().findDeliverySource(sourceName));
  });

  it("leaves a source over a resource of another service alone", async () => {
    // Given the same Role denied CloudFront, and an API Gateway stage to
    // deliver access logs from.
    const simAws = new SimAws();
    const caller = await roleAllowedLogsAnd(simAws);
    const stageArn =
      "arn:aws:apigateway:us-east-1::/restapis/abc123/stages/prod";

    // When it puts a delivery source over the stage.
    await putSourceAs(simAws, stageArn, caller);

    // Then nothing of CloudFront was asked for, because the ARN names another
    // service, and the source is there.
    assertIdentical(
      simAws.logs().findDeliverySource(sourceName)?.resourceArn,
      stageArn,
    );
  });
});
