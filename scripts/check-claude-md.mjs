#!/usr/bin/env node
// CLAUDE.md が再び太らないようにするための検査。
//
// CLAUDE.md は全 AI セッションで全文がロードされる。長い規約本文は
// reference / code / CI / manual へ降格し、ここには入口と索引だけを置く。
// 予算を上げて通す前に、まず正本側へ移せないかを確認すること。
//
// exit 0 = 問題なし / exit 1 = ブロック。

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(repoRoot, 'CLAUDE.md');

// C2 の横展開実測後に見直す暫定値。上げる前に本文の降格を検討する。
const MAX_LINES = 150;
const MAX_SECTION_LINES = 20;
const CANONICAL_HINT =
  /(`[^`]*\.(md|go|rs|ts|mjs|ps1|json|yaml|yml|toml)`|\]\([^)]+\)|scripts\/|apps\/|docs\/|\.github\/|CLAUDE\.local\.md)/;

const text = readFileSync(target, 'utf8');
const lines = text.split(/\r?\n/);
const problems = [];

if (lines.length > MAX_LINES) {
  problems.push(
    `CLAUDE.md が ${lines.length} 行で予算 ${MAX_LINES} 行を超えている（超過 ${lines.length - MAX_LINES} 行）。\n` +
      '    予算を上げて通すのは最後の手段。本文を正本側へ降格すること。',
  );
}

/** @type {{title: string, start: number, lines: string[]}[]} */
const sections = [];
let current = null;
lines.forEach((line, i) => {
  if (/^## /.test(line)) {
    if (current) sections.push(current);
    current = { title: line.replace(/^##\s*/, ''), start: i + 1, lines: [] };
    return;
  }
  if (current) current.lines.push(line);
});
if (current) sections.push(current);

for (const section of sections) {
  const body = section.lines.join('\n');
  const count = section.lines.length + 1;
  if (count > MAX_SECTION_LINES) {
    problems.push(
      `CLAUDE.md:${section.start} 「${section.title}」が ${count} 行（上限 ${MAX_SECTION_LINES} 行）。\n` +
        '    本文は正本側へ移し、ここには索引だけを残すこと。',
    );
  }
  if (/制定/.test(section.title) && !CANONICAL_HINT.test(body)) {
    problems.push(
      `CLAUDE.md:${section.start} 「${section.title}」が正本の場所を名指ししていない。\n` +
        '    制定ルールはコード・検査スクリプト・CI・guide のどれかを指すこと。',
    );
  }
}

if (problems.length > 0) {
  console.error('NG: CLAUDE.md の構造検査\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `OK: CLAUDE.md は ${lines.length}/${MAX_LINES} 行・節 ${sections.length} 件（最長 ${Math.max(
    ...sections.map((s) => s.lines.length + 1),
  )} 行 / 上限 ${MAX_SECTION_LINES} 行）`,
);
