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

  it("refuses a 3XX fixed response, which is a redirect action's job", () => {
    // Given a fixed-response action carrying a redirect's status code.
    const error = assertThrowsError(() => {
      SimElbV2Action.read(
        { Type: "fixed-response", FixedResponseConfig: { StatusCode: "302" } },
        "Actions",
      );
    });

    // Then it is refused, as real ELB takes only 2XX, 4XX and 5XX here.
    assertInstanceOf(error, SimElbV2ValidationError);
    assertStringIncludes(error.message, "redirect action");
  });

  it("refuses more than one action, since each one is a routing action", () => {
    // Given two forward actions in one list.
    const error = assertThrowsError(() => {
      SimElbV2Action.readAll(
        [
          { Type: "forward", TargetGroupArn: targetGroupArn },
          { Type: "forward", TargetGroupArn: targetGroupArn },
        ],
        "DefaultActions",
      );
    });

    // Then it is refused: real ELB takes one routing action, and the
    // authentication actions that could precede it are not simulated.
    assertInstanceOf(error, SimElbV2ValidationError);
    assertStringIncludes(error.message, "one routing action");
  });

  it("keeps what it stored when the caller mutates the input afterwards", () => {
    // Given an action read from an object the caller still holds.
    const input = { Type: "forward", TargetGroupArn: targetGroupArn };
    const action = SimElbV2Action.read(input, "Actions");

    // When the caller changes that object.
    input.TargetGroupArn = "arn:aws:elasticloadbalancing:::targetgroup/other/1";

    // Then the action still forwards where it was written to forward.
    assertIdentical(action.view().TargetGroupArn, targetGroupArn);
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
    assertStringIncludes(fixedResponse.message, "2XX, 4XX or 5XX");
    assertStringIncludes(redirect.message, "HTTP_301 or HTTP_302");
  });

  it("refuses a content type a fixed response will not be sent as", () => {
    // Given a fixed response naming a content type ELB does not send.
    const error = assertThrowsError(() => {
      SimElbV2Action.read(
        {
          Type: "fixed-response",
          FixedResponseConfig: {
            StatusCode: "200",
            ContentType: "image/png",
          },
        },
        "Actions",
      );
    });

    // Then it is refused: the action is for a short answer the load balancer
    // writes itself, and the list of types ELB will send is short with it.
    assertInstanceOf(error, SimElbV2ValidationError);
    assertStringIncludes(error.message, "image/png");
  });

  it("refuses a redirect component ELB would not take", () => {
    // Given redirects naming a protocol, port and path outside what ELB takes.
    const protocol = assertThrowsError(() => {
      SimElbV2Action.read(
        {
          Type: "redirect",
          RedirectConfig: { StatusCode: "HTTP_301", Protocol: "FTP" },
        },
        "Actions",
      );
    });

    assertInstanceOf(protocol, SimElbV2ValidationError);

    const port = assertThrowsError(() => {
      SimElbV2Action.read(
        {
          Type: "redirect",
          RedirectConfig: { StatusCode: "HTTP_301", Port: "99999" },
        },
        "Actions",
      );
    });

    assertInstanceOf(port, SimElbV2ValidationError);

    const path = assertThrowsError(() => {
      SimElbV2Action.read(
        {
          Type: "redirect",
          RedirectConfig: { StatusCode: "HTTP_301", Path: "moved/#{path}" },
        },
        "Actions",
      );
    });

    assertInstanceOf(path, SimElbV2ValidationError);

    // Then each is refused when the rule is written.
    assertStringIncludes(protocol.message, "HTTP, HTTPS or #{protocol}");
    assertStringIncludes(port.message, "1 to 65535");
    assertStringIncludes(path.message, "must start with a '/'");
  });

  it("takes the keywords a redirect reuses the request's own parts with", () => {
    // Given a redirect keeping every component but the host.
    const action = SimElbV2Action.read(
      {
        Type: "redirect",
        RedirectConfig: {
          StatusCode: "HTTP_302",
          Protocol: "#{protocol}",
          Host: "new.#{host}",
          Port: "#{port}",
          Path: "/#{path}",
          Query: "#{query}",
        },
      },
      "Actions",
    );

    // Then it is accepted, since the host is a change and the rest of the URI
    // being kept is what the keywords are for.
    assertIdentical(action.redirect?.Host, "new.#{host}");
  });

  it("refuses a redirect that changes no part of the request URI", () => {
    // Given a redirect naming only the query string, and one naming every
    // other component as the request's own.
    const queryOnly = assertThrowsError(() => {
      SimElbV2Action.read(
        {
          Type: "redirect",
          RedirectConfig: { StatusCode: "HTTP_301", Query: "moved=1" },
        },
        "Actions",
      );
    });

    assertInstanceOf(queryOnly, SimElbV2ValidationError);

    const unchanged = assertThrowsError(() => {
      SimElbV2Action.read(
        {
          Type: "redirect",
          RedirectConfig: {
            StatusCode: "HTTP_301",
            Protocol: "#{protocol}",
            Host: "#{host}",
            Port: "#{port}",
            Path: "/#{path}",
          },
        },
        "Actions",
      );
    });

    assertInstanceOf(unchanged, SimElbV2ValidationError);

    // Then both are refused, because a redirect to the request's own URI is a
    // loop, and real ELB requires the protocol, host, port or path to change.
    assertStringIncludes(queryOnly.message, "redirects to itself");
    assertStringIncludes(unchanged.message, "redirects to itself");
  });
});
