import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { requireSimPersonalizeUseCase } from "./sim-personalize-use-case-recipe.js";
import { simPersonalizeUseCases } from "./sim-personalize-use-case.js";

describe("Personalize domain use cases", () => {
  it("holds five use cases per domain", () => {
    // Given the ten use cases AWS documents.
    const video = simPersonalizeUseCases.filter(
      (useCase) => useCase.domain === "VIDEO_ON_DEMAND",
    );
    const ecommerce = simPersonalizeUseCases.filter(
      (useCase) => useCase.domain === "ECOMMERCE",
    );

    assertArrayLength(simPersonalizeUseCases, 10);
    assertArrayLength(video, 5);
    assertArrayLength(ecommerce, 5);
  });

  it.each([
    { recipe: "aws-vod-most-popular", itemId: "unused", userId: "required" },
    { recipe: "aws-vod-trending-now", itemId: "unused", userId: "optional" },
    { recipe: "aws-vod-top-picks", itemId: "unused", userId: "required" },
    { recipe: "aws-vod-more-like-x", itemId: "required", userId: "required" },
    {
      recipe: "aws-vod-because-you-watched-x",
      itemId: "required",
      userId: "required",
    },
    {
      recipe: "aws-ecomm-popular-items-by-views",
      itemId: "unused",
      userId: "required",
    },
    {
      recipe: "aws-ecomm-popular-items-by-purchases",
      itemId: "unused",
      userId: "required",
    },
    {
      recipe: "aws-ecomm-recommended-for-you",
      itemId: "unused",
      userId: "required",
    },
    {
      recipe: "aws-ecomm-frequently-bought-together",
      itemId: "required",
      userId: "optional",
    },
    {
      recipe: "aws-ecomm-customers-who-viewed-x-also-viewed",
      itemId: "required",
      userId: "required",
    },
  ])(
    "reads itemId $itemId and userId $userId for $recipe",
    ({ recipe, itemId, userId }) => {
      // Given one of the ten recipe ARNs.
      const arn = `arn:aws:personalize:::recipe/${recipe}`;
      const found = simPersonalizeUseCases.find(
        (useCase) => useCase.recipeArn === arn,
      );

      // Then it records what GetRecommendations does with each parameter, as
      // AWS documents it against the use case.
      assertNonNullable(found);
      assertIdentical(found.recipeArn, arn);
      assertIdentical(found.itemId, itemId);
      assertIdentical(found.userId, userId);
    },
  );

  it("refuses a request with no recipe ARN at all", () => {
    const error = assertThrowsError(() => {
      requireSimPersonalizeUseCase(undefined, "ECOMMERCE");
    });

    assertIdentical(error.name, "InvalidInputException");
  });
});
