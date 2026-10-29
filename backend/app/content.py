"""Everything to do with document content: sanitizing, importing files, exporting."""

import html
import io
from pathlib import Path

import mammoth
import markdown as md_lib
import nh3
from markdownify import markdownify

# Only the tags the editor can actually produce. Anything else gets stripped,
# so a crafted API call or uploaded file can't smuggle scripts into a shared doc.
ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s",
    "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "code", "pre", "hr",
}

SUPPORTED_UPLOADS = {".txt", ".md", ".markdown", ".docx"}
MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB is plenty for text documents
MAX_CONTENT_CHARS = 1_000_000


class ImportError_(ValueError):
    """Raised when an uploaded file can't be turned into a document."""


def sanitize_html(raw: str) -> str:
    return nh3.clean(raw or "", tags=ALLOWED_TAGS, attributes={})


def _txt_to_html(text: str) -> str:
    # Blank lines split paragraphs, single newlines become <br>.
    blocks = [b for b in text.replace("\r\n", "\n").split("\n\n") if b.strip()]
    return "".join(
        "<p>" + "<br>".join(html.escape(line) for line in block.split("\n")) + "</p>"
        for block in blocks
    )


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    # latin-1 never fails, good enough fallback for odd encodings
    return data.decode("latin-1")


def file_to_html(filename: str, data: bytes) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in SUPPORTED_UPLOADS:
        raise ImportError_(
            f"Unsupported file type '{ext or 'none'}'. Supported: .txt, .md, .docx"
        )
    if len(data) == 0:
        raise ImportError_("The file is empty")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImportError_("File is too large (max 2 MB)")

    if ext == ".txt":
        out = _txt_to_html(_decode(data))
    elif ext in (".md", ".markdown"):
        out = md_lib.markdown(_decode(data), extensions=["sane_lists"])
    else:  # .docx
        try:
            result = mammoth.convert_to_html(io.BytesIO(data))
        except Exception as exc:  # mammoth raises a grab bag of zip/xml errors
            raise ImportError_("Couldn't read that .docx file, is it corrupted?") from exc
        out = result.value

    return sanitize_html(out)


def title_from_filename(filename: str) -> str:
    stem = Path(filename or "Untitled").stem.strip()
    return (stem or "Untitled")[:200]


def html_to_markdown(content: str) -> str:
    return markdownify(content or "", heading_style="ATX", bullets="-").strip() + "\n"
