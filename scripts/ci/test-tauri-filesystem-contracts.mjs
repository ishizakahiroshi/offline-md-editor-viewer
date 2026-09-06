import assert from "node:assert/strict";
import fs from "node:fs";

const rustPath = new URL("../../apps/desktop/src-tauri/src/lib.rs", import.meta.url);
const htmlPath = new URL("../../apps/browser/offline-md-editor-viewer.html", import.meta.url);
const rust = fs.readFileSync(rustPath, "utf8");
const html = fs.readFileSync(htmlPath, "utf8");

function requireText(source, text, label) {
  assert.ok(source.includes(text), `${label}: missing ${text}`);
}

function functionSection(source, name, nextName) {
  const start = source.indexOf(`fn ${name}`);
  assert.notEqual(start, -1, `function not found: ${name}`);
  const end = nextName ? source.indexOf(`fn ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `next function not found: ${nextName}`);
  return source.slice(start, end);
}

const readSection = functionSection(rust, "desktop_read_file_bytes", "atomic_write");
requireText(readSection, "fs::File::open", "bounded file read");
requireText(readSection, "read_bounded(file, initial_size, MAX_FILE_BYTES)", "bounded file read");
requireText(rust, "reader.take(max_bytes.saturating_add(1))", "bounded reader upper bound");

const renameSection = functionSection(rust, "desktop_rename_file", "is_cross_device_error");
requireText(renameSection, "rename_without_replace", "rename no-clobber");
requireText(rust, "fn move_without_replace", "Windows move primitive");
requireText(rust, "MoveFileExW", "Windows move primitive");
assert.doesNotMatch(rust, /MOVEFILE_REPLACE_EXISTING/, "move primitive must not enable replacement");

const moveSection = functionSection(rust, "desktop_move_entry", "desktop_delete_file");
requireText(moveSection, "move_without_replace", "same-volume move no-clobber");
requireText(moveSection, "move_across_devices", "cross-volume move fallback");
requireText(rust, "unique_temp_sibling", "owned move temporary");
requireText(rust, "copy_file_no_replace", "copy no-clobber");
assert.doesNotMatch(rust, /fs::copy\s*\(/, "filesystem copies must claim destinations atomically");

requireText(rust, "truncated: bool", "listing truncation contract");
requireText(rust, "warnings: Vec<String>", "listing warning contract");
requireText(rust, "collect_markdown_files_inner(&path, state, depth + 1)?", "recursive listing errors");
requireText(rust, "modified: modified_millis(&entry_path)", "shallow modified metadata");
requireText(html, "normalizeTauriDirectoryListing", "frontend listing normalization");
requireText(html, "reportTauriListingWarning", "frontend partial listing warning");
requireText(html, "Number(e.modified || 0)", "frontend modified metadata");

requireText(rust, "fn inspect_drag_drop_path", "desktop drop inspection");
requireText(rust, "fs::symlink_metadata(path)", "desktop drop link inspection");
requireText(rust, "FILE_ATTRIBUTE_REPARSE_POINT", "desktop reparse rejection");
requireText(rust, '"rejected": rejected', "desktop drop rejection payload");
requireText(html, "getTauriDropRejectionMessage", "frontend drop rejection reason");

requireText(rust, "bounded_reader_rejects_growth_past_limit", "bounded reader unit test");
requireText(rust, "no_clobber_copy_preserves_existing_destination", "copy fault test");
requireText(rust, "no_clobber_move_preserves_existing_destination", "move fault test");
requireText(rust, "case_only_rename_uses_a_temporary_sibling", "case-only rename test");

console.log("OK Tauri filesystem contracts");
