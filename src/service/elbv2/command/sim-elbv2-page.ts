import { SimElbV2ValidationError } from "../error/sim-elbv2.error.js";

/**
 * How many items a describe carries when the request asks for no page size.
 */
const defaultItemsPerPage = 400;

/**
 * The most real ELB lets one describe carry.
 */
const maximumItemsPerPage = 400;

/**
 * One page of a describe, and the marker that reaches the next one.
 *
 * ELBv2 pages every describe with a `Marker` in and a `NextMarker` out, rather
 * than with the `NextToken` most services use, so a caller written against the
 * real SDK reads the same field here.
 */
export class SimElbV2Page<Item> {
  public readonly items: readonly Item[];
  public readonly nextMarker: string | undefined;

  constructor(
    listed: readonly Item[],
    pageSize: number | undefined,
    marker: string | undefined,
  ) {
    const startIndex = SimElbV2Page.startIndex(marker, listed.length);
    const nextIndex = startIndex + SimElbV2Page.itemsPerPage(pageSize);

    this.items = listed.slice(startIndex, nextIndex);
    this.nextMarker = SimElbV2Page.markerFor(nextIndex, listed.length);
  }

  /**
   * Read the page size a request asked for, refusing one outside the range
   * real ELB takes.
   */
  private static itemsPerPage(pageSize: number | undefined): number {
    if (pageSize === undefined) {
      return defaultItemsPerPage;
    }

    if (
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > maximumItemsPerPage
    ) {
      throw new SimElbV2ValidationError(
        `PageSize ${String(pageSize)} is outside the range 1 to ${String(
          maximumItemsPerPage,
        )}`,
      );
    }

    return pageSize;
  }

  /**
   * Read a marker as its offset into the listed items.
   *
   * A marker is refused unless it is one these describes could have issued,
   * which is an offset landing inside the items still to come.
   */
  private static startIndex(
    marker: string | undefined,
    listedCount: number,
  ): number {
    if (marker === undefined) {
      return 0;
    }

    const startIndex = Number(marker);

    if (
      !Number.isSafeInteger(startIndex) ||
      startIndex <= 0 ||
      startIndex >= listedCount ||
      String(startIndex) !== marker
    ) {
      throw new SimElbV2ValidationError(
        "Marker is not a marker this simulation issued",
      );
    }

    return startIndex;
  }

  private static markerFor(
    nextIndex: number,
    listedCount: number,
  ): string | undefined {
    if (nextIndex >= listedCount) {
      return undefined;
    }

    return String(nextIndex);
  }
}
