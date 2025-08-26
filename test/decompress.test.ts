import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";
import { deflateSync, deflateRawSync, gzipSync } from "zlib";
import { decompressBuffer, CompressionType } from "../dst/api";

describe("decompressBuffer", () => {
  it("should return the original buffer if type == Uncompressed", () => {
    const buffer = Buffer.from("hello world");
    const decompressed = decompressBuffer(buffer, CompressionType.Uncompressed);
    expect(buffer).to.equal(decompressed);
  });

  it("should return the original buffer if type == DeletedRecord", () => {
    const buffer = Buffer.from("hello world");
    const decompressed = decompressBuffer(buffer, CompressionType.DeletedRecord);
    expect(buffer).to.equal(decompressed);
  });

  it("should decompress ZLIB if type == ZLIB", () => {
    const compressed = deflateSync(Buffer.from("hello world"));
    const decompressed = decompressBuffer(compressed, CompressionType.ZLIB);
    expect(decompressed.toString()).to.equal("hello world");
  });

  it("should handle large data when decompressing ZLIB", () => {
    // Create a large buffer to test the fix for issue #1
    const largeText = "hello world ".repeat(10000); // ~120KB of data
    const compressed = deflateSync(Buffer.from(largeText));
    const decompressed = decompressBuffer(compressed, CompressionType.ZLIB);
    expect(decompressed.toString()).to.equal(largeText);
    expect(decompressed.length).to.equal(Buffer.from(largeText).length);
  });

  it("should handle raw DEFLATE format as fallback", () => {
    // Test fallback to raw DEFLATE format
    const text = "hello world from raw deflate";
    const compressed = deflateRawSync(Buffer.from(text));
    const decompressed = decompressBuffer(compressed, CompressionType.ZLIB);
    expect(decompressed.toString()).to.equal(text);
  });

  it("should handle GZIP format as fallback", () => {
    // Test fallback to GZIP format (for backward compatibility)
    const text = "hello world from gzip";
    const compressed = gzipSync(Buffer.from(text));
    const decompressed = decompressBuffer(compressed, CompressionType.ZLIB);
    expect(decompressed.toString()).to.equal(text);
  });

  it("should decompress internal compression if type == InternalCompression", () => {
    const compressed = readFileSync(resolve(__dirname, "./data/InternalCompression.binary"));
    expect(compressed.toString().startsWith("STBL")).to.be.false;
    const decompressed = decompressBuffer(compressed, CompressionType.InternalCompression);
    expect(decompressed.length).to.equal(8169);
    expect(decompressed.toString().startsWith("STBL")).to.be.true;
  });

  it("should throw if type == StreamableCompresssion", () => {
    const buffer = Buffer.from("hello world");
    expect(() => decompressBuffer(buffer, CompressionType.StreamableCompresssion)).to.throw();
  });
});
