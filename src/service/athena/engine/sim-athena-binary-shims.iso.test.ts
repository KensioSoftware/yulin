import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredExpression } from "./sim-athena-shim.fixture.js";

/**
 * The bytes Trino's own worked example for `murmur3` hashes, written as hex.
 *
 * Trino writes it as `from_base64('aaaaaa')`, and the two are the same four
 * bytes.
 */
const murmurVector = "'69A69A69'";

/** Eighty bytes, which is two whole stripes of the xxHash64 body and a tail. */
const longDigits = `'${"1234567890".repeat(8)}'`;

/** Forty-three bytes, which is two whole blocks of the MurmurHash3 body and a tail. */
const longWords = "'The quick brown fox jumps over the lazy dog'";

describe("Trino's hashing functions on SQLite", () => {
  it("answers the published digest for each algorithm", async () => {
    // Given the letter `a`, which every one of these has a published digest
    // for.
    // When each is hashed and read back as hex.
    // Then the digest is the published one, and `to_hex` writes it in the
    // upper case Trino writes it in.
    assertIdentical(
      await anAnsweredExpression("to_hex(md5(to_utf8('a')))"),
      "0CC175B9C0F1B6A831C399E269772661",
    );
    assertIdentical(
      await anAnsweredExpression("to_hex(sha1(to_utf8('a')))"),
      "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
    );
    assertIdentical(
      await anAnsweredExpression("to_hex(sha256(to_utf8('a')))"),
      "CA978112CA1BBDCAFAC231B39A23DC4DA786EFF8147C4E72B9807785AFEE48BB",
    );
    assertIdentical(
      await anAnsweredExpression("to_hex(sha512(to_utf8('')))"),
      "CF83E1357EEFB8BDF1542850D66D8007D620E4050B5715DC83F4A921D36CE9CE" +
        "47D0D13C5D85F2B0FF8318D2877EEC2F63B931BD47417A81A538327AF927DA3E",
    );
  });

  it("answers the published digest for the two hashes Node has not got", async () => {
    // Given the vectors xxHash publishes and the ones Trino's own tests
    // assert on. Neither hash has an implementation in Node, and both are
    // written out by hand here.
    // When each is hashed.
    // Then the answer is the published one, and a test asserting on one of
    // these digests asserts on what real Athena would have answered.
    assertIdentical(
      await anAnsweredExpression("to_hex(xxhash64(to_utf8('')))"),
      "EF46DB3751D8E999",
    );
    assertIdentical(
      await anAnsweredExpression("to_hex(xxhash64(to_utf8('abc')))"),
      "44BC2CF5AD770999",
    );
    assertIdentical(
      await anAnsweredExpression("to_hex(xxhash64(to_utf8('hashme')))"),
      "F9D96E0E1165E892",
    );
    assertIdentical(
      await anAnsweredExpression("to_hex(murmur3(to_utf8('')))"),
      "00000000000000000000000000000000",
    );
    assertIdentical(
      await anAnsweredExpression("to_hex(murmur3(to_utf8('hashme')))"),
      "93192FE805BE23041C8318F67EC4F2BC",
    );
    assertIdentical(
      await anAnsweredExpression(`to_hex(murmur3(from_hex(${murmurVector})))`),
      "BA5855635569B42F4920372CA0E396EF",
      "the one worked example in Trino's documentation",
    );
  });

  it("answers over values long enough to go round the block loop", async () => {
    // Given values that fill the body of each hash and leave a tail behind
    // it. The digits are a published xxHash64 vector, and the words are what
    // Austin Appleby's own MurmurHash3 answers with.
    // When each is hashed.
    // Then the answer is the published one. Every value above is short enough
    // to stay in the tail, and the loop reading the body would go untried.
    assertIdentical(
      await anAnsweredExpression(`to_hex(xxhash64(to_utf8(${longDigits})))`),
      "E04A477F19EE145D",
    );
    assertIdentical(
      await anAnsweredExpression(`to_hex(murmur3(to_utf8(${longWords})))`),
      "6C1B07BC7BBC4BE347939AC4A93C437A",
    );
  });

  it("reads a tail eight bytes at a time, then four, then one", async () => {
    // Given values whose length leaves a different tail behind the body.
    // When each is hashed.
    // Then each answer is the published one. Twenty-six bytes leave three
    // whole words and two bytes, and fourteen leave one word, one half word
    // and two bytes.
    assertIdentical(
      await anAnsweredExpression(
        "to_hex(xxhash64(to_utf8('abcdefghijklmnopqrstuvwxyz')))",
      ),
      "CFE1F278FA89835C",
    );
    assertIdentical(
      await anAnsweredExpression("to_hex(xxhash64(to_utf8('message digest')))"),
      "066ED728FCEEB3BE",
    );
  });

  it("counts a checksum rather than hashing to bytes", async () => {
    // Given a value.
    // When its CRC-32 is taken.
    // Then the answer is a whole number, where every other hash here answers
    // with bytes. Trino's `crc32` is the one that returns a bigint.
    assertIdentical(
      await anAnsweredExpression("crc32(to_utf8('hello'))"),
      907_060_870,
    );
    assertIdentical(await anAnsweredExpression("crc32(to_utf8(''))"), 0);
  });

  it("hashes text that reached it without a to_utf8 around it", async () => {
    // Given a value of text passed straight to a hash.
    // When it is hashed.
    // Then the answer is the hash of its UTF-8 bytes, which is what the
    // missing `to_utf8` would have produced. Trino refuses text where a
    // varbinary is wanted, and SQLite has no analysis to refuse it with.
    assertIdentical(
      await anAnsweredExpression("to_hex(sha256('a'))"),
      await anAnsweredExpression("to_hex(sha256(to_utf8('a')))"),
    );
  });

  it("answers null wherever the value is null", async () => {
    // Given a null reaching each function.
    // When it is hashed or encoded.
    // Then the answer is null, the way every Trino function answers a null
    // argument.
    const calls = [
      "md5(NULL)",
      "sha256(NULL)",
      "xxhash64(NULL)",
      "murmur3(NULL)",
      "crc32(NULL)",
      "to_hex(NULL)",
      "from_hex(NULL)",
      "to_base64(NULL)",
      "from_base64(NULL)",
      "to_utf8(NULL)",
      "from_utf8(NULL)",
    ];
    const answered = await Promise.all(calls.map(anAnsweredExpression));

    for (const [index, call] of calls.entries()) {
      assertIdentical(answered.at(index), null, call);
    }
  });
});

