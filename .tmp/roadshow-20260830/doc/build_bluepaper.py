from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path("/Users/mac/workcode/agentmesh-platform")
OUTPUT = ROOT / "docs/pinme-mesh-architecture-bluepaper-20260830.docx"
HERO = ROOT / "docs/assets/pinme-mesh-architecture-hero-20260830.png"
DASHBOARD = ROOT / ".tmp/roadshow-20260830/screenshots/dashboard.png"
MARKET = ROOT / ".tmp/roadshow-20260830/screenshots/agent-market.png"
TWIN_SLIDE = ROOT / ".tmp/roadshow-20260830/ppt/rendered/slide-6.png"

# narrative_proposal preset with a named pinme-mesh brand override.
FONT = "Hiragino Sans GB"
FONT_CJK = "Hiragino Sans GB"
NAVY = "0D1117"
PANEL = "17232B"
CYAN = "16B8D4"
LIME = "C7FF4A"
WHITE = "FFFFFF"
INK = "151A1E"
MUTED = "66727A"
LINE = "D9E2DE"
PAPER = "F5F7F3"
SOFT_CYAN = "E8F8FB"
SOFT_LIME = "F2FAD9"
SOFT_AMBER = "FFF3DC"
SOFT_RED = "FDEBEC"
AMBER = "D89015"
RED = "D94B50"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for key, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{key}"))
        if node is None:
            node = OxmlElement(f"w:{key}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_cell_border(cell, color=LINE, size=6) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = qn(f"w:{edge}")
        border = borders.find(tag)
        if border is None:
            border = OxmlElement(f"w:{edge}")
            borders.append(border)
        border.set(qn("w:val"), "single")
        border.set(qn("w:sz"), str(size))
        border.set(qn("w:color"), color)


def set_table_fixed(table, widths: Sequence[float]) -> None:
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    layout = tbl_pr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tbl_pr.append(layout)
    layout.set(qn("w:type"), "fixed")
    total_twips = int(sum(widths) * 1440)
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(total_twips))
    tbl_w.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(int(width * 1440)))
        grid.append(col)
    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(int(widths[idx] * 1440)))
            tc_w.set(qn("w:type"), "dxa")
            cell.width = Inches(widths[idx])


def set_run_font(run, name=FONT, size=None, color=None, bold=None, italic=None) -> None:
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK)
    if size is not None:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def add_hyperlink(paragraph, text: str, url: str, color=CYAN, underline=True):
    part = paragraph.part
    rel_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), rel_id)
    run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    color_node = OxmlElement("w:color")
    color_node.set(qn("w:val"), color)
    r_pr.append(color_node)
    if underline:
        u = OxmlElement("w:u")
        u.set(qn("w:val"), "single")
        r_pr.append(u)
    r_fonts = OxmlElement("w:rFonts")
    r_fonts.set(qn("w:ascii"), FONT)
    r_fonts.set(qn("w:hAnsi"), FONT)
    r_fonts.set(qn("w:eastAsia"), FONT_CJK)
    r_pr.append(r_fonts)
    run.append(r_pr)
    t = OxmlElement("w:t")
    t.text = text
    run.append(t)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def add_page_number(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    def field_run(child):
        run = OxmlElement("w:r")
        r_pr = OxmlElement("w:rPr")
        color_node = OxmlElement("w:color")
        color_node.set(qn("w:val"), MUTED)
        r_pr.append(color_node)
        fonts = OxmlElement("w:rFonts")
        fonts.set(qn("w:ascii"), FONT)
        fonts.set(qn("w:hAnsi"), FONT)
        fonts.set(qn("w:eastAsia"), FONT_CJK)
        r_pr.append(fonts)
        run.append(r_pr)
        run.append(child)
        return run

    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    value = OxmlElement("w:t")
    value.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    paragraph._p.extend([field_run(begin), field_run(instr), field_run(separate), field_run(value), field_run(end)])


def set_picture_alt(inline_shape, alt: str) -> None:
    inline_shape._inline.docPr.set("descr", alt)


def add_picture(doc, path: Path, width: float, alt: str, align=WD_ALIGN_PARAGRAPH.CENTER):
    p = doc.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(5)
    shape = p.add_run().add_picture(str(path), width=Inches(width))
    set_picture_alt(shape, alt)
    return shape


def add_caption(doc, text: str) -> None:
    p = doc.add_paragraph(style="Caption")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(7)
    run = p.add_run(text)
    set_run_font(run, size=8.5, color=MUTED, italic=True)


def add_page_title(doc, index: str, title: str, subtitle: str | None = None) -> None:
    p = doc.add_paragraph()
    if getattr(doc, "_page_break_pending", False):
        p.paragraph_format.page_break_before = True
        doc._page_break_pending = False
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(index.upper())
    set_run_font(r, size=8, color=CYAN, bold=True)
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(title)
    set_run_font(r, size=23, color=INK, bold=True)
    if subtitle:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(10)
        r = p.add_run(subtitle)
        set_run_font(r, size=10.5, color=MUTED)


def add_heading(doc, text: str, level=2) -> None:
    p = doc.add_paragraph(style=f"Heading {level}")
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    set_run_font(r, size=15 if level == 2 else 12, color=INK, bold=True)


def add_body(doc, text: str, bold_lead: str | None = None, color=INK) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.22
    if bold_lead and text.startswith(bold_lead):
        r = p.add_run(bold_lead)
        set_run_font(r, size=10.2, color=color, bold=True)
        r = p.add_run(text[len(bold_lead):])
        set_run_font(r, size=10.2, color=color)
    else:
        r = p.add_run(text)
        set_run_font(r, size=10.2, color=color)


def add_bullets(doc, items: Iterable[str], color=INK) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.left_indent = Inches(0.22)
        p.paragraph_format.first_line_indent = Inches(-0.13)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.16
        r = p.add_run(item)
        set_run_font(r, size=9.8, color=color)


def add_callout(doc, title: str, body: str, fill=SOFT_CYAN, accent=CYAN) -> None:
    table = doc.add_table(rows=1, cols=2)
    set_table_fixed(table, [0.12, 6.38])
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    left, right = table.rows[0].cells
    set_cell_shading(left, accent)
    set_cell_shading(right, fill)
    for cell in (left, right):
        set_cell_border(cell, fill, 0)
        set_cell_margins(cell, 85, 115, 85, 115)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p = right.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title)
    set_run_font(r, size=10, color=INK, bold=True)
    p = right.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(body)
    set_run_font(r, size=9.2, color=MUTED)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.line_spacing = Pt(1)
    set_run_font(spacer.add_run(" "), size=1)


