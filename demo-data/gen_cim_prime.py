#!/usr/bin/env python3
"""Generate PrimeHealth Partners CIM PDF using reportlab."""

from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas as pdfcanvas

OUTPUT = "/sessions/gracious-affectionate-dirac/mnt/axis-copilot/demo-data/cim-primehealth.pdf"

NAVY = colors.HexColor("#1A3A5C")
GOLD = colors.HexColor("#B8860B")
LIGHT_GOLD = colors.HexColor("#D4A017")
WHITE = colors.white
LIGHT_GRAY = colors.HexColor("#F5F5F5")
MID_GRAY = colors.HexColor("#CCCCCC")
DARK_GRAY = colors.HexColor("#444444")
ALT_ROW = colors.HexColor("#EEF2F7")

PAGE_W, PAGE_H = letter
MARGIN = 0.85 * inch
CONTENT_W = PAGE_W - 2 * MARGIN


# ─── Style Factory ─────────────────────────────────────────────────────────────

def S(name, **kw):
    defaults = dict(fontName="Helvetica", fontSize=9.5, leading=14, textColor=DARK_GRAY)
    defaults.update(kw)
    return ParagraphStyle(name, **defaults)

Cover1      = S("Cover1", fontSize=30, leading=36, textColor=WHITE, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=12)
Cover2      = S("Cover2", fontSize=18, leading=22, textColor=LIGHT_GOLD, alignment=TA_CENTER, spaceAfter=8)
Cover3      = S("Cover3", fontSize=11, leading=14, textColor=WHITE, alignment=TA_CENTER, spaceAfter=6)
CoverConf   = S("CoverConf", fontSize=9, leading=11, textColor=LIGHT_GOLD, fontName="Helvetica-Bold", alignment=TA_CENTER)
CoverDisc   = S("CoverDisc", fontSize=7, leading=9.5, textColor=MID_GRAY, alignment=TA_CENTER)
CoverInfo   = S("CoverInfo", fontSize=9, leading=13, textColor=WHITE)
CoverInfoL  = S("CoverInfoL", fontSize=9, leading=13, textColor=LIGHT_GOLD, fontName="Helvetica-Bold")
SecTitle    = S("SecTitle", fontSize=16, leading=20, textColor=NAVY, fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=8)
SubTitle    = S("SubTitle", fontSize=12, leading=15, textColor=GOLD, fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4)
Body        = S("Body", alignment=TA_JUSTIFY, spaceAfter=6)
Bullet      = S("Bullet", leftIndent=16, firstLineIndent=-12, spaceAfter=4)
TH          = S("TH", fontSize=9, textColor=WHITE, fontName="Helvetica-Bold", alignment=TA_CENTER)
TC          = S("TC", fontSize=8.5, textColor=DARK_GRAY, alignment=TA_CENTER)
TCL         = S("TCL", fontSize=8.5, textColor=DARK_GRAY, alignment=TA_LEFT)
Footnote    = S("Footnote", fontSize=7.5, fontName="Helvetica-Oblique", spaceAfter=2)
Bold        = S("Bold", fontName="Helvetica-Bold", textColor=NAVY)
BoldC       = S("BoldC", fontName="Helvetica-Bold", textColor=NAVY, alignment=TA_CENTER)


def tbl(data, col_widths, bold_last=False):
    """Build a styled table."""
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUND", (0, 1), (-1, -1), [WHITE, ALT_ROW]),
        ("GRID", (0, 0), (-1, -1), 0.4, MID_GRAY),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, GOLD),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle(cmds))
    return t


# ─── Canvas ────────────────────────────────────────────────────────────────────

class NumberedCanvas(pdfcanvas.Canvas):
    def __init__(self, *args, **kwargs):
        pdfcanvas.Canvas.__init__(self, *args, **kwargs)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        n = len(self._saved)
        for i, state in enumerate(self._saved):
            self.__dict__.update(state)
            self._draw_chrome(i + 1, n)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)

    def _draw_chrome(self, page_num, total):
        if page_num == 1:
            return
        self.saveState()
        # Header bar
        self.setFillColor(NAVY)
        self.rect(0, PAGE_H - 0.52 * inch, PAGE_W, 0.52 * inch, fill=1, stroke=0)
        self.setFillColor(WHITE)
        self.setFont("Helvetica-Bold", 8)
        self.drawString(MARGIN, PAGE_H - 0.33 * inch, "PRIMEHEALTH PARTNERS")
        self.setFont("Helvetica", 7)
        self.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.33 * inch,
                             "CONFIDENTIAL — FOR DISCUSSION PURPOSES ONLY")
        self.setStrokeColor(GOLD)
        self.setLineWidth(2)
        self.line(0, PAGE_H - 0.54 * inch, PAGE_W, PAGE_H - 0.54 * inch)
        # Footer
        self.setStrokeColor(MID_GRAY)
        self.setLineWidth(0.5)
        self.line(MARGIN, 0.52 * inch, PAGE_W - MARGIN, 0.52 * inch)
        self.setFillColor(DARK_GRAY)
        self.setFont("Helvetica", 7)
        self.drawString(MARGIN, 0.31 * inch,
                        "Project Pinnacle | Strictly Confidential | Not for distribution")
        self.drawRightString(PAGE_W - MARGIN, 0.31 * inch,
                             f"Page {page_num} of {total}")
        self.restoreState()


# ─── Pages ─────────────────────────────────────────────────────────────────────

def cover():
    s = []
    s.append(Spacer(1, 1.6 * inch))
    s.append(HRFlowable(width=CONTENT_W, thickness=3, color=GOLD, spaceAfter=18))
    s.append(Paragraph("PRIMEHEALTH PARTNERS", Cover1))
    s.append(Spacer(1, 0.08 * inch))
    s.append(Paragraph("Leading Post-Acute Care Platform", Cover2))
    s.append(Spacer(1, 0.25 * inch))
    s.append(HRFlowable(width=CONTENT_W, thickness=1.5, color=GOLD, spaceAfter=18))
    s.append(Spacer(1, 0.2 * inch))
    s.append(Paragraph("Confidential Information Memorandum", Cover3))
    s.append(Spacer(1, 0.06 * inch))
    s.append(Paragraph("Project Pinnacle", Cover2))
    s.append(Spacer(1, 0.4 * inch))
    info_rows = [
        ["Deal Reference:", "Project Pinnacle"],
        ["Date:", "April 2026"],
        ["Exclusive Advisor:", "Evercore Healthcare Advisory Group"],
        ["Headquarters:", "Nashville, Tennessee"],
        ["Transaction Type:", "Platform Buyout — Control Interest"],
    ]
    td = [[Paragraph(r[0], CoverInfoL), Paragraph(r[1], CoverInfo)] for r in info_rows]
    it = Table(td, colWidths=[2.1 * inch, 3.3 * inch])
    it.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0, NAVY),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("ALIGN", (0,0), (-1,-1), "LEFT"),
    ]))
    s.append(it)
    s.append(Spacer(1, 0.5 * inch))
    s.append(HRFlowable(width=CONTENT_W, thickness=1, color=GOLD, spaceAfter=8))
    s.append(Paragraph("CONFIDENTIAL — FOR DISCUSSION PURPOSES ONLY", CoverConf))
    s.append(Spacer(1, 0.08 * inch))
    s.append(Paragraph(
        "This document has been prepared by Evercore Healthcare Advisory Group on behalf of PrimeHealth Partners. "
        "It is intended solely for the use of the named recipient and may not be reproduced or redistributed "
        "without prior written consent.", CoverDisc))
    s.append(PageBreak())
    return s


