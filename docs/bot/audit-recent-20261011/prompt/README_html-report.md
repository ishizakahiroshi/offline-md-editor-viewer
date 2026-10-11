---
type: "Audit Report Contract"
title: "監査HTMLレポートの出力・評価・雛形"
description: "正典3本で共有するHTML出力、数値評価、保存、判断下書きの契約。"
tags: ["audit", "html-report", "scoring", "template"]
status: "stable"
---

# 監査HTMLレポートの出力・評価・雛形

この文書はapp / server / doc-vs-implの共通表示契約である。監査事実・証拠・評価の正本はMarkdown report。HTMLはその同じsnapshotを判断しやすく表示する追加成果物であり、修正・承認・送信を実行する機能ではない。各familyの調査・変更・接続の安全境界は各正典のまま維持する。

監査を実行するAIが、プロンプトの指示とHTML雛形を読み、監査結果を反映したHTMLを直接書き出す。雛形はAIが参照する資料であり、利用者が生成プログラムを実行する手順はない。

## 引数と生成時点

| 引数 | 値 | 省略時・優先規則 |
|---|---|---|
| HTML出力 | あり / なし | あり。なしならHTMLを生成せずMarkdownのみ |
| 点数評価 | 要求時 / あり / なし | 要求時。明示的な採点依頼があるときだけ有効。あり自体も採点依頼に当たる。なしは採点依頼があっても優先し、採点しない |

HTML出力と点数評価は独立する。HTMLありだけでは採点しない。HTMLなしでも点数評価が有効ならMarkdownへ評価を残す。曖昧な評価依頼や根拠不足から点数を作らない。

Markdownは初期準備で骨格を作り、candidate判定・phase終端で逐次更新する。HTMLは最終報告または途中終了の集計確定時に生成し、run ID、revision、dirty有無（serverでは観測時間帯等）、集計日時・timezone、実行状態、結果状態をMarkdownと一致させる。部分完了・失敗でも結果と未確認を隠さない。再生成時と、run後に実行mdで完了・見送りが確定してreportを更新した時は、HTMLも同じsnapshotへ更新するか、HTMLに旧snapshotの日時と未同期を明記する。ブラウザの選択では監査判定・対応状況・検証状態を更新しない。

## 保存・非公開・生成不可

- HTMLはMarkdownと同じ保存先・basenameの `.html`。一方でも同名があれば両方に同じ `_2`、`_3` 等を付け、既存runを上書きせず前回reportをrelatedへ載せる。当該runの逐次更新・再生成だけは同じ組を更新できる。
- Git管理、非公開扱い、公開時の未修正findingの詳細分離、symlink / junction / mountの実体照合はMarkdownと同じ。HTMLや選択の書き出しにも秘密・案件固有情報の公開防止を適用する。
- server上modeではowner repo working tree内のplan / report書込み例外にHTML reportを含めるだけで、許可範囲を広げない。system directory、一時領域、別repoへHTMLを保存せずsudo/rootで書かない。owner repo不在・範囲外・書込み不可ならMarkdownを会話へ逐次出力し、HTMLは未生成と理由を記す。
- その他の書込み不可・雛形取得不可の場合も許可外へfallbackしない。雛形未取得でも下記最小構成を安全に再現できるなら生成して「最小構成仕様から生成（雛形未取得）」と記す。再現できない場合は「HTML: 未生成」と具体的理由をMarkdownと最終報告へ残す。HTMLなしは「指定により生成なし」と区別する。
- 保存したHTMLは監査reportとして扱い、自動archive・自動期限の対象にしない。HTML comment等のmetadata形式は受け手の運用に合わせ、特定toolを必須にしない。

## 数値評価

数値評価が有効な場合、まず対象・評価基準と版・満点（分母）・観点の重み・算出式・未調査の扱いを定義し、Markdownで算出する。評価者と評価日時も記録する。根拠を作れなければ未算定と理由を残す。点数だけで安全や完了を宣言しない。

HTMLは算出済み値を転記し、独自に再採点しない。観点が異なる尺度なら無断で足さず、総合値を算出できた時だけ表示する。点数と満点を併記し、各観点に根拠へのpointerを置く。値は `0 <= value <= maximum`、maximumは正の有限数、バー長は `value / maximum` とする。不整合があれば勝手にclamp・補正せずMarkdownへ戻って訂正する。総合点がなく観点別だけある場合もその旨を表示する。

暫定評価は点数のすぐ横に「暫定／参考評価（heuristic / provisional）」を置く。未評価の観点には空のバーと「未評価」、算定不能には数字を出さず理由を表示する。未調査を満点・0点へ変換しない。採点非要求時は点数パネル全体を省略する。

app / serverの数値評価は参考値。doc-vs-implは資料の整合等の評価対象を明記し、安全性100点に読み替えない。主張検証率・候補検証率・coverageは点数とは別の指標。findingの件数による機械的加減点・点数順の対応優先順位は禁止し、重大度、impact、到達可能性、検証状態を保つ。

## 雛形と最小構成

[共通雛形](../templates/audit-report.html)を読み、構成・配色・判断機能を維持して静的な監査本文と必要なカードを差し替える。[公開デモ](../examples/audit-report.example.html)は全て合成で、実案件の監査・採点ではない。雛形も未生成の見本として読める。新しい生成CLI、build、個人用skill、外部libraryは要しない。CSS/JSはこのrepositoryのMIT Licenseで配布する独自実装で、第三者のtemplate codeは取り込んでいない。

