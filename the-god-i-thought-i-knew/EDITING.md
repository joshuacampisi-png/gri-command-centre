# Editing the book

The manuscript is a plain Markdown file: `scripts/book-source.md`. Nothing is
locked inside the reader — edit that file, rebuild, and every page, the contents
list and the page numbers regenerate from it.

## The loop

```bash
npm run preview     # rebuild the book + both preview files
```

Then open `.qa/preview-reader.html` in a browser. That is the whole cycle.

Use `npm run build` instead when you are deploying rather than previewing; it
also re-processes the photographs, which is slower and only needed if the images
in `scripts/source-images/` changed.

## What the formatting means

| In the Markdown | What it becomes |
| --- | --- |
| `# Chapter Thirty` then `## The Title` | A new chapter, starting on a fresh page, with a drop cap |
| `# PART FOUR` then `## The Title` | A full-page part divider |
| `---` between paragraphs | A scene break (the three small diamonds) |
| `*words*` | *Italic* |
| `**words**` | **Bold** |
| A whole paragraph wrapped in `*...*` | An indented epigraph with a rule down the side |
| `### A heading` | A small centred sub-heading, used in the Appendix |
| `[[PAGEBREAK]]` | Forces the next content onto a new page |

Blank line between paragraphs. No indentation — the reader adds that.

## Two things to know

**Chapter numbers are spelled out.** `# Chapter Thirty` works because "Thirty"
is in the number list in `scripts/build-content.js`. It currently runs to
Twenty-Nine, so adding a thirtieth chapter means adding one line there.

**Six sentences are load-bearing.** Each photograph is anchored to the end of a
specific sentence so it lands in the right place in the story. If you edit one
of those sentences, the build stops and tells you exactly which:

```
Error: Plate anchor not found: "called Fabrizia."
```

Fix it by updating the matching `after:` line in the `PLATES` list at the top of
`scripts/build-content.js`. The build failing loudly is deliberate: the
alternative is a photograph silently vanishing from the book.

The six anchor sentences end with:

- `called Fabrizia.`
- `the Italian meetings began.`
- `got his Sunday mornings back.`
- `to hear the gospel.`
- `the happiest moment imaginable.`
- `I wished would never end.`

## Adding a photograph

1. Put the image in `scripts/source-images/` as a `.jpg`.
2. Add its filename to `PHOTOS` in `scripts/build-assets.js`.
3. Add an entry to `PLATES` in `scripts/build-content.js` with the filename, the
   `after:` sentence it should follow, and a caption.
4. `npm run build`

## If you would rather not touch the files

Send the edited `book-source.md`, or just describe the changes, and they can be
applied and rebuilt for you.

## After editing

The standalone `.html` files are snapshots. Re-send or re-publish them after a
rebuild, or anyone holding the old file still has the old text.
