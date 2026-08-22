import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";

/**
 * How many recommendations a request asking for no particular number gets.
 */
const defaultResultCount = 25;

/**
 * The most real Personalize will return from one GetRecommendations.
 */
const maxResultCount = 500;

/**
 * Read how many recommendations a request asks for.
 */
export function requireSimPersonalizeResultCount(
  requested: number | undefined,
): number {
  if (requested === undefined) {
    return defaultResultCount;
  }

  if (
    !Number.isSafeInteger(requested) ||
    requested < 0 ||
    requested > maxResultCount
  ) {
    throw new SimPersonalizeInvalidInputException(
      `numResults must be a whole number between 0 and ${maxResultCount}`,
    );
  }

  return requested;
}

/**
 * Read the items a ranking request is to rank.
 */
export function requireSimPersonalizeInputList(
  inputList: readonly string[] | undefined,
): readonly string[] {
  if (inputList === undefined || inputList.length === 0) {
    throw new SimPersonalizeInvalidInputException(
      "An inputList of item ids is required",
    );
  }

  return inputList;
}

/**
 * Read the user a ranking request is personalized for.
 *
 * Real Personalize requires one on every GetPersonalizedRanking, whatever the
 * recipe behind the campaign.
 */
export function requireSimPersonalizeUserId(
  userId: string | undefined,
): string {
  if (userId === undefined || userId === "") {
    throw new SimPersonalizeInvalidInputException("A userId is required");
  }

  return userId;
}
