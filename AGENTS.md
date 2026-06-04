# Agent Entry Point

This repository's operational guidance is maintained in `CLAUDE.md`.


- Primary instructions: `./CLAUDE.md`
- Local/private additions (if present): `./CLAUDE.local.md`

If any guidance conflicts, follow `CLAUDE.md`.

<!-- any-ai-cli:approval-rules -->
<!-- version: 7 -->
## any-ai-cli Approval Format

**このセッションが any-ai-cli Hub 管理下かどうかを最初に確認してください。**

確認方法（**OS と使用するツールに応じて構文を選ぶ**）：

- macOS / Linux: `Bash` ツールで `echo "$ANY_AI_CLI"`
- Windows (PowerShell ネイティブ): `PowerShell` ツールで `$env:ANY_AI_CLI`
- Windows (Git Bash / WSL / Cygwin): `Bash` ツールで `echo "$ANY_AI_CLI"`

⚠️ **取り違え注意**：
- `Bash` ツールに `$env:ANY_AI_CLI` を渡すと `:ANY_AI_CLI: command not found`（exit 127）で失敗する。bash では `$env` が空に展開され、残った `:ANY_AI_CLI` がコマンドとして実行されるため。
- `PowerShell` ツールに `echo $ANY_AI_CLI` を渡すと、`$ANY_AI_CLI` は PowerShell では未定義の変数として空文字に展開され、値が取得できない。
- macOS / Linux には PowerShell が標準で入っていないので `PowerShell` ツールは選ばない。
- 失敗したらツールを切り替えて再試行すること（落としてセッションを止めない）。

`ANY_AI_CLI=1` の場合のみ、以下の [ANY-AI-CLI] マーカーを使用してください。
未設定・空の場合はマーカーなしでプレーンテキストで出力してください。
（このチェックはセッション内で1回だけ行い、結果を記憶してください）

- YES/NO:
  [ANY-AI-CLI]
  question? (Y:1/N:0)
  [/ANY-AI-CLI]

- 番号付き選択肢:
  [ANY-AI-CLI]
  question?
  1. Option A (Recommended)
  2. Option B
  N. User specifies
  [/ANY-AI-CLI]

  - Option 1 は必ず推奨選択肢とし (Recommended) を末尾に付ける
  - 最後の選択肢は必ず「N. User specifies」

- 複数質問（一括確認、上限 N=8 推奨）:
  [ANY-AI-CLI]
  1 question1?
   1. Option A (Recommended)
   2. Option B
   3. Option C
   N. User specifies
  2 question2?
   4. Option D (Recommended)
   5. Option E
   6. Option F
   N. User specifies
  [/ANY-AI-CLI]

  - 選択肢番号は自由。上例のようなブロック全体の通し番号でも、質問ごとに 1. から振り直してもよい。ただし同一質問内で番号を重複させない
  - ユーザーの回答には **画面に表示した選択肢番号がそのまま** 返ってくる。解釈時は自分が出力した番号と照合すること（1 起点に読み替えない）
  - 1 ブロックに 2 件以上の質問を並べる場合のみこの形式を使う
  - 質問の見出し番号は 1, 2, 3 ... の連番。プレフィックス（Q1: / C1: 等）は付けない
  - 各質問の最初の選択肢を推奨とし (Recommended) を末尾に付ける。各質問の最後は必ず「N. User specifies」
  - 各質問の選択肢行は 1 文字以上インデントする（見出し番号と区別するため）
  - ユーザーの回答は各行「<質問見出し番号> <選択肢番号>」の複数行テキストで返ってくる（例: 上の通し番号の例なら「1 2」と「2 5」の 2 行 = 質問1 は Option B、質問2 は Option E）
  - ユーザーが手入力した場合は「2 5」のような質問順の数字列 1 行のこともある。行頭の数字が質問番号として解釈できない場合はこちらとみなす

- [ANY-AI-CLI] マーカーは確認・承認の質問にのみ使用する
<!-- /any-ai-cli:approval-rules -->
