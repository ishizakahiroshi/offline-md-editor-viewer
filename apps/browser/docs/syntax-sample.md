# Markdown Syntax Samples

A reference for common Markdown + GFM syntax.

---

## 1. Headings

# H1 Heading
## H2 Heading
### H3 Heading
#### H4 Heading
##### H5 Heading
###### H6 Heading

---

## 2. Paragraphs and Line Breaks

This is a normal paragraph.

This is another paragraph.
Add two trailing spaces to force a line break within a paragraph.
This line follows the break above.

---

## 3. Emphasis

- **Bold**
- *Italic*
- ***Bold + Italic***
- ~~Strikethrough~~
- `Inline code`

You can also use **bold**, *italic*, and ~~strikethrough~~ inline.

---

## 4. Blockquotes

> This is a blockquote.
>
> It can span multiple lines.
>> Nested blockquote
>>> Deeper nesting

---

## 5. Lists

### 5.1 Unordered

- Item A
- Item B
  - Nested B-1
  - Nested B-2
- Item C

### 5.2 Ordered

1. Step 1
2. Step 2
3. Step 3

### 5.3 Task List (GFM)

- [x] Done
- [ ] Pending
- [ ] Awaiting review

---

## 6. Links

- Inline link: [offline-md-editor-viewer](https://github.com/ishizakahiroshi/offline-md-editor-viewer/tree/main)
- Link with title: [GitHub](https://github.com/ishizakahiroshi/offline-md-editor-viewer/tree/main "offline-md-editor-viewer repository")
- Auto link: <https://github.com/ishizakahiroshi/offline-md-editor-viewer/tree/main>

---

## 7. Code

### 7.1 Inline

Run `npm run dev` to start the dev server.

### 7.2 Code Blocks

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

## 8. Horizontal Rules

---

---

## 9. Tables (GFM)

| Item | Type | Description |
|---|---|---|
| A | string | Normal column |
| B | number | 123 |
| C | boolean | true |

### Alignment

| Left | Center | Right |
|:---|:---:|---:|
| left | center | right |
| aaa | bbb | ccc |

### Inline Formatting in Cells

| Syntax | Example |
|---|---|
| Bold | **bold** |
| Italic | *italic* |
| Code | `code` |
| Line break | line1<br>line2 |

---

## 10. Escaping

\*This is not italic\*
\# This is not a heading

---

## 11. Inline HTML

<details>
  <summary>Click to expand (details/summary)</summary>

Content inside the details block.

- List item
- Another item

</details>

<mark>Highlighted text (HTML tag)</mark>

<sub>sub</sub> / <sup>sup</sup>

---

## 12. Character Samples

- Japanese: こんにちは、Markdown。
- English: Hello, Markdown.
- Symbols: !@#$%^&*()_+-={}[]|:;"'<>,.?/
- Emoji: 😀 🚀 ✅
