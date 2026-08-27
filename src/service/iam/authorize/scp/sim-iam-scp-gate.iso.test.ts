import {
  assertArrayEquals,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamPolicyDocumentParser } from "../../policy/parse/sim-iam-document-parser.js";
import { SimIamPolicyStatementMatcher } from "../match/sim-iam-policy-statement-matcher.js";
import { simIamAuthZContextFactory } from "../context/sim-iam-auth-z-context.factory.js";
import { SimIamPolicyDecisionValue } from "../sim-iam-decision-value.js";
import { SimIamScpGate } from "./sim-iam-scp-gate.js";

describe("Sim IAM service control policy gate", () => {
  it("denies everything for an organization holding no level", () => {
    // Given an organization that applies to the caller's Account and holds
    // nothing to allow anything with.
    const context = simIamAuthZContextFactory.make({
      serviceControlPolicies: { applies: true, levels: [] },
    });

    // When the gate is asked about a request.
    const gate = new SimIamScpGate({
      serviceControlPolicies: context.serviceControlPolicies,
      policyDocumentParser: new SimIamPolicyDocumentParser(),
      statementMatcher: new SimIamPolicyStatementMatcher(context),
    });

    // Then it is shut, because nothing allowed the action.
    assertTrue(gate.isApplied);
    assertTrue(gate.isImplicitDeny);
    assertIdentical(gate.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertArrayEquals(gate.unallowedLevels, ["the organization"]);
  });
});