def add_metric_grid(doc, metrics: Sequence[tuple[str, str, str]]) -> None:
    table = doc.add_table(rows=2, cols=2)
    set_table_fixed(table, [3.18, 3.18])
    idx = 0
    for row in table.rows:
        row.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
        row.height = Inches(0.88)
        for cell in row.cells:
            set_cell_shading(cell, PAPER)
            set_cell_border(cell, LINE, 6)
            set_cell_margins(cell, 105, 130, 100, 130)
            value, label, note = metrics[idx]
            idx += 1
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(value)
            set_run_font(r, size=18, color=CYAN if idx % 2 else LIME, bold=True)
            p = cell.add_paragraph()
            p.paragraph_format.space_after = Pt(1)
            r = p.add_run(label)
            set_run_font(r, size=9.5, color=INK, bold=True)
            p = cell.add_paragraph()
            r = p.add_run(note)
            set_run_font(r, size=8.2, color=MUTED)


def add_data_table(doc, headers: Sequence[str], rows: Sequence[Sequence[str]], widths: Sequence[float], header_fill=NAVY) -> None:
    table = doc.add_table(rows=1, cols=len(headers))
    set_table_fixed(table, widths)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for idx, text in enumerate(headers):
        cell = table.rows[0].cells[idx]
        set_cell_shading(cell, header_fill)
        set_cell_border(cell, header_fill, 5)
        set_cell_margins(cell, 90, 100, 90, 100)
        p = cell.paragraphs[0]
        r = p.add_run(text)
        set_run_font(r, size=8.8, color=WHITE, bold=True)
    for ridx, values in enumerate(rows):
        cells = table.add_row().cells
        for idx, text in enumerate(values):
            cell = cells[idx]
            set_cell_shading(cell, "FFFFFF" if ridx % 2 == 0 else PAPER)
            set_cell_border(cell, LINE, 5)
            set_cell_margins(cell, 85, 100, 85, 100)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(text)
            set_run_font(r, size=8.6 if len(values) > 3 else 9, color=INK, bold=(idx == 0))
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.line_spacing = Pt(1)
    set_run_font(spacer.add_run(" "), size=1)


def page_break(doc) -> None:
    doc._page_break_pending = True


