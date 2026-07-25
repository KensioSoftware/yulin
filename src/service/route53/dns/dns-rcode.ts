/**
 * DNS response codes used by the simulator.
 *
 * `NOERROR` with no answers is a NODATA response: the name exists but holds no
 * record of the requested type. `NXDOMAIN` means the name does not exist at
 * all. Resolvers treat those differently, so the distinction matters.
 */
export const dnsRcodes = {
  noError: 0,
  formatError: 1,
  serverFailure: 2,
  nameError: 3,
  notImplemented: 4,
  refused: 5,
} as const;

export type DnsRcode = (typeof dnsRcodes)[keyof typeof dnsRcodes];
