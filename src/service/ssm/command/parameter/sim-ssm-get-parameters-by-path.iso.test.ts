import {
  GetParametersByPathCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimSsmValidationException } from "../../error/sim-ssm.error.js";

async function simAwsWithHierarchy(): Promise<SimAws> {
  const simAws = new SimAws();
  const names = [
    "/myapp/prod/db-host",
    "/myapp/prod/db-port",
    "/myapp/prod/cache/host",
    "/myapp/test/db-host",
    "/other/thing",
  ];

  await Promise.all(
    names.map(async (name) =>
      simAws
        .ssm()
        .putParameter(
          new PutParameterCommand({ Name: name, Type: "String", Value: name }),
        ),
    ),
  );

  return simAws;
}

async function namesUnder(
  simAws: SimAws,
  path: string,
  recursive?: boolean,
): Promise<readonly (string | undefined)[]> {
  const listed = await simAws.ssm().getParametersByPath(
    new GetParametersByPathCommand({
      Path: path,
      ...(recursive !== undefined && { Recursive: recursive }),
    }),
  );

  return listed.Parameters?.map((parameter) => parameter.Name) ?? [];
}

describe("SSM GetParametersByPath", () => {
  it("lists only the level immediately below the path by default", async () => {
    // Given a hierarchy with parameters at two depths under /myapp/prod.
    const simAws = await simAwsWithHierarchy();

    // When the path is listed without Recursive.
    const names = await namesUnder(simAws, "/myapp/prod");

    // Then the deeper parameter is left out, in name order.
    assertArrayEquals(names, ["/myapp/prod/db-host", "/myapp/prod/db-port"]);
  });

  it("lists everything below the path when recursive", async () => {
    // Given the same hierarchy.
    const simAws = await simAwsWithHierarchy();

    // When the path is listed recursively.
    const names = await namesUnder(simAws, "/myapp/prod", true);

    // Then the deeper parameter is included too.
    assertArrayEquals(names, [
      "/myapp/prod/cache/host",
      "/myapp/prod/db-host",
      "/myapp/prod/db-port",
    ]);
  });

  it("accepts a path written with a trailing slash", async () => {
    // Given the same hierarchy.
    const simAws = await simAwsWithHierarchy();

    // When the path is written the way the AWS API reference example writes
    // it, with a trailing slash.
    const names = await namesUnder(simAws, "/myapp/prod/");

    // Then it names the same level.
    assertArrayEquals(names, ["/myapp/prod/db-host", "/myapp/prod/db-port"]);
  });

  it("lists the root level from the root path", async () => {
    // Given a parameter with no hierarchy and one with a hierarchy.
    const simAws = await simAwsWithHierarchy();
    await simAws
      .ssm()
      .putParameter(
        new PutParameterCommand({ Name: "flat", Type: "String", Value: "x" }),
      );

    // When the root path is listed without Recursive.
    const names = await namesUnder(simAws, "/");

    // Then only the parameter at the root comes back.
    assertArrayEquals(names, ["flat"]);
  });

  it("reports the current value of each parameter it lists", async () => {
    // Given a parameter under a path that has been overwritten.
    const simAws = await simAwsWithHierarchy();
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/prod/db-host",
        Value: "db2.internal",
        Overwrite: true,
      }),
    );

    // When the path is listed.
    const listed = await simAws
      .ssm()
      .getParametersByPath(
        new GetParametersByPathCommand({ Path: "/myapp/prod" }),
      );

    // Then the listing carries the current value and version.
    const first = listed.Parameters?.at(0);

    assertNonNullable(first);
    assertIdentical(first.Value, "db2.internal");
    assertIdentical(first.Version, 2);
  });

  it("pages at ten parameters, as real Parameter Store does", async () => {
    // Given twelve parameters under one path.
    const simAws = new SimAws();

    await Promise.all(
      Array.from({ length: 12 }, async (_, index) =>
        simAws.ssm().putParameter(
          new PutParameterCommand({
            Name: `/myapp/p${String(index).padStart(2, "0")}`,
            Type: "String",
            Value: "x",
          }),
        ),
      ),
    );

    // When the path is listed without a MaxResults.
    const firstPage = await simAws
      .ssm()
      .getParametersByPath(new GetParametersByPathCommand({ Path: "/myapp" }));

    // Then only ten come back, with a token for the rest. Code that ignores
    // the token silently reads two thirds of a configuration hierarchy.
    assertArrayLength(firstPage.Parameters ?? [], 10);

    const second = await simAws.ssm().getParametersByPath(
      new GetParametersByPathCommand({
        Path: "/myapp",
        NextToken: firstPage.NextToken,
      }),
    );

    assertArrayLength(second.Parameters ?? [], 2);
    assertUndefined(second.NextToken);
  });

  it("refuses more results per page than Parameter Store returns", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a listing asks for more than ten at a time.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParametersByPath(
        new GetParametersByPathCommand({
          Path: "/myapp",
          MaxResults: 11,
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "between 1 and 10");
  });

  it("refuses a token it did not issue", async () => {
    // Given a hierarchy.
    const simAws = await simAwsWithHierarchy();

    // When a listing continues from an invented token.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParametersByPath(
        new GetParametersByPathCommand({
          Path: "/myapp",
          NextToken: "not-a-token",
        }),
      ),
    );

    // Then it is refused rather than starting again from the beginning.
    assertInstanceOf(error, SimSsmValidationException);
  });

  it("requires a path", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a listing names no path.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParametersByPath(new GetParametersByPathCommand({ Path: "" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
  });

  it("refuses a path without its leading slash", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a listing names a path that is not fully qualified.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParametersByPath(new GetParametersByPathCommand({ Path: "myapp" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "forward slash");
  });

  it("refuses parameter filters", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a listing asks to be filtered.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().getParametersByPath(
        new GetParametersByPathCommand({
          Path: "/myapp",
          ParameterFilters: [{ Key: "Type", Values: ["String"] }],
        }),
      ),
    );

    // Then it is refused rather than returning more than real Parameter Store
    // would.
    assertInstanceOf(error, SimSsmValidationException);
    assertStringIncludes(error.message, "ParameterFilters");
  });
});
