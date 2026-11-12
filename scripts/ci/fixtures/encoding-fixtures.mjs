// Non-UTF-8 encoding fixtures (synthetic text, three kana repeated on two lines).
// Kept as byte definitions so the repository holds no unreadable raw files;
// the bytes are restored into a temporary directory when a test needs them.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// [file name, bytes as hex, sha256 of the original raw fixture file]
export const ENCODING_FIXTURES = [
  ["ja_crlf_eucjp.md", "a4c6a4b9a4c80aa4c6a4b9a4c8", "632a0a99c88d72fc84aa411512376ae631509dc9f6d1416c95493bfcd9b79c27"],
  ["ja_crlf_sjis.md", "82c482b782c60a82c482b782c6", "07e1874e973241bd5ee6cddb11c16e55ccacfdd7191e5546011dea6d3c395660"],
  ["ja_crlf_utf16be.md", "feff306630593068000d000a306630593068", "2b9406734bd4afa8b7a12be49a3a17ca4931a06caaacf83a2bc371ee49f554a4"],
  ["ja_crlf_utf16le.md", "fffe6630593068300d000a00663059306830", "837c31a9d9cbc87d0345429ee23fe50fd42b09bab0e5a4f1355e5f29bf03cc87"],
  ["ja_cr_eucjp.md", "a4c6a4b9a4c80da4c6a4b9a4c8", "86cbad5ad772ae4f764c03572037cc2039e5b1424e90ec8081c735ec32c4f215"],
  ["ja_cr_sjis.md", "82c482b782c60d82c482b782c6", "de43d28b049374406d5331eb33e66b7a2f5de1a2bc80fc98b02ae71813599786"],
  ["ja_cr_utf16be.md", "feff306630593068000d306630593068", "2e9b93f49aabbc58743ab6195d984457f4fc471a7bec148b06531b5165a60b55"],
  ["ja_cr_utf16le.md", "fffe6630593068300d00663059306830", "8b1c2e5ed0258ab83c8d706d00bea6f1681ac827da95d23c0c51abb99bf61a4c"],
  ["ja_lf_eucjp.md", "a4c6a4b9a4c80aa4c6a4b9a4c8", "632a0a99c88d72fc84aa411512376ae631509dc9f6d1416c95493bfcd9b79c27"],
  ["ja_lf_sjis.md", "82c482b782c60a82c482b782c6", "07e1874e973241bd5ee6cddb11c16e55ccacfdd7191e5546011dea6d3c395660"],
  ["ja_lf_utf16be.md", "feff306630593068000a306630593068", "13102149c3cb237656fe6a4fbf0bd14b5917dd38e4c5724cf02dbf84eb3ed259"],
  ["ja_lf_utf16le.md", "fffe6630593068300a00663059306830", "ffc495bdfaa3ba2ef0ff030a8129775f42afdda2f218950c3bd4da8216c2a3e8"],
];

// Restores every fixture into a fresh temporary directory and returns its path.
export function writeEncodingFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omev-encoding-"));
  for (const [name, hex] of ENCODING_FIXTURES) {
    fs.writeFileSync(path.join(dir, name), Buffer.from(hex, "hex"));
  }
  return dir;
}
