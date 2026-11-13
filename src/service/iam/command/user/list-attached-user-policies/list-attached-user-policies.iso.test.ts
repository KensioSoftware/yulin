import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  CreateUserCommand,
  ListAttachedUserPoliciesCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertInstanceOf,
  assertArrayEquals,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";

describe("IAM ListAttachedUserPoliciesCommand", () => {
  it("lists AWS-managed and customer-managed policies attached to a User", async () => {
    // Given a User with an AWS-managed and a customer-managed policy attached.
    const simIam = new SimAws().iam();
    const username = faker.string.alpha(12);
    const policyName = faker.string.alpha(12);
    await simIam.createUser(new CreateUserCommand({ UserName: username }));
    const creation = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: policyName,
        Path: "/team/",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            { Effect: "Allow", Action: "s3:ListBucket", Resource: "*" },
          ],
        }),
      }),
    );
    await simIam.attachUserPolicy(
      new AttachUserPolicyCommand({
        UserName: username,
        PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
      }),
    );
    await simIam.attachUserPolicy(
      new AttachUserPolicyCommand({
        UserName: username,
        PolicyArn: creation.Policy.Arn,
      }),
    );

    // When the User's attached policies are listed.
    const output = await simIam.listAttachedUserPolicies(
      new ListAttachedUserPoliciesCommand({ UserName: username }),
    );

    // Then both are listed by name and ARN.
    assertArrayEquals(output.AttachedPolicies, [
      {
        PolicyName: "ReadOnlyAccess",
        PolicyArn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
      },
      { PolicyName: policyName, PolicyArn: creation.Policy.Arn },
    ]);
  });

  it("authorizes the caller against the User's path", async () => {
    // Given a User under the /team/ path, and a User allowed to list the
    // attachments of Users under that path only.
    const accountId = makeSimAwsAccountId();
    const simIam = new SimAws().account(accountId).iam();
    const username = faker.string.alpha(12);
    await simIam.createUser(
      new CreateUserCommand({ UserName: username, Path: "/team/" }),
    );
    const operator = await simIam.createUser(
      new CreateUserCommand({ UserName: faker.string.alpha(12) }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: operator.User.UserName,
        PolicyName: "ListTeamUsers",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "iam:ListAttachedUserPolicies",
              Resource: `arn:aws:iam::${accountId}:user/team/*`,
            },
          ],
        }),
      }),
    );

    // When the operator lists the User's attachments.
    const output = await simIam.listAttachedUserPolicies(
      new ListAttachedUserPoliciesCommand({ UserName: username }),
      { caller: { kind: "arn", arn: operator.User.Arn } },
    );

    // Then the request is allowed.
    assertArrayEquals(output.AttachedPolicies, []);
  });

  it("refuses a User that does not exist", async () => {
    const simIam = new SimAws().iam();

    const error = await assertThrowsErrorAsync(async () =>
      simIam.listAttachedUserPolicies(
        new ListAttachedUserPoliciesCommand({ UserName: "MissingUser" }),
      ),
    );

    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("requires a UserName", async () => {
    const simIam = new SimAws().iam();

    await assertThrowsErrorAsync(async () =>
      simIam.listAttachedUserPolicies(
        new ListAttachedUserPoliciesCommand({ UserName: undefined }),
      ),
    );
  });
});
