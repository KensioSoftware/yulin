import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simIamAuthZContextFactory,
  simIamAuthZResourcePolicySourceFactory,
} from "../context/sim-iam-auth-z-context.factory.js";
import { SimIamPolicyStatementMatcher } from "./sim-iam-policy-statement-matcher.js";
import { simIamParsedPolicyStatementFactory } from "../../policy/parse/sim-iam-doc-parser.factory.js";

describe("SimIamPolicyStatementMatcher", () => {
  it("matches a resource policy Principal array when any entry matches the caller ARN", () => {
    // Given a resource policy Principal array with one non-matching ARN and one matching ARN.
    const callerPrincipalArn = "arn:aws:iam::123456789012:role/TestRole";
    const matcher = new SimIamPolicyStatementMatcher(
      simIamAuthZContextFactory.make({ callerPrincipalArn }),
    );
    const policy = simIamAuthZResourcePolicySourceFactory.make();
    const statement = simIamParsedPolicyStatementFactory.make({
      principal: [
        "arn:aws:iam::123456789012:role/OtherRole",
        callerPrincipalArn,
      ],
    });

    // When the statement is matched against the caller.
    const matches = matcher.matches(policy, statement);

    // Then the array Principal is accepted because at least one entry matches.
    assertTrue(matches);
  });

  it("does not match an unsupported Principal object key", () => {
    // Given a resource policy Principal object using a principal type the matcher does not support.
    const matcher = new SimIamPolicyStatementMatcher(
      simIamAuthZContextFactory.make(),
    );
    const policy = simIamAuthZResourcePolicySourceFactory.make();
    const statement = simIamParsedPolicyStatementFactory.make({
      principal: {
        Federated: "arn:aws:iam::123456789012:saml-provider/TestProvider",
      },
    });

    // When the statement is matched against the caller.
    const matches = matcher.matches(policy, statement);

    // Then the unsupported principal type is ignored and the statement does not match.
    assertFalse(matches);
  });

  it("matches a resource policy Principal object array when any AWS entry matches the caller ARN", () => {
    // Given a resource policy AWS Principal array with one non-matching ARN and one matching ARN.
    const callerPrincipalArn = "arn:aws:iam::123456789012:role/TestRole";
    const matcher = new SimIamPolicyStatementMatcher(
      simIamAuthZContextFactory.make({ callerPrincipalArn }),
    );
    const policy = simIamAuthZResourcePolicySourceFactory.make();
    const statement = simIamParsedPolicyStatementFactory.make({
      principal: {
        AWS: ["arn:aws:iam::123456789012:role/OtherRole", callerPrincipalArn],
      },
    });

    // When the statement is matched against the caller.
    const matches = matcher.matches(policy, statement);

    // Then the AWS Principal array is accepted because at least one entry matches.
    assertTrue(matches);
  });

  it("does not match a concrete Principal when the request has no caller ARN", () => {
    // Given a resource policy Principal that requires a caller ARN to compare.
    const context = simIamAuthZContextFactory.make();
    // @ts-expect-error -- testing undefined caller principal ARN
    context.callerPrincipalArn = undefined;
    const matcher = new SimIamPolicyStatementMatcher(context);
    const policy = simIamAuthZResourcePolicySourceFactory.make();
    const statement = simIamParsedPolicyStatementFactory.make({
      principal: "arn:aws:iam::123456789012:role/TestRole",
    });

    // When the request has no caller principal ARN.
    const matches = matcher.matches(policy, statement);

    // Then the concrete Principal cannot match.
    assertFalse(matches);
  });

  it("does not match a resource policy statement without Principal or NotPrincipal", () => {
    // Given a resource policy statement with no principal constraint.
    const matcher = new SimIamPolicyStatementMatcher(
      simIamAuthZContextFactory.make(),
    );
    const policy = simIamAuthZResourcePolicySourceFactory.make();
    const statement = simIamParsedPolicyStatementFactory.make({
      principal: undefined,
      notPrincipal: undefined,
    });

    // When the statement is matched against the caller.
    const matches = matcher.matches(policy, statement);

    // Then the resource policy is rejected because resource policies must name or exclude a principal.
    assertFalse(matches);
  });
});
