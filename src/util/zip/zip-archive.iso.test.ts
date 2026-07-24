import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimZipArchive, ZipFormatError } from "./zip-archive.js";
import { SimZipArchiveBuilder } from "./zip-archive-builder.js";

describe("sim zip archive", () => {
  it("round-trips deflate-compressed files", () => {
    // Given an archive with deflate-compressed files, as AWS tooling makes.
    const bytes = new SimZipArchiveBuilder()
      .addFile("index.js", "exports.handler = async () => 'hi';")
      .addFile("lib/util.js", "module.exports = { helpful: true };")
      .toBytes();

    // When the bytes are parsed back.
    const archive = SimZipArchive.fromBytes(bytes);

    // Then the file paths and contents round-trip.
    assertArrayEquals(archive.filePaths(), ["index.js", "lib/util.js"]);
    assertIdentical(
      archive.file("index.js").toString(),
      "exports.handler = async () => 'hi';",
    );
    assertIdentical(
      archive.file("lib/util.js").toString(),
      "module.exports = { helpful: true };",
    );
  });

  it("round-trips stored files", () => {
    // Given an archive with an uncompressed stored entry.
    const bytes = new SimZipArchiveBuilder()
      .addFile("stored.txt", "stored as-is", { compression: "store" })
      .toBytes();

    // When the bytes are parsed back.
    const archive = SimZipArchive.fromBytes(bytes);

    // Then the stored content round-trips.
    assertIdentical(archive.file("stored.txt").toString(), "stored as-is");
  });

  it("round-trips binary file content", () => {
    // Given binary content including zero bytes.
    const binary = Buffer.from([0, 1, 2, 254, 255, 0, 128]);
    const bytes = new SimZipArchiveBuilder()
      .addFile("blob.bin", binary)
      .toBytes();

    // When the bytes are parsed back.
    const archive = SimZipArchive.fromBytes(bytes);

    // Then the binary content is intact.
    assertTrue(archive.file("blob.bin").equals(binary));
  });

  it("round-trips non-ASCII file paths with the UTF-8 flag set", () => {
    // Given an archive with a non-ASCII file path.
    const bytes = Buffer.from(
      new SimZipArchiveBuilder()
        .addFile("目录/ファイル.js", "// code")
        .toBytes(),
    );

    // Then the general purpose flags declare UTF-8 file names, in the local
    // header at offset 6 and the central directory entry at offset 8.
    assertIdentical(bytes.readUInt16LE(6), 0x08_00);
    const centralOffset = bytes.readUInt32LE(bytes.length - 22 + 16);
    assertIdentical(bytes.readUInt16LE(centralOffset + 8), 0x08_00);

    // And the path round-trips through parsing.
    const archive = SimZipArchive.fromBytes(bytes);
    assertArrayEquals(archive.filePaths(), ["目录/ファイル.js"]);
  });

  it("reports whether a file exists", () => {
    const bytes = new SimZipArchiveBuilder().addFile("here.txt", "").toBytes();

    const archive = SimZipArchive.fromBytes(bytes);

    assertTrue(archive.hasFile("here.txt"));
    assertFalse(archive.hasFile("missing.txt"));
  });

  it("throws with the archive listing for a missing file", () => {
    const bytes = new SimZipArchiveBuilder()
      .addFile("index.js", "//")
      .toBytes();
    const archive = SimZipArchive.fromBytes(bytes);

    const error = assertThrowsError(() => archive.file("missing.js"));

    assertInstanceOf(error, ZipFormatError);
    assertStringIncludes(error.message, "missing.js");
    assertStringIncludes(error.message, "index.js");
  });

  it("rejects bytes that are not a zip archive", () => {
    const error = assertThrowsError(() =>
      SimZipArchive.fromBytes(Buffer.from("just some text, no zip here")),
    );

    assertInstanceOf(error, ZipFormatError);
    assertStringIncludes(error.message, "not a zip archive");
  });

  it("rejects a truncated zip archive", () => {
    // Given a valid archive cut off after the end record signature offset is
    // corrupted to point outside the buffer.
    const bytes = Buffer.from(
      new SimZipArchiveBuilder().addFile("index.js", "// code").toBytes(),
    );
    // Corrupt the central directory offset in the end record.
    bytes.writeUInt32LE(0xff_ff_00_00, bytes.length - 22 + 16);

    const error = assertThrowsError(() => SimZipArchive.fromBytes(bytes));

    assertInstanceOf(error, ZipFormatError);
  });

  it("rejects an unsupported compression method", () => {
    // Given an archive whose entry claims an unsupported compression method.
    const bytes = Buffer.from(
      new SimZipArchiveBuilder()
        .addFile("index.js", "// code", { compression: "store" })
        .toBytes(),
    );
    // The method field is at local header offset 8 and central entry offset
    // 10; the central directory follows the single local entry.
    const centralOffset = bytes.readUInt32LE(bytes.length - 22 + 16);
    bytes.writeUInt16LE(99, 8);
    bytes.writeUInt16LE(99, centralOffset + 10);

    const error = assertThrowsError(() => SimZipArchive.fromBytes(bytes));

    assertInstanceOf(error, ZipFormatError);
    assertStringIncludes(error.message, "compression method 99");
  });

  it("rejects a malformed central directory entry", () => {
    // Given an archive whose central directory signature is corrupted.
    const bytes = Buffer.from(
      new SimZipArchiveBuilder().addFile("index.js", "// code").toBytes(),
    );
    const centralOffset = bytes.readUInt32LE(bytes.length - 22 + 16);
    bytes.writeUInt32LE(0xba_dc_0f_fe, centralOffset);

    const error = assertThrowsError(() => SimZipArchive.fromBytes(bytes));

    assertInstanceOf(error, ZipFormatError);
    assertStringIncludes(error.message, "central directory");
  });

  it("rejects a malformed local file header", () => {
    // Given an archive whose local file header signature is corrupted; the
    // first local header sits at the very start of a single-file archive.
    const bytes = Buffer.from(
      new SimZipArchiveBuilder().addFile("index.js", "// code").toBytes(),
    );
    bytes.writeUInt32LE(0xba_dc_0f_fe, 0);

    const error = assertThrowsError(() => SimZipArchive.fromBytes(bytes));

    assertInstanceOf(error, ZipFormatError);
    assertStringIncludes(error.message, "local file header");
  });

  it("rejects zip64 archives", () => {
    // Given an end record that carries the zip64 sentinel entry count.
    const bytes = Buffer.from(
      new SimZipArchiveBuilder().addFile("index.js", "// code").toBytes(),
    );
    bytes.writeUInt16LE(0xff_ff, bytes.length - 22 + 10);

    const error = assertThrowsError(() => SimZipArchive.fromBytes(bytes));

    assertInstanceOf(error, ZipFormatError);
    assertStringIncludes(error.message, "Zip64");
  });

  it("skips directory entries", () => {
    // Given an archive containing an explicit directory entry.
    const bytes = new SimZipArchiveBuilder()
      .addFile("lib/", "")
      .addFile("lib/util.js", "// code")
      .toBytes();

    const archive = SimZipArchive.fromBytes(bytes);

    // Then only the file entry is listed.
    assertArrayEquals(archive.filePaths(), ["lib/util.js"]);
  });
});
