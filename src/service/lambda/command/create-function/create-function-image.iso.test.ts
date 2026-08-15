import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
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
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { SimLambda } from "../../sim-lambda.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

const ordersRepositoryUri =
  "888888888888.dkr.ecr.us-east-1.amazonaws.com/orders";

const ordersRole = "arn:aws:iam::888888888888:role/OrdersRole";

async function createImageFunction(
  simAws: SimAws,
  imageUri: string,
): Promise<void> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: ordersRole,
      PackageType: "Image",
      Code: { ImageUri: imageUri },
    }),
  );
}

describe("Lambda CreateFunction from a simulated ECR image", () => {
  it("creates a function from the image its repository holds", async () => {
    // Given a handler registered as the image in a repository.
    const simAws = new SimAws();

    simAws
      .ecr()
      .repository("orders")
      .simulateImage({ handler: () => "ran the repository image" });

    // When a function is created through the SDK naming that image, with no
    // CloudFormation and no binding anywhere.
    await createImageFunction(simAws, `${ordersRepositoryUri}:latest`);

    // Then the function runs the registered handler.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }));

    assertIdentical(output.StatusCode, 200);
    assertUndefined(output.FunctionError);
    assertNonNullable(output.Payload);
    assertStringIncludes(
      Buffer.from(output.Payload).toString(),
      "ran the repository image",
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses an image whose repository nothing holds", async () => {
    // Given a simulation with no repository of that name.
    const simAws = new SimAws();

    // When a function naming that image is created.
    const error = await assertThrowsErrorAsync(async () =>
      createImageFunction(simAws, `${ordersRepositoryUri}:latest`),
    );

    // Then it is refused, as real Lambda refuses an image it cannot pull,
    // saying the repository is what is missing.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(
      error.message,
      `Source image ${ordersRepositoryUri}:latest cannot be run: no ` +
        `simulated ECR repository holds the container image`,
    );
    assertStringIncludes(
      error.message,
      "Register a real in-process handler as the image in a simulated ECR " +
        "repository to simulate it.",
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses an image whose repository holds no image", async () => {
    // Given a repository with no handler registered in it.
    const simAws = new SimAws();

    simAws.ecr().repository("orders");

    // When a function naming an image from it is created.
    const error = await assertThrowsErrorAsync(async () =>
      createImageFunction(simAws, `${ordersRepositoryUri}:latest`),
    );

    // Then the refusal says the repository is there and its image is not.
    assertStringIncludes(
      error.message,
      `the simulated ECR repository ${ordersRepositoryUri} holds no image`,
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses an image URI alongside other function code", async () => {
    // Given a request naming both an image and zip code, which real Lambda
    // has no function shape for.
    const simAws = new SimAws();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().createFunction(
        new CreateFunctionCommand({
          FunctionName: "orders",
          Role: ordersRole,
          Code: {
            ImageUri: `${ordersRepositoryUri}:latest`,
            ZipFile: makeLambdaZipFileInput(() => "handler"),
          },
        }),
      ),
    );

    // Then it is refused rather than one of the two being ignored.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(
      error.message,
      "Please do not provide ZipFile bytes or an S3 object location when " +
        "using Code.ImageUri",
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses an image on a simulated Lambda with no simulated ECR", async () => {
    // Given a standalone simulated Lambda, which is its own little universe
    // with no simulated ECR beside it.
    const lambda = new SimLambda();

    // When a container image function is created on it.
    const error = await assertThrowsErrorAsync(async () =>
      lambda.createFunction(
        new CreateFunctionCommand({
          FunctionName: "orders",
          Role: ordersRole,
          Code: { ImageUri: `${ordersRepositoryUri}:latest` },
        }),
      ),
    );

    // Then the refusal says there is nowhere for the image to have come from.
    assertStringIncludes(
      error.message,
      "as this simulated Lambda has no simulated ECR beside it",
    );
  });
});
