import shutil
import zipfile

from backend.app.services.workflow_export import REFERENCE_DOC, export_workflow_report


def test_workflow_docx_export_uses_paper_tracker_owned_template():
    assert REFERENCE_DOC.is_file()
    assert "backend" in REFERENCE_DOC.parts
    assert "workflow_export" in REFERENCE_DOC.parts

    output = export_workflow_report(
        "# Independent export\n\n| Method | Score |\n|---|---:|\n| Proposed | 95 |",
        "docx",
    )
    try:
        assert output.is_file()
        assert output.suffix == ".docx"
        assert zipfile.is_zipfile(output)
        with zipfile.ZipFile(output) as archive:
            assert "word/document.xml" in archive.namelist()
    finally:
        shutil.rmtree(output.parent, ignore_errors=True)
