/**
 * The statuses that cannot carry a body, whatever is configured or returned
 * with them.
 */
export const simElbV2NullBodyStatuses: ReadonlySet<number> = new Set([
  204, 205, 304,
]);
