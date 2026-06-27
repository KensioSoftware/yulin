const listHostedZonesByNameMaxItemsError =
  "ListHostedZonesByNameCommand.input.MaxItems is invalid";

const positiveIntegerPattern = /^[1-9]\d*$/;

/**
 * Parse the ListHostedZonesByName MaxItems input.
 */
export function parseZoneMaxItems(maxItemsInput: string | undefined): number {
  if (maxItemsInput === undefined) {
    return 100;
  }

  if (!positiveIntegerPattern.test(maxItemsInput)) {
    throw new Error(listHostedZonesByNameMaxItemsError);
  }

  const maxItems = Number(maxItemsInput);

  if (!Number.isSafeInteger(maxItems)) {
    throw new TypeError(listHostedZonesByNameMaxItemsError);
  }

  return maxItems;
}
