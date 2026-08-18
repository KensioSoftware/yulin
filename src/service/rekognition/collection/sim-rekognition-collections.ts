import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimRekognitionResourceAlreadyExistsException,
  SimRekognitionResourceNotFoundException,
} from "../error/sim-rekognition.error.js";
import {
  simRekognitionFaceModelVersion,
  type SimRekognitionCollection,
  type SimRekognitionCollectionId,
} from "./sim-rekognition-collection.js";

interface SimRekognitionCollectionsProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The face collections one Account and Region holds.
 *
 * Real Rekognition scopes a collection to both, so a collection made in one
 * Region is invisible from another. Simulated Rekognition is built per Account
 * and Region already, which is what makes this an ordinary map rather than
 * something that has to check a scope on every call.
 */
export class SimRekognitionCollections {
  private readonly collections = new Map<
    SimRekognitionCollectionId,
    SimRekognitionCollection
  >();

  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimRekognitionCollectionsProperties) {
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * The ARN a collection of this name would have, whether or not it exists.
   *
   * Authorization needs this before the collection does, since a policy naming
   * a collection has to be evaluated for a request to create one.
   */
  arnFor(collectionId: string): string {
    const { accountId, regionName } = this.accountRegionScope;

    return `arn:aws:rekognition:${regionName}:${accountId}:collection/${collectionId}`;
  }

  /**
   * Record a new collection.
   *
   * Throws when one of that name is already held, as real Rekognition does
   * rather than answering with the collection that is there.
   */
  create(collectionId: string, createdAt: Date): SimRekognitionCollection {
    const id = collectionId as SimRekognitionCollectionId;

    if (this.collections.has(id)) {
      throw new SimRekognitionResourceAlreadyExistsException(
        `Rekognition collection ${collectionId} already exists`,
      );
    }

    const collection: SimRekognitionCollection = {
      collectionId: id,
      arn: this.arnFor(collectionId),
      faceModelVersion: simRekognitionFaceModelVersion,
      createdAt,
    };
    this.collections.set(id, collection);

    return collection;
  }

  /**
   * Every collection held here, in the order they were created.
   */
  all(): readonly SimRekognitionCollection[] {
    return this.collections.values().toArray();
  }

  /**
   * Remove a collection, refusing one that was never created.
   */
  remove(collectionId: string): SimRekognitionCollection {
    const id = collectionId as SimRekognitionCollectionId;
    const collection = this.collections.get(id);

    if (collection === undefined) {
      throw new SimRekognitionResourceNotFoundException(
        `Rekognition collection ${collectionId} does not exist`,
      );
    }

    this.collections.delete(id);

    return collection;
  }
}
