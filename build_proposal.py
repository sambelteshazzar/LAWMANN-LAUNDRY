#!/usr/bin/env python3
"""
Builds the Lawmann Laundry Service owner proposal as .docx, then converts to PDF.

    python3 build_proposal.py
    soffice --headless --convert-to pdf Lawmann_Proposal.docx

Edit the CONTENT section at the bottom to change wording; rerun to regenerate.
"""

import os
import subprocess
from datetime import date

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
DOCX = os.path.join(HERE, "Lawmann_Proposal.docx")
PDF = os.path.join(HERE, "Lawmann_Proposal.pdf")
POSTER = os.path.join(HERE, "assets", "price-list.png")

DEVELOPER = "Daniel Sam"
PHONE = "+233 596 257 218"

NAVY = RGBColor(0x1F, 0x38, 0x64)
INK = RGBColor(0x1A, 0x1A, 0x1A)
GREY = RGBColor(0x5A, 0x63, 0x72)
RED = RGBColor(0x9B, 0x2C, 0x2C)

BOX_FILL = "EDF2F8"
BLANK_FILL = "FBF3E4"
NOTE_FILL = "F4F6F9"
BORDER = "C9D4E3"


# ---------------------------------------------------------------- primitives


def _el(tag, **attrs):
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn("w:" + k), str(v))
    return e


def shade(cell, fill):
    cell._tc.get_or_add_tcPr().append(
        _el("w:shd", val="clear", color="auto", fill=fill)
    )


def table_borders(table, color=BORDER, sz=4, none=False):
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        if none:
            borders.append(_el("w:" + edge, val="nil"))
        else:
            borders.append(
                _el("w:" + edge, val="single", sz=sz, space=0, color=color)
            )
    table._tbl.tblPr.append(borders)


def cell_margins(table, top=80, bottom=80, left=120, right=120):
    mar = OxmlElement("w:tblCellMar")
    for side, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        mar.append(_el("w:" + side, w=val, type="dxa"))
    table._tbl.tblPr.append(mar)


def hrule(paragraph, color=BORDER, sz=6, space=4):
    pbdr = OxmlElement("w:pBdr")
    pbdr.append(_el("w:bottom", val="single", sz=sz, space=space, color=color))
    paragraph._p.get_or_add_pPr().append(pbdr)


def keep_together(table):
    """Stop a table row being split across a page."""
    for row in table.rows:
        row._tr.get_or_add_trPr().append(_el("w:cantSplit", val="true"))


def repeat_header(table):
    """Repeat the header row when a table spans a page break."""
    trPr = table.rows[0]._tr.get_or_add_trPr()
    trPr.append(OxmlElement("w:tblHeader"))


# ------------------------------------------------------------------- styles


def build_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    pf = normal.paragraph_format
    pf.space_after = Pt(7)
    pf.line_spacing = 1.15

    for name, size, before, after in (
        ("Heading 1", 15, 20, 8),
        ("Heading 2", 12, 14, 5),
        ("Heading 3", 10.5, 11, 3),
    ):
        st = doc.styles[name]
        st.font.name = "Calibri"
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.italic = False
        st.font.color.rgb = NAVY
        st._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
        st.paragraph_format.space_before = Pt(before)
        st.paragraph_format.space_after = Pt(after)
        st.paragraph_format.keep_with_next = True


# -------------------------------------------------------------- components


def h1(doc, text):
    return doc.add_heading(text, level=1)


def h2(doc, text):
    return doc.add_heading(text, level=2)


def h3(doc, text):
    return doc.add_heading(text, level=3)


def para(doc, text, size=10.5, bold=False, italic=False, color=INK,
         after=7, align=None, before=0):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.space_before = Pt(before)
    if align is not None:
        p.alignment = align
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    return p


