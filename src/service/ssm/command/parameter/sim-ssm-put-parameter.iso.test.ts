import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSsmHierarchyTypeMismatchException,
  SimSsmParameterAlreadyExists,
  SimSsmUnsupportedParameterType,
  SimSsmValidationException,
} from "../../error/sim-ssm.error.js";

describe("SSM PutParameter", () => {
  it("starts a new parameter at version 1 in the standard tier", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a parameter is created.
    const put = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );

    // Then it is the first version of a standard tier parameter.
    assertIdentical(put.Version, 1);
    assertIdentical(put.Tier, "Standard");
  });

  it("increments the version on an overwrite", async () => {
    // Given an existing parameter.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "db-host",
        Type: "String",
        Value: "a",
      }),
    );

    // When it is overwritten twice.
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "db-host",
        Value: "b",
        Overwrite: true,
      }),
    );
    const third = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "db-host",
        Value: "c",
        Overwrite: true,
      }),
    );

    // Then each write makes a new version, and the latest value is current.
    assertIdentical(third.Version, 3);

    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "db-host" }));

    assertNonNullable(read.Parameter);
    assertIdentical(read.Parameter.Value, "c");
    assertIdentical(read.Parameter.Version, 3);
  });

  it("refuses an existing name when the request does not ask to overwrite", async () => {
    // Given an existing parameter.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "db-host",
        Type: "String",
        Value: "a",
      }),
    );

    // When another write uses the same name without Overwrite.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "db-host",
          Type: "String",
          Value: "b",
        }),
      ),
    );

    // Then it is refused rather than replacing the value.
    assertInstanceOf(error, SimSsmParameterAlreadyExists);
    assertStringIncludes(error.message, "Overwrite");
  });

  it("requires a Type when the parameter is new", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a parameter is created without a Type.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .putParameter(new PutParameterCommand({ Name: "db-host", Value: "a" })),
    );

    // Then it is refused, as Parameter Store requires one to create.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "Type is required");
  });

  it("refuses changing the type of an existing parameter", async () => {
    // Given a String parameter.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "db-host",
        Type: "String",
        Value: "a",
      }),
    );

    // When an overwrite names a different type.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "db-host",
          Type: "StringList",
          Value: "a,b",
          Overwrite: true,
        }),
      ),
    );

    // Then it is refused, because Parameter Store cannot convert a parameter.
    assertInstanceOf(error, SimSsmHierarchyTypeMismatchException);
    assertStringIncludes(error.message, "create a new, unique parameter");
  });

  it("allows an overwrite that repeats the existing type", async () => {
    // Given a StringList parameter.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "hosts",
        Type: "StringList",
        Value: "a,b",
      }),
    );

    // When an overwrite names the same type again.
    const put = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "hosts",
        Type: "StringList",
        Value: "a,b,c",
        Overwrite: true,
      }),
    );

    // Then it is accepted.
    assertIdentical(put.Version, 2);
  });

  it("refuses a SecureString parameter", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a parameter asks to be encrypted.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "db-password",
          Type: "SecureString",
          Value: "hunter2",
        }),
      ),
    );

    // Then it is refused rather than stored in the clear, because nothing here
    // would encrypt it.
    assertInstanceOf(error, SimSsmUnsupportedParameterType);
    assertStringIncludes(error.message, "not simulated");
  });

  it("refuses a type Parameter Store does not have", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When an unknown type is asked for. The SDK's own union would refuse
    // this, so the request is written structurally rather than as a Command.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter({
        input: { Name: "db-host", Type: "Number", Value: "1" },
      }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmUnsupportedParameterType);
  });

  it("refuses a value larger than the standard tier holds", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a whole configuration blob is put in one parameter.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/config",
          Type: "String",
          Value: "x".repeat(4097),
        }),
      ),
    );

    // Then it is refused at the 4KB limit real Parameter Store enforces.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "4096 bytes");
  });

  it("refuses an empty value", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a parameter is written with no value.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "db-host",
          Type: "String",
          Value: "",
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
  });

  it("leaves no parameter behind when the value is refused", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a create is refused for its value rather than its name.
    await assertThrowsErrorAsync(async () =>
      simAws.ssm().putParameter(
        new PutParameterCommand({
          Name: "/myapp/config",
          Type: "String",
          Value: "x".repeat(4097),
        }),
      ),
    );

    // Then no half-made parameter is left in the store.
    assertUndefined(simAws.ssm().findParameter("/myapp/config"));
  });
});
