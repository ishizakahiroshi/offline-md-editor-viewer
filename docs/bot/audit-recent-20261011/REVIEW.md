---
type: reference
status: draft
tags: [dots, audit, review]
owner: ishizakahiroshi
related: [README.md, FACTS.md, PROGRESS.md]
last_reviewed: 2026-10-11
---

# P-20261011-011 offline-md-editor-viewer：反証と手元評価
> 最終更新: 2026-10-12(月) 08:26:29

READMEの固定対象、範囲、権限に従う。dotsの探索報告を手元Codexが再読し、疑問点を同じ案件へ返す。別担当verifierにはcandidate ID、file/line、入力、想定経路、証拠、許可commandと判定形式を渡し、lead側の評価語は渡さない。

確認するのは新しい差分による影響。ignore規則が既にtrackedなファイルへ効くと誤認しない。広い規則の存在だけで重大とせず、追加対象を実際に失う経路と日常利用/公開物への影響を示す。既存ignoreやforce-add等の反証も調べる。

portfolioの構造、画像path/formatと内容を確認する。画像を取得できなければ未確認と記す。動画IDや秒数はメタデータだけで実際の再生を確認済みとしない。外部動画URLを自動アクセスせず、必要な実再生確認は手元側に残す。

main/developの重複とmerge解決差分を区別する。candidateは確定/却下/判断待ち/重複のいずれかに判定し、7項目のevidence contractを満たすまで確定しない。却下も実行結果または全入口の防御・反証根拠が必要。

レビュー対象source SHA、指示SHA、報告revision、model情報、実行command/exit code、未調査を記録する。報告更新後は旧報告の合格を引き継がず変更された根拠を再確認する。製品修正は行わない。問題詳細は私有会話と手元reportへ保存し、公開看板/Issueには転記しない。
