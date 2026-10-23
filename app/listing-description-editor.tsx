"use client";

import { useEffect, useId, useRef } from "react";
import { formatListingDescription, plainListingDescription } from "../lib/listing-description";

type Props = {
  value: string;
  onChange(value: string): void;
  name?: string;
  className?: string;
  minLength?: number;
  maxLength?: number;
};

const tools = [
  { label: "Negrito", command: "bold", symbol: <strong>B</strong> },
  { label: "Itálico", command: "italic", symbol: <em>I</em> },
  { label: "Sublinhado", command: "underline", symbol: <u>S</u> },
  { label: "Parágrafo", command: "formatBlock", argument: "p", symbol: "Parágrafo" },
  { label: "Subtítulo", command: "formatBlock", argument: "h3", symbol: "Subtítulo" },
  { label: "Lista com marcadores", command: "insertUnorderedList", symbol: "• Lista" },
  { label: "Lista numerada", command: "insertOrderedList", symbol: "1. Lista" },
];

export default function ListingDescriptionEditor({
  value, onChange, name = "description", className = "", minLength = 30, maxLength = 5000,
}: Props) {
  const id = useId();
  const editor = useRef<HTMLDivElement>(null);
  const latestValue = useRef<string | null>(null);
  const selection = useRef<Range | null>(null);
  const textLength = plainListingDescription(value).length;

  useEffect(() => {
    if (!editor.current || latestValue.current === value) return;
    editor.current.innerHTML = formatListingDescription(value);
    latestValue.current = value;
    selection.current = null;
  }, [value]);

  function rememberSelection() {
    const selected = window.getSelection();
    if (selected?.rangeCount && editor.current?.contains(selected.anchorNode)) {
      selection.current = selected.getRangeAt(0).cloneRange();
    }
  }

  function sync() {
    const next = formatListingDescription(editor.current?.innerHTML || "");
    latestValue.current = next;
    onChange(plainListingDescription(next) ? next : "");
    rememberSelection();
  }

  function command(name: string, argument?: string) {
    editor.current?.focus();
    const selected = window.getSelection();
    if (selection.current && selected) {
      try {
        selected.removeAllRanges();
        selected.addRange(selection.current);
      } catch { /* A seleção foi alterada; o comando usa o cursor atual. */ }
    }
    document.execCommand(name, false, argument);
    sync();
  }

  return <div className={`listing-description-editor ${className}`.trim()}>
    <strong id={`${id}-label`} className="listing-description-editor-label">Descrição</strong>
    <div className="listing-description-toolbar" role="toolbar" aria-label="Formatar descrição do anúncio">
      {tools.map((tool) => <button key={tool.label} type="button" title={tool.label}
        aria-label={tool.label} onMouseDown={(event) => event.preventDefault()}
        onClick={() => command(tool.command, tool.argument)}>{tool.symbol}</button>)}
    </div>
    <div ref={editor} id={id} className="listing-description-editable"
      contentEditable role="textbox" aria-multiline="true" aria-required={minLength > 0}
      aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`}
      data-placeholder="Descreva estado, características e condições da negociação"
      suppressContentEditableWarning
      onInput={sync} onBlur={sync} onKeyUp={rememberSelection} onMouseUp={rememberSelection}
      onPaste={(event) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData("text/plain");
        if (!document.execCommand("insertText", false, pasted)) {
          const selected = window.getSelection();
          if (selected?.rangeCount && editor.current?.contains(selected.anchorNode)) {
            const range = selected.getRangeAt(0);
            range.deleteContents();
            const node = document.createTextNode(pasted);
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            selected.removeAllRanges();
            selected.addRange(range);
          }
        }
        sync();
      }} />
    <input type="hidden" name={name} value={value} />
    <small id={`${id}-help`} className="listing-description-editor-help">
      Use Enter para criar parágrafos. {textLength}/{maxLength} caracteres{minLength ? ` · mínimo de ${minLength}` : ""}.
    </small>
  </div>;
}