def toc():
    s = []
    s.append(Paragraph("TABLE OF CONTENTS", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=14))
    rows = [
        [Paragraph("Sec.", TH), Paragraph("Section Title", TH), Paragraph("Page", TH)],
        [Paragraph("1", TC), Paragraph("Executive Summary", TCL), Paragraph("3", TC)],
        [Paragraph("2", TC), Paragraph("Investment Highlights", TCL), Paragraph("5", TC)],
        [Paragraph("3", TC), Paragraph("Company Overview", TCL), Paragraph("6", TC)],
        [Paragraph("4", TC), Paragraph("Clinical Platform & Services", TCL), Paragraph("8", TC)],
        [Paragraph("5", TC), Paragraph("Market Overview", TCL), Paragraph("10", TC)],
        [Paragraph("6", TC), Paragraph("Financial Performance", TCL), Paragraph("12", TC)],
        [Paragraph("7", TC), Paragraph("Growth Strategy", TCL), Paragraph("15", TC)],
        [Paragraph("8", TC), Paragraph("Management Team", TCL), Paragraph("16", TC)],
        [Paragraph("9", TC), Paragraph("Transaction Overview", TCL), Paragraph("17", TC)],
        [Paragraph("A", TC), Paragraph("Appendix: Facility List & Key Metrics", TCL), Paragraph("18", TC)],
    ]
    t = tbl(rows, [0.7*inch, 5.0*inch, 0.7*inch])
    s.append(t)
    s.append(PageBreak())
    return s


def exec_summary():
    s = []
    s.append(Paragraph("SECTION 1: EXECUTIVE SUMMARY", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    s.append(Paragraph("Investment Opportunity", SubTitle))
    s.append(Paragraph(
        "PrimeHealth Partners (\"PrimeHealth\" or the \"Company\") represents a compelling platform "
        "buyout opportunity in the post-acute care sector. Founded in 2011 and headquartered in "
        "Nashville, Tennessee, PrimeHealth has grown into a leading regional operator of skilled "
        "nursing and rehabilitation facilities across eight states, serving approximately 1,520,000 "
        "patient days annually across its 45-facility portfolio.", Body))
    s.append(Paragraph(
        "The Company is offered at an enterprise value of approximately $225 million (1.2x FY2024 "
        "revenue, 8.0x FY2024 EBITDA), representing an attractive entry multiple given the "
        "Company's demonstrated growth trajectory, proprietary clinical platform, and significant "
        "white space for organic and inorganic expansion. Evercore Healthcare Advisory Group has "
        "been retained as exclusive financial advisor.", Body))

    s.append(Paragraph("Company Snapshot", SubTitle))
    snap = [
        [Paragraph("Metric", TH), Paragraph("Value", TH), Paragraph("Metric", TH), Paragraph("Value", TH)],
        [Paragraph("Founded", TCL), Paragraph("2011", TC), Paragraph("FY2024 Revenue", TCL), Paragraph("$185.0M", TC)],
        [Paragraph("Headquarters", TCL), Paragraph("Nashville, TN", TC), Paragraph("FY2024 EBITDA", TCL), Paragraph("$28.0M", TC)],
        [Paragraph("Employees", TCL), Paragraph("~2,400", TC), Paragraph("EBITDA Margin", TCL), Paragraph("15.1%", TC)],
        [Paragraph("Facilities", TCL), Paragraph("45", TC), Paragraph("Revenue Growth (YoY)", TCL), Paragraph("18%", TC)],
        [Paragraph("States", TCL), Paragraph("8", TC), Paragraph("Gross Margin", TCL), Paragraph("38%", TC)],
        [Paragraph("Patient Days (FY2024)", TCL), Paragraph("1.52M", TC), Paragraph("Enterprise Value", TCL), Paragraph("~$225M", TC)],
    ]
    s.append(tbl(snap, [1.7*inch, 1.4*inch, 1.7*inch, 1.9*inch]))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("Key Financial Metrics (FY2022-FY2024)", SubTitle))
    kpi = [
        [Paragraph("Income Statement ($M)", TH), Paragraph("FY2022", TH), Paragraph("FY2023", TH), Paragraph("FY2024", TH), Paragraph("CAGR", TH)],
        [Paragraph("Net Revenue", TCL), Paragraph("$133.0", TC), Paragraph("$156.8", TC), Paragraph("$185.0", TC), Paragraph("17.9%", TC)],
        [Paragraph("  YoY Growth", TCL), Paragraph("—", TC), Paragraph("17.9%", TC), Paragraph("18.0%", TC), Paragraph("", TC)],
        [Paragraph("Gross Profit", TCL), Paragraph("$50.5", TC), Paragraph("$59.6", TC), Paragraph("$70.3", TC), Paragraph("18.0%", TC)],
        [Paragraph("Gross Margin", TCL), Paragraph("38.0%", TC), Paragraph("38.0%", TC), Paragraph("38.0%", TC), Paragraph("", TC)],
        [Paragraph("EBITDA", S("EKPI", fontName="Helvetica-Bold", fontSize=8.5, textColor=NAVY, alignment=TA_LEFT)),
         Paragraph("$18.6", BoldC), Paragraph("$22.6", BoldC), Paragraph("$28.0", BoldC), Paragraph("22.7%", BoldC)],
        [Paragraph("EBITDA Margin", TCL), Paragraph("14.0%", TC), Paragraph("14.4%", TC), Paragraph("15.1%", TC), Paragraph("", TC)],
        [Paragraph("Patient Days (000s)", TCL), Paragraph("1,240", TC), Paragraph("1,385", TC), Paragraph("1,520", TC), Paragraph("10.7%", TC)],
    ]
    t = tbl(kpi, [2.2*inch, 1.2*inch, 1.2*inch, 1.2*inch, 0.9*inch])
    ts = t._cellStyles  # noqa
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 9),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("ROWBACKGROUND", (0,1), (-1,-1), [WHITE, ALT_ROW]),
        ("GRID", (0,0), (-1,-1), 0.4, MID_GRAY),
        ("LINEBELOW", (0,0), (-1,0), 1.5, GOLD),
        ("LINEABOVE", (0,5), (-1,5), 1, GOLD),
        ("LINEBELOW", (0,5), (-1,5), 1, GOLD),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ]))
    s.append(t)

    s.append(Spacer(1, 0.12*inch))
    s.append(Paragraph("Investment Thesis Summary", SubTitle))
    s.append(Paragraph("The PrimeHealth opportunity is underpinned by four core value creation pillars:", Body))
    for b in [
        "Scale and Geographic Density: Regional cluster strategy creates referral network advantages and operational leverage that independent operators cannot replicate.",
        "Clinical Differentiation: Proprietary ClinicalEdge platform drives 30% lower readmission rates versus the national average, enabling premium reimbursement positioning.",
        "Roll-Up Platform: Highly fragmented post-acute care market (top 10 operators hold only 18% share) presents extensive M&A pipeline. PrimeHealth's infrastructure is purpose-built for bolt-on acquisitions.",
        "Demographic Tailwinds: 10,000 Baby Boomers turn 65 every day, driving structural demand growth in a $220 billion and growing addressable market.",
    ]:
        s.append(Paragraph(f"  - {b}", Bullet))
    s.append(PageBreak())
    return s


