import React, { useState, useMemo } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setJson = useJson(state => state.setJson);
  // use getter when saving to avoid stale closure
  const getJson = useJson.getState().getJson ?? (() => useJson.getState().json);
  const setGraph = useGraph.getState().setGraph;
  const setSelectedNode = useGraph.getState().setSelectedNode;
  const [editing, setEditing] = useState(false);
  const [textValue, setTextValue] = useState<string>("{}");
  const [fields, setFields] = useState<Array<{ key: string | null; value: any; type: string }>>([]);

  // build initial editable fields from nodeData when opening edit mode
  React.useEffect(() => {
    if (!editing) return;
    // build fields array - separate scalar fields for editing
    const rows = nodeData?.text ?? [];
    // If single unnamed value (leaf), present as a single field with null key
    if (rows.length === 1 && !rows[0].key) {
      setFields([{ key: null, value: rows[0].value, type: rows[0].type }]);
      setTextValue(String(rows[0].value ?? ""));
      return;
    }

    const scalarFields = rows.filter(r => r.key && r.type !== "array" && r.type !== "object");
    setFields(scalarFields.map(r => ({ key: r.key as string, value: r.value, type: r.type })));
    setTextValue(normalizeNodeData(rows));
  }, [editing, nodeData]);

  // ensure editing cancels when modal closed externally
  const handleClose = () => {
    setEditing(false);
    setFields([]);
    onClose?.();
  };

  return (
    <Modal size="auto" opened={opened} onClose={handleClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
            <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex gap="xs" align="center">
              {!editing && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    // initialize fields on edit
                    const rows = nodeData?.text ?? [];
                    if (rows.length === 1 && !rows[0].key) {
                      setFields([{ key: null, value: rows[0].value, type: rows[0].type }]);
                    } else {
                      const scalarFields = rows.filter(r => r.key && r.type !== "array" && r.type !== "object");
                      setFields(scalarFields.map(r => ({ key: r.key as string, value: r.value, type: r.type })));
                    }
                    setEditing(true);
                  }}
                >
                  Edit
                </Button>
              )}
              <CloseButton onClick={handleClose} />
            </Flex>
          </Flex>
          {!editing ? (
            <ScrollArea.Autosize mah={250} maw={600}>
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            </ScrollArea.Autosize>
          ) : (
            <Stack spacing="xs">
              {fields.map((f, idx) => (
                <Flex key={String(f.key) + idx} direction="column" gap="xs">
                  <Text fz="xs" fw={600}>
                    {f.key ?? "value"}
                  </Text>
                  <input
                    value={f.value ?? ""}
                    onChange={e => {
                      const next = [...fields];
                      next[idx] = { ...next[idx], value: e.currentTarget.value };
                      setFields(next);
                    }}
                    style={{ fontFamily: "monospace", padding: "6px", borderRadius: 4, border: "1px solid #ccc" }}
                  />
                </Flex>
              ))}
            </Stack>
          )}
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>

        {editing && (
          <Flex gap="sm" justify="flex-end">
            <Button
              size="xs"
              onClick={() => {
                // build parsed result from fields when editing with separated attributes
                const parseValue = (raw: string) => {
                  const t = String(raw ?? "").trim();
                  if (t === "") return null;
                  try {
                    return JSON.parse(t);
                  } catch {
                    if (t === "null") return null;
                    if (t === "true") return true;
                    if (t === "false") return false;
                    if (!Number.isNaN(+t)) return +t;
                    return t;
                  }
                };

                let parsed: any;
                if (fields.length > 0) {
                  // single unnamed value
                  if (fields.length === 1 && fields[0].key === null) {
                    parsed = parseValue(fields[0].value);
                  } else {
                    parsed = {} as Record<string, any>;
                    fields.forEach(f => {
                      if (f.key) parsed[f.key] = parseValue(f.value);
                    });
                  }
                } else {
                  // fallback to raw textarea style parsing
                  const t = textValue?.trim() ?? "";
                  try {
                    parsed = t === "" ? null : JSON.parse(t);
                  } catch {
                    if (t === "null") parsed = null;
                    else if (t === "true") parsed = true;
                    else if (t === "false") parsed = false;
                    else if (!Number.isNaN(+t)) parsed = +t;
                    else parsed = t;
                  }
                }

                try {
                  const rootJson = getJson();
                  const root = typeof rootJson === "string" ? JSON.parse(rootJson) : rootJson;
                  const updated = parsed && typeof parsed === "object" && !Array.isArray(parsed)
                    ? setAtPathMerge(root, nodeData?.path ?? [], parsed)
                    : setAtPath(root, nodeData?.path ?? [], parsed);
                  const updatedStr = JSON.stringify(updated, null, 2);
                  setJson(updatedStr);
                  try {
                    useFile.getState().setContents({ contents: updatedStr, hasChanges: false, skipUpdate: true });
                  } catch (err) {
                    console.warn("Failed to update left editor contents after save", err);
                  }
                  if (setGraph) setGraph(updatedStr);
                  try {
                    const nodes = useGraph.getState().nodes;
                    const findByPath = (p: any) => nodes.find(n => JSON.stringify(n.path ?? []) === JSON.stringify(p ?? []));
                    const newNode = findByPath(nodeData?.path ?? []);
                    if (newNode && setSelectedNode) setSelectedNode(newNode);
                  } catch (err) {
                    console.warn("Failed to re-select node after save", err);
                  }
                  setEditing(false);
                  setFields([]);
                } catch (err) {
                  console.error("Failed to save node edit", err);
                }
              }}
            >
              Save
            </Button>
            <Button size="xs" variant="outline" onClick={() => { setEditing(false); setFields([]); }}>
              Cancel
            </Button>
          </Flex>
        )}
      </Stack>
    </Modal>
  );
};

