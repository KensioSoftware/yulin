import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleCommand,
  DeleteScheduleGroupCommand,
  GetScheduleCommand,
  GetScheduleGroupCommand,
  ListScheduleGroupsCommand,
  ListSchedulesCommand,
  SchedulerClient,
  UpdateScheduleCommand,
} from "@aws-sdk/client-scheduler";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";

const functionArn = "arn:aws:lambda:eu-west-2:888888888888:function:reconcile";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

describe("Scheduler SDK interception", () => {
  it("routes an intercepted SchedulerClient to simulated Scheduler", async () => {
    // Given an intercepted Scheduler SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(SchedulerClient);

    const client = new SchedulerClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a schedule and reads it back.
    const created = await client.send(
      new CreateScheduleCommand({
        Name: "nightly-report",
        ScheduleExpression: "cron(0 2 * * ? *)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: { Arn: functionArn, RoleArn: roleArn },
      }),
    );

    const described = await client.send(
      new GetScheduleCommand({ Name: "nightly-report" }),
    );

    // Then it reached the simulation, in the client's own Region.
    assertStringIncludes(
      String(created.ScheduleArn),
      "arn:aws:scheduler:eu-west-2:888888888888:schedule/default/nightly-report",
    );
    assertIdentical(described.ScheduleExpression, "cron(0 2 * * ? *)");
  });

  it("routes every command simulated Scheduler handles", async () => {
    // Given an intercepted client with a schedule already created.
    using simSdk = new SimSdk();
    simSdk.intercept(SchedulerClient);

    const client = new SchedulerClient({ region: "eu-west-2" });

    await client.send(
      new CreateScheduleCommand({
        Name: "nightly-report",
        ScheduleExpression: "rate(1 hour)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: { Arn: functionArn, RoleArn: roleArn },
      }),
    );

    // When each of the remaining commands is sent.
    await client.send(
      new UpdateScheduleCommand({
        Name: "nightly-report",
        ScheduleExpression: "rate(2 hours)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: { Arn: functionArn, RoleArn: roleArn },
      }),
    );

    const listed = await client.send(new ListSchedulesCommand({}));

    await client.send(new DeleteScheduleCommand({ Name: "nightly-report" }));

    const afterDelete = await client.send(new ListSchedulesCommand({}));

    // Then each was handled by the simulation rather than reaching AWS.
    assertArrayLength(listed.Schedules ?? [], 1);
    assertArrayEmpty(afterDelete.Schedules ?? []);
  });

  it("routes every schedule group command", async () => {
    // Given an intercepted client.
    using simSdk = new SimSdk();
    simSdk.intercept(SchedulerClient);

    const client = new SchedulerClient({ region: "eu-west-2" });

    // When a group is created, read, listed and deleted.
    await client.send(new CreateScheduleGroupCommand({ Name: "analytics" }));

    const described = await client.send(
      new GetScheduleGroupCommand({ Name: "analytics" }),
    );
    const listed = await client.send(new ListScheduleGroupsCommand({}));

    await client.send(new DeleteScheduleGroupCommand({ Name: "analytics" }));

    const afterDelete = await client.send(new ListScheduleGroupsCommand({}));

    // Then each reached the simulation, in the client's own Region, and the
    // listing keeps the default group the deletion did not touch.
    assertIdentical(
      described.Arn,
      "arn:aws:scheduler:eu-west-2:888888888888:schedule-group/analytics",
    );
    assertArrayLength(listed.ScheduleGroups ?? [], 2);
    assertArrayLength(afterDelete.ScheduleGroups ?? [], 1);
  });
});