def investment_highlights():
    s = []
    s.append(Paragraph("SECTION 2: INVESTMENT HIGHLIGHTS", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    items = [
        ("1. High-Growth, Scaled Platform",
         "PrimeHealth has delivered 18% revenue CAGR over the past three fiscal years, growing from "
         "$133M (FY2022) to $185M (FY2024), driven by organic volume growth and strategic facility "
         "additions. The Company has added 10 net new facilities since 2020."),
        ("2. Proprietary Clinical Technology",
         "The ClinicalEdge platform reduces readmission rates 30% below the national average. This "
         "drives superior CMS star ratings, stronger referral volumes from acute care hospitals, and "
         "premium payor contracts unavailable to non-differentiated operators."),
        ("3. Defensible Revenue with Medicare Anchoring",
         "Medicare accounts for 62% of the payor mix, providing a relatively stable and higher-margin "
         "revenue base. PrimeHealth's average Medicare per-diem of $610 compares favorably to the "
         "national average of $570, reflecting a clinical quality premium."),
        ("4. Proven M&A Integration Capability",
         "Management has acquired and integrated 14 facilities since 2018 with an average "
         "post-acquisition EBITDA margin improvement of 350 basis points within 24 months. A pipeline "
         "of 8 identified targets representing $45M in revenue is immediately actionable."),
        ("5. Attractive Entry Valuation",
         "At 8.0x LTM EBITDA, the proposed transaction represents a meaningful discount to publicly "
         "traded post-acute care peers (average 10-12x) and recent comparable private transactions "
         "(average 9-11x), offering a compelling risk-adjusted return profile."),
        ("6. Experienced Management Team",
         "Led by Dr. Margaret Collins (ex-HCA Healthcare Division President) and CFO Robert Haines "
         "(ex-Kindred Healthcare, CPA/CFA), the team averages 22 years of healthcare operations "
         "experience and has demonstrated the ability to execute at scale."),
    ]

    for title, body in items:
        hl = [
            [Paragraph(title, S("HLT", fontSize=9.5, fontName="Helvetica-Bold", textColor=NAVY, leading=13)),
             Paragraph(body, Body)],
        ]
        ht = Table(hl, colWidths=[2.1*inch, 4.6*inch])
        ht.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (0,0), ALT_ROW),
            ("LINEAFTER", (0,0), (0,0), 2, GOLD),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("LEFTPADDING", (0,0), (-1,-1), 8),
            ("RIGHTPADDING", (0,0), (-1,-1), 8),
            ("BOX", (0,0), (-1,-1), 0.5, MID_GRAY),
        ]))
        s.append(ht)
        s.append(Spacer(1, 0.07*inch))

    s.append(PageBreak())
    return s


