# Bundled Tesseract language data

Source: `tesseract-ocr/tessdata_fast`, release `4.1.0`.
License: Apache-2.0; see `LICENSE` in this directory.

SHA-256:

- `chi_sim.traineddata`: `a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730`
- `eng.traineddata`: `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`
- `osd.traineddata`: `9cf5d576fcc47564f11265841e5ca839001e7e6f38ff7f7aacf46d15a96b00ff`

These are the fast LSTM models for Tesseract 4 and 5. Runtime OCR uses
`eng+chi_sim`; `osd` is shipped for orientation and script detection.
