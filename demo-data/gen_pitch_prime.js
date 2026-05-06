'use strict';
const PptxGenJSModule = require('/sessions/gracious-affectionate-dirac/node_modules/pptxgenjs');
const pptxgen = PptxGenJSModule.default ?? PptxGenJSModule;

const OUTPUT = '/sessions/gracious-affectionate-dirac/mnt/axis-copilot/demo-data/pitch-primehealth.pptx';

// Colors (no # prefix)
const NAVY   = '1A3A5C';
const GOLD   = 'B8860B';
const WHITE  = 'FFFFFF';
const LGRAY  = 'F0F4F8';
const DGRAY  = '444444';
const MGRAY  = 'CCCCCC';
const ALT    = 'EEF2F7';
const GREEN  = '2E7D32';

const W = 10, H = 5.625; // 16:9

function prs() { return new pptxgen(); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function navySlide(slide) {
    slide.background = { color: NAVY };
}

function whiteSlide(slide) {
    slide.background = { color: WHITE };
}

function addHeader(slide, text, sub) {
    // Gold rule top
    slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.07, fill: { color: GOLD }, line: { color: GOLD } });
    slide.addText(text, {
        x: 0.45, y: 0.14, w: W - 0.9, h: 0.48,
        fontSize: 20, bold: true, color: NAVY, fontFace: 'Calibri',
        align: 'left', valign: 'middle',
    });
    if (sub) {
        slide.addText(sub, {
            x: 0.45, y: 0.6, w: W - 0.9, h: 0.26,
            fontSize: 10, color: GOLD, fontFace: 'Calibri', align: 'left', italic: true,
        });
    }
    // Footer bar
    slide.addShape('rect', { x: 0, y: H - 0.28, w: W, h: 0.28, fill: { color: NAVY }, line: { color: NAVY } });
    slide.addText('PRIMEHEALTH PARTNERS  |  CONFIDENTIAL — FOR DISCUSSION PURPOSES ONLY  |  PROJECT PINNACLE  |  APRIL 2026', {
        x: 0, y: H - 0.28, w: W, h: 0.28,
        fontSize: 6, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle',
    });
}

function addNavyHeader(slide, title, sub) {
    slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.07, fill: { color: GOLD }, line: { color: GOLD } });
    slide.addText(title, {
        x: 0.45, y: 0.14, w: W - 0.9, h: 0.48,
        fontSize: 20, bold: true, color: WHITE, fontFace: 'Calibri', align: 'left', valign: 'middle',
    });
    if (sub) {
        slide.addText(sub, {
            x: 0.45, y: 0.6, w: W - 0.9, h: 0.26,
            fontSize: 10, color: GOLD, fontFace: 'Calibri', align: 'left', italic: true,
        });
    }
    slide.addShape('rect', { x: 0, y: H - 0.28, w: W, h: 0.28, fill: { color: GOLD }, line: { color: GOLD } });
    slide.addText('PRIMEHEALTH PARTNERS  |  CONFIDENTIAL — FOR DISCUSSION PURPOSES ONLY', {
        x: 0, y: H - 0.28, w: W, h: 0.28,
        fontSize: 6, color: NAVY, fontFace: 'Calibri', align: 'center', valign: 'middle',
    });
}

// ─── Slide 1: Cover ────────────────────────────────────────────────────────────
function slide01(ppt) {
    const s = ppt.addSlide();
    navySlide(s);
    s.addShape('rect', { x: 0, y: 0, w: W, h: 0.08, fill: { color: GOLD }, line: { color: GOLD } });
    s.addShape('rect', { x: 0, y: H - 0.08, w: W, h: 0.08, fill: { color: GOLD }, line: { color: GOLD } });

    s.addText('PRIMEHEALTH PARTNERS', {
        x: 0.5, y: 1.2, w: W - 1, h: 0.8,
        fontSize: 36, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center',
    });
    s.addShape('rect', { x: 2.5, y: 2.05, w: 5, h: 0.04, fill: { color: GOLD }, line: { color: GOLD } });
    s.addText('Leading Post-Acute Care Platform', {
        x: 0.5, y: 2.15, w: W - 1, h: 0.45,
        fontSize: 18, color: GOLD, fontFace: 'Calibri', align: 'center',
    });
    s.addText('Confidential Information Memorandum  |  Project Pinnacle', {
        x: 0.5, y: 2.65, w: W - 1, h: 0.3,
        fontSize: 11, color: WHITE, fontFace: 'Calibri', align: 'center', italic: true,
    });

    const infoRows = [
        ['Headquarters:', 'Nashville, Tennessee'],
        ['Founded:', '2011'],
        ['Deal Reference:', 'Project Pinnacle — Platform Buyout'],
        ['Transaction Value:', '~$225M Enterprise Value'],
        ['Exclusive Advisor:', 'Evercore Healthcare Advisory Group'],
        ['Date:', 'April 2026'],
    ];
    let y = 3.1;
    for (const [lbl, val] of infoRows) {
        s.addText(lbl, { x: 2.8, y, w: 1.6, h: 0.25, fontSize: 9, color: GOLD, fontFace: 'Calibri', bold: true });
        s.addText(val,  { x: 4.4, y, w: 3.0, h: 0.25, fontSize: 9, color: WHITE, fontFace: 'Calibri' });
        y += 0.27;
    }
    s.addText('CONFIDENTIAL — FOR DISCUSSION PURPOSES ONLY', {
        x: 0.5, y: H - 0.55, w: W - 1, h: 0.22,
        fontSize: 7.5, color: GOLD, fontFace: 'Calibri', align: 'center', bold: true,
    });
}

