import { StaticFactory } from "@kensio/part-factory";
import type {
  SimIamAuthZContext,
  SimIamAuthZPolicySource,
} from "./sim-iam-auth-z-context.js";

/**
 * Generates simulated IAM authorization contexts for tests.
 */
export const simIamAuthZContextFactory = new StaticFactory<SimIamAuthZContext>({
  identityPolicies: [],
  resourcePolicies: [],
  action: "s3:GetObject",
  resource: "arn:aws:s3:::test-bucket/test-key",
  callerPrincipal: {
    arn: "arn:aws:iam::123456789012:role/TestRole",
  },
});

/**
 * Generates simulated IAM resource-policy sources for tests.
 */
export const simIamAuthZResourcePolicySourceFactory =
  new StaticFactory<SimIamAuthZPolicySource>({
    sourceType: "resource",
    document: {
      Statement: {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::test-bucket/test-key",
      },
    },
  });
