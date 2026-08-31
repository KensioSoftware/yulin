import {
  assertArrayEmpty,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsStringAttribute,
  simSnsNumberAttribute,
} from "../../../../test/sns/filter-fixture.js";
import { SimSnsMessageAttributes } from "../message/sim-sns-message-attributes.js";
import { SimSnsAttributeSubject } from "./sim-sns-attribute-subject.js";
import { SimSnsBodySubject } from "./sim-sns-body-subject.js";

describe("SNS filter policy subjects", () => {
  it("holds message attributes under their own names and no deeper", () => {
    // Given the attributes of one publish.
    const subject = SimSnsAttributeSubject.of(
      SimSnsMessageAttributes.of({
        type: simSnsStringAttribute("order"),
        amount: simSnsNumberAttribute("150"),
      }),
    );

    // When they are asked for by name, by nothing, and by a nested path.
    // Then a name finds its value, and nothing else finds anything: message
    // attributes are flat, so there is nothing under one.
    assertIdentical(subject.valuesAt(["type"])[0]?.text, "order");
    assertIdentical(subject.valuesAt(["amount"])[0]?.numeric, 150);
    assertArrayEmpty(subject.valuesAt(["tenant"]));
    assertArrayEmpty(subject.valuesAt([]));
    assertArrayEmpty(subject.valuesAt(["type", "kind"]));
    assertFalse(subject.isEmpty);
  });

  it("knows when the message carries nothing at this scope", () => {
    // Given the attributes of a publish that carried none, and bodies holding
    // nothing.
    const noAttributes = SimSnsAttributeSubject.of(
      SimSnsMessageAttributes.of({}),
    );

    // Then each says so, which is what `{"exists": false}` needs before it can
    // match a key that is missing.
    assertTrue(noAttributes.isEmpty);
    assertTrue(SimSnsBodySubject.of(JSON.stringify({})).isEmpty);
    assertTrue(SimSnsBodySubject.of("order-1").isEmpty);
    assertFalse(
      SimSnsBodySubject.of(JSON.stringify({ type: "order" })).isEmpty,
    );
  });

  it("holds a message body at the paths it nests", () => {
    // Given a body with a nested key in it.
    const subject = SimSnsBodySubject.of(
      JSON.stringify({ customer: { tier: "gold" }, amount: 150 }),
    );

    // When paths into it are asked for.
    // Then each finds what the body holds there, and a path through something
    // that is not an object finds nothing.
    assertIdentical(subject.valuesAt(["customer", "tier"])[0]?.text, "gold");
    assertIdentical(subject.valuesAt(["amount"])[0]?.numeric, 150);
    assertArrayEmpty(subject.valuesAt(["customer"]));
    assertArrayEmpty(subject.valuesAt(["amount", "currency"]));
    assertArrayEmpty(subject.valuesAt(["missing"]));
  });

  it("holds nothing for a body that is not a JSON object", () => {
    // Given bodies that are not a JSON object.
    const text = SimSnsBodySubject.of("order-1");
    const listed = SimSnsBodySubject.of(JSON.stringify(["order"]));

    // Then neither holds anything at any key, rather than failing to be read.
    assertArrayEmpty(text.valuesAt(["type"]));
    assertArrayEmpty(listed.valuesAt(["type"]));
  });
});
