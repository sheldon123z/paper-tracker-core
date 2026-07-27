import os
import shutil
import sys
import zipfile
from types import ModuleType, SimpleNamespace
from xml.etree import ElementTree

import pytest
from backend.app.services import workflow_export, workflow_export_runner

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W_VAL = f"{{{W_NS}}}val"
CP_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC_NS = "http://purl.org/dc/elements/1.1/"


def _assert_no_personal_metadata(archive: zipfile.ZipFile) -> None:
    assert workflow_export.CUSTOM_PROPERTIES_PART not in archive.namelist()

    core = ElementTree.fromstring(archive.read("docProps/core.xml"))
    creator = core.find(f"{{{DC_NS}}}creator")
    last_modified_by = core.find(f"{{{CP_NS}}}lastModifiedBy")
    assert creator is None or not (creator.text or "").strip()
    assert last_modified_by is None or not (last_modified_by.text or "").strip()

    app = ElementTree.fromstring(archive.read("docProps/app.xml"))
    assert app.find(f"{{{workflow_export.EP_NS}}}Company") is None
    assert app.find(f"{{{workflow_export.EP_NS}}}Manager") is None

    relationships = ElementTree.fromstring(archive.read("_rels/.rels"))
    assert all(
        relationship.get("Type") != workflow_export.CUSTOM_PROPERTIES_RELATIONSHIP_TYPE
        for relationship in relationships
    )

    content_types = ElementTree.fromstring(archive.read("[Content_Types].xml"))
    assert all(
        (override.get("PartName") or "").lstrip("/") != workflow_export.CUSTOM_PROPERTIES_PART
        for override in content_types
    )


def _inject_personal_metadata(docx_path):
    replacement_path = docx_path.with_suffix(".word-saved.docx")
    try:
        with (
            zipfile.ZipFile(docx_path, "r") as source,
            zipfile.ZipFile(replacement_path, "w") as target,
        ):
            for item in source.infolist():
                if item.filename == workflow_export.CUSTOM_PROPERTIES_PART:
                    continue
                data = source.read(item.filename)
                if item.filename == "docProps/core.xml":
                    core = ElementTree.fromstring(data)
                    creator = core.find(f"{{{DC_NS}}}creator")
                    if creator is None:
                        creator = ElementTree.SubElement(core, f"{{{DC_NS}}}creator")
                    creator.text = "Private Office User"
                    last_modified_by = core.find(f"{{{CP_NS}}}lastModifiedBy")
                    if last_modified_by is None:
                        last_modified_by = ElementTree.SubElement(
                            core,
                            f"{{{CP_NS}}}lastModifiedBy",
                        )
                    last_modified_by.text = "Private Office User"
                    data = ElementTree.tostring(core, encoding="utf-8", xml_declaration=True)
                elif item.filename == "docProps/app.xml":
                    app = ElementTree.fromstring(data)
                    ElementTree.SubElement(
                        app,
                        f"{{{workflow_export.EP_NS}}}Company",
                    ).text = "Private Company"
                    ElementTree.SubElement(
                        app,
                        f"{{{workflow_export.EP_NS}}}Manager",
                    ).text = "Private Manager"
                    data = ElementTree.tostring(app, encoding="utf-8", xml_declaration=True)
                elif item.filename == "_rels/.rels":
                    relationships = ElementTree.fromstring(data)
                    ElementTree.SubElement(
                        relationships,
                        f"{{{workflow_export.PACKAGE_REL_NS}}}Relationship",
                        {
                            "Id": "rIdPrivateMetadata",
                            "Type": workflow_export.CUSTOM_PROPERTIES_RELATIONSHIP_TYPE,
                            "Target": workflow_export.CUSTOM_PROPERTIES_PART,
                        },
                    )
                    data = ElementTree.tostring(
                        relationships,
                        encoding="utf-8",
                        xml_declaration=True,
                    )
                elif item.filename == "[Content_Types].xml":
                    content_types = ElementTree.fromstring(data)
                    ElementTree.SubElement(
                        content_types,
                        f"{{{workflow_export.CONTENT_TYPES_NS}}}Override",
                        {
                            "PartName": f"/{workflow_export.CUSTOM_PROPERTIES_PART}",
                            "ContentType": ("application/vnd.openxmlformats-officedocument.custom-properties+xml"),
                        },
                    )
                    data = ElementTree.tostring(
                        content_types,
                        encoding="utf-8",
                        xml_declaration=True,
                    )
                target.writestr(item, data)
            target.writestr(
                workflow_export.CUSTOM_PROPERTIES_PART,
                (
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    '<Properties xmlns="http://schemas.openxmlformats.org/'
                    'officeDocument/2006/custom-properties" />'
                ),
            )
        os.replace(replacement_path, docx_path)
    finally:
        replacement_path.unlink(missing_ok=True)