def build_document() -> Document:
    doc = Document()
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.82)
    section.bottom_margin = Inches(0.75)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.36)
    section.footer_distance = Inches(0.36)
    section.different_first_page_header_footer = True

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = FONT
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK)
    normal.font.size = Pt(10.2)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.22
    styles["Title"].font.name = FONT
    styles["Title"]._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK)
    styles["Caption"].font.name = FONT
    styles["Caption"]._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK)
    for name in ("Heading 1", "Heading 2", "Heading 3"):
        styles[name].font.name = FONT
        styles[name]._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK)
    for name in ("List Bullet", "List Number"):
        styles[name].font.name = FONT
        styles[name]._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK)
        styles[name].font.size = Pt(9.8)

    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("PINME-MESH  /  ARCHITECTURE BLUEPAPER")
    set_run_font(r, size=7.5, color=MUTED, bold=True)
    footer = section.footer
    add_page_number(footer.paragraphs[0])

    props = doc.core_properties
    props.title = "pinme-mesh 架构蓝皮书"
    props.subject = "可信 Agent 编排、可验证交付与结算治理架构"
    props.author = "pinme-mesh"
    props.keywords = "AI Agent, workflow, PinMe, IPFS, Cloudflare Worker, D1, Sepolia"
    props.comments = "Roadshow architecture bluepaper, 2026-08-30"

    # Cover — editorial_cover pattern.
    cover = doc.add_table(rows=1, cols=1)
    set_table_fixed(cover, [6.5])
    cell = cover.cell(0, 0)
    set_cell_shading(cell, NAVY)
    set_cell_border(cell, NAVY, 0)
    set_cell_margins(cell, 320, 300, 280, 300)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(16)
    r = p.add_run("PINME-MESH / ARCHITECTURE BLUEPAPER")
    set_run_font(r, size=9, color=LIME, bold=True)
    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run("把复杂目标，变成\n可验证的 Agent 协作网络")
    set_run_font(r, size=28, color=WHITE, bold=True)
    p = cell.add_paragraph()
    p.paragraph_format.space_after = Pt(14)
    r = p.add_run("可信编排 · 专业 Agent · PinMe/IPFS 成果包 · 测试网结算与贡献治理")
    set_run_font(r, size=11.5, color="B8C7CD")
    p = cell.add_paragraph()
    r = p.add_run("架构蓝皮书 / 融资路演版 / 2026.08.30")
    set_run_font(r, size=8.5, color=CYAN, bold=True)
    add_picture(doc, HERO, 6.5, "pinme-mesh 端到端参考架构主视觉：任务、编排、Agent、证据和结算")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(2)
    r = p.add_run("LIVE  ")
    set_run_font(r, size=8, color=MUTED, bold=True)
    add_hyperlink(p, "mesh-pinme.pinme.dev", "https://mesh-pinme.pinme.dev/", color=CYAN)
    r = p.add_run("   ·   SEPOLIA TESTNET DEMO")
    set_run_font(r, size=8, color=MUTED, bold=True)

    page_break(doc)
    add_page_title(doc, "01 / EXECUTIVE THESIS", "不是让模型多说，而是让复杂工作真正完成", "pinme-mesh 把目标、能力、过程、成果证据与结算放进同一条可审计链路。")
    add_callout(doc, "投资命题", "Agent 经济真正缺少的不是另一个聊天入口，而是一层能把多步骤执行、质量验收、可验证成果和资金状态连接起来的协作基础设施。", fill=SOFT_LIME, accent=LIME)
    add_metric_grid(doc, [
        ("6", "真实 AI 编排步骤", "AI 编排多少步，运行时就执行多少步"),
        ("3", "专业角色 Agent", "Strategy / Evidence / Delivery"),
        ("9", "最终成果包文件", "5 条工作流汇总为客户可读成果"),
        ("4/4", "当前交付核验", "CID、Manifest 与文件哈希可核对"),
    ])
    add_heading(doc, "为什么是一个系统，而不是一组提示词")
    add_bullets(doc, [
        "复杂目标首先被编译成动态 DAG；并行、Join、人工 Gate、重试和 attempt 都由统一状态机约束。",
        "三位内置 Agent 共享 PinMe LLM 接口，但通过角色提示词、上下文边界和输出契约形成专业分工。",
        "成果不是一段 JSON：Worker 自动生成多文件成果包，发布到 PinMe/IPFS，并把根 CID 与版本证据冻结到验收档案。",
        "资金与争议服从独立托管状态；PM 只表示测试网贡献与治理，不与任务原资产混账。",
    ])
    add_callout(doc, "当前验证基线", "线上独立域名已发布；真实任务 TASK-2026-CA9B17 已完成 6 步 / 3 Agent 执行；最终成果包 5 条工作流、9 个文件；后端回归 189/189。", fill=SOFT_CYAN, accent=CYAN)

    page_break(doc)
    add_page_title(doc, "02 / PROBLEM", "传统 LLM 交付在复杂任务上断在哪里", "文本生成可以很快，但任务完成需要状态、责任、证据和结算。")
    add_data_table(doc, ["断点", "聊天式产品", "pinme-mesh 的系统回应"], [
        ("目标", "一句自然语言被压缩成一次回答", "目标被编译为可执行 DAG 与验收标准"),
        ("责任", "没有稳定的角色、阶段和归属", "Agent、阶段、attempt、回调与权限显式绑定"),
        ("质量", "只看文字是否像答案", "Trial、Endpoint 健康、履约统计、结构化反馈与复核"),
        ("成果", "长文本或格式化 JSON", "客户可读的 Markdown / HTML 多文件成果包"),
        ("证据", "链接可变、版本不可核对", "CID、Manifest、逐文件哈希和父版本"),
        ("结算", "协作与资金分离", "托管、验收、冻结、退款与仲裁状态统一"),
    ], [1.05, 2.15, 3.30])
    add_heading(doc, "产品边界的第一原则")
    add_body(doc, "平台只把能够独立使用、能够核对版本、能够进入验收的内容定义为客户交付物。运行时 JSON、内部事件和模型底稿保留为技术证据，但不会伪装成客户价值。")
    add_callout(doc, "价值跃迁", "从“输出答案”升级为“组织执行”：把复杂工作拆分、派发、观察、复核、打包、发布和结算，形成可重复的基础设施。", fill=SOFT_LIME, accent=LIME)
    add_heading(doc, "目标客户与初始场景")
    add_bullets(doc, [
        "需要多步骤研究、分析、内容生产、软件交付或运营执行的任务方。",
        "提供真实 HTTPS Endpoint，希望以可验证履约记录进入市场的 Agent 开发者。",
        "需要验收证据、版本回溯、争议冻结和链上结算边界的协作网络。",
    ])

    page_break(doc)
    add_page_title(doc, "03 / PRODUCT LOOP", "一条链路：从复杂目标到可验证结算", "体验层只展示真实状态；每一步都由控制面与证据层支撑。")
    flow = doc.add_table(rows=2, cols=5)
    set_table_fixed(flow, [1.26, 1.26, 1.26, 1.26, 1.26])
    titles = ["01 目标", "02 编排", "03 执行", "04 证据", "05 结算"]
    notes = ["结果、预算、验收标准", "动态 DAG / Gate / Join", "Agent 派发、回调、重试", "CID / Manifest / 版本", "验收、冻结、PM"]
    fills = [NAVY, CYAN, NAVY, LIME, NAVY]
    for idx, title in enumerate(titles):
        c = flow.rows[0].cells[idx]
        set_cell_shading(c, fills[idx])
        set_cell_border(c, WHITE, 10)
        set_cell_margins(c, 130, 85, 130, 85)
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(title)
        set_run_font(r, size=10, color=INK if fills[idx] == LIME else WHITE, bold=True)
        c = flow.rows[1].cells[idx]
        set_cell_shading(c, PAPER)
        set_cell_border(c, WHITE, 10)
        set_cell_margins(c, 105, 75, 105, 75)
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(notes[idx])
        set_run_font(r, size=8.2, color=MUTED)
    add_heading(doc, "运行时的关键约束")
    add_data_table(doc, ["阶段", "系统行为", "不允许发生"], [
        ("编排", "AI 返回 N 步，前端与 Worker 都保存并执行 N 步", "固定改成 3 步或把隐藏步骤合并"),
        ("派发", "多根并行；Join 等待全部前驱；Gate 等待人类决策", "跳过依赖或让 Gate 接单/分账"),
        ("重试", "返工生成新 attempt，旧版本继续留在审计历史", "用新输出覆盖旧 CID"),
        ("验收", "只选择当前 attempt 的客户可用制品", "让迟到回调污染已冻结档案"),
        ("争议", "验收释放与争议冻结只能一个分支成功", "并发双结算或重复退款"),
    ], [1.0, 3.05, 2.45])
    add_callout(doc, "可观察性", "阶段状态、进度、事件、派发、回调、成果和结算都进入同一任务时间线；SSE 不可用时前端降级为轮询。", fill=SOFT_CYAN, accent=CYAN)

    page_break(doc)
    add_page_title(doc, "04 / REFERENCE ARCHITECTURE", "五层架构，把能力和信任边界分开", "生成主视觉负责表达系统关系；下面的可编辑图例负责精确技术定义。")
    add_picture(doc, HERO, 6.5, "pinme-mesh 五层参考架构：体验、控制面、Agent 智能、证据、结算治理")
    add_caption(doc, "图 1：复杂目标 → DAG 编译 → 多 Agent 执行 → 复核验收 → PinMe/IPFS 成果 → 结算治理")
    legend = doc.add_table(rows=1, cols=5)
    set_table_fixed(legend, [1.3] * 5)
    for idx, (title, fill) in enumerate(zip(["体验层", "控制面", "智能层", "证据层", "结算层"], [PANEL, CYAN, PANEL, LIME, PANEL])):
        c = legend.rows[0].cells[idx]
        set_cell_shading(c, fill)
        set_cell_border(c, WHITE, 8)
        set_cell_margins(c, 100, 70, 100, 70)
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(title)
        set_run_font(r, size=9, color=INK if fill == LIME else WHITE, bold=True)
    add_callout(doc, "架构判断", "前端可以静态托管在 IPFS；真正的控制面在 Worker；信任锚分布在 D1 事件账本、不可变 CID 与 Sepolia 公开状态中。", fill=SOFT_LIME, accent=LIME)

    page_break(doc)
    add_page_title(doc, "05 / LAYER SPECIFICATION", "当前可运行的系统分层", "每一层只承担自己能证明的责任，不把浏览器、模型或域名当作信任根。")
    add_data_table(doc, ["层", "当前组件", "核心责任", "信任边界"], [
        ("Experience", "React + Vite + Hash Router", "任务方/开发者工作台、DAG、验收、3D、钱包", "不保存私钥或明文 AppKey"),
        ("Control", "Cloudflare Worker", "认证授权、状态机、派发、回调、验收、上传、CORS", "所有外部输入在边界校验"),
        ("State", "D1 + migrations", "任务、阶段、事件、制品、托管、质量、凭据密文", "追加式事件与原子不变量"),
        ("Intelligence", "PinMe chat/completions", "工作流编译与三角色内置 Agent 运行", "模型失败时节点失败，不交付兜底 JSON"),
        ("Evidence", "PinMe / IPFS", "多文件成果包、CID、Manifest、版本链、冻结快照", "公共内容不可删除；敏感内容先加密"),
        ("Settlement", "Sepolia contracts", "mUSDC/sETH 托管、释放、冻结、退款、PM/Power", "用户钱包签名；Worker 只验证"),
    ], [0.85, 1.55, 2.35, 1.75])
    add_heading(doc, "部署拓扑")
    add_bullets(doc, [
        "Web：构建后的 frontend/dist 通过 PinMe 发布到 IPFS，并绑定独立 PinMe Domain。",
        "API：PinMe Worker Endpoint 提供控制面；新前端域名必须进入 CORS 白名单并通过 GET 与 OPTIONS 验证。",
        "Data：D1 迁移按编号回放；新增证据、运行控制和用户凭据优先使用 companion table，保留旧数据兼容。",
        "Chain：浏览器读取 Sepolia 公共 RPC，并由用户钱包发起交易；平台没有代签能力。",
    ])
    add_callout(doc, "可替换性", "体验层、模型路由、IPFS Gateway 和链网络都可以演进；任务状态机、证据语义和验收边界是更稳定的深层模块。", fill=SOFT_CYAN, accent=CYAN)

    page_break(doc)
    add_page_title(doc, "06 / CONTROL PLANE", "工作流编译器与单一状态机", "复杂性向下沉：让用户看见流程，但不承担并发、幂等和失败恢复细节。")
    add_heading(doc, "编译阶段")
    add_bullets(doc, [
        "接收目标、预算、领域与验收标准，输出动态步骤数量、节点类型、依赖边和 Agent 能力要求。",
        "验证 DAG 无环、节点 ID 唯一、依赖存在、任务节点可分配 Agent；Gate 不参与报价和分账。",
        "支持 AI 草稿与空白画布；确认工作流后生成绑定任务、版本、阶段和 Agent 的邀请。",
    ])
    add_heading(doc, "执行阶段")
    add_data_table(doc, ["机制", "实现语义", "投资价值"], [
        ("Parallel / Join", "多根节点并行；Join 等待全部前驱", "处理真实复杂任务，而非线性对话"),
        ("Attempt", "每次返工生成新 attempt 与新证据归属", "历史不被覆盖，可复盘质量"),
        ("Outbox / Callback", "派发与签名回调进入受控命令路径", "外部 Agent 可以接入但不能越权"),
        ("Idempotency", "键绑定用户、方法、路径与规范体哈希", "重放不重复扣款、派发或结算"),
        ("Runtime Control", "暂停、继续、取消、重试与变更请求", "长任务可运营、可介入"),
    ], [1.15, 3.10, 2.25])
    add_callout(doc, "不可变不变量", "迟到回调不能覆盖首次终态；验收只结算一次；争议最多一个活跃分支；冻结快照之后的新提交不能污染案件。", fill=SOFT_AMBER, accent=AMBER)

    page_break(doc)
    add_page_title(doc, "07 / AGENT RUNTIME", "共享智能底座，专业角色运行时", "当前内置 Agent 共用 PinMe LLM，但角色不是文案标签，而是执行契约。")
    add_data_table(doc, ["角色", "核心任务", "上下文与输出约束"], [
        ("Evidence Scout", "证据研究、来源梳理、事实核对", "输出可审计研究结果；标注限制、缺口与风险"),
        ("Strategy Analyst", "目标拆解、比较方案、关键决策", "形成选择、权衡、优先级和下一步行动"),
        ("Delivery Writer", "核心生产、整合、独立复核与最终交付", "生成客户可直接使用的结构化成果，而非运行 JSON"),
    ], [1.35, 2.10, 3.05])
    add_callout(doc, "当前模型事实", "三位内置 Agent 调用同一 PinMe LLM Endpoint，默认模型 openai/gpt-5.6-sol；差异来自系统提示词、阶段上下文、前序交接和输出 Schema。", fill=SOFT_LIME, accent=LIME)
    add_heading(doc, "内置与第三方 Agent 的统一边界")
    add_data_table(doc, ["能力", "内置 Agent", "第三方 Agent"], [
        ("执行", "Worker 调用 PinMe LLM", "平台派发到真实 HTTPS Endpoint"),
        ("准入", "官方测试角色", "随机挑战 Trial、协议与健康检查"),
        ("结果", "结构化输出 + Worker 打包发布", "签名回调 + 已发布制品 CID"),
        ("质量", "角色门禁、复核、客户制品策略", "履约、延迟、反馈、风险事件、shadow/enforce"),
        ("失败", "模型不可用即失败并允许重试", "Endpoint/签名/超时失败进入受控状态"),
    ], [1.05, 2.65, 2.80])
    add_body(doc, "多模型路由只替换执行资源，不改变 Agent 契约；角色、阶段、证据与验收仍由控制面定义。")

    page_break(doc)
    add_page_title(doc, "08 / VERIFIABLE DELIVERY", "客户收到成果，平台保存证据", "PinMe/IPFS 的价值不只是上传，而是把交付版本变成可核对对象。")
    add_data_table(doc, ["节点产物", "客户可见性", "发布策略"], [
        ("Analyze 底稿", "内部工作证据", "不单独伪装为收费交付物"),
        ("Implement 制品", "可独立使用的阶段成果", "按策略发布并登记 CID/Manifest"),
        ("Terminal 成果包", "默认客户交付", "汇总所有完成阶段和当前 attempt 制品"),
    ], [1.45, 2.05, 3.00])
    add_heading(doc, "完整成果包")
    add_bullets(doc, [
        "index.html：可直接打开的成果入口；deliverable.md：统一 Markdown 正文。",
        "acceptance-report.md：验收标准对应关系；artifact-index.md：制品与来源索引。",
        "workstreams/*.md：分工作流成果；manifest.json：schema、文件哈希、上下文与版本信息。",
    ])
    add_heading(doc, "证据链")
    add_data_table(doc, ["证据", "解决的问题"], [
        ("根 CID", "内容寻址，固定本次完整成果包"),
        ("Manifest SHA-256", "固定清单语义与文件集合"),
        ("逐文件 SHA-256", "核对文件增删与内容变化"),
        ("version / parent CID", "新版本引用旧版本，形成不可覆盖时间线"),
        ("stage / attempt", "防止返工、迟到回调或旧制品混入当前验收"),
        ("frozen snapshot", "验收或争议时冻结确定性审核档案"),
    ], [2.0, 4.5])
    add_callout(doc, "Domain ≠ Evidence", "同一个 CID 可以绑定多个 PinMe Domain；可读域名服务体验，不可变 CID 与哈希才是验收和纠纷的证据锚。", fill=SOFT_CYAN, accent=CYAN)

    page_break(doc)
    add_page_title(doc, "09 / SECURITY & TRUST", "秘密、状态和公共内容各归其位", "安全架构首先声明什么不能承诺，再为每个边界建立验证。")
    add_data_table(doc, ["边界", "敏感资产", "控制"], [
        ("Browser", "钱包私钥、PinMe AppKey", "私钥只在钱包；AppKey 只提交一次且不持久化"),
        ("Worker", "项目 API Key、临时明文 AppKey", "只在内存解密；认证授权、速率、CORS、输入验证"),
        ("D1", "用户凭据与业务状态", "AES-GCM 密文信封；用户隔离；事件与原子不变量"),
        ("PinMe/IPFS", "成果内容", "默认公开；敏感文件必须上传前加密，只记录密钥指纹"),
        ("Gateway", "外部内容读取", "固定 HTTPS Gateway、超时、大小、重定向限制，禁止任意 URL"),
        ("Sepolia", "托管与治理状态", "用户签名；Worker 验证交易、事件、链 ID 与确认数"),
    ], [1.05, 2.05, 3.40])
    add_heading(doc, "关键防线")
    add_bullets(doc, [
        "模型输出不合法、缺少客户正文或上传协议不匹配时 fail closed；不生成伪交付。",
        "普通事件接口不能直接修改规范状态；只有受控命令和签名回调可以推进阶段。",
        "幂等键绑定语义；重放、并发验收和迟到裁决不会造成重复结算。",
        "公开 IPFS 不承诺删除或永久可用；可用性和保密性与完整性分别建模。",
    ])
    add_callout(doc, "当前安全边界", "这是测试网演示架构，不等同于主网安全审计结论。合约 v2、安全审计与生产密钥治理完成前，不启用真实价值或自动代签。", fill=SOFT_RED, accent=RED)

    page_break(doc)
    add_page_title(doc, "10 / SETTLEMENT & GOVERNANCE", "任务原资产、收益与贡献治理彼此解耦", "结算逻辑必须比模型逻辑更确定，因此被隔离到可验证状态机与链上事件。")
    add_data_table(doc, ["账本", "资产 / 单位", "用途", "边界"], [
        ("任务托管", "CREDIT / mUSDC / sETH", "预算锁定、验收释放、冻结与退款", "不与 PM 混账"),
        ("开发者收益", "按原任务资产分账", "记录每次有效履约收益", "按资产隔离汇总"),
        ("PM 奖励", "pinme-mesh Contribution / PM", "已验收、已结算贡献的测试周期奖励", "不代表 PinMe 官方代币"),
        ("治理 Power", "锁仓期限 × 信誉", "治理权与历史快照", "不承诺收益或价格"),
    ], [1.15, 1.55, 2.30, 1.50])
    add_heading(doc, "Sepolia 当前组件")
    add_bullets(doc, [
        "AgentMeshEscrow：mUSDC / 原生 sETH 托管，payoutHash 固定分账承诺。",
        "PM Token：0xfdf06a468dcc7464c3871057acd863d6bc514bae。",
        "Reward Distributor：0x852c36af469f0eea10c6aa26cf9489423c7d037e。",
        "Staking / Power：0x9875e2eabe942dd9f8dd0e7bcb6f36071040a5c2。",
    ])
    add_callout(doc, "治理约束", "争议投票只产生执行授权，不能替代独立链上交易；涉案任务方、发起人和 Agent 所有者必须回避。", fill=SOFT_AMBER, accent=AMBER)

    page_break(doc)
    add_page_title(doc, "11 / DIGITAL TWIN", "让 Agent 像员工一样进入空间状态", "3D 指挥舱是状态的数字孪生与产品差异化入口，不是执行引擎本身。")
    add_picture(doc, TWIN_SLIDE, 6.5, "pinme-mesh 3D Agent 数字孪生指挥舱的当前产品展示")
    add_caption(doc, "图 2：工作中的 Agent 回到工位；待命、试炼、暂停与异常映射到不同空间和动作。")
    add_data_table(doc, ["Agent 状态", "空间行为", "业务来源"], [
        ("executing", "回到自己的工位操作与显示任务进度", "真实阶段执行状态"),
        ("assigned", "在任务台等待接单或邀请", "offer / assignment"),
        ("ready", "休息区自由溜达，不原地循环跳", "Endpoint 健康且无任务"),
        ("trial", "训练区挑战动作", "Agent Trial"),
        ("paused / attention", "维修区检修或警示", "运行控制与质量风险"),
    ], [1.25, 2.65, 2.60])
    add_body(doc, "Nouns 启发的像素识别元素与低多边形潮玩体态；全场景碰撞，镜头可旋转，缩放限制 ±20%。")

    page_break(doc)
    add_page_title(doc, "12 / PRODUCT SURFACES", "从任务驾驶舱到能力市场", "同一底层状态，在任务方与开发者两侧呈现不同的操作面。")
    pics = doc.add_table(rows=1, cols=2)
    set_table_fixed(pics, [3.18, 3.18])
    for idx, (path, title, alt) in enumerate([
        (DASHBOARD, "任务方工作台", "pinme-mesh 当前任务方工作台截图"),
        (MARKET, "Agent 市场", "pinme-mesh 当前 Agent 市场截图"),
    ]):
        cell = pics.rows[0].cells[idx]
        set_cell_shading(cell, PAPER)
        set_cell_border(cell, LINE, 6)
        set_cell_margins(cell, 80, 80, 80, 80)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        shape = p.add_run().add_picture(str(path), width=Inches(3.02))
        set_picture_alt(shape, alt)
        p = cell.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(title)
        set_run_font(r, size=9.5, color=INK, bold=True)
    add_heading(doc, "产品信息架构")
    add_data_table(doc, ["任务方", "开发者", "共同能力"], [
        ("工作台、发布任务、我的任务、验收、测试充值", "概览、我的 Agent、注册、接单、收益", "ENS 身份、设置、通知"),
        ("DAG、执行、交付、争议、仲裁", "Trial、Endpoint 健康、履约和质量", "PM 贡献与治理"),
        ("预算、托管、释放或冻结", "接单、签名回调、收益账本", "公开 Agent 能力市场"),
    ], [2.17, 2.17, 2.16])
    add_callout(doc, "设计原则", "炫技模块必须服务状态理解：3D 负责空间直觉，列表与审计负责精确操作；WebGL 失败时仍保留可用的降级路径。", fill=SOFT_LIME, accent=LIME)

    page_break(doc)
    add_page_title(doc, "13 / DEMONSTRATED PROOF", "演示版已经跑通什么", "下面只列当前仓库、线上部署和真实冒烟任务能够支撑的事实。")
    add_data_table(doc, ["验证项", "当前证据"], [
        ("线上 Web", "https://mesh-pinme.pinme.dev/；独立 PinMe Domain"),
        ("前端内容", "CID bafybeihuewiymgcgotoncbiya6hove5qtqgvaakb4dapxmsuyinykuiy5u"),
        ("Worker", "https://agentmesh-platform-74a3.api.pinme.pro"),
        ("真实任务", "TASK-2026-CA9B17：6 步、3 个角色 Agent"),
        ("最终交付", "5 条工作流、9 个文件；https://688355bf.pinme.dev/"),
        ("交付核验", "当前 4/4；根 CID bafybeiasx23e4dqxfim6v5ahmgehswwwfdcw3az34dwiui26erwoyogymq"),
        ("工程验证", "前端生产构建通过；后端回归 189/189；线上 CORS GET 200 / OPTIONS 204"),
    ], [1.45, 5.05])
    add_heading(doc, "6 步真实执行")
    add_bullets(doc, [
        "目标拆解 — Strategy Analyst",
        "证据研究 — Evidence Scout",
        "核心执行与结构化交付 — Delivery Writer",
        "发布准备与运行验证 — Evidence Scout",
        "方案设计与关键决策 — Strategy Analyst",
        "独立复核与最终交付 — Delivery Writer",
    ])
    add_callout(doc, "演示重点", "现场先展示“AI 编排多少步就执行多少步”，再切换 3D 状态、自动 PinMe 成果包和 Markdown 验收，最后说明结算与证据冻结。", fill=SOFT_CYAN, accent=CYAN)

    page_break(doc)
    add_page_title(doc, "14 / DEFENSIBILITY", "护城河：协作数据与信任结构", "模型能力会快速扩散；任务过程、证据语义与可验证履约记录更难复制。")
    add_data_table(doc, ["防御层", "复利机制", "为什么难复制"], [
        ("Workflow graph", "目标、依赖、attempt、Gate 和变更形成执行图谱", "需要真实长任务和状态机工程"),
        ("Evidence graph", "CID、Manifest、版本、验收与争议形成证据图谱", "必须同时处理产品体验与完整性语义"),
        ("Agent quality", "Trial、健康、履约、反馈和风险沉淀信誉", "需要双边市场和可审计的数据来源"),
        ("Settlement state", "任务资产、收益、贡献与治理分账隔离", "金融状态容错率低，规则必须长期稳定"),
        ("Spatial observability", "3D 让复杂运行状态形成品牌化空间表达", "需要实时状态、交互设计和工程性能共同支撑"),
    ], [1.35, 2.70, 2.45])
    add_heading(doc, "深层模块")
    add_bullets(doc, [
        "对上提供简单接口：创建任务、确认工作流、运行、验收、争议。",
        "对下吸收复杂性：幂等、并发、回调、版本、密钥、Gateway、链确认和迁移兼容。",
        "让模型、Agent Endpoint、前端域名和链网络都可以替换，而不破坏交付语义。",
    ])
    add_callout(doc, "长期网络效应", "任务越复杂，平台越能积累可复用工作流、角色分工、质量先验和证据模板；这些数据又反过来降低下一次任务的编排与验收成本。", fill=SOFT_LIME, accent=LIME)

    page_break(doc)
    add_page_title(doc, "15 / ROADMAP & USE OF FUNDS", "从测试网闭环走向可扩展协作网络", "路线图先提升可靠性和生态，再进入真实价值环境；以下是方向，不构成预算或收益承诺。")
    add_data_table(doc, ["阶段", "产品里程碑", "关键门槛"], [
        ("Now", "动态 DAG、三角色 Agent、自动 PinMe 成果、3D、Sepolia", "持续回归与演示稳定性"),
        ("Next", "多模型路由、工具 Agent、第三方连接器、空间状态回放", "统一 Agent 契约与质量观测"),
        ("Enterprise", "租户策略、加密交付、审计导出、SLA、私有连接", "密钥治理、合规与可用性"),
        ("Protocol", "合约 v2、正式安全审计、生产结算设计", "主网上线单独决策"),
    ], [0.95, 3.60, 1.95])
    add_heading(doc, "融资用途方向")
    add_data_table(doc, ["方向", "投入重点"], [
        ("产品与 Agent 生态", "多模型/工具路由、第三方 Agent SDK、行业工作流模板"),
        ("可靠性与安全", "状态机压力测试、密钥治理、合约与 Worker 审计、观测性"),
        ("企业交付", "租户隔离、加密证据、审计档案、权限和 SLA"),
        ("开发者增长", "Trial 工具、质量数据、收益体验与 Agent 市场分发"),
        ("品牌与路演", "3D 数字孪生、可分享任务回放、演示资产和生态合作"),
    ], [1.50, 5.00])
    add_callout(doc, "资本纪律", "不以主网、代币价格或收益承诺换取短期叙事；资金优先投入可验证交付、Agent 质量和安全状态机。", fill=SOFT_AMBER, accent=AMBER)

    page_break(doc)
    add_page_title(doc, "16 / RISKS & DILIGENCE", "明确边界，才有资格讨论规模化", "本页列出当前最重要的技术与产品风险，以及架构已经采取或下一步应采取的措施。")
    add_data_table(doc, ["风险", "当前边界", "应对"], [
        ("LLM 不稳定", "同一模型可能失败或格式偏移", "Schema 校验、节点失败/重试、独立复核、多模型路由"),
        ("IPFS 公开与可用性", "公开内容不可删除，不保证永久在线", "客户端加密、CAR 留存、Gateway 状态分离"),
        ("上传协议适配", "Worker 复用已验证 PinMe CLI 协议", "版本化适配器、回归测试、正式 API 后迁移"),
        ("测试网到主网", "当前只在 Sepolia 演示", "合约 v2、安全审计、资金边界与合规单独审批"),
        ("第三方 Agent", "Endpoint 质量与凭据风险", "Trial、健康检查、签名回调、shadow/enforce 门禁"),
        ("3D 性能", "WebGL/设备差异", "最多 8 Agent、降级界面、列表与审计保底"),
    ], [1.45, 2.30, 2.75])
    add_heading(doc, "尽调清单")
    add_bullets(doc, [
        "复核任务状态机的并发测试、D1 迁移回放、CORS 和 Endpoint 签名边界。",
        "抽查成果包 Manifest、逐文件哈希、父版本、attempt 归属和冻结档案。",
        "验证 Worker 不返回明文 PinMe AppKey，前端包与日志不含私钥或助记词。",
        "在任何真实价值上线前完成独立合约审计、生产密钥方案和事故响应演练。",
    ])
    add_callout(doc, "非承诺声明", "PM 是 pinme-mesh 测试网贡献与治理品牌，不代表 PinMe 官方发行或背书；本文不构成代币、价格、收益或主网上线承诺。", fill=SOFT_RED, accent=RED)

    page_break(doc)
    add_page_title(doc, "APPENDIX / SOURCES", "实现依据与演示入口", "本文基于 2026-08-30 的仓库快照、线上 UI 与已完成冒烟任务。")
    add_heading(doc, "产品与架构文档")
    add_bullets(doc, [
        "docs/prd.md — 产品目标、用户旅程、功能、安全、部署基线与边界。",
        "docs/meshpin-ipfs-evidence.md — PinMe/IPFS 发布、Manifest、版本、冻结档案与 Gateway。",
        "docs/worker_service_api.md — PinMe Worker 内部 API 认证与 chat/completions 约定。",
        "docs/backend-api.md — 平台 API 行为与状态边界。",
    ])
    add_heading(doc, "关键实现")
    add_bullets(doc, [
        "backend/src/worker.ts — API、认证授权、状态机、派发、验收、争议、LLM 和自动交付。",
        "backend/src/workflowCompiler.ts — 动态 DAG 编译与验证。",
        "backend/src/clientDelivery.ts / pinmeUpload.ts / pinmeCredentials.ts — 多文件成果包、上传与凭据密文。",
        "backend/src/ipfsEvidence.ts / agentQuality.ts / ydChain.ts — 证据、质量与测试网治理。",
        "db/002_agentmesh_core.sql、016、019、020、021、022、026、029 — 任务、DAG、质量、运行控制、证据与凭据。",
        "contracts/AgentMeshEscrow.sol、TestYDToken.sol、YDRewardDistributor.sol、YDStaking.sol — 测试网结算与 PM/Power。",
    ])
    add_heading(doc, "在线入口")
    for label, url in [
        ("pinme-mesh 演示", "https://mesh-pinme.pinme.dev/"),
        ("真实任务最终成果包", "https://688355bf.pinme.dev/"),
        ("Worker Endpoint", "https://agentmesh-platform-74a3.api.pinme.pro"),
    ]:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.left_indent = Inches(0.22)
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(f"{label}：")
        set_run_font(r, size=9.8, color=INK, bold=True)
        add_hyperlink(p, url, url)
    add_callout(doc, "文档状态", "架构蓝皮书用于产品、技术尽调与融资路演沟通；部署地址、CID、测试数和合约地址会随版本演进，引用时应注明快照日期。", fill=SOFT_CYAN, accent=CYAN)

    return doc


if __name__ == "__main__":
    document = build_document()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.save(OUTPUT)
    print(OUTPUT)
