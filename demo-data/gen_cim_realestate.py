"""
Summit Ridge Portfolio — CIM PDF Generator
Value-add multifamily real estate PE deal, Sun Belt, 2,847 units, ~$473M EV
"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.platypus.flowables import KeepTogether
import os

OUT = os.path.join(os.path.dirname(__file__), "cim-summit-ridge.pdf")

# ─── Colours ────────────────────────────────────────────────────
NAVY   = colors.HexColor("#0A1628")
GOLD   = colors.HexColor("#C9A84C")
SILVER = colors.HexColor("#F5F5F5")
LGREY  = colors.HexColor("#CCCCCC")
MGREY  = colors.HexColor("#666666")
BLACK  = colors.HexColor("#1A1A1A")
WHITE  = colors.white
RED    = colors.HexColor("#C0392B")
GREEN  = colors.HexColor("#1A6B3A")

# ─── Styles ─────────────────────────────────────────────────────
base = getSampleStyleSheet()

def S(name, **kw):
    p = ParagraphStyle(name, **kw)
    return p

COVER_TITLE  = S("CoverTitle",  fontName="Helvetica-Bold", fontSize=32, textColor=WHITE, leading=38, alignment=TA_CENTER)
COVER_SUB    = S("CoverSub",    fontName="Helvetica",      fontSize=14, textColor=GOLD,  leading=20, alignment=TA_CENTER)
COVER_CONF   = S("CoverConf",   fontName="Helvetica",      fontSize=9,  textColor=LGREY, leading=12, alignment=TA_CENTER)

H1    = S("H1",    fontName="Helvetica-Bold",   fontSize=18, textColor=NAVY, leading=22, spaceAfter=8)
H2    = S("H2",    fontName="Helvetica-Bold",   fontSize=13, textColor=NAVY, leading=17, spaceAfter=6, spaceBefore=10)
H3    = S("H3",    fontName="Helvetica-Bold",   fontSize=10, textColor=GOLD, leading=14, spaceAfter=4, spaceBefore=8)
BODY  = S("Body",  fontName="Helvetica",        fontSize=9,  textColor=BLACK, leading=14, spaceAfter=4, alignment=TA_JUSTIFY)
BOLD  = S("Bold",  fontName="Helvetica-Bold",   fontSize=9,  textColor=BLACK, leading=14, spaceAfter=4)
SMALL = S("Small", fontName="Helvetica",        fontSize=8,  textColor=MGREY, leading=11, spaceAfter=2)
NOTE  = S("Note",  fontName="Helvetica-Oblique",fontSize=8,  textColor=MGREY, leading=11, spaceAfter=4)
CONF  = S("Conf",  fontName="Helvetica-Oblique",fontSize=7,  textColor=LGREY, leading=10, alignment=TA_CENTER)
WARN  = S("Warn",  fontName="Helvetica-Bold",   fontSize=8,  textColor=RED,   leading=12, spaceAfter=4)
KPI_V = S("KPIV",  fontName="Helvetica-Bold",   fontSize=18, textColor=NAVY, leading=22, alignment=TA_CENTER)
KPI_L = S("KPIL",  fontName="Helvetica",        fontSize=8,  textColor=MGREY, leading=10, alignment=TA_CENTER)

def th(txt, **kw):
    style = ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8, textColor=WHITE,
                            alignment=TA_CENTER, leading=11, **kw)
    return Paragraph(txt, style)

def td(txt, align=TA_CENTER, bold=False, color=BLACK):
    fn = "Helvetica-Bold" if bold else "Helvetica"
    style = ParagraphStyle("td", fontName=fn, fontSize=8, textColor=color,
                            alignment=align, leading=11)
    return Paragraph(txt, style)

def td_left(txt, bold=False, color=BLACK):
    return td(txt, align=TA_LEFT, bold=bold, color=color)

def tbl(data, col_widths, header_rows=1):
    t = Table(data, colWidths=col_widths, repeatRows=header_rows)
    style = TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0),  NAVY),
        ("TEXTCOLOR",    (0, 0), (-1, 0),  WHITE),
        ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, 0),  8),
        ("ALIGN",        (0, 0), (-1, 0),  "CENTER"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),   [WHITE, SILVER]),
        ("FONTNAME",     (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 1), (-1, -1), 8),
        ("ALIGN",        (0, 1), (-1, -1), "CENTER"),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("GRID",         (0, 0), (-1, -1), 0.4, LGREY),
    ])
    t.setStyle(style)
    return t

def hr():
    return HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8, spaceBefore=4)

def gold_bar():
    return HRFlowable(width="100%", thickness=3, color=GOLD, spaceAfter=10, spaceBefore=2)

def kpi_box(items):
    """items: list of (value, label) tuples"""
    cells = [[Paragraph(v, KPI_V), Paragraph(l, KPI_L)] for v, l in items]
    row_vals = [cells[i][0] for i in range(len(items))]
    row_labs  = [cells[i][1] for i in range(len(items))]
    t = Table([row_vals, row_labs],
              colWidths=[7.0*inch/len(items)]*len(items))
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), SILVER),
        ("BOX",          (0, 0), (-1, -1), 0.5, LGREY),
        ("INNERGRID",    (0, 0), (-1, -1), 0.3, LGREY),
        ("TOPPADDING",   (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
    ]))
    return t

def section_banner(text):
    t = Table([[Paragraph(text, S("SB", fontName="Helvetica-Bold", fontSize=12,
                                  textColor=WHITE, leading=16, spaceAfter=0))],],
              colWidths=[7.0*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), NAVY),
        ("LEFTPADDING",  (0,0),(-1,-1), 12),
        ("TOPPADDING",   (0,0),(-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
    ]))
    return t

# ─── Document ───────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUT, pagesize=letter,
    leftMargin=0.75*inch, rightMargin=0.75*inch,
    topMargin=0.75*inch,  bottomMargin=0.75*inch,
)
W = 7.0 * inch
story = []

# ═══════════════════════════════════════════════════════════════
# COVER PAGE
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 1.8*inch))
story.append(Paragraph("SUMMIT RIDGE PORTFOLIO", COVER_TITLE))
story.append(Spacer(1, 0.15*inch))
story.append(HRFlowable(width="60%", thickness=2, color=GOLD, spaceAfter=14,
                         spaceBefore=8, hAlign="CENTER"))
story.append(Paragraph("Confidential Information Memorandum", COVER_SUB))
story.append(Spacer(1, 0.12*inch))
story.append(Paragraph("Value-Add Multifamily Portfolio Acquisition", COVER_SUB))
story.append(Spacer(1, 0.12*inch))
story.append(Paragraph("Sun Belt Markets  ·  2,847 Units  ·  14 Properties", COVER_SUB))
story.append(Spacer(1, 0.6*inch))

highlights = Table([
    [Paragraph("$473M", KPI_V), Paragraph("5.2%", KPI_V), Paragraph("2,847", KPI_V)],
    [Paragraph("Target EV", KPI_L), Paragraph("In-Place Cap Rate", KPI_L), Paragraph("Total Units", KPI_L)],
    [Paragraph("18.5%", KPI_V), Paragraph("93.4%", KPI_V), Paragraph("5-yr", KPI_V)],
    [Paragraph("Target IRR (Base)", KPI_L), Paragraph("Current Occupancy", KPI_L), Paragraph("Target Hold", KPI_L)],
], colWidths=[W/3, W/3, W/3])
highlights.setStyle(TableStyle([
    ("BACKGROUND",   (0,0),(-1,-1), colors.HexColor("#0D1F38")),
    ("TOPPADDING",   (0,0),(-1,-1), 6),
    ("BOTTOMPADDING",(0,0),(-1,-1), 6),
]))
story.append(highlights)
story.append(Spacer(1, 0.5*inch))

story.append(Paragraph("PREPARED BY AXIS CAPITAL ADVISORS", COVER_CONF))
story.append(Spacer(1, 0.08*inch))
story.append(Paragraph("April 2025  ·  STRICTLY CONFIDENTIAL", COVER_CONF))
story.append(Spacer(1, 0.15*inch))
story.append(Paragraph(
    "This document has been prepared solely for informational purposes and is intended exclusively for the recipient named herein. "
    "It contains proprietary and confidential information that must not be reproduced, distributed, or disclosed without prior written consent. "
    "Past performance is not indicative of future results. All projections are forward-looking and subject to significant uncertainty.",
    CONF))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# CONFIDENTIALITY / DISCLAIMER
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph("CONFIDENTIALITY NOTICE", H1))
story.append(gold_bar())
story.append(Paragraph(
    "This Confidential Information Memorandum (\"CIM\") has been prepared by Axis Capital Advisors (\"Advisor\") "
    "on behalf of Summit Ridge Portfolio Holdings LLC (the \"Company\" or \"Summit Ridge\") solely for the use of "
    "prospective investors who have executed a Non-Disclosure Agreement. By accepting this document, the recipient "
    "agrees to: (i) use the information solely to evaluate a potential investment; (ii) keep all information strictly "
    "confidential; and (iii) promptly return or destroy all copies upon request.", BODY))
story.append(Spacer(1, 0.1*inch))
story.append(Paragraph(
    "This CIM does not constitute an offer to sell or a solicitation of an offer to buy any securities. "
    "All financial projections are management estimates and have not been independently verified. "
    "Prospective investors should conduct their own due diligence and consult with qualified advisors.", NOTE))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# TABLE OF CONTENTS
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph("TABLE OF CONTENTS", H1))
story.append(gold_bar())

toc_data = [
    [th("Section"), th("Title"), th("Page")],
    [td("01"), td_left("Transaction Overview"), td("4")],
    [td("02"), td_left("Investment Highlights"), td("5")],
    [td("03"), td_left("Portfolio Overview & Property Details"), td("6")],
    [td("04"), td_left("Market Analysis — Sun Belt Fundamentals"), td("8")],
    [td("05"), td_left("Financial Performance & NOI Analysis"), td("10")],
    [td("06"), td_left("Value-Add Business Plan"), td("12")],
    [td("07"), td_left("Capital Structure & Financing"), td("13")],
    [td("08"), td_left("Returns Analysis — Scenarios & Sensitivities"), td("14")],
    [td("09"), td_left("Risk Factors"), td("15")],
    [td("10"), td_left("Management Team & Sponsors"), td("16")],
]
story.append(tbl(toc_data, [0.6*inch, 4.8*inch, 0.8*inch]))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 01 TRANSACTION OVERVIEW
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("01  |  TRANSACTION OVERVIEW"))
story.append(Spacer(1, 0.15*inch))
story.append(kpi_box([
    ("$473M", "Target Enterprise Value"),
    ("5.2%", "In-Place Cap Rate"),
    ("4.7%", "Year-3 Stabilized Cap Rate"),
    ("2,847", "Total Units"),
]))
story.append(Spacer(1, 0.2*inch))

story.append(Paragraph("Overview", H2))
story.append(Paragraph(
    "Summit Ridge Portfolio represents a rare opportunity to acquire a geographically diversified, "
    "institutional-quality multifamily portfolio concentrated across five of the highest-growth Sun Belt "
    "markets in the United States. The 14-property, 2,847-unit portfolio was assembled over 2018–2022 by "
    "a regional sponsor seeking a full monetization event. Properties are well-located Class B assets "
    "with strong in-place cash flow, significant below-market rents, and a compelling value-add runway "
    "through targeted capital improvements.", BODY))

story.append(Paragraph("Transaction Summary", H2))
terms_data = [
    [th("Term"), th("Detail")],
    [td_left("Portfolio Name"),           td_left("Summit Ridge Portfolio Holdings LLC")],
    [td_left("Asset Class"),              td_left("Multifamily — Class B Value-Add")],
    [td_left("Geography"),                td_left("Atlanta, GA · Tampa, FL · Charlotte, NC · Nashville, TN · Austin, TX")],
    [td_left("Number of Properties"),     td_left("14 communities")],
    [td_left("Total Units"),              td_left("2,847 units")],
    [td_left("Year Built Range"),         td_left("1998 – 2009")],
    [td_left("Avg. Unit Size"),           td_left("876 sq ft")],
    [td_left("LTM In-Place NOI"),         td_left("$24.6M")],
    [td_left("Target Purchase Price"),    td_left("$472.8M  ($166,070 / unit)")],
    [td_left("In-Place Cap Rate"),        td_left("5.2%")],
    [td_left("Stabilized Cap Rate"),      td_left("4.7% (Year 3 projected)")],
    [td_left("Financing"),                td_left("60% LTV senior loan (SOFR + 190 bps)  +  40% equity")],
    [td_left("Equity Requirement"),       td_left("~$189M")],
    [td_left("Target Hold Period"),       td_left("5 years (2025–2030)")],
    [td_left("Target Gross IRR"),         td_left("18.5% base  /  22.3% bull")],
    [td_left("Target Equity Multiple"),   td_left("2.2x base  /  2.7x bull")],
    [td_left("Process"),                  td_left("Structured sale; LOI deadline April 30, 2025")],
]
story.append(tbl(terms_data, [2.5*inch, 4.2*inch]))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 02 INVESTMENT HIGHLIGHTS
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("02  |  INVESTMENT HIGHLIGHTS"))
story.append(Spacer(1, 0.15*inch))

highlights_items = [
    ("BELOW-MARKET RENTS WITH CLEAR MARK-TO-MARKET PATH",
     "In-place rents average $1,420/month, representing a 17.3% discount to current market rents of $1,716/month "
     "across the portfolio. This gap has widened over the past 18 months as the prior sponsor deferred rent increases "
     "to maintain occupancy. An immediate rent push on lease renewals (targeting 8–10% increases in Year 1) provides "
     "a high-confidence revenue lift without capital deployment."),
    ("CAPITAL-LIGHT VALUE-ADD WITH PROVEN UNIT ECONOMICS",
     "Phase I renovations covering 1,420 of 2,847 units at an average cost of $8,500/unit ($12.1M total) have "
     "demonstrated a $142/month average rent premium in properties where the prior sponsor completed renovations. "
     "This represents a 20.1% ROC on renovation spend. Phase II (remaining 1,427 units) targets the same economics "
     "with improved procurement leverage at portfolio scale."),
    ("DIVERSIFIED SUN BELT FOOTPRINT WITH SECULAR TAILWINDS",
     "All five target markets — Atlanta, Tampa, Charlotte, Nashville, and Austin — rank in the top 15 U.S. MSAs "
     "for net in-migration and employment growth (2022–2024). Net in-migration across the portfolio's MSAs averaged "
     "42,000 new households annually. New multifamily supply deliveries are declining 28% in 2025 vs. 2024 "
     "peak, tightening market vacancy toward the 6.2% stabilized level."),
    ("STRONG IN-PLACE CASH FLOW WITH DAY-ONE YIELD",
     "The portfolio generates $24.6M LTM NOI with 93.4% occupancy. At a $472.8M purchase price, the sponsor "
     "acquires a 5.2% in-place cap rate — above the market clearing rate for institutional-quality assets "
     "(4.6–4.9% for fully-stabilized product), providing immediate yield and downside protection."),
    ("MULTIPLE EXIT PATHS WITH PROVEN LIQUIDITY",
     "The portfolio can be monetized via: (i) bulk sale to an institutional buyer or REIT at stabilized cap "
     "rates in Year 4–5; (ii) property-by-property disposition to maximize value in each submarket; or "
     "(iii) UPREIT contribution to a publicly-traded REIT. Sun Belt multifamily remains among the most liquid "
     "asset classes in U.S. real estate with $80B+ in annual transaction volume."),
    ("OPERATIONAL ALPHA FROM PROPERTY MANAGEMENT TRANSITION",
     "Current property management is fragmented across three third-party managers. Consolidating to a single "
     "best-in-class operator (identified) reduces property management fees by ~$0.8M annually, improves "
     "maintenance response times, and enables portfolio-wide revenue management software deployment — "
     "targeting an additional 1.5% NOI improvement in Year 1."),
]

for title, text in highlights_items:
    story.append(KeepTogether([
        Paragraph(f"<b>{title}</b>", BOLD),
        Paragraph(text, BODY),
        Spacer(1, 0.1*inch),
    ]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 03 PORTFOLIO OVERVIEW
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("03  |  PORTFOLIO OVERVIEW & PROPERTY DETAILS"))
story.append(Spacer(1, 0.15*inch))

story.append(Paragraph("Portfolio Summary by Market", H2))
mkt_data = [
    [th("Market"), th("Properties"), th("Units"), th("% Portfolio"), th("In-Place Rent"), th("Market Rent"), th("Spread"), th("Occupancy")],
    [td("Atlanta, GA"),    td("4"), td("842"),  td("29.6%"), td("$1,385"), td("$1,640"), td("−15.5%"), td("94.1%")],
    [td("Tampa, FL"),      td("3"), td("621"),  td("21.8%"), td("$1,460"), td("$1,780"), td("−18.0%"), td("93.8%")],
    [td("Charlotte, NC"),  td("3"), td("598"),  td("21.0%"), td("$1,395"), td("$1,690"), td("−17.5%"), td("92.7%")],
    [td("Nashville, TN"),  td("2"), td("442"),  td("15.5%"), td("$1,480"), td("$1,820"), td("−18.7%"), td("93.2%")],
    [td("Austin, TX"),     td("2"), td("344"),  td("12.1%"), td("$1,420"), td("$1,740"), td("−18.4%"), td("93.6%")],
    [td_left("<b>Total Portfolio</b>", bold=True), td("<b>14</b>", bold=True), td("<b>2,847</b>", bold=True),
     td("<b>100%</b>", bold=True), td("<b>$1,420</b>", bold=True), td("<b>$1,716</b>", bold=True),
     td("<b>−17.3%</b>", bold=True), td("<b>93.4%</b>", bold=True)],
]
story.append(tbl(mkt_data, [1.3*inch, 0.85*inch, 0.65*inch, 0.85*inch, 0.85*inch, 0.85*inch, 0.65*inch, 0.85*inch]))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("Property-Level Detail", H2))

prop_data = [
    [th("Property"), th("Market"), th("Units"), th("YR Built"), th("In-Place Rent"), th("Occupancy"), th("LTM NOI"), th("Reno Status")],
    [td_left("Riverbend at Midtown"),   td("Atlanta"),   td("224"), td("2003"), td("$1,412"), td("94.6%"), td("$1.92M"), td("None")],
    [td_left("Stonegate Commons"),      td("Atlanta"),   td("208"), td("2001"), td("$1,375"), td("93.8%"), td("$1.72M"), td("None")],
    [td_left("Perimeter Crossing"),     td("Atlanta"),   td("218"), td("2005"), td("$1,401"), td("94.5%"), td("$1.84M"), td("Partial")],
    [td_left("Lakewood Reserve"),       td("Atlanta"),   td("192"), td("1999"), td("$1,345"), td("93.2%"), td("$1.55M"), td("None")],
    [td_left("Harbour Pointe"),         td("Tampa"),     td("216"), td("2004"), td("$1,470"), td("94.0%"), td("$1.98M"), td("Partial")],
    [td_left("Westshore Villas"),       td("Tampa"),     td("198"), td("2002"), td("$1,448"), td("93.5%"), td("$1.79M"), td("None")],
    [td_left("Bayview at Carrollwood"), td("Tampa"),     td("207"), td("2006"), td("$1,465"), td("93.9%"), td("$1.91M"), td("None")],
    [td_left("Uptown Heights"),         td("Charlotte"), td("201"), td("2007"), td("$1,418"), td("93.0%"), td("$1.74M"), td("Partial")],
    [td_left("Ballantyne Park"),        td("Charlotte"), td("194"), td("2004"), td("$1,380"), td("92.3%"), td("$1.63M"), td("None")],
    [td_left("SouthPark Crossing"),     td("Charlotte"), td("203"), td("2008"), td("$1,388"), td("92.8%"), td("$1.69M"), td("None")],
    [td_left("Music Row Flats"),        td("Nashville"), td("228"), td("2006"), td("$1,495"), td("93.4%"), td("$2.11M"), td("Partial")],
    [td_left("Green Hills Reserve"),    td("Nashville"), td("214"), td("2009"), td("$1,462"), td("93.0%"), td("$1.95M"), td("None")],
    [td_left("Domain Crossing"),        td("Austin"),    td("178"), td("2007"), td("$1,440"), td("93.8%"), td("$1.64M"), td("Partial")],
    [td_left("Cedar Park Commons"),     td("Austin"),    td("166"), td("2005"), td("$1,398"), td("93.4%"), td("$1.44M"), td("None")],
    [td_left("<b>TOTAL</b>", bold=True), td(""), td("<b>2,847</b>", bold=True), td(""),
     td("<b>$1,420</b>", bold=True), td("<b>93.4%</b>", bold=True), td("<b>$24.61M</b>", bold=True), td("")],
]
story.append(tbl(prop_data, [1.55*inch, 0.85*inch, 0.55*inch, 0.65*inch, 0.92*inch, 0.82*inch, 0.82*inch, 0.84*inch]))

story.append(Spacer(1, 0.12*inch))
story.append(Paragraph("Note: 'Partial' reno status indicates prior sponsor completed 20–35% of planned unit upgrades. "
                        "Remaining units represent the primary value-add opportunity.", NOTE))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 04 MARKET ANALYSIS
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("04  |  MARKET ANALYSIS — SUN BELT FUNDAMENTALS"))
story.append(Spacer(1, 0.15*inch))

story.append(Paragraph("Macro Tailwinds", H2))
story.append(Paragraph(
    "The Sun Belt multifamily market is underpinned by three structural demand drivers that support "
    "long-term rent growth above historical averages:", BODY))

macro_items = [
    ("Population & Household Formation",
     "The five portfolio MSAs added a combined 847,000 net new residents in 2022–2024, outpacing the national "
     "average by 3.2x. Household formation rates across these markets are projected to remain 18–22% above "
     "national averages through 2027 (Moody's Analytics, Q4 2024)."),
    ("Employment Diversification",
     "The technology, healthcare, and financial services sectors have materially diversified the economic base "
     "of Sun Belt metros previously reliant on tourism (Tampa) or single-industry employers. Nashville's "
     "healthcare employment grew 14.2% (2022–2024); Charlotte's financial services sector employs 98,000+; "
     "Austin's technology sector added 22,000 jobs in 2023 alone."),
    ("Supply Normalization",
     "New multifamily deliveries across the portfolio's MSAs peaked at 87,400 units in 2024 and are projected "
     "to decline to 62,800 units in 2025 (−28%) and 44,200 units in 2026 (−50% from peak), driven by higher "
     "construction costs and tighter construction lending. This supply contraction is a material tailwind "
     "for near-term rent growth."),
]

for title, text in macro_items:
    story.append(KeepTogether([
        Paragraph(f"<b>{title}</b>", BOLD),
        Paragraph(text, BODY),
        Spacer(1, 0.08*inch),
    ]))

story.append(Paragraph("Market Fundamentals by MSA", H2))
msa_data = [
    [th("MSA"), th("2024 Population"), th("2Y Pop Growth"), th("Median HH Income"), th("Unemployment"), th("Multifamily Vacancy"), th("2025 Supply"),th("Proj. Rent Growth")],
    [td("Atlanta, GA"),   td("6.3M"), td("+4.8%"), td("$82,400"), td("3.6%"), td("7.1%"), td("18,200 units"), td("+4.2%")],
    [td("Tampa, FL"),     td("3.2M"), td("+5.1%"), td("$74,800"), td("3.3%"), td("6.8%"), td("11,400 units"), td("+4.8%")],
    [td("Charlotte, NC"), td("2.8M"), td("+4.4%"), td("$79,200"), td("3.4%"), td("7.4%"), td("10,600 units"), td("+3.9%")],
    [td("Nashville, TN"), td("2.1M"), td("+3.9%"), td("$81,600"), td("3.1%"), td("7.8%"), td("9,800 units"),  td("+3.6%")],
    [td("Austin, TX"),    td("2.4M"), td("+5.6%"), td("$92,100"), td("3.2%"), td("8.2%"), td("12,800 units"), td("+3.2%")],
]
story.append(tbl(msa_data, [1.1*inch, 0.9*inch, 0.85*inch, 1.0*inch, 0.9*inch, 0.95*inch, 0.85*inch, 0.85*inch]))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("Competitive Positioning", H2))
story.append(Paragraph(
    "Summit Ridge's Class B positioning is strategically advantaged in the current environment. "
    "Newly-delivered Class A product in target markets averages $2,100–$2,400/month, creating a "
    "$384–$684 rent differential (22–29% premium) to Summit Ridge's market rents. This gap is "
    "structurally durable as workforce and middle-income households — the primary renter cohort for "
    "Class B assets — cannot absorb Class A rents without income gains that meaningfully outpace "
    "CPI. Class B multifamily has historically demonstrated lower vacancy volatility and faster "
    "recovery from market dislocations than Class A in Sun Belt markets.", BODY))

story.append(Spacer(1, 0.1*inch))
story.append(Paragraph("Transaction Market Context", H2))
comp_data = [
    [th("Comparable Transaction"), th("Market"), th("Units"), th("Sale Date"), th("Price/Unit"), th("Cap Rate")],
    [td_left("Pinnacle Pointe Portfolio"),     td("Atlanta / Charlotte"), td("2,140"), td("Q3 2024"), td("$178,500"), td("5.0%")],
    [td_left("Sunstone Sun Belt Fund II"),     td("Tampa / Nashville"),   td("1,892"), td("Q4 2024"), td("$162,000"), td("5.4%")],
    [td_left("Meridian Sun Belt Portfolio"),   td("Austin / Charlotte"),  td("1,340"), td("Q2 2024"), td("$185,000"), td("4.8%")],
    [td_left("Valor Residential Portfolio"),   td("Atlanta / Tampa"),     td("3,102"), td("Q1 2025"), td("$158,500"), td("5.6%")],
    [td_left("<b>Summit Ridge (target)</b>", bold=True), td("<b>5-market</b>", bold=True),
     td("<b>2,847</b>", bold=True), td("<b>2025</b>", bold=True),
     td("<b>$166,100</b>", bold=True), td("<b>5.2%</b>", bold=True)],
]
story.append(tbl(comp_data, [2.1*inch, 1.4*inch, 0.7*inch, 0.9*inch, 0.95*inch, 0.8*inch]))
story.append(Spacer(1, 0.08*inch))
story.append(Paragraph("Source: Real Capital Analytics, CoStar, internal Advisor research. All transactions 12-month trailing.", NOTE))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 05 FINANCIAL PERFORMANCE
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("05  |  FINANCIAL PERFORMANCE & NOI ANALYSIS"))
story.append(Spacer(1, 0.15*inch))

story.append(Paragraph("Historical Portfolio P&L", H2))
hist_data = [
    [th(""), th("FY 2022"), th("FY 2023"), th("FY 2024 (LTM)"), th("YoY Growth"), th("Comments")],
    [td_left("Gross Potential Rent (GPR)"), td("$42.1M"), td("$44.8M"), td("$47.2M"), td("+5.4%"), td_left("Avg. rent $1,385 → $1,420")],
    [td_left("Vacancy Loss"),               td("($3.2M)"), td("($3.0M)"), td("($3.1M)"), td(""),     td_left("Avg. 93.2% → 93.4% occ.")],
    [td_left("Concessions & Bad Debt"),     td("($0.8M)"), td("($0.6M)"), td("($0.7M)"), td("",),   td_left("Stabilising post-COVID")],
    [td_left("Other Income"),               td("$1.8M"),   td("$2.1M"),  td("$2.4M"),   td("+14.3%"),td_left("Pet fees, parking, RUBS")],
    [td_left("<b>Effective Gross Income</b>",bold=True), td("<b>$39.9M</b>",bold=True), td("<b>$43.3M</b>",bold=True),
     td("<b>$45.8M</b>",bold=True), td("<b>+5.8%</b>",bold=True), td_left("")],
    [td_left("Property Management"),        td("($3.8M)"), td("($3.9M)"), td("($4.1M)"), td(""),    td_left("3 mgmt co. — consolidating")],
    [td_left("Payroll & Benefits"),         td("($5.2M)"), td("($5.5M)"), td("($5.7M)"), td(""),    td_left("Leasing + maintenance staff")],
    [td_left("Repairs & Maintenance"),      td("($2.6M)"), td("($2.8M)"), td("($2.9M)"), td(""),    td_left("Aging assets, deferred maint.")],
    [td_left("Insurance"),                  td("($2.1M)"), td("($2.4M)"), td("($2.8M)"), td("+16.7%"),td_left("Sun Belt insurance inflation")],
    [td_left("Real Estate Taxes"),          td("($4.1M)"), td("($4.3M)"), td("($4.5M)"), td("+4.7%"),td_left("Tax appeal filed in Atlanta")],
    [td_left("Utilities & Other"),          td("($1.6M)"), td("($1.7M)"), td("($1.7M)"), td("",),   td_left("RUBS recovery offsets 60%")],
    [td_left("<b>Total Operating Expenses</b>",bold=True), td("<b>($19.4M)</b>",bold=True), td("<b>($20.6M)</b>",bold=True),
     td("<b>($21.7M)</b>",bold=True), td(""), td_left("")],
    [td_left("<b>Net Operating Income (NOI)</b>",bold=True), td("<b>$20.5M</b>",bold=True), td("<b>$22.7M</b>",bold=True),
     td("<b>$24.6M</b>",bold=True), td("<b>+8.4%</b>",bold=True), td_left("<b>10.6% NOI margin on EGI</b>",bold=True)],
    [td_left("NOI Margin (% EGI)"),         td("51.4%"), td("52.4%"), td("53.7%"), td("+1.3pp"), td_left("Expanding on operating leverage")],
    [td_left("Per-Unit NOI"),               td("$7,199"), td("$7,974"), td("$8,643"), td("+8.4%"), td_left("Target $11,200 stabilized")],
]
story.append(tbl(hist_data, [2.0*inch, 0.85*inch, 0.85*inch, 1.05*inch, 0.8*inch, 1.65*inch]))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("NOI Bridge: In-Place → Stabilized (Year 3)", H2))
bridge_data = [
    [th("Item"), th("Annual NOI Impact"), th("Assumptions")],
    [td_left("LTM In-Place NOI (Base)"),               td("$24.6M"),  td_left("As of December 2024")],
    [td_left("+ Mark-to-market rent (Year 1–2)"),      td("+$3.8M"),  td_left("17.3% below-market × 2,847 units × 12 months, 40% captured Y1, 60% Y2")],
    [td_left("+ Renovation rent premium (Phase II)"),  td("+$2.4M"),  td_left("1,427 units × $142/mo premium × 12 months (Yr 2–3 rollout)")],
    [td_left("+ Other income growth"),                 td("+$0.5M"),  td_left("RUBS expansion, pet fees, package lockers, parking")],
    [td_left("+ Property management savings"),         td("+$0.8M"),  td_left("Consolidation to single operator, fee reduction from 9% to 7.5%")],
    [td_left("+ Revenue management software"),         td("+$0.4M"),  td_left("Dynamic pricing — 1.5% NOI lift based on comparable deployments")],
    [td_left("− Insurance inflation (2 years)"),       td("($0.5M)"), td_left("Modelled at 8% p.a.")],
    [td_left("− Real estate tax step-ups"),            td("($0.4M)"), td_left("Annual reassessment risk, net of Atlanta appeal savings")],
    [td_left("= Stabilized NOI (Year 3 target)"),      td("$31.6M"),  td_left("$11,100 / unit; 4.72% cap rate on $472.8M purchase price")],
]
story.append(tbl(bridge_data, [2.6*inch, 1.3*inch, 3.4*inch]))

story.append(Spacer(1, 0.1*inch))
story.append(Paragraph(
    "Note: NOI projections are management estimates. Insurance costs are a key variable risk given "
    "Sun Belt property insurance market conditions. See Risk Factors.", NOTE))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 06 VALUE-ADD BUSINESS PLAN
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("06  |  VALUE-ADD BUSINESS PLAN"))
story.append(Spacer(1, 0.15*inch))

story.append(Paragraph("Capital Improvement Program", H2))
capex_data = [
    [th("Workstream"), th("Units / Items"), th("Cost / Unit"), th("Total Capex"), th("Rent Premium"), th("Year 1 ROC")],
    [td_left("Unit Interior Renovations (Ph. I — remaining)"), td("1,427"), td("$8,500"), td("$12.1M"), td("+$142/mo"), td("20.1%")],
    [td_left("Amenity Upgrades (fitness centers, pools)"),     td("14 props"), td("N/A"),  td("$3.2M"),  td("+$18/mo"), td("N/A")],
    [td_left("Technology (smart home, package lockers)"),      td("2,847"), td("$680"),  td("$1.9M"),  td("+$12/mo"), td("9.2%")],
    [td_left("Exterior & Curb Appeal"),                        td("14 props"), td("N/A"),  td("$2.1M"),  td("N/A"),     td("N/A")],
    [td_left("Deferred Maintenance Resolution"),               td("14 props"), td("N/A"),  td("$1.8M"),  td("N/A"),     td("N/A")],
    [td_left("<b>Total Capital Program</b>", bold=True),       td(""),         td(""),     td("<b>$21.1M</b>", bold=True),
     td("<b>+$172/mo avg</b>", bold=True), td("<b>18.7% blended</b>", bold=True)],
]
story.append(tbl(capex_data, [2.4*inch, 0.85*inch, 0.85*inch, 0.85*inch, 0.9*inch, 0.85*inch]))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Operational Improvement Plan", H2))

ops_items = [
    ("Property Management Consolidation (Months 1–4)",
     "Replace three incumbent third-party managers with a single institutional operator identified in pre-close "
     "diligence. Target fee reduction from blended 9.1% of EGI to 7.5%, saving ~$0.8M/year. The new operator "
     "brings centralised leasing, revenue management software (RealPage/Yardi), and a maintenance hub model "
     "reducing call-out costs by an estimated 12%."),
    ("Revenue Management Deployment (Months 1–6)",
     "Implement portfolio-wide dynamic pricing software (RealPage AI Revenue Management or equivalent). "
     "Comparable deployments by peer sponsors have demonstrated 1.5–2.5% NOI uplift through optimised "
     "lease expiration staggering, pricing by unit type, and real-time competitor rate monitoring. "
     "Projected benefit: $400K NOI in Year 1, growing to $600K by Year 2."),
    ("Ancillary Income Expansion (Months 3–12)",
     "Deploy RUBS (Ratio Utility Billing System) across the 8 properties where it is not yet active, "
     "increasing utility cost recovery from 60% to ~85% of total utility expense. Additional initiatives: "
     "structured parking programs ($30–$50/month at 4 urban properties), package locker monetisation, "
     "and pet fee standardisation ($50/month pet rent + $300 deposit). Combined target: $500K incremental "
     "NOI by end of Year 1."),
    ("Tax Appeal Strategy (Months 1–6)",
     "Engage specialist property tax counsel in Atlanta and Tampa — the two markets where assessment "
     "values appear 12–18% above fair market value based on recent comparable sales. Successful appeals "
     "(50% probability based on advisor experience) could reduce tax expense by $280K–$420K annually "
     "on a permanent basis."),
]

for title, text in ops_items:
    story.append(KeepTogether([
        Paragraph(f"<b>{title}</b>", BOLD),
        Paragraph(text, BODY),
        Spacer(1, 0.08*inch),
    ]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 07 CAPITAL STRUCTURE
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("07  |  CAPITAL STRUCTURE & FINANCING"))
story.append(Spacer(1, 0.15*inch))

story.append(kpi_box([
    ("60%", "LTV at Close"),
    ("$283.7M", "Senior Debt"),
    ("$189.1M", "Equity Check"),
    ("1.24x", "DSCR at Close"),
]))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("Proposed Capital Structure", H2))
cap_data = [
    [th("Tranche"), th("Amount"), th("% of Cap"), th("Rate / Spread"), th("Maturity"), th("Notes")],
    [td_left("Senior Term Loan (TL)"),   td("$283.7M"), td("60.0%"), td("SOFR + 190 bps"), td("5+1+1 yr"), td_left("Floating, interest-only Yr 1–2; IO extension subject to DSCR test")],
    [td_left("Revolving Credit Facility"),td("$15.0M"), td("3.2%"),  td("SOFR + 210 bps"), td("3 yr"),    td_left("Capex and working capital; undrawn at close")],
    [td_left("Sponsor Equity"),          td("$189.1M"), td("40.0%"), td("N/A"),             td("N/A"),     td_left("LP equity via commingled RE fund")],
    [td_left("<b>Total Capitalisation</b>",bold=True), td("<b>$487.8M</b>",bold=True), td("<b>103.2%</b>",bold=True),
     td(""), td(""), td_left("(includes $15M undrawn RCF)")],
]
story.append(tbl(cap_data, [1.5*inch, 0.9*inch, 0.75*inch, 1.2*inch, 0.85*inch, 2.3*inch]))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("Debt Coverage Metrics", H2))
cov_data = [
    [th("Metric"), th("At Close"), th("Year 2"), th("Year 3 (Stabilized)"), th("Covenant")],
    [td_left("Net Debt / NOI (Implied Cap Rate Basis)"),   td("11.5x"), td("10.2x"), td("9.0x"), td("< 13.0x")],
    [td_left("LTV Ratio"),                                  td("60.0%"), td("57.2%"), td("53.8%"), td("< 70.0%")],
    [td_left("Debt Service Coverage Ratio (DSCR)"),         td("1.24x"), td("1.38x"), td("1.59x"), td("> 1.20x")],
    [td_left("Interest Coverage (NOI / Interest)"),         td("2.04x"), td("2.27x"), td("2.62x"), td("> 1.50x")],
    [td_left("Break-even Occupancy"),                       td("81.2%"), td("78.6%"), td("75.1%"), td("N/A")],
]
story.append(tbl(cov_data, [2.5*inch, 0.9*inch, 0.9*inch, 1.3*inch, 0.9*inch]))

story.append(Spacer(1, 0.1*inch))
story.append(Paragraph(
    "Interest rate assumption: SOFR 4.85% (Dec 2024 forward curve) declining to 4.20% by end of Year 2. "
    "Floating rate risk partially mitigated by interest rate cap (SOFR @ 6.0% for Years 1–3). "
    "Refinancing risk in Years 4–5 is the primary macro sensitivity in the bear case.", NOTE))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 08 RETURNS ANALYSIS
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("08  |  RETURNS ANALYSIS — SCENARIOS & SENSITIVITIES"))
story.append(Spacer(1, 0.15*inch))

story.append(Paragraph("Base Assumptions", H2))
story.append(Paragraph(
    "Exit in Year 5. Terminal cap rate applied to Year 5 NOI. No refinancing assumed — full sale. "
    "Returns calculated net of acquisition costs, capex, and disposition costs (1.5% of gross proceeds). "
    "Debt assumed at SOFR + 190 bps; rate cap purchase cost embedded in Year 1 capex.", BODY))

story.append(Paragraph("Scenario Returns Matrix", H2))
scenario_data = [
    [th(""), th("Bear Case"), th("Base Case"), th("Bull Case"), th("Upside Case")],
    [td_left("Year 1–5 NOI CAGR"),   td("4.8%"),  td("6.2%"),  td("7.8%"),  td("9.1%")],
    [td_left("Exit Year 5 NOI"),      td("$28.4M"), td("$31.6M"), td("$34.8M"), td("$37.9M")],
    [td_left("Exit Cap Rate"),         td("5.5%"),  td("5.2%"),  td("4.9%"),  td("4.6%")],
    [td_left("Gross Exit Value"),      td("$516M"), td("$608M"), td("$710M"), td("$824M")],
    [td_left("Net Debt at Exit"),      td("$248M"), td("$238M"), td("$228M"), td("$218M")],
    [td_left("Net Equity Proceeds"),   td("$268M"), td("$370M"), td("$482M"), td("$606M")],
    [td_left("<b>Gross IRR</b>", bold=True), td("<b>12.4%</b>",bold=True), td("<b>18.5%</b>",bold=True),
     td("<b>24.7%</b>",bold=True), td("<b>30.8%</b>",bold=True)],
    [td_left("<b>Equity Multiple (MOIC)</b>",bold=True), td("<b>1.6x</b>",bold=True), td("<b>2.2x</b>",bold=True),
     td("<b>2.7x</b>",bold=True), td("<b>3.3x</b>",bold=True)],
    [td_left("5-Year Cash Yield (avg.)"), td("4.8%"), td("6.1%"), td("7.4%"), td("8.6%")],
]
story.append(tbl(scenario_data, [1.9*inch, 1.2*inch, 1.2*inch, 1.2*inch, 1.2*inch]))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("Exit Cap Rate Sensitivity (Base Case NOI: $31.6M)", H2))
sens_data = [
    [th("Exit Cap Rate ↓  /  Exit Year →"), th("Year 4"), th("Year 5"), th("Year 6")],
    [td_left("4.5%"), td("22.1%"), td("21.4%"), td("20.2%")],
    [td_left("5.0%"), td("19.8%"), td("19.2%"), td("18.1%")],
    [td_left("5.2%  (Base)"), td("19.1%"), td("<b>18.5%</b>",bold=True), td("17.4%")],
    [td_left("5.5%"), td("17.6%"), td("16.9%"), td("15.9%")],
    [td_left("6.0%"), td("14.8%"), td("14.2%"), td("13.3%")],
]
story.append(tbl(sens_data, [2.2*inch, 1.5*inch, 1.5*inch, 1.5*inch]))
story.append(Spacer(1, 0.08*inch))
story.append(Paragraph("All figures are Gross IRR. Returns remain above 14% under all modelled scenarios.", NOTE))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 09 RISK FACTORS
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("09  |  RISK FACTORS"))
story.append(Spacer(1, 0.15*inch))

risks = [
    ("HIGH", "Interest Rate Risk",
     "The portfolio is 100% floating rate at acquisition. A 100 bps increase in SOFR above the rate cap strike "
     "(6.0%) would add ~$2.8M in annual interest expense, reducing DSCR to 1.08x — near covenant minimum. "
     "Mitigation: 3-year rate cap purchased at close; Year 3 DSCR of 1.59x provides significant cushion "
     "before covenant breach. Refinancing risk in Years 4–5 is partially mitigated by projected NOI growth."),
    ("HIGH", "Insurance Cost Inflation",
     "Sun Belt property insurance premiums increased 28–42% in 2023–2024 driven by hurricane risk repricing, "
     "reinsurer withdrawals, and carrier exits from Florida. The portfolio's insurance expense is modelled at "
     "$2.8M LTM, growing 8% annually — 200 bps above CPI. Significant further increases could erode 2–4% "
     "of projected NOI growth. Mitigation: bulk coverage bid across all 14 assets, parametric insurance exploration."),
    ("MEDIUM", "Renovation Execution Risk",
     "Value-add renovation programs require reliable contractor access, tenant cooperation, and cost discipline. "
     "Renovation cost overruns of 15% would reduce Phase II ROC from 20.1% to 16.8% — still accretive but "
     "narrowing the return buffer. Schedule delays of 6+ months in any major market would delay rent premium "
     "capture. Mitigation: fixed-price contracts with top-3 regional renovation contractors pre-qualified."),
    ("MEDIUM", "New Supply Concentration Risk",
     "Austin and Nashville have above-average new supply pipelines in 2025 (8,200 and 9,800 units respectively "
     "vs. trailing 5-year averages of 6,100 and 7,200). Localised supply pressure could slow rent growth and "
     "increase concessions in those submarkets (22% of portfolio by units). Mitigation: portfolio diversification "
     "across five MSAs limits single-market exposure; Class B assets less directly competitive with new Class A supply."),
    ("MEDIUM", "Tenant Displacement Risk on Renovations",
     "In-unit renovations require tenant relocation or unit vacancy. Renovating occupied units at scale carries "
     "legal risk in markets with increasingly active tenant advocacy (Atlanta, Nashville). Forced relocation "
     "assistance obligations and potential rent control legislation (currently none in target markets) are "
     "a watch item. Mitigation: legal counsel in each market; opt-in renovation incentive program."),
    ("LOW", "Tax Reassessment Risk",
     "Property tax expense ($4.5M LTM) could increase materially if purchase price triggers reassessment in "
     "jurisdictions with active reassessment programs (Georgia, Florida). Model assumes 4.7% annual tax growth. "
     "Mitigation: tax appeal counsel engaged in Atlanta and Tampa; acquisition structure may allow partial "
     "basis step-up avoidance."),
]

risk_tbl_data = [[th("Severity"), th("Risk"), th("Description")]]
for sev, name, desc in risks:
    color = RED if sev == "HIGH" else (colors.HexColor("#D4A017") if sev == "MEDIUM" else GREEN)
    sev_para = Paragraph(f"<b>{sev}</b>", ParagraphStyle("rs", fontName="Helvetica-Bold",
                          fontSize=8, textColor=color, alignment=TA_CENTER, leading=11))
    risk_tbl_data.append([sev_para, td_left(name, bold=True), td_left(desc)])

t = Table(risk_tbl_data, colWidths=[0.75*inch, 1.35*inch, 5.1*inch], repeatRows=1)
t.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1,0),  NAVY),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),  [WHITE, SILVER]),
    ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ("TOPPADDING",    (0,0), (-1,-1), 5),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("LEFTPADDING",   (0,0), (-1,-1), 6),
    ("RIGHTPADDING",  (0,0), (-1,-1), 6),
    ("GRID",          (0,0), (-1,-1), 0.4, LGREY),
]))
story.append(t)
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 10 MANAGEMENT TEAM
# ═══════════════════════════════════════════════════════════════
story.append(section_banner("10  |  MANAGEMENT TEAM & SPONSORS"))
story.append(Spacer(1, 0.15*inch))

story.append(Paragraph("Sponsor — Axis Capital Advisors", H2))
story.append(Paragraph(
    "Axis Capital Advisors is a mid-market real estate private equity firm with $2.4B AUM focused on "
    "value-add and opportunistic multifamily investments across Sun Belt markets. Since founding in 2014, "
    "Axis has acquired 12,800+ units across 7 funds, completing 38 exits with a realized gross IRR of 21.4% "
    "and 2.4x equity multiple. The firm employs 42 investment and asset management professionals across "
    "offices in Atlanta, Tampa, and Austin.", BODY))

story.append(Paragraph("Senior Investment Team", H2))
team_data = [
    [th("Name"), th("Title"), th("Tenure"), th("Background")],
    [td_left("David Thornton"),  td_left("Managing Partner"),       td("11 years"), td_left("Former Equity Residential VP Acquisitions; $4.2B career transaction volume; MBA Wharton")],
    [td_left("Sarah Chen"),      td_left("Partner, Investments"),   td("8 years"),  td_left("Former Greystar acquisition director; led 7 Sun Belt value-add exits averaging 22.1% IRR")],
    [td_left("Marcus Webb"),     td_left("Managing Director, AM"),  td("9 years"),  td_left("Former AvalonBay asset manager; implemented revenue management across 8,200 units; 14% NOI lift")],
    [td_left("Jennifer Park"),   td_left("VP, Finance & Capital"),  td("6 years"),  td_left("Former Wells Fargo CMBS; manages lender relationships; closed $1.8B in multifamily debt")],
    [td_left("Carlos Rivera"),   td_left("VP, Construction Mgmt"),  td("5 years"),  td_left("Managed $180M in value-add renovation programs; zero cost overruns >8% on last 6 projects")],
]
story.append(tbl(team_data, [1.35*inch, 1.55*inch, 0.75*inch, 3.8*inch]))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("Track Record (Selected Realised Investments)", H2))
track_data = [
    [th("Portfolio"), th("Market"), th("Units"), th("Vintage"), th("Exit Year"), th("Gross IRR"), th("MOIC"), th("Strategy")],
    [td_left("Palmetto Sun Portfolio"), td("SC / GA"),  td("1,840"), td("2018"), td("2023"), td("24.8%"), td("2.9x"), td_left("Value-add")],
    [td_left("River District Portfolio"),td("TN / NC"), td("2,210"), td("2019"), td("2024"), td("21.2%"), td("2.6x"), td_left("Value-add")],
    [td_left("Gulf Coast Communities"),  td("FL"),      td("1,120"), td("2017"), td("2022"), td("19.6%"), td("2.4x"), td_left("Value-add")],
    [td_left("Sunbelt Workforce Fund I"),td("Multi"),   td("3,450"), td("2016"), td("2021"), td("18.4%"), td("2.2x"), td_left("Core-plus")],
    [td_left("<b>Total / Weighted Avg</b>",bold=True), td(""),td("<b>8,620</b>",bold=True), td(""), td(""),
     td("<b>21.4%</b>",bold=True), td("<b>2.4x</b>",bold=True), td_left("")],
]
story.append(tbl(track_data, [1.65*inch, 0.75*inch, 0.6*inch, 0.7*inch, 0.75*inch, 0.8*inch, 0.65*inch, 0.9*inch]))

story.append(Spacer(1, 0.2*inch))
story.append(hr())
story.append(Paragraph("NEXT STEPS", H2))
next_steps = [
    ("1.", "Non-Disclosure Agreement — required to receive financial model and property-level detail"),
    ("2.", "Management Presentation — April 22–24, 2025 (Atlanta, Nashville, and Austin site visits available)"),
    ("3.", "Indicative LOI Submission — April 30, 2025 (5:00 PM EST)"),
    ("4.", "Best and Final Round — May 15, 2025"),
    ("5.", "Targeted Closing — June 30, 2025 (subject to lender confirmation)"),
]
for num, step in next_steps:
    story.append(Paragraph(f"<b>{num}</b>  {step}", BODY))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph(
    "For additional information or to schedule a management presentation, contact:<br/>"
    "<b>Sarah Chen, Partner</b>  ·  s.chen@axiscapitaladvisors.com  ·  +1 (404) 555-0182<br/>"
    "<b>Jennifer Park, VP Finance</b>  ·  j.park@axiscapitaladvisors.com  ·  +1 (404) 555-0194",
    BOLD))

story.append(Spacer(1, 0.4*inch))
story.append(gold_bar())
story.append(Paragraph(
    "AXIS CAPITAL ADVISORS  ·  1180 Peachtree Street NE, Suite 2400, Atlanta, GA 30309  ·  "
    "www.axiscapitaladvisors.com  ·  STRICTLY CONFIDENTIAL", CONF))

# ─── Build ──────────────────────────────────────────────────────
doc.build(story)
print(f"Created: {OUT}")
print(f"Size: {os.path.getsize(OUT):,} bytes")
