/**
 * Markdown renderer — safe by construction.
 *
 * This renderer NEVER interprets raw HTML. It tokenizes a known subset of
 * Markdown syntax and emits React elements directly. There is no
 * `dangerouslySetInnerHTML` anywhere in this file, so a crafted `body_md`
 * containing `<script>`, `<img onerror=…>`, or an HTML payload renders as
 * inert literal text. Link `href`s are scheme-checked — only http(s) and
 * mailto/relative URLs are allowed; `javascript:` and `data:` are dropped.
 *
 * This satisfies the cycle-3 hard XSS requirement for `articles.body_md`
 * rendered on `/insights/:slug` (contract.md FLAGGED section).
 *
 * Supported: ATX headings, paragraphs, blockquotes, unordered + ordered
 * lists, GFM pipe tables, horizontal rules, and inline bold / italic /
 * code / links.
 */

import type { ReactNode } from "react";
import { cx, textColor } from "./utils";

// ─────────────── inline tokenizer ───────────────

// Only allow safe link schemes. Anything else (javascript:, data:, vbscript:)
// is rejected and the link renders as plain text.
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(url)) return url;
  // protocol-relative is fine
  if (url.startsWith("//")) return `https:${url}`;
  // a bare path with no scheme is treated as relative
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return null;
}

