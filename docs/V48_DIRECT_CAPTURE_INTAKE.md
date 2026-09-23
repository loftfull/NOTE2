# NOTE2 v4.8 — Direct Capture Intake

Status: implementation contract for the notebook-first v4.0 shell.

## UX rule

The `+` button must never be decorative and must never force the user through a technical import screen before choosing content.

The capture sheet exposes direct actions for:
- Note
- Task
- Voice recording
- Photo / scan
- Video file
- Audio file
- Document / PDF / Office / EPUB / text
- Link (Instagram / YouTube / web)

## File intake

Native file pickers hand selected files directly into the existing `parseLocalFile -> OCR/vision or transcription when needed -> indexSourceRecord -> Source Vault` pipeline.

Supported direct picker classes include image/*, video/*, audio/*, PDF, DOCX, PPTX, XLSX, ODT/ODS/ODP, EPUB and supported text formats.

The capture payload is guarded by a unique id so React effect replays cannot duplicate one user selection.

## Link intake

A URL is entered directly inside the capture sheet. Clipboard paste is optional convenience only.

`sharedUrlDescriptor()` routes the same action to Instagram / YouTube / ordinary web adapters. Provider-specific choices must not appear as separate primary capture buttons.

## Visual rule

NOTE2 previews must show the application UI itself. Do not draw fake operating-system chrome such as a camera cutout, Dynamic Island, time, cellular status or battery indicator as if they belonged to NOTE2.

Native OS status bars may exist on a physical device, but they are not part of application artwork.

## Verification

v4.8 adds contract tests for native pickers, direct URL saving, clipboard paste and single-consumption capture payload handling. The existing v4.0 shell and unified Source architecture remain binding.
