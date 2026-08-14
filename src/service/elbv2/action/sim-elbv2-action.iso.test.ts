import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../error/sim-elbv2.error.js";
import { SimElbV2Action } from "./sim-elbv2-action.js";

const targetGroupArn =
  "arn:aws:elasticloadbalancing:eu-west-1:888888888888:targetgroup/web/0001";

describe("sim ELBv2 actions", () => {
  it("reads the target groups a forward action names either way", () => {
    // Given a forward action written in each of the two forms ELB takes.
    const plain = SimElbV2Action.read(
      { Type: "forward", TargetGroupArn: targetGroupArn },
      "Actions",
    );
    const weighted = SimElbV2Action.read(
      {
        Type: "forward",
        ForwardConfig: {
          TargetGroups: [{ TargetGroupArn: targetGroupArn, Weight: 1 }],
        },
      },
      "Actions",
    );

    // Then both name the same target group.
    assertIdentical(plain.targetGroupArns[0], targetGroupArn);
    assertIdentical(weighted.targetGroupArns[0], targetGroupArn);
  });

  it("reports an action in the shape the SDK reads it back in", () => {
    // Given a fixed-response action with an order.
    const action = SimElbV2Action.read(
      {
        Type: "fixed-response",
        Order: 1,
        FixedResponseConfig: { StatusCode: "503", ContentType: "text/plain" },
      },
      "DefaultActions",
    );

    // When it is viewed.
    const view = action.view();

    // Then it carries what it was given.
    assertIdentical(view.Type, "fixed-response");
    assertIdentical(view.Order, 1);
    assertIdentical(view.FixedResponseConfig?.StatusCode, "503");
  });

  it("refuses an action list that is empty or absent", () => {
    // Given no actions at all, and an empty list.
    const absent = assertThrowsError(() => {
      SimElbV2Action.readAll(undefined, "Actions");
    });

    assertInstanceOf(absent, SimElbV2ValidationError);

    const empty = assertThrowsError(() => {
      SimElbV2Action.readAll([], "Actions");
    });

    assertInstanceOf(empty, SimElbV2ValidationError);

    // Then both are refused, since a listener with nothing to do is not one.
    assertStringIncludes(absent.message, "at least one action");
    assertStringIncludes(empty.message, "at least one action");
  });

  it("refuses an action type this simulation does not perform", () => {
    // Given an action with no type, and one that authenticates.
    const noType = assertThrowsError(() => {
      SimElbV2Action.read({}, "Actions");
    });

    assertInstanceOf(noType, SimElbV2ValidationError);

    const authenticate = assertThrowsError(() => {
      SimElbV2Action.read({ Type: "authenticate-cognito" }, "Actions");
    });

    assertInstanceOf(authenticate, SimElbV2UnsimulatedInputException);

    // Then both are refused rather than treated as a plain forward.
    assertStringIncludes(noType.message, "requires a Type");
    assertStringIncludes(authenticate.message, "not simulated");
  });

  it("refuses an action whose configuration would not work", () => {
    // Given a forward with no target group, and two malformed responses.
    const forward = assertThrowsError(() => {
      SimElbV2Action.read({ Type: "forward" }, "Actions");
    });

    assertInstanceOf(forward, SimElbV2ValidationError);

    const fixedResponse = assertThrowsError(() => {
      SimElbV2Action.read(
        { Type: "fixed-response", FixedResponseConfig: { StatusCode: "42" } },
        "Actions",
      );
    });

    assertInstanceOf(fixedResponse, SimElbV2ValidationError);

    const redirect = assertThrowsError(() => {
      SimElbV2Action.read({ Type: "redirect" }, "Actions");
    });

    assertInstanceOf(redirect, SimElbV2ValidationError);

    // Then each is refused when written rather than when a request arrives.
    assertStringIncludes(forward.message, "TargetGroupArn");
    assertStringIncludes(
      fixedResponse.message,
      "StatusCode between 200 and 599",
    );
    assertStringIncludes(redirect.message, "HTTP_301 or HTTP_302");
  });
});
