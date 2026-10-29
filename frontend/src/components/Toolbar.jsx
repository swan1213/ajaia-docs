import { useEditorState } from "@tiptap/react";

function Btn({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? " is-active" : ""}`}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="tb-sep" />;

export default function Toolbar({ editor, extra }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      block: e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "p",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  const setBlock = (v) => {
    if (v === "p") chain().setParagraph().run();
    else chain().setHeading({ level: Number(v[1]) }).run();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn title="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!s.canUndo}>&#8630;</Btn>
      <Btn title="Redo (Ctrl+Shift+Z)" onClick={() => chain().redo().run()} disabled={!s.canRedo}>&#8631;</Btn>
      <Sep />
      <select
        className="tb-select"
        value={s.block}
        onChange={(e) => setBlock(e.target.value)}
        aria-label="Text style"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Sep />
      <Btn title="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></Btn>
      <Btn title="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></Btn>
      <Btn title="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></Btn>
      <Sep />
      <Btn title="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>&bull; List</Btn>
      <Btn title="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1. List</Btn>
      <Btn title="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>&ldquo;&rdquo;</Btn>
      <Sep />
      <Btn title="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>Clear</Btn>
      {extra && <span className="tb-extra">{extra}</span>}
    </div>
  );
}
