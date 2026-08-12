import { simS3DefaultMaxKeysPerPage } from "./s3-object-listing.js";

/**
 * How much of a Bucket one page of an Object listing may return.
 *
 * Real S3 fixes this at a thousand keys and gives nobody a way to change it.
 * The simulation keeps that default and does allow it to be changed, because a
 * caller that never continues a listing is a caller whose pagination has never
 * run, and provoking one honestly would mean storing a thousand and one
 * Objects first.
 *
 * It lives on the shared command state rather than being handed to each
 * listing, so both versions of the operation see the same page size and a
 * change reaches whichever of them the caller uses.
 */
export class SimS3ObjectListingLimits {
  private maxKeys: number;

  constructor(maxKeysPerPage: number = simS3DefaultMaxKeysPerPage) {
    this.maxKeys = usableMaxKeysPerPage(maxKeysPerPage);
  }

  /**
   * The most keys a page of a listing will hold.
   */
  get maxKeysPerPage(): number {
    return this.maxKeys;
  }

  /**
   * Change how many keys a page of a listing holds from here on.
   */
  configureMaxKeysPerPage(maxKeys: number): void {
    this.maxKeys = usableMaxKeysPerPage(maxKeys);
  }
}

/**
 * Refuse a page size no listing could return anything from.
 *
 * A cap below one key leaves every listing empty and truncated, which looks
 * like a Bucket problem rather than the configuration mistake it is.
 */
function usableMaxKeysPerPage(maxKeys: number): number {
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) {
    throw new Error(
      `Simulated S3 needs a whole number of keys per listing page, ` +
        `of at least one, rather than ${maxKeys}`,
    );
  }

  return maxKeys;
}
