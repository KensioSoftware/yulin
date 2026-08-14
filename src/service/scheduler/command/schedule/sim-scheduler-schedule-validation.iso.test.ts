import {
  CreateScheduleCommand,
  type CreateScheduleCommandInput,
} from "@aws-sdk/client-scheduler";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSchedulerUnsimulatedInputException,
  SimSchedulerValidationException,
} from "../../error/sim-scheduler.error.js";

const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

/**
 * Try to create a schedule, and answer with what it was refused with.
 */
async function refusedSchedule(
  overrides: Partial<CreateScheduleCommandInput>,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    await simAws.scheduler().createSchedule(
      new CreateScheduleCommand({
        Name: "nightly-report",
        ScheduleExpression: "rate(1 hour)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: { Arn: functionArn, RoleArn: roleArn },
        ...overrides,
      }),
    );
  });
}

describe("Scheduler schedule validation", () => {
  it("refuses a name outside what AWS takes", async () => {
    const spaced = await refusedSchedule({ Name: "nightly report" });
    const tooLong = await refusedSchedule({ Name: "n".repeat(65) });

    assertInstanceOf(spaced, SimSchedulerValidationException);
    assertStringIncludes(spaced.message, "nightly report");
    assertInstanceOf(tooLong, SimSchedulerValidationException);
  });

  it("requires a flexible time window, as AWS does", async () => {
    // Given a request leaving out the window, which AWS makes required.
    const error = await refusedSchedule({ FlexibleTimeWindow: undefined });

    assertInstanceOf(error, SimSchedulerValidationException);
    assertStringIncludes(error.message, "FlexibleTimeWindow is required");
  });

  it("refuses a flexible window rather than firing at the exact time", async () => {
    // Given a window AWS would invoke at an unpredictable moment inside.
    const error = await refusedSchedule({
      FlexibleTimeWindow: { Mode: "FLEXIBLE", MaximumWindowInMinutes: 15 },
    });

    // Then it is refused, because firing exactly on time instead would let a
    // test rely on timing AWS does not promise.
    assertInstanceOf(error, SimSchedulerUnsimulatedInputException);
    assertStringIncludes(error.message, "does not promise");
  });

  it("refuses a schedule group other than the default one", async () => {
    const error = await refusedSchedule({ GroupName: "reporting" });

    assertInstanceOf(error, SimSchedulerUnsimulatedInputException);
    assertStringIncludes(error.message, "Schedule groups are not simulated");
  });

  it("refuses a timezone rather than running the schedule in UTC anyway", async () => {
    // Given a nightly schedule written for London.
    const error = await refusedSchedule({
      ScheduleExpressionTimezone: "Europe/London",
    });

    // Then it is refused: running it in UTC would fire it at the wrong hour,
    // which is the thing a test of a nightly job is checking.
    assertInstanceOf(error, SimSchedulerUnsimulatedInputException);
    assertStringIncludes(error.message, "wrong hour");
  });

  it("refuses a target service it cannot invoke", async () => {
    const error = await refusedSchedule({
      Target: {
        Arn: "arn:aws:states:us-east-1:888888888888:stateMachine:report",
        RoleArn: roleArn,
      },
    });

    assertInstanceOf(error, SimSchedulerValidationException);
    assertStringIncludes(error.message, "lambda, sqs, sns");
  });

  it("refuses a Lambda ARN naming something that is not a function", async () => {
    // Given a layer and an event source mapping, which are Lambda ARNs and
    // are not functions.
    const layer = await refusedSchedule({
      Target: {
        Arn: "arn:aws:lambda:us-east-1:888888888888:layer:shared",
        RoleArn: roleArn,
      },
    });
    const mapping = await refusedSchedule({
      Target: {
        Arn: "arn:aws:lambda:us-east-1:888888888888:event-source-mapping:abcd",
        RoleArn: roleArn,
      },
    });

    // Then both are refused rather than read as a function of that name.
    assertInstanceOf(layer, SimSchedulerValidationException);
    assertStringIncludes(layer.message, "names no function");
    assertInstanceOf(mapping, SimSchedulerValidationException);
    assertStringIncludes(mapping.message, "names no function");
  });

  it("requires the execution role every schedule invokes its target as", async () => {
    // Given a target with no RoleArn, which AWS requires.
    const missing = await refusedSchedule({
      Target: { Arn: functionArn, RoleArn: undefined },
    });

    // And one whose RoleArn is not a role ARN at all.
    const notARole = await refusedSchedule({
      Target: { Arn: functionArn, RoleArn: functionArn },
    });

    assertInstanceOf(missing, SimSchedulerValidationException);
    assertStringIncludes(missing.message, "RoleArn is required");
    assertInstanceOf(notARole, SimSchedulerValidationException);
    assertStringIncludes(notARole.message, "is not an IAM role ARN");
  });

  it("refuses the target properties it does not model", async () => {
    // Given targets asking for behaviour that is not simulated.
    const withDlq = await refusedSchedule({
      Target: {
        Arn: functionArn,
        RoleArn: roleArn,
        DeadLetterConfig: { Arn: "arn:aws:sqs:us-east-1:888888888888:dead" },
      },
    });
    const withRetry = await refusedSchedule({
      Target: {
        Arn: functionArn,
        RoleArn: roleArn,
        RetryPolicy: { MaximumRetryAttempts: 3 },
      },
    });

    // Then each is refused rather than dropped, since a dead letter queue that
    // is never written to is worse than one that was refused.
    assertInstanceOf(withDlq, SimSchedulerUnsimulatedInputException);
    assertInstanceOf(withRetry, SimSchedulerUnsimulatedInputException);
  });

  it("refuses a start and end date rather than ignoring the window", async () => {
    const withStart = await refusedSchedule({
      StartDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    const withEnd = await refusedSchedule({
      EndDate: new Date("2026-09-01T00:00:00.000Z"),
    });

    assertInstanceOf(withStart, SimSchedulerUnsimulatedInputException);
    assertInstanceOf(withEnd, SimSchedulerUnsimulatedInputException);
  });

  it("refuses a customer managed key rather than leaving input unencrypted", async () => {
    const error = await refusedSchedule({
      KmsKeyArn: "arn:aws:kms:us-east-1:888888888888:key/abcd",
    });

    assertInstanceOf(error, SimSchedulerUnsimulatedInputException);
  });

  it("refuses an expression it cannot read", async () => {
    const missing = await refusedSchedule({ ScheduleExpression: undefined });
    const nonsense = await refusedSchedule({
      ScheduleExpression: "every(1 hour)",
    });

    assertInstanceOf(missing, SimSchedulerValidationException);
    assertStringIncludes(missing.message, "ScheduleExpression is required");
    assertInstanceOf(nonsense, SimSchedulerValidationException);
  });

  it("takes a rate whose unit disagrees, unlike an EventBridge rule", async () => {
    // Given the expression EventBridge refuses for its plural.
    const simAws = new SimAws();

    const created = await simAws.scheduler().createSchedule(
      new CreateScheduleCommand({
        Name: "hourly",
        ScheduleExpression: "rate(1 hours)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: { Arn: functionArn, RoleArn: roleArn },
      }),
    );

    // Then Scheduler takes it, which is the difference between the two
    // dialects and why the parser takes one rather than assuming.
    assertStringIncludes(
      String(created.ScheduleArn),
      "schedule/default/hourly",
    );
  });

  it("refuses an action after completion that is not one", async () => {
    // Given a value the SDK's own enum would not let through, which is the
    // kind of thing that arrives over HTTP rather than through the SDK.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.scheduler().createSchedule({
        input: {
          Name: "nightly-report",
          ScheduleExpression: "rate(1 hour)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: { Arn: functionArn, RoleArn: roleArn },
          ActionAfterCompletion: "ARCHIVE",
        },
      });
    });

    assertInstanceOf(error, SimSchedulerValidationException);
    assertStringIncludes(error.message, "NONE or DELETE");
  });
});
