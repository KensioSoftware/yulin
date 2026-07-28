import { PutParameterCommand } from "@aws-sdk/client-ssm";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimSsmValidationException } from "../../error/sim-ssm.error.js";
import type { SimPutParameterCommandInput } from "./parameter.command.js";

async function refusedOption(
  input: Partial<SimPutParameterCommandInput>,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () =>
    simAws.ssm().putParameter({
      input: {
        Name: "/myapp/db-host",
        Type: "String",
        Value: "db.internal",
        ...input,
      },
    }),
  );
}

describe("SSM PutParameter options that are not simulated", () => {
  it("accepts the standard tier", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a request names the tier this simulation models.
    const put = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/db-host",
        Type: "String",
        Value: "db.internal",
        Tier: "Standard",
      }),
    );

    // Then it is accepted.
    assertStringIncludes(String(put.Version), "1");
  });

  it("refuses the advanced tier", async () => {
    // When a request asks for a tier this simulation does not model.
    const error = await refusedOption({ Tier: "Advanced" });

    // Then it is refused rather than quietly downgraded.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "Advanced");
  });

  it("accepts the text data type", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a request names the only data type this simulation models.
    const put = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/db-host",
        Type: "String",
        Value: "db.internal",
        DataType: "text",
      }),
    );

    // Then it is accepted.
    assertStringIncludes(String(put.Version), "1");
  });

  it("refuses a data type validated against another service", async () => {
    // When a request asks for an AMI id to be validated.
    const error = await refusedOption({ DataType: "aws:ec2:image" });

    // Then it is refused, because nothing here could do the validation.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "aws:ec2:image");
  });

  it("refuses an AllowedPattern", async () => {
    // When a request asks for its value to be pattern checked.
    const error = await refusedOption({ AllowedPattern: String.raw`^\d+$` });

    // Then it is refused, rather than storing a value the pattern would have
    // rejected on real AWS.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "AllowedPattern");
  });

  it("refuses parameter policies", async () => {
    // When a request attaches a policy.
    const error = await refusedOption({ Policies: "[]" });

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "Policies");
  });

  it("refuses tags", async () => {
    // When a request tags the parameter.
    const error = await refusedOption({
      Tags: [{ Key: "Environment", Value: "prod" }],
    });

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "Tags");
  });

  it("refuses a KMS key id", async () => {
    // When a request names a key to encrypt with.
    const error = await refusedOption({ KeyId: "alias/aws/ssm" });

    // Then it is refused, because only SecureString parameters are encrypted
    // and those are not simulated either.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "KeyId");
  });
});