def test_workflow_docx_template_has_no_personal_metadata():
    with zipfile.ZipFile(workflow_export.REFERENCE_DOC) as archive:
        assert "docProps/custom.xml" not in archive.namelist()
        core = ElementTree.fromstring(archive.read("docProps/core.xml"))

    creator = core.find(f"{{{DC_NS}}}creator")
    last_modified_by = core.find(f"{{{CP_NS}}}lastModifiedBy")
    assert creator is None or not (creator.text or "").strip()
    assert last_modified_by is None or not (last_modified_by.text or "").strip()


def test_workflow_docx_export_applies_report_formatting(monkeypatch):
    monkeypatch.setattr(workflow_export, "_refresh_docx_fields", lambda _path: None)
    assert workflow_export.REFERENCE_DOC.is_file()
    assert "backend" in workflow_export.REFERENCE_DOC.parts
    assert "workflow_export" in workflow_export.REFERENCE_DOC.parts

    output = workflow_export.export_workflow_report(
        """# 一级标题

## 二级标题

### 三级标题

* **2025年（基础拓扑与实时建模突破）**
- **磁路优化与特种电机设计**：针对 Halbach 永磁电机。
- 普通列表项

| 方法 | 分数 |
|---|---:|
| Proposed | 95 |
""",
        "docx",
    )
    try:
        assert output.is_file()
        assert output.suffix == ".docx"
        assert zipfile.is_zipfile(output)
        with zipfile.ZipFile(output) as archive:
            assert "word/document.xml" in archive.namelist()
            document = ElementTree.fromstring(archive.read("word/document.xml"))
            settings = ElementTree.fromstring(archive.read("word/settings.xml"))
            styles = ElementTree.fromstring(archive.read("word/styles.xml"))

            paragraphs = document.findall(f".//{{{W_NS}}}p")
            paragraph_by_text = {
                "".join(node.text or "" for node in paragraph.findall(f".//{{{W_NS}}}t")): paragraph
                for paragraph in paragraphs
            }

            assert "目录" in paragraph_by_text
            assert "Table of Contents" not in paragraph_by_text
            for heading in ("1 一级标题", "1.1 二级标题", "1.1.1 三级标题"):
                assert heading in paragraph_by_text
                assert not paragraph_by_text[heading].findall(f".//{{{W_NS}}}tab")

            for text in (
                "2025年（基础拓扑与实时建模突破）",
                "磁路优化与特种电机设计：针对 Halbach 永磁电机。",
            ):
                paragraph = paragraph_by_text[text]
                assert paragraph.find(f"./{{{W_NS}}}pPr/{{{W_NS}}}numPr") is None
                indent = paragraph.find(f"./{{{W_NS}}}pPr/{{{W_NS}}}ind")
                assert indent is not None
                assert indent.get(f"{{{W_NS}}}firstLineChars") == "200"
                assert indent.get(f"{{{W_NS}}}left") == "0"

            normal_list = paragraph_by_text["普通列表项"]
            assert normal_list.find(f"./{{{W_NS}}}pPr/{{{W_NS}}}numPr") is not None

            borders = document.find(f".//{{{W_NS}}}tbl/{{{W_NS}}}tblPr/{{{W_NS}}}tblBorders")
            assert borders is not None
            assert {child.tag.rsplit("}", 1)[-1] for child in borders} == {
                "top",
                "left",
                "bottom",
                "right",
                "insideH",
                "insideV",
            }

            update_fields = settings.find(f".//{{{W_NS}}}updateFields")
            assert update_fields is not None
            assert update_fields.get(W_VAL) == "true"

            defined_styles = {style.get(f"{{{W_NS}}}styleId") for style in styles.findall(f".//{{{W_NS}}}style")}
            referenced_styles = {
                reference.get(W_VAL)
                for tag in ("pStyle", "rStyle", "tblStyle")
                for reference in document.findall(f".//{{{W_NS}}}{tag}")
            }
            assert referenced_styles <= defined_styles
            _assert_no_personal_metadata(archive)
    finally:
        shutil.rmtree(output.parent, ignore_errors=True)


def test_workflow_docx_export_sanitizes_metadata_after_word_refresh(monkeypatch):
    monkeypatch.setattr(workflow_export, "_refresh_docx_fields", _inject_personal_metadata)

    output = workflow_export.export_workflow_report("# Metadata-safe export", "docx")
    try:
        with zipfile.ZipFile(output) as archive:
            _assert_no_personal_metadata(archive)
    finally:
        shutil.rmtree(output.parent, ignore_errors=True)


