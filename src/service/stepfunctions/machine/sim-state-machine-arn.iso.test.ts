import {
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  parseSimStateMachineArn,
  simStateMachineArn,
  simStatesExecutionArn,
} from "./sim-state-machine-arn.js";

const scope = {
  regionName: "eu-west-2",
  accountId: "123456789012",
} as Parameters<typeof simStateMachineArn>[0];

describe("Step Functions ARNs", () => {
  it("builds a state machine ARN and reads it back", () => {
    // Given a scope and a name.
    // When an ARN is built and parsed.
    const arn = simStateMachineArn(scope, "Enrolment");
    const parsed = parseSimStateMachineArn(arn);

    // Then it carries the Region, Account and name.
    assertIdentical(
      arn,
      "arn:aws:states:eu-west-2:123456789012:stateMachine:Enrolment",
    );
    assertObjectEquals(parsed, {
      regionName: "eu-west-2",
      accountId: "123456789012",
      name: "Enrolment",
    });
  });

  it("separates an execution ARN's parts with colons", () => {
    // Given a state machine name and an execution name.
    // When the execution ARN is built.
    const arn = simStatesExecutionArn(scope, "Enrolment", "one");

    // Then both names are colon-separated parts, as real Step Functions writes
    // them.
    assertIdentical(
      arn,
      "arn:aws:states:eu-west-2:123456789012:execution:Enrolment:one",
    );
  });

  it("reads nothing from a string that is not a state machine ARN", () => {
    // Given strings that are not one.
    const refused = [
      "not-an-arn",
      "arn:aws:states:eu-west-2:123456789012:execution:Enrolment:one",
      "arn:aws:lambda:eu-west-2:123456789012:stateMachine:Enrolment",
      "arn:aws-cn:states:eu-west-2:123456789012:stateMachine:Enrolment",
      "arn:aws:states::123456789012:stateMachine:Enrolment",
      "arn:aws:states:eu-west-2::stateMachine:Enrolment",
      "arn:aws:states:eu-west-2:123456789012:stateMachine:",
      "not:aws:states:eu-west-2:123456789012:stateMachine:Enrolment",
    ];

    // When each is parsed, nothing is read from any of them.
    for (const value of refused) {
      assertUndefined(parseSimStateMachineArn(value));
    }
  });
});
