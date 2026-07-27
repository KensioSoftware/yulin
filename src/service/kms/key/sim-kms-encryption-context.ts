/**
 * An AWS KMS encryption context: non-secret key/value pairs bound to a
 * ciphertext.
 */
export type SimKmsEncryptionContext = Readonly<Record<string, string>>;

/**
 * Serialises an encryption context into the additional authenticated data of
 * an AES-GCM operation.
 *
 * The encryption context is exactly what AAD is for: it is not secret, it is
 * not stored in the ciphertext, and supplying a different one on decryption
 * has to fail. Binding it as AAD gets that behaviour from the cipher itself
 * rather than from a comparison the simulator would have to remember to make.
 *
 * Real KMS treats the context as an unordered map, so the serialisation sorts
 * by key. Two contexts with the same pairs written in a different order have
 * to produce the same AAD, or a decryption that AWS would allow would fail
 * here.
 */
export class SimKmsEncryptionContextAad {
  /**
   * Serialise an encryption context to the bytes bound into the ciphertext.
   */
  serialise(context: SimKmsEncryptionContext | undefined): Uint8Array {
    return Buffer.from(this.canonical(context), "utf8");
  }

  /**
   * The canonical string form of an encryption context.
   *
   * Pairs are sorted by key and both halves are escaped, so that no pair of
   * distinct contexts can serialise to the same string by placing a separator
   * inside a key or a value.
   */
  private canonical(context: SimKmsEncryptionContext | undefined): string {
    if (context === undefined) {
      return "";
    }

    return Object.entries(context)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      )
      .join("&");
  }
}