/** Render inline markdown (bold, italic, code, links) within a text run. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;
  // ordered so longer markers match first (** before *)
  const patterns: Array<{ re: RegExp; build: (m: RegExpMatchArray, k: string) => ReactNode }> = [
    {
      re: /^\*\*([^*]+)\*\*/,
      build: (m, k) => <strong key={k}>{renderInline(m[1]!, k)}</strong>,
    },
    {
      re: /^`([^`]+)`/,
      build: (m, k) => (
        <code
          key={k}
          className={cx(
            "rounded-none border px-1.5 py-0.5 font-mono text-mono-sm",
            "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
          )}
        >
          {m[1]}
        </code>
      ),
    },
    {
      re: /^\[([^\]]+)\]\(([^)]+)\)/,
      build: (m, k) => {
        const href = safeHref(m[2]!);
        if (!href) return <span key={k}>{m[1]}</span>;
        return (
          <a
            key={k}
            href={href}
            className={cx("underline", textColor.accent)}
            {...(/^https?:/i.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {m[1]}
          </a>
        );
      },
    },
    {
      re: /^([*_])([^*_]+)\1/,
      build: (m, k) => <em key={k}>{renderInline(m[2]!, k)}</em>,
    },
  ];

  let buffer = "";
  function flushBuffer() {
    if (buffer) {
      out.push(buffer);
      buffer = "";
    }
  }

  while (rest.length > 0) {
    let matched = false;
    for (const p of patterns) {
      const m = rest.match(p.re);
      if (m) {
        flushBuffer();
        out.push(p.build(m, `${keyPrefix}-i${i++}`));
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      buffer += rest[0];
      rest = rest.slice(1);
    }
  }
  flushBuffer();
  return out;
}

// ─────────────── block parser ───────────────

interface MarkdownProps {
  /** The raw markdown source. */
  source: string;
}

/**
 * Render a markdown string as React elements. Safe by construction — see the
 * file header. Used by the article detail page.
 */
export function Markdown({ source }: MarkdownProps) {
  const lines = (source ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let key = 0;
  let i = 0;

  function pushKey(): string {
    return `md-${key++}`;
  }

  while (i < lines.length) {
    const line = lines[i]!;

    // blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // horizontal rule — a line of 3+ dashes, asterisks, or underscores
    if (
      /^\s*(-\s*){3,}$/.test(line) ||
      /^\s*(\*\s*){3,}$/.test(line) ||
      /^\s*(_\s*){3,}$/.test(line)
    ) {
      blocks.push(
        <hr key={pushKey()} className="my-8 h-px border-0 bg-[color:var(--color-border-subtle)]" />,
      );
      i++;
      continue;
    }

    // ATX heading
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!;
      const k = pushKey();
      const cls: Record<number, string> = {
        1: "mt-10 mb-4 font-display text-display-lg font-semibold tracking-tight",
        2: "mt-9 mb-3 font-display text-display-md font-semibold tracking-tight",
        3: "mt-7 mb-2 font-display text-display-sm font-semibold",
        4: "mt-6 mb-2 font-display text-body-lg font-semibold",
      };
      const content = renderInline(text, k);
      const className = cx(cls[level], textColor.strong);
      if (level === 1)
        blocks.push(
          <h2 key={k} className={className}>
            {content}
          </h2>,
        );
      else if (level === 2)
        blocks.push(
          <h3 key={k} className={className}>
            {content}
          </h3>,
        );
      else if (level === 3)
        blocks.push(
          <h4 key={k} className={className}>
            {content}
          </h4>,
        );
      else
        blocks.push(
          <h5 key={k} className={className}>
            {content}
          </h5>,
        );
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) {
        quoteLines.push(lines[i]!.replace(/^\s*>\s?/, ""));
        i++;
      }
      const k = pushKey();
      blocks.push(
        <blockquote
          key={k}
          className={cx(
            "my-6 border-l-2 pl-4 italic",
            "border-[color:var(--color-border-accent)]",
            textColor.muted,
          )}
        >
          {renderInline(quoteLines.join(" "), k)}
        </blockquote>,
      );
      continue;
    }

    // GFM pipe table — header row, separator row, then body rows
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]!) &&
      lines[i + 1]!.includes("-")
    ) {
      const splitRow = (row: string): string[] =>
        row
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((cell) => cell.trim());
      const headers = splitRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") {
        rows.push(splitRow(lines[i]!));
        i++;
      }
      const k = pushKey();
      blocks.push(
        <div
          key={k}
          className="my-6 overflow-x-auto rounded-xl border border-[color:var(--color-border-subtle)]"
        >
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-border-subtle)]">
                {headers.map((h, hi) => (
                  <th
                    // biome-ignore lint/suspicious/noArrayIndexKey: markdown table cells are positional — index is the stable identity
                    key={`${k}-h${hi}`}
                    scope="col"
                    className={cx(
                      "data-mono px-4 py-3 text-left font-mono text-mono-xs uppercase",
                      textColor.muted,
                    )}
                  >
                    {renderInline(h, `${k}-h${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: markdown table rows are positional — index is the stable identity
                  key={`${k}-r${ri}`}
                  className="border-b border-[color:var(--color-border-subtle)] last:border-b-0"
                >
                  {r.map((cell, ci) => (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: markdown table cells are positional — index is the stable identity
                      key={`${k}-r${ri}c${ci}`}
                      className={cx("px-4 py-3 text-body-sm", textColor.default)}
                    >
                      {renderInline(cell, `${k}-r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      const k = pushKey();
      blocks.push(
        <ul key={k} className={cx("my-4 ml-5 flex list-disc flex-col gap-1.5", textColor.default)}>
          {items.map((it, ii) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: markdown list items are positional — index is the stable identity
              key={`${k}-l${ii}`}
              className="text-body-md"
            >
              {renderInline(it, `${k}-l${ii}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      const k = pushKey();
      blocks.push(
        <ol
          key={k}
          className={cx("my-4 ml-5 flex list-decimal flex-col gap-1.5", textColor.default)}
        >
          {items.map((it, ii) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: markdown list items are positional — index is the stable identity
              key={`${k}-l${ii}`}
              className="text-body-md"
            >
              {renderInline(it, `${k}-l${ii}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // paragraph — accumulate consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !/^(#{1,4})\s+/.test(lines[i]!) &&
      !/^\s*>\s?/.test(lines[i]!) &&
      !/^\s*[-*]\s+/.test(lines[i]!) &&
      !/^\s*\d+\.\s+/.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    const k = pushKey();
    blocks.push(
      <p key={k} className={cx("my-4 text-body-md leading-relaxed", textColor.default)}>
        {renderInline(paraLines.join(" "), k)}
      </p>,
    );
  }

  return <div className="text-body-md">{blocks}</div>;
}
