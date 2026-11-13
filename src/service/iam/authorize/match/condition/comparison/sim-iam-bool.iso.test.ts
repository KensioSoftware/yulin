import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIam } from "../../../../sim-iam.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../context/sim-iam-auth-z-context.factory.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../../policy/sim-iam-policy.js";

const orderItems = "arn:aws:dynamodb:us-east-1:123456789012:table/Orders";

/**
 * Whether a resource policy allowing a write on one condition allows it, with
 * the request context supplied alongside.
 */
function allowed(
  condition: SimIamPolicyDocumentCondition,
  conditionContext: Readonly<Record<string, SimIamConditionValue>> = {},
): boolean {
  return new SimIam().authorize({
    action: "dynamodb:UpdateItem",
    resource: orderItems,
    caller: { kind: "anonymous" },
    conditionContext,
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "dynamodb:UpdateItem",
            Resource: orderItems,
            Condition: condition,
          },
        },
      }),
    ],
  }).isAllowed;
}

describe("sim IAM Bool authorization", () => {
  it("matches a request value equal to the policy's string", () => {
    // Given a policy written the way a document and the CDK write it.
    const condition = { Bool: { "aws:SecureTransport": "true" } };

    // Then a request carrying the boolean matches, and its opposite does not.
    assertTrue(allowed(condition, { "aws:SecureTransport": true }));
    assertFalse(allowed(condition, { "aws:SecureTransport": false }));
  });

  it("reads a JSON boolean policy value and either case", () => {
    assertTrue(
      allowed(
        { Bool: { "lambda:InvokedViaFunctionUrl": true } },
        { "lambda:InvokedViaFunctionUrl": "TRUE" },
      ),
    );
  });

  it("matches nothing for a request carrying no value", () => {
    assertFalse(allowed({ Bool: { "aws:SecureTransport": "false" } }));
  });

  it("matches nothing for a value that is not a boolean", () => {
    assertFalse(
      allowed(
        { Bool: { "aws:SecureTransport": "true" } },
        { "aws:SecureTransport": "yes" },
      ),
    );
  });
});
