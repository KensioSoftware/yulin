import { MappedFactory } from "@kensio/part-factory";
import { jsonStringify } from "../../../util/type-guard/json.js";
import type { SimIamPolicyDocument } from "./sim-iam-policy.js";

/**
 * Builds the JSON string an IAM policy document is supplied as.
 *
 * A test states only the part of the statement it is about. The Version, and
 * an Allow effect, come from the defaults, since a test that has to spell them
 * out every time buries the Action and Resource it actually cares about.
 *
 * ```typescript
 * await simAws.iam().putRolePolicy(
 *   new PutRolePolicyCommand({
 *     RoleName: "FunctionInvoker",
 *     PolicyName: "InvokePolicy",
 *     PolicyDocument: simIamPolicyDocumentFactory.make({
 *       Statement: { Action: "lambda:InvokeFunction", Resource: functionArn },
 *     }),
 *   }),
 * );
 * ```
 *
 * This is equally the shape of a trust policy, a resource policy or a key
 * policy, so the one factory covers all of them:
 *
 * ```typescript
 * simIamPolicyDocumentFactory.make({
 *   Statement: {
 *     Principal: { AWS: `arn:aws:iam::${accountId}:root` },
 *     Action: "sts:AssumeRole",
 *   },
 * });
 * ```
 *
 * There is no default Principal. Leaving it out keeps a statement that names
 * one from merging with a default that names another.
 *
 * The default `Effect: "Allow"` only reaches a single-statement override. A
 * multi-statement policy overrides `Statement` with an array, which replaces
 * the default rather than merging into each entry, so every statement in an
 * array needs its own `Effect`.
 */
export const simIamPolicyDocumentFactory = new MappedFactory<
  SimIamPolicyDocument,
  string
>(
  () => ({
    Version: "2012-10-17",
    Statement: { Effect: "Allow" },
  }),
  (document) => jsonStringify(document),
);
