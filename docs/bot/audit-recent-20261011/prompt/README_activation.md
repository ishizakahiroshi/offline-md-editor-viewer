---
type: "Audit Routing Policy"
title: "共通監査prompt起動ルール"
description: "監査対象をapp・server・doc-vs-implへ分類し、tool非依存の正典3本から選ぶrouting policy。"
tags: ["audit", "routing", "selection", "capability-based"]
status: "stable"
---

# 共通監査prompt起動ルール

このbundleの監査promptは重い監査用である。通常の質問、軽い調査、code説明、単発修正では自動起動しない。

各projectのinstructionsには、通常作業でこのrepoを常時読ませる指示を置かない。利用者がこの監査prompt集を明示して監査実行を依頼した場合だけ、この文書から対象正典を選ぶ。

## 起動しない例

- 「セキュリティ的にどう?」「このcode見て」「軽く確認して」
- 「このfunctionを説明して」「依存関係を見て」「このbugを直して」
- 「監査promptはどこ?」「このrepoに何がある?」

これらは通常依頼として必要範囲だけ扱う。

## 1. 監査対象を選ぶ

実行tool、provider、model、CLI/Web UIではなく、何を監査するかで正典を選ぶ。

| 対象 | 正典 | 判定 |
|---|---|---|
| app / repository / source code | [`audit_app.md`](audit_app.md) | code、設定、test、workflow、package、アプリ構成を監査する。判定不能時の既定 |
| managed server / VPS / host | [`audit_server.md`](audit_server.md) | 利用者が所有・運用し、OS全体を調査する権限を持つLinux / Unix系の稼働serverを完全read-only診断する。Windows Serverは現版の対象外 |
| document vs implementation | [`audit_doc_vs_impl.md`](audit_doc_vs_impl.md) | 指定資料の主張と現行実装を完全非変更で突合する。資料指定必須 |

### server判定

「server/VPS/hostの脆弱性」「SSHできる管理下server」「hardening」「firewall/sshd/OS設定」等の依頼はserverとする。

- root loginの有無ではなく、sudo等でOS全体を調査する正当な管理権限と所有/運用責任があるかで判定する。
- 共用hostingはserver診断対象外。自分の領域のWordPress/custom code等はapp監査として扱う。
- URLだけの外部siteは対象外。第三者siteへのactive scan/DASTはこのbundleでは行わない。
- server診断はreport ownerとなるprivate repo、接続先、接続承認が揃うまで実接続しない。
- Windows Server hostは現版の対象外。依頼があれば未対応と伝え、cmdletを推測で選ばない。

### doc-vs-impl判定

「この資料と実装の差異」「説明会資料/マニュアル/仕様書と現行仕様を突合」「画面資料が実装どおりか」等はdoc-vs-implとする。資料path/URLが無ければ1回だけ確認し、推測で選ばない。DB区分は判定しない。`正典` が未指定でも現行正典の特定は正典prompt側の契約で行い、進行中のchange/proposal文書や自動生成のAI向け派生文書を正典に選ばない。

### app判定

repository/source codeを対象にsecurity、vulnerability、bug、dependency、maintainabilityを調べる依頼はappとする。app正典はDB区分とsecurity profileを内部で解決する。

## 2. tool/modelではなくcapabilityを記録する

正典を選んだ後、prompt内で実際に利用できる能力を `yes / no / unknown` と根拠付きで記録する。少なくともfile検索、shell/read-only command、test系、Web一次情報、visual inspection（資料・UI。doc-vs-impl正典のみ）、並列agent、独立verifier、file編集、plan/report作成を確認する。あわせて監査agent自身の実行mode（read-only等の制約mode、sandbox、network制限の有無）を記録し、全許可modeで動いた場合はその旨を明記する。

- 並列/独立verifierがあれば探索と検証を分離できる。
- 並列だけならlead探索へ限定し、統合担当が再読する。
- 並列がなければ直列二巡で反証する。
- 能力が不明/不足でも正典を変えず、未検証を明示する。

製品名やmodel名からsubagent、shell、Web、file write等の能力を推測しない。新しいprovider/modelのために正典promptを追加しない。

### 起動側の前提

