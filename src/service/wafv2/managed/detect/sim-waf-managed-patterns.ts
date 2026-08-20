import { simWafUrlDecode } from "../../statement/sim-waf-url-decode.js";

/**
 * The patterns AWS published for its managed rules, and nothing beyond them.
 *
 * AWS documents an example pattern or two for each of these rules and holds
 * the rest back, which is what stops a simulation of them from agreeing with
 * real WAF. Each function here matches what was published, so every one of
 * them detects less than the rule it stands for and none of them detects more.
 *
 * That direction is the whole point. A test with the core rule set on is
 * usually asking whether an application's own traffic still gets through, and
 * a rule that blocked more than AWS blocks would fail that test for a request
 * AWS allows. A rule that blocks less is invisible to it, and right on AWS
 * too.
 *
 * Every one of these reads the component after a URL decode, because the
 * managed rules apply one and a payload arrives percent encoded more often
 * than not.
 */

/** The EC2 instance metadata address and the path exfiltration asks it for. */
const metadataAddress = "169.254.169.254";
const metadataPath = "/latest/meta-data";

/** `${jndi:` is the published shape of a Log4Shell lookup. */
const jndiLookup = /\$\{jndi:/iu;

/** A path traversal, in either slash, either way round. */
const pathTraversal = /\.\.[/\\]|[/\\]\.\./u;

/**
 * A URL scheme followed by an IPv4 host, which is the published RFI shape.
 *
 * Every quantifier here is bounded and each is followed by a character it
 * cannot itself match, so a value that fails to match fails at a fixed
 * position. The unsafe-expression check reads the repeated groups and cannot
 * see that.
 */
const remoteInclusion =
  // oxlint-disable-next-line security/detect-unsafe-regex
  /[a-z][a-z\d+.-]{0,30}:\/\/\d{1,3}(?:\.\d{1,3}){3}/iu;

/** The two file extensions AWS gives as examples of a restricted one. */
const restrictedExtension = /\.(?:log|ini)\b/iu;

/**
 * Whether a component asks the EC2 instance metadata service for anything.
 *
 * Both halves are patterns in the request rather than facts about its sender,
 * so neither of them needs the caller's address that keeps
 * `IPSetReferenceStatement` out of this simulation.
 */
export function simWafDetectsEc2MetadataSsrf(value: string): boolean {
  const decoded = simWafUrlDecode(value);

  return (
    decoded.includes(metadataAddress) ||
    decoded.toLowerCase().includes(metadataPath)
  );
}

/**
 * Whether a component carries a JNDI lookup, which is how Log4Shell arrives.
 *
 * The nested forms that hide the letters of `jndi` behind further lookups are
 * not matched. AWS matches them and does not say how.
 */
export function simWafDetectsLog4JRce(value: string): boolean {
  return jndiLookup.test(simWafUrlDecode(value));
}

/**
 * Whether a component carries a local file inclusion, which is a traversal out
 * of the directory a path was meant to stay in.
 */
export function simWafDetectsGenericLfi(value: string): boolean {
  return pathTraversal.test(simWafUrlDecode(value));
}

/**
 * Whether a component carries a remote file inclusion, which AWS describes as
 * a URL scheme followed by an IPv4 host.
 */
export function simWafDetectsGenericRfi(value: string): boolean {
  return remoteInclusion.test(simWafUrlDecode(value));
}

/**
 * Whether a component names a file with a restricted extension.
 *
 * The extension has to end there, so `report.log` is a match and `logo.png` is
 * not.
 */
export function simWafDetectsRestrictedExtension(value: string): boolean {
  return restrictedExtension.test(simWafUrlDecode(value));
}

/**
 * Whether a path asks for a web application directory that is not meant to be
 * served, which AWS gives `web-inf` as the example of.
 */
export function simWafDetectsExploitablePath(value: string): boolean {
  return simWafUrlDecode(value).toLowerCase().includes("web-inf");
}

/**
 * Whether a path asks for an exposed administrative page, which AWS gives
 * `sqlmanager` as the example of.
 *
 * The administrative paths an application of its own uses are not matched.
 * `/admin` is nowhere in what AWS published, and matching it here would block
 * a request AWS lets through.
 */
export function simWafDetectsAdminPath(value: string): boolean {
  return simWafUrlDecode(value).toLowerCase().includes("sqlmanager");
}

/**
 * Whether a component carries a serialized Java object, which is the payload
 * an unsafe deserialization is delivered in.
 *
 * `rO0` is the base64 of the two bytes a Java stream starts with, and it is
 * the published example. The raw bytes are not matched: they are not valid
 * UTF-8, and every component here is read as text.
 */
export function simWafDetectsJavaDeserializationRce(value: string): boolean {
  return simWafUrlDecode(value).includes("rO0");
}

/**
 * Whether a User-Agent names one of the scanners AWS gives as examples of a
 * bad bot.
 */
export function simWafDetectsBadBot(value: string): boolean {
  const decoded = simWafUrlDecode(value).toLowerCase();

  return decoded.includes("nessus") || decoded.includes("nmap");
}
