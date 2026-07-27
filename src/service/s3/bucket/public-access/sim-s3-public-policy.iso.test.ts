import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimIamPolicyDocument } from "../../../iam/policy/sim-iam-policy.js";
import { SimS3PublicPolicy } from "./sim-s3-public-policy.js";

describe("S3 public Bucket policy detection", () => {
  const publicPolicy = new SimS3PublicPolicy();

  const documentGranting = (
    statement: Record<string, unknown>,
  ): SimIamPolicyDocument => ({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports/*",
        ...statement,
      },
    ],
  });

  it("treats a wildcard Principal as public in each of its shapes", () => {
    // Given the ways a policy can name everyone.
    // When each is judged.
    // Then all of them count as public.
    assertTrue(publicPolicy.isPublic(documentGranting({ Principal: "*" })));
    assertTrue(
      publicPolicy.isPublic(documentGranting({ Principal: { AWS: "*" } })),
    );
    assertTrue(
      publicPolicy.isPublic(documentGranting({ Principal: { AWS: ["*"] } })),
    );
    assertTrue(publicPolicy.isPublic(documentGranting({ Principal: ["*"] })));
  });

  it("treats a Principal naming fixed identities as non-public", () => {
    // Given statements granting specific principals.
    // When each is judged.
    // Then none of them is public.
    assertFalse(
      publicPolicy.isPublic(
        documentGranting({
          Principal: { AWS: "arn:aws:iam::222222222222:role/Reader" },
        }),
      ),
    );

    // A Service principal names something specific, so it is not a wildcard
    // even though it grants outside the Account.
    assertFalse(
      publicPolicy.isPublic(
        documentGranting({
          Principal: { Service: "cloudfront.amazonaws.com" },
        }),
      ),
    );
  });

  it("treats a wildcard Principal pinned by a Condition as non-public", () => {
    // Given a wildcard Principal constrained to one Account.
    const document = documentGranting({
      Principal: "*",
      Condition: { StringEquals: { "aws:SourceAccount": "222222222222" } },
    });

    // When it is judged.
    // Then the fixed condition value makes it non-public, as in real S3.
    assertFalse(publicPolicy.isPublic(document));
  });

  it("still counts a Condition value containing a wildcard as public", () => {
    // Given a condition that matches a set of callers rather than one.
    const document = documentGranting({
      Principal: "*",
      Condition: { StringLike: { "aws:SourceVpc": "vpc-*" } },
    });

    // When it is judged.
    // Then it remains public, matching the example in S3's own documentation.
    assertTrue(publicPolicy.isPublic(document));
  });

  it("ignores condition keys and operators that do not pin the caller", () => {
    // Given conditions that constrain something other than who is calling.
    const unrelatedKey = documentGranting({
      Principal: "*",
      Condition: { StringEquals: { "s3:prefix": "public/" } },
    });

    // An IfExists operator passes when the key is absent, so it pins nothing.
    const ifExists = documentGranting({
      Principal: "*",
      Condition: {
        StringEqualsIfExists: { "aws:SourceAccount": "222222222222" },
      },
    });

    // aws:SourceIp is deliberately not modelled, so it does not rescue a
    // policy from being public.
    const sourceIp = documentGranting({
      Principal: "*",
      Condition: { IpAddress: { "aws:SourceIp": "203.0.113.0/24" } },
    });

    // When each is judged.
    // Then none of them stops the statement being public.
    assertTrue(publicPolicy.isPublic(unrelatedKey));
    assertTrue(publicPolicy.isPublic(ifExists));
    assertTrue(publicPolicy.isPublic(sourceIp));
  });

  it("ignores Deny statements when judging public access", () => {
    // Given a document whose only wildcard statement denies rather than allows.
    const document = documentGranting({
      Effect: "Deny",
      Principal: "*",
    });

    // When it is judged.
    // Then it is not public: a Deny grants nobody anything.
    assertFalse(publicPolicy.isPublic(document));
  });

  it("counts anything it cannot classify as public", () => {
    // Given statements the simulator has no confident reading of.
    const notPrincipal = documentGranting({
      NotPrincipal: { AWS: "arn:aws:iam::222222222222:role/Reader" },
    });
    const noPrincipal = documentGranting({});

    // When each is judged.
    // Then both count as public, so the policy is refused rather than allowed.
    assertTrue(publicPolicy.isPublic(notPrincipal));
    assertTrue(publicPolicy.isPublic(noPrincipal));
  });

  it("counts a document public when any one of its statements is", () => {
    // Given a document mixing a fixed grant with a public one.
    const document = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::222222222222:role/Reader" },
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::reports/private/*",
        },
        {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::reports/public/*",
        },
      ],
    } as SimIamPolicyDocument;

    // When it is judged.
    // Then the public statement decides the whole document.
    assertTrue(publicPolicy.isPublic(document));
  });
});
