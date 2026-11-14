/* oxlint-disable no-template-curly-in-string -- IAM policy variable syntax, not JavaScript templates. */
import { CreateUserCommand, PutUserPolicyCommand } from "@aws-sdk/client-iam";
import { assertFalse, assertNonNullable, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../policy/sim-iam-policy-document.factory.js";

describe("sim IAM policy variables from the caller", () => {
  it("confines a User to its own home prefix with ${aws:username}", async () => {
    // Given a User whose policy allows reads under a prefix named after it
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    const created = await simIam.createUser(
      new CreateUserCommand({ UserName: "report-reader" }),
    );
    const userArn = created.User.Arn;
    assertNonNullable(userArn);
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "report-reader",
        PolicyName: "home",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::homes/${aws:username}/*",
          },
        }),
      }),
    );
    const read = (resource: string): boolean =>
      simIam.authorize({
        action: "s3:GetObject",
        resource,
        caller: { kind: "arn", arn: userArn },
      }).isAllowed;

    // When the User reads its own prefix and another User's
    // Then only its own is allowed
    assertTrue(read("arn:aws:s3:::homes/report-reader/notes.txt"));
    assertFalse(read("arn:aws:s3:::homes/report-writer/notes.txt"));
  });

  it("names a bucket from the caller's tag, with a default for untagged callers", async () => {
    // Given a tagged and an untagged User sharing one policy
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    const policy = simIamPolicyDocumentFactory.make({
      Statement: {
        Action: "s3:GetObject",
        Resource: "arn:aws:s3:::reports-${aws:PrincipalTag/team, 'shared'}/*",
      },
    });
    const userArn = async (
      name: string,
      tags: { Key: string; Value: string }[],
    ): Promise<string> => {
      const created = await simIam.createUser(
        new CreateUserCommand({ UserName: name, Tags: tags }),
      );
      await simIam.putUserPolicy(
        new PutUserPolicyCommand({
          UserName: name,
          PolicyName: "team-reports",
          PolicyDocument: policy,
        }),
      );
      assertNonNullable(created.User.Arn);

      return created.User.Arn;
    };
    const tagged = await userArn("blue-analyst", [
      { Key: "team", Value: "blue" },
    ]);
    const untagged = await userArn("visitor", []);
    const read = (arn: string, bucket: string): boolean =>
      simIam.authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${bucket}/summary.csv`,
        caller: { kind: "arn", arn },
      }).isAllowed;

    // When each reads the team bucket and the shared bucket
    // Then the tagged User reads its team's and the untagged one the shared
    assertTrue(read(tagged, "reports-blue"));
    assertFalse(read(tagged, "reports-shared"));
    assertTrue(read(untagged, "reports-shared"));
    assertFalse(read(untagged, "reports-blue"));
  });
});
