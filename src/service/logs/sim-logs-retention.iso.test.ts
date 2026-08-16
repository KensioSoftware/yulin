import {
  CreateLogGroupCommand,
  DeleteRetentionPolicyCommand,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceNotFoundException,
} from "./error/sim-logs.error.js";
import type { SimLogs } from "./sim-logs.js";

async function logsWithOrdersGroup(): Promise<SimLogs> {
  const logs = new SimAws().logs();

  await logs.createLogGroup(
    new CreateLogGroupCommand({ logGroupName: "/aws/lambda/orders" }),
  );

  return logs;
}

async function retentionOf(logs: SimLogs): Promise<number | undefined> {
  const described = await logs.describeLogGroups(
    new DescribeLogGroupsCommand({}),
  );

  return described.logGroups?.at(0)?.retentionInDays;
}

describe("SimLogs retention", () => {
  it("sets retention on a log group and reports it back", async () => {
    // Given a log group keeping its events forever.
    const logs = await logsWithOrdersGroup();

    assertUndefined(await retentionOf(logs));

    // When retention is set.
    await logs.putRetentionPolicy(
      new PutRetentionPolicyCommand({
        logGroupName: "/aws/lambda/orders",
        retentionInDays: 14,
      }),
    );

    // Then describing the group reports it, which is what a test asserts on.
    assertIdentical(await retentionOf(logs), 14);
  });

  it("clears retention, putting the group back to keeping events forever", async () => {
    // Given a log group with retention set.
    const logs = await logsWithOrdersGroup();

    await logs.putRetentionPolicy(
      new PutRetentionPolicyCommand({
        logGroupName: "/aws/lambda/orders",
        retentionInDays: 30,
      }),
    );

    // When the retention policy is deleted.
    await logs.deleteRetentionPolicy(
      new DeleteRetentionPolicyCommand({
        logGroupName: "/aws/lambda/orders",
      }),
    );

    // Then the group reports no retention at all.
    assertUndefined(await retentionOf(logs));
  });

  it("refuses a retention period outside the set real CloudWatch Logs accepts", async () => {
    // Given a log group.
    const logs = await logsWithOrdersGroup();

    // When a reasonable-looking number outside that set is asked for.
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.putRetentionPolicy(
          new PutRetentionPolicyCommand({
            logGroupName: "/aws/lambda/orders",
            retentionInDays: 10,
          }),
        ),
    );

    // Then it is refused, and the failure says which values are allowed.
    assertInstanceOf(error, SimLogsInvalidParameterException);
    assertStringIncludes(error.message, "1, 3, 5, 7, 14");
    assertUndefined(await retentionOf(logs));
  });

  it("refuses retention on a log group that is not there", async () => {
    // Given a simulated CloudWatch Logs holding nothing.
    const logs = new SimAws().logs();

    // When retention is set and cleared on a group that was never made.
    const put = await assertThrowsErrorAsync(
      async () =>
        await logs.putRetentionPolicy(
          new PutRetentionPolicyCommand({
            logGroupName: "orders",
            retentionInDays: 7,
          }),
        ),
    );
    const cleared = await assertThrowsErrorAsync(
      async () =>
        await logs.deleteRetentionPolicy(
          new DeleteRetentionPolicyCommand({ logGroupName: "orders" }),
        ),
    );

    // Then both fail as an unknown log group.
    assertInstanceOf(put, SimLogsResourceNotFoundException);
    assertInstanceOf(cleared, SimLogsResourceNotFoundException);
  });
});
