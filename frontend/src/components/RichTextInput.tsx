"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Link as LinkIcon, Undo2, Redo2 } from "lucide-react";

// v18 Asama 10 - WYSIWYG (TipTap) inline toolbar. SADECE tip==="body" alanlarinda.
// Izinli bicimlendirme: bold (<strong>), italic (<em>), link (<a href>), satir sonu (<br>).
// Heading/list/blockquote/code KAPALI (spec whitelist). Cikti HTML; backend HtmlSanitizer 2. katman.
export function RichTextInput({
  value,
  onChange,
  placeholder,
  hata,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  hata?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false, // Next.js SSR uyumu
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        // paragraph + bold + italic + hardBreak (br) + history (undo/redo) acik kalir
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: placeholder || "" }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "min-h-[5rem] px-3 py-2 text-sm text-clay-900 dark:text-ink-50 leading-relaxed focus:outline-none [&_strong]:font-semibold [&_em]:italic [&_a]:text-terracotta [&_a]:underline",
      },
    },
  });

  // Dis value degisince (sifirla / versiyona don) editoru senkronla
  useEffect(() => {
    if (editor && !editor.isFocused && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="h-28 rounded-lg border border-cream-300 dark:border-ink-700/60 animate-pulse bg-cream-50 dark:bg-ink-900/40" />;
  }

  const baglanti = () => {
    const mevcut = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Bağlantı URL (boş bırak = kaldır):", mevcut);
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const cerceveClass = hata
    ? "border-red-400 dark:border-red-500/60 focus-within:ring-red-400/40"
    : "border-cream-300 dark:border-ink-700/60 focus-within:ring-terracotta/40";

  return (
    <div className={`rounded-lg border bg-cream-50 dark:bg-ink-900/40 focus-within:ring-2 transition-colors ${cerceveClass}`}>
      <div className="flex items-center gap-0.5 border-b border-cream-300 dark:border-ink-700/60 px-1.5 py-1">
        <ToolbarBtn aktif={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} baslik="Kalın">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn aktif={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} baslik="İtalik">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn aktif={editor.isActive("link")} onClick={baglanti} baslik="Bağlantı">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="mx-1 h-4 w-px bg-cream-300 dark:bg-ink-700/60" />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} pasif={!editor.can().undo()} baslik="Geri al">
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} pasif={!editor.can().redo()} baslik="İleri al">
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarBtn({ children, onClick, aktif, pasif, baslik }: {
  children: React.ReactNode; onClick: () => void; aktif?: boolean; pasif?: boolean; baslik: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pasif}
      title={baslik}
      aria-label={baslik}
      className={[
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        pasif ? "opacity-30 cursor-not-allowed" : "hover:bg-cream-200 dark:hover:bg-ink-800",
        aktif ? "bg-terracotta/15 text-terracotta" : "text-clay-600 dark:text-ink-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