def company_overview():
    s = []
    s.append(Paragraph("SECTION 3: COMPANY OVERVIEW", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    s.append(Paragraph("Company History", SubTitle))
    s.append(Paragraph(
        "PrimeHealth Partners was founded in 2011 by Dr. Margaret Collins and Robert Haines with the "
        "vision of building a clinically superior, scalable post-acute care platform in underserved "
        "regional markets. Starting with a single skilled nursing facility in Brentwood, TN, the "
        "Company has grown organically and through acquisition to operate 45 facilities across 8 states.", Body))

    mile = [
        [Paragraph("Year", TH), Paragraph("Milestone", TH)],
        [Paragraph("2011", TC), Paragraph("Founded; first facility opens in Brentwood, TN (120 beds)", TCL)],
        [Paragraph("2013", TC), Paragraph("Expanded to 5 facilities; first statewide Medicaid managed care contract", TCL)],
        [Paragraph("2015", TC), Paragraph("Series A growth equity raise; Kentucky and Georgia market entry", TCL)],
        [Paragraph("2017", TC), Paragraph("Launch of proprietary ClinicalEdge platform across all facilities", TCL)],
        [Paragraph("2018", TC), Paragraph("First bolt-on acquisition (3 facilities, Alabama); EBITDA crosses $10M", TCL)],
        [Paragraph("2019", TC), Paragraph("Lisa Nguyen hired as COO; regional cluster strategy formalized", TCL)],
        [Paragraph("2020", TC), Paragraph("Covid-19 response earns 5-star CMS ratings across 80% of portfolio", TCL)],
        [Paragraph("2021", TC), Paragraph("Dr. Park joins as CMO; Indiana and Ohio market entry", TCL)],
        [Paragraph("2022", TC), Paragraph("Revenue reaches $133M; 35 facilities across 7 states", TCL)],
        [Paragraph("2023", TC), Paragraph("Two bolt-on acquisitions (5 facilities); Kentucky cluster reaches critical mass", TCL)],
        [Paragraph("2024", TC), Paragraph("Revenue reaches $185M; 45 facilities; 8th state (Virginia) entry", TCL)],
    ]
    s.append(tbl(mile, [0.75*inch, 5.95*inch]))
    s.append(Spacer(1, 0.15*inch))

    s.append(Paragraph("Geographic Footprint", SubTitle))
    s.append(Paragraph(
        "PrimeHealth operates a purposeful regional density strategy, concentrating facilities within "
        "60-mile radiuses of major metropolitan centers to maximize referral capture from acute care "
        "hospitals and create operational efficiencies through shared clinical staff.", Body))

    geo = [
        [Paragraph(h, TH) for h in ["State", "Facilities", "Licensed Beds", "CMS Stars (Avg)", "FY2024 Rev ($M)"]],
        [Paragraph("Tennessee", TCL), Paragraph("12", TC), Paragraph("1,420", TC), Paragraph("4.2", TC), Paragraph("$49.2", TC)],
        [Paragraph("Kentucky", TCL), Paragraph("9", TC), Paragraph("1,080", TC), Paragraph("4.4", TC), Paragraph("$37.1", TC)],
        [Paragraph("Georgia", TCL), Paragraph("7", TC), Paragraph("840", TC), Paragraph("4.1", TC), Paragraph("$28.9", TC)],
        [Paragraph("Alabama", TCL), Paragraph("6", TC), Paragraph("720", TC), Paragraph("3.9", TC), Paragraph("$24.7", TC)],
        [Paragraph("Indiana", TCL), Paragraph("4", TC), Paragraph("480", TC), Paragraph("4.3", TC), Paragraph("$16.5", TC)],
        [Paragraph("Ohio", TCL), Paragraph("4", TC), Paragraph("480", TC), Paragraph("4.0", TC), Paragraph("$16.5", TC)],
        [Paragraph("North Carolina", TCL), Paragraph("2", TC), Paragraph("240", TC), Paragraph("4.5", TC), Paragraph("$8.2", TC)],
        [Paragraph("Virginia", TCL), Paragraph("1", TC), Paragraph("120", TC), Paragraph("4.0", TC), Paragraph("$3.9", TC)],
        [Paragraph("TOTAL", Bold), Paragraph("45", BoldC), Paragraph("5,380", BoldC), Paragraph("4.2", BoldC), Paragraph("$185.0", BoldC)],
    ]
    s.append(tbl(geo, [1.5*inch, 1.0*inch, 1.2*inch, 1.3*inch, 1.7*inch]))
    s.append(Paragraph("Source: Company data. CMS star ratings as of January 2026 publication.", Footnote))
    s.append(PageBreak())
    return s


def clinical_platform():
    s = []
    s.append(Paragraph("SECTION 4: CLINICAL PLATFORM & SERVICES", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    s.append(Paragraph("Care Model", SubTitle))
    s.append(Paragraph(
        "PrimeHealth operates a comprehensive post-acute care model integrating skilled nursing "
        "facility (SNF) services with dedicated inpatient rehabilitation programs. The care "
        "continuum spans short-term post-acute rehabilitation, long-term care, memory care "
        "(12 facilities), and specialized cardiac and pulmonary rehabilitation programs.", Body))

    svc = [
        [Paragraph(h, TH) for h in ["Service Line", "Facilities", "Revenue Mix", "Avg Daily Census"]],
        [Paragraph("Short-Term Rehab (SNF)", TCL), Paragraph("45", TC), Paragraph("58%", TC), Paragraph("685", TC)],
        [Paragraph("Long-Term Care", TCL), Paragraph("45", TC), Paragraph("27%", TC), Paragraph("412", TC)],
        [Paragraph("Memory Care (Dementia)", TCL), Paragraph("12", TC), Paragraph("9%", TC), Paragraph("138", TC)],
        [Paragraph("Specialized Cardiac/Pulm. Rehab", TCL), Paragraph("8", TC), Paragraph("6%", TC), Paragraph("92", TC)],
    ]
    s.append(tbl(svc, [2.6*inch, 1.0*inch, 1.2*inch, 1.9*inch]))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("ClinicalEdge Platform", SubTitle))
    s.append(Paragraph(
        "ClinicalEdge is PrimeHealth's proprietary clinical outcomes management and care coordination "
        "platform, developed internally from 2015 onwards. The platform integrates real-time patient "
        "acuity monitoring, AI-assisted care planning, electronic MDS documentation, and predictive "
        "readmission risk scoring across all 45 facilities on a unified technology stack.", Body))

    out = [
        [Paragraph(h, TH) for h in ["Outcome Metric", "PrimeHealth", "National Average", "Delta"]],
        [Paragraph("30-Day Readmission Rate", TCL), Paragraph("12.4%", TC), Paragraph("17.8%", TC), Paragraph("-30%", TC)],
        [Paragraph("Medicare 5-Star (% of portfolio)", TCL), Paragraph("82%", TC), Paragraph("21%", TC), Paragraph("+61 ppts", TC)],
        [Paragraph("Avg Length of Stay (Rehab)", TCL), Paragraph("24.1 days", TC), Paragraph("27.3 days", TC), Paragraph("-11.7%", TC)],
        [Paragraph("Patient Satisfaction (CAHPS)", TCL), Paragraph("4.4/5.0", TC), Paragraph("3.8/5.0", TC), Paragraph("+16%", TC)],
        [Paragraph("Staff Turnover (RN/LPN)", TCL), Paragraph("28%", TC), Paragraph("47%", TC), Paragraph("-40%", TC)],
        [Paragraph("MDS Documentation Accuracy", TCL), Paragraph("99.1%", TC), Paragraph("93.4%", TC), Paragraph("+5.7 ppts", TC)],
    ]
    s.append(tbl(out, [2.6*inch, 1.2*inch, 1.4*inch, 1.5*inch]))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("Technology Differentiators", SubTitle))
    for item in [
        "Predictive readmission risk scoring flags high-risk patients 72 hours pre-discharge, enabling care team intervention that reduces acute care transfers.",
        "Automated MDS capture reduces clinical documentation time by 35%, freeing nursing staff for direct patient care.",
        "Payor contract optimization module tracks per-diem reimbursement rates and models contract renegotiation scenarios.",
        "Referral relationship CRM tracks hospital discharge planner relationships, informing business development resource allocation.",
        "Proprietary staffing optimization tool reduces agency staff utilization by 22% versus pre-platform baseline.",
    ]:
        s.append(Paragraph(f"  - {item}", Bullet))

    s.append(PageBreak())
    return s


def market_overview():
    s = []
    s.append(Paragraph("SECTION 5: MARKET OVERVIEW", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    s.append(Paragraph("Post-Acute Care Market Dynamics", SubTitle))
    s.append(Paragraph(
        "The U.S. post-acute care market represented approximately $220 billion in total spending in "
        "2024 and is projected to grow at a 6.2% CAGR through 2030, reaching an estimated $315 billion. "
        "Growth is driven by structural demographic tailwinds: 10,000 Baby Boomers reach age 65 every "
        "day, and the 65+ cohort is expected to represent 21% of total U.S. population by 2030.", Body))

    mkt = [
        [Paragraph(h, TH) for h in ["Segment", "2024 Market", "2030E Market", "CAGR"]],
        [Paragraph("Skilled Nursing Facilities", TCL), Paragraph("$102B", TC), Paragraph("$145B", TC), Paragraph("6.0%", TC)],
        [Paragraph("Inpatient Rehab Facilities", TCL), Paragraph("$34B", TC), Paragraph("$51B", TC), Paragraph("7.0%", TC)],
        [Paragraph("Long-Term Acute Care", TCL), Paragraph("$16B", TC), Paragraph("$22B", TC), Paragraph("5.4%", TC)],
        [Paragraph("Home Health & Hospice", TCL), Paragraph("$68B", TC), Paragraph("$97B", TC), Paragraph("6.1%", TC)],
        [Paragraph("Total Post-Acute", Bold), Paragraph("$220B", BoldC), Paragraph("$315B", BoldC), Paragraph("6.2%", BoldC)],
    ]
    s.append(tbl(mkt, [2.5*inch, 1.3*inch, 1.4*inch, 1.5*inch]))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("Market Fragmentation", SubTitle))
    s.append(Paragraph(
        "The skilled nursing and post-acute care market remains highly fragmented. The top 10 operators "
        "collectively control only approximately 18% of total industry capacity, with the remainder held "
        "by regional operators and independent single-facility owners. This fragmentation creates an "
        "attractive roll-up opportunity for well-capitalized platforms with proven integration capabilities.", Body))

    frag = [
        [Paragraph(h, TH) for h in ["Operator", "Approx. Facilities", "Approx. Revenue", "Publicly Traded"]],
        [Paragraph("Kindred Healthcare", TCL), Paragraph("~2,600", TC), Paragraph("~$4.0B", TC), Paragraph("No (PE-owned)", TC)],
        [Paragraph("Ensign Group", TCL), Paragraph("~300", TC), Paragraph("~$4.1B", TC), Paragraph("Yes (ENSG)", TC)],
        [Paragraph("National HealthCare Corp", TCL), Paragraph("~75", TC), Paragraph("~$1.2B", TC), Paragraph("Yes (NHC)", TC)],
        [Paragraph("PrimeHealth Partners", TCL), Paragraph("45", TC), Paragraph("$185M", TC), Paragraph("No (target)", TC)],
        [Paragraph("Average Regional Operator", TCL), Paragraph("8-25", TC), Paragraph("$25-80M", TC), Paragraph("No", TC)],
    ]
    s.append(tbl(frag, [2.3*inch, 1.3*inch, 1.4*inch, 1.7*inch]))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("Regulatory Environment", SubTitle))
    for item in [
        "CMS Annual Reimbursement Updates: The Patient Driven Payment Model (PDPM) governs Medicare SNF reimbursement. CMS finalized a net 4.0% rate increase for FY2025. PrimeHealth projects net reimbursement growth of 2.5-3.5% annually over the projection period.",
        "Value-Based Purchasing (VBP): CMS adjusts Medicare reimbursement by up to +/-2% based on readmission performance. PrimeHealth consistently earns the maximum positive adjustment (~$3.2M incremental annual revenue).",
        "Certificate of Need (CON): Eight of PrimeHealth's nine operating states maintain CON requirements, creating meaningful barriers to new competitive entry.",
        "Staffing Mandates: CMS requires 3.48 hours of nurse staffing per resident per day. PrimeHealth averages 4.1 hours, providing competitive advantage and insulating from compliance costs.",
    ]:
        s.append(Paragraph(f"  - {item}", Bullet))

    s.append(PageBreak())
    return s


def financial_performance():
    s = []
    s.append(Paragraph("SECTION 6: FINANCIAL PERFORMANCE", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    s.append(Paragraph("Historical Financial Summary", SubTitle))
    hist = [
        [Paragraph(h, TH) for h in ["Income Statement ($M)", "FY2022", "FY2023", "FY2024", "CAGR"]],
        [Paragraph("Net Revenue", TCL), Paragraph("$133.0", TC), Paragraph("$156.8", TC), Paragraph("$185.0", TC), Paragraph("17.9%", TC)],
        [Paragraph("  YoY Growth", TCL), Paragraph("—", TC), Paragraph("17.9%", TC), Paragraph("18.0%", TC), Paragraph("", TC)],
        [Paragraph("Cost of Services", TCL), Paragraph("$82.5", TC), Paragraph("$97.2", TC), Paragraph("$114.7", TC), Paragraph("", TC)],
        [Paragraph("Gross Profit", TCL), Paragraph("$50.5", TC), Paragraph("$59.6", TC), Paragraph("$70.3", TC), Paragraph("18.0%", TC)],
        [Paragraph("Gross Margin", TCL), Paragraph("38.0%", TC), Paragraph("38.0%", TC), Paragraph("38.0%", TC), Paragraph("", TC)],
        [Paragraph("SG&A", TCL), Paragraph("$22.3", TC), Paragraph("$26.6", TC), Paragraph("$29.6", TC), Paragraph("", TC)],
        [Paragraph("Other Operating Costs", TCL), Paragraph("$9.6", TC), Paragraph("$10.4", TC), Paragraph("$12.7", TC), Paragraph("", TC)],
        [Paragraph("EBITDA", Bold), Paragraph("$18.6", BoldC), Paragraph("$22.6", BoldC), Paragraph("$28.0", BoldC), Paragraph("22.7%", BoldC)],
        [Paragraph("EBITDA Margin", TCL), Paragraph("14.0%", TC), Paragraph("14.4%", TC), Paragraph("15.1%", TC), Paragraph("", TC)],
        [Paragraph("D&A", TCL), Paragraph("$5.2", TC), Paragraph("$6.1", TC), Paragraph("$7.2", TC), Paragraph("", TC)],
        [Paragraph("EBIT", TCL), Paragraph("$13.4", TC), Paragraph("$16.5", TC), Paragraph("$20.8", TC), Paragraph("", TC)],
        [Paragraph("Capital Expenditure", TCL), Paragraph("$4.8", TC), Paragraph("$5.6", TC), Paragraph("$6.7", TC), Paragraph("", TC)],
        [Paragraph("Free Cash Flow", TCL), Paragraph("$8.6", TC), Paragraph("$10.9", TC), Paragraph("$14.1", TC), Paragraph("25.9%", TC)],
    ]
    ht = Table(hist, colWidths=[2.3*inch, 1.1*inch, 1.1*inch, 1.1*inch, 0.8*inch])
    ht.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 9),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("ALIGN", (0,1), (0,-1), "LEFT"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("ROWBACKGROUND", (0,1), (-1,-1), [WHITE, ALT_ROW]),
        ("GRID", (0,0), (-1,-1), 0.4, MID_GRAY),
        ("LINEBELOW", (0,0), (-1,0), 1.5, GOLD),
        ("LINEABOVE", (0,8), (-1,8), 1, GOLD),
        ("LINEBELOW", (0,8), (-1,8), 1, GOLD),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ]))
    s.append(ht)
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("Revenue Bridge: FY2022 to FY2024", SubTitle))
    bridge = [
        [Paragraph(h, TH) for h in ["Driver", "Contribution ($M)", "Notes"]],
        [Paragraph("FY2022 Base Revenue", TCL), Paragraph("$133.0", TC), Paragraph("Starting point", TCL)],
        [Paragraph("Organic Volume Growth", TCL), Paragraph("+$22.5", TC), Paragraph("Increased census per existing facility", TCL)],
        [Paragraph("Rate / Reimbursement Increases", TCL), Paragraph("+$11.8", TC), Paragraph("PDPM annual updates + VBP bonus", TCL)],
        [Paragraph("New Facility Organic Ramp", TCL), Paragraph("+$7.2", TC), Paragraph("10 de novo and acquired facilities", TCL)],
        [Paragraph("Service Mix Shift", TCL), Paragraph("+$3.1", TC), Paragraph("Higher-acuity rehab cases; payor optimization", TCL)],
        [Paragraph("Other", TCL), Paragraph("+$7.4", TC), Paragraph("Medicaid rate increases, managed care renegotiations", TCL)],
        [Paragraph("FY2024 Revenue", Bold), Paragraph("$185.0", BoldC), Paragraph("", TCL)],
    ]
    s.append(tbl(bridge, [2.3*inch, 1.5*inch, 2.9*inch]))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("Payor Mix Analysis", SubTitle))
    payor = [
        [Paragraph(h, TH) for h in ["Payor", "Rev Mix", "Avg Per Diem", "% Patient Days", "Growth Outlook"]],
        [Paragraph("Medicare (Traditional)", TCL), Paragraph("55%", TC), Paragraph("$610/day", TC), Paragraph("51%", TC), Paragraph("+3-4% annual", TC)],
        [Paragraph("Medicare Advantage", TCL), Paragraph("7%", TC), Paragraph("$540/day", TC), Paragraph("7%", TC), Paragraph("+8-10% annual", TC)],
        [Paragraph("Medicaid", TCL), Paragraph("28%", TC), Paragraph("$240/day", TC), Paragraph("34%", TC), Paragraph("+1-2% annual", TC)],
        [Paragraph("Commercial / Other", TCL), Paragraph("10%", TC), Paragraph("$420/day", TC), Paragraph("8%", TC), Paragraph("Stable", TC)],
        [Paragraph("Total", Bold), Paragraph("100%", BoldC), Paragraph("$435/day blended", BoldC), Paragraph("100%", BoldC), Paragraph("", TC)],
    ]
    s.append(tbl(payor, [1.7*inch, 0.9*inch, 1.2*inch, 1.3*inch, 1.6*inch]))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("EBITDA Margin Bridge: 15.1% to 20%+ Target", SubTitle))
    s.append(Paragraph(
        "Management has identified a clear pathway to expanding EBITDA margins from 15.1% (FY2024) "
        "to 20%+ (FY2027E) through the following operational improvement initiatives:", Body))
    marg = [
        [Paragraph(h, TH) for h in ["Margin Improvement Lever", "Basis Points", "Timeline"]],
        [Paragraph("Staffing Optimization (agency reduction)", TCL), Paragraph("+120 bps", TC), Paragraph("12-18 months", TC)],
        [Paragraph("Procurement / GPO Consolidation", TCL), Paragraph("+80 bps", TC), Paragraph("6-12 months", TC)],
        [Paragraph("Revenue Cycle Management Improvement", TCL), Paragraph("+60 bps", TC), Paragraph("12-24 months", TC)],
        [Paragraph("Payor Contract Renegotiation", TCL), Paragraph("+70 bps", TC), Paragraph("18-36 months", TC)],
        [Paragraph("Corporate Overhead Leverage (scale)", TCL), Paragraph("+90 bps", TC), Paragraph("24-36 months", TC)],
        [Paragraph("Acquired Facility Integration", TCL), Paragraph("+80 bps", TC), Paragraph("Ongoing", TC)],
        [Paragraph("Total Margin Expansion", Bold), Paragraph("+500 bps", BoldC), Paragraph("FY2024-FY2027E", BoldC)],
    ]
    s.append(tbl(marg, [3.2*inch, 1.4*inch, 2.1*inch]))
    s.append(PageBreak())
    return s


