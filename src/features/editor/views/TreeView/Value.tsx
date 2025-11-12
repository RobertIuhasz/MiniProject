import React, { useState, useRef, useEffect } from "react";
import type { DefaultTheme } from "styled-components";
import { useTheme, styled } from "styled-components";
import { TextRenderer } from "../GraphView/CustomNode/TextRenderer";
import useJson from "../../../../store/useJson";
import useFile from "../../../../store/useFile";

type TextColorFn = {
  theme: DefaultTheme;
  $value?: string | unknown;
};

function getValueColor({ $value, theme }: TextColorFn) {
  if ($value && !Number.isNaN(+$value)) return theme.NODE_COLORS.INTEGER;
  if ($value === "true") return theme.NODE_COLORS.BOOL.TRUE;
  if ($value === "false") return theme.NODE_COLORS.BOOL.FALSE;
  if ($value === "null") return theme.NODE_COLORS.NULL;

  // default
  return theme.NODE_COLORS.NODE_VALUE;
}

interface ValueProps {
  valueAsString: unknown;
  value: unknown;
  // react-json-tree provides the keyPath (keys from current -> root)
  keyPath?: any[];
}

export const Value = (props: ValueProps) => {
  const theme = useTheme();
  const { valueAsString, value, keyPath } = props;
  const setJson = useJson(state => state.setJson);
  const json = useJson(state => state.json);

  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState<string>(() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value ?? "");
    }
  });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const smartParse = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "null") return null;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    // try number
    if (!Number.isNaN(+trimmed) && trimmed !== "") return +trimmed;
    // try JSON objects/arrays/strings
    try {
      return JSON.parse(trimmed);
    } catch {
      // fallback to string
      return raw;
    }
  };

  const setAtPath = (root: any, path: any[], newVal: any) => {
    if (!path || path.length === 0) return newVal;
    const segs = [...path].reverse();
    // clone root to avoid mutating
    const clone = Array.isArray(root) ? root.slice() : { ...root };
    let cur: any = clone;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      const key = typeof seg === "number" || (!Number.isNaN(+seg) && Array.isArray(cur)) ? +seg : seg;
      if (cur[key] === undefined) cur[key] = typeof segs[i + 1] === "number" ? [] : {};
      // shallow copy next level to keep immutability
      cur[key] = Array.isArray(cur[key]) ? cur[key].slice() : { ...cur[key] };
      cur = cur[key];
    }
    const last = segs[segs.length - 1];
    const lastKey = typeof last === "number" ? last : (!Number.isNaN(+last) ? +last : last);
    cur[lastKey] = newVal;
    return clone;
  };

  const handleSave = () => {
    try {
      const parsed = smartParse(input);
      const root = JSON.parse(json);
      // merge when parsed is object to preserve array/object children
      const updated =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? setAtPathMergeReverse(root, keyPath ?? [], parsed)
          : setAtPath(root, keyPath ?? [], parsed);
      const updatedStr = JSON.stringify(updated, null, 2);
      setJson(updatedStr);
      try {
        useFile.getState().setContents({ contents: updatedStr, hasChanges: false, skipUpdate: true });
      } catch (err) {
        console.warn("Failed to update left editor contents after inline save", err);
      }
      setEditing(false);
    } catch (err) {
      // if parse failed for root or similar, try to set whole JSON
      try {
        const rawParsed = JSON.parse(input);
        const rawStr = JSON.stringify(rawParsed, null, 2);
        setJson(rawStr);
        try {
          useFile.getState().setContents({ contents: rawStr, hasChanges: false, skipUpdate: true });
        } catch (err) {
          console.warn("Failed to update left editor contents after inline save", err);
        }
        setEditing(false);
      } catch (e) {
        // leave editing open for user to correct
        // in a future iteration, show validation
        // For now, cancel silently
        console.error("Failed to save value", e);
      }
    }
  };

  // Merge helper for reversed keyPath (react-json-tree supplies keys from current->root)
  const setAtPathMergeReverse = (root: any, path: any[], newVals: any) => {
    if (!path || path.length === 0) {
      if (typeof root === "object" && !Array.isArray(root) && typeof newVals === "object" && !Array.isArray(newVals)) {
        return { ...root, ...newVals };
      }
      return newVals;
    }

    const segs = [...path].reverse();
    const clone = Array.isArray(root) ? root.slice() : { ...root };
    let cur: any = clone;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      const key = typeof seg === "number" || (!Number.isNaN(+seg) && Array.isArray(cur)) ? +seg : seg;
      if (cur[key] === undefined) cur[key] = typeof segs[i + 1] === "number" ? [] : {};
      cur[key] = Array.isArray(cur[key]) ? cur[key].slice() : { ...cur[key] };
      cur = cur[key];
    }
    const last = segs[segs.length - 1];
    const lastKey = typeof last === "number" ? last : (!Number.isNaN(+last) ? +last : last);

    if (cur[lastKey] && typeof cur[lastKey] === "object" && !Array.isArray(cur[lastKey]) && typeof newVals === "object" && !Array.isArray(newVals)) {
      cur[lastKey] = { ...cur[lastKey], ...newVals };
    } else {
      cur[lastKey] = newVals;
    }

    return clone;
  };

  const StyledWrapper = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 6px;

    .edit-btn {
      display: none;
      background: transparent;
      border: none;
      cursor: pointer;
      color: ${theme.NODE_COLORS.NODE_VALUE};
      font-size: 0.85em;
      padding: 2px 4px;
    }

    &:hover .edit-btn {
      display: inline-block;
    }
  `;

  return (
    <StyledWrapper>
      {!editing ? (
        <>
          <span
            style={{
              color: getValueColor({
                theme,
                $value: valueAsString,
              }),
            }}
          >
            <TextRenderer>{JSON.stringify(value)}</TextRenderer>
          </span>
          <button
            aria-label="Edit value"
            className="edit-btn"
            onClick={() => {
              setInput(() => {
                try {
                  return JSON.stringify(value);
                } catch {
                  return String(value ?? "");
                }
              });
              setEditing(true);
            }}
          >
            ✎
          </button>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            aria-label="Edit JSON value"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
            style={{ fontSize: "0.9em", padding: "2px 6px" }}
          />
          <button onClick={handleSave} aria-label="Save" style={{ padding: "2px 6px" }}>
            ✓
          </button>
          <button onClick={() => setEditing(false)} aria-label="Cancel" style={{ padding: "2px 6px" }}>
            ✕
          </button>
        </>
      )}
    </StyledWrapper>
  );
};