prompt文の禁止は技術的な強制ではない。起動環境は正典promptから強制できないため、この節は起動側への推奨として、推奨実行環境と対象repoの設定を信頼しない起動を定める。

#### 推奨実行環境

確認の有無にかかわらず、起動側は監査agentを次の環境で動かすことを既定にする。

- 対象（repo / 資料）は読取専用でmountするか、読取専用のpermission modeで開く。書込はplan / reportの保存先、一時directory、Git管理 = ignoreのときのowner repositoryの `.git/info/exclude`、appのscope「調査・修正まで / フルループ」のときの対象working treeだけに限る。
- network egressは監査に必要な宛先（server診断の接続先host、Web一次情報のofficial source、dependency scanが使うpackage registry、doc-vs-implで利用者が指定した資料URL / docs platformと、read-only閲覧する稼働instance）のallowlistに限り、それ以外を遮断する。server診断では対象server上から外向きrequestを行わないため、サーバー上modeではWeb一次情報をnoとして記録し、pinned baselineを未再確認として使う。
- 監査対象外のcredential directory / file（home配下の~/.ssh、~/.aws、~/.config、~/.npmrc等）をagentのfilesystemへmountしない。対象repo内の.env等は監査対象dataとして読取専用で扱い、値は出力しない。server診断では、ssh-agent socket等を使い、鍵本体をagentから読めない形で渡す。ssh configurationとknown_hostsは読取専用で渡してよい。credential directoryをmountしない場合でも、接続に指定した鍵の公開鍵（.pub）だけは読取専用で渡す（IdentitiesOnly=yesでagent内の鍵を選ぶために要る）。
- 実行環境にsandbox / read-only / network制限の機能があれば有効にする。無い場合はその旨をinventoryへ記録する。
- 実際の実行modeと上記との差分は、選んだ正典の実行前確認で提示し、承認の対象にする。

#### 対象repoの設定を信頼しない

監査agentは、対象repoが供給するagent / IDE設定（instruction file、hook、MCP server定義、permission / auto-approve設定、env / helper command、editor task、skill定義）をpromptより先に読み込み得る。promptの「権限拡大に使わない」は読み込み済みの設定を取り消せない。対象repoが起動側の管理下でない、または改変を疑う場合は、対象repoの設定を読み込まない起動を選ぶ（folder / workspace trustを与えない、harnessがproject設定の読込を切れるならそれを使う、設定fileを除いた読取専用copyで起動する、のいずれか）。非対話（one-shot / SDK / CI）実行ではtrust確認を出さないharnessがあるため、読み込まない起動を既定にする。inventoryへ「対象repoのagent設定の読込: 読み込んだ / 読み込まなかった / 不明」を記録し、読み込んだ場合はその設定file一覧を監査対象dataとして列挙する。

対話modeでも対象repoを初めて開くときはtrust確認を承認せず、project hook / project MCP / editor taskを無効化した制限modeで起動する。

## 3. appのDB区分とprofile

DB区分はfile選択ではなく `audit_app.md` の引数として渡す。

| user指定/状況 | `DB区分` |
|---|---|
| 明示的にDBあり | `あり` |
| 明示的にDBなし | `なし` |
| 未指定 | `自動` |

自動時はpromptがmanifest、dependency/lock、schema、migration、ORM/SQL、DB driver、接続設定を軽く確認し、`あり / なし / unknown` と根拠をreportへ残す。判定不能でも本番接続やmigrationを試さない。

appはWeb/API、AI/agent/MCP/RAG、native、desktop、mobile、browser extension、CLI、library/package、CI/CD/supply chain、cloud/IaC/Kubernetes、DBあり/なしを複数profileとして `selected / skipped / unknown + evidence` で選ぶ。全profileを無条件実行しない。

## 引数

### 3 family共通の出力引数

| 引数 | 値 | 省略時 |
|---|---|---|
| HTML出力 | あり / なし | あり。なしならMarkdownのみ |
| 点数評価 | 要求時 / あり / なし | 要求時。明示採点依頼時のみ。あり自体も明示要求、なしは採点依頼より優先 |

HTMLと点数は独立する。共通契約・雛形・最小構成は [`README_html-report.md`](README_html-report.md)。安全境界と実行前gateは各familyのまま維持する。

