import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import { SimElbV2RuleCondition } from "./sim-elbv2-rule-condition.js";

describe("sim ELBv2 rule conditions", () => {
  it("takes values in either of the two forms ELB writes them in", () => {
    // Given a host header condition written each way.
    const plain = SimElbV2RuleCondition.read({
      Field: "host-header",
      Values: ["shop.example.com"],
    });
    const configured = SimElbV2RuleCondition.read({
      Field: "host-header",
      HostHeaderConfig: { Values: ["shop.example.com"] },
    });

    // Then both are read as host header conditions.
    assertIdentical(plain.field, "host-header");
    assertIdentical(configured.field, "host-header");
    assertIdentical(configured.view().Field, "host-header");
  });

  it("takes the conditions an ALB rule can be written on", () => {
    // Given one condition of each simulated field.
    const conditions = SimElbV2RuleCondition.readAll([
      { Field: "path-pattern", PathPatternConfig: { Values: ["/api/*"] } },
      { Field: "http-request-method", Values: ["POST"] },
      { Field: "source-ip", SourceIpConfig: { Values: ["10.0.0.0/8"] } },
      {
        Field: "http-header",
        HttpHeaderConfig: { HttpHeaderName: "X-Tenant", Values: ["shop"] },
      },
      {
        Field: "query-string",
        QueryStringConfig: { Values: [{ Key: "version", Value: "2" }] },
      },
    ]);

    // Then all five are accepted.
    assertArrayLength(conditions, 5);
  });

  it("refuses a condition list that is empty or absent", () => {
    // Given no conditions at all, and an empty list.
    const absent = assertThrowsError(() => {
      SimElbV2RuleCondition.readAll(undefined);
    });

    assertInstanceOf(absent, SimElbV2ValidationError);

    const empty = assertThrowsError(() => {
      SimElbV2RuleCondition.readAll([]);
    });

    assertInstanceOf(empty, SimElbV2ValidationError);

    // Then both are refused, since a rule matching everything is the default.
    assertStringIncludes(absent.message, "at least one condition");
    assertStringIncludes(empty.message, "at least one condition");
  });

  it("refuses a field nothing here understands", () => {
    // Given a condition with no field, and one on a field ELB does not have.
    const noField = assertThrowsError(() => {
      SimElbV2RuleCondition.read({});
    });

    assertInstanceOf(noField, SimElbV2ValidationError);

    const unknown = assertThrowsError(() => {
      SimElbV2RuleCondition.read({ Field: "user-agent", Values: ["curl"] });
    });

    assertInstanceOf(unknown, SimElbV2UnsimulatedInputException);

    // Then both are refused rather than stored and never matched.
    assertStringIncludes(noField.message, "requires a Field");
    assertStringIncludes(unknown.message, "not simulated");
  });

  it("refuses a condition with nothing to compare against", () => {
    // Given conditions of three fields, each missing its values.
    const hostHeader = assertThrowsError(() => {
      SimElbV2RuleCondition.read({ Field: "host-header" });
    });

    assertInstanceOf(hostHeader, SimElbV2ValidationError);

    const httpHeaderName = assertThrowsError(() => {
      SimElbV2RuleCondition.read({
        Field: "http-header",
        HttpHeaderConfig: { Values: ["shop"] },
      });
    });

    assertInstanceOf(httpHeaderName, SimElbV2ValidationError);

    const httpHeaderValues = assertThrowsError(() => {
      SimElbV2RuleCondition.read({
        Field: "http-header",
        HttpHeaderConfig: { HttpHeaderName: "X-Tenant" },
      });
    });

    assertInstanceOf(httpHeaderValues, SimElbV2ValidationError);

    const queryString = assertThrowsError(() => {
      SimElbV2RuleCondition.read({ Field: "query-string" });
    });

    assertInstanceOf(queryString, SimElbV2ValidationError);

    // Then each is refused.
    assertStringIncludes(hostHeader.message, "at least one value");
    assertStringIncludes(httpHeaderName.message, "HttpHeaderName");
    assertStringIncludes(httpHeaderValues.message, "at least one value");
    assertStringIncludes(queryString.message, "key and value pair");
  });
});