describe("Trino's binary encodings on SQLite", () => {
  it("carries a digest as bytes rather than as text", async () => {
    // Given a digest.
    // When SQLite is asked what it is holding.
    // Then it is a blob, so a varbinary has somewhere to live and two rows
    // carrying the same digest are one value.
    assertIdentical(
      await anAnsweredExpression("typeof(sha256(to_utf8('a')))"),
      "blob",
    );
    assertIdentical(await anAnsweredExpression("typeof(to_utf8(''))"), "blob");
  });

  it("reads bytes back out of hex and base64", async () => {
    // Given text in each encoding.
    // When it is read back and decoded.
    // Then the round trip reaches the value it started from, and either case
    // of hex reads.
    assertIdentical(
      await anAnsweredExpression("from_utf8(from_hex('72616E'))"),
      "ran",
    );
    assertIdentical(
      await anAnsweredExpression("from_utf8(from_hex('72616e'))"),
      "ran",
    );
    assertIdentical(
      await anAnsweredExpression("to_base64(to_utf8('rain'))"),
      "cmFpbg==",
    );
    assertIdentical(
      await anAnsweredExpression("from_utf8(from_base64('cmFpbg=='))"),
      "rain",
    );
    assertIdentical(
      await anAnsweredExpression("from_utf8(from_base64('cmFpbg'))"),
      "rain",
      "Trino takes base64 written without its padding",
    );
  });

  it("keeps an empty value as an empty value", async () => {
    // Given an empty string encoded, and empty text decoded.
    // When each is read back.
    // Then the answer is empty rather than null. SQLite reads some empty byte
    // arrays as SQL NULL, and a digest over an empty column would otherwise
    // answer nothing at all.
    assertIdentical(await anAnsweredExpression("to_hex(to_utf8(''))"), "");
    assertIdentical(await anAnsweredExpression("from_utf8(from_hex(''))"), "");
    assertIdentical(await anAnsweredExpression("to_base64(to_utf8(''))"), "");
  });

  it("refuses text the encoding cannot carry", async () => {
    // Given text that is no hex and text that is no base64.
    // When each is read back.
    // Then the statement raises and the query falls back. Trino fails the
    // query, and reading as much of the text as parses would answer with
    // bytes nobody wrote.
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("from_hex('zz')"),
    );
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("from_hex('ABC')"),
    );
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("from_base64('not base64!')"),
    );
  });

  it("refuses base64 whose padding could never have been written", async () => {
    // Given text padded to a length no encoder produces, and text one
    // character over a multiple of four.
    // When each is read back.
    // Then the statement raises. `Buffer` decodes all four of these and
    // answers with bytes nobody wrote.
    await Promise.all(
      ["=", "A=", "AAAA=", "A"].map(async (text) =>
        assertThrowsErrorAsync(
          async () => anAnsweredExpression(`from_base64('${text}')`),
          text,
        ),
      ),
    );
  });
});

describe("reading bytes back as text", () => {
  /** A byte that opens a two byte sequence, followed by one that cannot close it. */
  const brokenUtf8 = "from_hex('61C328')";

  it("writes a replacement character where the bytes were no UTF-8", async () => {
    // Given bytes carrying a sequence no decoder can read.
    // When they are read back with no replacement named.
    // Then the broken sequence reads as U+FFFD, which is what Trino writes.
    assertIdentical(
      await anAnsweredExpression(`from_utf8(${brokenUtf8})`),
      "a\u{FFFD}(",
    );
  });

  it("writes the replacement a call names instead", async () => {
    // Given the same bytes and a replacement of one character, and of none.
    // When each is read back.
    // Then the named replacement is written, and an empty one takes the
    // broken sequence out altogether.
    assertIdentical(
      await anAnsweredExpression(`from_utf8(${brokenUtf8}, '?')`),
      "a?(",
    );
    assertIdentical(
      await anAnsweredExpression(`from_utf8(${brokenUtf8}, '')`),
      "a(",
    );
  });

  it("tells a replacement left out from one written as NULL", async () => {
    // Given a call leaving the replacement out and a call writing it as NULL.
    // When each runs.
    // Then the absent one reads the bytes and the NULL answers null.
    assertIdentical(
      await anAnsweredExpression("from_utf8(to_utf8('rain'))"),
      "rain",
    );
    assertIdentical(
      await anAnsweredExpression("from_utf8(to_utf8('rain'), NULL)"),
      null,
    );
  });

  it("refuses a replacement it cannot apply faithfully", async () => {
    // Given a replacement longer than one character, and bytes already
    // carrying a replacement character of their own.
    // When each is read back with a replacement named.
    // Then the statement raises and the query falls back. Trino takes a
    // replacement of one character or none, and there is nothing left after
    // decoding to tell a character the bytes carried from one the decoder
    // wrote.
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression(`from_utf8(${brokenUtf8}, '??')`),
    );
    await assertThrowsErrorAsync(async () =>
      anAnsweredExpression("from_utf8(to_utf8('a\u{FFFD}b'), '?')"),
    );
  });
});
