import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DescribeLogGroupsCommand,
  FilterLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
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

const accountIdOneOnes = "111111111111";
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]abc";

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
        PolicyName: "WriteOwnLogs",
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

describe("CloudWatch Logs IAM authorization", () => {
  it("allows a function to write its own log group", async () => {
    // Given a Role with the policy CDK writes for a function's own logs, which
    // names the group with the wildcard covering its streams.
    const simAws = await simAwsWithRole({
      Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      Resource: `arn:aws:logs:us-east-1:${accountIdOneOnes}:log-group:${logGroupName}:*`,
    });

    // When it creates the group and stream and writes an event.
    await simAws
      .logs()
      .createLogGroup(new CreateLogGroupCommand({ logGroupName }), asRole);
    await simAws
      .logs()
      .createLogStream(
        new CreateLogStreamCommand({ logGroupName, logStreamName }),
        asRole,
      );
    await simAws.logs().putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ timestamp: 1000, message: "order failed" }],
      }),
      asRole,
    );

    // Then each call is allowed.
    const found = await simAws
      .logs()
      .filterLogEvents(new FilterLogEventsCommand({ logGroupName }));

    assertArrayLength(found.events ?? [], 1);
  });

  it("denies a policy that leaves off the wildcard covering the streams", async () => {
    // Given a Role whose policy names the log group the way it is easy to
    // write it, without the trailing wildcard.
    const simAws = await simAwsWithRole({
      Action: "logs:CreateLogGroup",
      Resource: `arn:aws:logs:us-east-1:${accountIdOneOnes}:log-group:${logGroupName}`,
    });

    // When it creates the group.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .logs()
          .createLogGroup(
            new CreateLogGroupCommand({ logGroupName }),
            asRole,
          ),
    );

    // Then it is denied here, as it would be on real AWS.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("denies a write the caller's policy does not cover", async () => {
    // Given a Role allowed to write one function's logs, and another group.
    const simAws = await simAwsWithRole({
      Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
      Resource: `arn:aws:logs:us-east-1:${accountIdOneOnes}:log-group:${logGroupName}:*`,
    });

    await simAws
      .logs()
      .createLogGroup(
        new CreateLogGroupCommand({ logGroupName: "/aws/lambda/billing" }),
      );

    // When it writes to the other group.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().createLogStream(
          new CreateLogStreamCommand({
            logGroupName: "/aws/lambda/billing",
            logStreamName,
          }),
          asRole,
        ),
    );

    // Then it is denied rather than writing logs it has no permission for.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.name, "AccessDenied");
  });

  it("denies describing every log group to a policy scoped to one", async () => {
    // Given a Role allowed to read one log group only.
    const simAws = await simAwsWithRole({
      Action: "logs:DescribeLogGroups",
      Resource: `arn:aws:logs:us-east-1:${accountIdOneOnes}:log-group:${logGroupName}:*`,
    });

    // When it describes the log groups in the account and region.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .logs()
          .describeLogGroups(new DescribeLogGroupsCommand({}), asRole),
    );

    // Then it is denied: describing names no particular group, so it
    // authorizes against every one of them.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("allows describing every log group to a policy that covers them all", async () => {
    // Given a Role allowed to describe log groups across the account.
    const simAws = await simAwsWithRole({
      Action: "logs:DescribeLogGroups",
      Resource: `arn:aws:logs:us-east-1:${accountIdOneOnes}:log-group:*`,
    });

    await simAws
      .logs()
      .createLogGroup(new CreateLogGroupCommand({ logGroupName }));

    // When it describes them.
    const described = await simAws
      .logs()
      .describeLogGroups(new DescribeLogGroupsCommand({}), asRole);

    // Then the read is allowed.
    assertArrayLength(described.logGroups ?? [], 1);
  });

  it("denies a caller with no CloudWatch Logs permissions at all", async () => {
    // Given a Role with no policy.
    const simAws = await simAwsWithRole();

    // When it searches a log group.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .logs()
          .filterLogEvents(
            new FilterLogEventsCommand({ logGroupName }),
            asRole,
          ),
    );

    // Then it is denied before the missing group is ever looked for.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
