import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSchedulerDeliveryFailures } from "./sim-scheduler-delivery-failures.js";

const recorded = {
  scheduleName: "probe",
  scheduleArn:
    "arn:aws:scheduler:us-east-1:888888888888:schedule/default/probe",
  targetArn: "arn:aws:lambda:us-east-1:888888888888:function:reconcile",
  roleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
  at: new Date("2026-07-26T10:00:00.000Z"),
};

describe("Scheduler delivery failure", () => {
  it("reads a message off whatever the invocation threw", () => {
    // Given invocations that failed with an Error and with something else.
    const failures = new SimSchedulerDeliveryFailures();

    failures.record({ ...recorded, error: new Error("the role said no") });
    failures.record({ ...recorded, error: "the role said no, rudely" });

    // Then both read as a message. A test asserting on one does not have to
    // know what a target threw, and the error it threw is still there to look
    // at.
    const [thrown, rude] = failures.all;

    assertNonNullable(thrown);
    assertNonNullable(rude);
    assertIdentical(thrown.message, "the role said no");
    assertIdentical(rude.message, "the role said no, rudely");
    assertIdentical(rude.error, "the role said no, rudely");
  });

  it("carries the message into JSON", () => {
    // Given an invocation that failed with an Error, whose own message
    // property is not enumerable and so does not serialise on its own.
    const failures = new SimSchedulerDeliveryFailures();

    failures.record({
      ...recorded,
      error: new Error(
        "arn:aws:iam::888888888888:role/SchedulerRole is not a simulated " +
          "IAM role",
      ),
    });

    // When the failure is serialised. That is the first thing to reach for
    // when a schedule did not do what a test expected.
    const serialised = JSON.stringify(failures.all[0]);
    const read: unknown = JSON.parse(serialised);

    // Then the message is there alongside the fields naming the invocation.
    assertObjectMatches(read, {
      scheduleName: "probe",
      scheduleArn: recorded.scheduleArn,
      targetArn: recorded.targetArn,
      roleArn: recorded.roleArn,
      at: "2026-07-26T10:00:00.000Z",
      message:
        "arn:aws:iam::888888888888:role/SchedulerRole is not a simulated " +
        "IAM role",
    });
  });
});
