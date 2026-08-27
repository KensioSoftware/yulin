import { StaticFactory } from "@kensio/part-factory";
import { SimIamEitherSideAllowRequirement } from "../allow/sim-iam-allow-requirement.js";
import type {
  SimIamAuthZContext,
  SimIamAuthZResourcePolicySource,
} from "./sim-iam-auth-z-context.js";

/**
 * Generates simulated IAM authorization contexts for tests.
 */
export const simIamAuthZContextFactory = new StaticFactory<SimIamAuthZContext>({
  identityPolicies: [],
  resourcePolicies: [],
  serviceControlPolicies: { applies: false, levels: [] },
  allowRequirement: new SimIamEitherSideAllowRequirement(),
  action: "s3:GetObject",
  resource: "arn:aws:s3:::test-bucket/test-key",
  conditionContext: {},
  caller: {
    identityPolicyPrincipal: {
      kind: "arn",
      arn: "arn:aws:iam::123456789012:role/TestRole",
    },
    principal: {
      kind: "arn",
      arn: "arn:aws:iam::123456789012:role/TestRole",
    },
    arn: "arn:aws:iam::123456789012:role/TestRole",
    accountId: "123456789012",
  },
});

/**
 * Generates simulated IAM resource-policy sources for tests.
 */
export const simIamAuthZResourcePolicySourceFactory =
  new StaticFactory<SimIamAuthZResourcePolicySource>({
    sourceType: "resource",
    document: {
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::test-bucket/test-key",
      },
    },
  });