### app

| 引数 | 値 | 省略時 |
|---|---|---|
| DB区分 | 自動 / あり / なし | 自動 |
| 強度 | ロー / ミッド / ハイ | ハイ |
| スコープ | 調査まで / 調査・修正まで / フルループ | 調査まで |
| 検証モード | 静的 / 安全なローカル検証 / build含む | 安全なローカル検証 |
| 観点 | バグ / セキュリティ・脆弱性 / 依存関係 / 全部 / profile名 | 全部 |
| 対象 | repo相対path | repo全体 |
| 除外 | repo相対path（finding対象・変更・検証から除く。経路追跡のread-only参照は既定で許し、「（読取り禁止）」を添えた場合だけ読取りも除く） | なし |
| 保存先 | repo相対path | docs/ai-audit-prompts |
| Git管理 | ignore / track | ignore = `.git/info/exclude` へ保存先pathを追記（tracked file非変更）、track = untrackedのまま残しadd / commitは人間。未存在folder作成前に確認 |
| 確認 | あり / なし | あり |

### server

`接続方法`、`接続先`、`強度`、`観点`（server正典の18観点の番号または名称で複数指定）、`対象`、`除外`、`保存先`、`Git管理`、`確認` を使う。変更scopeはなく、常に完全read-only。

### doc-vs-impl

`資料`（必須）、`正典`、`実装基準`、`媒体`、`強度`、`対象`、`除外`、`保存先`、`Git管理`、`確認` を使う。資料/source/UIは常に非変更。

明示された値を優先し、選んだ正典の空欄へ渡す。確認「あり」ではprompt記載の実行前gateを行う。確認「なし」でも未存在保存先のGit管理やfallbackが未解決なら開始しない。確認「なし」の非対話/CI実行では実行前gateが働かないため、「起動側の前提」節の推奨実行環境を必須とする。issue/PR本文等の外部入力を検証せずそのままpromptへ連結しない。

## 成果物routing

- plan: target/owner repoの `docs/local/plan_audit_<topic>.md`
- report既定: `docs/ai-audit-prompts/report_audit_<topic>_<YYYY-MM-DD>.md`
- HTML既定: 同じ保存先・basenameの `.html`。最終報告／途中終了の集計確定時に生成し、snapshotを揃える。HTMLなしなら生成しない。保存不可は未生成と理由を残し、許可外へfallbackしない
- `<topic>` の定義は [`README_naming.md`](README_naming.md) の「成果物命名」に従う
- server reportもpublic prompt repoではなくowner private repoへ保存する
- `保存先=` があればreportだけ指定repo相対pathへ変更する
- 対象repoがpublicまたは公開状態が不明な場合、reportのGit管理はignoreを提案し、trackは未修正findingの公開を提示した明示承認時だけ
- 保存先がsymlink / junction / mountの場合は実体pathと書込可否を確認し、無断で別pathへfallbackしない

reportのmetadataは、監査report種別と状態（`draft` / `stable`）が分かる形にし、監査reportを自動archive・自動期限の対象にしない。key名と形式は受け手の文書運用に合わせてよい（例: docsweepなら `type: audit-report`、`status: draft|stable`、`docsweep_policy: never_archive`）。監査事実/evidenceの正本はreport、未対応作業の実行正本はrelated先の実行md（plan / bugfix / issue tracker等）とする。

## deprecated alias

統合前のtool × DB/target 14 pathは移行案内として1回のreleaseだけ残すが、自動選択・推奨一覧・正典prompt数へ含めない。aliasはpaste-ready promptではなく、必ず後継3本の全文を使う。

alias削除はrepo内外consumer移行後の別planで行う。新規workで旧pathを選ばない。

## 任意の起動adapter

runtime固有の起動commandやcapability取得補助は、必要ならrepo外adapterで扱う。adapterは正典pathと引数を渡すだけとし、安全境界、監査観点、evidence、summary、rubricを複製しない。adapterが無くても正典3本は単独で完走できる。

## OKF progressive disclosure

OKF Bundleとしては [`index.md`](index.md) → このrouting → 選んだ正典prompt → app/serverのinvariants、の順に読む。通常Markdownとして正典を直接使っても実行契約は変わらない。
