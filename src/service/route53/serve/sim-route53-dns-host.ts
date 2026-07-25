/**
 * Logical name of Yulin's own simulated Route53 introspection host.
 *
 * Served locally, `dns.sim-aws.localhost` reports the simulated hosted zones
 * and their records. It is a built-in Yulin hostname rather than a name held in
 * any hosted zone, so it resolves the same way whatever records exist. That
 * matters because it is where the server is, not something it answers for.
 */
export const simRoute53DnsHostName = "dns";
