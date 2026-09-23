"""
DOCX Generator for AI Reports
Converts HTML report content into a beautifully formatted DOCX file.
"""
import io
import logging

from bs4 import BeautifulSoup
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Inches, Pt, RGBColor

logger = logging.getLogger(__name__)

def set_cell_background(cell, color_hex):
    """Set cell background color."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Set cell padding (in dxas)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement("w:tcMar")
    for m, val in [("w:top", top), ("w:bottom", bottom), ("w:left", left), ("w:right", right)]:
        node = OxmlElement(m)
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tcMar.append(node)
    tcPr.append(tcMar)

def add_table_borders(table):
    """Add nice subtle borders to a table."""
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        '<w:tblBorders %s>'
        '  <w:top w:val="single" w:sz="4" w:space="0" w:color="D3D3D3"/>'
        '  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="D3D3D3"/>'
        '  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E0E0E0"/>'
        '  <w:left w:val="none"/>'
        '  <w:right w:val="none"/>'
        '  <w:insideV w:val="none"/>'
        '</w:tblBorders>' % nsdecls("w")
    )
    tblPr.append(borders)

def html_to_docx(html_content: str, title: str = "Báo cáo phân tích AI") -> bytes:
    """
    Parse HTML report content and compile it into a beautifully styled DOCX document.
    """
    doc = Document()

    # Configure document margins
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    # Document Title
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_p.paragraph_format.space_before = Pt(20)
    title_p.paragraph_format.space_after = Pt(24)

    title_run = title_p.add_run(title)
    title_run.font.name = "Arial"
    title_run.font.size = Pt(24)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(15, 23, 42) # slate-900

    # Parse HTML body
    soup = BeautifulSoup(html_content, "html.parser")

    # Dynamic themes configuration
    THEME_COLORS = {
        "emerald": {
            "primary_hex": "10B981",
            "text_rgb": RGBColor(6, 95, 70),       # emerald-800
            "prefix_rgb": RGBColor(16, 185, 129)
        },
        "cobalt": {
            "primary_hex": "2563EB",
            "text_rgb": RGBColor(30, 64, 175),      # blue-800
            "prefix_rgb": RGBColor(37, 99, 235)
        },
        "purple": {
            "primary_hex": "8B5CF6",
            "text_rgb": RGBColor(91, 33, 182),      # purple-800
            "prefix_rgb": RGBColor(139, 92, 246)
        },
        "slate": {
            "primary_hex": "475569",
            "text_rgb": RGBColor(30, 41, 59),       # slate-800
            "prefix_rgb": RGBColor(71, 85, 105)
        },
        "crimson": {
            "primary_hex": "D97706",
            "text_rgb": RGBColor(146, 64, 14),      # amber-800
            "prefix_rgb": RGBColor(217, 119, 6)
        }
    }

    # Determine theme
    theme_name = "emerald"
    theme_meta = soup.find("meta", {"name": "theme"})
    if theme_meta and theme_meta.get("content"):
        theme_name = theme_meta.get("content").lower()
    else:
        # Check elements with class containing 'theme-'
        themed_elm = soup.find(class_=True)
        if themed_elm:
            for cls in themed_elm.get("class", []):
                if cls.startswith("theme-"):
                    theme_name = cls.replace("theme-", "").lower()
                    break

    theme_cfg = THEME_COLORS.get(theme_name, THEME_COLORS["emerald"])
    primary_color_hex = theme_cfg["primary_hex"]
    headings_color_rgb = theme_cfg["text_rgb"]
    prefix_color_rgb = theme_cfg["prefix_rgb"]

    # Simple recursive block parsing
    def parse_node(node):
        if not node:
            return

        for child in node.children:
            if child.name is None: # text node
                continue

            if child.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                level = int(child.name[1])
                heading_text = child.get_text().strip()
                if heading_text:
                    h = doc.add_heading(heading_text, level=level)
                    h.paragraph_format.space_before = Pt(14)
                    h.paragraph_format.space_after = Pt(6)
                    h.paragraph_format.keep_with_next = True

                    # Style heading run
                    for run in h.runs:
                        run.font.name = "Georgia"
                        run.font.color.rgb = headings_color_rgb

            elif child.name == "p":
                text = child.get_text().strip()
                if text:
                    p = doc.add_paragraph()
                    p.paragraph_format.space_after = Pt(8)
                    p.paragraph_format.line_spacing = 1.15

                    # Parse child elements of paragraph for bold/italic inline styling
                    for inline in child.children:
                        if inline.name is None:
                            run = p.add_run(str(inline))
                        elif inline.name in ["b", "strong"]:
                            run = p.add_run(inline.get_text())
                            run.font.bold = True
                        elif inline.name in ["i", "em"]:
                            run = p.add_run(inline.get_text())
                            run.font.italic = True
                        elif inline.name == "code":
                            run = p.add_run(inline.get_text())
                            run.font.name = "Courier New"
                            run.font.size = Pt(9.5)
                            run.font.color.rgb = RGBColor(190, 24, 74) # rose-700
                        else:
                            run = p.add_run(inline.get_text())

                        run.font.name = "Arial"
                        run.font.size = Pt(11)
                        run.font.color.rgb = RGBColor(51, 65, 85) # slate-700

            elif child.name in ["ul", "ol"]:
                is_numeric = (child.name == "ol")
                item_idx = 1
                for li in child.find_all("li", recursive=False):
                    text = li.get_text().strip()
                    if text:
                        p = doc.add_paragraph()
                        p.paragraph_format.space_after = Pt(4)
                        p.paragraph_format.left_indent = Inches(0.25)

                        prefix = f"{item_idx}. " if is_numeric else "•  "
                        run_prefix = p.add_run(prefix)
                        run_prefix.font.bold = True
                        run_prefix.font.color.rgb = prefix_color_rgb

                        run_text = p.add_run(text)
                        run_text.font.name = "Arial"
                        run_text.font.size = Pt(11)
                        run_text.font.color.rgb = RGBColor(51, 65, 85)

                        item_idx += 1

            elif child.name == "pre" or child.name == "code":
                code_text = child.get_text().strip()
                if code_text:
                    p = doc.add_paragraph()
                    p.paragraph_format.left_indent = Inches(0.25)
                    p.paragraph_format.space_before = Pt(6)
                    p.paragraph_format.space_after = Pt(6)

                    run = p.add_run(code_text)
                    run.font.name = "Courier New"
                    run.font.size = Pt(10)
                    run.font.color.rgb = RGBColor(30, 41, 59)

            elif child.name == "table":
                rows = child.find_all("tr")
                if not rows:
                    continue

                # Count max columns
                max_cols = 0
                for r in rows:
                    cells = r.find_all(["td", "th"])
                    max_cols = max(max_cols, len(cells))

                if max_cols == 0:
                    continue

                # Create table
                t = doc.add_table(rows=0, cols=max_cols)
                t.autofit = True
                add_table_borders(t)

                is_first_row = True
                for row_idx, r in enumerate(rows):
                    tr_cells = r.find_all(["td", "th"])
                    row = t.add_row()

                    for col_idx, cell_node in enumerate(tr_cells):
                        if col_idx >= max_cols:
                            break

                        cell = row.cells[col_idx]
                        cell.text = cell_node.get_text().strip()

                        # Style cell margins and background
                        set_cell_margins(cell, top=120, bottom=120, left=180, right=180)

                        # Check cell properties
                        is_header = (cell_node.name == "th" or is_first_row)

                        # Style text inside cell
                        p = cell.paragraphs[0]
                        p.paragraph_format.space_after = Pt(0)
                        for run in p.runs:
                            run.font.name = "Arial"
                            run.font.size = Pt(10 if is_header else 9.5)
                            if is_header:
                                run.font.bold = True
                                run.font.color.rgb = RGBColor(255, 255, 255)
                            else:
                                run.font.color.rgb = RGBColor(51, 65, 85)

                        # Apply coloring
                        if is_header:
                            set_cell_background(cell, primary_color_hex)
                        elif row_idx % 2 == 0:
                            set_cell_background(cell, "F8FAFC") # zebra striping slate-50

                    is_first_row = False

                # Add spacing after table
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(12)

            elif child.name == "div":
                # Recursively parse divs
                parse_node(child)

    # Parse soup body
    parse_node(soup)

    # Save document to bytes
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()
