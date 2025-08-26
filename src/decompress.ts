import { inflateSync } from "zlib";
import CompressionType from "./compression-type";

/**
 * Decompresses the given buffer using the given algorithm.
 * 
 * @param buffer Buffer to decompress
 * @param compression Compression algorithm to use
 */
export default function decompressBuffer(buffer: Buffer, compression: CompressionType): Buffer {
  switch (compression) {
    case CompressionType.ZLIB:
      return decompressZlib(buffer);
    case CompressionType.InternalCompression:
      return internalDecompression(buffer)
    case CompressionType.Uncompressed:
      // fallthrough
    case CompressionType.DeletedRecord:
      return buffer;
    default:
      throw new Error(`Decompressing "${compression} (${CompressionType[compression]})" is not supported.`);
  }
}

/**
 * Decompresses ZLIB data with buffer validation to handle "unexpected end of file" errors.
 * Uses inflateSync to match deflateSync used in compression for consistent ZLIB format.
 * 
 * @param buffer Buffer to decompress
 */
function decompressZlib(buffer: Buffer): Buffer {
  // Validate buffer
  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot decompress empty or null buffer");
  }

  // Check for minimum size
  if (buffer.length < 2) {
    throw new Error("Buffer too small to contain valid compressed data");
  }

  try {
    return inflateSync(buffer);
  } catch (error) {
    // Provide more detailed error information for debugging
    const errorMsg = error instanceof Error ? error.message : String(error);
    const bufferInfo = `Buffer length: ${buffer.length}, First bytes: ${buffer.slice(0, Math.min(8, buffer.length)).toString('hex')}`;
    throw new Error(`ZLIB decompression failed: ${errorMsg}. ${bufferInfo}. Please check if the buffer contains only compressed data without headers or trailing data.`);
  }
}

/**
 * Decompresses a buffer using the internal compression algorithm.
 * 
 * Heavily based on this Visual Basic code by Scumbumbo:
 * https://modthesims.info/showthread.php?t=618074
 * 
 * Scumbumbo's VB code was put through this VB -> C# translator:
 * https://converter.telerik.com/
 * 
 * Note that the above translator is not perfect, and uses an outdated version
 * of the converter library:
 * https://github.com/icsharpcode/CodeConverter/issues/826#issuecomment-1030841329
 * 
 * The output code had to be touched up manually to fit TS syntax, but other
 * than that, this is basically Scumbumbo's code. Major credit to him.
 * 
 * @param data Buffer to decompress
 */
function internalDecompression(data: Buffer): Buffer {
  const decompressedSize = readUInt24BE(data, 2);
  const udata: Buffer = Buffer.alloc(decompressedSize);

  let udata_idx = 0;
  let data_idx = 5; // 2 bytes flags + 3 bytes size
  let compressionFormat = data[0];
  let controlCode: number; // byte
  let size: number;
  let copySize: number;
  let copyOffset: number;
  
  if (compressionFormat & 0x80) data_idx++;

  do {
    controlCode = data[data_idx];
    data_idx += 1;
    if (controlCode <= 0x7F) {
      size = controlCode & 0x3;
      copySize = ((controlCode & 0x1C) / 4) + 3;
      copyOffset = ((controlCode & 0x60) * 8) + data[data_idx];
      data_idx += 1;
      copyBufferRange(data, data_idx, udata, udata_idx, size);
      data_idx += size;
      udata_idx += size;
      for (var I = 0; I <= copySize - 1; I++)
        udata[udata_idx + I] = udata[(udata_idx + I) - copyOffset - 1];
      udata_idx += copySize;
    } else if (controlCode <= 0xBF) {
      size = (data[data_idx] & 0xC0) / 64;
      copySize = (controlCode & 0x3F) + 4;
      copyOffset = ((data[data_idx] & 0x3F) * 256) + data[data_idx + 1];
      data_idx += 2;
      copyBufferRange(data, data_idx, udata, udata_idx, size);
      data_idx += size;
      udata_idx += size;
      for (var I = 0; I <= copySize - 1; I++)
        udata[udata_idx + I] = udata[(udata_idx + I) - copyOffset - 1];
      udata_idx += copySize;
    } else if (controlCode <= 0xDF) {
      size = controlCode & 0x3;
      copySize = ((controlCode & 0xC) * 64) + data[data_idx + 2] + 5;
      copyOffset = ((controlCode & 0x10) * 4096) + (data[data_idx] * 256) + data[data_idx + 1];
      data_idx += 3;
      copyBufferRange(data, data_idx, udata, udata_idx, size);
      data_idx += size;
      udata_idx += size;
      for (var I = 0; I <= copySize - 1; I++)
        udata[udata_idx + I] = udata[(udata_idx + I) - copyOffset - 1];
      udata_idx += copySize;
    } else if (controlCode <= 0xFB) {
      size = ((controlCode & 0x1F) * 4) + 4;
      copyBufferRange(data, data_idx, udata, udata_idx, size);
      data_idx += size;
      udata_idx += size;
    } else {
      size = controlCode & 0x3;
      if (size > 0) {
        copyBufferRange(data, data_idx, udata, udata_idx, size);
        data_idx += size;
        udata_idx += size;
      }
    }
  } while (!(controlCode >= 0xFC));

  return udata;
}

/**
 * Copies bytes from one buffer to another.
 * 
 * @param srcBuffer Buffer to get data from
 * @param srcIndex Start index to copy data from
 * @param dstBuffer Buffer to copy data to
 * @param dstIndex Start index to copy data to
 * @param range Number of bytes to copy
 */
function copyBufferRange(srcBuffer: Buffer, srcIndex: number, dstBuffer: Buffer, dstIndex: number, range: number) {
  for (let i = 0; i < range; i++) {
    dstBuffer[dstIndex + i] = srcBuffer[srcIndex + i];
  }
}

/**
 * Reads a 24-bit integer with big endianness from a buffer.
 * 
 * @param data Buffer with at least 3 bytes
 * @param offset Offset at which to read UInt24
 */
function readUInt24BE(data: Buffer, offset: number): number {
  let result = data.readUInt8(offset) * (2 ** 16);
  result += data.readUInt8(offset + 1) * (2 ** 8);
  result += data.readUInt8(offset + 2);
  return result;
}
