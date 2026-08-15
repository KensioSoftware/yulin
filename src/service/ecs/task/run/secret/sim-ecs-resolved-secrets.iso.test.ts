import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimEcsResolvedSecrets } from "./sim-ecs-resolved-secrets.js";

describe("The secrets a simulated ECS task's containers run with", () => {
  it("answers with the variables one container's secrets set", () => {
    // Given secrets resolved for one container of a task.
    const secrets = SimEcsResolvedSecrets.resolved(
      new Map([["app", { DB_PASSWORD: "hunter2" }]]),
    );

    // When a container asks for its own.
    // Then it gets them, and a container that declared none gets none.
    assertTrue(secrets.isResolved);
    assertIdentical(secrets.forContainer("app")["DB_PASSWORD"], "hunter2");
    assertArrayLength(Object.keys(secrets.forContainer("logs")), 0);
  });

  it("carries the reason a task could not start", () => {
    // Given a resolution that failed.
    const secrets = SimEcsResolvedSecrets.failed("ResourceInitializationError");

    // When the runner asks why.
    // Then it has the reason to stop the task with.
    assertFalse(secrets.isResolved);
    assertIdentical(secrets.failureReason, "ResourceInitializationError");
  });

  it("refuses to report a failure reason where there is none", () => {
    // Given secrets that resolved.
    const secrets = SimEcsResolvedSecrets.resolved(new Map());

    // When something asks why the task failed anyway.
    const error = assertThrowsError(() => secrets.failureReason);

    // Then it says there is no reason, rather than answering with an empty one.
    assertStringIncludes(error.message, "no failure reason");
  });
});