// helper to set value at a JSON path (path is in root->child order)
function setAtPath(root: any, path: any[], newVal: any) {
  if (!path || path.length === 0) return newVal;
  const clone = Array.isArray(root) ? root.slice() : { ...root };
  let cur: any = clone;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const key = typeof seg === "number" || (!Number.isNaN(+seg) && Array.isArray(cur)) ? +seg : seg;
    if (cur[key] === undefined) cur[key] = typeof path[i + 1] === "number" ? [] : {};
    cur[key] = Array.isArray(cur[key]) ? cur[key].slice() : { ...cur[key] };
    cur = cur[key];
  }
  const last = path[path.length - 1];
  const lastKey = typeof last === "number" ? last : (!Number.isNaN(+last) ? +last : last);
  cur[lastKey] = newVal;
  return clone;
}

// helper to merge object fields into a JSON path target, preserving non-scalar children (arrays/objects)
function setAtPathMerge(root: any, path: any[], newVals: any) {
  if (!path || path.length === 0) {
    if (typeof root === "object" && !Array.isArray(root) && typeof newVals === "object" && !Array.isArray(newVals)) {
      return { ...root, ...newVals };
    }
    return newVals;
  }

  const clone = Array.isArray(root) ? root.slice() : { ...root };
  let cur: any = clone;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const key = typeof seg === "number" || (!Number.isNaN(+seg) && Array.isArray(cur)) ? +seg : seg;
    if (cur[key] === undefined) cur[key] = typeof path[i + 1] === "number" ? [] : {};
    cur[key] = Array.isArray(cur[key]) ? cur[key].slice() : { ...cur[key] };
    cur = cur[key];
  }

  const last = path[path.length - 1];
  const lastKey = typeof last === "number" ? last : (!Number.isNaN(+last) ? +last : last);

  // if target exists and both are plain objects, merge; otherwise replace
  if (cur[lastKey] && typeof cur[lastKey] === "object" && !Array.isArray(cur[lastKey]) && typeof newVals === "object" && !Array.isArray(newVals)) {
    cur[lastKey] = { ...cur[lastKey], ...newVals };
  } else {
    cur[lastKey] = newVals;
  }

  return clone;
}
