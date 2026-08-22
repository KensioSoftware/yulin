import type { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import type {
  SimStatesDefinitionLocation,
  SimStatesDefinitionStore,
} from "./sim-states-definition-store.js";

/**
 * The slice of simulated S3 a definition fetch needs. SimS3 structurally
 * implements this interface.
 */
export interface SimStatesDefinitionObjectSource {
  getObject(command: {
    input: { Bucket: string; Key: string };
  }): Promise<{ Body?: Readable }>;
}

interface SimS3StatesDefinitionStoreProperties {
  readonly s3: SimStatesDefinitionObjectSource;
}

/**
 * Simulated S3-backed storage for state machine definitions.
 *
 * A real `cdk deploy` publishes the definition file to the bootstrap staging
 * bucket before CloudFormation reads the template, and sim CloudFormation
 * publishes a cloud assembly's assets the same way round. The fetch goes
 * through the ordinary GetObject, so the object the assets publisher wrote is
 * the object this reads.
 *
 * An object that is not there gives nothing back. The Resource is skipped with
 * the location on it, and the rest of the stack deploys.
 */
export class SimS3StatesDefinitionStore implements SimStatesDefinitionStore {
  readonly #s3: SimStatesDefinitionObjectSource;

  constructor(properties: SimS3StatesDefinitionStoreProperties) {
    this.#s3 = properties.s3;
  }

  /**
   * Read the definition an object holds.
   */
  async read(
    location: SimStatesDefinitionLocation,
  ): Promise<string | undefined> {
    const body = await this.objectBody(location);

    if (body === undefined) {
      return undefined;
    }

    return await text(body);
  }

  /**
   * The object's body, or nothing where the bucket or the key is absent.
   */
  private async objectBody(
    location: SimStatesDefinitionLocation,
  ): Promise<Readable | undefined> {
    try {
      const output = await this.#s3.getObject({
        input: { Bucket: location.bucketName, Key: location.objectKey },
      });

      return output.Body;
    } catch (error) {
      if (isMissingObject(error)) {
        return undefined;
      }

      throw error;
    }
  }
}

/**
 * Whether an error is simulated S3 saying the object is not there.
 *
 * Anything else, such as an access denial, is left to raise. A definition that
 * could not be read for a reason other than absence is worth surfacing rather
 * than turning into a skipped Resource.
 */
function isMissingObject(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NoSuchBucket" || error.name === "NoSuchKey")
  );
}
