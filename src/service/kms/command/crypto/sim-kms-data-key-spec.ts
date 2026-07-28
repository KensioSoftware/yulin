import { SimKmsValidationException } from "../../error/sim-kms.error.js";

/**
 * The data key lengths the named KeySpec values stand for.
 */
const specLengths = new Map<string, number>([
  ["AES_256", 32],
  ["AES_128", 16],
]);

const minBytes = 1;
const maxBytes = 1024;

/**
 * Works out how many bytes of data key GenerateDataKey should produce.
 *
 * Real KMS insists on exactly one of KeySpec and NumberOfBytes, and refuses
 * the request otherwise rather than picking a default. Following that keeps a
 * request that AWS would reject from quietly succeeding here.
 */
export class SimKmsDataKeySpec {
  /**
   * The data key length a request asks for.
   */
  lengthFor(
    keySpec: string | undefined,
    numberOfBytes: number | undefined,
  ): number {
    if (keySpec !== undefined && numberOfBytes !== undefined) {
      throw new SimKmsValidationException(
        "Specify either KeySpec or NumberOfBytes, but not both",
      );
    }

    if (keySpec !== undefined) {
      return this.specLength(keySpec);
    }

    if (numberOfBytes !== undefined) {
      return this.byteCount(numberOfBytes);
    }

    throw new SimKmsValidationException(
      "Specify either KeySpec or NumberOfBytes",
    );
  }

  private specLength(keySpec: string): number {
    const length = specLengths.get(keySpec);

    if (length === undefined) {
      throw new SimKmsValidationException(
        `Unsupported KeySpec '${keySpec}': simulated KMS supports ${specLengths.keys().toArray().join(" and ")}`,
      );
    }

    return length;
  }

  private byteCount(numberOfBytes: number): number {
    if (
      !Number.isSafeInteger(numberOfBytes) ||
      numberOfBytes < minBytes ||
      numberOfBytes > maxBytes
    ) {
      throw new SimKmsValidationException(
        `NumberOfBytes must be a whole number between ${String(minBytes)} and ${String(maxBytes)}`,
      );
    }

    return numberOfBytes;
  }
}
