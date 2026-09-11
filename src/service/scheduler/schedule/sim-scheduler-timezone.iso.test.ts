import {
  CreateScheduleCommand,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  aSimulationFrom,
  dueInstants,
  nightlyIn,
} from "../../../../test/scheduler/timezone-schedule-fixture.js";

describe("Scheduler firing in the zone a schedule names", () => {
  it("falls due at the named zone's instant rather than at UTC's", async () => {
    // Given a schedule due at 02:00 in London, in a month London is an hour
    // ahead of UTC.
    const { simAws } = await aSimulationFrom("2026-06-30T12:00:00Z");

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(
          nightlyIn("Europe/London", "cron(0 2 * * ? *)"),
        ),
      );

    // Then it is due at 01:00 UTC, which is 02:00 in London.
    assertArrayEquals(dueInstants(simAws, "2026-06-30T12:00:00Z", 1), [
      "2026-07-01T01:00:00.000Z",
    ]);

    await simAws.close();
  });

  it("keeps the wall-clock hour across the day the clocks change", async () => {
    // Given a schedule due at 03:30 in New York, read from before the spring
    // change to after it.
    const { simAws } = await aSimulationFrom("2026-03-07T00:00:00Z");

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(
          nightlyIn("America/New_York", "cron(30 3 * * ? *)"),
        ),
      );

    // Then each one is 03:30 in New York, which is an hour earlier in UTC once
    // the clocks have gone forward on the second Sunday of March.
    assertArrayEquals(dueInstants(simAws, "2026-03-07T00:00:00Z", 3), [
      "2026-03-07T08:30:00.000Z",
      "2026-03-08T07:30:00.000Z",
      "2026-03-09T07:30:00.000Z",
    ]);

    await simAws.close();
  });

  it("falls due in UTC when the schedule names no zone", async () => {
    // Given the same nightly schedule with no zone named.
    const { simAws } = await aSimulationFrom("2026-06-30T12:00:00Z");
    const request = nightlyIn("Europe/London", "cron(0 2 * * ? *)");

    await simAws.scheduler().createSchedule(
      new CreateScheduleCommand({
        ...request,
        ScheduleExpressionTimezone: undefined,
      }),
    );

    // Then it is due at 02:00 UTC, as every schedule was before zones were
    // read.
    assertArrayEquals(dueInstants(simAws, "2026-06-30T12:00:00Z", 1), [
      "2026-07-01T02:00:00.000Z",
    ]);

    await simAws.close();
  });

  it("invokes the target at the zone's instant and not at UTC's", async () => {
    // Given a schedule due at 02:00 in London.
    const { simAws, invocations } = await aSimulationFrom(
      "2026-07-01T00:00:00Z",
    );

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(
          nightlyIn("Europe/London", "cron(0 2 * * ? *)"),
        ),
      );

    // When the clock reaches 00:59 UTC, and then 01:00.
    await simAws.clock().advanceBy({ minutes: 59 });
    const beforeDue = invocations.length;

    await simAws.clock().advanceBy({ minutes: 1 });

    // Then nothing fired until London read 02:00.
    assertIdentical(beforeDue, 0);
    assertArrayLength(invocations, 1);

    await simAws.close();
  });

  it("reports the timezone a schedule was created with", async () => {
    // Given a schedule created in a named zone.
    const { simAws } = await aSimulationFrom("2026-06-30T12:00:00Z");

    await simAws
      .scheduler()
      .createSchedule(
        new CreateScheduleCommand(
          nightlyIn("Europe/London", "cron(0 2 * * ? *)"),
        ),
      );

    // When it is read back.
    const described = await simAws
      .scheduler()
      .getSchedule(new GetScheduleCommand({ Name: "reconciliation" }));

    // Then the zone is reported as it was written.
    assertIdentical(described.ScheduleExpressionTimezone, "Europe/London");

    await simAws.close();
  });
});