def rich(doc, parts, size=10.5, after=7, align=None, before=0):
    """parts = [(text, {'b':True,'i':True,'c':RGBColor,'size':pt}), ...]"""
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.space_before = Pt(before)
    if align is not None:
        p.alignment = align
    for text, fmt in parts:
        r = p.add_run(text)
        r.font.size = Pt(fmt.get("size", size))
        r.font.bold = fmt.get("b", False)
        r.font.italic = fmt.get("i", False)
        r.font.color.rgb = fmt.get("c", INK)
    return p


def bullet(doc, text, lead=None, style="List Bullet"):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.left_indent = Cm(0.7)
    if lead:
        r = p.add_run(lead)
        r.font.bold = True
        r.font.size = Pt(10.5)
        r.font.color.rgb = NAVY
    r = p.add_run(text)
    r.font.size = Pt(10.5)
    return p


def numbered(doc, text, lead=None, n=1):
    """Manually numbered item. python-docx's List Number style shares one
    numbering sequence across the whole document, so every list after the first
    continues from where the last one stopped. Writing the digits as text keeps
    full control and each list restarts at 1."""
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.left_indent = Cm(1.15)
    p.paragraph_format.first_line_indent = Cm(-0.75)
    r = p.add_run(f"{n}.\t")
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = NAVY
    if lead:
        r = p.add_run(lead)
        r.font.bold = True
        r.font.size = Pt(10.5)
        r.font.color.rgb = NAVY
    r = p.add_run(text)
    r.font.size = Pt(10.5)
    return p


def box(doc, lines, fill=BOX_FILL, border=BORDER, bar=True, after=10):
    """Single-cell shaded callout, optional thick left bar."""
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    cell = t.cell(0, 0)
    cell.width = Cm(16)
    shade(cell, fill)
    table_borders(t, none=True)
    cell_margins(t, 140, 140, 200, 200)

    if bar:
        borders = OxmlElement("w:tcBorders")
        borders.append(_el("w:left", val="single", sz=24, space=0, color="1F3864"))
        cell._tc.get_or_add_tcPr().append(borders)

    cell.paragraphs[0]._p.getparent().remove(cell.paragraphs[0]._p)
    for i, (text, fmt) in enumerate(lines):
        p = cell.add_paragraph()
        p.paragraph_format.space_after = Pt(fmt.get("after", 3 if i < len(lines) - 1 else 0))
        p.paragraph_format.space_before = Pt(0)
        r = p.add_run(text)
        r.font.size = Pt(fmt.get("size", 10.5))
        r.font.bold = fmt.get("b", False)
        r.font.italic = fmt.get("i", False)
        r.font.color.rgb = fmt.get("c", INK)

    keep_together(t)
    doc.add_paragraph().paragraph_format.space_after = Pt(after)
    return t


def fill_in(doc, label, hint=""):
    """Shaded prompt with a bold underlined blank the owner writes on."""
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    cell = t.cell(0, 0)
    cell.width = Cm(16)
    shade(cell, BLANK_FILL)
    table_borders(t, none=True)
    cell_margins(t, 160, 160, 200, 200)

    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0 if not hint else 3)
    r = p.add_run(label)
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = INK

    if hint:
        p2 = cell.add_paragraph()
        p2.paragraph_format.space_after = Pt(0)
        r2 = p2.add_run(hint)
        r2.font.size = Pt(9)
        r2.font.italic = True
        r2.font.color.rgb = GREY

    keep_together(t)
    doc.add_paragraph().paragraph_format.space_after = Pt(10)
    return t


def grid(doc, headers, rows, widths, header_fill=NAVY, zebra=True,
         font=9.5, header_font=9.5):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    table_borders(t, color=BORDER, sz=4)
    cell_margins(t, 70, 70, 110, 110)

    hdr = t.rows[0]
    for i, text in enumerate(headers):
        cell = hdr.cells[i]
        cell.width = Cm(widths[i])
        shade(cell, header_fill)
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        r = p.add_run(text)
        r.font.size = Pt(header_font)
        r.font.bold = True
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    for ri, row in enumerate(rows):
        cells = t.add_row().cells
        for ci, text in enumerate(row):
            cell = cells[ci]
            cell.width = Cm(widths[ci])
            if zebra and ri % 2 == 1:
                shade(cell, NOTE_FILL)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)
            bold = text.startswith("**") and text.endswith("**")
            r = p.add_run(text.strip("*"))
            r.font.size = Pt(font)
            r.font.bold = bold
            r.font.color.rgb = INK

    keep_together(t)
    repeat_header(t)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    return t


