import {
  GetParameterCommand,
  GetParametersCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertArrayEquals,
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
  SimSsmParameterNotFound,
  SimSsmParameterVersionNotFound,
  SimSsmValidationException,
} from "../../error/sim-ssm.error.js";

async function simAwsWithDbHost(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.ssm().putParameter(
    new PutParameterCommand({
      Name: "/myapp/prod/db-host",
      Type: "String",
      Value: "db.internal",
      Description: "The production database host",
    }),
  );

  return simAws;
}

describe("SSM GetParameter", () => {
  it("reads the current value of a parameter", async () => {
    // Given a stored parameter.
    const simAws = await simAwsWithDbHost();

    // When it is read.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-host" }));

    // Then the value comes back with the details Parameter Store reports.
    assertNonNullable(read.Parameter);
    assertIdentical(read.Parameter.Value, "db.internal");
    assertIdentical(read.Parameter.Type, "String");
    assertIdentical(read.Parameter.Version, 1);
    assertIdentical(read.Parameter.DataType, "text");
    assertUndefined(read.Parameter.Selector);
  });

  it("returns a StringList as one comma separated string", async () => {
    // Given a StringList parameter.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/hosts",
        Type: "StringList",
        Value: "one.internal,two.internal",
      }),
    );

    // When it is read.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/hosts" }));

    // Then it is a string to split, not an array, as it is on real AWS.
    assertNonNullable(read.Parameter);
    assertIdentical(read.Parameter.Value, "one.internal,two.internal");
    assertIdentical(read.Parameter.Type, "StringList");
  });

  it("reads an earlier version by its number", async () => {
    // Given a parameter that has been overwritten.
    const simAws = await simAwsWithDbHost();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Value: "db2.internal",
        Overwrite: true,
      }),
    );

    // When the first version is asked for by name and version.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-host:1" }));

    // Then the older value comes back, with the selector reported.
    assertNonNullable(read.Parameter);
    assertIdentical(read.Parameter.Value, "db.internal");
    assertIdentical(read.Parameter.Version, 1);
    assertIdentical(read.Parameter.Selector, ":1");
    assertIdentical(read.Parameter.Name, "/myapp/prod/db-host");
  });

  it("refuses a version the parameter does not have", async () => {
    // Given a parameter with one version.
    const simAws = await simAwsWithDbHost();

    // When a later version is asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(
          new GetParameterCommand({ Name: "/myapp/prod/db-host:9" }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmParameterVersionNotFound);
  });

  it("says why a label selector cannot be resolved", async () => {
    // Given a stored parameter.
    const simAws = await simAwsWithDbHost();

    // When it is asked for by label.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(
          new GetParameterCommand({ Name: "/myapp/prod/db-host:release" }),
        ),
    );

    // Then it says labels are not simulated, rather than reporting the
    // parameter as missing.
    assertInstanceOf(error, SimSsmParameterNotFound);
    assertStringIncludes(error.message, "labels are not simulated");
  });

  it("refuses a name ending in a colon", async () => {
    // Given a stored parameter.
    const simAws = await simAwsWithDbHost();

    // When a selector is started but not written.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(
          new GetParameterCommand({ Name: "/myapp/prod/db-host:" }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
  });

  it("refuses a name no parameter answers to", async () => {
    // Given a simulated AWS with one parameter.
    const simAws = await simAwsWithDbHost();

    // When a name with a typo is read.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(
          new GetParameterCommand({ Name: "/myapp/prod/db-hostt" }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmParameterNotFound);
  });

  it("requires a name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a request names nothing.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParameter(new GetParameterCommand({ Name: " " })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
  });

  it("ignores WithDecryption for an unencrypted parameter", async () => {
    // Given a String parameter.
    const simAws = await simAwsWithDbHost();

    // When it is read asking for decryption.
    const read = await simAws.ssm().getParameter(
      new GetParameterCommand({
        Name: "/myapp/prod/db-host",
        WithDecryption: true,
      }),
    );

    // Then the flag makes no difference, as it makes none on real AWS.
    assertIdentical(read.Parameter?.Value, "db.internal");
  });
});

describe("SSM GetParameters", () => {
  it("separates the names it found from the names it did not", async () => {
    // Given two stored parameters.
    const simAws = await simAwsWithDbHost();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-port",
        Type: "String",
        Value: "5432",
      }),
    );

    // When a batch asks for both and for a name with a typo.
    const read = await simAws.ssm().getParameters(
      new GetParametersCommand({
        Names: [
          "/myapp/prod/db-port",
          "/myapp/prod/db-hostt",
          "/myapp/prod/db-host",
        ],
      }),
    );

    // Then the typo comes back as invalid rather than failing the request,
    // which is what makes it easy to miss on real AWS.
    assertArrayEquals(
      read.Parameters?.map((parameter) => parameter.Name),
      ["/myapp/prod/db-host", "/myapp/prod/db-port"],
    );
    assertArrayEquals(read.InvalidParameters, ["/myapp/prod/db-hostt"]);
  });

  it("reports a version selector that resolves to nothing as invalid", async () => {
    // Given a parameter with one version.
    const simAws = await simAwsWithDbHost();

    // When a batch asks for a version it does not have.
    const read = await simAws.ssm().getParameters(
      new GetParametersCommand({
        Names: ["/myapp/prod/db-host:9"],
      }),
    );

    // Then the selector comes back as invalid rather than throwing.
    assertArrayEquals(read.Parameters, []);
    assertArrayEquals(read.InvalidParameters, ["/myapp/prod/db-host:9"]);
  });

  it("requires at least one name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a batch asks for nothing.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParameters(new GetParametersCommand({ Names: [] })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
  });

  it("refuses more names than one request may carry", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a batch asks for eleven parameters.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParameters(
        new GetParametersCommand({
          Names: Array.from({ length: 11 }, (_, index) => `p${String(index)}`),
        }),
      ),
    );

    // Then it is refused at the ten Parameter Store allows.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "at most 10");
  });
});
