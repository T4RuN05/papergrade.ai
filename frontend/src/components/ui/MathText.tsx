"use client";

import React, { useMemo } from "react";
import katex from "katex";

export interface MathTextProps {
  text?: string | null;
  className?: string;
  displayMode?: boolean;
}

interface Token {
  type: "text" | "math";
  value: string;
  display?: boolean;
}

const STOP_WORDS = /^(are|and|if|then|or|where|when|find|evaluate|prove|calculate|show|that|with|for|selection|letter|value|options?|in|of|is)\b/i;

function scanMathExpression(str: string, startIdx: number, initialPrefix: string = "") {
  let idx = startIdx;
  let mathStr = initialPrefix;

  while (idx < str.length) {
    const char = str[idx];

    if (char === "\\") {
      const cmdMatch = str.slice(idx).match(/^(\\[a-zA-Z]+)/);
      if (cmdMatch) {
        mathStr += cmdMatch[1];
        idx += cmdMatch[1].length;

        // Consume arguments: {arg1}{arg2} or [opt]{arg} or ^... or _...
        while (idx < str.length && (str[idx] === "{" || str[idx] === "[" || str[idx] === "^" || str[idx] === "_")) {
          if (str[idx] === "{" || str[idx] === "[") {
            const openC = str[idx];
            const closeC = openC === "{" ? "}" : "]";
            let depth = 0;
            let arg = "";
            while (idx < str.length) {
              const c = str[idx];
              arg += c;
              idx++;
              if (c === openC) depth++;
              else if (c === closeC) {
                depth--;
                if (depth === 0) break;
              }
            }
            mathStr += arg;
          } else if (str[idx] === "^" || str[idx] === "_") {
            mathStr += str[idx];
            idx++;
            if (idx < str.length && str[idx] === "{") {
              let depth = 0;
              let arg = "";
              while (idx < str.length) {
                const c = str[idx];
                arg += c;
                idx++;
                if (c === "{") depth++;
                else if (c === "}") {
                  depth--;
                  if (depth === 0) break;
                }
              }
              mathStr += arg;
            } else if (idx < str.length) {
              mathStr += str[idx];
              idx++;
            }
          }
        }
        continue;
      } else {
        mathStr += str.slice(idx, idx + 2);
        idx += 2;
        continue;
      }
    }

    const remaining = str.slice(idx).trimStart();
    if (STOP_WORDS.test(remaining)) {
      break;
    }

    if ((char === "." || char === "?" || char === "!" || char === ":") && (idx + 1 === str.length || /\s/.test(str[idx + 1]))) {
      break;
    }

    if (char === "," && (idx + 1 === str.length || /\s+[a-zA-Z]/.test(str.slice(idx + 1)))) {
      const afterComma = str.slice(idx + 1).trimStart();
      if (STOP_WORDS.test(afterComma)) {
        break;
      }
    }

    if (char === ")" && idx + 1 < str.length && /\s*(and|or|are|then)\b/i.test(str.slice(idx + 1))) {
      break;
    }

    mathStr += char;
    idx++;
  }

  // Balance unmatched closing parentheses
  let openCount = (mathStr.match(/\(/g) || []).length;
  let closeCount = (mathStr.match(/\)/g) || []).length;
  while (closeCount > openCount && mathStr.endsWith(")")) {
    mathStr = mathStr.slice(0, -1).trimEnd();
    closeCount--;
    idx--;
  }

  return { math: mathStr.trim(), nextIdx: idx };
}

export function parseLatexTokens(str: string): Token[] {
  if (!str) return [];

  // Delimited LaTeX: $, $$, \(, \[
  if (/\$|\\\(|\\\[/.test(str)) {
    const normalized = str
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);

    const tokens: Token[] = [];
    const regex = /(\$\$[\s\S]*?\$\$|\$[^\$]+?\$)/g;
    let lastIdx = 0;
    let m;
    while ((m = regex.exec(normalized)) !== null) {
      if (m.index > lastIdx) {
        tokens.push({ type: "text", value: normalized.slice(lastIdx, m.index) });
      }
      const raw = m[1];
      const isBlock = raw.startsWith("$$");
      tokens.push({
        type: "math",
        value: isBlock ? raw.slice(2, -2) : raw.slice(1, -1),
        display: isBlock,
      });
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < normalized.length) {
      tokens.push({ type: "text", value: normalized.slice(lastIdx) });
    }
    return tokens;
  }

  // Raw un-delimited LaTeX:
  const tokens: Token[] = [];
  let i = 0;

  while (i < str.length) {
    const backslashIdx = str.indexOf("\\", i);
    if (backslashIdx === -1) {
      tokens.push({ type: "text", value: str.slice(i) });
      break;
    }

    if (backslashIdx > i) {
      const textBefore = str.slice(i, backslashIdx);
      const eqPrefixMatch = textBefore.match(/([a-zA-Z0-9_]+\s*=\s*)$/);
      if (eqPrefixMatch && !/\b(if|and|or|then|where|when)\s*=\s*$/i.test(eqPrefixMatch[1])) {
        const prefix = eqPrefixMatch[1];
        const pureText = textBefore.slice(0, -prefix.length);
        if (pureText) tokens.push({ type: "text", value: pureText });
        const mathRes = scanMathExpression(str, backslashIdx, prefix);
        tokens.push({ type: "math", value: mathRes.math, display: false });
        i = mathRes.nextIdx;
        continue;
      } else {
        tokens.push({ type: "text", value: textBefore });
      }
    }

    const mathRes = scanMathExpression(str, backslashIdx, "");
    tokens.push({ type: "math", value: mathRes.math, display: false });
    i = mathRes.nextIdx;
  }

  return tokens;
}

export function hasLatexMath(str?: string | null): boolean {
  if (!str) return false;
  return /\$|\\\(|\\\[|\\(?:frac|sqrt|cos|sin|tan|sec|csc|cot|pi|theta|alpha|beta|gamma|lambda|mu|sigma|omega|Delta|triangle|int|sum|prod|times|div|pm|mp|le|ge|neq|approx|cdot|vec|hat|bar|text|[a-zA-Z]+)/.test(
    str
  );
}

export function MathText({ text, className = "", displayMode = false }: MathTextProps) {
  const content = text ?? "";

  const renderedElements = useMemo(() => {
    if (!content) return null;

    const tokens = parseLatexTokens(content);

    return tokens.map((token, idx) => {
      if (token.type === "text") {
        return <span key={idx}>{token.value}</span>;
      }

      try {
        const html = katex.renderToString(token.value, {
          displayMode: token.display ?? displayMode,
          throwOnError: false,
          output: "htmlAndMathml",
        });

        return (
          <span
            key={idx}
            className="inline-math inline-block align-baseline font-normal px-0.5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch (err) {
        // Fallback to text if rendering fails
        return (
          <span key={idx} className="font-mono text-ink-muted">
            {token.value}
          </span>
        );
      }
    });
  }, [content, displayMode]);

  if (!content) return null;

  return <span className={`math-text-container ${className}`}>{renderedElements}</span>;
}

