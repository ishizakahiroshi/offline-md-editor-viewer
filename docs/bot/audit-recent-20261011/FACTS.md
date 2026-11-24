---
type: reference
status: draft
tags: [dots, audit]
owner: ishizakahiroshi
related: [README.md, REVIEW.md, PROGRESS.md]
last_reviewed: 2026-10-11
---

# P-20261011-011 offline-md-editor-viewer：固定対象の事実
> 最終更新: 2026-10-12(月) 08:26:29

確認日: 2026-10-11。以下は監査の所見ではなく、依頼準備時の対象情報。

| branch | commit | committer日時（JST） | 内容 |
|---|---|---|---|
| develop | `81603566aa3e9dde96bccfc156007a195ac1ef1e` | 2026-09-28 01:18:43 | portfolio動画情報とJPG、親は基準commit |
| develop | `24b6d9b6d1357fb3be1f6ce1ee33370758000c12` | 2026-09-28 13:21:05 | ignore規則追記、親は基準commit |
| develop | `9a00bfd208590d9f530893da5d6801567e8d4c1c` | 2026-09-28 13:26:39 | 上記二つのmerge |
| main | `3102e9e5dee455dc85644b8c8b2e63a4d0f31e42` | 2026-09-28 01:18:39 | portfolio情報/JPGとignore、親は基準commit |

基準commit: `2a682bea0508b27ee567efd2f54d9c40d65ccd3b`。
根拠: 両branchのGitHub commits API、ローカル`git log --all`、各commitの親と差分。

developの合成差分は3ファイル、text 55行追加、削除0行。`.gitignore`は48行追加、`portfolio.md`は7行追加、JPGは106634 bytes。mainはGitHub commit APIで同じ3対象ファイルを確認済みで、main固有のignore差分は監査で比較する。

準備開始時の手元はdevelop、HEADは固定対象develop SHA、worktreeはclean。GitHubの公開repo確認済み。対象期間のアプリ本体/lockfile/workflow変更は対象一覧にない。未マージDependabot PRをコミット済み差分へ混ぜない。

`docs/local`と`docs/obsidian`は既存のjunctionであり、両entryは`.gitignore`で除外されている。公開する指示に私有の実体pathは含めない。

2026-10-11準備時点では指示公開、専用Issue、送信、本文read-back、dots受付、監査結果はなかった。2026-10-12に所有者のYESを取得し、初回指示commit 20727eb3c257be6ca71ec7315da57874804d9ff0と専用Issue #19を公開した。送信以降の状態はIssueコメントで追う。準備時の取得情報を監査済みと扱わない。

`docsweep provenance check --path docs/bot/audit-recent-20261011/README.md --json`は「AI provenanceは無効」の応答だった。実効状態を未有効として記録し、設定を変更していない。作成AIはCodex、exact model IDは取得できずunknown/unavailable。
