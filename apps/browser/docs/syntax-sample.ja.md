# Markdown 記法サンプル集

一般的な Markdown + GFM 記法のサンプルです。

---

## 1. 見出し

# H1 見出し
## H2 見出し
### H3 見出し
#### H4 見出し
##### H5 見出し
###### H6 見出し

---

## 2. 段落と改行

これは通常の段落です。

これは別段落です。
行末に半角スペース2つを入れると改行されます。
この行は同じ段落の改行後です。

---

## 3. 強調

- **太字**
- *斜体*
- ***太字+斜体***
- ~~取り消し線~~
- `インラインコード`

文章中でも **強調** や *斜体*、~~削除~~ が使えます。

---

## 4. 引用

> これは引用です。
>
> 複数行の引用も可能です。
>> ネストした引用
>>> さらにネスト

---

## 5. リスト

### 5.1 箇条書き（unordered）

- 項目A
- 項目B
  - ネストB-1
  - ネストB-2
- 項目C

### 5.2 番号付き（ordered）

1. 手順1
2. 手順2
3. 手順3

### 5.3 タスクリスト（GFM）

- [x] 完了タスク
- [ ] 未完了タスク
- [ ] レビュー待ち

---

## 6. リンク

- インラインリンク: [offline-md-editor-viewer](https://github.com/ishizakahiroshi/offline-md-editor-viewer/tree/main)
- タイトル付きリンク: [GitHub](https://github.com/ishizakahiroshi/offline-md-editor-viewer/tree/main "offline-md-editor-viewer リポジトリ")
- 自動リンク: <https://github.com/ishizakahiroshi/offline-md-editor-viewer/tree/main>

---

## 7. コード

### 7.1 インライン

`npm run dev` を実行します。

### 7.2 コードブロック

```bash
mkdir demo-project
cd demo-project
```

```js
function greet(name) {
  return `Hello, ${name}!`;
}
console.log(greet("Markdown"));
```

```json
{
  "name": "markdown-sample",
  "version": "1.0.0"
}
```

```diff
- before
+ after
```

---

## 8. 水平線

---

---

## 9. 表（GFM）

| 項目 | 種別 | 説明 |
|---|---|---|
| A | 文字列 | 通常の列 |
| B | 数値 | 123 |
| C | 真偽値 | true |

### 配置指定

| 左寄せ | 中央寄せ | 右寄せ |
|:---|:---:|---:|
| left | center | right |
| aaa | bbb | ccc |

### セル内の装飾

| 記法 | 例 |
|---|---|
| 太字 | **bold** |
| 斜体 | *italic* |
| コード | `code` |
| 改行 | 行1<br>行2 |

---

## 10. エスケープ

\*これは斜体にならない\*
\# これは見出しにならない

---

## 11. HTML併用

<details>
  <summary>クリックで開く（details/summary）</summary>

中身のテキストです。

- 箇条書き
- もう1つ

</details>

<mark>ハイライト（HTMLタグ）</mark>

<sub>sub</sub> / <sup>sup</sup>

---

## 12. 文字種サンプル

- 日本語: こんにちは、Markdown。
- English: Hello, Markdown.
- 記号: !@#$%^&*()_+-={}[]|:;"'<>,.?/
- 絵文字: 😀 🚀 ✅
