import { CreateLogGroupCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLogsGroupNames,
  simLogsWithGroups,
} from "../../../test/logs/log-group-fixture.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimLogsInvalidParameterException,
  SimLogsUnsupportedOperationException,
} from "./error/sim-logs.error.js";

/**
 * Create a log group, so a refusal can be asserted on without the command
 * being written out four times over.
 */
async function createGroup(
  logs: Awaited<ReturnType<typeof simLogsWithGroups>>,
  input: ConstructorParameters<typeof CreateLogGroupCommand>[0],
): Promise<unknown> {
  return await logs.createLogGroup(new CreateLogGroupCommand(input));
}

describe("SimLogs DescribeLogGroups", () => {
  it("describes log groups under a name prefix, oldest first", async () => {
    // Given log groups in two name hierarchies.
    const logs = await simLogsWithGroups([
      "/aws/lambda/orders",
      "/aws/ecs/workers",
      "/aws/lambda/billing",
    ]);

    // When one hierarchy is described.
    const described = await simLogsGroupNames(logs, {
      logGroupNamePrefix: "/aws/lambda/",
    });

    // Then only that hierarchy is reported, in creation order.
    assertArrayEquals(described.names, [
      "/aws/lambda/orders",
      "/aws/lambda/billing",
    ]);
  });

  it("pages describing log groups", async () => {
    // Given more log groups than one page holds.
    const logs = await simLogsWithGroups(["orders-1", "orders-2", "orders-3"]);

    // When they are described two at a time.
    const first = await simLogsGroupNames(logs, { limit: 2 });
    const second = await simLogsGroupNames(logs, {
      limit: 2,
      nextToken: first.nextToken,
    });

    // Then the pages carry on from each other and the last one ends the walk.
    assertArrayEquals(first.names, ["orders-1", "orders-2"]);
    assertArrayEquals(second.names, ["orders-3"]);
    assertUndefined(second.nextToken);
  });

  it("refuses a page token it did not issue and a limit it does not offer", async () => {
    // Given one log group.
    const logs = await simLogsWithGroups(["orders"]);

    // When a made-up token and an out-of-range limit are sent.
    const token = await assertThrowsErrorAsync(
      async () => await simLogsGroupNames(logs, { nextToken: "elsewhere" }),
    );
    const limit = await assertThrowsErrorAsync(
      async () => await simLogsGroupNames(logs, { limit: 51 }),
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
        await createGroup(logs, {
          logGroupName: "orders",
          tags: { team: "platform" },
        }),
    );
    const encrypted = await assertThrowsErrorAsync(
      async () =>
        await createGroup(logs, {
          logGroupName: "orders",
          kmsKeyId: "alias/logs",
        }),
    );
    const infrequent = await assertThrowsErrorAsync(
      async () =>
        await createGroup(logs, {
          logGroupName: "orders",
          logGroupClass: "INFREQUENT_ACCESS",
        }),
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
    await createGroup(logs, {
      logGroupName: "orders",
      logGroupClass: "STANDARD",
    });

    // Then it is made.
    assertNonNullable(logs.findLogGroup("orders"));
  });
});
