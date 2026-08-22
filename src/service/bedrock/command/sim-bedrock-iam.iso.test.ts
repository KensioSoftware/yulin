import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111";

const sonnet = "anthropic.claude-3-5-sonnet-20241022-v2:0";

const sonnetArn = `arn:aws:bedrock:us-east-1::foundation-model/${sonnet}`;

/**
 * A Role whose policy allows one action on one resource.
 */
async function givenARoleAllowedTo(
  simAws: SimAws,
  action: string,
  resource = "*",
): Promise<string> {
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "BedrockCaller",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "BedrockCaller",
      PolicyName: "BedrockPolicy",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: action, Resource: resource },
      }),
    }),
  );

  assertNonNullable(role.Role.Arn);

  return role.Role.Arn;
}

/**
 * A one turn conversation with one model.
 */
function askingOf(modelId: string): ConverseCommand {
  return new ConverseCommand({
    modelId,
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  });
}

describe("Bedrock IAM authorization", () => {
  it("allows an invocation the caller's policy permits on the model", async () => {
    // Given a Role allowed to invoke one foundation model.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "bedrock:InvokeModel",
      sonnetArn,
    );

    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });

    // When it invokes that model.
    const answered = await simAws
      .bedrock()
      .converse(askingOf(sonnet), { caller: { kind: "arn", arn: roleArn } });

    // Then it goes through.
    assertIdentical(
      answered.output.message.content.at(0)?.text,
      "Tone sandhi.",
    );
  });

  it("denies an invocation of a model the policy leaves out", async () => {
    // Given a Role allowed to invoke one model only.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "bedrock:InvokeModel",
      sonnetArn,
    );

    // When it invokes another one.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.bedrock().converse(askingOf("amazon.nova-pro-v1:0"), {
          caller: { kind: "arn", arn: roleArn },
        }),
    );

    // Then Bedrock reports it in its own terms, naming the model.
    assertIdentical(error.name, "AccessDeniedException");
    assertStringIncludes(error.message, "bedrock:InvokeModel");
    assertStringIncludes(error.message, "amazon.nova-pro-v1:0");
  });

  it("checks the request before it decides the caller", async () => {
    // Given a Role allowed to invoke nothing at all.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "bedrock:ListTagsForResource",
    );

    // When it sends a conversation with no messages.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .bedrock()
          .converse(new ConverseCommand({ modelId: sonnet, messages: [] }), {
            caller: { kind: "arn", arn: roleArn },
          }),
    );

    // Then the malformed request fails the same way it would for any caller.
    assertIdentical(error.name, "ValidationException");
  });

  it("authorizes an inference profile against the ARN the request named", async () => {
    // Given a Role allowed to invoke one inference profile.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const profileArn = `arn:aws:bedrock:us-east-1:${accountIdOneOnes}:inference-profile/us.anthropic.claude-3-5-sonnet-20241022-v2:0`;
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "bedrock:InvokeModel",
      profileArn,
    );

    simAws.bedrock().responses().byDefault({ text: "Tone sandhi." });

    // When it invokes through that profile.
    const answered = await simAws.bedrock().converse(askingOf(profileArn), {
      caller: { kind: "arn", arn: roleArn },
    });

    // Then the ARN is authorized as it was written rather than wrapped in a
    // foundation model ARN.
    assertIdentical(
      answered.output.message.content.at(0)?.text,
      "Tone sandhi.",
    );
  });
});
