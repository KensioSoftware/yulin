/**
 * One face a search is declared to find, named the way the test that wrote the
 * rule knows it by.
 *
 * A match names exactly one of the two. `externalImageId` is the id the
 * indexing request chose, so a rule using it can be written before anything is
 * indexed, which is what a test whose own code does the indexing needs.
 * `faceId` is the id `IndexFaces` answered with, so a rule using it is written
 * after that call and names one face and no other.
 *
 * The face still has to be in the collection being searched. A declaration
 * naming a face that was never indexed, or one that has since been deleted,
 * matches nothing rather than inventing a face for the response.
 */
export interface SimRekognitionDeclaredFaceMatch {
  readonly faceId?: string | undefined;
  readonly externalImageId?: string | undefined;
  readonly similarity?: number | undefined;
}

/**
 * What a face search answers with for an image.
 *
 * An image that finds nobody is `{ matches: [] }`, which is what every image
 * answers with until a rule says otherwise.
 */
export interface SimRekognitionFaceMatchesResult {
  readonly matches: readonly SimRekognitionDeclaredFaceMatch[];
}
