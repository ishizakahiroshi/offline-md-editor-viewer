---
type: task-instructions
status: draft
tags: [dots, audit, recent-commits]
owner: ishizakahiroshi
review_status: draft
related: [FACTS.md, REVIEW.md, PROGRESS.md]
last_reviewed: 2026-10-11
ai_author_agent: codex
ai_author_model_id: unknown
ai_author_model_source: unavailable
---

# P-20261011-011 offline-md-editor-viewer：直近2週間の差分監査
> 最終更新: 2026-10-11(日) 23:41:43

所有者は2026-10-12に、この指示一式の専用branchへのcommit/push、専用Issue作成、dotsへの送信、監査の往復までをYESで承認した。案件が送信された後に以下の固定対象を調査する。

## 目的と対象

ユーザーの依頼は「dots を使い、キャッチボールしながら監査。直近2週間にコミットした部分だけ」。調査までとし、アプリの修正は含まない。

- 作業repo: `ishizakahiroshi/offline-md-editor-viewer`（public）。
- 期間: 2026-09-27 23:41:43 ～ 2026-10-11 23:41:43、Asia/Tokyo。committer日時で選ぶ。
- develop基準: `2a682bea0508b27ee567efd2f54d9c40d65ccd3b` → `9a00bfd208590d9f530893da5d6801567e8d4c1c`。
- main側の対象commit: `3102e9e5dee455dc85644b8c8b2e63a4d0f31e42`、同じ基準commitとの比較。
- 対象ファイル: `.gitignore`、`portfolio.md`、`portfolio/overview-2026-09-28.jpg`。
- 対象外: この期間に変更されていないアプリ、依存、CI全体、未マージDependabot PR。必要な周辺は経路確認のため読取りだけ許す。既存の問題を新しい差分由来の指摘と混同しない。
- マージcommitは両親との比較で解決差分を確認する。main/developに重複する内容を二重に数えない。

## 監査の契約

参照: `prompt/audit_app.md` と `prompt/README_invariants.md`（理由: 長大な正典を未改変のまま同梱し、監査契約の再定義を避ける）。元repoは `ishizakahiroshi/ai-audit-prompts`、固定commitは `2d957dd93dae011cf5d595d8d2b96bef01bf2aa0`、prompt版は2026-10-09。

解決済み引数: DB区分=自動、強度=ハイ、スコープ=調査まで、検証モード=安全なローカル検証、観点=全部、対象=上記commit差分、Git管理=ignore、HTML出力=あり、点数評価=なし、確認=なし。所有者の実行前承認は取得済み。

監査中は正典の禁止事項に従う。GitHubから固定対象を読むことと、この依頼の私有会話へ成果を返すことは所有者が指定した連絡経路。監査中のcommit/push、製品修正、build、依存install、依存一覧を送るscan、URLへの能動アクセス、課金、実DB、release、deployは禁止。

対象はオフラインHTML/Tauri製品だが、今回変更されたruntimeはない。DB/profileの判定は差分に関係する範囲で行い、各profileのselected/skipped/unknownと根拠を記録する。全アプリ監査へ広げない。

可能な検証は、Git差分、`git check-ignore --no-index --stdin -v` の合成path、既存trackedファイルと追加ignore規則の突合、portfolioの構造・画像path・画像形式の確認。既存test等は本文と副作用を確認してから必要なものだけ実行する。外部動画の実再生と掲載サイトの受入は未実施として分ける。画像を読めない場合は未検証と返す。

実行mode、file検索、shell、test、Web一次情報、画像閲覧、独立verifier、file/report作成をyes/no/unknownと根拠で報告する。取得できないexact model IDはunknown/unavailable。読み込んだproject設定、sandbox/network制限の有無も記録する。

手元の実行環境はWindows/PowerShell、filesystemとnetworkは全許可であり、read-only mount、egress allowlist、credential directoryの非mountは技術的に設定されていない。所有者が指定したproject instructionsは読み込み済み。運用上の書込を指示/plan/report/一時検証出力へ限定する。file検索・shell・文書作成・GitHub/Slack読取は実測済み。test/Web一次情報/画像閲覧は利用可能だが本監査ではまだ未実行。dots側の環境は受付までunknown。

## キャッチボール

1. dotsが独自に差分を読み、candidate台帳・coverage・証拠・未確認事項を提出する。verify: SHAと対象ファイルの一致。
2. 手元Codexが各candidateの入力、impact経路、既存防御、反証を再読する。verify: 指摘ごとの根拠と安全な検証結果。
3. 手元Codexが疑問点を同じスレッドでまとめて返す。dotsは新しい根拠または却下理由を提出し、同じ番号で更新する。新しい監査を重複起動しない。
4. 未解決candidateがなくなるか、必要な能力・実機・権限が不足すると確定するまで往復する。verify: 確定/却下/判断待ち/重複の全件判定、件数の台帳一致。

別担当による検証が使えれば担当とmodelを記録する。同一contextの再読を独立検証と表記しない。根拠不足は判断待ちとし、AI間の合意だけで確定しない。

## 保存と提出

- 指示書の予定branch: `dots/audit-recent-20261011`。公開対象はこのフォルダの指示、正典snapshot、手続きの看板だけ。
- 手元plan予定: `docs/local/plan_audit_app_recent-20261011.md`。
- 手元report予定: `docs/obsidian/report_audit_app_recent-commits_2026-10-11.md` と同名HTML。どちらも既存のGit管理外entryから保存する。
- dots側ではplanを`docs/local/`、reportを`docs/obsidian/`のignoredな一時成果として作る。entryがない環境では実行前に保存可否を報告し、手元のVaultを推測しない。保存不能なら正典どおり私有会話へMarkdownを返し、HTML未生成の理由を示す。
- 未修正finding/PoC/秘密/私有会話locatorを公開branchやIssueに載せない。私有会話で根拠を渡し、手元担当が正式reportへ記録する。長い成果の受渡し経路が必要なら先に相談する。
- 専用GitHub Issueは公開指示後・送信前に作成し、そのURLをこの指示と看板へ追記する。Issueには送信/受付/提出/手元評価という手続きと、非公開詳細がある旨だけを記録する。
- 受付では番号衝突、読んだ最終指示SHA、対象SHA、環境能力、成果保存可否を返す。
- 返信は案件スレッド内だけ。毎回1行目は `#P-20261011-011 offline-md-editor-viewer：報告内容`。
- 最終提出はfinding件数、candidate判定全件、evidence contractの7項目、最小対処案と副作用、実行command/exit code、未実施・判断待ち、coverage、rubric、AI metadataを含める。

## 権限と終了境界

承認後の提出工程だけ、手元担当が指定指示branchの文書commit/push、専用Issue作成・手続き記録、dotsへの送信を行う。dotsが看板を更新する必要がある場合も指定branchのこのフォルダに限る。

main/develop直push、製品source/設定/画像の修正、別PR、merge、tag、build、release、deployは含まない。修正案と適用済み修正を混同しない。手元Windows/UI/動画再生は未検証ならそのまま残す。読取不能、許可範囲外の操作が必要、同じ障害が解消しない場合は不足証拠と次の一手を返す。