def page_break(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_break(WD_BREAK.PAGE)


# ------------------------------------------------------------------ content


def content(doc):
    today = date.today().strftime("%d %B %Y")

    # ------------------------------------------------------------ cover
    para(doc, "", after=150)
    p = para(doc, "LAWMANN LAUNDRY SERVICE", size=11, bold=True, color=GREY,
             align=WD_ALIGN_PARAGRAPH.CENTER, after=6)
    p.runs[0].font.name = "Calibri"

    title = para(doc, "A proposal", size=30, bold=True, color=NAVY,
                 align=WD_ALIGN_PARAGRAPH.CENTER, after=2)
    para(doc, "Running your laundry business from your own phone",
         size=13, color=GREY, align=WD_ALIGN_PARAGRAPH.CENTER, after=30)

    rule = doc.add_paragraph()
    rule.paragraph_format.space_after = Pt(30)
    hrule(rule, color="1F3864", sz=12)

    for label, value in (
        ("Prepared for", "The owner, Lawmann Laundry Service"),
        ("Location", "University of Ghana, Legon"),
        ("Prepared by", DEVELOPER),
        ("Contact", PHONE),
        ("Date", today),
    ):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(label + ":  ")
        r.font.size = Pt(10)
        r.font.bold = True
        r.font.color.rgb = GREY
        r = p.add_run(value)
        r.font.size = Pt(10.5)
        r.font.color.rgb = INK

    page_break(doc)

    # ------------------------------------------------- 1. understanding
    h1(doc, "1.  What I understand about your business")
    para(doc,
         "I am writing this from what you told me. Please read it and correct me "
         "where I am wrong. It costs you a minute now and saves us both a lot "
         "of trouble later.")

    h3(doc, "How you work")
    bullet(doc, "You collect laundry from students at hostels around Legon.")
    bullet(doc, "You weigh each bag on the spot, at the hostel, before anything is washed, "
                "and price it from your own list.")
    bullet(doc, "You take Mobile Money on your own number, 0556351853, which is MTN.")
    bullet(doc, "You wash it yourself, in your own store.")
    bullet(doc, "Students settle up when they collect.")

    box(doc, [
        ("One detail worth fixing down now.", {"b": True, "size": 10.5, "c": NAVY, "after": 4}),
        ("Because the bag is weighed on campus before it is washed, that weighing "
         "moment is the agreed reference point. If a student ever says their bag "
         "was 12kg on Tuesday and comes back lighter, there is one agreed number to "
         "go back to. That is worth having in writing, and it costs nothing.",
         {"size": 10.5}),
    ], fill=NOTE_FILL)

    h3(doc, "Where you collect")
    para(doc, "You mentioned collecting on campus, and I counted seventeen hostels "
              "from your list:", after=6)
    grid(
        doc,
        ["Group", "Hostels"],
        [
            ["Private", "Evandy · International Student Hostel · Ghana Hostels Ltd "
                        "Flats Pentagon (Blocks A & B) · Vikings · Bani · TF Hostel · "
                        "Aseda Annex A · Valco"],
            ["UGEL and modern", "Dr. Hilla Limann · Kwapong · Elizabeth Sey · "
                                "Jean Nelson Aka"],
            ["Traditional halls", "Legon Hall (with Annex C / Graduate Hostel) · "
                                 "Mensah Sarbah · Akuafo · Volta · Commonwealth"],
        ],
        [3.4, 12.6],
    )

    box(doc, [
        ("TF Hostel alone is 960 beds. With the halls you listed, you are working "
         "with tens of thousands of students, not just the students in one building.",
         {"size": 10.5}),
    ])

    # ------------------------------------------------------ 2. the problem
    h1(doc, "2.  The problem you described")
    para(doc,
         "You told me that you cannot see your business properly without driving to "
         "the shop. In your own words, you want to know:")

    for i, item in enumerate((
        "How much money came in today",
        "How much people still owe you",
        "How many people paid",
        "Who paid half now and still owes the rest when they collect",
        "How many people came in today, this week, this month",
        "How your customers know their clothes are being washed, and when they are ready",
    ), start=1):
        numbered(doc, item, n=i)

    para(doc, "All six of those are answered in this document. Section 5 shows you where.",
         before=6, italic=True, color=GREY)

    # -------------------------------------------- 3. the part unmentioned
    h1(doc, "3.  The part you did not mention")
    box(doc, [
        ("You collect per kilogram.", {"b": True, "size": 11.5, "c": NAVY}),
        ("Washing costs you money per kilogram too.",
         {"b": True, "size": 11.5, "c": NAVY}),
        ("Nobody writes what came in next to what it cost you to run.",
         {"b": True, "size": 11.5, "c": NAVY, "after": 8}),
        ("The gas. The power. The water. The detergent. Whoever washes and folds the "
         "pile. The fuel for the round. Nobody adds those up against the money that "
         "came in, because they are in four different places — a gas bill, a "
         "recharge, a barrel, and someone's pocket.",
         {"size": 10.5, "after": 8}),
        ("So today you can tell me what your students paid you. You cannot tell me "
         "what you actually made. That is not a criticism of you. It is arithmetic "
         "that has never had anywhere to live.",
         {"size": 10.5, "after": 8}),
        ("This app gives it somewhere to live. That is the most valuable part of "
         "everything in this document.", {"b": True, "size": 10.5}),
    ])

    para(doc,
         "It is also the part that would change what you do. Your best-selling weight "
         "band is the one that looks thinnest on paper, and right now you have no way "
         "of knowing. If one of your bands is quietly costing you money, you would "
         "want to know that before the next term, not after it.")

    # -------------------------------------------------- 4. what you get
    h1(doc, "4.  What you would have")
    para(doc,
         "One app. It works on the phone your collector already carries, on a tablet "
         "at the shop, and on your own phone or computer. You do not need to buy "
         "anything new.")

    h2(doc, "Your collector, at the hostel")
    para(doc, "They open the app and the hostels for today are already on the screen. "
              "For each bag:", after=6)
    for i, (text, lead) in enumerate((
        ("the student's phone number, their name, and their block or room.", None),
        ("the bag goes on the scale, they type the weight.", None),
        ("and the price fills in by itself. A 5kg bag shows GH¢93. They do "
         "not do any maths, and they cannot get it wrong.", None),
        ("your per-item prices are already in there too, for shirts, suits, "
         "duvets, sneakers and the rest.", None),
        ("they take the MoMo and photograph the confirmation message.", None),
        ("the bag is given a number. That number follows the bag the whole way, "
         "so nobody ever has to guess whose laundry is whose.", None),
    ), start=1):
        numbered(doc, text, lead=lead, n=i)

    box(doc, [
        ("If the phone loses signal in a corridor, they can still record the bag and "
         "take cash. It saves on the phone and sends itself when the signal comes back.",
         {"size": 10.5, "after": 6}),
        ("And if a student wants to pay by MoMo, the app tells them so before the bag "
         "is weighed, not after. I know this matters, because your students pay the "
         "way you do, and the same person may not have signal in a corridor.",
         {"size": 10.5}),
    ], fill=NOTE_FILL)

    h2(doc, "You, on your own phone, anywhere")
    bullet(doc, "the real number, updated as people pay. Not an estimate.")
    bullet(doc, "who still owes you, with names, phone numbers, amounts, and how long "
                "they have owed it. Oldest debt first, because that is the one you "
                "want collecting.")
    bullet(doc, "how many people paid today.")
    bullet(doc, "cash in the drawer, counted and compared against what should be there.")
    bullet(doc, "your actual profit per kilogram, per week, per month.")
    bullet(doc, "how many kilos came through this week, and what it cost you to wash "
                "them. Enter your gas and wage bills at the end of the week and the "
                "app works out your real cost per kilo — then shows you which of your "
                "bands actually makes money and which one costs you money.")
    bullet(doc, "which bags are sitting unfinished, and which have been there too long.")
    bullet(doc, "how many people came in today, this week, this month.")

    box(doc, [
        ("One thing worth saying about those last numbers.",
         {"b": True, "size": 10.5, "c": NAVY, "after": 4}),
        ("Your business goes quiet in the holidays and gets very busy before exams. "
         "So the app compares this week with the same week last term, not just with "
         "last week. Otherwise in September it will tell you your business is dying, "
         "when what has actually happened is that everyone has gone home.",
         {"size": 10.5}),
    ])

    h2(doc, "What your customers get")
    bullet(doc, "a message when you accept their bag, telling them the weight, the "
                "price, and what is still owing.")
    bullet(doc, "a message when it is ready.")
    bullet(doc, "a message when their payment comes through.")
    bullet(doc, "a page on their own phone where they can check their order without "
                "calling you or coming to ask.")
    para(doc, "They do not have to install anything. They open a link in the message.",
         italic=True, color=GREY, before=4)

    # ---------------------------------------------- 5. questions answered
    h1(doc, "5.  Your questions, answered")
    grid(
        doc,
        ["What you asked", "What you get"],
        [
            ["Track the business without driving to the shop",
             "Everything in section 4, on your phone, at any hour"],
            ["How much was made today",
             "One correct number, updated as people pay"],
            ["How much is left to be paid",
             "A list of names and amounts, oldest debt first"],
            ["How many people paid",
             "The count, and who"],
            ["Who paid half and owes the rest",
             "Tracked per person. The balance follows the bag until they collect"],
            ["How many came in, day, week, month",
             "Counts, measured against the same time last term"],
            ["How customers know it is ready",
             "They are told automatically. You stop being the one being asked"],
        ],
        [7.0, 9.0],
    )

    # --------------------------------------------- 6. price list findings
    h1(doc, "6.  Three things in your price list")
    para(doc, "I priced out your weight bands. I am not telling you what to change. "
              "I am asking you about three things.")

    h2(doc, "6.1   Your 10–12kg band is your cheapest, so it is also your thinnest")
    para(doc, "Here is what each band works out at, if the bag is full. Your 10–12kg "
              "band is GH¢128 for up to 12kg, which is GH¢10.67 per kilo. A student "
              "with 12kg is paying 56% less per kilo than a student with 3kg.", after=8)

    grid(
        doc,
        ["Bag", "You charge", "That works out at", "Breaks even at"],
        [
            ["3kg", "GH¢73", "GH¢24.33 per kilo", "24.33"],
            ["6kg", "GH¢93", "GH¢15.50 per kilo", "15.50"],
            ["9kg", "GH¢103", "GH¢11.44 per kilo", "11.44"],
            ["**12kg**", "**GH¢128**", "**GH¢10.67 per kilo — your cheapest**",
             "**10.67  ← tightest**"],
            ["15kg", "GH¢190", "GH¢12.67 per kilo", "12.67"],
        ],
        [2.0, 2.9, 7.0, 4.1],
        font=9,
    )

    para(doc,
         "The last column is the number I care about. If it costs you more than "
         "GH¢10.67 to wash one kilo, then your best-selling band is losing you money "
         "and you would never know, because nobody is counting.", after=8)

    para(doc, "So I need one number from you. The honest one:", after=4)
    fill_in(doc,
            "It costs me GH¢ ____________ per kilo to wash, all in.",
            "All in means: gas · electricity · water · detergent and bleach · "
            "whoever washes and folds · fuel for the collection round · a share of "
            "the shop rent. If you are not sure, write down what you paid for gas, "
            "power, water, detergent and wages in one week, and how many kilos you "
            "washed in that week. I will do the dividing.")

    h2(doc, "6.2   The jump from 12kg to 15kg is steep")
    para(doc, "From 10–12kg to 13–15kg the price goes from GH¢128 to GH¢190. That is "
              "GH¢62 more for 3kg of laundry, which is GH¢20.67 per kilo for those "
              "last 3kg. The 10–12kg band charges GH¢10.67 per kilo, so a student at "
              "12kg pays about 19% less per kilo than a student at 15kg.", after=6)
    para(doc, "Two questions, and the first one matters more than the second:", after=4)
    bullet(doc, "Is that deliberate? A full 15kg does take longer in the dryer, so the "
                "extra charge may be fair. Or the price may have been set years ago and "
                "never looked at since. I am not assuming it is wrong.")
    bullet(doc, "And there is still no band above 15kg. A student doing laundry before "
                "exams will absolutely turn up with more than that, and right now there "
                "is no price for it.")

    h2(doc, "6.3   Duvet")
    para(doc, "Your duvet line says “big / small” and both are GH¢70. "
              "Is the small one cheaper than GH¢70?", after=4)
    fill_in(doc, "Duvet, small: GH¢ ____________", "")

    # ------------------------------------------------- 7. what I need
    h1(doc, "7.  What I need from you before I start")
    for i, (text, lead) in enumerate((
        ("What one kilo of laundry costs you to wash, all in. The blank in section "
         "6.1. If you cannot put a number on it, give me your weekly gas, power, "
         "water, detergent and wages, plus how many kilos you washed that week.",
         None),
        ("Does anyone help you wash and fold? If so, are they on a salary or paid "
         "per kilo. This moves your cost per kilo more than gas does, so it is the "
         "second thing I need most.", None),
        ("A photograph of a MoMo confirmation message. Just so I know what one "
         "looks like when your students pay.", None),
        ("A few real orders. Three or four is enough. Weight, what you charged, "
         "what they actually paid. Your notebook or your WhatsApp is perfect. "
         "This is worth more to me than anything I could invent.", None),
    ), start=1):
        numbered(doc, text, lead=lead, n=i)

    # -------------------------------------------------- 8. what changes
    h1(doc, "8.  What changes in your routine")
    para(doc, "Two things, not one. The second one is the price of the first.", after=8)

    box(doc, [
        ("One.  Weigh every bag, and write the weight down.",
         {"b": True, "size": 11, "c": NAVY, "after": 6}),
        ("You already weigh at pickup, which is the reason this whole thing works. "
         "It just was not being written down. The only change is that it gets "
         "recorded, every time.",
         {"size": 10.5, "after": 6}),
        ("Why it has to be every bag, even the ones you price by item: if you charge "
         "GH¢30 for a suit and nobody weighed it, then there is no way for you or "
         "for me to know whether that suit cost you GH¢10 to wash or GH¢25. You "
         "would be guessing, and so would I.",
         {"size": 10.5}),
    ])

    box(doc, [
        ("Two.  Enter your bills once a week.", {"b": True, "size": 11, "c": NAVY, "after": 6}),
        ("Gas, power, water, detergent, and anyone's wages. Five numbers, once a "
         "week, from receipts you already have.",
         {"size": 10.5, "after": 6}),
        ("I want to be straight about why this one matters. Without it, the app can "
         "only tell you what money came in. With it, the app can tell you what you "
         "made. Those are different numbers, and only the second one tells you "
         "whether the business is worth running the way you are running it.",
         {"size": 10.5}),
    ], fill=NOTE_FILL)

    para(doc, "That is the whole change. Everything else is your business, run the way "
              "you already run it.")

    # ------------------------------------------------ 9. what it won't do
    h1(doc, "9.  What this will not do")
    para(doc, "I would rather tell you now than disappoint you later.", after=6)
    bullet(doc, "It will not wash anything. That does not change.")
    bullet(doc, "It will not change your prices. It only shows you what your prices "
                "actually do to your profit.")
    bullet(doc, "It will not collect MoMo for you automatically yet. You are on your "
                "own number, so for now the app records the payment and photographs "
                "your confirmation, and you still confirm it. That is a later step, "
                "once you are happy with this one.")
    bullet(doc, "It will not replace your notebook in the first term.")

    box(doc, [
        ("Please keep your notebook for the first term.", {"b": True, "size": 10.5, "c": NAVY, "after": 5}),
        ("Run the app alongside it. If the two ever disagree, the notebook wins and "
         "we fix the app. I would rather do that than throw away something that has "
         "already been working for you.", {"size": 10.5}),
    ], fill=NOTE_FILL)

    # ------------------------------------------------------- 10. cost
    h1(doc, "10.  What it costs")
    para(doc, "It is two parts, and I want to be straight with you about which is "
              "which:", after=6)
    bullet(doc, "one amount to build it.", lead="To begin:  ")
    bullet(doc, "a monthly amount to keep it running and supported, plus the messages "
                "we send to your customers.", lead="Then:  ")

    para(doc, "The one cost I can put a real number on today is the messages to your "
              "customers. It is about two pesewas per message. If you do 20 bags a day "
              "and send 3 messages each, that is roughly GH¢36 for the whole month.",
         before=4)

    para(doc, "I am not going to quote you a build price in this document, because I "
              "have not built it yet and I do not want to give you a figure I cannot "
              "stand behind. Once we agree exactly what you want, I will quote it "
              "properly.")

    box(doc, [
        ("I would rather earn the monthly part than sell it to you at the start.",
         {"b": True, "size": 10.5, "c": NAVY, "after": 5}),
        ("Which is why the next section matters more than the price.",
         {"size": 10.5}),
    ])

    # ---------------------------------------------------- 11. how built
    h1(doc, "11.  How it would be built, and in what order")
    para(doc, "This is not a single big thing that appears all at once. It comes in "
              "steps, and each one is useful on its own.", after=8)

    grid(
        doc,
        ["Step", "What it does", "Why that order"],
        [
            ["1.  The money",
             "Weigh, price, record, take payment, and know who owes what",
             "This is the foundation. Everything else is just reporting on top of it"],
            ["2.  The profit side",
             "What it cost you to run, what you actually made, and which of your "
             "bands makes money",
             "This is the part nobody has today, and it is what the business runs on"],
            ["3.  Your phone",
             "Everything from steps 1 and 2, on your own screen",
             "You can finally answer your six questions from anywhere"],
            ["4.  Your customers",
             "Messages, and a way for them to settle a balance",
             "Once the numbers behind it are right, not before"],
            ["5.  The paperwork",
             "Clean tax records, so the GRA side is tidy",
             "Needs real transaction history behind it"],
            ["6.  The hostels",
             "The daily round across all seventeen",
             "Most useful last, and only once the rest is solid"],
        ],
        [2.9, 6.3, 6.8],
        font=9,
    )

    box(doc, [
        ("The order matters: money first, then profit, then everything else.",
         {"b": True, "size": 10.5, "c": NAVY, "after": 5}),
        ("If we do it the other way round — a pretty screen first, arithmetic later — "
         "you would have a dashboard full of numbers you cannot trust. I have seen "
         "that go wrong.", {"size": 10.5}),
    ])

    # -------------------------------------------------- 12. the ask
    h1(doc, "12.  What I ask of you")
    box(doc, [
        ("Show me yours working, before you pay me anything.",
         {"b": True, "size": 12, "c": NAVY, "after": 8}),
        ("When the first version is ready, I will show you your own business in it — "
         "your hostels, your prices, your numbers. You look at it and tell me what "
         "is wrong.", {"size": 10.5, "after": 6}),
        ("If it does not answer your six questions, you do not take it, and you owe "
         "me nothing.", {"b": True, "size": 10.5}),
    ])

    # ---------------------------------------------------- signature
    page_break(doc)
    h1(doc, "Agreement and contact")
    para(doc, "I have read this proposal and I would like to go ahead.", after=14)
    grid(
        doc,
        ["Role", "Name", "Date"],
        [["Owner", "", ""], [DEVELOPER, "", ""]],
        [3.4, 8.0, 4.6],
        font=10,
        zebra=False,
    )

    para(doc, "", after=4)
    box(doc, [
        (DEVELOPER, {"b": True, "size": 12, "c": NAVY, "after": 3}),
        (PHONE, {"size": 10.5, "after": 3}),
        ("Available on WhatsApp as well as by phone.", {"size": 10, "i": True, "c": GREY}),
    ], fill=NOTE_FILL)

    # ------------------------------------------------------- appendix
    page_break(doc)
    h1(doc, "Appendix  ·  Your price list")
    para(doc, "This is the poster you showed me, the one this proposal was built from. "
              "I have reproduced it so we are both looking at the same document.",
         italic=True, color=GREY, after=12)

    if os.path.exists(POSTER):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(6)
        p.add_run().add_picture(POSTER, width=Cm(13.5))
    else:
        box(doc, [("Poster image not found at assets/price-list.png", {"c": RED})])

    page_break(doc)
    h2(doc, "The same figures, typed out")
    para(doc, "So they can be corrected without handwriting on the poster.", after=10)
    grid(
        doc,
        ["Per item", "GHS"],
        [
            ["Shirt", "8"],
            ["Trouser", "8"],
            ["Singlet", "7"],
            ["Pillow case", "6"],
            ["Socks", "5"],
            ["Boxers", "6"],
            ["Shorts", "8.50"],
            ["Jeans", "10"],
            ["Dress", "15"],
            ["Towel", "15"],
            ["Bedsheet", "20"],
            ["Jacket", "20"],
            ["Kaftan", "25"],
            ["2-piece suit", "30"],
            ["Smock", "30"],
            ["Duvet (big / small)", "70"],
            ["Sneakers", "40"],
        ],
        [11.0, 5.0],
        font=9.5,
    )

    grid(
        doc,
        ["By weight", "Price", "By weight", "Price"],
        [
            ["0 – 3 kg", "GH¢73", "7 – 9 kg", "GH¢103"],
            ["4 – 6 kg", "GH¢93", "10 – 12 kg", "GH¢128"],
            ["", "", "13 – 15 kg", "GH¢190"],
        ],
        [3.6, 3.4, 3.6, 5.4],
        font=9.5,
    )

    para(doc,
         "Transcribed from the poster on 26 September 2026. One correction: the poster "
         "appears to read GH¢83 for 4–6kg, but you confirmed GH¢93, and GH¢93 is what "
         "I have used throughout. Please correct anything else I have read wrongly.",
         size=9, italic=True, color=GREY)


def setup_page(doc):
    s = doc.sections[0]
    s.page_width = Cm(21.0)
    s.page_height = Cm(29.7)
    s.left_margin = Cm(2.5)
    s.right_margin = Cm(2.5)
    s.top_margin = Cm(2.2)
    s.bottom_margin = Cm(2.2)


def add_footer(doc):
    footer = doc.sections[0].footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(f"{DEVELOPER}  ·  {PHONE}  ·  Lawmann Laundry Service proposal")
    r.font.size = Pt(8)
    r.font.color.rgb = GREY


def main():
    doc = Document()
    setup_page(doc)
    build_styles(doc)
    content(doc)
    add_footer(doc)
    doc.save(DOCX)
    print("wrote", DOCX)

    if os.path.exists(PDF):
        os.remove(PDF)
    subprocess.run(
        ["soffice", "--headless", "--convert-to", "pdf", "--outdir", HERE, DOCX],
        check=True, capture_output=True, timeout=180,
    )
    print("wrote", PDF)


if __name__ == "__main__":
    main()
