import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsError,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimAws } from "../aws/sim-aws.js";
import { SimEcrInvalidParameterException } from "./error/sim-ecr.error.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;

describe("SimEcr repositories", () => {
  it("makes a repository the first time it is named", () => {
    // Given a simulated ECR holding nothing.
    const simAws = new SimAws();
    const ecr = simAws.ecr();

    assertFalse(ecr.hasRepository("orders"));

    // When the same repository is named twice.
    const repository = ecr.repository("orders");
    const again = ecr.repository("orders");

    // Then naming it made it, and it is the same repository both times.
    assertTrue(ecr.hasRepository("orders"));
    assertIdentical(again, repository);
    assertArrayLength(ecr.allRepositories(), 1);
  });

  it("names a repository by the account and region it is in", () => {
    // Given a repository in one account and region.
    const simAws = new SimAws();
    const repository = simAws
      .accountRegionScope(accountIdTwoTwos, "us-east-1")
      .ecr()
      .repository("orders");

    // When its URI and ARN are read.
    // Then both name the account and region it belongs to.
    assertIdentical(
      repository.repositoryUri,
      "222222222222.dkr.ecr.us-east-1.amazonaws.com/orders",
    );
    assertIdentical(
      repository.repositoryArn,
      "arn:aws:ecr:us-east-1:222222222222:repository/orders",
    );
  });

  it("refuses a repository name real ECR would refuse", () => {
    // Given a simulated ECR.
    const ecr = new SimAws().ecr();

    // When a name is given that real ECR would not accept.
    const upperCase = assertThrowsError(() => ecr.repository("Orders"));
    const tooShort = assertThrowsError(() => ecr.repository("o"));
    const imageUri = assertThrowsError(() =>
      ecr.repository("888888888888.dkr.ecr.us-east-1.amazonaws.com/orders:1"),
    );

    // Then each is refused as an invalid parameter, saying what a name is.
    assertInstanceOf(upperCase, SimEcrInvalidParameterException);
    assertInstanceOf(imageUri, SimEcrInvalidParameterException);
    assertIdentical(
      tooShort.message,
      "Invalid parameter at 'repositoryName' failed to satisfy constraint: " +
        "must be between 2 and 256 characters",
    );
    assertIdentical(
      upperCase.message,
      "Invalid parameter at 'repositoryName' failed to satisfy constraint: " +
        "must be lower case letters and numbers, in groups separated by one " +
        "period, underscore, hyphen or slash",
    );
  });

  it("accepts a repository name with path segments", () => {
    // Given a repository named the way a team namespaces one.
    const repository = new SimAws().ecr().repository("platform/orders-api.v2");

    // Then the name is kept as it was given.
    assertIdentical(repository.repositoryName, "platform/orders-api.v2");
  });
});

describe("SimEcr simulated images", () => {
  it("holds a registered handler under the tag it was given", () => {
    // Given a repository with a handler registered under two tags.
    const repository = new SimAws().ecr().repository("orders");

    repository
      .simulateImage({ imageTag: "blue", handler: () => "blue" })
      .simulateImage({ imageTag: "green", handler: () => "green" });

    // When each tag is asked for.
    const blue = repository.image("blue");
    const green = repository.image("green");

    // Then each answers with the image registered under it.
    assertNonNullable(blue);
    assertNonNullable(green);
    assertIdentical(blue.imageTag, "blue");
    assertIdentical(green.imageTag, "green");
    assertArrayLength(repository.images(), 2);
  });

  it("registers under latest where no tag is given", () => {
    // Given a handler registered with no tag, as a push with none is tagged.
    const repository = new SimAws().ecr().repository("orders");

    repository.simulateImage({ handler: () => "only image" });

    // Then it is held under latest.
    assertNonNullable(repository.image("latest"));
    assertTrue(repository.hasImage);
  });

  it("answers a tag it does not hold with the image registered last", () => {
    // Given two images, neither tagged the way a template names one.
    const repository = new SimAws().ecr().repository("orders");

    repository
      .simulateImage({ imageTag: "build-1", handler: () => "first" })
      .simulateImage({ imageTag: "build-2", handler: () => "second" });

    // When a tag nothing holds is asked for, as a content hash tag is.
    const image = repository.image("2f0e1dab4c");

    // Then the image registered most recently is the one that answers,
    // because no tag a template carries is one a test could have written.
    assertNonNullable(image);
    assertIdentical(image.imageTag, "build-2");
  });

  it("replaces the image registered again under one tag", () => {
    // Given a tag registered twice.
    const repository = new SimAws().ecr().repository("orders");
    const second = (): string => "second";

    repository
      .simulateImage({ handler: () => "first" })
      .simulateImage({ handler: second });

    // Then the repository holds one image, the later one.
    assertArrayLength(repository.images(), 1);
    assertIdentical(repository.image("latest")?.handler, second);
  });

  it("holds no image until one is registered", () => {
    // Given a repository nothing has registered an image in.
    const repository = new SimAws().ecr().repository("orders");

    // Then it answers with no image, whatever tag is asked for.
    assertFalse(repository.hasImage);
    assertUndefined(repository.image("latest"));
    assertUndefined(repository.image());
  });

  it("deletes a repository with the images it holds", () => {
    // Given a repository holding an image.
    const ecr = new SimAws().ecr();

    ecr.repository("orders").simulateImage({ handler: () => "gone" });

    // When the repository is deleted, twice over.
    ecr.deleteRepository("orders");
    ecr.deleteRepository("orders");

    // Then it is gone, and deleting one that is already gone is not an error.
    assertFalse(ecr.hasRepository("orders"));
    assertFalse(ecr.repository("orders").hasImage);
  });
});
