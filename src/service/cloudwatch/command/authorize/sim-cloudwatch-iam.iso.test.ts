import {
  ListMetricsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simCloudWatchNamespaceConditionKey } from "../sim-cloudwatch-request-options.js";

const accountIdOneOnes = "111111111111";

/**
 * A simulation with one Role, and whatever policy statement the test wants it
 * to have.
 */
async function simAwsWithRole(policyStatement?: object): Promise<SimAws> {
  const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrdersFunctionRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (policyStatement !== undefined) {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "OrdersFunctionRole",
        PolicyName: "PublishMetrics",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: policyStatement,
        }),
      }),
    );
  }

  return simAws;
}

/** The request options that make a call arrive as the Role. */
const asRole = {
  caller: {
    kind: "arn",
    arn: `arn:aws:iam::${accountIdOneOnes}:role/OrdersFunctionRole`,
  },
} as const;

const publishOneFailure = new PutMetricDataCommand({
  Namespace: "Orders",
  MetricData: [{ MetricName: "Failed", Value: 1 }],
});

describe("CloudWatch metrics IAM authorization", () => {
  it("allows a Role granted the action on every resource", async () => {
    // Given a Role allowed to publish metrics, which has no resource to name
    // because CloudWatch metrics have no ARN.
    const simAws = await simAwsWithRole({
      Action: "cloudwatch:PutMetricData",
      Resource: "*",
    });

    // When it publishes.
    await simAws.cloudWatch().putMetricData(publishOneFailure, asRole);

    // Then the metric was recorded.
    assertArrayLength(simAws.cloudWatch().allMetrics(), 1);
  });

  it("denies a Role with no policy for the action", async () => {
    // Given a Role allowed to list metrics and nothing else.
    const simAws = await simAwsWithRole({
      Action: "cloudwatch:ListMetrics",
      Resource: "*",
    });

    // When it tries to publish one.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudWatch().putMetricData(publishOneFailure, asRole),
    );

    // Then it is denied, and listing still works.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudwatch:PutMetricData");
    await simAws.cloudWatch().listMetrics(new ListMetricsCommand({}), asRole);
  });

  it("narrows publishing to one namespace by condition", async () => {
    // Given a Role allowed to publish only into the Orders namespace, which is
    // the only way a policy can scope this action.
    const simAws = await simAwsWithRole({
      Action: "cloudwatch:PutMetricData",
      Resource: "*",
      Condition: {
        StringEquals: { [simCloudWatchNamespaceConditionKey]: "Orders" },
      },
    });

    // When it publishes into that namespace, and then into another.
    await simAws.cloudWatch().putMetricData(publishOneFailure, asRole);

    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudWatch().putMetricData(
          new PutMetricDataCommand({
            Namespace: "Billing",
            MetricData: [{ MetricName: "Retried", Value: 1 }],
          }),
          asRole,
        ),
    );

    // Then the first was recorded and the second denied.
    assertArrayLength(simAws.cloudWatch().allMetrics(), 1);
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("reaches nothing with a policy written against a metric ARN", async () => {
    // Given a Role whose policy names a resource, as a policy for most other
    // services would.
    const simAws = await simAwsWithRole({
      Action: "cloudwatch:PutMetricData",
      Resource: `arn:aws:cloudwatch:us-east-1:${accountIdOneOnes}:metric/Orders/Failed`,
    });

    // When it publishes.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudWatch().putMetricData(publishOneFailure, asRole),
    );

    // Then it is denied, as it would be in an account: metrics have no ARN, so
    // there is nothing for such a statement to match.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
