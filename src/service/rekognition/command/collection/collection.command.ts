import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Rekognition CreateCollection command.
 */
export interface SimCreateCollectionCommand {
  readonly input: {
    readonly CollectionId?: string | undefined;
  };
}

/**
 * Minimal structural sim Rekognition CreateCollection output.
 */
export interface SimCreateCollectionCommandOutput {
  readonly StatusCode?: number;
  readonly CollectionArn?: string;
  readonly FaceModelVersion?: string;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Rekognition ListCollections command.
 */
export interface SimListCollectionsCommand {
  readonly input?:
    | {
        readonly MaxResults?: number | undefined;
        readonly NextToken?: string | undefined;
      }
    | undefined;
}

/**
 * Minimal structural sim Rekognition ListCollections output.
 *
 * `FaceModelVersions` runs alongside `CollectionIds`, one entry per collection
 * in the same order, which is how real Rekognition reports a version that can
 * differ between collections.
 */
export interface SimListCollectionsCommandOutput {
  readonly CollectionIds?: string[];
  readonly FaceModelVersions?: string[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Rekognition DeleteCollection command.
 */
export interface SimDeleteCollectionCommand {
  readonly input: {
    readonly CollectionId?: string | undefined;
  };
}

/**
 * Minimal structural sim Rekognition DeleteCollection output.
 */
export interface SimDeleteCollectionCommandOutput {
  readonly StatusCode?: number;
  readonly $metadata: SimResponseMetadata;
}
