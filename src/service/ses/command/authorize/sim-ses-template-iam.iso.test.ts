import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEmailTemplateCommand,
  ListEmailTemplatesCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111";

/** A simulation with one Role carrying whatever policy statement is wanted. */
async function simAwsWithRole(policyStatement: object): Promise<SimAws> {
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

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "SignUpFunctionRole",
      PolicyName: "ManageTemplates",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: policyStatement,
      }),
    }),
  );

  return simAws;
}

/** The request options that make a call arrive as the Role. */
const asRole = {
  caller: {
    kind: "arn",
    arn: `arn:aws:iam::${accountIdOneOnes}:role/SignUpFunctionRole`,
  },
} as const;

const welcome = new CreateEmailTemplateCommand({
  TemplateName: "welcome",
  TemplateContent: { Subject: "Welcome", Text: "Hi {{name}}" },
});

describe("SES template IAM authorization", () => {
  it("allows a template operation the policy names", async () => {
    // Given a Role allowed to create one template by name.
    const simAws = await simAwsWithRole({
      Action: "ses:CreateEmailTemplate",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:template/welcome`,
    });

    // When it creates that template.
    await simAws.sesV2().createEmailTemplate(welcome, asRole);

    assertArrayLength(simAws.sesV2().allTemplates(), 1);
  });

  it("refuses a template operation on another template", async () => {
    // Given a Role allowed to create one template only.
    const simAws = await simAwsWithRole({
      Action: "ses:CreateEmailTemplate",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:template/receipt`,
    });

    // When it creates a different one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sesV2().createEmailTemplate(welcome, asRole);
    });

    // Then IAM refuses it, naming the template ARN it authorized against.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "template/welcome");
  });

  it("needs a policy on every resource to list templates", async () => {
    // Given a Role allowed to list on `*`, which is the only resource real SES
    // gives that action.
    const simAws = await simAwsWithRole({
      Action: "ses:ListEmailTemplates",
      Resource: "*",
    });

    // When it lists them.
    const listed = await simAws
      .sesV2()
      .listEmailTemplates(new ListEmailTemplatesCommand({}), asRole);

    assertArrayLength(listed.TemplatesMetadata ?? [], 0);
  });

  it("refuses a listing to a policy naming template ARNs", async () => {
    // Given a Role allowed to list, on every template in the Account.
    const simAws = await simAwsWithRole({
      Action: "ses:ListEmailTemplates",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:template/*`,
    });

    // When it lists them.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sesV2()
        .listEmailTemplates(new ListEmailTemplatesCommand({}), asRole);
    });

    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("authorizes a template send against the identity, not the template", async () => {
    // Given a Role allowed to send from one identity and to do nothing at all
    // with templates.
    const simAws = await simAwsWithRole({
      Action: "ses:SendEmail",
      Resource: `arn:aws:ses:us-east-1:${accountIdOneOnes}:identity/example.com`,
    });
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("example.org");
    await ses.createEmailTemplate(welcome);

    // When it sends from the template.
    await ses.sendEmail(
      new SendEmailCommand({
        FromEmailAddress: "hello@example.com",
        Destination: { ToAddresses: ["someone@example.org"] },
        Content: {
          Template: { TemplateName: "welcome", TemplateData: '{"name":"Ada"}' },
        },
      }),
      asRole,
    );

    // Then the send is allowed. Real SES gives SendEmail no template resource
    // type, so a caller that may send may send from any template it can name.
    assertArrayLength(ses.sentEmails(), 1);
  });
});
