import {
  DeleteParameterCommand,
  DeleteParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSsmParameterNotFound,
  SimSsmValidationException,
} from "../../error/sim-ssm.error.js";

async function put(simAws: SimAws, name: string): Promise<void> {
  await simAws
    .ssm()
    .putParameter(
      new PutParameterCommand({ Name: name, Type: "String", Value: "x" }),
    );
}

describe("SSM DeleteParameter", () => {
  it("removes a parameter and its versions", async () => {
    // Given a parameter with two versions.
    const simAws = new SimAws();
    await put(simAws, "/myapp/db-host");
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/db-host",
        Value: "y",
        Overwrite: true,
      }),
    );

    // When it is deleted.
    await simAws
      .ssm()
      .deleteParameter(new DeleteParameterCommand({ Name: "/myapp/db-host" }));

    // Then nothing of it is left, including its earlier version.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(new GetParameterCommand({ Name: "/myapp/db-host:1" })),
    );

    assertInstanceOf(error, SimSsmParameterNotFound);
  });

  it("frees the name for a new parameter", async () => {
    // Given a deleted String parameter.
    const simAws = new SimAws();
    await put(simAws, "/myapp/db-host");
    await simAws
      .ssm()
      .deleteParameter(new DeleteParameterCommand({ Name: "/myapp/db-host" }));

    // When the name is used again, this time for a different type.
    const put2 = await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/myapp/db-host",
        Type: "StringList",
        Value: "a,b",
      }),
    );

    // Then it is a new parameter starting at version 1, which is the way to
    // change a parameter's type on real AWS.
    assertIdentical(put2.Version, 1);
  });

  it("refuses a name no parameter answers to", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a missing parameter is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .deleteParameter(new DeleteParameterCommand({ Name: "/myapp/gone" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmParameterNotFound);
  });

  it("requires a name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a request names nothing.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().deleteParameter(new DeleteParameterCommand({ Name: "" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
  });
});

describe("SSM DeleteParameters", () => {
  it("separates the names it deleted from the names it did not", async () => {
    // Given two stored parameters.
    const simAws = new SimAws();
    await put(simAws, "/myapp/db-host");
    await put(simAws, "/myapp/db-port");

    // When a batch deletes both and two names that are not there.
    const deleted = await simAws.ssm().deleteParameters(
      new DeleteParametersCommand({
        Names: [
          "/myapp/db-port",
          "/myapp/vanished",
          "/myapp/db-host",
          "/myapp/gone",
        ],
      }),
    );

    // Then the missing names are reported rather than failing the request.
    assertArrayEquals(deleted.DeletedParameters, [
      "/myapp/db-host",
      "/myapp/db-port",
    ]);
    assertArrayEquals(deleted.InvalidParameters, [
      "/myapp/gone",
      "/myapp/vanished",
    ]);
  });

  it("requires at least one name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a batch names nothing.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().deleteParameters(new DeleteParametersCommand({ Names: [] })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimSsmValidationException);
  });

  it("refuses more names than one request may carry", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a batch names eleven parameters.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ssm().deleteParameters(
        new DeleteParametersCommand({
          Names: Array.from({ length: 11 }, (_, index) => `p${String(index)}`),
        }),
      ),
    );

    // Then it is refused at the ten Parameter Store allows.
    assertInstanceOf(error, SimSsmValidationException);
  });
});
