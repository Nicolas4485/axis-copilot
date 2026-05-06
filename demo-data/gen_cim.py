#!/usr/bin/env python3
"""
Generate CIM PDF for Vertex Specialty Chemicals
Uses reportlab.platypus for professional PE-quality document
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
import os

# Color palette
NAVY = HexColor('#0D2137')
GOLD = HexColor('#C8A84B')
LIGHT_GOLD = HexColor('#E8D49A')
WHITE = colors.white
LIGHT_GRAY = HexColor('#F5F5F5')
MID_GRAY = HexColor('#CCCCCC')
DARK_GRAY = HexColor('#444444')
TEXT_BLACK = HexColor('#1A1A1A')
ALT_ROW = HexColor('#EEF2F6')

OUTPUT_PATH = '/sessions/gracious-affectionate-dirac/mnt/axis-copilot/demo-data/cim-vertex-chemicals.pdf'

# ─── Page header/footer canvas ───────────────────────────────────────────────

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for i, state in enumerate(self._saved_page_states):
            self.__dict__.update(state)
            self.draw_page_decorations(i + 1, num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_num, total_pages):
        w, h = letter
        if page_num > 1:
            # Header bar
            self.setFillColor(NAVY)
            self.rect(0, h - 0.55*inch, w, 0.55*inch, fill=1, stroke=0)
            self.setFillColor(GOLD)
            self.rect(0, h - 0.58*inch, w, 0.03*inch, fill=1, stroke=0)
            self.setFillColor(WHITE)
            self.setFont('Helvetica-Bold', 9)
            self.drawString(0.5*inch, h - 0.38*inch, 'VERTEX SPECIALTY CHEMICALS')
            self.setFont('Helvetica', 8)
            self.drawRightString(w - 0.5*inch, h - 0.38*inch, 'CONFIDENTIAL — PROJECT APEX')
            # Footer
            self.setFillColor(NAVY)
            self.rect(0, 0, w, 0.45*inch, fill=1, stroke=0)
            self.setFillColor(GOLD)
            self.rect(0, 0.45*inch, w, 0.02*inch, fill=1, stroke=0)
            self.setFillColor(WHITE)
            self.setFont('Helvetica', 7.5)
            self.drawString(0.5*inch, 0.17*inch,
                'This document contains confidential information. Do not distribute without written consent.')
            self.drawRightString(w - 0.5*inch, 0.17*inch, f'Page {page_num} of {total_pages}')


# ─── Styles ───────────────────────────────────────────────────────────────────

def make_styles():
    styles = {
        'section_title': ParagraphStyle(
            'section_title', fontName='Helvetica-Bold', fontSize=16,
            textColor=NAVY, spaceBefore=14, spaceAfter=6, leading=20
        ),
        'section_title_white': ParagraphStyle(
            'section_title_white', fontName='Helvetica-Bold', fontSize=14,
            textColor=WHITE, spaceBefore=4, spaceAfter=4, leading=18
        ),
        'sub_heading': ParagraphStyle(
            'sub_heading', fontName='Helvetica-Bold', fontSize=12,
            textColor=NAVY, spaceBefore=10, spaceAfter=4
        ),
        'sub_heading_gold': ParagraphStyle(
            'sub_heading_gold', fontName='Helvetica-Bold', fontSize=11,
            textColor=GOLD, spaceBefore=8, spaceAfter=3
        ),
        'body': ParagraphStyle(
            'body', fontName='Helvetica', fontSize=9.5,
            textColor=TEXT_BLACK, spaceBefore=3, spaceAfter=4,
            leading=14, alignment=TA_JUSTIFY
        ),
        'body_small': ParagraphStyle(
            'body_small', fontName='Helvetica', fontSize=8.5,
            textColor=DARK_GRAY, spaceBefore=2, spaceAfter=3,
            leading=12, alignment=TA_JUSTIFY
        ),
        'bullet': ParagraphStyle(
            'bullet', fontName='Helvetica', fontSize=9.5,
            textColor=TEXT_BLACK, spaceBefore=2, spaceAfter=2,
            leading=13, leftIndent=14
        ),
        'metric_label': ParagraphStyle(
            'metric_label', fontName='Helvetica', fontSize=8,
            textColor=DARK_GRAY, alignment=TA_CENTER
        ),
        'metric_value': ParagraphStyle(
            'metric_value', fontName='Helvetica-Bold', fontSize=18,
            textColor=NAVY, alignment=TA_CENTER
        ),
        'toc_entry': ParagraphStyle(
            'toc_entry', fontName='Helvetica', fontSize=10,
            textColor=TEXT_BLACK, spaceBefore=3, spaceAfter=3, leading=14
        ),
        'disclaimer': ParagraphStyle(
            'disclaimer', fontName='Helvetica', fontSize=7.5,
            textColor=DARK_GRAY, leading=10, alignment=TA_JUSTIFY
        ),
        'table_header': ParagraphStyle(
            'table_header', fontName='Helvetica-Bold', fontSize=8.5,
            textColor=WHITE, alignment=TA_CENTER
        ),
        'table_cell': ParagraphStyle(
            'table_cell', fontName='Helvetica', fontSize=8.5,
            textColor=TEXT_BLACK, alignment=TA_LEFT
        ),
        'table_cell_center': ParagraphStyle(
            'table_cell_center', fontName='Helvetica', fontSize=8.5,
            textColor=TEXT_BLACK, alignment=TA_CENTER
        ),
        'table_cell_bold': ParagraphStyle(
            'table_cell_bold', fontName='Helvetica-Bold', fontSize=8.5,
            textColor=NAVY, alignment=TA_LEFT
        ),
    }
    return styles

S = make_styles()

# ─── Helper flowables ──────────────────────────────────────────────────────────

def section_divider(title, w=7.5*inch):
    return KeepTogether([
        Paragraph(title, S['section_title']),
        HRFlowable(width=w, thickness=2, color=GOLD, spaceAfter=8),
    ])

def navy_section_banner(title, w=7.5*inch):
    data = [[Paragraph(title, S['section_title_white'])]]
    t = Table(data, colWidths=[w])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    return t

def kpi_table(metrics):
    n = len(metrics)
    col_w = 7.5*inch / n
    data = [
        [Paragraph(v, S['metric_value']) for _, v in metrics],
        [Paragraph(l, S['metric_label']) for l, _ in metrics],
    ]
    t = Table(data, colWidths=[col_w]*n, rowHeights=[32, 18])
    style = [
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (-1,0), LIGHT_GRAY),
        ('BACKGROUND', (0,1), (-1,1), ALT_ROW),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('BOX', (0,0), (-1,-1), 0.5, MID_GRAY),
        ('INNERGRID', (0,0), (-1,-1), 0.5, MID_GRAY),
    ]
    for i in range(n):
        style.append(('LINEABOVE', (i,0), (i,0), 2, GOLD))
    t.setStyle(TableStyle(style))
    return t

def bullet_list(items):
    result = []
    for item in items:
        result.append(Paragraph(
            '<bullet bulletIndent="0" bulletFontName="Helvetica-Bold" '
            'bulletColor="#C8A84B">&#8226;</bullet> ' + item,
            S['bullet']
        ))
    return result

def base_table_style(has_total_row=False):
    style = [
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('ALIGN', (0,0), (0,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, ALT_ROW]),
        ('LINEBELOW', (0,0), (-1,-1), 0.3, MID_GRAY),
        ('BOX', (0,0), (-1,-1), 0.8, NAVY),
    ]
    if has_total_row:
        style += [
            ('BACKGROUND', (0,-1), (-1,-1), LIGHT_GOLD),
            ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0,-1), (-1,-1), NAVY),
        ]
    return style


# ─── Cover page ───────────────────────────────────────────────────────────────

def build_cover(story):
    conf_label = ParagraphStyle('cfl', fontName='Helvetica-Bold', fontSize=9,
                                textColor=NAVY, alignment=TA_CENTER)
    project_style = ParagraphStyle('ps', fontName='Helvetica-Bold', fontSize=11,
                                   textColor=GOLD, alignment=TA_CENTER, spaceAfter=18, leading=16)
    company_style = ParagraphStyle('cs', fontName='Helvetica-Bold', fontSize=28,
                                   textColor=WHITE, alignment=TA_CENTER, spaceAfter=8, leading=34)
    cim_style = ParagraphStyle('cims', fontName='Helvetica-Bold', fontSize=13,
                               textColor=LIGHT_GOLD, alignment=TA_CENTER, spaceAfter=6, leading=18)
    sub_style = ParagraphStyle('ss', fontName='Helvetica', fontSize=11,
                               textColor=WHITE, alignment=TA_CENTER, spaceAfter=6)
    detail_style = ParagraphStyle('ds', fontName='Helvetica', fontSize=9.5,
                                  textColor=HexColor('#A0B4C8'), alignment=TA_CENTER, spaceAfter=4)
    gold_val_style = ParagraphStyle('gvs', fontName='Helvetica-Bold', fontSize=11,
                                    textColor=GOLD, alignment=TA_CENTER)
    white_lbl_style = ParagraphStyle('wls', fontName='Helvetica', fontSize=8.5,
                                     textColor=WHITE, alignment=TA_CENTER)

    conf_banner = Table(
        [[Paragraph('STRICTLY CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY', conf_label)]],
        colWidths=[7.5*inch]
    )
    conf_banner.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))

    stats_data = [
        [Paragraph('Sector', white_lbl_style),
         Paragraph('Enterprise Value', white_lbl_style),
         Paragraph('Revenue (FY2024)', white_lbl_style),
         Paragraph('EBITDA Margin', white_lbl_style)],
        [Paragraph('Specialty Chemicals', gold_val_style),
         Paragraph('~$512M', gold_val_style),
         Paragraph('$320M', gold_val_style),
         Paragraph('20.0%', gold_val_style)],
    ]
    stats_t = Table(stats_data, colWidths=[7.5*inch/4]*4, rowHeights=[20, 30])
    stats_t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), HexColor('#162E47')),
        ('LINEBELOW', (0,0), (-1,0), 0.5, GOLD),
        ('BOX', (0,0), (-1,-1), 1, GOLD),
        ('INNERGRID', (0,0), (-1,-1), 0.3, HexColor('#2A4560')),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))

    cover_inner = [
        Spacer(1, 0.7*inch),
        Paragraph('PROJECT APEX', project_style),
        Paragraph('VERTEX SPECIALTY CHEMICALS', company_style),
        HRFlowable(width=4*inch, thickness=2, color=GOLD, hAlign='CENTER',
                   spaceAfter=18, spaceBefore=8),
        Paragraph('CONFIDENTIAL INFORMATION MEMORANDUM', cim_style),
        Spacer(1, 0.15*inch),
        Paragraph('Carve-out from GlobalChem Industries', sub_style),
        Spacer(1, 0.35*inch),
        stats_t,
        Spacer(1, 0.35*inch),
        Paragraph('Houston, TX  |  Founded: 1995  |  1,850 Employees', detail_style),
        Paragraph('3 Manufacturing Facilities  |  47 Proprietary Formulations  |  18 Patents', detail_style),
        Paragraph('April 2025', detail_style),
        Spacer(1, 0.45*inch),
        conf_banner,
    ]

    outer = Table([[cover_inner]], colWidths=[7.5*inch])
    outer.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(outer)
    story.append(PageBreak())


# ─── Table of Contents ────────────────────────────────────────────────────────

def build_toc(story):
    story.append(section_divider('TABLE OF CONTENTS'))
    story.append(Spacer(1, 0.1*inch))

    toc_entries = [
        ('Section 1', 'Executive Summary', '3'),
        ('Section 2', 'Investment Highlights', '5'),
        ('Section 3', 'Company Overview', '6'),
        ('Section 4', 'Products & Technology', '8'),
        ('Section 5', 'End Markets & Customers', '10'),
        ('Section 6', 'Market Overview', '12'),
        ('Section 7', 'Financial Performance', '14'),
        ('Section 8', 'Carve-out Transition Plan', '17'),
        ('Section 9', 'Management Team', '18'),
        ('Section 10', 'Transaction Overview', '19'),
        ('Appendix', 'Manufacturing Facilities & Patent Summary', '20'),
    ]
    pg_style = ParagraphStyle('tpg', fontName='Helvetica', fontSize=10,
                              textColor=NAVY, alignment=TA_RIGHT)
    num_style = ParagraphStyle('tnum', fontName='Helvetica-Bold', fontSize=10,
                               textColor=GOLD)
    for num, title, pg in toc_entries:
        row = [[
            Paragraph(num, num_style),
            Paragraph(title, S['toc_entry']),
            Paragraph(pg, pg_style),
        ]]
        t = Table(row, colWidths=[0.9*inch, 5.6*inch, 1.0*inch])
        t.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,-1), 0.3, MID_GRAY),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (0,0), 2),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(t)
    story.append(PageBreak())


# ─── Section 1: Executive Summary ────────────────────────────────────────────

def build_exec_summary(story):
    story.append(navy_section_banner('SECTION 1   |   EXECUTIVE SUMMARY'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Investment Opportunity', S['sub_heading']))
    story.append(Paragraph(
        'Vertex Specialty Chemicals ("Vertex" or the "Company") represents a compelling carve-out '
        'investment opportunity to acquire a high-quality specialty chemicals business with a '
        '30-year operating history, defensible intellectual property portfolio, and significant '
        'untapped value creation potential as a standalone enterprise. The Company is being divested '
        'by GlobalChem Industries ("GlobalChem"), a diversified chemical conglomerate that acquired '
        'Vertex in 2016 as a strategic bolt-on but has materially underinvested relative to the '
        "business's growth potential.",
        S['body']
    ))
    story.append(Paragraph(
        'Vertex manufactures advanced polymer additives, specialty coatings, and performance resins '
        'serving high-growth end markets including automotive lightweighting, aerospace composites, '
        'and advanced electronics manufacturing. With 47 proprietary formulations and 18 active '
        'patents, the Company occupies a highly differentiated position within its addressable '
        'market segments totaling approximately $89 billion globally.',
        S['body']
    ))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph('Key Financial Metrics — FY2024', S['sub_heading']))
    story.append(kpi_table([
        ('Revenue', '$320M'),
        ('EBITDA', '$64M'),
        ('EBITDA Margin', '20.0%'),
        ('YoY Growth', '8.0%'),
        ('FCF', '$48.8M'),
        ('Enterprise Value', '~$512M'),
    ]))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Carve-out Rationale', S['sub_heading']))
    story.append(Paragraph(
        "GlobalChem's decision to divest Vertex reflects a strategic portfolio rationalization "
        "toward its core commodity chemicals business. As a specialty unit within a commodity-focused "
        "parent, Vertex has been constrained by corporate capital allocation priorities, shared "
        "service inefficiencies, and a misalignment of strategic incentives. Management estimates "
        "approximately $8-12 million in annual cost savings achievable upon separation from "
        "GlobalChem's overhead allocation structure.",
        S['body']
    ))
    items = [
        '<b>Corporate overhead reallocation:</b> GlobalChem allocates ~$10.5M in annual corporate overhead charges that will be substantially reduced as a standalone entity',
        "<b>Underinvestment in R&amp;D:</b> GlobalChem's centralized R&amp;D budget has constrained Vertex's pipeline; management has identified 6-8 formulation projects currently unfunded",
        '<b>Contract repricing opportunity:</b> Several long-term customer contracts negotiated under GlobalChem\'s pricing umbrella are below market and up for renewal in 2025-2026',
        '<b>Management alignment:</b> The Vertex leadership team is highly motivated for independence, with the CEO and CFO both having structured prior successful carve-outs',
        '<b>Operational excellence:</b> VP Operations Marcus Reid has identified a further 2-3% COGS reduction achievable through lean manufacturing investments currently stalled in GlobalChem capital committees',
    ]
    story.extend(bullet_list(items))

    story.append(PageBreak())
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Value Creation Path to 24%+ EBITDA Margins', S['sub_heading']))
    story.append(Paragraph(
        'The investment thesis centers on margin expansion from the current 20.0% EBITDA margin '
        'to 25.9% by FY2027 through four distinct, quantifiable levers:',
        S['body']
    ))

    bridge_data = [
        ['Value Creation Lever', 'FY2024 Base', 'Contribution', 'FY2027E Target'],
        ['EBITDA Margin -- Current', '20.0%', '--', '--'],
        ['Corporate overhead removal', '--', '+1.8%', '--'],
        ['Contract repricing (5 major accounts)', '--', '+1.4%', '--'],
        ['COGS reduction via lean manufacturing', '--', '+1.2%', '--'],
        ['Revenue mix shift to higher-margin products', '--', '+1.5%', '--'],
        ['EBITDA Margin -- FY2027E Target', '--', '--', '~25.9%'],
    ]
    bridge_widths = [3.0*inch, 1.3*inch, 1.5*inch, 1.7*inch]
    t = Table(bridge_data, colWidths=bridge_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [WHITE, ALT_ROW]),
        ('BACKGROUND', (0,-1), (-1,-1), LIGHT_GOLD),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,-1), (-1,-1), NAVY),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 0.8, NAVY),
        ('LINEBELOW', (0,0), (-1,-1), 0.3, MID_GRAY),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Transaction Structure', S['sub_heading']))
    story.append(Paragraph(
        'The transaction is structured as a negotiated carve-out from GlobalChem Industries. '
        'The proposed enterprise value of approximately $512 million represents a multiple of '
        '1.6x FY2024 revenue and 8.0x FY2024 EBITDA -- a discount to specialty chemicals peers '
        'trading at 10-13x EBITDA, reflecting the carve-out execution risk premium. '
        'A Transition Services Agreement (TSA) of 18-24 months is anticipated to ensure '
        'operational continuity across IT, HR, finance, and procurement during the separation.',
        S['body']
    ))
    story.append(PageBreak())


# ─── Section 2: Investment Highlights ────────────────────────────────────────

def build_investment_highlights(story):
    story.append(navy_section_banner('SECTION 2   |   INVESTMENT HIGHLIGHTS'))
    story.append(Spacer(1, 0.15*inch))

    highlights = [
        ('1. Carve-out Value Unlock',
         'Separation from GlobalChem eliminates $10.5M+ in allocated corporate overhead. '
         'Contract repricing, independent capital allocation, and R&amp;D autonomy are expected '
         'to drive 590bps of EBITDA margin expansion to 25.9% by FY2027.'),
        ('2. Defensible Specialty Market Position',
         '47 proprietary formulations and 18 active patents create high barriers to entry. '
         'Qualified aerospace/defense supplier status requires 2-4 year customer qualification '
         'cycles, locking in long-duration revenue relationships.'),
        ('3. High-Growth End Market Exposure',
         'Automotive lightweighting (EV battery encapsulants, structural adhesives), aerospace '
         'composites, and advanced electronics (5G substrates) collectively growing at 7-9% CAGR '
         '-- well above specialty chemicals average of 5-6%.'),
        ('4. Proven Management Team',
         'CEO Thomas Hargrove (ex-BASF North America President, 30 years sector experience) '
         'leads a team with deep carve-out execution experience. CFO Carolyn Walsh has '
         'personally led 4 prior carve-out transactions at LyondellBasell.'),
        ('5. Consistent FCF Generation',
         'Vertex has generated positive free cash flow every year since 2008. FY2024 FCF of '
         '$48.8M (15.3% FCF margin) supports debt service, with projected FCF of $88M+ by '
         'FY2027 providing significant deleveraging capacity.'),
        ('6. Regulatory Tailwinds',
         'Environmental regulations increasingly favor specialty over commodity chemical '
         'substitutes. EU REACH and U.S. EPA TSCA reform are expanding the addressable '
         "market for Vertex's high-performance, low-VOC specialty formulations."),
    ]

    for i, (title, body) in enumerate(highlights):
        bg = LIGHT_GRAY if i % 2 == 0 else WHITE
        rows = [
            [Paragraph(title, S['sub_heading_gold'])],
            [Paragraph(body, S['body'])],
        ]
        t = Table(rows, colWidths=[7.5*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), ALT_ROW),
            ('BACKGROUND', (0,1), (-1,1), bg),
            ('LEFTPADDING', (0,0), (-1,-1), 12),
            ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ('TOPPADDING', (0,0), (-1,0), 6),
            ('TOPPADDING', (0,1), (-1,1), 4),
            ('BOTTOMPADDING', (0,1), (-1,1), 8),
            ('LINEBEFORE', (0,0), (0,-1), 3, GOLD),
            ('BOX', (0,0), (-1,-1), 0.3, MID_GRAY),
        ]))
        story.append(t)
        story.append(Spacer(1, 0.07*inch))
    story.append(PageBreak())


# ─── Section 3: Company Overview ─────────────────────────────────────────────

def build_company_overview(story):
    story.append(navy_section_banner('SECTION 3   |   COMPANY OVERVIEW'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Company Background', S['sub_heading']))
    story.append(Paragraph(
        'Founded in 1995 by chemical engineers from Dow Chemical and Exxon Chemical, '
        'Vertex Specialty Chemicals was established with a singular focus on developing '
        'high-performance polymer additives for the nascent automotive plastics market. '
        'Over three decades, Vertex evolved from a single-product additive supplier into '
        'a diversified specialty chemicals platform serving four distinct end markets '
        'through three integrated product lines.',
        S['body']
    ))
    story.append(Paragraph(
        'The Company is headquartered in Houston, Texas with three owned manufacturing '
        'facilities totaling approximately 485,000 square feet of production capacity. '
        'Vertex employs 1,850 full-time employees, including approximately 180 scientists '
        'and engineers in its R&amp;D organization.',
        S['body']
    ))

    story.append(Paragraph('Corporate History &amp; Key Milestones', S['sub_heading']))
    milestones = [
        ['Year', 'Milestone'],
        ['1995', 'Founded in Houston, TX; initial focus on polymer additive packages for automotive OEMs'],
        ['1999', 'Opened Baton Rouge, LA facility; entered specialty coatings market'],
        ['2003', 'Achieved AS9100 aerospace certification; began qualifying with Boeing and Airbus supply chains'],
        ['2007', 'Launched performance resins product line; Houston facility expanded to 280,000 sq ft'],
        ['2010', 'Opened Beaumont, TX facility; electronics market entry with advanced substrate materials'],
        ['2012', 'Reached $200M revenue milestone; 28 active patents in portfolio'],
        ['2014', 'Awarded preferred supplier status by 3 major automotive OEMs'],
        ['2016', 'Acquired by GlobalChem Industries for $380M (7.2x EBITDA at time of acquisition)'],
        ['2019', 'Launched next-generation EV battery encapsulant product; 12 additional formulations filed'],
        ['2022', 'Revenue grew through COVID disruption; supply chain diversification completed'],
        ['2024', 'Revenue reaches $320M; EBITDA $64M; initiates carve-out process'],
    ]
    t = Table(milestones, colWidths=[0.8*inch, 6.7*inch])
    t.setStyle(TableStyle(base_table_style() + [
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,1), (0,-1), GOLD),
    ]))
    story.append(t)

    story.append(PageBreak())
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph('Manufacturing Footprint', S['sub_heading']))
    facilities = [
        ['Facility', 'Location', 'Size (sq ft)', 'Primary Products', 'Employees'],
        ['Houston (HQ)', 'Houston, TX', '280,000', 'Polymer additives, R&D center', '950'],
        ['Baton Rouge', 'Baton Rouge, LA', '135,000', 'Specialty coatings, performance resins', '520'],
        ['Beaumont', 'Beaumont, TX', '70,000', 'Electronics materials, advanced additives', '380'],
        ['Total', '', '485,000', '--', '1,850'],
    ]
    t2 = Table(facilities, colWidths=[1.3*inch, 1.4*inch, 1.1*inch, 2.5*inch, 1.2*inch])
    t2.setStyle(TableStyle(base_table_style(has_total_row=True)))
    story.append(t2)
    story.append(Spacer(1, 0.12*inch))

    story.append(Paragraph('Organizational Structure', S['sub_heading']))
    story.append(Paragraph(
        'Vertex operates as a unified business unit with three operating divisions corresponding '
        'to its product lines. The Company employs approximately 180 R&amp;D scientists and engineers, '
        '420 manufacturing and operations personnel, 280 sales and commercial staff, and 970 in '
        'supporting roles. Post-carve-out, the Company will establish standalone corporate '
        'functions in Finance, HR, IT, Legal, and EHS currently shared with GlobalChem.',
        S['body']
    ))
    story.append(PageBreak())


# ─── Section 4: Products & Technology ────────────────────────────────────────

def build_products(story):
    story.append(navy_section_banner('SECTION 4   |   PRODUCTS & TECHNOLOGY'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Product Line Overview', S['sub_heading']))
    prod_data = [
        ['Product Line', 'Revenue (FY2024)', '% of Revenue', 'Gross Margin', 'End Markets'],
        ['Advanced Polymer Additives', '$144M', '45%', '47%', 'Automotive, Aerospace, Industrial'],
        ['Specialty Coatings', '$112M', '35%', '40%', 'Automotive, Aerospace, Electronics'],
        ['Performance Resins', '$64M', '20%', '36%', 'Electronics, Industrial'],
        ['Total / Blended', '$320M', '100%', '42%', '--'],
    ]
    t = Table(prod_data, colWidths=[2.0*inch, 1.3*inch, 1.1*inch, 1.2*inch, 1.9*inch])
    t.setStyle(TableStyle(base_table_style(has_total_row=True)))
    story.append(t)
    story.append(Spacer(1, 0.12*inch))

    prods = [
        ('Advanced Polymer Additives (45% of Revenue)',
         "Vertex's largest product line encompasses 21 proprietary additive packages including "
         'heat stabilizers, UV absorbers, antioxidants, and processing aids. These materials '
         'enhance thermal stability, mechanical properties, and service life of engineering '
         'plastics used in automotive body panels, EV battery housings, and aerospace structural '
         'components. Key products include the VX-Series heat stabilizers (7 active patents) and '
         'the AeroShield UV protection line qualified for commercial aviation applications.'),
        ('Specialty Coatings (35% of Revenue)',
         'High-performance coatings formulated for extreme-environment applications including '
         'aerospace topcoats, automotive corrosion protection, and electronics conformal coatings. '
         'Vertex holds 8 patents in this segment covering novel fluoropolymer chemistry and '
         'nano-ceramic composite formulations. The CoatPro industrial line and AeroGuard '
         'aerospace coatings are flagship products with 5-10 year customer qualification relationships.'),
        ('Performance Resins (20% of Revenue)',
         'Engineered resin systems for printed circuit board laminates, electronic encapsulants, '
         'and industrial adhesive applications. Three active patents cover the VertexBond epoxy '
         'system used in advanced PCB manufacturing. While the lowest-margin segment at 36%, '
         'Performance Resins carries the highest switching costs -- PCB manufacturers must '
         're-qualify any resin change through a 12-18 month process.'),
    ]
    for title, body in prods:
        story.append(Paragraph(title, S['sub_heading_gold']))
        story.append(Paragraph(body, S['body']))

    story.append(PageBreak())
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph('R&amp;D Pipeline &amp; Intellectual Property', S['sub_heading']))
    story.append(Paragraph(
        'Vertex invests approximately 3.5% of revenue (~$11.2M in FY2024) in R&amp;D, focused on '
        'next-generation formulation development and patent prosecution. The Company employs '
        '180 R&amp;D personnel across its three facilities, with the Houston campus serving as '
        'the primary innovation center.',
        S['body']
    ))

    pipeline_data = [
        ['Project', 'Target Application', 'Stage', 'Revenue Potential', 'IP Status'],
        ['VX-Thermal Pro', 'EV battery thermal management', 'Pilot scale', '$12-18M', '2 patents pending'],
        ['NanoCoat Elite', 'Satellite / space coatings', 'Customer qualification', '$8-12M', '1 patent pending'],
        ['BioResin 200', 'Bio-based PCB laminates', 'Development', '$6-10M', 'Trade secret'],
        ['HyperShield UV', 'Autonomous vehicle sensors', 'Customer qualification', '$10-15M', '3 patents pending'],
        ['FlexPoly Additive', 'Flexible electronics', 'Early development', '$5-8M', 'Research phase'],
        ['CorroGuard Plus', 'Offshore wind structures', 'Pilot scale', '$7-11M', '1 patent filed'],
    ]
    t2 = Table(pipeline_data, colWidths=[1.5*inch, 1.8*inch, 1.4*inch, 1.5*inch, 1.3*inch])
    t2.setStyle(TableStyle(base_table_style()))
    story.append(t2)
    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph(
        'The 6 active pipeline projects represent an estimated $48-74M in annual revenue potential '
        'at full commercialization, with VX-Thermal Pro and NanoCoat Elite expected to achieve '
        'initial commercial revenues in FY2026. Post-carve-out R&amp;D investment is planned to '
        'increase to 4.5% of revenue as management pursues an expanded IP strategy.',
        S['body']
    ))
    story.append(PageBreak())


# ─── Section 5: End Markets & Customers ──────────────────────────────────────

def build_end_markets(story):
    story.append(navy_section_banner('SECTION 5   |   END MARKETS & CUSTOMERS'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('End Market Revenue Breakdown', S['sub_heading']))
    em_data = [
        ['End Market', 'FY2024 Revenue', '% of Total', 'Key Products', 'Growth Driver', 'CAGR'],
        ['Automotive', '$96M', '30%', 'Polymer additives, coatings', 'EV lightweighting', '8-10%'],
        ['Aerospace', '$80M', '25%', 'AeroGuard coatings, additives', 'Composite airframes', '9-11%'],
        ['Electronics', '$70.4M', '22%', 'Performance resins, coatings', '5G, flex electronics', '7-9%'],
        ['Industrial', '$73.6M', '23%', 'Coatings, additives, resins', 'Infrastructure, energy', '4-6%'],
    ]
    t = Table(em_data, colWidths=[1.1*inch, 1.1*inch, 0.7*inch, 1.7*inch, 1.8*inch, 1.1*inch])
    t.setStyle(TableStyle(base_table_style()))
    story.append(t)
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Customer Concentration &amp; Contract Structure', S['sub_heading']))
    story.append(Paragraph(
        'Vertex serves approximately 340 active customers globally, with no single customer '
        'representing more than 14% of total revenue. The top 5 customers represent '
        'approximately 48% of revenue, which is typical for a specialty chemicals business '
        'of this scale given the qualification-intensive nature of customer relationships.',
        S['body']
    ))
    story.append(Spacer(1, 0.08*inch))

    cust_data = [
        ['Customer (Anonymized)', 'Segment', '% of Revenue', 'Contract Expiry', 'Relationship Since'],
        ['Customer A (Automotive OEM)', 'Automotive', '13.8%', 'Q3 2025', '2007'],
        ['Customer B (Aerospace Tier 1)', 'Aerospace', '11.2%', 'Q4 2026', '2009'],
        ['Customer C (Electronics Mfg)', 'Electronics', '8.9%', 'Q2 2026', '2014'],
        ['Customer D (Specialty OEM)', 'Industrial', '7.6%', 'Q1 2027', '2011'],
        ['Customer E (Aerospace OEM)', 'Aerospace', '6.5%', 'Q3 2026', '2012'],
        ['Remaining 335 customers', 'Various', '52.0%', 'Various', '--'],
    ]
    t2 = Table(cust_data, colWidths=[2.2*inch, 1.2*inch, 1.0*inch, 1.3*inch, 1.8*inch])
    t2.setStyle(TableStyle(base_table_style()))
    story.append(t2)

    story.append(PageBreak())
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph('Contract Repricing Opportunity', S['sub_heading']))
    story.append(Paragraph(
        'A key component of the investment thesis is the repricing of Customer A and Customer B '
        'contracts upon renewal in 2025-2026. Both contracts were negotiated in 2019-2020 under '
        "GlobalChem's corporate pricing framework, which imposed sub-market pricing to maintain "
        "GlobalChem's broader commercial relationships in unrelated segments. Management estimates "
        'a 6-8% price improvement achievable across these two accounts, contributing approximately '
        '$7.5M in incremental annual EBITDA.',
        S['body']
    ))
    story.append(Spacer(1, 0.08*inch))

    story.append(Paragraph('Customer Retention &amp; Switching Costs', S['sub_heading']))
    items = [
        '<b>Aerospace/defense qualification:</b> AS9100/NADCAP processes require 18-36 months for new suppliers; Vertex is already qualified across all major aerospace primes',
        "<b>OEM specification lock-in:</b> Vertex's polymer additives are specified by name in 14 automotive OEM material specifications, requiring OEM engineering approval for any substitution",
        '<b>Long-term supply agreements:</b> 68% of FY2024 revenue is covered by contracts with 2+ years remaining; average contract length of 3.2 years',
        "<b>Technical integration:</b> Vertex's R&amp;D team is embedded in customer NPD processes for 8 major accounts, creating collaborative stickiness beyond transactional pricing",
    ]
    story.extend(bullet_list(items))
    story.append(PageBreak())


# ─── Section 6: Market Overview ───────────────────────────────────────────────

def build_market_overview(story):
    story.append(navy_section_banner('SECTION 6   |   MARKET OVERVIEW'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Global Specialty Chemicals Market', S['sub_heading']))
    story.append(Paragraph(
        'The global specialty chemicals market is valued at approximately $750 billion and is '
        'expected to grow at a 5-7% CAGR through 2030, driven by increasing demand for '
        'high-performance materials, environmental regulations shifting demand from commodity '
        'to specialty chemistries, and the acceleration of electrification and lightweighting '
        "trends in transportation. Vertex's three addressable market segments represent a "
        'combined $89 billion in annual global demand.',
        S['body']
    ))

    mkt_data = [
        ['Market Segment', 'Global Market Size', '2024-2030 CAGR', 'Key Drivers', "Vertex Share"],
        ['Polymer Additives', '$38B', '6.2%', 'EV/lightweighting, bioplastics', '~0.38%'],
        ['Specialty Coatings', '$29B', '5.8%', 'Aerospace, automotive, electronics', '~0.39%'],
        ['Performance Resins', '$22B', '7.1%', '5G PCBs, advanced packaging', '~0.29%'],
        ['Total Addressable', '$89B', '6.2%', '--', '~0.36%'],
    ]
    t = Table(mkt_data, colWidths=[1.8*inch, 1.3*inch, 1.1*inch, 2.3*inch, 1.0*inch])
    t.setStyle(TableStyle(base_table_style(has_total_row=True)))
    story.append(t)
    story.append(Spacer(1, 0.12*inch))

    story.append(Paragraph('Regulatory Tailwinds', S['sub_heading']))
    reg_items = [
        "<b>EU REACH &amp; PFAS regulation:</b> European restrictions on per- and polyfluoroalkyl substances are driving demand for Vertex's fluorine-free specialty coatings alternatives, with an estimated $12-15B market shift underway",
        '<b>U.S. EPA TSCA reform:</b> Enhanced chemical safety standards are accelerating the substitution of legacy commodity additives with certified specialty alternatives -- directly benefiting Vertex\'s high-purity additive portfolio',
        "<b>Automotive electrification mandates:</b> EU 2035 ICE ban and U.S. IRA EV tax credits are driving rapid EV adoption, which requires 3-5x more specialty chemical content per vehicle than traditional ICE platforms",
        "<b>Defense industrial base investment:</b> U.S. DoD supply chain security initiatives favor domestic, qualified aerospace materials suppliers, reinforcing Vertex's preferred supplier status",
    ]
    story.extend(bullet_list(reg_items))

    story.append(PageBreak())
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph('Competitive Landscape', S['sub_heading']))
    story.append(Paragraph(
        "Vertex competes in three distinct product segments against a mix of global multinationals "
        "and regional specialty players. The Company's differentiated position derives from its "
        "multi-segment breadth (allowing cross-selling), proprietary formulation depth, and "
        "aerospace/defense qualification status -- a combination few mid-sized competitors possess.",
        S['body']
    ))

    comp_data = [
        ['Competitor', 'Primary Segments', 'Revenue (est.)', 'Vertex Competitive Advantage'],
        ['Global Major A', 'All three segments', '>$5B', 'Vertex wins on specialization and customer agility'],
        ['Regional Player B', 'Polymer additives only', '~$180M', 'Vertex has broader product scope + aero qualification'],
        ['Coatings Specialist C', 'Specialty coatings', '~$320M', 'Vertex competitive on IP; carve-out improves pricing flexibility'],
        ['Materials Conglomerate D', 'Performance resins', '>$1B', 'Vertex wins on service and specification customization'],
        ['Asian Entrant E', 'Polymer additives', '~$120M', 'Vertex holds clear patent barriers; aero qualification moat'],
    ]
    t2 = Table(comp_data, colWidths=[1.7*inch, 1.5*inch, 1.1*inch, 3.2*inch])
    t2.setStyle(TableStyle(base_table_style()))
    story.append(t2)
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        'The specialty chemicals market remains highly fragmented below the top-5 global players. '
        'Vertex is positioned as a consolidation platform: post-carve-out, the Company will have '
        'the capital structure and management bandwidth to pursue 2-3 bolt-on acquisitions in '
        'adjacent specialty segments at 5-7x EBITDA multiples.',
        S['body']
    ))
    story.append(PageBreak())


# ─── Section 7: Financial Performance ────────────────────────────────────────

def build_financials(story):
    story.append(navy_section_banner('SECTION 7   |   FINANCIAL PERFORMANCE'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Historical Financial Summary (FY2022-FY2024)', S['sub_heading']))
    hist_data = [
        ['Metric', 'FY2022', 'FY2023', 'FY2024', 'CAGR'],
        ['Revenue ($M)', '$274.0', '$296.0', '$320.0', '8.0%'],
        ['Gross Profit ($M)', '$112.3', '$122.3', '$134.4', '9.4%'],
        ['Gross Margin', '41.0%', '41.3%', '42.0%', '+100bps'],
        ['EBITDA ($M)', '$50.6', '$57.4', '$64.0', '12.5%'],
        ['EBITDA Margin', '18.5%', '19.4%', '20.0%', '+150bps'],
        ['D&A ($M)', '$8.2', '$9.1', '$9.8', '--'],
        ['EBIT ($M)', '$42.4', '$48.3', '$54.2', '--'],
        ['CapEx ($M)', '$12.1', '$13.8', '$15.2', '--'],
        ['Free Cash Flow ($M)', '$38.5', '$43.6', '$48.8', '12.6%'],
        ['FCF Margin', '14.1%', '14.7%', '15.3%', '+120bps'],
    ]
    # Highlight key rows
    style = base_table_style()
    for row_idx in [2, 4, 9]:
        style.append(('BACKGROUND', (0,row_idx), (-1,row_idx), HexColor('#E8EFF6')))
        style.append(('FONTNAME', (0,row_idx), (0,row_idx), 'Helvetica-Bold'))
    t = Table(hist_data, colWidths=[2.5*inch, 1.1*inch, 1.1*inch, 1.1*inch, 1.7*inch])
    t.setStyle(TableStyle(style))
    story.append(t)
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        'Vertex has demonstrated consistent double-digit EBITDA growth over the FY2022-FY2024 '
        'period, compounding at 12.5% annually driven by pricing power, volume growth in '
        'aerospace and electronics, and operational efficiency gains. Gross margins expanded '
        '100bps over the period, reflecting favorable product mix shift toward higher-margin '
        'polymer additives.',
        S['body']
    ))

    story.append(PageBreak())
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph('Normalized EBITDA Bridge (FY2024)', S['sub_heading']))
    story.append(Paragraph(
        'The following bridge adjusts reported EBITDA for non-recurring items and allocations '
        'that will not persist in a standalone entity:',
        S['body']
    ))

    bridge_data = [
        ['Item', 'Amount ($M)', 'Notes'],
        ['Reported EBITDA', '$64.0', 'As reported under GlobalChem consolidation'],
        ['Add: Corporate overhead allocation', '+$10.5', 'Allocated G&A from GlobalChem HQ; eliminates at separation'],
        ['Add: Shared services premium', '+$2.1', 'Above-market transfer pricing for IT, HR, legal'],
        ['Add: Non-recurring restructuring', '+$1.4', 'One-time charges related to GlobalChem integration'],
        ['Less: Standalone public company costs', '-$3.8', 'CFO, legal, audit, D&O insurance as standalone entity'],
        ['Less: Commercial normalizations', '-$1.2', 'Normalize related-party contract pricing to market'],
        ['Normalized Standalone EBITDA', '$73.0', 'Basis for carve-out valuation analysis'],
        ['Normalized EBITDA Margin', '22.8%', 'vs. 20.0% reported -- 280bps carve-out uplift'],
    ]
    t2 = Table(bridge_data, colWidths=[2.9*inch, 1.3*inch, 3.3*inch])
    style2 = [
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-3), [WHITE, ALT_ROW]),
        ('BACKGROUND', (0,-2), (-1,-1), LIGHT_GOLD),
        ('FONTNAME', (0,-2), (-1,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,-2), (-1,-1), NAVY),
        ('ALIGN', (1,0), (1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 0.8, NAVY),
        ('LINEBELOW', (0,0), (-1,-1), 0.3, MID_GRAY),
    ]
    t2.setStyle(TableStyle(style2))
    story.append(t2)

    story.append(PageBreak())
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph('Financial Projections (FY2025E - FY2027E)', S['sub_heading']))
    story.append(Paragraph(
        'Management projections assume successful carve-out execution, realization of identified '
        'operational synergies, and continuation of favorable end-market growth trends.',
        S['body']
    ))

    proj_data = [
        ['Metric', 'FY2024A', 'FY2025E', 'FY2026E', 'FY2027E', '3yr CAGR'],
        ['Revenue ($M)', '$320', '$346', '$374', '$402', '7.9%'],
        ['Revenue Growth', '8.0%', '8.1%', '8.1%', '7.5%', '--'],
        ['Gross Profit ($M)', '$134.4', '$148.8', '$165.2', '$181.7', '10.6%'],
        ['Gross Margin', '42.0%', '43.0%', '44.2%', '45.2%', '--'],
        ['EBITDA ($M)', '$64.0', '$76.1', '$90.2', '$104.1', '17.6%'],
        ['EBITDA Margin', '20.0%', '22.0%', '24.1%', '25.9%', '--'],
        ['CapEx ($M)', '$15.2', '$17.3', '$18.7', '$16.1', '--'],
        ['Free Cash Flow ($M)', '$48.8', '$58.8', '$71.5', '$88.0', '21.6%'],
    ]
    style3 = base_table_style()
    for row_idx in [2, 4, 6, 8]:
        style3.append(('BACKGROUND', (0,row_idx), (-1,row_idx), HexColor('#E8EFF6')))
        style3.append(('FONTNAME', (0,row_idx), (0,row_idx), 'Helvetica-Bold'))
    # Shade the FY2024A column as historical
    style3.append(('BACKGROUND', (1,1), (1,-1), HexColor('#F0F0F0')))
    style3.append(('LINEAFTER', (1,0), (1,-1), 0.8, MID_GRAY))
    t3 = Table(proj_data, colWidths=[2.0*inch, 1.0*inch, 1.0*inch, 1.0*inch, 1.0*inch, 1.5*inch])
    t3.setStyle(TableStyle(style3))
    story.append(t3)
    story.append(Spacer(1, 0.08*inch))
    story.append(Paragraph(
        'Note: FY2025E reflects partial-year carve-out benefits (separation assumed Q2 2025). '
        'FY2026E and FY2027E represent full-year standalone operations. EBITDA margin expansion '
        'of 590bps from FY2024A to FY2027E is driven by: overhead elimination (+180bps), '
        'contract repricing (+140bps), COGS reduction (+120bps), and revenue mix shift (+150bps).',
        S['body_small']
    ))
    story.append(PageBreak())


# ─── Section 8: Carve-out Transition Plan ────────────────────────────────────

def build_carveout_plan(story):
    story.append(navy_section_banner('SECTION 8   |   CARVE-OUT TRANSITION PLAN'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Transition Services Agreement (TSA) Framework', S['sub_heading']))
    story.append(Paragraph(
        'GlobalChem has agreed in principle to provide TSA support for an 18-24 month period '
        'post-closing. CFO Carolyn Walsh and an experienced carve-out management team have '
        'developed a detailed Day-1 readiness plan ensuring operational continuity from close.',
        S['body']
    ))

    tsa_data = [
        ['Function', 'TSA Duration', 'Standalone Cost/yr', 'Status'],
        ['IT Systems & Infrastructure', '18 months', '$2.1M', 'ERP selection in progress'],
        ['Finance & Accounting', '12 months', '$1.8M', 'CFO team in place'],
        ['Human Resources', '12 months', '$0.9M', 'HR director hired'],
        ['Legal & Compliance', '18 months', '$1.2M', 'Outside counsel retained'],
        ['Procurement & Supply Chain', '24 months', '$1.4M', 'Key supplier contracts transferring'],
        ['EHS & Regulatory', '12 months', '$0.4M', 'Internal capability built'],
        ['Total Standalone Cost', '--', '$7.8M', 'vs. $10.5M GlobalChem allocation'],
    ]
    t = Table(tsa_data, colWidths=[2.2*inch, 1.3*inch, 1.3*inch, 2.7*inch])
    t.setStyle(TableStyle(base_table_style(has_total_row=True)))
    story.append(t)
    story.append(Spacer(1, 0.12*inch))

    story.append(Paragraph('Carve-out Timeline', S['sub_heading']))
    timeline_data = [
        ['Phase', 'Timeline', 'Key Activities'],
        ['Phase 1: Pre-Signing', 'Q1 2025', 'Management presentations, due diligence, LOI execution'],
        ['Phase 2: Signing to Close', 'Q1-Q2 2025', 'Regulatory filings, financing, entity separation, Day-1 planning'],
        ['Phase 3: TSA Period', 'Q2 2025 - Q4 2026', 'Standalone IT build, HR/finance/legal transition'],
        ['Phase 4: Full Independence', 'Q1 2027', 'TSA exit, full standalone operations, organic growth phase'],
    ]
    t2 = Table(timeline_data, colWidths=[1.8*inch, 1.5*inch, 4.2*inch])
    t2.setStyle(TableStyle(base_table_style() + [
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,1), (0,-1), GOLD),
    ]))
    story.append(t2)
    story.append(PageBreak())


# ─── Section 9: Management Team ──────────────────────────────────────────────

def build_management(story):
    story.append(navy_section_banner('SECTION 9   |   MANAGEMENT TEAM'))
    story.append(Spacer(1, 0.15*inch))

    mgmt = [
        ('Thomas Hargrove', 'Chief Executive Officer',
         '30 years in specialty chemicals. Former President, BASF North America -- led a $2.2B '
         'business with 4,200 employees across 8 countries. Prior: VP Chemical Operations at '
         'Dow Chemical, specialty polymers division. Joined Vertex in 2018; drove EBITDA margins '
         'from 15.8% to 20.0% through operational rigor and customer focus. BS Chemical '
         'Engineering, Georgia Tech; MBA, Wharton.'),
        ('Carolyn Walsh', 'Chief Financial Officer',
         'M&amp;A and carve-out specialist with 25 years in chemicals finance. Former VP Corporate '
         'Development at LyondellBasell, where she led 4 carve-out transactions totaling $3.1B. '
         'Deep expertise in carve-out accounting, TSA structuring, and standalone entity setup. '
         'Joined Vertex in 2020. CPA; BS Accounting, UT Austin; MBA Finance, University of Chicago.'),
        ('Dr. Eric Zhao', 'Chief R&amp;D Officer',
         "PhD Chemical Engineering, MIT. 20 years specialty chemicals R&amp;D leadership. Inventor on 12 of "
         "Vertex's 18 active patents. Former Research Director at 3M's specialty materials division. "
         'Joined Vertex in 2015; has expanded the formulation portfolio from 31 to 47 proprietary '
         'products and filed 6 additional patent applications in the past 2 years.'),
        ('Marcus Reid', 'VP Operations',
         'Lean manufacturing expert with 18 years in chemical plant operations. Former Plant Director '
         'at Cabot Corporation. Since joining Vertex in 2022, has implemented Six Sigma-based process '
         'improvements reducing COGS by 3.2% ($8.4M annually) through yield optimization, energy '
         'efficiency projects, and procurement consolidation. BS Industrial Engineering, Purdue.'),
    ]

    name_style = ParagraphStyle('mns', fontName='Helvetica-Bold', fontSize=11, textColor=WHITE)
    title_style = ParagraphStyle('mts', fontName='Helvetica', fontSize=9.5, textColor=LIGHT_GOLD)

    for name, title, bio in mgmt:
        hdr = Table([[Paragraph(name, name_style), Paragraph(title, title_style)]],
                    colWidths=[3.0*inch, 4.5*inch])
        hdr.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), NAVY),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        bio_t = Table([[Paragraph(bio, S['body'])]], colWidths=[7.5*inch])
        bio_t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), LIGHT_GRAY),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LINEBEFORE', (0,0), (0,-1), 3, GOLD),
        ]))
        story.append(hdr)
        story.append(bio_t)
        story.append(Spacer(1, 0.1*inch))
    story.append(PageBreak())


# ─── Section 10: Transaction Overview ────────────────────────────────────────

def build_transaction(story):
    story.append(navy_section_banner('SECTION 10   |   TRANSACTION OVERVIEW'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Transaction Summary', S['sub_heading']))
    tx_data = [
        ['Parameter', 'Detail'],
        ['Transaction Type', 'Negotiated carve-out from GlobalChem Industries'],
        ['Enterprise Value', '~$512 million'],
        ['EV / FY2024 Revenue', '1.6x ($320M)'],
        ['EV / FY2024 EBITDA', '8.0x ($64M)'],
        ['EV / Normalized EBITDA', '7.0x ($73M)'],
        ['Expected Close', 'Q2 2025'],
        ['TSA Duration', '18-24 months from close'],
        ['Process Type', 'Controlled auction -- 6-8 invited sponsors'],
        ['Exclusivity', 'Subject to execution of acceptable LOI'],
        ['Financing', 'Acquisition finance commitment letters required with bid'],
    ]
    t = Table(tx_data, colWidths=[2.5*inch, 5.0*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, ALT_ROW]),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,1), (0,-1), NAVY),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BOX', (0,0), (-1,-1), 0.8, NAVY),
        ('LINEBELOW', (0,0), (-1,-1), 0.3, MID_GRAY),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Process &amp; Next Steps', S['sub_heading']))
    steps = [
        '<b>Preliminary Indications of Interest:</b> Due April 30, 2025 -- non-binding indication of enterprise value range, financing sources, and proposed transaction structure',
        '<b>Management Presentations:</b> Week of May 12, 2025 -- full-day sessions at Houston HQ with CEO, CFO, and divisional heads',
        '<b>Final Bids:</b> Due June 20, 2025 -- fully financed binding offers with markup of Purchase Agreement',
        '<b>Exclusivity &amp; Signing:</b> Targeted for week of June 30, 2025',
        '<b>Close:</b> Targeted Q3 2025, subject to regulatory approvals (HSR filing required)',
    ]
    story.extend(bullet_list(steps))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Advisor Information', S['sub_heading']))
    story.append(Paragraph(
        'Goldman Sachs &amp; Co. LLC is acting as exclusive financial advisor to GlobalChem Industries '
        'in connection with this transaction. Sullivan &amp; Cromwell LLP is acting as legal counsel. '
        'All inquiries and submissions should be directed to the Goldman Sachs deal team referenced '
        'in the process letter distributed with this memorandum.',
        S['body']
    ))
    story.append(PageBreak())


# ─── Appendix ─────────────────────────────────────────────────────────────────

def build_appendix(story):
    story.append(navy_section_banner('APPENDIX   |   MANUFACTURING FACILITIES & PATENT SUMMARY'))
    story.append(Spacer(1, 0.15*inch))

    story.append(Paragraph('Manufacturing Facility Details', S['sub_heading']))

    fac_hdr_style = ParagraphStyle('fhs', fontName='Helvetica-Bold', fontSize=9.5, textColor=WHITE)
    fac_lbl_style = ParagraphStyle('fls', fontName='Helvetica-Bold', fontSize=8.5, textColor=NAVY)
    fac_val_style = ParagraphStyle('fvs', fontName='Helvetica', fontSize=8.5, textColor=TEXT_BLACK)

    facilities_info = [
        ('Houston, TX -- Headquarters & Primary Manufacturing', None),
        ('Land Area', '42 acres (owned)'),
        ('Building Space', '280,000 sq ft'),
        ('Primary Products', 'Advanced polymer additives (all SKUs), R&D and pilot plant'),
        ('Certifications', 'ISO 9001:2015, ISO 14001, AS9100D, NADCAP Chemistry'),
        ('Capacity Utilization', '82% (polymer additives line), 71% (pilot plant)'),
        ('Key Equipment', '14 polymerization reactors, 8 blending/compounding lines, analytical lab'),
        ('Environmental Status', 'No outstanding environmental liabilities; LDAR program compliant'),
        ('Baton Rouge, LA -- Specialty Coatings & Resins', None),
        ('Land Area', '28 acres (owned)'),
        ('Building Space', '135,000 sq ft'),
        ('Primary Products', 'CoatPro industrial line, AeroGuard aerospace coatings, resin precursors'),
        ('Certifications', 'ISO 9001:2015, NADCAP Surface Enhancement, AS9100D'),
        ('Capacity Utilization', '79% (coatings), 65% (resins)'),
        ('Key Equipment', '6 coating dispersion lines, 4 resin synthesis reactors, automated QC lab'),
        ('Environmental Status', 'Minor legacy soil issue (Phase II complete); remediation cost est. $0.8M'),
        ('Beaumont, TX -- Electronics Materials', None),
        ('Land Area', '18 acres (owned)'),
        ('Building Space', '70,000 sq ft'),
        ('Primary Products', 'VertexBond epoxy systems, PCB laminates, electronic encapsulants'),
        ('Certifications', 'ISO 9001:2015, IATF 16949 (automotive electronics), UL Listed'),
        ('Capacity Utilization', '73% (electronics materials)'),
        ('Key Equipment', '3 resin/epoxy reactors, laminate press lines, cleanroom dispensing area'),
        ('Environmental Status', 'Clean; air permit renewal filed Q1 2025'),
    ]

    for label, value in facilities_info:
        if value is None:
            hdr = Table([[Paragraph(label, fac_hdr_style)]], colWidths=[7.5*inch])
            hdr.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), HexColor('#1A3A55')),
                ('TOPPADDING', (0,0), (-1,-1), 5),
                ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                ('LEFTPADDING', (0,0), (-1,-1), 8),
            ]))
            story.append(hdr)
        else:
            det = Table([[Paragraph(label, fac_lbl_style), Paragraph(value, fac_val_style)]],
                        colWidths=[2.2*inch, 5.3*inch])
            det.setStyle(TableStyle([
                ('TOPPADDING', (0,0), (-1,-1), 3),
                ('BOTTOMPADDING', (0,0), (-1,-1), 3),
                ('LEFTPADDING', (0,0), (-1,-1), 8),
                ('LINEBELOW', (0,0), (-1,-1), 0.2, MID_GRAY),
                ('BACKGROUND', (0,0), (-1,-1), LIGHT_GRAY),
            ]))
            story.append(det)

    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph('Patent Portfolio Summary', S['sub_heading']))

    patent_data = [
        ['Patent No.', 'Title / Description', 'Line', 'Filed', 'Expires', 'Markets'],
        ['US 9,847,221', 'High-Temp Polymer Stabilizer System', 'Additives', '2012', '2032', 'Auto, Aero'],
        ['US 10,123,445', 'UV-Resistant Aerospace Topcoat Formulation', 'Coatings', '2014', '2034', 'Aerospace'],
        ['US 10,456,789', 'Flame-Retardant Epoxy Encapsulant', 'Resins', '2015', '2035', 'Electronics'],
        ['US 10,789,012', 'Multi-Layer Corrosion Barrier System', 'Coatings', '2016', '2036', 'Industrial'],
        ['US 11,012,345', 'Nano-Enhanced Polymer Additive Package', 'Additives', '2017', '2037', 'Auto, Aero'],
        ['US 11,234,567', 'Low-VOC High-Performance Coating Base', 'Coatings', '2018', '2038', 'Auto, Ind'],
        ['US 11,456,789', 'Bio-Compatible PCB Laminate Resin', 'Resins', '2019', '2039', 'Electronics'],
        ['US 11,678,901', 'EV Battery Thermal Interface Material', 'Additives', '2020', '2040', 'Automotive'],
        ['US 11,890,123', 'Cryogenic Composite Adhesive System', 'Coatings', '2021', '2041', 'Aerospace'],
        ['(9 additional patents)', '...', '...', '...', '...', 'Various'],
        ['(6 pending applications)', 'Pipeline IP -- not yet public', 'Various', '2023-24', '--', 'Various'],
    ]
    t = Table(patent_data, colWidths=[1.1*inch, 2.4*inch, 0.9*inch, 0.55*inch, 0.65*inch, 0.9*inch])
    t.setStyle(TableStyle(base_table_style()))
    story.append(t)

    story.append(Spacer(1, 0.2*inch))
    story.append(HRFlowable(width=7.5*inch, thickness=1, color=MID_GRAY))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        'DISCLAIMER: This Confidential Information Memorandum ("CIM") has been prepared by '
        'Goldman Sachs &amp; Co. LLC ("Goldman Sachs") on behalf of GlobalChem Industries for '
        'the sole purpose of assisting potential acquirers in evaluating a possible transaction '
        'involving Vertex Specialty Chemicals. This CIM contains confidential information and '
        'may not be reproduced, distributed, or used for any purpose other than evaluating a '
        'potential transaction. The information contained herein has been obtained from sources '
        'believed to be reliable, but Goldman Sachs makes no representation or warranty, express '
        'or implied, as to its accuracy or completeness. Projections and forward-looking statements '
        'are based on management estimates and involve inherent uncertainty. Recipients must conduct '
        'their own independent due diligence. This document does not constitute an offer to sell '
        'or a solicitation of an offer to buy any securities.',
        S['disclaimer']
    ))


# ─── Build ────────────────────────────────────────────────────────────────────

def build():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=letter,
        leftMargin=0.5*inch,
        rightMargin=0.5*inch,
        topMargin=0.75*inch,
        bottomMargin=0.65*inch,
        title='Vertex Specialty Chemicals -- Confidential Information Memorandum',
        author='Goldman Sachs & Co. LLC',
        subject='Project Apex -- Carve-out from GlobalChem Industries',
    )
    story = []
    build_cover(story)
    build_toc(story)
    build_exec_summary(story)
    build_investment_highlights(story)
    build_company_overview(story)
    build_products(story)
    build_end_markets(story)
    build_market_overview(story)
    build_financials(story)
    build_carveout_plan(story)
    build_management(story)
    build_transaction(story)
    build_appendix(story)
    doc.build(story, canvasmaker=NumberedCanvas)
    size = os.path.getsize(OUTPUT_PATH)
    print(f'CIM PDF saved: {OUTPUT_PATH}')
    print(f'File size: {size:,} bytes ({size/1024:.1f} KB)')

if __name__ == '__main__':
    build()
