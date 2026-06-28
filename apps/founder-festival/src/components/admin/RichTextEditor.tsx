"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { AnyExtension } from "@tiptap/core";
import { useEffect, useMemo } from "react";
import { MentionLink, mentionSuggestion } from "./rich-text-mention";

// Reusable TipTap rich-text editor. Emits sanitized-ready HTML via onChange.
// immediatelyRender:false keeps it SSR-safe under Next's App Router.
function ToolbarButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium ${
        active ? "bg-[#dfa43a] text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-zinc-700 bg-zinc-900 p-2">
      <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="B" />
      <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" />
      <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="H2" />
      <ToolbarButton active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="H3" />
      <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="• List" />
      <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1. List" />
      <ToolbarButton active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="❝" />
      <ToolbarButton
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        label="Link"
      />
    </div>
  );
}

export function RichTextEditor({
  initialContent,
  onChange,
  placeholder,
  enableMentions = false,
}: {
  initialContent: string;
  onChange: (html: string) => void;
  placeholder?: string;
  enableMentions?: boolean;
}) {
  const extensions = useMemo<AnyExtension[]>(() => {
    const list: AnyExtension[] = [StarterKit.configure({ link: { openOnClick: false } })];
    if (enableMentions) {
      list.push(MentionLink.configure({ suggestion: mentionSuggestion }));
    }
    return list;
  }, [enableMentions]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContent || "",
    editorProps: {
      attributes: {
        class:
          "min-h-[8rem] px-3 py-2 text-sm text-zinc-100 focus:outline-none [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[#dfa43a] [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Keep the editor in sync if the initial content changes (e.g. after a load).
  useEffect(() => {
    if (editor && initialContent && editor.isEmpty) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-950/40 overflow-hidden">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} aria-placeholder={placeholder} />
    </div>
  );
}
