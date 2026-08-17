# Curriculum references — Jordan national + Cambridge international

Source material for the school engines work (grades 5–10, math). Downloaded
from official sources only.

## jordan-nccd/ — Jordan Ministry of Education / National Center for Curriculum Development

`framework/` — the standards layer:
- `jordan-math-standards-outcomes-2021.pdf` — general and specific frameworks
  for mathematics: standards, learning outcomes, and performance indicators
  (الأطر العامة والخاصة للرياضيات ومعاييرها ومؤشرات أدائها, 2021)
- `jordan-general-curriculum-framework-2020.pdf` — the umbrella framework for
  all Jordanian curricula (الإطار العام للمناهج الأردنية, 2020), for context
  on how math fits the wider system

`textbooks/gradeNN/` — the actual content, grades 5 through 10, both
semesters, student book + workbook, current cycle:
- `gradeNN-sem1-student.pdf` / `gradeNN-sem1-workbook.pdf` (2026–2027 edition)
- `gradeNN-sem2-student.pdf` / `gradeNN-sem2-workbook.pdf` (2025 edition)

All pulled directly from nccd.gov.jo's public textbook archive.

## cambridge/ — Cambridge International

- `cambridge-primary-brochure.pdf` — programme overview, roughly grade 5–6 band
- `cambridge-lower-secondary-brochure.pdf` — programme overview, roughly grade 7–9 band
- `cambridge-lower-secondary-maths-curriculum-outline.pdf` — the public outline
  of the 0862 Lower Secondary Mathematics framework (the full framework with
  detailed learning objectives sits behind Cambridge's school-login support
  site and wasn't accessible without credentials)
- `cambridge-igcse-mathematics-0580-syllabus-2025-2027.pdf` — full official
  IGCSE Mathematics syllabus, roughly grade 9–10 band, the most detailed
  Cambridge document here
- `cambridge-vs-national-curriculum-england.pdf` — comparison reference,
  useful for calibrating rigor/level, not a primary source

## text/ — extracted plain text (read this, not the PDFs)

Every PDF above has a plain-text mirror under `text/` at the same relative
path (e.g. `jordan-nccd/textbooks/grade07/grade07-sem1-student.pdf` →
`text/jordan-nccd/textbooks/grade07/grade07-sem1-student.txt`), extracted
with PyMuPDF. These PDFs turned out to have a real text layer (not scans),
so extraction is clean — no OCR needed. Result: 585MB of PDFs → 6.25MB of
text, about 1% of the original size.

**When an AI needs to reference this material, read/grep the `text/` files,
never the PDFs directly** — opening a PDF page-by-page as images (which is
what happens if a PDF is read directly) costs far more tokens per page than
reading the extracted text ever will. Even individual grade files are still
200–400KB (~50–100K tokens), so prefer grepping for a specific lesson/topic
over reading a whole grade file at once.

## Note on size

The PDFs total ~560MB (the Jordan textbooks are image-heavy print PDFs even
though they have a text layer). Don't commit the PDFs to git as-is — either
.gitignore `**/*.pdf` under this folder, or move the PDFs out of the repo
into local reference storage and keep only `text/` (6.25MB) tracked.