// ─── Slide 2: Investment Highlights ─────────────────────────────────────────
function slide02(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Investment Highlights', '6 Compelling Reasons to Invest');

    const boxes = [
        ['1. High-Growth Platform', '$133M to $185M revenue in 3 years (18% CAGR); 10 net new facilities since 2020'],
        ['2. Proprietary Clinical Tech', 'ClinicalEdge: 30% lower readmission vs. national avg; 82% of facilities at 5-star CMS'],
        ['3. Medicare-Anchored Revenue', '62% Medicare payor mix; $610/day avg rate vs. $570 national; VBP max bonus earner'],
        ['4. Proven M&A Integration', '14 acquisitions since 2018; +350 bps avg EBITDA improvement; 8-target pipeline ($45M rev)'],
        ['5. Attractive Entry Valuation', '8.0x LTM EBITDA vs. public comps at 10-12x; meaningful discount to recent transactions'],
        ['6. Experienced Leadership', 'Avg 22 yrs experience; ex-HCA, ex-Kindred; proven scale and integration capability'],
    ];

    const cols = [0.35, 5.2];
    const rows = [1.05, 2.45, 3.85];
    const bw = 4.6, bh = 1.2;

    for (let i = 0; i < 6; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = cols[col], y = rows[row];
        const [title, body] = boxes[i];

        s.addShape('rect', { x, y, w: bw, h: bh, fill: { color: ALT }, line: { color: MGRAY, pt: 0.5 } });
        s.addShape('rect', { x, y, w: 0.06, h: bh, fill: { color: GOLD }, line: { color: GOLD } });
        s.addText(title, {
            x: x + 0.12, y: y + 0.1, w: bw - 0.2, h: 0.3,
            fontSize: 10, bold: true, color: NAVY, fontFace: 'Calibri',
        });
        s.addText(body, {
            x: x + 0.12, y: y + 0.42, w: bw - 0.2, h: 0.7,
            fontSize: 8.5, color: DGRAY, fontFace: 'Calibri', align: 'left',
        });
    }
}

