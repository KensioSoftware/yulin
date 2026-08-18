import { SimRekognitionInvalidParameterException } from "../../error/sim-rekognition.error.js";
import type { SimRekognitionIndexedFace } from "../../collection/sim-rekognition-indexed-face.js";

interface SimRekognitionFacePageProperties {
  /** Every face the request selected, before paging. */
  readonly listed: readonly SimRekognitionIndexedFace[];

  readonly maxResults: number | undefined;
  readonly nextToken: string | undefined;
}

function pageStartIndex(
  nextToken: string | undefined,
  listedCount: number,
): number {
  if (nextToken === undefined) {
    return 0;
  }

  const startIndex = Number(nextToken);

  if (
    !Number.isSafeInteger(startIndex) ||
    startIndex < 0 ||
    startIndex >= listedCount ||
    String(startIndex) !== nextToken
  ) {
    throw new SimRekognitionInvalidParameterException(
      "Request has invalid parameters: NextToken is not a token this " +
        "simulation issued",
    );
  }

  return startIndex;
}

/**
 * One page of a face listing, and the token that reaches the next one.
 *
 * The token is the offset of the next face, so it only means anything against
 * the collection it was issued for. A token carried to a listing of a
 * different collection reaches a different place, which is true of a real
 * Rekognition token as well.
 *
 * A listing with no `MaxResults` comes back in one page. Real Rekognition
 * pages a listing at a thousand faces by default, so the two differ only for a
 * collection larger than that.
 */
export class SimRekognitionFacePage {
  readonly faces: readonly SimRekognitionIndexedFace[];
  readonly nextToken: string | undefined;

  constructor(properties: SimRekognitionFacePageProperties) {
    const { listed } = properties;
    const startIndex = pageStartIndex(properties.nextToken, listed.length);
    const nextIndex = startIndex + (properties.maxResults ?? listed.length);

    this.faces = listed.slice(startIndex, nextIndex);
    this.nextToken = nextIndex >= listed.length ? undefined : String(nextIndex);
  }
}
