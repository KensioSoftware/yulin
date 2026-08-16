import {
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsResourceAlreadyExistsException,
  SimLogsResourceNotFoundException,
  SimLogsUnsupportedOperationException,
} from "./error/sim-logs.error.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;
const createdAt = new Date("2026-08-16T09:00:00.000Z");

describe("SimLogs log groups", () => {
  it("creates a log group and describes it", async () => {
    // Given a simulated CloudWatch Logs with a fixed clock.
    const simAws = new SimAws({ clock: new SimFixedClock(createdAt) });

    // When a log group is created and described.
    await simAws
      .logs()
      .createLogGroup(
        new CreateLogGroupCommand({ logGroupName: "/aws/lambda/orders" }),
      );
    const described = await simAws
      .logs()
      .describeLogGroups(new DescribeLogGroupsCommand({}));

    // Then it is reported with the time it was made, no retention, and
    // nothing stored yet.
    const group = described.logGroups?.at(0);

    assertNonNullable(group);
    assertIdentical(group.logGroupName, "/aws/lambda/orders");
    assertIdentical(group.creationTime, createdAt.getTime());
    assertUndefined(group.retentionInDays);
    assertIdentical(group.storedBytes, 0);
    assertIdentical(group.metricFilterCount, 0);
  });

  it("names a log group by the account and region it is in", async () => {
    // Given a log group in one account and region.
    const logs = new SimAws()
      .accountRegionScope(accountIdTwoTwos, "us-east-1")
      .logs();

    await logs.createLogGroup(
      new CreateLogGroupCommand({ logGroupName: "/aws/lambda/orders" }),
    );

    // When its ARNs are read.
    const described = await logs.describeLogGroups(
      new DescribeLogGroupsCommand({}),
    );
    const group = described.logGroups?.at(0);

    // Then both name that account and region, and only the older `arn` field
    // carries the wildcard that covers the streams inside the group.
    assertNonNullable(group);
    assertIdentical(
      group.logGroupArn,
      "arn:aws:logs:us-east-1:222222222222:log-group:/aws/lambda/orders",
    );
    assertIdentical(
      group.arn,
      "arn:aws:logs:us-east-1:222222222222:log-group:/aws/lambda/orders:*",
    );
  });

  it("refuses a log group that already exists", async () => {
    // Given a log group that has been created.
    const logs = new SimAws().logs();
    const command = new CreateLogGroupCommand({ logGroupName: "orders" });

    await logs.createLogGroup(command);

    // When the same name is created again.
    const error = await assertThrowsErrorAsync(
      async () => await logs.createLogGroup(command),
    );

    // Then it fails rather than answering with the group that is there.
    assertInstanceOf(error, SimLogsResourceAlreadyExistsException);
    assertIdentical(error.name, "ResourceAlreadyExistsException");
  });

  it("refuses a log group name real CloudWatch Logs would refuse", async () => {
    // Given a simulated CloudWatch Logs.
    const logs = new SimAws().logs();

    // When names are given that real CloudWatch Logs would not accept.
    const empty = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogGroup(
          new CreateLogGroupCommand({ logGroupName: "" }),
        ),
    );
    const spaced = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogGroup(
          new CreateLogGroupCommand({ logGroupName: "orders api" }),
        ),
    );
    const tooLong = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogGroup(
          new CreateLogGroupCommand({ logGroupName: "a".repeat(513) }),
        ),
    );

    // Then each is refused as an invalid parameter.
    assertInstanceOf(empty, SimLogsInvalidParameterException);
    assertInstanceOf(spaced, SimLogsInvalidParameterException);
    assertInstanceOf(tooLong, SimLogsInvalidParameterException);
  });

  it("deletes a log group, and refuses to delete one that is not there", async () => {
    // Given one log group.
    const logs = new SimAws().logs();

    await logs.createLogGroup(
      new CreateLogGroupCommand({ logGroupName: "orders" }),
    );

    // When it is deleted, and then deleted again.
    await logs.deleteLogGroup(
      new DeleteLogGroupCommand({ logGroupName: "orders" }),
    );
    const error = await assertThrowsErrorAsync(
      async () =>
        await logs.deleteLogGroup(
          new DeleteLogGroupCommand({ logGroupName: "orders" }),
        ),
    );

    // Then the first went, and the second failed as an unknown group.
    assertArrayLength(logs.allLogGroups(), 0);
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });

  it("describes log groups under a name prefix, oldest first", async () => {
    // Given log groups in two name hierarchies.
    const logs = new SimAws().logs();

    for (const logGroupName of [
      "/aws/lambda/orders",
      "/aws/ecs/workers",
      "/aws/lambda/billing",
    ]) {
      await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
    }

    // When one hierarchy is described.
    const described = await logs.describeLogGroups(
      new DescribeLogGroupsCommand({ logGroupNamePrefix: "/aws/lambda/" }),
    );

    // Then only that hierarchy is reported, in creation order.
    assertArrayEquals(
      described.logGroups?.map((group) => group.logGroupName),
      ["/aws/lambda/orders", "/aws/lambda/billing"],
    );
  });

  it("pages describing log groups", async () => {
    // Given more log groups than one page holds.
    const logs = new SimAws().logs();

    for (const index of [1, 2, 3]) {
      await logs.createLogGroup(
        new CreateLogGroupCommand({ logGroupName: `orders-${index}` }),
      );
    }

    // When they are described two at a time.
    const first = await logs.describeLogGroups(
      new DescribeLogGroupsCommand({ limit: 2 }),
    );
    const second = await logs.describeLogGroups(
      new DescribeLogGroupsCommand({ limit: 2, nextToken: first.nextToken }),
    );

    // Then the pages carry on from each other and the last one ends the walk.
    assertArrayEquals(
      first.logGroups?.map((group) => group.logGroupName),
      ["orders-1", "orders-2"],
    );
    assertArrayEquals(
      second.logGroups?.map((group) => group.logGroupName),
      ["orders-3"],
    );
    assertUndefined(second.nextToken);
  });

  it("refuses a page token it did not issue and a limit it does not offer", async () => {
    // Given one log group.
    const logs = new SimAws().logs();

    await logs.createLogGroup(
      new CreateLogGroupCommand({ logGroupName: "orders" }),
    );

    // When a made-up token and an out-of-range limit are sent.
    const token = await assertThrowsErrorAsync(
      async () =>
        await logs.describeLogGroups(
          new DescribeLogGroupsCommand({ nextToken: "somewhere-else" }),
        ),
    );
    const limit = await assertThrowsErrorAsync(
      async () =>
        await logs.describeLogGroups(
          new DescribeLogGroupsCommand({ limit: 51 }),
        ),
    );

    // Then both are refused rather than quietly reinterpreted.
    assertInstanceOf(token, SimLogsInvalidParameterException);
    assertInstanceOf(limit, SimLogsInvalidParameterException);
  });

  it("refuses log group inputs it would otherwise have to drop", async () => {
    // Given a simulated CloudWatch Logs.
    const logs = new SimAws().logs();

    // When a group is created with tags, a key, or a non-standard class.
    const tagged = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogGroup(
          new CreateLogGroupCommand({
            logGroupName: "orders",
            tags: { team: "platform" },
          }),
        ),
    );
    const encrypted = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogGroup(
          new CreateLogGroupCommand({
            logGroupName: "orders",
            kmsKeyId: "alias/logs",
          }),
        ),
    );
    const infrequent = await assertThrowsErrorAsync(
      async () =>
        await logs.createLogGroup(
          new CreateLogGroupCommand({
            logGroupName: "orders",
            logGroupClass: "INFREQUENT_ACCESS",
          }),
        ),
    );

    // Then each is refused, so nothing looks set here and behaves differently
    // in an account.
    assertInstanceOf(tagged, SimLogsUnsupportedOperationException);
    assertInstanceOf(encrypted, SimLogsUnsupportedOperationException);
    assertInstanceOf(infrequent, SimLogsUnsupportedOperationException);
  });

  it("accepts the standard log group class it behaves as", async () => {
    // Given a simulated CloudWatch Logs.
    const logs = new SimAws().logs();

    // When a group is created naming the class every operation here behaves as.
    await logs.createLogGroup(
      new CreateLogGroupCommand({
        logGroupName: "orders",
        logGroupClass: "STANDARD",
      }),
    );

    // Then it is made.
    assertNonNullable(logs.findLogGroup("orders"));
  });
});
