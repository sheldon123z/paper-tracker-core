"""Self-contained Markdown -> DOCX -> Word PDF workflow report exports."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

ASSET_ROOT = Path(__file__).resolve().parents[1] / "assets" / "workflow_export"
REFERENCE_DOC = ASSET_ROOT / "reference.docx"
WORD_EXPORT_RUNNER = Path(__file__).with_name("workflow_export_runner.py")
SUPPORTED_FORMATS = {"docx", "pdf"}
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W_VAL = f"{{{W_NS}}}val"
CP_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC_NS = "http://purl.org/dc/elements/1.1/"
EP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
CUSTOM_PROPERTIES_RELATIONSHIP_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties"
)
CUSTOM_PROPERTIES_PART = "docProps/custom.xml"

logger = logging.getLogger(__name__)

_PARAGRAPH_RE = re.compile(r"<w:p(?:\s[^>]*)?>.*?</w:p>", re.DOTALL)
_RUN_RE = re.compile(r"<w:r(?:\s[^>]*)?>.*?</w:r>", re.DOTALL)
_TABLE_PROPERTIES_RE = re.compile(r"<w:tblPr(?:\s[^>]*)?>.*?</w:tblPr>", re.DOTALL)
_TABLE_BORDERS_RE = re.compile(
    r"<w:tblBorders(?:\s[^>]*)?/>|<w:tblBorders(?:\s[^>]*)?>.*?</w:tblBorders>",
    re.DOTALL,
)
_UPDATE_FIELDS_RE = re.compile(
    r"<w:updateFields(?:\s[^>]*)?/>|<w:updateFields(?:\s[^>]*)?>.*?</w:updateFields>",
    re.DOTALL,
)
_TABLE_BORDERS_XML = (
    "<w:tblBorders>"
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto" />'
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto" />'
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto" />'
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto" />'
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto" />'
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto" />'
    "</w:tblBorders>"
)
_BODY_INDENT_XML = '<w:ind w:left="0" w:leftChars="0" w:firstLine="640" w:firstLineChars="200" />'


class WorkflowExportError(RuntimeError):
    """Raised when 专业领域大模型智能文献检索与知识服务 cannot produce a workflow report export."""


def _pandoc_path() -> Path:
    try:
        import pypandoc
    except ImportError as exc:
        raise WorkflowExportError(
            "专业领域大模型智能文献检索与知识服务缺少 Pandoc 依赖，请安装后端依赖。"
        ) from exc
    try:
        path = Path(pypandoc.get_pandoc_path()).resolve()
    except OSError as exc:
        raise WorkflowExportError("专业领域大模型智能文献检索与知识服务内置的 Pandoc 不可用。") from exc
    if os.name == "nt" and not path.is_file():
        path = path.with_suffix(".exe")
    if not path.is_file():
        raise WorkflowExportError(f"未找到专业领域大模型智能文献检索与知识服务内置的 Pandoc：{path}")
    return path


def _bullet_num_ids(numbering_xml: bytes) -> set[str]:
    root = ElementTree.fromstring(numbering_xml)
    abstract_bullets: set[str] = set()
    for abstract_num in root.findall(f"{{{W_NS}}}abstractNum"):
        abstract_id = abstract_num.get(f"{{{W_NS}}}abstractNumId")
        if abstract_id is None:
            continue
        if any(num_fmt.get(W_VAL) == "bullet" for num_fmt in abstract_num.findall(f".//{{{W_NS}}}numFmt")):
            abstract_bullets.add(abstract_id)

    bullet_ids: set[str] = set()
    for num in root.findall(f"{{{W_NS}}}num"):
        num_id = num.get(f"{{{W_NS}}}numId")
        abstract_num_id = num.find(f"{{{W_NS}}}abstractNumId")
        if num_id is not None and abstract_num_id is not None and abstract_num_id.get(W_VAL) in abstract_bullets:
            bullet_ids.add(num_id)
    return bullet_ids


def _first_text_run_is_bold(paragraph_xml: str) -> bool:
    for run_xml in _RUN_RE.findall(paragraph_xml):
        if "<w:t" not in run_xml:
            continue
        wrapped = f'<root xmlns:w="{W_NS}">{run_xml}</root>'
        run = ElementTree.fromstring(wrapped).find(f"{{{W_NS}}}r")
        if run is None:
            return False
        bold = run.find(f"./{{{W_NS}}}rPr/{{{W_NS}}}b")
        return bold is not None and bold.get(W_VAL, "true").lower() not in {
            "0",
            "false",
            "off",
        }
    return False


def _replace_heading_tabs(paragraph_xml: str) -> str:
    if '<w:rStyle w:val="SectionNumber"' not in paragraph_xml:
        return paragraph_xml
    return re.sub(
        r"<w:tab(?:\s[^>]*)?/>|<w:tab(?:\s[^>]*)?></w:tab>",
        '<w:t xml:space="preserve"> </w:t>',
        paragraph_xml,
    )


def _flatten_bold_bullet(paragraph_xml: str, bullet_num_ids: set[str]) -> str:
    num_id_match = re.search(r'<w:numId\s+w:val="([^"]+)"\s*/>', paragraph_xml)
    if (
        num_id_match is None
        or num_id_match.group(1) not in bullet_num_ids
        or not _first_text_run_is_bold(paragraph_xml)
    ):
        return paragraph_xml

    paragraph_xml = re.sub(r"<w:numPr>.*?</w:numPr>", "", paragraph_xml, count=1, flags=re.DOTALL)
    if re.search(r"<w:ind(?:\s[^>]*)?/>|<w:ind(?:\s[^>]*)?></w:ind>", paragraph_xml):
        paragraph_xml = re.sub(
            r"<w:ind(?:\s[^>]*)?/>|<w:ind(?:\s[^>]*)?></w:ind>",
            _BODY_INDENT_XML,
            paragraph_xml,
            count=1,
        )
    elif "</w:pPr>" in paragraph_xml:
        paragraph_xml = paragraph_xml.replace("</w:pPr>", _BODY_INDENT_XML + "</w:pPr>", 1)
    else:
        opening_end = paragraph_xml.find(">") + 1
        paragraph_xml = paragraph_xml[:opening_end] + f"<w:pPr>{_BODY_INDENT_XML}</w:pPr>" + paragraph_xml[opening_end:]
    return paragraph_xml


def _add_table_borders(table_properties_xml: str) -> str:
    table_properties_xml = _TABLE_BORDERS_RE.sub("", table_properties_xml)
    return table_properties_xml.replace(
        "</w:tblPr>",
        _TABLE_BORDERS_XML + "</w:tblPr>",
        1,
    )


def _style_lookup_key(value: str) -> str:
    return re.sub(r"[\s_-]+", "", value).casefold()


def _resolve_style_references(document_xml: str, styles_xml: bytes) -> str:
    root = ElementTree.fromstring(styles_xml)
    defined_styles: set[str] = set()
    styles_by_name: dict[str, str] = {}
    for style in root.findall(f"{{{W_NS}}}style"):
        style_id = style.get(f"{{{W_NS}}}styleId")
        if not style_id:
            continue
        defined_styles.add(style_id)
        name = style.find(f"{{{W_NS}}}name")
        style_name = name.get(W_VAL) if name is not None else None
        if style_name:
            styles_by_name[_style_lookup_key(style_name)] = style_id

    unresolved_styles: set[str] = set()

    def resolve(match: re.Match[str]) -> str:
        referenced_style = match.group(2)
        if referenced_style in defined_styles:
            return match.group(0)
        replacement = styles_by_name.get(_style_lookup_key(referenced_style))
        if replacement is None:
            unresolved_styles.add(referenced_style)
            return match.group(0)
        return f"{match.group(1)}{replacement}{match.group(3)}"

    document_xml = re.sub(
        r'(<w:(?:pStyle|rStyle|tblStyle)\b[^>]*\bw:val=")([^"]+)(")',
        resolve,
        document_xml,
    )
    if unresolved_styles:
        unresolved = ", ".join(sorted(unresolved_styles))
        raise ValueError(f"The workflow DOCX references undefined styles: {unresolved}")
    return document_xml


def _postprocess_docx(docx_path: Path) -> None:
    replacement_path = docx_path.with_suffix(".postprocessed.docx")
    try:
        with zipfile.ZipFile(docx_path, "r") as source:
            numbering_xml = source.read("word/numbering.xml")
            styles_xml = source.read("word/styles.xml")
            bullet_num_ids = _bullet_num_ids(numbering_xml)
            document_xml = source.read("word/document.xml").decode("utf-8")
            settings_xml = source.read("word/settings.xml").decode("utf-8")

            document_xml = re.sub(
                r"(<w:t(?:\s[^>]*)?>)Table of Contents(</w:t>)",
                r"\1目录\2",
                document_xml,
                count=1,
            )

            def process_paragraph(match: re.Match[str]) -> str:
                paragraph_xml = _replace_heading_tabs(match.group(0))
                return _flatten_bold_bullet(paragraph_xml, bullet_num_ids)

            document_xml = _PARAGRAPH_RE.sub(process_paragraph, document_xml)
            document_xml = _TABLE_PROPERTIES_RE.sub(
                lambda match: _add_table_borders(match.group(0)),
                document_xml,
            )
            document_xml = _resolve_style_references(document_xml, styles_xml)

            update_fields_xml = '<w:updateFields w:val="true" />'
            if _UPDATE_FIELDS_RE.search(settings_xml):
                settings_xml = _UPDATE_FIELDS_RE.sub(update_fields_xml, settings_xml, count=1)
            else:
                settings_xml = settings_xml.replace(
                    "</w:settings>",
                    update_fields_xml + "</w:settings>",
                    1,
                )

            with zipfile.ZipFile(replacement_path, "w") as target:
                for item in source.infolist():
                    data = source.read(item.filename)
                    if item.filename == "word/document.xml":
                        data = document_xml.encode("utf-8")
                    elif item.filename == "word/settings.xml":
                        data = settings_xml.encode("utf-8")
                    target.writestr(item, data)
        os.replace(replacement_path, docx_path)
    except (
        ElementTree.ParseError,
        KeyError,
        OSError,
        UnicodeError,
        ValueError,
        zipfile.BadZipFile,
    ) as exc:
        raise WorkflowExportError(
            "专业领域大模型智能文献检索与知识服务 failed to post-process the generated Word document."
        ) from exc
    finally:
        replacement_path.unlink(missing_ok=True)


def _serialized_xml(root: ElementTree.Element) -> bytes:
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


def _sanitize_docx_metadata(docx_path: Path) -> None:
    replacement_path = docx_path.with_suffix(".sanitized.docx")
    try:
        with zipfile.ZipFile(docx_path, "r") as source:
            names = set(source.namelist())
            replacements: dict[str, bytes] = {}

            if "docProps/core.xml" in names:
                core = ElementTree.fromstring(source.read("docProps/core.xml"))
                for tag in (f"{{{DC_NS}}}creator", f"{{{CP_NS}}}lastModifiedBy"):
                    for element in core.findall(tag):
                        core.remove(element)
                replacements["docProps/core.xml"] = _serialized_xml(core)

            if "docProps/app.xml" in names:
                app = ElementTree.fromstring(source.read("docProps/app.xml"))
                for tag in (f"{{{EP_NS}}}Company", f"{{{EP_NS}}}Manager"):
                    for element in app.findall(tag):
                        app.remove(element)
                replacements["docProps/app.xml"] = _serialized_xml(app)

            if "_rels/.rels" in names:
                relationships = ElementTree.fromstring(source.read("_rels/.rels"))
                for relationship in list(relationships):
                    target = (relationship.get("Target") or "").replace("\\", "/").lstrip("/")
                    if (
                        relationship.get("Type") == CUSTOM_PROPERTIES_RELATIONSHIP_TYPE
                        or target == CUSTOM_PROPERTIES_PART
                    ):
                        relationships.remove(relationship)
                replacements["_rels/.rels"] = _serialized_xml(relationships)

            if "[Content_Types].xml" in names:
                content_types = ElementTree.fromstring(source.read("[Content_Types].xml"))
                for override in list(content_types):
                    part_name = (override.get("PartName") or "").lstrip("/")
                    if part_name == CUSTOM_PROPERTIES_PART:
                        content_types.remove(override)
                replacements["[Content_Types].xml"] = _serialized_xml(content_types)

            with zipfile.ZipFile(replacement_path, "w") as target:
                for item in source.infolist():
                    if item.filename == CUSTOM_PROPERTIES_PART:
                        continue
                    target.writestr(
                        item,
                        replacements.get(item.filename, source.read(item.filename)),
                    )
        os.replace(replacement_path, docx_path)
    except (
        ElementTree.ParseError,
        KeyError,
        OSError,
        UnicodeError,
        zipfile.BadZipFile,
    ) as exc:
        raise WorkflowExportError("专业领域大模型智能文献检索与知识服务无法移除 Word 文档中的个人元数据。") from exc
    finally:
        replacement_path.unlink(missing_ok=True)


def _refresh_docx_fields(docx_path: Path) -> None:
    if os.name != "nt":
        return
    pid_file = docx_path.with_suffix(".docx.word.pid")
    try:
        try:
            result = subprocess.run(
                [sys.executable, str(WORD_EXPORT_RUNNER), "refresh", str(docx_path), str(pid_file)],
                cwd=docx_path.parent,
                text=True,
                encoding="utf-8",
                errors="replace",
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=120,
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except subprocess.TimeoutExpired:
            _terminate_word_from_pid_file(pid_file)
            logger.warning("Microsoft Word timed out while refreshing the workflow DOCX table of contents.")
            return
        if result.returncode != 0:
            _terminate_word_from_pid_file(pid_file)
            logger.warning(
                "Microsoft Word could not refresh the workflow DOCX table of contents: %s",
                result.stdout.strip() or "unknown error",
            )
    finally:
        pid_file.unlink(missing_ok=True)


def _generate_docx(markdown_path: Path, output_path: Path) -> None:
    if not REFERENCE_DOC.is_file():
        raise WorkflowExportError(f"缺少专业领域大模型智能文献检索与知识服务工作流导出模板：{REFERENCE_DOC}")
    command = [
        str(_pandoc_path()),
        str(markdown_path),
        "--from=markdown+smart",
        "--to=docx",
        "--standalone",
        "--toc",
        "--number-sections",
        "--metadata=lang:zh-CN",
        f"--resource-path={markdown_path.parent}",
        f"--reference-doc={REFERENCE_DOC}",
        f"--output={output_path}",
    ]
    result = subprocess.run(
        command,
        cwd=markdown_path.parent,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=120,
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0 or not output_path.is_file() or output_path.stat().st_size == 0:
        raise WorkflowExportError(
            "专业领域大模型智能文献检索与知识服务无法生成 Word 文档：\n"
            + (result.stdout.strip() or "Pandoc did not produce an output file.")
        )
    _postprocess_docx(output_path)
    _sanitize_docx_metadata(output_path)


def _terminate_word_from_pid_file(pid_file: Path) -> None:
    try:
        pid = int(pid_file.read_text(encoding="ascii").strip())
    except (OSError, ValueError):
        return
    if pid <= 0:
        return
    try:
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=15,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired):
        logger.warning("专业领域大模型智能文献检索与知识服务无法终止超时的 Microsoft Word 进程。")


def _export_pdf(docx_path: Path, pdf_path: Path) -> None:
    if os.name != "nt":
        raise WorkflowExportError("Workflow PDF export currently requires Microsoft Word on Windows.")
    pid_file = pdf_path.with_suffix(".pdf.word.pid")
    try:
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    str(WORD_EXPORT_RUNNER),
                    "pdf",
                    str(docx_path),
                    str(pdf_path),
                    str(pid_file),
                ],
                cwd=docx_path.parent,
                text=True,
                encoding="utf-8",
                errors="replace",
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=180,
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except subprocess.TimeoutExpired as exc:
            _terminate_word_from_pid_file(pid_file)
            raise WorkflowExportError("Microsoft Word PDF export timed out after 180 seconds.") from exc
        if result.returncode != 0:
            _terminate_word_from_pid_file(pid_file)
        if result.returncode != 0 or not pdf_path.is_file() or pdf_path.stat().st_size == 0:
            raise WorkflowExportError(
                "专业领域大模型智能文献检索与知识服务 failed to export PDF through Microsoft Word:\n"
                + (result.stdout.strip() or "Word did not produce an output file.")
            )
    finally:
        pid_file.unlink(missing_ok=True)


def export_workflow_report(markdown: str, output_format: str) -> Path:
    """Create an export using only project-owned code, assets, and environment."""
    output_format = output_format.lower().strip()
    if output_format not in SUPPORTED_FORMATS:
        raise WorkflowExportError(f"Unsupported workflow export format: {output_format}")
    if not markdown.strip():
        raise WorkflowExportError("The workflow report is empty.")

    temp_root = Path(tempfile.mkdtemp(prefix="paper-tracker-workflow-export-"))
    markdown_path = temp_root / "report.md"
    docx_path = temp_root / "report.docx"
    try:
        markdown_path.write_text(markdown, encoding="utf-8")
        _generate_docx(markdown_path, docx_path)
        if output_format == "pdf":
            pdf_path = temp_root / "report.pdf"
            _export_pdf(docx_path, pdf_path)
            docx_path.unlink(missing_ok=True)
            return pdf_path
        _refresh_docx_fields(docx_path)
        _sanitize_docx_metadata(docx_path)
        return docx_path
    except Exception:
        shutil.rmtree(temp_root, ignore_errors=True)
        raise
