import type {
  SimAthenaListedObject,
  SimAthenaListingRequest,
} from "./sim-athena-scanned-objects.js";
import type { SimAthenaScannedLocation } from "./sim-athena-scanned-location.js";
import { simAthenaScannedPage } from "./sim-athena-scanned-page.js";

/**
 * Every object under one location, page by page.
 *
 * Written as a recursion because each page needs the token the one before it
 * answered with, which no parallel form can give.
 */
export async function simAthenaObjectPages(
  request: SimAthenaListingRequest,
  location: SimAthenaScannedLocation,
  continuationToken?: string,
): Promise<readonly SimAthenaListedObject[]> {
  const options =
    request.caller === undefined ? undefined : { caller: request.caller };
  const listed = await simAthenaScannedPage(
    request.s3,
    location,
    continuationToken,
    options,
  );

  if (listed === undefined) {
    return [];
  }

  const objects = (listed.Contents ?? []).map((object) => ({
    bucket: location.bucket,
    key: object.Key ?? "",
    size: object.Size ?? 0,
  }));

  if (
    listed.IsTruncated !== true ||
    listed.NextContinuationToken === undefined
  ) {
    return objects;
  }

  const rest = await simAthenaObjectPages(
    request,
    location,
    listed.NextContinuationToken,
  );

  return [...objects, ...rest];
}
