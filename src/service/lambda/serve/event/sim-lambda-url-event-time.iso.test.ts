import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simLambdaUrlEventTime } from "./sim-lambda-url-event-time.js";

describe("Sim Lambda Function URL event time", () => {
  it("formats the time as real Function URL events carry it", () => {
    // Given an instant.
    const at = new Date("2020-03-12T19:03:58.390Z");

    // When it is formatted for the event request context.
    const time = simLambdaUrlEventTime(at);

    // Then it is the Common Log Format stamp, not an ISO-8601 one.
    assertIdentical(time, "12/Mar/2020:19:03:58 +0000");
  });

  it("formats in UTC, whatever the host timezone offset", () => {
    // Given an instant late in the UTC day.
    const at = new Date("2024-01-01T23:07:05Z");

    // When it is formatted.
    const time = simLambdaUrlEventTime(at);

    // Then the UTC date and time are used, with the fixed +0000 offset.
    assertIdentical(time, "01/Jan/2024:23:07:05 +0000");
  });
});