def growth_strategy():
    s = []
    s.append(Paragraph("SECTION 7: GROWTH STRATEGY", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    s.append(Paragraph("Organic Growth Initiatives", SubTitle))
    for item in [
        "Census Optimization: Dedicated business development teams maintain active relationships with hospital discharge planners, orthopedic surgeons, and cardiologists. Current portfolio occupancy of 75% offers meaningful upside toward the industry-leading benchmark of 85%+.",
        "Acuity Mix Shift: ClinicalEdge enables targeted marketing for higher-reimbursed complex medical patients (ventilator-dependent, wound care, IV therapy), which carry 40-60% higher Medicare per-diem rates.",
        "De Novo Expansion: Three greenfield development sites identified across Tennessee and Kentucky, adding approximately 360 licensed beds at ~$12M each.",
        "Medicare Advantage Optimization: Negotiating preferred provider agreements with regional MA plans, targeting value-based arrangements with quality bonuses as MA penetration grows.",
    ]:
        s.append(Paragraph(f"  - {item}", Bullet))

    s.append(Paragraph("M&A Roll-Up Pipeline", SubTitle))
    s.append(Paragraph(
        "PrimeHealth's management team has developed a robust acquisition pipeline of 8 identified "
        "targets representing approximately $45 million in combined revenue. Targets are screened "
        "against the Company's market cluster strategy, with priority given to facilities that "
        "enhance referral network density in existing markets.", Body))

    pipe = [
        [Paragraph(h, TH) for h in ["Target", "State", "Facilities", "Est. Revenue", "Stage", "Expected Close"]],
        [Paragraph("Bluegrass Care Group", TCL), Paragraph("KY", TC), Paragraph("3", TC), Paragraph("$12M", TC), Paragraph("LOI Signed", TC), Paragraph("Q3 2025E", TC)],
        [Paragraph("Ohio Valley SNF Portfolio", TCL), Paragraph("OH", TC), Paragraph("2", TC), Paragraph("$8M", TC), Paragraph("Diligence", TC), Paragraph("Q4 2025E", TC)],
        [Paragraph("Carolina Post-Acute", TCL), Paragraph("NC", TC), Paragraph("1", TC), Paragraph("$5M", TC), Paragraph("Diligence", TC), Paragraph("Q4 2025E", TC)],
        [Paragraph("Virginia Regional SNF", TCL), Paragraph("VA", TC), Paragraph("2", TC), Paragraph("$9M", TC), Paragraph("Initial Contact", TC), Paragraph("Q1 2026E", TC)],
        [Paragraph("Tennessee Independent", TCL), Paragraph("TN", TC), Paragraph("1", TC), Paragraph("$4M", TC), Paragraph("Initial Contact", TC), Paragraph("Q2 2026E", TC)],
        [Paragraph("Indiana Cluster Add-On", TCL), Paragraph("IN", TC), Paragraph("2", TC), Paragraph("$7M", TC), Paragraph("Identified", TC), Paragraph("2026E", TC)],
        [Paragraph("Total Pipeline", Bold), Paragraph("", TC), Paragraph("11", BoldC), Paragraph("$45M", BoldC), Paragraph("", TC), Paragraph("", TC)],
    ]
    s.append(tbl(pipe, [2.0*inch, 0.5*inch, 0.8*inch, 0.9*inch, 1.1*inch, 1.4*inch]))
    s.append(PageBreak())
    return s


def management_team():
    s = []
    s.append(Paragraph("SECTION 8: MANAGEMENT TEAM", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    execs = [
        ("Dr. Margaret Collins", "Chief Executive Officer",
         "Dr. Collins co-founded PrimeHealth in 2011 following a 20-year career in healthcare operations. "
         "She previously served as Division President at HCA Healthcare, overseeing 28 facilities and "
         "8,500 employees across the Southeast. Under her leadership, PrimeHealth has grown from a single "
         "facility to a $185M revenue platform while maintaining best-in-class clinical outcomes. "
         "Dr. Collins holds an MD from Vanderbilt University School of Medicine and an MBA from Harvard Business School."),
        ("Robert Haines", "Chief Financial Officer",
         "Mr. Haines co-founded PrimeHealth and brings 18 years of healthcare financial leadership. "
         "Prior to PrimeHealth, he served as VP of Finance at Kindred Healthcare. He is a Certified "
         "Public Accountant (CPA) and CFA charterholder. Mr. Haines has led three capital raises and "
         "14 M&A transactions totaling over $180M in aggregate value."),
        ("Lisa Nguyen", "Chief Operating Officer",
         "Ms. Nguyen joined PrimeHealth in 2019, having previously scaled a regional SNF operator from "
         "12 to 28 facilities over 4 years at LifeCare Holdings. She architected PrimeHealth's regional "
         "cluster strategy and integration playbook, and has personally led 9 of the Company's 14 "
         "completed acquisitions."),
        ("Dr. David Park", "Chief Medical Officer",
         "A board-certified geriatrician with fellowship training at Johns Hopkins, Dr. Park is the "
         "primary architect of the ClinicalEdge platform's outcomes protocols. He previously served as "
         "Medical Director of Post-Acute Services at Vanderbilt University Medical Center and has "
         "published 12 peer-reviewed articles on SNF readmission reduction."),
    ]

    for name, title, bio in execs:
        md = [
            [Paragraph(name, S("MN", fontSize=11, fontName="Helvetica-Bold", textColor=NAVY)),
             Paragraph(bio, Body)],
            [Paragraph(title, S("MT", fontSize=9, textColor=GOLD)), ""],
        ]
        mt = Table(md, colWidths=[1.8*inch, 4.9*inch])
        mt.setStyle(TableStyle([
            ("SPAN", (1,0), (1,1)),
            ("BACKGROUND", (0,0), (0,-1), ALT_ROW),
            ("LINERIGHT", (0,0), (0,-1), 2, GOLD),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("LEFTPADDING", (0,0), (-1,-1), 8),
            ("RIGHTPADDING", (0,0), (-1,-1), 8),
            ("BOX", (0,0), (-1,-1), 0.5, MID_GRAY),
        ]))
        s.append(mt)
        s.append(Spacer(1, 0.1*inch))

    s.append(PageBreak())
    return s


def transaction_overview():
    s = []
    s.append(Paragraph("SECTION 9: TRANSACTION OVERVIEW", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    s.append(Paragraph("Deal Structure", SubTitle))
    deal = [
        [Paragraph("Parameter", TH), Paragraph("Detail", TH)],
        [Paragraph("Transaction Type", TCL), Paragraph("Platform Buyout — Control Interest (100% of outstanding equity)", TCL)],
        [Paragraph("Enterprise Value", TCL), Paragraph("~$225 Million", TCL)],
        [Paragraph("EV / FY2024 Revenue", TCL), Paragraph("1.2x ($185M)", TCL)],
        [Paragraph("EV / FY2024 EBITDA", TCL), Paragraph("8.0x ($28M)", TCL)],
        [Paragraph("Equity Contribution (est.)", TCL), Paragraph("~$90M - $100M (40-45% of TEV)", TCL)],
        [Paragraph("Senior Secured Debt (est.)", TCL), Paragraph("~$115M - $125M (4.0-4.5x EBITDA)", TCL)],
        [Paragraph("Management Rollover", TCL), Paragraph("~10-15% of equity; management retains significant ownership", TCL)],
        [Paragraph("Financial Advisor", TCL), Paragraph("Evercore Healthcare Advisory Group", TCL)],
        [Paragraph("Legal Counsel (Seller)", TCL), Paragraph("Ropes & Gray LLP", TCL)],
    ]
    s.append(tbl(deal, [2.2*inch, 4.5*inch]))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("Projected Returns Analysis", SubTitle))
    ret = [
        [Paragraph(h, TH) for h in ["Scenario", "Exit Year", "Exit Multiple", "Exit EV", "Equity Value", "MoM", "IRR"]],
        [Paragraph("Base Case", TCL), Paragraph("FY2027E", TC), Paragraph("10x EBITDA", TC), Paragraph("$610M", TC), Paragraph("~$350M", TC), Paragraph("3.5-4.0x", TC), Paragraph("38-42%", TC)],
        [Paragraph("Bull Case", TCL), Paragraph("FY2027E", TC), Paragraph("12x EBITDA", TC), Paragraph("$732M", TC), Paragraph("~$470M", TC), Paragraph("4.7-5.2x", TC), Paragraph("48-52%", TC)],
        [Paragraph("Bear Case", TCL), Paragraph("FY2027E", TC), Paragraph("8x EBITDA", TC), Paragraph("$400M", TC), Paragraph("~$180M", TC), Paragraph("1.8-2.0x", TC), Paragraph("22-25%", TC)],
    ]
    s.append(tbl(ret, [1.0*inch, 0.8*inch, 1.1*inch, 0.9*inch, 1.0*inch, 0.7*inch, 0.7*inch]))
    s.append(Paragraph(
        "Note: Returns based on ~$90M equity contribution. Illustrative only; actual returns depend on "
        "financing terms, business performance, and market conditions at exit.", Footnote))
    s.append(Spacer(1, 0.12*inch))

    s.append(Paragraph("Process Timeline", SubTitle))
    tl = [
        [Paragraph("Milestone", TH), Paragraph("Target Date", TH)],
        [Paragraph("Process Launch / CIM Distribution", TCL), Paragraph("April 2026", TC)],
        [Paragraph("Management Presentations", TCL), Paragraph("May 2026", TC)],
        [Paragraph("First Round Bids Due", TCL), Paragraph("May 30, 2026", TC)],
        [Paragraph("Second Round / VDR Access", TCL), Paragraph("June 2026", TC)],
        [Paragraph("Final Bids Due", TCL), Paragraph("July 15, 2026", TC)],
        [Paragraph("Exclusivity / Definitive Agreement", TCL), Paragraph("August 2026", TC)],
        [Paragraph("Expected Close", TCL), Paragraph("Q4 2026", TC)],
    ]
    s.append(tbl(tl, [4.0*inch, 2.7*inch]))
    s.append(PageBreak())
    return s


def appendix():
    s = []
    s.append(Paragraph("APPENDIX: FACILITY LIST & KEY METRICS", SecTitle))
    s.append(HRFlowable(width=CONTENT_W, thickness=2, color=GOLD, spaceAfter=12))

    s.append(Paragraph("Representative Facility Roster (Selected)", SubTitle))
    fac = [
        [Paragraph(h, TH) for h in ["Facility Name", "City", "State", "Beds", "Opened/Acq.", "CMS Stars"]],
        [Paragraph("PrimeHealth Brentwood SNF", TCL), Paragraph("Brentwood", TC), Paragraph("TN", TC), Paragraph("120", TC), Paragraph("2011 (founded)", TC), Paragraph("5", TC)],
        [Paragraph("PrimeHealth Nashville Rehab", TCL), Paragraph("Nashville", TC), Paragraph("TN", TC), Paragraph("100", TC), Paragraph("2013", TC), Paragraph("5", TC)],
        [Paragraph("PrimeHealth Knoxville SNF", TCL), Paragraph("Knoxville", TC), Paragraph("TN", TC), Paragraph("120", TC), Paragraph("2014", TC), Paragraph("4", TC)],
        [Paragraph("PrimeHealth Lexington Care", TCL), Paragraph("Lexington", TC), Paragraph("KY", TC), Paragraph("140", TC), Paragraph("2015", TC), Paragraph("5", TC)],
        [Paragraph("PrimeHealth Louisville Rehab", TCL), Paragraph("Louisville", TC), Paragraph("KY", TC), Paragraph("100", TC), Paragraph("2016", TC), Paragraph("4", TC)],
        [Paragraph("PrimeHealth Atlanta North SNF", TCL), Paragraph("Roswell", TC), Paragraph("GA", TC), Paragraph("120", TC), Paragraph("2017", TC), Paragraph("4", TC)],
        [Paragraph("PrimeHealth Birmingham SNF", TCL), Paragraph("Hoover", TC), Paragraph("AL", TC), Paragraph("120", TC), Paragraph("2018 (acq.)", TC), Paragraph("4", TC)],
        [Paragraph("PrimeHealth Columbus SNF", TCL), Paragraph("Columbus", TC), Paragraph("OH", TC), Paragraph("120", TC), Paragraph("2021", TC), Paragraph("4", TC)],
        [Paragraph("PrimeHealth Indianapolis Rehab", TCL), Paragraph("Carmel", TC), Paragraph("IN", TC), Paragraph("100", TC), Paragraph("2021", TC), Paragraph("5", TC)],
        [Paragraph("PrimeHealth Charlotte SNF", TCL), Paragraph("Ballantyne", TC), Paragraph("NC", TC), Paragraph("120", TC), Paragraph("2022", TC), Paragraph("5", TC)],
        [Paragraph("PrimeHealth Richmond Care", TCL), Paragraph("Richmond", TC), Paragraph("VA", TC), Paragraph("120", TC), Paragraph("2024 (acq.)", TC), Paragraph("4", TC)],
    ]
    s.append(tbl(fac, [2.3*inch, 1.0*inch, 0.45*inch, 0.5*inch, 1.3*inch, 0.7*inch]))
    s.append(Paragraph("Note: 45 total facilities across 8 states; 5,380 total licensed beds.", Footnote))
    s.append(Spacer(1, 0.15*inch))

    s.append(Paragraph("Key Operating Metrics — FY2024 vs. Industry Benchmark", SubTitle))
    kpi = [
        [Paragraph(h, TH) for h in ["KPI", "PrimeHealth", "Industry Avg", "Delta"]],
        [Paragraph("Average Occupancy Rate", TCL), Paragraph("75.2%", TC), Paragraph("70.8%", TC), Paragraph("+4.4 ppts", TC)],
        [Paragraph("Medicare Per Diem Rate", TCL), Paragraph("$610/day", TC), Paragraph("$570/day", TC), Paragraph("+7%", TC)],
        [Paragraph("30-Day Readmission Rate", TCL), Paragraph("12.4%", TC), Paragraph("17.8%", TC), Paragraph("-30%", TC)],
        [Paragraph("Staff Turnover (RN/LPN)", TCL), Paragraph("28%", TC), Paragraph("47%", TC), Paragraph("-40%", TC)],
        [Paragraph("CMS 5-Star (% of portfolio)", TCL), Paragraph("82%", TC), Paragraph("21%", TC), Paragraph("+61 ppts", TC)],
        [Paragraph("Revenue per Employee", TCL), Paragraph("$77,100", TC), Paragraph("$68,500", TC), Paragraph("+$8,600", TC)],
        [Paragraph("EBITDAR per Licensed Bed", TCL), Paragraph("$6,700", TC), Paragraph("$5,200", TC), Paragraph("+$1,500", TC)],
        [Paragraph("Capex as % of Revenue", TCL), Paragraph("3.6%", TC), Paragraph("4.2%", TC), Paragraph("-0.6 ppts", TC)],
    ]
    s.append(tbl(kpi, [2.7*inch, 1.2*inch, 1.2*inch, 1.6*inch]))
    s.append(Spacer(1, 0.15*inch))

    s.append(Paragraph("Financial Projections Summary (FY2025E - FY2027E)", SubTitle))
    proj = [
        [Paragraph(h, TH) for h in ["Metric", "FY2025E", "FY2026E", "FY2027E", "25E-27E CAGR"]],
        [Paragraph("Revenue ($M)", TCL), Paragraph("$218", TC), Paragraph("$261", TC), Paragraph("$304", TC), Paragraph("18.1%", TC)],
        [Paragraph("  YoY Growth", TCL), Paragraph("17.8%", TC), Paragraph("19.7%", TC), Paragraph("16.5%", TC), Paragraph("", TC)],
        [Paragraph("Gross Profit ($M)", TCL), Paragraph("$87", TC), Paragraph("$107", TC), Paragraph("$131", TC), Paragraph("", TC)],
        [Paragraph("Gross Margin", TCL), Paragraph("39.9%", TC), Paragraph("41.0%", TC), Paragraph("43.1%", TC), Paragraph("", TC)],
        [Paragraph("EBITDA ($M)", Bold), Paragraph("$35", BoldC), Paragraph("$47", BoldC), Paragraph("$61", BoldC), Paragraph("32.0%", BoldC)],
        [Paragraph("EBITDA Margin", TCL), Paragraph("16.1%", TC), Paragraph("18.0%", TC), Paragraph("20.1%", TC), Paragraph("", TC)],
        [Paragraph("Facilities (end of period)", TCL), Paragraph("52", TC), Paragraph("62", TC), Paragraph("72", TC), Paragraph("", TC)],
        [Paragraph("Patient Days (000s)", TCL), Paragraph("1,710", TC), Paragraph("1,980", TC), Paragraph("2,240", TC), Paragraph("", TC)],
    ]
    s.append(tbl(proj, [2.1*inch, 1.0*inch, 1.0*inch, 1.0*inch, 1.6*inch]))
    s.append(Spacer(1, 0.2*inch))
    s.append(HRFlowable(width=CONTENT_W, thickness=1, color=MID_GRAY, spaceAfter=8))
    s.append(Paragraph(
        "IMPORTANT DISCLAIMER: This Confidential Information Memorandum has been prepared by Evercore "
        "Healthcare Advisory Group on behalf of PrimeHealth Partners. The information herein is based "
        "upon information supplied by the Company and sources believed to be reliable. Neither the "
        "Company nor the Advisor makes any representation or warranty as to the accuracy or completeness "
        "of this document. Projections are illustrative and subject to inherent uncertainty. Recipients "
        "should conduct their own independent due diligence. This document does not constitute an offer "
        "to sell or solicitation of an offer to buy any securities.",
        S("Disc", fontSize=7, leading=9.5, textColor=DARK_GRAY, alignment=TA_JUSTIFY)))
    return s


def build_cim():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 0.3*inch,
        bottomMargin=MARGIN,
        title="PrimeHealth Partners — Confidential Information Memorandum",
        author="Evercore Healthcare Advisory Group",
        subject="Project Pinnacle — CIM",
    )

    story = []
    story.extend(cover())
    story.extend(toc())
    story.extend(exec_summary())
    story.extend(investment_highlights())
    story.extend(company_overview())
    story.extend(clinical_platform())
    story.extend(market_overview())
    story.extend(financial_performance())
    story.extend(growth_strategy())
    story.extend(management_team())
    story.extend(transaction_overview())
    story.extend(appendix())

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Done: {OUTPUT}")


if __name__ == "__main__":
    build_cim()
