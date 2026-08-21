import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEmailIdentityCommand,
  GetAccountCommand,
  ListEmailIdentitiesCommand,
  ListSuppressedDestinationsCommand,
  PutSuppressedDestinationCommand,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayLength,
  assertFalse,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111";

/**
 * A simulation with one Role, and whatever policy statement the test wants it
 * to have.
 */
async function simAwsWithRole(policyStatement?: object): Promise<SimAws> {
  const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "SignUpFunctionRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (policyStatement !== undefined) {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "SignUpFunctionRole",
        PolicyName: "SendWelcomeEmail",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: policyStatement,
        }),
      }),
    );
  }

  return simAws;
}

/** The request options that make a call arrive as the Role. */
const asRole = {
  caller: {
    kind: "arn",
    arn: `arn:aws:iam::${accountIdOneOnes}:role/SignUpFunctionRole`,
  },
} as const;

const welcome = {
  FromEmailAddress: "hello@example.com",
  Destination: { ToAddresses: ["someone@example.org"] },
  Content: {
    Simple: {
      Subject: { Data: "Welcome" },
      Body: { Text: { Data: "Hi there" } },
    },
  },
} satisfies SendEmailCommandInput;

describe("SES IAM authorization", () => {
  it("allows a send from an identity the policy names", async () => {
    // Given a Role allowed to send from one domain.
    const simAws = await simAwsWithRole({
      Action: "ses:SendEmail",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/example.com`,
    });
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("example.org");

    // When it sends from an address at that domain.
    await ses.sendEmail(new SendEmailCommand(welcome), asRole);

    // Then the message was accepted.
    assertArrayLength(ses.sentEmails(), 1);
  });

  it("refuses a send from an identity the policy does not name", async () => {
    // Given a Role allowed to send from one domain only.
    const simAws = await simAwsWithRole({
      Action: "ses:SendEmail",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/example.com`,
    });
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.net");
    ses.verifyIdentity("example.org");

    // When it sends from an address at another one.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          FromEmailAddress: "hello@example.net",
        }),
        asRole,
      );
    });

    // Then IAM refuses it, naming the identity ARN it authorized against.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "ses:SendEmail");
    assertArrayLength(ses.sentEmails(), 0);
  });

  it("prefers the address identity over the domain one", async () => {
    // Given a Role allowed to send from a whole domain, where the address
    // being sent from is also an identity in its own right.
    const simAws = await simAwsWithRole({
      Action: "ses:SendEmail",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/example.com`,
    });
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("hello@example.com");
    ses.verifyIdentity("example.org");

    // When it sends from that address.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand(welcome), asRole);
    });

    // Then the more specific identity is what the request authorized against,
    // which the domain policy does not cover.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "identity/hello@example.com");
  });

  it("authorizes a send against the sender, not the recipients", async () => {
    // Given a Role allowed to send from one address.
    const simAws = await simAwsWithRole({
      Action: "ses:SendEmail",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/hello@example.com`,
    });
    const ses = simAws.sesV2();

    ses.verifyIdentity("hello@example.com");
    ses.verifyIdentity("example.org");

    // When it sends to an address its policy says nothing about.
    await ses.sendEmail(new SendEmailCommand(welcome), asRole);

    // Then the send is allowed: recipients never enter into the authorization,
    // which is worth knowing when a policy looks like it should cover a send.
    assertArrayLength(ses.sentEmails(), 1);
  });

  it("refuses a send from a Role with no policy at all", async () => {
    // Given a Role with no permissions.
    const simAws = await simAwsWithRole();
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("example.org");

    // When it sends.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand(welcome), asRole);
    });

    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a send before the identity check", async () => {
    // Given a Role with no permissions, and nothing verified either.
    const simAws = await simAwsWithRole();

    // When it sends.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sesV2().sendEmail(new SendEmailCommand(welcome), asRole);
    });

    // Then IAM is what refused it. Real IAM decides a request before the
    // service handles it, so an unverified identity is beside the point.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses creating an identity the policy does not name", async () => {
    // Given a Role allowed to create one identity.
    const simAws = await simAwsWithRole({
      Action: "ses:CreateEmailIdentity",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/example.com`,
    });

    // When it creates another.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sesV2()
        .createEmailIdentity(
          new CreateEmailIdentityCommand({ EmailIdentity: "example.net" }),
          asRole,
        );
    });

    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("needs a policy on every resource to list identities", async () => {
    // Given a Role allowed to list on `*`, which is the only resource real SES
    // gives that action.
    const simAws = await simAwsWithRole({
      Action: "ses:ListEmailIdentities",
      Resource: "*",
    });
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");

    // When it lists them.
    const listed = await ses.listEmailIdentities(
      new ListEmailIdentitiesCommand({}),
      asRole,
    );

    assertArrayLength(listed.EmailIdentities ?? [], 1);
  });

  it("refuses a listing to a policy naming identity ARNs", async () => {
    // Given a Role allowed to list, on every identity in the Account.
    const simAws = await simAwsWithRole({
      Action: "ses:ListEmailIdentities",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/*`,
    });

    // When it lists them.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sesV2()
        .listEmailIdentities(new ListEmailIdentitiesCommand({}), asRole);
    });

    // Then it is refused. Real SES gives ListEmailIdentities no resource type,
    // so a policy scoped to identity ARNs allows no listing however broadly
    // those ARNs are written, which is the intuitive reading and the wrong one.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("needs a policy on every resource to read the account", async () => {
    // Given a Role allowed to read the account on `*`, which is the only
    // resource real SES gives that action.
    const simAws = await simAwsWithRole({
      Action: "ses:GetAccount",
      Resource: "*",
    });

    // When it reads the account.
    const account = await simAws
      .sesV2()
      .getAccount(new GetAccountCommand({}), asRole);

    assertFalse(account.ProductionAccessEnabled);
  });

  it("refuses reading the account to a policy naming an identity", async () => {
    // Given a Role whose policy names an identity ARN.
    const simAws = await simAwsWithRole({
      Action: "ses:GetAccount",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/example.com`,
    });

    // When it reads the account.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sesV2().getAccount(new GetAccountCommand({}), asRole);
    });

    // Then it is refused: GetAccount has no resource type, so only a policy
    // written against `*` allows it.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("needs a policy on every resource to suppress an address", async () => {
    // Given a Role allowed to suppress an address on `*`. The only resource
    // type real SES gives the suppression commands is a tenant, which is not
    // simulated.
    const simAws = await simAwsWithRole({
      Action: "ses:PutSuppressedDestination",
      Resource: "*",
    });

    // When it puts an address on the suppression list.
    await simAws.sesV2().putSuppressedDestination(
      new PutSuppressedDestinationCommand({
        EmailAddress: "someone@example.org",
        Reason: "BOUNCE",
      }),
      asRole,
    );

    assertArrayLength(simAws.sesV2().suppressedDestinations(), 1);
  });

  it("refuses a suppression listing to a policy naming an identity", async () => {
    // Given a Role whose policy names an identity ARN.
    const simAws = await simAwsWithRole({
      Action: "ses:ListSuppressedDestinations",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/example.com`,
    });

    // When it reads the suppression list.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sesV2()
        .listSuppressedDestinations(
          new ListSuppressedDestinationsCommand({}),
          asRole,
        );
    });

    assertInstanceOf(error, SimIamAccessDenied);
  });
});