def test_postprocess_docx_wraps_invalid_zip_errors(tmp_path):
    docx_path = tmp_path / "invalid.docx"
    docx_path.write_bytes(b"not a zip archive")

    with pytest.raises(
        workflow_export.WorkflowExportError,
        match="failed to post-process",
    ) as error:
        workflow_export._postprocess_docx(docx_path)

    assert isinstance(error.value.__cause__, zipfile.BadZipFile)


def test_postprocess_docx_wraps_xml_parse_errors(tmp_path):
    docx_path = tmp_path / "invalid-xml.docx"
    with zipfile.ZipFile(docx_path, "w") as archive:
        archive.writestr("word/numbering.xml", "<w:numbering")
        archive.writestr("word/styles.xml", f'<w:styles xmlns:w="{W_NS}" />')
        archive.writestr("word/document.xml", f'<w:document xmlns:w="{W_NS}" />')
        archive.writestr("word/settings.xml", f'<w:settings xmlns:w="{W_NS}" />')

    with pytest.raises(
        workflow_export.WorkflowExportError,
        match="failed to post-process",
    ) as error:
        workflow_export._postprocess_docx(docx_path)

    assert isinstance(error.value.__cause__, ElementTree.ParseError)


def test_refresh_docx_fields_terminates_word_after_runner_failure(monkeypatch, tmp_path):
    docx_path = tmp_path / "report.docx"
    terminated = []
    monkeypatch.setattr(workflow_export, "os", SimpleNamespace(name="nt"))
    monkeypatch.setattr(
        workflow_export.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1, stdout="Word failed"),
    )
    monkeypatch.setattr(
        workflow_export,
        "_terminate_word_from_pid_file",
        terminated.append,
    )

    workflow_export._refresh_docx_fields(docx_path)

    assert terminated == [docx_path.with_suffix(".docx.word.pid")]


def test_export_pdf_terminates_word_after_runner_failure(monkeypatch, tmp_path):
    docx_path = tmp_path / "report.docx"
    pdf_path = tmp_path / "report.pdf"
    terminated = []
    monkeypatch.setattr(workflow_export, "os", SimpleNamespace(name="nt"))
    monkeypatch.setattr(
        workflow_export.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1, stdout="Word failed"),
    )
    monkeypatch.setattr(
        workflow_export,
        "_terminate_word_from_pid_file",
        terminated.append,
    )

    with pytest.raises(workflow_export.WorkflowExportError, match="failed to export PDF"):
        workflow_export._export_pdf(docx_path, pdf_path)

    assert terminated == [pdf_path.with_suffix(".pdf.word.pid")]


@pytest.mark.parametrize("mode", ["refresh", "pdf"])
def test_word_runner_records_pid_before_opening_document(monkeypatch, tmp_path, mode):
    pid_file = tmp_path / "word.pid"
    events = []
    document = SimpleNamespace(
        TablesOfContents=SimpleNamespace(Count=0),
        Fields=SimpleNamespace(Update=lambda: None),
        Repaginate=lambda: None,
        Save=lambda: None,
        Close=lambda **_kwargs: None,
        ExportAsFixedFormat=lambda **_kwargs: None,
    )

    def open_document(**_kwargs):
        events.append("open")
        assert pid_file.read_text(encoding="ascii") == "123"
        return document

    word = SimpleNamespace(
        Documents=SimpleNamespace(Open=open_document),
        Quit=lambda **_kwargs: None,
    )
    pythoncom = ModuleType("pythoncom")
    pythoncom.CoInitialize = lambda: None
    pythoncom.CoUninitialize = lambda: None
    win32com = ModuleType("win32com")
    win32com_client = ModuleType("win32com.client")
    win32com_client.DispatchEx = lambda _name: word
    win32com.client = win32com_client
    monkeypatch.setitem(sys.modules, "pythoncom", pythoncom)
    monkeypatch.setitem(sys.modules, "win32com", win32com)
    monkeypatch.setitem(sys.modules, "win32com.client", win32com_client)

    def record_pid(_word, path):
        events.append("pid")
        path.write_text("123", encoding="ascii")

    monkeypatch.setattr(workflow_export_runner, "_record_word_pid", record_pid)

    if mode == "refresh":
        workflow_export_runner.refresh_docx(tmp_path / "report.docx", pid_file)
    else:
        workflow_export_runner.export_docx(
            tmp_path / "report.docx",
            tmp_path / "report.pdf",
            pid_file,
        )

    assert events[:2] == ["pid", "open"]
