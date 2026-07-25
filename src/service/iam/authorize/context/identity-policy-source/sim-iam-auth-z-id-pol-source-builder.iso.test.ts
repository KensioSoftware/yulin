import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimArn } from "../../../../aws/arn.js";
import type { SimIamPolicyDocument } from "../../../policy/sim-iam-policy.js";
import { SimIamAuthZIdentityPolicyCoordinator } from "./sim-iam-auth-z-id-pol-coordinator.js";
import { simIamPolicyFactory } from "../../../policy/sim-iam-policy.factory.js";
import { simIamRoleFactory } from "../../../role/sim-iam-role.factory.js";

describe("SimIamAuthZIdentityPolicySourceBuilder", () => {
  it("ignores missing attached managed policies and policies without documents", () => {
    // Given a Role has one missing attached policy ARN and one policy without a document.
    const missingPolicyArn =
      "arn:aws:iam::123456789012:policy/MissingPolicy" as SimArn;
    const policyWithoutDocumentArn =
      "arn:aws:iam::123456789012:policy/PolicyWithoutDocument" as SimArn;
    const role = simIamRoleFactory.make({
      attachedPolicyArns: new Set([missingPolicyArn, policyWithoutDocumentArn]),
    });
    const policyWithoutDocument = simIamPolicyFactory.make({
      arn: policyWithoutDocumentArn,
      policyName: "PolicyWithoutDocument",
      policyDocument: undefined,
    });
    const policyCoordinator = new SimIamAuthZIdentityPolicyCoordinator({
      policies: new Map([[policyWithoutDocumentArn, policyWithoutDocument]]),
      roles: new Map([[role.roleName, role]]),
    });

    // When policy sources are built for the Role principal.
    const sources = policyCoordinator.build(role.arn);

    // Then neither missing nor document-less managed policies contribute sources.
    assertArrayLength(sources, 0);
  });

  it("builds a source for an attached managed policy with a document", () => {
    // Given a Role has an attached managed policy with a policy document.
    const policyArn = "arn:aws:iam::123456789012:policy/ReadObjects" as SimArn;
    const policyDocument = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::example-bucket/*",
        },
      ],
    } satisfies SimIamPolicyDocument;
    const role = simIamRoleFactory.make({
      attachedPolicyArns: new Set([policyArn]),
    });
    const policy = simIamPolicyFactory.make({
      arn: policyArn,
      policyName: "ReadObjects",
      policyDocument: JSON.stringify(policyDocument),
    });
    const policyCoordinator = new SimIamAuthZIdentityPolicyCoordinator({
      policies: new Map([[policyArn, policy]]),
      roles: new Map([[role.roleName, role]]),
    });

    // When policy sources are built for the Role principal.
    const sources = policyCoordinator.build(role.arn);

    // Then the attached managed policy is converted into an identity-managed source.
    assertArrayLength(sources, 1);
    const firstSource = sources[0];
    assertIdentical(firstSource.sourceType, "identity-managed");
    assertIdentical(firstSource.policyArn, policyArn);
    assertIdentical(firstSource.policyName, "ReadObjects");
    assertIdentical(firstSource.document.Version, "2012-10-17");
    assertArrayLength(firstSource.document.Statement, 1);
    const firstStatement = firstSource.document.Statement[0];
    assertIdentical(firstStatement.Effect, "Allow");
    assertIdentical(firstStatement.Action, "s3:GetObject");
    assertIdentical(firstStatement.Resource, "arn:aws:s3:::example-bucket/*");
  });
});
