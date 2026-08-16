/**
 * Whether the Object a record reports still exists after the event.
 *
 * `size` and `eTag` describe an Object that is there to be read, so a removal
 * record carries neither, exactly as a real one does not. Everything that is
 * not a removal is treated as leaving an Object behind, which covers the
 * creations, the restores and the replications.
 */
export function simS3ObjectExists(eventName: string): boolean {
  return !eventName.startsWith("ObjectRemoved");
}