// ─── Slide 3: Company Snapshot ───────────────────────────────────────────────
function slide03(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Company Snapshot', 'PrimeHealth Partners at a Glance');

    const kpis = [
        ['45', 'Facilities'],
        ['8', 'States'],
        ['$185M', 'FY2024 Revenue'],
        ['$28M', 'FY2024 EBITDA'],
        ['15.1%', 'EBITDA Margin'],
        ['~2,400', 'Employees'],
        ['1.52M', 'Patient Days'],
        ['~$225M', 'Enterprise Value'],
    ];

    const kw = 1.05, kh = 0.95;
    const startX = 0.3;
    const startY = 0.98;
    for (let i = 0; i < 8; i++) {
        const x = startX + i * (kw + 0.08);
        s.addShape('rect', { x, y: startY, w: kw, h: kh, fill: { color: NAVY }, line: { color: NAVY } });
        s.addShape('rect', { x, y: startY + kh - 0.05, w: kw, h: 0.05, fill: { color: GOLD }, line: { color: GOLD } });
        s.addText(kpis[i][0], {
            x, y: startY + 0.1, w: kw, h: 0.5,
            fontSize: 20, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center',
        });
        s.addText(kpis[i][1], {
            x, y: startY + 0.58, w: kw, h: 0.28,
            fontSize: 8, color: GOLD, fontFace: 'Calibri', align: 'center',
        });
    }

    // Timeline bar
    s.addText('Company History', {
        x: 0.35, y: 2.1, w: 3, h: 0.3,
        fontSize: 12, bold: true, color: NAVY, fontFace: 'Calibri',
    });
    const events = [
        ['2011', 'Founded\nBrentwood TN'],
        ['2015', 'Series A\nKY & GA Entry'],
        ['2017', 'ClinicalEdge\nLaunched'],
        ['2020', '5-Star CMS\nCovid Response'],
        ['2022', '$133M Rev\n35 Facilities'],
        ['2024', '$185M Rev\n45 Facilities'],
    ];
    const timelineY = 2.55;
    s.addShape('line', { x: 0.5, y: timelineY + 0.3, w: 9, h: 0, line: { color: NAVY, pt: 2 } });
    for (let i = 0; i < events.length; i++) {
        const x = 0.5 + i * 1.8;
        s.addShape('ellipse', { x: x - 0.1, y: timelineY + 0.2, w: 0.2, h: 0.2, fill: { color: GOLD }, line: { color: GOLD } });
        s.addText(events[i][0], { x: x - 0.5, y: timelineY, w: 1.0, h: 0.22, fontSize: 8, bold: true, color: NAVY, fontFace: 'Calibri', align: 'center' });
        s.addText(events[i][1], { x: x - 0.55, y: timelineY + 0.45, w: 1.1, h: 0.45, fontSize: 7, color: DGRAY, fontFace: 'Calibri', align: 'center' });
    }

    // Payor mix bar
    s.addText('Payor Mix', { x: 0.35, y: 3.3, w: 3, h: 0.3, fontSize: 12, bold: true, color: NAVY, fontFace: 'Calibri' });
    const payors = [['Medicare', 62, NAVY], ['Medicaid', 28, GOLD], ['Commercial', 10, '607D8B']];
    let px = 0.35;
    const barY = 3.7, barH = 0.45, barW = 9.3;
    for (const [label, pct, color] of payors) {
        const w = barW * pct / 100;
        s.addShape('rect', { x: px, y: barY, w, h: barH, fill: { color }, line: { color } });
        if (w > 0.6) {
            s.addText(`${label}\n${pct}%`, { x: px, y: barY, w, h: barH, fontSize: 9, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' });
        }
        px += w;
    }
}

// ─── Slide 4: Care Platform ──────────────────────────────────────────────────
function slide04(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Clinical Platform & Services', 'ClinicalEdge: Proprietary Outcomes Management Technology');

    // Left: service lines
    const services = [
        ['Short-Term Rehab (SNF)', '58% Rev', '45 facilities'],
        ['Long-Term Care', '27% Rev', '45 facilities'],
        ['Memory Care', '9% Rev', '12 facilities'],
        ['Cardiac/Pulm. Rehab', '6% Rev', '8 facilities'],
    ];
    s.addText('Service Lines', { x: 0.35, y: 0.95, w: 4, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' });
    for (let i = 0; i < services.length; i++) {
        const y = 1.3 + i * 0.6;
        s.addShape('rect', { x: 0.35, y, w: 4.0, h: 0.5, fill: { color: i % 2 === 0 ? ALT : WHITE }, line: { color: MGRAY, pt: 0.5 } });
        s.addShape('rect', { x: 0.35, y, w: 0.06, h: 0.5, fill: { color: GOLD }, line: { color: GOLD } });
        s.addText(services[i][0], { x: 0.48, y: y + 0.05, w: 2.2, h: 0.22, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri' });
        s.addText(services[i][1], { x: 2.7, y: y + 0.05, w: 0.8, h: 0.22, fontSize: 8.5, color: GOLD, fontFace: 'Calibri', bold: true });
        s.addText(services[i][2], { x: 0.48, y: y + 0.26, w: 2.5, h: 0.18, fontSize: 7.5, color: DGRAY, fontFace: 'Calibri' });
    }

    // Right: outcomes
    s.addText('ClinicalEdge Outcomes vs. National Avg', { x: 5.1, y: 0.95, w: 4.6, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' });
    const outcomes = [
        ['30-Day Readmission', '12.4%', '17.8%', '-30%'],
        ['CMS 5-Star Facilities', '82%', '21%', '+61 ppts'],
        ['Patient Satisfaction', '4.4/5.0', '3.8/5.0', '+16%'],
        ['Staff Turnover (RN)', '28%', '47%', '-40%'],
        ['MDS Accuracy', '99.1%', '93.4%', '+5.7 ppts'],
    ];
    const hdrs = ['Metric', 'PrimeHealth', 'National Avg', 'Delta'];
    const hdrW = [1.8, 1.0, 1.0, 0.8];
    let ox = 5.1;
    for (let j = 0; j < hdrs.length; j++) {
        s.addShape('rect', { x: ox, y: 1.3, w: hdrW[j], h: 0.3, fill: { color: NAVY }, line: { color: NAVY } });
        s.addText(hdrs[j], { x: ox, y: 1.3, w: hdrW[j], h: 0.3, fontSize: 8, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' });
        ox += hdrW[j];
    }
    for (let i = 0; i < outcomes.length; i++) {
        const ry = 1.63 + i * 0.38;
        const bg = i % 2 === 0 ? WHITE : ALT;
        ox = 5.1;
        for (let j = 0; j < outcomes[i].length; j++) {
            const isGreen = j === 3;
            s.addShape('rect', { x: ox, y: ry, w: hdrW[j], h: 0.35, fill: { color: bg }, line: { color: MGRAY, pt: 0.3 } });
            s.addText(outcomes[i][j], { x: ox, y: ry, w: hdrW[j], h: 0.35, fontSize: 8, color: isGreen ? GREEN : (j === 0 ? DGRAY : NAVY), bold: isGreen || j === 1, fontFace: 'Calibri', align: j === 0 ? 'left' : 'center', valign: 'middle' });
            ox += hdrW[j];
        }
    }

    // Bottom: tech bullet
    s.addShape('rect', { x: 0.35, y: 4.75, w: 9.3, h: 0.55, fill: { color: NAVY }, line: { color: NAVY } });
    s.addText('ClinicalEdge drives readmission risk scoring, automated MDS capture, referral CRM, and staffing optimization — delivering measurable clinical and financial advantages across all 45 facilities', {
        x: 0.5, y: 4.78, w: 9.1, h: 0.5, fontSize: 8.5, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle',
    });
}

// ─── Slide 5: Market Opportunity ────────────────────────────────────────────
function slide05(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Market Opportunity', 'Post-Acute Care: $220B Market Growing at 6.2% CAGR');

    const stats = [
        ['$220B', 'Total U.S. Post-\nAcute Care Market\n(2024)'],
        ['6.2%', 'Projected\nCAGR\n(2024-2030E)'],
        ['$315B', 'Projected\nMarket Size\n(2030E)'],
        ['10,000', 'Baby Boomers\nTurning 65\nEvery Day'],
        ['Only 18%', 'Market Share\nHeld by Top 10\nOperators'],
    ];
    for (let i = 0; i < stats.length; i++) {
        const x = 0.3 + i * 1.9;
        s.addShape('rect', { x, y: 1.0, w: 1.7, h: 1.5, fill: { color: NAVY }, line: { color: NAVY } });
        s.addShape('rect', { x, y: 2.45, w: 1.7, h: 0.05, fill: { color: GOLD }, line: { color: GOLD } });
        s.addText(stats[i][0], { x, y: 1.1, w: 1.7, h: 0.6, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center' });
        s.addText(stats[i][1], { x, y: 1.7, w: 1.7, h: 0.72, fontSize: 8, color: GOLD, fontFace: 'Calibri', align: 'center' });
    }

    s.addText('Key Demand Drivers', { x: 0.35, y: 2.7, w: 9.3, h: 0.3, fontSize: 12, bold: true, color: NAVY, fontFace: 'Calibri' });
    const drivers = [
        ['Aging Population', '65+ cohort grows from 17% to 21% of U.S. population by 2030; post-acute care demand scales directly with age cohort.'],
        ['Hospital Discharge Pressure', 'Value-based care models incent acute-care hospitals to discharge patients earlier to lower-cost SNF settings.'],
        ['Fragmentation Opportunity', 'Top 10 operators hold only 18% market share; thousands of independent facilities represent M&A targets.'],
        ['CON Barriers', 'Certificate-of-Need requirements in 8 of 9 PrimeHealth states limit competitive new entrants.'],
    ];
    for (let i = 0; i < drivers.length; i++) {
        const y = 3.08 + i * 0.42;
        const bg = i % 2 === 0 ? ALT : WHITE;
        s.addShape('rect', { x: 0.35, y, w: 9.3, h: 0.38, fill: { color: bg }, line: { color: MGRAY, pt: 0.3 } });
        s.addShape('rect', { x: 0.35, y, w: 0.06, h: 0.38, fill: { color: GOLD }, line: { color: GOLD } });
        s.addText(drivers[i][0] + ':', { x: 0.47, y: y + 0.05, w: 1.6, h: 0.28, fontSize: 8.5, bold: true, color: NAVY, fontFace: 'Calibri' });
        s.addText(drivers[i][1], { x: 2.1, y: y + 0.05, w: 7.4, h: 0.28, fontSize: 8.5, color: DGRAY, fontFace: 'Calibri' });
    }
}

// ─── Slide 6: Financial Performance ─────────────────────────────────────────
function slide06(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Financial Performance', 'Strong Historical Growth with Expanding Margins (FY2022-FY2024)');

    // Bar chart — Revenue (manual bars)
    s.addText('Net Revenue ($M)', { x: 0.35, y: 0.95, w: 4.5, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' });
    const revData = [['FY2022', 133, '$133M'], ['FY2023', 157, '$157M'], ['FY2024', 185, '$185M']];
    const maxRev = 200;
    const barBaseY = 3.3, chartH = 2.1;
    const barW = 0.9, gap = 0.55, startX = 0.6;
    revData.forEach(([yr, val, lbl], i) => {
        const bh = (val / maxRev) * chartH;
        const bx = startX + i * (barW + gap);
        const by = barBaseY - bh;
        s.addShape('rect', { x: bx, y: by, w: barW, h: bh, fill: { color: NAVY }, line: { color: NAVY } });
        s.addText(lbl, { x: bx, y: by - 0.25, w: barW, h: 0.25, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri', align: 'center' });
        s.addText(yr, { x: bx, y: barBaseY + 0.03, w: barW, h: 0.22, fontSize: 8.5, color: DGRAY, fontFace: 'Calibri', align: 'center' });
    });
    // baseline
    s.addShape('line', { x: startX - 0.1, y: barBaseY, w: 4.0, h: 0, line: { color: MGRAY, pt: 1 } });

    // EBITDA bars
    s.addText('EBITDA ($M) & Margin', { x: 5.1, y: 0.95, w: 4.6, h: 0.28, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' });
    const ebiData = [['FY2022', 18.6, '$18.6M', '14.0%'], ['FY2023', 22.6, '$22.6M', '14.4%'], ['FY2024', 28.0, '$28.0M', '15.1%']];
    const maxEbi = 35;
    const eStartX = 5.3;
    ebiData.forEach(([yr, val, lbl, margin], i) => {
        const bh = (val / maxEbi) * chartH;
        const bx = eStartX + i * (barW + gap);
        const by = barBaseY - bh;
        s.addShape('rect', { x: bx, y: by, w: barW, h: bh, fill: { color: GOLD }, line: { color: GOLD } });
        s.addText(lbl, { x: bx, y: by - 0.46, w: barW, h: 0.22, fontSize: 9, bold: true, color: GOLD, fontFace: 'Calibri', align: 'center' });
        s.addText(margin, { x: bx, y: by - 0.24, w: barW, h: 0.22, fontSize: 8, color: DGRAY, fontFace: 'Calibri', align: 'center' });
        s.addText(yr, { x: bx, y: barBaseY + 0.03, w: barW, h: 0.22, fontSize: 8.5, color: DGRAY, fontFace: 'Calibri', align: 'center' });
    });
    s.addShape('line', { x: eStartX - 0.1, y: barBaseY, w: 4.0, h: 0, line: { color: MGRAY, pt: 1 } });

    // Summary row
    const summRows = [
        ['Revenue CAGR (FY22-FY24)', '17.9%'],
        ['EBITDA CAGR (FY22-FY24)', '22.7%'],
        ['Gross Margin (FY2024)', '38.0%'],
        ['Free Cash Flow (FY2024)', '$14.1M'],
    ];
    let sy = 3.55;
    for (const [lbl, val] of summRows) {
        s.addShape('rect', { x: 0.35, y: sy, w: 9.3, h: 0.35, fill: { color: sy % 0.7 < 0.01 ? ALT : WHITE }, line: { color: MGRAY, pt: 0.3 } });
        s.addText(lbl, { x: 0.45, y: sy + 0.05, w: 5, h: 0.25, fontSize: 9, color: DGRAY, fontFace: 'Calibri' });
        s.addText(val, { x: 5.5, y: sy + 0.05, w: 2, h: 0.25, fontSize: 9, bold: true, color: NAVY, fontFace: 'Calibri', align: 'center' });
        sy += 0.38;
    }
}

// ─── Slide 7: Payor Mix ──────────────────────────────────────────────────────
function slide07(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Payor Mix & Revenue Quality', 'Medicare-Anchored with Premium Per Diem Rates');

    const payorDetails = [
        [NAVY, 'Medicare (Traditional)', '55%', '$610/day', '$570/day', '+7%', 'Stable +3-4%/yr'],
        [GOLD, 'Medicare Advantage', '7%', '$540/day', '$500/day', '+8%', 'Growing +8-10%/yr'],
        ['607D8B', 'Medicaid', '28%', '$240/day', '$235/day', '+2%', 'Stable +1-2%/yr'],
        ['78909C', 'Commercial/Other', '10%', '$420/day', '$390/day', '+8%', 'Stable'],
    ];

    // Visual payor bar
    const payorPct = [55, 7, 28, 10];
    const payorColors = [NAVY, GOLD, '607D8B', '78909C'];
    let bx = 0.35;
    const barY2 = 1.0, barH2 = 0.55, totalW = 9.3;
    for (let i = 0; i < 4; i++) {
        const bw2 = totalW * payorPct[i] / 100;
        s.addShape('rect', { x: bx, y: barY2, w: bw2, h: barH2, fill: { color: payorColors[i] }, line: { color: payorColors[i] } });
        if (bw2 > 0.5) {
            s.addText(`${payorPct[i]}%`, { x: bx, y: barY2, w: bw2, h: barH2, fontSize: 11, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' });
        }
        bx += bw2;
    }

    // Table
    const hdrs = ['Payor', 'Rev Mix', 'PHP Per Diem', 'Natl Avg', 'Premium', 'Growth'];
    const hW = [2.2, 0.7, 1.2, 1.0, 0.9, 1.3];
    let hx = 0.35;
    for (let j = 0; j < hdrs.length; j++) {
        s.addShape('rect', { x: hx, y: 1.72, w: hW[j], h: 0.32, fill: { color: NAVY }, line: { color: NAVY } });
        s.addText(hdrs[j], { x: hx, y: 1.72, w: hW[j], h: 0.32, fontSize: 8.5, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' });
        hx += hW[j];
    }
    for (let i = 0; i < payorDetails.length; i++) {
        const [color, ...cells] = payorDetails[i];
        const ry2 = 2.07 + i * 0.42;
        const bg2 = i % 2 === 0 ? WHITE : ALT;
        let cx2 = 0.35;
        for (let j = 0; j < cells.length; j++) {
            s.addShape('rect', { x: cx2, y: ry2, w: hW[j], h: 0.38, fill: { color: bg2 }, line: { color: MGRAY, pt: 0.3 } });
            if (j === 0) {
                s.addShape('rect', { x: cx2, y: ry2, w: 0.06, h: 0.38, fill: { color }, line: { color } });
            }
            s.addText(cells[j], { x: cx2 + (j === 0 ? 0.1 : 0), y: ry2 + 0.06, w: hW[j] - (j === 0 ? 0.1 : 0), h: 0.28, fontSize: 8.5, color: j === 4 ? GREEN : (j === 0 ? NAVY : DGRAY), bold: j === 0 || j === 4, fontFace: 'Calibri', align: j === 0 ? 'left' : 'center' });
            cx2 += hW[j];
        }
    }

    // Blended rate callout
    s.addShape('rect', { x: 0.35, y: 3.82, w: 9.3, h: 0.5, fill: { color: NAVY }, line: { color: NAVY } });
    s.addText('Blended Average Daily Rate: $435/day  |  VBP Maximum Positive Adjustment Earned Every Year  |  CMS Staffing Compliance Achieved (4.1 hrs vs. 3.48 hr mandate)', {
        x: 0.45, y: 3.85, w: 9.1, h: 0.44, fontSize: 8.5, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle',
    });

    s.addText('Key Risk: CMS reimbursement rate pressure remains the primary regulatory risk. PrimeHealth mitigates via VBP bonus and clinical quality premium positioning.', {
        x: 0.35, y: 4.42, w: 9.3, h: 0.32, fontSize: 8, color: DGRAY, fontFace: 'Calibri-Italic', italic: true, align: 'left',
    });
}

// ─── Slide 8: Growth Projections ─────────────────────────────────────────────
function slide08(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Financial Projections', 'Clear Path to $304M Revenue and 20%+ EBITDA Margin by FY2027E');

    // Projection table
    const proj = [
        ['Metric', 'FY2022A', 'FY2023A', 'FY2024A', 'FY2025E', 'FY2026E', 'FY2027E'],
        ['Revenue ($M)', '$133', '$157', '$185', '$218', '$261', '$304'],
        ['YoY Growth', '—', '17.9%', '18.0%', '17.8%', '19.7%', '16.5%'],
        ['Gross Margin', '38.0%', '38.0%', '38.0%', '39.9%', '41.0%', '43.1%'],
        ['EBITDA ($M)', '$18.6', '$22.6', '$28.0', '$35', '$47', '$61'],
        ['EBITDA Margin', '14.0%', '14.4%', '15.1%', '16.1%', '18.0%', '20.1%'],
        ['Facilities', '35', '40', '45', '52', '62', '72'],
    ];
    const cW = [1.7, 0.9, 0.9, 0.95, 0.95, 0.95, 0.95];
    let tx = 0.35;
    // Header row
    for (let j = 0; j < proj[0].length; j++) {
        const isProj = j >= 4;
        s.addShape('rect', { x: tx, y: 1.05, w: cW[j], h: 0.32, fill: { color: isProj ? GOLD : NAVY }, line: { color: isProj ? GOLD : NAVY } });
        s.addText(proj[0][j], { x: tx, y: 1.05, w: cW[j], h: 0.32, fontSize: 8, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' });
        tx += cW[j];
    }
    for (let i = 1; i < proj.length; i++) {
        const ry3 = 1.4 + (i - 1) * 0.38;
        const bg3 = i % 2 === 1 ? WHITE : ALT;
        const isBold = i === 4 || i === 5;
        tx = 0.35;
        for (let j = 0; j < proj[i].length; j++) {
            const isProj = j >= 4;
            s.addShape('rect', { x: tx, y: ry3, w: cW[j], h: 0.35, fill: { color: isProj ? (i % 2 === 1 ? 'FFF8E1' : 'FFF3CC') : bg3 }, line: { color: MGRAY, pt: 0.3 } });
            s.addText(proj[i][j], { x: tx, y: ry3 + 0.04, w: cW[j], h: 0.27, fontSize: isBold ? 9 : 8.5, bold: isBold, color: isBold ? NAVY : DGRAY, fontFace: 'Calibri', align: j === 0 ? 'left' : 'center' });
            tx += cW[j];
        }
    }

    // Margin expansion bars
    s.addText('Margin Expansion Drivers to 20%+', { x: 0.35, y: 3.72, w: 9.3, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' });
    const levers = [
        ['Staffing Optimization', 120],
        ['Procurement / GPO', 80],
        ['Revenue Cycle Mgmt', 60],
        ['Payor Renegotiation', 70],
        ['Overhead Leverage', 90],
        ['Acquisition Integration', 80],
    ];
    const maxBps = 140;
    const lbW = 2.0, barSX = 2.4, barMaxW = 7.3;
    for (let i = 0; i < levers.length; i++) {
        const ly = 4.1 + i * 0.22;
        if (ly > H - 0.45) break;
        const [lbl, bps] = levers[i];
        const bw3 = (bps / maxBps) * (barMaxW - lbW);
        s.addText(`${lbl} (+${bps} bps)`, { x: 0.35, y: ly, w: lbW, h: 0.2, fontSize: 7.5, color: DGRAY, fontFace: 'Calibri' });
        s.addShape('rect', { x: barSX, y: ly + 0.02, w: bw3, h: 0.15, fill: { color: GOLD }, line: { color: GOLD } });
    }
}

// ─── Slide 9: Roll-Up Strategy ───────────────────────────────────────────────
function slide09(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Roll-Up Strategy', 'Expanding from 45 to 72 Facilities Across 8-10 States by FY2027E');

    // Platform stats
    const pStats = [
        ['45', 'Current\nFacilities'],
        ['72', 'Target\nFacilities\n(FY2027E)'],
        ['14', 'Acquisitions\nCompleted\n(Since 2018)'],
        ['+350 bps', 'Avg EBITDA\nImprovement\nPost-Acq.'],
        ['8', 'Identified\nTargets\n(Pipeline)'],
        ['$45M', 'Pipeline\nRevenue\n(Est.)'],
    ];
    for (let i = 0; i < pStats.length; i++) {
        const x = 0.3 + i * 1.6;
        s.addShape('rect', { x, y: 1.0, w: 1.45, h: 1.15, fill: { color: i < 2 ? GOLD : NAVY }, line: { color: i < 2 ? GOLD : NAVY } });
        s.addText(pStats[i][0], { x, y: 1.05, w: 1.45, h: 0.55, fontSize: 20, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center' });
        s.addText(pStats[i][1], { x, y: 1.58, w: 1.45, h: 0.5, fontSize: 7.5, color: i < 2 ? NAVY : GOLD, fontFace: 'Calibri', align: 'center' });
    }

    // Pipeline table
    s.addText('Active Acquisition Pipeline', { x: 0.35, y: 2.3, w: 9.3, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' });
    const pipe = [
        ['Target', 'State', 'Fac.', 'Est. Rev', 'Stage', 'Close'],
        ['Bluegrass Care Group', 'KY', '3', '$12M', 'LOI Signed', 'Q3 2025E'],
        ['Ohio Valley SNF Portfolio', 'OH', '2', '$8M', 'Diligence', 'Q4 2025E'],
        ['Carolina Post-Acute', 'NC', '1', '$5M', 'Diligence', 'Q4 2025E'],
        ['Virginia Regional SNF', 'VA', '2', '$9M', 'Initial Contact', 'Q1 2026E'],
        ['Tennessee Independent', 'TN', '1', '$4M', 'Initial Contact', 'Q2 2026E'],
        ['Indiana Cluster Add-On', 'IN', '2', '$7M', 'Identified', '2026E'],
    ];
    const pW = [2.4, 0.55, 0.55, 0.85, 1.35, 1.1];
    let ptx = 0.35;
    for (let j = 0; j < pipe[0].length; j++) {
        s.addShape('rect', { x: ptx, y: 2.68, w: pW[j], h: 0.3, fill: { color: NAVY }, line: { color: NAVY } });
        s.addText(pipe[0][j], { x: ptx, y: 2.68, w: pW[j], h: 0.3, fontSize: 8, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' });
        ptx += pW[j];
    }
    for (let i = 1; i < pipe.length; i++) {
        const ry4 = 3.01 + (i - 1) * 0.34;
        const bg4 = i % 2 === 1 ? WHITE : ALT;
        ptx = 0.35;
        for (let j = 0; j < pipe[i].length; j++) {
            s.addShape('rect', { x: ptx, y: ry4, w: pW[j], h: 0.31, fill: { color: bg4 }, line: { color: MGRAY, pt: 0.3 } });
            s.addText(pipe[i][j], { x: ptx + (j === 0 ? 0.06 : 0), y: ry4 + 0.04, w: pW[j], h: 0.23, fontSize: 8, color: j === 4 ? GREEN : DGRAY, bold: j === 4, fontFace: 'Calibri', align: j === 0 ? 'left' : 'center' });
            ptx += pW[j];
        }
    }
    s.addText('Acquisition criteria: Existing markets preferred; 8+ facilities target per state cluster; 6-12x EBITDA entry; 350 bps margin improvement expected within 24 months.', {
        x: 0.35, y: 5.1, w: 9.3, h: 0.22, fontSize: 7.5, color: DGRAY, fontFace: 'Calibri', italic: true,
    });
}

// ─── Slide 10: Management Team ────────────────────────────────────────────────
function slide10(ppt) {
    const s = ppt.addSlide();
    whiteSlide(s);
    addHeader(s, 'Management Team', 'Experienced Leadership with Proven Track Record at Scale');

    const execs = [
        ['Dr. Margaret Collins', 'Chief Executive Officer', '20+ yrs healthcare ops\nEx-HCA Division President (28 facs, 8,500 employees)\nMD, Vanderbilt  |  MBA, Harvard Business School\nCo-founder, 2011'],
        ['Robert Haines', 'Chief Financial Officer', '18 yrs healthcare finance\nEx-VP Finance, Kindred Healthcare\nCPA + CFA Charterholder\n14 M&A transactions | 3 capital raises ($180M+ value)'],
        ['Lisa Nguyen', 'Chief Operating Officer', 'Scaled 2 platforms 2x+\nEx-LifeCare Holdings (12 to 28 facs in 4 yrs)\nLed 9 of 14 PHP acquisitions\nArchitect of regional cluster strategy'],
        ['Dr. David Park', 'Chief Medical Officer', 'Board-certified geriatrician\nFellowship, Johns Hopkins\nEx-Medical Dir., Vanderbilt Univ. Medical Center\n12 peer-reviewed publications on SNF readmission'],
    ];

    const positions = [[0.35, 1.05], [5.1, 1.05], [0.35, 3.2], [5.1, 3.2]];
    const bw4 = 4.45, bh4 = 1.95;

    for (let i = 0; i < execs.length; i++) {
        const [x, y] = positions[i];
        const [name, title, bio] = execs[i];
        s.addShape('rect', { x, y, w: bw4, h: bh4, fill: { color: WHITE }, line: { color: MGRAY, pt: 0.5 } });
        s.addShape('rect', { x, y, w: bw4, h: 0.06, fill: { color: GOLD }, line: { color: GOLD } });
        s.addShape('rect', { x, y, w: 0.06, h: bh4, fill: { color: NAVY }, line: { color: NAVY } });
        s.addText(name, { x: x + 0.14, y: y + 0.1, w: bw4 - 0.18, h: 0.32, fontSize: 12, bold: true, color: NAVY, fontFace: 'Calibri' });
        s.addText(title, { x: x + 0.14, y: y + 0.42, w: bw4 - 0.18, h: 0.24, fontSize: 9.5, color: GOLD, fontFace: 'Calibri', italic: true });
        s.addShape('line', { x: x + 0.14, y: y + 0.68, w: bw4 - 0.3, h: 0, line: { color: MGRAY, pt: 0.5 } });
        s.addText(bio, { x: x + 0.14, y: y + 0.74, w: bw4 - 0.22, h: 1.1, fontSize: 8, color: DGRAY, fontFace: 'Calibri' });
    }
}

// ─── Slide 11: Investment Thesis ─────────────────────────────────────────────
function slide11(ppt) {
    const s = ppt.addSlide();
    navySlide(s);
    addNavyHeader(s, 'Investment Thesis', 'Four Pillars of Value Creation');

    const pillars = [
        ['01\nScale', 'Regional density strategy creates referral network advantages and operational leverage. Growing from 45 to 72 facilities drives corporate overhead leverage across a larger revenue base.'],
        ['02\nOutcomes', 'ClinicalEdge platform delivers measurable, defensible clinical advantages: 30% lower readmissions, 82% 5-star facilities. Clinical quality = premium reimbursement + referral volume growth.'],
        ['03\nRoll-Up', '$220B fragmented market. Top 10 hold only 18% share. 14 acquisitions completed with 350 bps EBITDA improvement track record. 8-target pipeline immediately actionable.'],
        ['04\nDemographics', '10,000 Boomers turn 65 daily. $220B market growing at 6.2% CAGR. Post-acute demand structurally driven by age, not economic cycles. CON barriers protect incumbents.'],
    ];

    const pillarX = [0.3, 5.1, 0.3, 5.1];
    const pillarY = [1.05, 1.05, 3.3, 3.3];
    const bw5 = 4.45, bh5 = 2.0;

    for (let i = 0; i < pillars.length; i++) {
        const x = pillarX[i], y = pillarY[i];
        s.addShape('rect', { x, y, w: bw5, h: bh5, fill: { color: '0D2238' }, line: { color: GOLD, pt: 0.5 } });
        s.addShape('rect', { x, y, w: bw5, h: 0.06, fill: { color: GOLD }, line: { color: GOLD } });
        s.addText(pillars[i][0], { x: x + 0.15, y: y + 0.1, w: 1.2, h: 0.8, fontSize: 22, bold: true, color: GOLD, fontFace: 'Calibri', align: 'center' });
        s.addText(pillars[i][1], { x: x + 1.4, y: y + 0.12, w: bw5 - 1.55, h: 1.7, fontSize: 9, color: WHITE, fontFace: 'Calibri', align: 'left' });
        s.addShape('line', { x: x + 1.3, y: y + 0.15, w: 0, h: bh5 - 0.3, line: { color: GOLD, pt: 0.5 } });
    }
}

// ─── Slide 12: Transaction Summary ───────────────────────────────────────────
function slide12(ppt) {
    const s = ppt.addSlide();
    navySlide(s);
    addNavyHeader(s, 'Transaction Summary', 'Project Pinnacle — Platform Buyout');

    // Deal box
    s.addShape('rect', { x: 0.35, y: 1.05, w: 9.3, h: 0.38, fill: { color: GOLD }, line: { color: GOLD } });
    s.addText('ENTERPRISE VALUE: ~$225 MILLION  |  1.2x FY2024 REVENUE  |  8.0x FY2024 EBITDA', {
        x: 0.35, y: 1.05, w: 9.3, h: 0.38, fontSize: 13, bold: true, color: NAVY, fontFace: 'Calibri', align: 'center', valign: 'middle',
    });

    // Four boxes
    const boxes2 = [
        ['Deal Structure', 'Platform buyout — 100% control\nEquity: ~$90-100M (40-45% TEV)\nDebt: ~$115-125M (4.0-4.5x EBITDA)\nMgmt rollover: 10-15%'],
        ['Use of Proceeds', 'Seller liquidity\nDebt paydown at close\nM&A acquisition reserve ($30M)\nOrganic capex program ($15M)'],
        ['Return Profile (Base)', 'FY2027E exit at 10x EBITDA\nExit EV: ~$610M\nEquity value: ~$350M\nIRR: 38-42%  |  MoM: 3.5-4.0x'],
        ['Process Timeline', 'CIM: April 2026\nMgmt presentations: May 2026\nFirst bids: May 30, 2026\nFinal bids: July 15, 2026\nClose: Q4 2026'],
    ];
    const bx2 = [0.35, 5.1, 0.35, 5.1];
    const by2 = [1.58, 1.58, 3.6, 3.6];
    const bw6 = 4.45, bh6 = 1.82;
    for (let i = 0; i < boxes2.length; i++) {
        const x = bx2[i], y = by2[i];
        s.addShape('rect', { x, y, w: bw6, h: bh6, fill: { color: '0D2238' }, line: { color: GOLD, pt: 0.5 } });
        s.addText(boxes2[i][0], { x: x + 0.12, y: y + 0.1, w: bw6 - 0.24, h: 0.3, fontSize: 10, bold: true, color: GOLD, fontFace: 'Calibri' });
        s.addShape('line', { x: x + 0.12, y: y + 0.43, w: bw6 - 0.24, h: 0, line: { color: GOLD, pt: 0.5 } });
        s.addText(boxes2[i][1], { x: x + 0.12, y: y + 0.5, w: bw6 - 0.24, h: 1.2, fontSize: 9, color: WHITE, fontFace: 'Calibri' });
    }
    s.addText('Advisor: Evercore Healthcare Advisory Group  |  Legal: Ropes & Gray LLP  |  Contact: projectpinnacle@evercore.com', {
        x: 0.35, y: H - 0.55, w: 9.3, h: 0.22, fontSize: 7.5, color: GOLD, fontFace: 'Calibri', align: 'center',
    });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const ppt = new pptxgen();
    ppt.layout = 'LAYOUT_WIDE';
    ppt.title = 'PrimeHealth Partners — Investor Presentation';
    ppt.subject = 'Project Pinnacle — Platform Buyout';
    ppt.author = 'Evercore Healthcare Advisory Group';

    slide01(ppt);
    slide02(ppt);
    slide03(ppt);
    slide04(ppt);
    slide05(ppt);
    slide06(ppt);
    slide07(ppt);
    slide08(ppt);
    slide09(ppt);
    slide10(ppt);
    slide11(ppt);
    slide12(ppt);

    await ppt.writeFile({ fileName: OUTPUT });
    console.log('Done:', OUTPUT);
}

main().catch(e => { console.error(e); process.exit(1); });
