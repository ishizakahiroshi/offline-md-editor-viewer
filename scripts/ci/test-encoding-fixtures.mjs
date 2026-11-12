import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ENCODING_FIXTURES, writeEncodingFixtures } from "./fixtures/encoding-fixtures.mjs";

const dir = writeEncodingFixtures();
try {
  assert.equal(ENCODING_FIXTURES.length, 12);
  for (const [name, , expectedSha] of ENCODING_FIXTURES) {
    const bytes = fs.readFileSync(path.join(dir, name));
    const sha = crypto.createHash("sha256").update(bytes).digest("hex");
    assert.equal(sha, expectedSha, `restored bytes differ: ${name}`);

    const label = name.includes("eucjp") ? "euc-jp"
      : name.includes("sjis") ? "shift_jis"
      : name.includes("utf16be") ? "utf-16be"
      : "utf-16le";
    // The two ja_crlf_* byte-oriented files hold a bare LF, as the originals did.
    const eol = name.startsWith("ja_cr_") ? "\r"
      : name.startsWith("ja_crlf_utf16") ? "\r\n"
      : "\n";
    const text = new TextDecoder(label, { fatal: true }).decode(bytes);
    const expectedLine = "てすと";
    assert.ok(text.includes(expectedLine + eol + expectedLine), `decoded text mismatch: ${name}`);
  }
  console.log("encoding fixtures ok: 12 restored with matching sha256");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
