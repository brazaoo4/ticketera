import zlib from "zlib";

export interface ZipEntryInput {
  name: string;
  data: Buffer;
  compress?: boolean;
}

export interface ZipExtractLimits {
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_ENTRY_BYTES = 50 * 1024 * 1024; // 50 MB per entry
const DEFAULT_MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB uncompressed total

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800;

// Precompute IEEE 802.3 CRC-32 table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Validates archive entry names against Zip Slip / traversal / null byte attacks.
 */
export function assertSafeZipEntryName(name: string): string {
  if (!name || typeof name !== "string") {
    throw new Error("Empty ZIP entry path");
  }
  if (name.includes("\0") || /[\x00-\x1f]/.test(name)) {
    throw new Error(`Unsafe control character in ZIP entry path: ${name}`);
  }
  if (name.startsWith("/") || name.startsWith("\\") || /^[a-zA-Z]:/.test(name)) {
    throw new Error(`Absolute ZIP entry path rejected: ${name}`);
  }
  const normalized = name.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((seg) => seg === "..")) {
    throw new Error(`Path traversal in ZIP entry rejected: ${name}`);
  }
  return normalized;
}

function getDosDateTime(date: Date = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Builds a standard ZIP archive buffer using STORE (method 0) or DEFLATE (method 8).
 */
export function createZipBuffer(entries: ZipEntryInput[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  const { dosTime, dosDate } = getDosDateTime();
  let offset = 0;

  for (const entry of entries) {
    const safeName = assertSafeZipEntryName(entry.name);
    const nameBuf = Buffer.from(safeName, "utf8");
    const uncompressed = entry.data;
    const checksum = crc32(uncompressed);

    const shouldCompress = entry.compress ?? safeName.toLowerCase().endsWith(".json");
    let compressed = uncompressed;
    let method = 0;

    if (shouldCompress && uncompressed.length > 0) {
      const deflated = zlib.deflateRawSync(uncompressed, { level: 6 });
      if (deflated.length < uncompressed.length) {
        compressed = deflated;
        method = 8;
      }
    }

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    localHeader.writeUInt16LE(20, 4); // version needed (2.0)
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localChunks.push(localHeader, nameBuf, compressed);

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attrs
    centralHeader.writeUInt32LE(0, 38); // external file attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirBuffer = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localChunks, centralDirBuffer, eocd]);
}

/**
 * Extracts and verifies all files from a ZIP buffer with Zip Slip, CRC-32, and decompression-bomb limits.
 */
export function extractZipBuffer(
  buffer: Buffer,
  limits: ZipExtractLimits = {}
): Map<string, Buffer> {
  const maxEntries = limits.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxTotalBytes = limits.maxTotalUncompressedBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  if (!buffer || buffer.length < 22) {
    throw new Error("Invalid ZIP archive: file is too small.");
  }

  // Locate End of Central Directory (EOCD) scanning backwards up to 65KB comment range
  const minEocdOffset = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= minEocdOffset; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP archive: missing central directory signature.");
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (totalEntries > maxEntries) {
    throw new Error(`ZIP archive exceeds maximum entry limit (${maxEntries}).`);
  }

  if (centralDirOffset + centralDirSize > eocdOffset) {
    throw new Error("Invalid ZIP archive: corrupted central directory offsets.");
  }

  const result = new Map<string, Buffer>();
  let cursor = centralDirOffset;
  let runningUncompressedBytes = 0;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (cursor + 46 > eocdOffset) {
      throw new Error("Invalid ZIP archive: truncated central directory entry.");
    }
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIR_HEADER_SIG) {
      throw new Error("Invalid ZIP archive: bad central directory header signature.");
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    if (cursor + 46 + nameLen + extraLen + commentLen > eocdOffset) {
      throw new Error("Invalid ZIP archive: central directory entry overflows archive.");
    }

    const rawName = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLen);
    cursor += 46 + nameLen + extraLen + commentLen;

    const safeName = assertSafeZipEntryName(rawName);
    if (safeName.endsWith("/")) {
      continue; // directory entry
    }

    if (uncompressedSize > maxEntryBytes) {
      throw new Error(`ZIP entry "${safeName}" exceeds per-file size limit.`);
    }
    runningUncompressedBytes += uncompressedSize;
    if (runningUncompressedBytes > maxTotalBytes) {
      throw new Error("ZIP archive exceeds total uncompressed size limit.");
    }

    if (localHeaderOffset + 30 > centralDirOffset) {
      throw new Error(`ZIP entry "${safeName}" has invalid local header offset.`);
    }
    if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIG) {
      throw new Error(`ZIP entry "${safeName}" has invalid local header signature.`);
    }

    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > centralDirOffset) {
      throw new Error(`ZIP entry "${safeName}" payload overflows archive.`);
    }

    const payloadSlice = buffer.subarray(dataStart, dataEnd);
    let data: Buffer;

    if (method === 0) {
      data = Buffer.from(payloadSlice);
    } else if (method === 8) {
      data = zlib.inflateRawSync(payloadSlice, { maxOutputLength: maxEntryBytes });
    } else {
      throw new Error(`Unsupported ZIP compression method (${method}) for "${safeName}".`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`Size mismatch after inflating "${safeName}".`);
    }

    const actualCrc = crc32(data);
    if (actualCrc !== expectedCrc) {
      throw new Error(`CRC-32 checksum mismatch for "${safeName}".`);
    }

    result.set(safeName, data);
  }

  return result;
}
