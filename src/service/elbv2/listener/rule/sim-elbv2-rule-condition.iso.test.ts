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

  it("takes the conditions a rule here can be written on", () => {
    // Given one condition of each simulated field.
    const conditions = SimElbV2RuleCondition.readAll([
      { Field: "path-pattern", PathPatternConfig: { Values: ["/api/*"] } },
      { Field: "host-header", Values: ["shop.example.com"] },
    ]);

    // Then both are accepted.
    assertArrayLength(conditions, 2);
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

  it("refuses a condition carrying another field's configuration", () => {
    // Given a host header condition whose only values are a path pattern's.
    const error = assertThrowsError(() => {
      SimElbV2RuleCondition.read({
        Field: "host-header",
        PathPatternConfig: { Values: ["/api/*"] },
      });
    });

    // Then it is refused: the field decides which configuration is read, so
    // this condition has no host names to match on.
    assertInstanceOf(error, SimElbV2ValidationError);
    assertStringIncludes(error.message, "at least one value");
  });

  it("refuses a field real ELB has and nothing here matches on", () => {
    // Given conditions on each of the fields ELB has and this does not.
    for (const field of [
      "http-header",
      "http-request-method",
      "query-string",
      "source-ip",
    ]) {
      const error = assertThrowsError(() => {
        SimElbV2RuleCondition.read({ Field: field, Values: ["anything"] });
      });

      // Then each is refused when the rule is written. Storing one would leave
      // a rule that looks configured and never claims a request.
      assertInstanceOf(error, SimElbV2UnsimulatedInputException);
      assertStringIncludes(error.message, "is not simulated");
    }
  });

  it("refuses a field ELB does not have at all", () => {
    // Given a condition with no field, and one on a field ELB never had.
    const noField = assertThrowsError(() => {
      SimElbV2RuleCondition.read({});
    });

    assertInstanceOf(noField, SimElbV2ValidationError);

    const unknown = assertThrowsError(() => {
      SimElbV2RuleCondition.read({ Field: "user-agent", Values: ["curl"] });
    });

    // Then both are a validation failure rather than something unsimulated,
    // because the request is wrong rather than ahead of this simulation.
    assertInstanceOf(unknown, SimElbV2ValidationError);
    assertStringIncludes(noField.message, "requires a Field");
    assertStringIncludes(unknown.message, "is not a listener rule condition");
  });

  it("refuses a condition with nothing to compare against", () => {
    // Given conditions of both simulated fields, each missing its values.
    const hostHeader = assertThrowsError(() => {
      SimElbV2RuleCondition.read({ Field: "host-header" });
    });

    assertInstanceOf(hostHeader, SimElbV2ValidationError);

    const pathPattern = assertThrowsError(() => {
      SimElbV2RuleCondition.read({
        Field: "path-pattern",
        PathPatternConfig: {},
      });
    });

    assertInstanceOf(pathPattern, SimElbV2ValidationError);

    // Then each is refused.
    assertStringIncludes(hostHeader.message, "at least one value");
    assertStringIncludes(pathPattern.message, "at least one value");
  });
});
