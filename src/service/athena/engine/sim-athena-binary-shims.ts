import { createHash } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { crc32 } from "node:zlib";

import { simAthenaMurmur3 } from "./sim-athena-murmur3.js";
import {
  simAthenaDecodedText,
  simAthenaFromUtf8,
} from "./sim-athena-binary-text.js";
import {
  shimBytes,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";
import { simAthenaXxHash64 } from "./sim-athena-xxhash64.js";

/** The `node:crypto` digest each Trino hashing function is spelled with. */
const digests: ReadonlyMap<string, string> = new Map([
  ["md5", "md5"],
  ["sha1", "sha1"],
  ["sha256", "sha256"],
  ["sha512", "sha512"],
]);

/**
 * Trino's hashing functions and the encodings that carry bytes in and out of
 * them.
 *
 * A `varbinary` is held as a SQLite blob, so a digest travels as bytes the way
 * it does in Athena and a `to_hex` around it reads the same. Trino refuses text
 * where a `varbinary` is wanted and SQLite has no analysis to refuse it with,
 * so a column reaching one of these without a `to_utf8` around it is hashed as
 * its UTF-8 bytes.
 *
 * `spooky_hash_v2_32` and `spooky_hash_v2_64` are absent. Nothing an access log
 * query reaches for spells either, and a name registered for one would have to
 * carry a third hash written out by hand.
 */
export function simAthenaInstallBinaryShims(database: DatabaseSync): void {
  for (const [name, algorithm] of digests) {
    simAthenaScalarShim(database, name, (value) =>
      overBytes(
        value,
        (bytes) => new Uint8Array(createHash(algorithm).update(bytes).digest()),
      ),
    );
  }

  simAthenaScalarShim(database, "xxhash64", (value) =>
    overBytes(value, simAthenaXxHash64),
  );
  simAthenaScalarShim(database, "murmur3", (value) =>
    overBytes(value, simAthenaMurmur3),
  );
  simAthenaScalarShim(database, "crc32", (value) =>
    overBytes(value, (bytes) => crc32(bytes)),
  );

  simAthenaScalarShim(database, "to_hex", (value) =>
    overBytes(value, (bytes) =>
      Buffer.from(bytes).toString("hex").toUpperCase(),
    ),
  );
  simAthenaScalarShim(database, "to_base64", (value) =>
    overBytes(value, (bytes) => Buffer.from(bytes).toString("base64")),
  );
  simAthenaScalarShim(database, "from_hex", (value) =>
    simAthenaDecodedText(shimText(value), "hex"),
  );
  simAthenaScalarShim(database, "from_base64", (value) =>
    simAthenaDecodedText(shimText(value), "base64"),
  );

  simAthenaScalarShim(database, "to_utf8", (value) => {
    const text = shimText(value);

    return text === undefined ? null : new TextEncoder().encode(text);
  });
  simAthenaScalarShim(database, "from_utf8", (...values) =>
    simAthenaFromUtf8(shimBytes(values.at(0)), values),
  );
}

/** One binary function over its argument, answering null where it is null. */
function overBytes<T>(
  value: SQLOutputValue | undefined,
  read: (bytes: Uint8Array) => T,
): T | null {
  const bytes = shimBytes(value);

  return bytes === undefined ? null : read(bytes);
}
