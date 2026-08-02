import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIam } from "../../../../../sim-iam.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../../context/sim-iam-auth-z-context.factory.js";
import type { SimIamConditionValue } from "../../../../../policy/sim-iam-policy.js";
import type { SimIamPolicyDecision } from "../../../../sim-iam-decision.js";

const functionArn = "arn:aws:lambda:eu-west-2:111111111111:function:orders";
const sourceArn =
  "arn:aws:execute-api:eu-west-2:111111111111:a1b2c3d4e5/$default/GET/orders/{orderId}";

/**
 * Authorize an invocation against a resource policy granting it for one
 * `AWS:SourceArn` pattern, with the source ARN supplied at request time.
 */
function decide(
  pattern: SimIamConditionValue,
  requestSourceArn = sourceArn,
): SimIamPolicyDecision {
  const simIam = new SimIam();

  return simIam.authorize({
    action: "lambda:InvokeFunction",
    resource: functionArn,
    caller: { kind: "service", service: "apigateway.amazonaws.com" },
    conditionContext: { "AWS:SourceArn": requestSourceArn },
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: { Service: "apigateway.amazonaws.com" },
            Action: "lambda:InvokeFunction",
            Resource: functionArn,
            Condition: { ArnLike: { "AWS:SourceArn": pattern } },
          },
        },
      }),
    ],
  });
}

describe("sim IAM ArnLike authorization", () => {
  it("allows a request whose source ARN matches the pattern exactly", () => {
    // Given a grant naming the source ARN with no wildcards in it
    // When the request supplies that source ARN
    const decision = decide(sourceArn);

    // Then the statement matches
    assertTrue(decision.isAllowed);
  });

  it("allows a wildcard in the region, Account and resource positions", () => {
    // Given a grant wildcarding the stage and method, as CDK writes one, and
    // wildcarding the region and Account too
    // When the request supplies a concrete source ARN
    const decision = decide(
      "arn:aws:execute-api:*:*:a1b2c3d4e5/*/*/orders/{orderId}",
    );

    // Then each component matches its own pattern
    assertTrue(decision.isAllowed);
  });

  it("allows a request matching any of several patterns", () => {
    // Given a grant listing more than one source ARN
    // When the request supplies the second of them
    const decision = decide([
      "arn:aws:execute-api:eu-west-2:111111111111:zzzzzzzzzz/*/*",
      "arn:aws:execute-api:eu-west-2:111111111111:a1b2c3d4e5/*/*",
    ]);

    // Then the patterns are an OR, so one match is enough
    assertTrue(decision.isAllowed);
  });

  it("does not allow a request from another resource", () => {
    // Given a grant naming one API
    // When a request from a different API supplies its own source ARN
    const decision = decide(
      "arn:aws:execute-api:eu-west-2:111111111111:a1b2c3d4e5/*/*",
      "arn:aws:execute-api:eu-west-2:111111111111:zzzzzzzzzz/$default/GET/orders",
    );

    // Then the statement does not match
    assertTrue(decision.isImplicitDeny);
  });

  it("keeps a wildcard inside the component it is written in", () => {
    // Given a pattern with fewer components than an ARN has, so its trailing
    // wildcard would have to cover the Account and resource to match
    // When a request supplies a full ARN
    const decision = decide("arn:aws:execute-api:*");

    // Then it does not match, because AWS compares the six components of an
    // ARN separately
    assertTrue(decision.isImplicitDeny);
  });

  it("matches case-sensitively", () => {
    // Given a grant naming a lower-case resource
    // When the request supplies the same ARN in a different case
    const decision = decide(
      "arn:aws:execute-api:eu-west-2:111111111111:A1B2C3D4E5/*/*",
    );

    // Then the statement does not match
    assertTrue(decision.isImplicitDeny);
  });

  it("does not allow a request supplying no source ARN", () => {
    // Given a grant conditioned on a source ARN
    const simIam = new SimIam();

    // When a request arrives with no value for the key
    const decision = simIam.authorize({
      action: "lambda:InvokeFunction",
      resource: functionArn,
      caller: { kind: "service", service: "apigateway.amazonaws.com" },
      resourcePolicies: [
        simIamAuthZResourcePolicySourceFactory.make({
          document: {
            Statement: {
              Effect: "Allow",
              Principal: { Service: "apigateway.amazonaws.com" },
              Action: "lambda:InvokeFunction",
              Resource: functionArn,
              Condition: { ArnLike: { "AWS:SourceArn": sourceArn } },
            },
          },
        }),
      ],
    });

    // Then the condition fails closed rather than matching anything
    assertTrue(decision.isImplicitDeny);
  });
});
