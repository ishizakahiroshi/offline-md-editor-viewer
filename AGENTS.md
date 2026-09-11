# Agent Entry Point

This repository's operational guidance is maintained in `CLAUDE.md`.


- Primary instructions: `./CLAUDE.md`
- Local/private additions (if present): `./CLAUDE.local.md`

If any guidance conflicts, follow `CLAUDE.md`.

## AI 作業共通ルール

- ビルド・コミット禁止、secrets-scan 責務、plan/bugfix/pending md の作成ルール等の AI 作業共通ルールは、各利用者のグローバル AI 設定に従う（作者環境の例: `~/.claude/CLAUDE.md` および `~/.claude/guides/`）

## ファイル索引・テーブル逆引き（探す前に読む）

**どのファイルが何をして、どのテーブルを読み書きするかを聞かれたら、grep で探し回る前に
`.omitnix/index.json` を読む。** 全ファイルの索引とテーブルからの逆引きが入っている。

- **解析できなかったファイルも名前と理由付きで載っている。** 「索引に無い」と「読めなかった」を
  取り違えない。参照 0 件は「未使用」ではない
- `generated.commit` が現在の HEAD と違えば、索引はその commit 時点のもの。
  **古いまま断定せず、古いことを添えて答えるか `omitnix` で作り直す**