正典本文だけを貼り付けた場合も、各本文に含まれる次の構成で自己完結させる。雛形を読んでいなければ読んだと表記しない。

1. タイトル、対象範囲、run / revision / 集計日時、実行状態、結果状態、未修正／未確認。
2. 全体サマリー: candidate判定内訳の円グラフ（確定 / 却下 / 判断待ち / 重複）と確定findingの重大度別件数。品質問題とsecurity findingを区別。doc-vs-implは利用者impact別にし、claim verdict内訳・主張検証率を別に置く。
3. 採点時だけ評価パネル: 総合値と満点または未算定理由、観点別バー、根拠、未評価、評価metadata。
4. 調査範囲、実行済み／失敗／未実行検証、未調査範囲のカード。未確認の存在は常に見える。
5. 対応判断カード: finding IDと監査判定・対応状況・検証状態、平易な説明、impact、インラインSVG、選択肢ごとのメリット／デメリット、推奨理由、期日、改修の目安（未見積りなら明記）、暫定対策、メモ。判断待ちは確定findingと区別し、まず必要な検証を提案する。
6. 却下候補、残った懸念、証拠pointer。詳細を折り畳んでも未確認件数・未確認範囲は隠さない。印刷時は詳細を展開する。
7. 選択一覧、コピー、Markdown保存、印刷、回答の消去。選択はブラウザ内の下書きであることを明示。

配色は背景 `#f7f3ea`、文字 `#241f1a`、アクセント `#ff7a3d`。太い輪郭・丸いカード・余白を保ち、1ファイルにCSS/JS/インラインSVGを含める。外部font、CDN、通信を要せず、1280px / 768px / 390pxと印刷で本文を読める形にする。

円グラフはcandidate台帳を再集計し分母・単位を明記する。重複も分母に含め、検証済み分子は確定 + 却下。0件の率は未定義（—）であり100%にしない。0件の空の円は安全性の証明ではない。重大度・impact別件数は確定findingだけを再集計する。

## 差し替えるデータ

| 区分 | 必要な内容 |
|---|---|
| snapshot | title、family、run ID（毎runで一意）、report basename、prompt版、対象、revision、集計日時、実行／結果状態、取扱い、Markdownへの相対link |
| facts | candidate台帳のID・判定・種別、確定findingの重大度またはimpact、対応状況・検証状態、claim台帳（該当family）、coverage分子／分母、検証と未確認、evidence pointer |
| rating | 非要求／算出済み／未算定、評価対象、基準と版、総合値と満点（ある場合）、各観点の値／満点または未評価理由、重み、式、未調査の扱い、評価者、評価日時、暫定状態、根拠pointer |
| decisions | finding ID、何を決めるか、選択肢のkey・表示名・メリデメ、推奨keyと理由、期日、改修の目安、暫定対策、図のラベル、証拠pointer。回答・メモは監査factsと別に扱う |

雛形の `data-run-id`、`data-report-stem`、`data-finding-id` とradioの `value` は表示文ではなく識別子。IDはrun内で一意な英数字・ハイフン等にし、finding IDはMarkdownと対応させる。run IDを毎回替え、同じrunの再生成では維持する。削除・変更された選択肢のkeyは再利用しない。

## 下書きと安全な埋込み

- 初期選択は空。推奨案の一括選択は推奨のある未選択だけを埋め、個別回答・メモを上書きしない。既存runの下書きを復元した時はその旨を表示する。
- localStorageキーはrun IDと当該ファイルのpathnameの組。値はfinding IDと選択肢keyで対応させ、読込時は実在するID・keyと文字列メモだけを採用する。回答の消去は当該キーだけを削除し、localStorage全体を消さない。
- localStorageが使えなくても本文・その場の選択・コピー・保存を使える。コピー不可時は出力欄から手動コピーできる。書き出した回答にfinding ID、run ID、revision、集計日時を付け、「下書き・未承認」と明記する。HTML共有ではブラウザ下書きは他人に渡らない。
- JavaScript無効でも本文・点数・SVG・選択肢・証拠を静的HTMLとして読める。JSは下書き・選択出力の補助だけで、監査本文をJSで生成しない。
- 対象由来の文字列はHTML text / attributeの文脈に合わせてescapeする（`& < > " '`）。本文・メモ・SVGラベルを `innerHTML` / `document.write` へ入れない。script本文へ対象dataを直書きせず、図・style・イベントhandlerを対象から取り込まない。JSONを使う場合もscript終端を含む文字を安全にencodeする。
- 証拠linkは生成時に正規化し、本文内の実在anchor、owner保存先内の安全な相対path、明示した `https://` の一次資料だけを許す。`javascript:`、`data:`、`file:`、protocol-relative、制御文字混入、保存先外へ抜けるpathはlink化せず文字として表示する。相対linkの未存在は未取得と明記する。URLを自動fetchしない。
- JSに通信・修正・承認・送信・DB操作を含めない。HTMLの選択や選択の出力を実行指示・実行承認に読み替えない。

## 確認

MarkdownとHTMLのrun / revision / 集計日時、candidate判定・分母、確定件数、点数・満点・未評価を突合する。初期未選択、個別選択、一括選択、保存／復元／消去、コピー／Markdown保存、保存不可、JS無効、0件・暫定・算定不能を合成データで確認する。危険な文字・URL・メモが実行されないことも確認する。描画と印刷を実物で見て、件数だけの静的検査を画面確認の代わりにしない。
