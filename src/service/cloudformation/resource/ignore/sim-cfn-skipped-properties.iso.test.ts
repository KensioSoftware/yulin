import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { SimCfnSkippedProperties } from "./sim-cfn-skipped-properties.js";
import type {
  SimCfnSkippedPropertyRule,
  SimCfnSkippedPropertyValue,
} from "./sim-cfn-skipped-property.type.js";

/** The error one made-up service refuses its own Resources with. */
const refusal = (reason: string): Error =>
  new Error(`Invalid Test::Service::Thing Resource Thing: ${reason}`);

/** The seam, built the way a service builds one for its own Resource. */
function skipped(
  properties: SimCfnTemplateValueRecord,
  rules: ReadonlyMap<string, SimCfnSkippedPropertyRule | string>,
): SimCfnSkippedProperties {
  return new SimCfnSkippedProperties({ rules, properties, error: refusal });
}

describe("constraints on a skipped CloudFormation property", () => {
  it("reads the reason off either shape a rule takes", () => {
    // Given one property naming a reason alone and one naming a constraint
    // beside it.
    const rules = new Map<string, SimCfnSkippedPropertyRule | string>([
      ["Plain", "nothing here acts on it"],
      [
        "Checked",
        {
          reason: "nothing here acts on it either",
          constraint: (declared) => void declared,
        },
      ],
    ]);

    // When each reason is read.
    const properties = skipped({}, rules);

    // Then both answer, and a property this service has no entry for answers
    // with nothing.
    assertIdentical(properties.reasonFor("Plain"), "nothing here acts on it");
    assertIdentical(
      properties.reasonFor("Checked"),
      "nothing here acts on it either",
    );
    assertUndefined(properties.reasonFor("Unknown"));
  });

  it("refuses the Resource in the service's own words", () => {
    // Given a constraint that refuses whatever it is handed.
    const rules = new Map<string, SimCfnSkippedPropertyRule | string>([
      [
        "Checked",
        {
          reason: "nothing here acts on it",
          constraint: (declared) => declared.refuse("Checked has to be a name"),
        },
      ],
    ]);

    // When a Resource declaring it is checked, then the refusal carries the
    // wording the service builds its own errors with. Sim CloudFormation
    // reads that wording to decide whether to skip the Resource or fail the
    // stack, so the constraint never words its own.
    const error = assertThrowsError(() => {
      skipped({ Checked: 1 }, rules).assertConstraints();
    });

    assertIdentical(
      error.message,
      "Invalid Test::Service::Thing Resource Thing: Checked has to be a name",
    );
  });

  it("hands a constraint the value and the Resource around it", () => {
    // Given a constraint reading a second property beside its own, which is
    // the shape most of these constraints take.
    const seen: SimCfnSkippedPropertyValue[] = [];
    const rules = new Map<string, SimCfnSkippedPropertyRule | string>([
      [
        "Checked",
        {
          reason: "nothing here acts on it",
          constraint: (declared) => {
            seen.push(declared);
          },
        },
      ],
    ]);

    // When a Resource declaring it is checked.
    skipped({ Checked: "here", Sibling: "there" }, rules).assertConstraints();

    // Then the constraint saw its own value and everything else the Resource
    // declared.
    assertArrayLength(seen, 1);
    assertNonNullable(seen[0]);
    assertIdentical(seen[0].value, "here");
    assertIdentical(seen[0].properties["Sibling"], "there");
  });

  it("leaves a constraint alone for a property the Resource never declared", () => {
    // Given a constraint that would refuse anything.
    let ran = false;
    const rules = new Map<string, SimCfnSkippedPropertyRule | string>([
      [
        "Checked",
        {
          reason: "nothing here acts on it",
          constraint: (declared) => {
            ran = true;
            declared.refuse("never reached");
          },
        },
      ],
    ]);

    // When a Resource that states something else entirely is checked, then
    // nothing runs. A constraint says what a declared value has to satisfy,
    // and says nothing about a template leaving the property out.
    skipped({ Other: 1 }, rules).assertConstraints();

    assertFalse(ran);
  });

  it("leaves a property carrying a reason alone", () => {
    // Given the common case, a reason with no constraint behind it.
    const rules = new Map<string, SimCfnSkippedPropertyRule | string>([
      ["Plain", "nothing here acts on it"],
    ]);

    // When a Resource declaring it is checked, then it passes. Most skipped
    // properties are a single flag with nothing to check.
    skipped({ Plain: true }, rules).assertConstraints();

    assertIdentical(
      skipped({ Plain: true }, rules).reasonFor("Plain"),
      "nothing here acts on it",
    );
  });
});
