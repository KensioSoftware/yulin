import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimSsmHierarchyLevelLimitExceededException,
  SimSsmParameterPatternMismatchException,
  SimSsmValidationException,
} from "../error/sim-ssm.error.js";

async function refusedName(name: string): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () =>
    simAws
      .ssm()
      .putParameter(
        new PutParameterCommand({ Name: name, Type: "String", Value: "x" }),
      ),
  );
}

describe("SSM parameter names", () => {
  it("drops the leading slash from the name in the parameter ARN", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();
    const { defaultAccountId, defaultRegionName } = simAws;

    // When a hierarchical parameter is created.
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Type: "String",
        Value: "db.internal",
      }),
    );

    // Then its ARN carries the name once, without a doubled slash.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-host" }));

    assertNonNullable(read.Parameter);
    assertIdentical(
      read.Parameter.ARN,
      `arn:aws:ssm:${defaultRegionName}:${defaultAccountId}:parameter/myapp/prod/db-host`,
    );
    assertIdentical(read.Parameter.Name, "/myapp/prod/db-host");
  });

  it("gives a flat name an ARN without a hierarchy", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();
    const { defaultAccountId, defaultRegionName } = simAws;

    // When a parameter is created with no hierarchy in its name.
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "db-host",
        Type: "String",
        Value: "x",
      }),
    );

    // Then its ARN names it directly.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "db-host" }));

    assertIdentical(
      read.Parameter?.ARN,
      `arn:aws:ssm:${defaultRegionName}:${defaultAccountId}:parameter/db-host`,
    );
  });

  it("reaches the same parameter with or without a leading slash", async () => {
    // Given a parameter created without a leading slash.
    const simAws = new SimAws();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "db-host",
        Type: "String",
        Value: "x",
      }),
    );

    // When it is read with one.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/db-host" }));

    // Then it is the same parameter, because both forms name the same ARN.
    assertIdentical(read.Parameter?.Value, "x");
  });

  it("trims spaces around a name and keeps the trimmed form", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a name is written with surrounding spaces, as real Parameter Store
    // strips them.
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "  /myapp/db-host  ",
        Type: "String",
        Value: "x",
      }),
    );

    // Then the parameter is stored under the trimmed name.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/myapp/db-host" }));

    assertIdentical(read.Parameter?.Name, "/myapp/db-host");
  });

  it("refuses a hierarchical name without its leading slash", async () => {
    // When a name has a hierarchy but is not fully qualified.
    const error = await refusedName("myapp/prod/db-host");

    // Then it is refused, as real Parameter Store refuses it.
    assertInstanceOf(error, SimSsmParameterPatternMismatchException);
    assertStringIncludes(error.message, "/myapp/prod/db-host");
  });

  it("refuses a name with characters Parameter Store does not allow", async () => {
    // When a name contains a character outside the allowed set.
    const error = await refusedName("/myapp/db$host");

    // Then it is refused.
    assertInstanceOf(error, SimSsmParameterPatternMismatchException);
  });

  it("refuses a name with spaces between characters", async () => {
    // When a name has an inner space, which trimming cannot fix.
    const error = await refusedName("/myapp/db host");

    // Then it is refused as a validation failure.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "spaces");
  });

  it("refuses an empty name", async () => {
    // When no usable name is given.
    const error = await refusedName(" ".repeat(3));

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
  });

  it("refuses an empty hierarchy level", async () => {
    // When a name has two slashes in a row.
    const error = await refusedName("/myapp//db-host");

    // Then it is refused rather than treated as one level.
    assertInstanceOf(error, SimSsmParameterPatternMismatchException);
    assertStringIncludes(error.message, "empty hierarchy level");
  });

  it("refuses a hierarchy deeper than fifteen levels", async () => {
    // When a name has sixteen levels.
    const error = await refusedName(
      `/${Array.from({ length: 16 }, (_, index) => `level${String(index)}`).join("/")}`,
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmHierarchyLevelLimitExceededException);
    assertStringIncludes(error.message, "16 hierarchy levels");
  });

  it("allows a hierarchy of exactly fifteen levels", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();
    const name = `/${Array.from({ length: 15 }, (_, index) => `level${String(index)}`).join("/")}`;

    // When a name uses the whole depth Parameter Store allows.
    const put = await simAws
      .ssm()
      .putParameter(
        new PutParameterCommand({ Name: name, Type: "String", Value: "x" }),
      );

    // Then it is accepted.
    assertIdentical(put.Version, 1);
  });

  it("refuses a name under the reserved aws prefix", async () => {
    // When a name starts with the prefix Parameter Store reserves.
    const error = await refusedName("/aws/reference/my-thing");

    // Then it is refused.
    assertInstanceOf(error, SimSsmParameterPatternMismatchException);
    assertStringIncludes(error.message, "reserves");
  });

  it("refuses a name under the reserved ssm prefix whatever its case", async () => {
    // When a name starts with the other reserved prefix, differently cased.
    const error = await refusedName("/SSM/my-thing");

    // Then it is refused, because the check is case-insensitive on real AWS.
    assertInstanceOf(error, SimSsmParameterPatternMismatchException);
    assertStringIncludes(error.message, "ssm");
  });

  it("refuses a name too long for the parameter ARN", async () => {
    // When a name would make an ARN longer than Parameter Store allows.
    const error = await refusedName(`/${"a".repeat(1100)}`);

    // Then it is refused, counting the ARN prefix as real Parameter Store
    // counts it.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "1011");
  });
});
