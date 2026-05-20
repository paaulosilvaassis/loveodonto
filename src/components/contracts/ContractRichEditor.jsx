import { forwardRef, useImperativeHandle } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

/**
 * Editor rich-text para contratos (TipTap). Controle externo: use `key` no pai para resetar conteúdo.
 */
const ContractRichEditor = forwardRef(function ContractRichEditor(
  { initialHtml = '', onChange, editable = true, className = '' },
  ref,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Texto do modelo...' }),
    ],
    content: initialHtml || '',
    editable,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
  });

  useImperativeHandle(ref, () => ({
    insertToken(token) {
      if (!editor) return;
      const t = String(token || '').trim();
      if (!t) return;
      editor.chain().focus().insertContent(`${t} `).run();
    },
  }), [editor]);

  if (!editor) {
    return <div className="text-sm text-[var(--color-text-muted)] p-4">Carregando editor…</div>;
  }

  const chain = () => editor.chain().focus();

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap gap-1 p-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <button type="button" className="button small secondary" onClick={() => chain().toggleBold().run()} aria-label="Negrito">
          <Bold size={16} />
        </button>
        <button type="button" className="button small secondary" onClick={() => chain().toggleItalic().run()} aria-label="Itálico">
          <Italic size={16} />
        </button>
        <button type="button" className="button small secondary" onClick={() => chain().toggleUnderline().run()} aria-label="Sublinhado">
          <UnderlineIcon size={16} />
        </button>
        <span className="w-px bg-[var(--color-border)] mx-1 self-stretch" aria-hidden />
        <button type="button" className="button small secondary" onClick={() => chain().toggleBulletList().run()} aria-label="Lista">
          <List size={16} />
        </button>
        <button type="button" className="button small secondary" onClick={() => chain().toggleOrderedList().run()} aria-label="Lista numerada">
          <ListOrdered size={16} />
        </button>
        <span className="w-px bg-[var(--color-border)] mx-1 self-stretch" aria-hidden />
        <button type="button" className="button small secondary" onClick={() => chain().setTextAlign('left').run()} aria-label="Alinhar esquerda">
          <AlignLeft size={16} />
        </button>
        <button type="button" className="button small secondary" onClick={() => chain().setTextAlign('center').run()} aria-label="Centralizar">
          <AlignCenter size={16} />
        </button>
        <button type="button" className="button small secondary" onClick={() => chain().setTextAlign('right').run()} aria-label="Alinhar direita">
          <AlignRight size={16} />
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="contract-rich-editor__content min-h-[220px] max-h-[50vh] overflow-y-auto rounded-md border border-[var(--color-border)] p-3 bg-white text-[var(--color-text)] [&_.ProseMirror]:min-h-[180px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:text-sm [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
      />
    </div>
  );
});

export default ContractRichEditor;
