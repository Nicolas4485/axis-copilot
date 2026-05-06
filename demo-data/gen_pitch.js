/**
 * Generate pitch deck PPTX for Vertex Specialty Chemicals
 * Project Apex — Carve-out from GlobalChem Industries
 */
'use strict';

const PptxGenJSModule = require('/sessions/gracious-affectionate-dirac/node_modules/pptxgenjs');
const pptxgen = PptxGenJSModule.default ?? PptxGenJSModule;
const fs = require('fs');

const OUTPUT = '/sessions/gracious-affectionate-dirac/mnt/axis-copilot/demo-data/pitch-vertex-chemicals.pptx';

// ─── Palette ────────────────────────────────────────────────────────────────
const NAVY   = '0D2137';
const GOLD   = 'C8A84B';
const WHITE  = 'FFFFFF';
const LGRAY  = 'F2F5F8';
const MGRAY  = 'CCCCCC';
const DGRAY  = '444444';
const LGOLD  = 'E8D49A';

// ─── Layout helpers ──────────────────────────────────────────────────────────

function contentSlide(prs, title, subtitle) {
  const slide = prs.addSlide();
  slide.background = { color: WHITE };
  // Navy header bar
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 0.82, fill: { color: NAVY }, line: { type: 'none' }
  });
  // Gold accent line
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0.82, w: 10, h: 0.04, fill: { color: GOLD }, line: { type: 'none' }
  });
  // Navy footer
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 7.0, w: 10, h: 0.5, fill: { color: NAVY }, line: { type: 'none' }
  });
  slide.addText('VERTEX SPECIALTY CHEMICALS  |  PROJECT APEX  |  CONFIDENTIAL', {
    x: 0.2, y: 7.07, w: 9.6, h: 0.32,
    fontSize: 7, color: MGRAY, align: 'center',
  });
  if (title) {
    slide.addText(title, {
      x: 0.35, y: 0.1, w: 9.3, h: 0.5,
      fontSize: 15, bold: true, color: WHITE, valign: 'middle',
    });
  }
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.35, y: 0.62, w: 9.3, h: 0.22,
      fontSize: 8, color: LGOLD, italic: true,
    });
  }
  return slide;
}

// ─── Slide 1: Cover ──────────────────────────────────────────────────────────

function slide01_cover(prs) {
  const slide = prs.addSlide();
  slide.background = { color: NAVY };

  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 6.9, w: 10, h: 0.1, fill: { color: GOLD }, line: { type: 'none' }
  });
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 0.36, fill: { color: GOLD }, line: { type: 'none' }
  });
  slide.addText('STRICTLY CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY', {
    x: 0, y: 0.04, w: 10, h: 0.28, fontSize: 9, bold: true, color: NAVY, align: 'center',
  });
  slide.addText('PROJECT APEX', {
    x: 1, y: 1.05, w: 8, h: 0.48, fontSize: 13, bold: true, color: GOLD,
    align: 'center', charSpacing: 4,
  });
  slide.addText('VERTEX SPECIALTY CHEMICALS', {
    x: 0.5, y: 1.5, w: 9, h: 1.05, fontSize: 33, bold: true, color: WHITE, align: 'center',
  });
  slide.addShape(prs.ShapeType.rect, {
    x: 3, y: 2.65, w: 4, h: 0.05, fill: { color: GOLD }, line: { type: 'none' }
  });
  slide.addText('INVESTOR PRESENTATION', {
    x: 1, y: 2.77, w: 8, h: 0.38, fontSize: 13, bold: true, color: LGOLD,
    align: 'center', charSpacing: 2,
  });
  slide.addText('Carve-out from GlobalChem Industries', {
    x: 1, y: 3.2, w: 8, h: 0.32, fontSize: 11.5, color: WHITE, align: 'center',
  });

  const stats = [
    ['~$512M', 'Enterprise Value'],
    ['$320M', 'FY2024 Revenue'],
    ['20.0%', 'EBITDA Margin'],
    ['8.0x', 'EV / EBITDA'],
  ];
  stats.forEach((s, i) => {
    const bx = 0.5 + i * 2.25;
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: 3.82, w: 2.1, h: 0.88,
      fill: { color: '162E47' }, line: { color: GOLD, width: 1 }
    });
    slide.addText(s[0], { x: bx, y: 3.87, w: 2.1, h: 0.44, fontSize: 20, bold: true, color: GOLD, align: 'center' });
    slide.addText(s[1], { x: bx, y: 4.3, w: 2.1, h: 0.3, fontSize: 8, color: WHITE, align: 'center' });
  });

  slide.addText('Houston, TX  |  Founded 1995  |  1,850 Employees  |  3 Manufacturing Plants', {
    x: 0.5, y: 4.9, w: 9, h: 0.28, fontSize: 9, color: 'A0B4C8', align: 'center',
  });
  slide.addText('47 Proprietary Formulations  |  18 Active Patents  |  Aerospace/Defense Qualified', {
    x: 0.5, y: 5.2, w: 9, h: 0.28, fontSize: 9, color: 'A0B4C8', align: 'center',
  });
  slide.addText('April 2025', {
    x: 0.5, y: 5.62, w: 9, h: 0.26, fontSize: 9, color: GOLD, align: 'center', italic: true,
  });
}

// ─── Slide 2: Investment Highlights ──────────────────────────────────────────

function slide02_highlights(prs) {
  const slide = contentSlide(prs, 'Investment Highlights', 'Six compelling pillars supporting the Project Apex investment thesis');

  const boxes = [
    { title: '1. Carve-out Value Unlock', lines: [
      '$10.5M+ overhead eliminated at separation',
      'Contract repricing of below-market accounts',
      '590bps EBITDA margin expansion to FY2027',
    ]},
    { title: '2. Defensible Market Position', lines: [
      '47 proprietary formulations; 18 active patents',
      'Aerospace qualification = 2-4yr entry barrier',
      'Specified by name in 14 OEM material specs',
    ]},
    { title: '3. High-Growth End Markets', lines: [
      'Automotive lightweighting (EV): 8-10% CAGR',
      'Aerospace composites: 9-11% CAGR',
      'Advanced electronics (5G): 7-9% CAGR',
    ]},
    { title: '4. Proven Management Team', lines: [
      'CEO: ex-BASF North America President, 30yrs',
      'CFO: led 4 prior carve-outs at LyondellBasell',
      'CRO: MIT PhD; inventor on 12 of 18 patents',
    ]},
    { title: '5. Consistent FCF Generation', lines: [
      'FCF positive every year since 2008',
      'FY2024 FCF: $48.8M (15.3% FCF margin)',
      'FY2027E FCF: $88M — strong deleveraging',
    ]},
    { title: '6. Regulatory Tailwinds', lines: [
      'EU REACH PFAS ban drives specialty coatings',
      'U.S. EPA TSCA reform accelerates specialty shift',
      'DoD domestic materials initiative supports Vertex',
    ]},
  ];

  const cols = 3;
  const bw = 3.08, bh = 2.7;
  boxes.forEach((b, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = 0.13 + col * (bw + 0.1);
    const by = 1.0 + row * (bh + 0.1);

    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: bh,
      fill: { color: LGRAY }, line: { color: MGRAY, width: 0.5 }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: 0.06,
      fill: { color: GOLD }, line: { type: 'none' }
    });
    slide.addText(b.title, {
      x: bx + 0.1, y: by + 0.1, w: bw - 0.2, h: 0.38,
      fontSize: 9.5, bold: true, color: NAVY,
    });
    const bulletLines = b.lines.map((l, li) => ({
      text: l,
      options: { bullet: true, color: DGRAY, fontSize: 8.5, breakLine: li < b.lines.length - 1 }
    }));
    slide.addText(bulletLines, { x: bx + 0.1, y: by + 0.52, w: bw - 0.2, h: bh - 0.65 });
  });
}

// ─── Slide 3: Company Snapshot ────────────────────────────────────────────────

function slide03_snapshot(prs) {
  const slide = contentSlide(prs, 'Company Snapshot', 'Vertex Specialty Chemicals at a glance');

  const facts = [
    ['Founded', '1995, Houston TX'],
    ['Employees', '1,850 FTE'],
    ['Plants', '3 owned facilities (TX, LA, TX)'],
    ['Capacity', '485,000 sq ft total'],
    ['Products', '3 lines; 47 proprietary formulations'],
    ['Patents', '18 active; 6 pending'],
    ['Certifications', 'ISO 9001, AS9100D, NADCAP, IATF'],
    ['Customers', '~340 globally; long-term relationships'],
    ['Parent (current)', 'GlobalChem Industries (divesting)'],
  ];

  slide.addText('Company Profile', {
    x: 0.3, y: 0.95, w: 4.2, h: 0.28,
    fontSize: 10, bold: true, color: NAVY, underline: true,
  });

  facts.forEach((f, i) => {
    const fy = 1.26 + i * 0.415;
    const bg = i % 2 === 0 ? LGRAY : WHITE;
    slide.addShape(prs.ShapeType.rect, {
      x: 0.3, y: fy, w: 4.2, h: 0.38,
      fill: { color: bg }, line: { color: MGRAY, width: 0.3 }
    });
    slide.addText(f[0], { x: 0.4, y: fy + 0.05, w: 1.3, h: 0.28, fontSize: 8, bold: true, color: NAVY });
    slide.addText(f[1], { x: 1.75, y: fy + 0.05, w: 2.65, h: 0.28, fontSize: 8, color: DGRAY });
  });

  slide.addText('Financial Summary', {
    x: 5.0, y: 0.95, w: 4.7, h: 0.28,
    fontSize: 10, bold: true, color: NAVY, underline: true,
  });

  const finRows = [
    ['Metric', 'FY2022', 'FY2023', 'FY2024'],
    ['Revenue ($M)', '$274', '$296', '$320'],
    ['Gross Margin', '41.0%', '41.3%', '42.0%'],
    ['EBITDA ($M)', '$50.6', '$57.4', '$64.0'],
    ['EBITDA Margin', '18.5%', '19.4%', '20.0%'],
    ['FCF ($M)', '$38.5', '$43.6', '$48.8'],
  ];

  finRows.forEach((r, ri) => {
    const fy = 1.26 + ri * 0.47;
    const isHdr = ri === 0;
    const bg = isHdr ? NAVY : (ri % 2 === 0 ? LGRAY : WHITE);
    slide.addShape(prs.ShapeType.rect, {
      x: 5.0, y: fy, w: 4.7, h: 0.43,
      fill: { color: bg }, line: { color: MGRAY, width: 0.3 }
    });
    const colW = [1.6, 1.0, 1.0, 1.0];
    const offsets = [0, 1.6, 2.6, 3.6];
    r.forEach((cell, ci) => {
      slide.addText(cell, {
        x: 5.1 + offsets[ci], y: fy + 0.07, w: colW[ci] - 0.1, h: 0.29,
        fontSize: 8, bold: isHdr || ci === 0,
        color: isHdr ? WHITE : (ci === 0 ? NAVY : DGRAY),
        align: ci === 0 ? 'left' : 'center',
      });
    });
  });

  slide.addShape(prs.ShapeType.rect, {
    x: 5.0, y: 4.24, w: 4.7, h: 1.05,
    fill: { color: '162E47' }, line: { color: GOLD, width: 1 }
  });
  slide.addText([
    { text: 'Transaction\n', options: { bold: true, color: GOLD, fontSize: 9 } },
    { text: 'Enterprise Value: ~$512M  |  1.6x Revenue, 8.0x EBITDA\n', options: { color: WHITE, fontSize: 8 } },
    { text: 'Structure: Negotiated carve-out from GlobalChem Industries\n', options: { color: WHITE, fontSize: 8 } },
    { text: 'Expected Close: Q2 2025  |  Advisor: Goldman Sachs', options: { color: WHITE, fontSize: 8 } },
  ], { x: 5.1, y: 4.3, w: 4.5, h: 0.92, valign: 'top' });
}

// ─── Slide 4: Products & Technology ──────────────────────────────────────────

function slide04_products(prs) {
  const slide = contentSlide(prs, 'Products & Technology', '3 high-margin specialty product lines | 47 formulations | 18 patents');

  const products = [
    {
      name: 'Advanced Polymer Additives', rev: '$144M  |  45% of Revenue',
      margin: 'Gross Margin: 47%', color: NAVY,
      desc: 'Heat stabilizers, UV absorbers, antioxidants, processing aids. 21 proprietary additive packages.',
      markets: 'Automotive, Aerospace, Industrial',
      ip: '7 patents (VX-Series heat stabilizers, AeroShield UV line)',
    },
    {
      name: 'Specialty Coatings', rev: '$112M  |  35% of Revenue',
      margin: 'Gross Margin: 40%', color: '1A3A55',
      desc: 'Extreme-environment topcoats: aerospace, automotive corrosion protection, electronics conformal.',
      markets: 'Automotive, Aerospace, Electronics',
      ip: '8 patents (CoatPro industrial, AeroGuard aerospace)',
    },
    {
      name: 'Performance Resins', rev: '$64M  |  20% of Revenue',
      margin: 'Gross Margin: 36%', color: '1A5276',
      desc: 'PCB laminates, electronic encapsulants, industrial adhesives. Highest customer switching costs.',
      markets: 'Electronics, Industrial',
      ip: '3 patents (VertexBond epoxy system)',
    },
  ];

  products.forEach((p, i) => {
    const bx = 0.15 + i * 3.28;
    const by = 0.95;
    const bw = 3.1, bh = 4.65;

    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: bh,
      fill: { color: LGRAY }, line: { color: MGRAY, width: 0.5 }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: 0.07,
      fill: { color: GOLD }, line: { type: 'none' }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by + 0.07, w: bw, h: 0.7,
      fill: { color: p.color }, line: { type: 'none' }
    });
    slide.addText(p.name, {
      x: bx + 0.1, y: by + 0.1, w: bw - 0.2, h: 0.35,
      fontSize: 9.5, bold: true, color: WHITE, valign: 'top',
    });
    slide.addText(p.rev, {
      x: bx + 0.1, y: by + 0.44, w: bw - 0.2, h: 0.25,
      fontSize: 8, color: LGOLD,
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx + 0.1, y: by + 0.86, w: bw - 0.2, h: 0.28,
      fill: { color: LGOLD }, line: { type: 'none' }
    });
    slide.addText(p.margin, {
      x: bx + 0.1, y: by + 0.86, w: bw - 0.2, h: 0.28,
      fontSize: 9, bold: true, color: NAVY, align: 'center', valign: 'middle',
    });
    slide.addText([
      { text: 'Description\n', options: { bold: true, color: NAVY, fontSize: 8.5 } },
      { text: p.desc + '\n\n', options: { color: DGRAY, fontSize: 8 } },
      { text: 'End Markets\n', options: { bold: true, color: NAVY, fontSize: 8.5 } },
      { text: p.markets + '\n\n', options: { color: DGRAY, fontSize: 8 } },
      { text: 'Key IP\n', options: { bold: true, color: NAVY, fontSize: 8.5 } },
      { text: p.ip, options: { color: DGRAY, fontSize: 8 } },
    ], { x: bx + 0.12, y: by + 1.22, w: bw - 0.24, h: 3.25, valign: 'top' });
  });

  slide.addShape(prs.ShapeType.rect, {
    x: 0.15, y: 5.73, w: 9.7, h: 0.95,
    fill: { color: '162E47' }, line: { color: GOLD, width: 0.8 }
  });
  slide.addText([
    { text: 'R&D Pipeline & IP:  ', options: { bold: true, color: GOLD, fontSize: 9.5 } },
    { text: '$11.2M R&D investment (3.5% of revenue)  |  6 active pipeline projects with $48-74M revenue potential  |  ', options: { color: WHITE, fontSize: 8.5 } },
    { text: 'Post-carve-out target: 4.5% of revenue in R&D', options: { color: LGOLD, fontSize: 8.5, italic: true } },
  ], { x: 0.35, y: 5.8, w: 9.3, h: 0.8, valign: 'middle' });
}

// ─── Slide 5: End Markets ─────────────────────────────────────────────────────

function slide05_end_markets(prs) {
  const slide = contentSlide(prs, 'End Markets', 'Diversified exposure to four high-growth end markets');

  const markets = [
    {
      name: 'Automotive', pct: '30% of Revenue', rev: '$96M', cagr: '8-10% CAGR',
      desc: 'EV lightweighting demands 3-5x more specialty chemical content per vehicle vs. ICE. Battery encapsulants, structural adhesives, advanced coatings.',
      driver: 'EV adoption, lightweighting mandates, OEM spec lock-in',
    },
    {
      name: 'Aerospace', pct: '25% of Revenue', rev: '$80M', cagr: '9-11% CAGR',
      desc: 'Next-gen composite airframes, satellite platforms, defense. Vertex holds AS9100D/NADCAP qualification across all major aerospace primes.',
      driver: 'Composite airframe growth, space programs, DoD investment',
    },
    {
      name: 'Electronics', pct: '22% of Revenue', rev: '$70.4M', cagr: '7-9% CAGR',
      desc: '5G infrastructure PCB laminates, advanced chip packaging encapsulants, flexible electronics substrates. Highest switching costs in portfolio.',
      driver: '5G rollout, AI chip packaging, advanced semiconductor materials',
    },
    {
      name: 'Industrial', pct: '23% of Revenue', rev: '$73.6M', cagr: '4-6% CAGR',
      desc: 'Infrastructure coatings, energy transition equipment (wind, hydrogen), heavy industrial maintenance. Broadest customer base.',
      driver: 'Energy transition, infrastructure spending, PFAS substitution',
    },
  ];

  markets.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = 0.15 + col * 4.9;
    const by = 0.95 + row * 3.02;
    const bw = 4.72, bh = 2.88;

    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: bh,
      fill: { color: LGRAY }, line: { color: MGRAY, width: 0.5 }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: 0.07, h: bh,
      fill: { color: GOLD }, line: { type: 'none' }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: 0.68,
      fill: { color: NAVY }, line: { type: 'none' }
    });
    slide.addText(m.name, {
      x: bx + 0.15, y: by + 0.05, w: 2.6, h: 0.36, fontSize: 13, bold: true, color: WHITE,
    });
    slide.addText(m.pct, {
      x: bx + 0.15, y: by + 0.38, w: 2.5, h: 0.24, fontSize: 8.5, color: LGOLD,
    });
    slide.addText(m.rev, {
      x: bx + 3.3, y: by + 0.04, w: 1.35, h: 0.36, fontSize: 18, bold: true, color: GOLD, align: 'center',
    });
    slide.addText(m.cagr, {
      x: bx + 3.3, y: by + 0.4, w: 1.35, h: 0.22, fontSize: 8, color: WHITE, align: 'center',
    });
    slide.addText(m.desc, {
      x: bx + 0.15, y: by + 0.76, w: bw - 0.25, h: 1.1,
      fontSize: 8.5, color: DGRAY, valign: 'top',
    });
    slide.addText([
      { text: 'Key Driver: ', options: { bold: true, color: NAVY, fontSize: 8 } },
      { text: m.driver, options: { color: DGRAY, fontSize: 8, italic: true } },
    ], { x: bx + 0.15, y: by + 1.92, w: bw - 0.25, h: 0.5 });
  });
}

// ─── Slide 6: Market Opportunity ─────────────────────────────────────────────

function slide06_market(prs) {
  const slide = contentSlide(prs, 'Market Opportunity', 'Global specialty chemicals: $750B market with structural tailwinds across all three Vertex segments');

  slide.addText("Vertex's Addressable Market Segments", {
    x: 0.3, y: 0.97, w: 5.7, h: 0.28, fontSize: 10, bold: true, color: NAVY,
  });

  const segs = [
    ['Segment', 'Market Size', 'CAGR (2024-30)', 'Vertex Share'],
    ['Polymer Additives', '$38B', '6.2%', '~0.38%'],
    ['Specialty Coatings', '$29B', '5.8%', '~0.39%'],
    ['Performance Resins', '$22B', '7.1%', '~0.29%'],
    ['Total Addressable', '$89B', '6.2%', '~0.36%'],
  ];

  segs.forEach((r, ri) => {
    const ry = 1.28 + ri * 0.52;
    const isHdr = ri === 0;
    const isTot = ri === segs.length - 1;
    const bg = isHdr ? NAVY : (isTot ? LGOLD : (ri % 2 === 0 ? WHITE : LGRAY));
    slide.addShape(prs.ShapeType.rect, {
      x: 0.3, y: ry, w: 5.7, h: 0.48,
      fill: { color: bg }, line: { color: MGRAY, width: 0.3 }
    });
    const colW = [2.1, 1.2, 1.3, 1.0];
    const offsets = [0, 2.1, 3.3, 4.6];
    r.forEach((cell, ci) => {
      slide.addText(cell, {
        x: 0.4 + offsets[ci], y: ry + 0.09, w: colW[ci], h: 0.3,
        fontSize: 8.5, bold: isHdr || isTot || ci === 0,
        color: isHdr ? WHITE : (isTot ? NAVY : (ci === 0 ? NAVY : DGRAY)),
        align: ci === 0 ? 'left' : 'center',
      });
    });
  });

  slide.addText('Growth Catalysts', {
    x: 6.3, y: 0.97, w: 3.4, h: 0.28, fontSize: 10, bold: true, color: NAVY,
  });

  const catalysts = [
    ['EV & Lightweighting', 'EU 2035 ICE ban + U.S. IRA driving 8-10% p.a. specialty content growth in automotive'],
    ['Aerospace Composites', 'Next-gen airframes 50%+ composite; Vertex qualified across Boeing, Airbus primes'],
    ['5G & Advanced Chips', 'AI/HPC packaging materials growing 15%+ annually; Vertex PCB laminates positioned'],
    ['PFAS Regulation', 'EU REACH ban creating $12-15B demand shift to fluorine-free specialty alternatives'],
    ['DoD Supply Chain', 'Defense industrial base initiative creates preference for domestic aero-qualified suppliers'],
  ];

  catalysts.forEach((c, i) => {
    const cy = 1.28 + i * 0.89;
    slide.addShape(prs.ShapeType.rect, {
      x: 6.2, y: cy, w: 3.5, h: 0.82,
      fill: { color: LGRAY }, line: { color: MGRAY, width: 0.3 }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: 6.2, y: cy, w: 0.05, h: 0.82,
      fill: { color: GOLD }, line: { type: 'none' }
    });
    slide.addText([
      { text: c[0] + '\n', options: { bold: true, color: NAVY, fontSize: 8.5 } },
      { text: c[1], options: { color: DGRAY, fontSize: 7.5 } },
    ], { x: 6.32, y: cy + 0.06, w: 3.28, h: 0.7 });
  });
}

// ─── Slide 7: Financial Performance ──────────────────────────────────────────

function slide07_financials(prs) {
  const slide = contentSlide(prs, 'Financial Performance', 'Consistent growth | Expanding margins | Strong free cash flow generation');

  slide.addText('Historical Results (FY2022-FY2024)', {
    x: 0.3, y: 0.97, w: 5.5, h: 0.26, fontSize: 10, bold: true, color: NAVY,
  });

  const hist = [
    ['Metric', 'FY2022', 'FY2023', 'FY2024', 'CAGR'],
    ['Revenue ($M)', '$274.0', '$296.0', '$320.0', '8.0%'],
    ['Gross Margin', '41.0%', '41.3%', '42.0%', '+100bps'],
    ['EBITDA ($M)', '$50.6', '$57.4', '$64.0', '12.5%'],
    ['EBITDA Margin', '18.5%', '19.4%', '20.0%', '+150bps'],
    ['CapEx ($M)', '$12.1', '$13.8', '$15.2', '--'],
    ['FCF ($M)', '$38.5', '$43.6', '$48.8', '12.6%'],
  ];

  hist.forEach((r, ri) => {
    const ry = 1.25 + ri * 0.47;
    const isHdr = ri === 0;
    const hiRows = [3, 4, 6];
    const isHi = hiRows.includes(ri);
    const bg = isHdr ? NAVY : (isHi ? '162E47' : (ri % 2 === 0 ? WHITE : LGRAY));
    slide.addShape(prs.ShapeType.rect, {
      x: 0.3, y: ry, w: 5.6, h: 0.43,
      fill: { color: bg }, line: { color: MGRAY, width: 0.3 }
    });
    const colW = [1.7, 0.88, 0.88, 0.88, 1.0];
    const offsets = [0, 1.7, 2.58, 3.46, 4.34];
    r.forEach((cell, ci) => {
      const color = isHdr ? WHITE :
        (isHi ? (ci === 4 ? GOLD : WHITE) : (ci === 0 ? NAVY : DGRAY));
      slide.addText(cell, {
        x: 0.4 + offsets[ci], y: ry + 0.07, w: colW[ci], h: 0.29,
        fontSize: 8, bold: isHdr || ci === 0 || isHi,
        color, align: ci === 0 ? 'left' : 'center',
      });
    });
  });

  slide.addText('Normalized EBITDA Bridge (FY2024)', {
    x: 6.1, y: 0.97, w: 3.6, h: 0.26, fontSize: 10, bold: true, color: NAVY,
  });

  const bridge = [
    ['Reported EBITDA', '$64.0M'],
    ['+ Corporate overhead', '+$10.5M'],
    ['+ Shared services premium', '+$2.1M'],
    ['+ Non-recurring items', '+$1.4M'],
    ['- Standalone costs', '-$3.8M'],
    ['- Commercial adjustments', '-$1.2M'],
    ['Normalized EBITDA', '$73.0M'],
    ['Normalized Margin', '22.8%'],
  ];

  bridge.forEach((r, ri) => {
    const ry = 1.25 + ri * 0.47;
    const isTot = ri >= 6;
    const bg = isTot ? LGOLD : (ri % 2 === 0 ? WHITE : LGRAY);
    slide.addShape(prs.ShapeType.rect, {
      x: 6.1, y: ry, w: 3.6, h: 0.43,
      fill: { color: bg }, line: { color: MGRAY, width: 0.3 }
    });
    slide.addText(r[0], { x: 6.2, y: ry + 0.07, w: 2.2, h: 0.29, fontSize: 8, bold: isTot, color: isTot ? NAVY : DGRAY });
    slide.addText(r[1], { x: 8.3, y: ry + 0.07, w: 1.3, h: 0.29, fontSize: 8, bold: true, color: isTot ? NAVY : DGRAY, align: 'center' });
  });

  slide.addShape(prs.ShapeType.rect, {
    x: 0.3, y: 5.6, w: 9.4, h: 1.0,
    fill: { color: '162E47' }, line: { color: GOLD, width: 0.8 }
  });
  slide.addText([
    { text: 'Valuation Context:  ', options: { bold: true, color: GOLD, fontSize: 9.5 } },
    { text: 'At ~$512M EV, transaction implies 8.0x FY2024 EBITDA vs. specialty chemicals peers at 10-13x. ', options: { color: WHITE, fontSize: 8.5 } },
    { text: 'Carve-out discount + $73M normalized EBITDA represents significant upside on execution.', options: { color: LGOLD, fontSize: 8.5, italic: true } },
  ], { x: 0.5, y: 5.67, w: 9.0, h: 0.86, valign: 'middle' });
}

// ─── Slide 8: Carve-out Value Creation ───────────────────────────────────────

function slide08_carveout(prs) {
  const slide = contentSlide(prs, 'Carve-out Value Creation', 'Four quantifiable levers driving 590bps EBITDA margin expansion from 20.0% to 25.9% by FY2027');

  const levers = [
    { label: 'FY2024\nReported', value: '20.0%', color: NAVY },
    { label: 'Overhead\nRemoval', value: '+1.8%', color: '1A5276' },
    { label: 'Contract\nRepricing', value: '+1.4%', color: '1A5276' },
    { label: 'Lean Mfg\nCOGS', value: '+1.2%', color: '1A5276' },
    { label: 'Product\nMix Shift', value: '+1.5%', color: '1A5276' },
    { label: 'FY2027E\nTarget', value: '25.9%', color: GOLD },
  ];

  const boxW = 1.42, boxH = 1.55, startX = 0.3;
  levers.forEach((lv, i) => {
    const bx = startX + i * (boxW + 0.18);
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: 1.0, w: boxW, h: boxH,
      fill: { color: lv.color }, line: { type: 'none' }
    });
    slide.addText(lv.value, {
      x: bx, y: 1.1, w: boxW, h: 0.55, fontSize: 16, bold: true,
      color: lv.color === GOLD ? NAVY : WHITE, align: 'center',
    });
    slide.addText(lv.label, {
      x: bx, y: 1.72, w: boxW, h: 0.45, fontSize: 8,
      color: lv.color === GOLD ? NAVY : WHITE, align: 'center',
    });
    if (i < levers.length - 1) {
      slide.addText('>', {
        x: bx + boxW + 0.01, y: 1.5, w: 0.18, h: 0.32,
        fontSize: 14, bold: true, color: GOLD, align: 'center',
      });
    }
  });

  const details = [
    {
      title: '1. Corporate Overhead Removal (+1.8%)',
      desc: 'GlobalChem allocates ~$10.5M/yr in corporate overhead. Separation eliminates this drag. Net standalone cost of $7.8M/yr = $2.7M net benefit immediately on close.',
    },
    {
      title: '2. Contract Repricing (+1.4%)',
      desc: "Customer A and B (24% combined revenue) negotiated under GlobalChem's pricing umbrella. Both expire 2025-2026. Management estimates 6-8% improvement: ~$7.5M incremental EBITDA.",
    },
    {
      title: '3. Lean Manufacturing COGS Reduction (+1.2%)',
      desc: 'VP Operations Reid has identified $6-8M in savings across all plants via yield optimization (Baton Rouge), energy efficiency (Houston), procurement consolidation. Projects stalled in GlobalChem capex queue.',
    },
    {
      title: '4. Product Mix Shift (+1.5%)',
      desc: 'Post-carve-out R&D expansion (3.5% to 4.5% of revenue) accelerates 6 pipeline projects. NanoCoat Elite (aerospace) and VX-Thermal Pro (EV) carry 50%+ gross margins — mix shift is accretive.',
    },
  ];

  details.forEach((d, i) => {
    const dy = 2.72 + i * 0.94;
    const bg = i % 2 === 0 ? LGRAY : WHITE;
    slide.addShape(prs.ShapeType.rect, {
      x: 0.3, y: dy, w: 9.4, h: 0.87,
      fill: { color: bg }, line: { color: MGRAY, width: 0.3 }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: 0.3, y: dy, w: 0.06, h: 0.87,
      fill: { color: GOLD }, line: { type: 'none' }
    });
    slide.addText([
      { text: d.title + '\n', options: { bold: true, color: NAVY, fontSize: 8.5 } },
      { text: d.desc, options: { color: DGRAY, fontSize: 7.8 } },
    ], { x: 0.45, y: dy + 0.06, w: 9.1, h: 0.75 });
  });
}

// ─── Slide 9: Growth Projections ──────────────────────────────────────────────

function slide09_projections(prs) {
  const slide = contentSlide(prs, 'Growth Projections', 'FY2025E-FY2027E: 7.9% revenue CAGR | 17.6% EBITDA CAGR | Margin expansion to 25.9%');

  const proj = [
    ['Metric', 'FY2024A', 'FY2025E', 'FY2026E', 'FY2027E', '3yr CAGR'],
    ['Revenue ($M)', '$320', '$346', '$374', '$402', '7.9%'],
    ['Revenue Growth', '8.0%', '8.1%', '8.1%', '7.5%', '--'],
    ['Gross Profit ($M)', '$134.4', '$148.8', '$165.2', '$181.7', '10.6%'],
    ['Gross Margin', '42.0%', '43.0%', '44.2%', '45.2%', '+320bps'],
    ['EBITDA ($M)', '$64.0', '$76.1', '$90.2', '$104.1', '17.6%'],
    ['EBITDA Margin', '20.0%', '22.0%', '24.1%', '25.9%', '+590bps'],
    ['CapEx ($M)', '$15.2', '$17.3', '$18.7', '$16.1', '--'],
    ['FCF ($M)', '$48.8', '$58.8', '$71.5', '$88.0', '21.6%'],
    ['FCF Margin', '15.3%', '17.0%', '19.1%', '21.9%', '+660bps'],
  ];

  proj.forEach((r, ri) => {
    const ry = 1.05 + ri * 0.532;
    const isHdr = ri === 0;
    const hiRows = [5, 6, 8, 9];
    const isHi = hiRows.includes(ri);
    const bg = isHdr ? NAVY : (isHi ? '162E47' : (ri % 2 === 0 ? WHITE : LGRAY));
    slide.addShape(prs.ShapeType.rect, {
      x: 0.2, y: ry, w: 9.6, h: 0.49,
      fill: { color: bg }, line: { color: MGRAY, width: 0.3 }
    });
    // FY2024A historical column shade
    if (!isHdr) {
      slide.addShape(prs.ShapeType.rect, {
        x: 2.28, y: ry, w: 1.5, h: 0.49,
        fill: { color: isHi ? '1A2A3A' : 'E8E8E8' }, line: { type: 'none' }
      });
    }
    const colW = [2.05, 1.5, 1.5, 1.5, 1.5, 1.5];
    const offsets = [0, 2.05, 3.55, 5.05, 6.55, 8.05];
    r.forEach((cell, ci) => {
      const color = isHdr ? WHITE :
        (isHi ? (ci >= 4 ? GOLD : WHITE) : (ci === 0 ? NAVY : DGRAY));
      slide.addText(cell, {
        x: 0.3 + offsets[ci], y: ry + 0.1, w: colW[ci], h: 0.29,
        fontSize: 8, bold: isHdr || ci === 0 || isHi,
        color, align: ci === 0 ? 'left' : 'center',
      });
    });
  });

  // Divider line after FY2024A
  slide.addShape(prs.ShapeType.rect, {
    x: 3.78, y: 1.05, w: 0.04, h: proj.length * 0.532,
    fill: { color: MGRAY }, line: { type: 'none' }
  });
  slide.addText('Historical', {
    x: 2.3, y: 6.48, w: 1.45, h: 0.2, fontSize: 7, color: DGRAY, align: 'center', italic: true,
  });
  slide.addText('Projected (Post Carve-out)', {
    x: 3.85, y: 6.48, w: 5.0, h: 0.2, fontSize: 7, color: DGRAY, align: 'center', italic: true,
  });
  slide.addText('Note: FY2025E reflects partial-year carve-out benefits; FY2026-27E assume full standalone operations.', {
    x: 0.3, y: 6.72, w: 9.4, h: 0.18, fontSize: 7, color: MGRAY, italic: true,
  });
}

// ─── Slide 10: Management Team ────────────────────────────────────────────────

function slide10_management(prs) {
  const slide = contentSlide(prs, 'Management Team', 'Experienced leadership with deep specialty chemicals and carve-out execution expertise');

  const execs = [
    {
      name: 'Thomas Hargrove', title: 'Chief Executive Officer',
      prior: 'President, BASF North America  |  VP Chem Ops, Dow Chemical',
      creds: '30 years specialty chemicals  |  MBA Wharton',
      bio: 'Joined Vertex in 2018; drove EBITDA margins from 15.8% to 20.0% through operational rigor, customer portfolio optimization, and product mix management.',
    },
    {
      name: 'Carolyn Walsh', title: 'Chief Financial Officer',
      prior: 'VP Corporate Development, LyondellBasell  |  Led 4 carve-outs ($3.1B)',
      creds: '25 years chemicals finance  |  CPA  |  MBA Chicago Booth',
      bio: 'Architect of the Project Apex financial and separation plan. Deep expertise in TSA structuring, carve-out accounting, and standalone entity setup.',
    },
    {
      name: 'Dr. Eric Zhao', title: 'Chief R&D Officer',
      prior: 'Research Director, 3M Specialty Materials  |  MIT PhD Chem Eng',
      creds: '20 years R&D leadership  |  Inventor on 12 of 18 Vertex patents',
      bio: 'Expanded formulation portfolio from 31 to 47 proprietary products. Leads 6 active pipeline programs with combined $48-74M annual revenue potential.',
    },
    {
      name: 'Marcus Reid', title: 'VP Operations',
      prior: 'Plant Director, Cabot Corporation  |  Six Sigma Black Belt',
      creds: '18 years plant operations  |  BS Industrial Engineering, Purdue',
      bio: 'Implemented lean programs saving $8.4M/yr annually. Identified additional $6-8M in savings pending GlobalChem capex approval — unlocks immediately post-carve-out.',
    },
  ];

  execs.forEach((e, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = 0.15 + col * 4.9;
    const by = 0.96 + row * 3.0;
    const bw = 4.7, bh = 2.85;

    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: bh,
      fill: { color: LGRAY }, line: { color: MGRAY, width: 0.5 }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: 0.74,
      fill: { color: NAVY }, line: { type: 'none' }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: 0.07, h: bh,
      fill: { color: GOLD }, line: { type: 'none' }
    });
    slide.addText(e.name, {
      x: bx + 0.14, y: by + 0.06, w: bw - 0.2, h: 0.34, fontSize: 12, bold: true, color: WHITE,
    });
    slide.addText(e.title, {
      x: bx + 0.14, y: by + 0.38, w: bw - 0.2, h: 0.26, fontSize: 8.5, color: LGOLD,
    });
    slide.addText([
      { text: 'Previous: ', options: { bold: true, color: NAVY, fontSize: 8 } },
      { text: e.prior + '\n', options: { color: DGRAY, fontSize: 8 } },
    ], { x: bx + 0.14, y: by + 0.82, w: bw - 0.2, h: 0.42 });
    slide.addText([
      { text: 'Credentials: ', options: { bold: true, color: NAVY, fontSize: 8 } },
      { text: e.creds + '\n', options: { color: DGRAY, fontSize: 8 } },
    ], { x: bx + 0.14, y: by + 1.25, w: bw - 0.2, h: 0.38 });
    slide.addText(e.bio, {
      x: bx + 0.14, y: by + 1.68, w: bw - 0.24, h: 1.0,
      fontSize: 7.8, color: DGRAY, valign: 'top',
    });
  });
}

// ─── Slide 11: Investment Thesis ──────────────────────────────────────────────

function slide11_thesis(prs) {
  const slide = contentSlide(prs, 'Investment Thesis', 'Four pillars underpinning the Project Apex investment rationale');

  const pillars = [
    {
      num: '01', title: 'Carve-out Execution',
      tagline: 'Unlock embedded value through separation',
      points: [
        '$10.5M overhead elimination at close',
        'Contract repricing: ~$7.5M incremental EBITDA',
        'CFO has led 4 prior carve-outs ($3.1B combined)',
        '18-24mo TSA provides full operational bridge',
        'Normalized FY2024 EBITDA: $73M (22.8% margin)',
      ],
    },
    {
      num: '02', title: 'Technology & IP Moat',
      tagline: 'Defensible IP with long qualification cycles',
      points: [
        '47 proprietary formulations + 18 active patents',
        'Specified by name in 14 OEM material specifications',
        'AS9100D/NADCAP aerospace qualification',
        '2-4 year new entrant qualification barrier',
        '6 pipeline projects: $48-74M revenue potential',
      ],
    },
    {
      num: '03', title: 'Market Positioning',
      tagline: 'Secular tailwinds in 3 high-growth end markets',
      points: [
        'Addressable market: $89B at 6.2% CAGR',
        'EV lightweighting: 3-5x specialty content per vehicle',
        'Aerospace composites: 9-11% CAGR segment',
        'PFAS regulation expands coatings addressable market',
        'Consolidation platform: 2-3 bolt-on targets identified',
      ],
    },
    {
      num: '04', title: 'Management & FCF',
      tagline: 'Proven team; FCF-generative at all cycle points',
      points: [
        'CEO: ex-BASF North America President, 30yrs',
        'CRO: MIT PhD; inventor on 12/18 patents',
        'FCF positive every year since 2008',
        'FY2027E FCF: $88M (21.9% FCF margin)',
        'Strong deleveraging; bolt-on M&A optionality',
      ],
    },
  ];

  pillars.forEach((p, i) => {
    const bx = 0.15 + (i % 2) * 4.9;
    const by = 0.96 + Math.floor(i / 2) * 3.0;
    const bw = 4.7, bh = 2.85;

    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: bh,
      fill: { color: LGRAY }, line: { color: MGRAY, width: 0.5 }
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx, y: by, w: bw, h: 0.06,
      fill: { color: GOLD }, line: { type: 'none' }
    });
    slide.addText(p.num, {
      x: bx + 0.1, y: by + 0.1, w: 0.65, h: 0.56,
      fontSize: 28, bold: true, color: LGOLD,
    });
    slide.addText(p.title, {
      x: bx + 0.78, y: by + 0.12, w: bw - 0.9, h: 0.34,
      fontSize: 12, bold: true, color: NAVY,
    });
    slide.addText(p.tagline, {
      x: bx + 0.78, y: by + 0.44, w: bw - 0.9, h: 0.24,
      fontSize: 8, color: DGRAY, italic: true,
    });
    slide.addShape(prs.ShapeType.rect, {
      x: bx + 0.1, y: by + 0.76, w: bw - 0.2, h: 0.02,
      fill: { color: MGRAY }, line: { type: 'none' }
    });
    const bulletItems = p.points.map((pt, bi) => ({
      text: pt,
      options: { bullet: true, color: DGRAY, fontSize: 8.5, breakLine: bi < p.points.length - 1 }
    }));
    slide.addText(bulletItems, { x: bx + 0.12, y: by + 0.88, w: bw - 0.24, h: 1.85 });
  });
}

// ─── Slide 12: Transaction Summary ───────────────────────────────────────────

function slide12_transaction(prs) {
  const slide = contentSlide(prs, 'Transaction Summary', 'Project Apex — Negotiated carve-out from GlobalChem Industries');

  slide.addText('Deal Parameters', {
    x: 0.3, y: 0.97, w: 4.5, h: 0.26, fontSize: 10, bold: true, color: NAVY,
  });

  const params = [
    ['Transaction Type', 'Negotiated carve-out'],
    ['Enterprise Value', '~$512 million'],
    ['EV / Revenue (FY2024)', '1.6x ($320M)'],
    ['EV / EBITDA (FY2024)', '8.0x ($64M)'],
    ['EV / Norm. EBITDA', '7.0x ($73M)'],
    ['Expected Close', 'Q2 2025'],
    ['TSA Duration', '18-24 months'],
    ['Process', 'Controlled auction; 6-8 sponsors'],
    ['Financial Advisor', 'Goldman Sachs & Co. LLC'],
    ['Legal Counsel', 'Sullivan & Cromwell LLP'],
  ];

  params.forEach((r, ri) => {
    const ry = 1.26 + ri * 0.48;
    const bg = ri % 2 === 0 ? WHITE : LGRAY;
    slide.addShape(prs.ShapeType.rect, {
      x: 0.3, y: ry, w: 4.65, h: 0.44,
      fill: { color: bg }, line: { color: MGRAY, width: 0.3 }
    });
    slide.addText(r[0], { x: 0.4, y: ry + 0.07, w: 1.75, h: 0.3, fontSize: 8, bold: true, color: NAVY });
    slide.addText(r[1], { x: 2.2, y: ry + 0.07, w: 2.6, h: 0.3, fontSize: 8, color: DGRAY });
  });

  slide.addText('Process Timeline', {
    x: 5.3, y: 0.97, w: 4.4, h: 0.26, fontSize: 10, bold: true, color: NAVY,
  });

  const timeline = [
    ['Q1 2025', 'PIoI Due April 30', 'Non-binding IOI with EV range and financing sources'],
    ['Q2 2025', 'Mgmt Presentations', 'Full-day sessions at Houston HQ — week of May 12'],
    ['Q2 2025', 'Final Bids Due', 'Binding offers with signed Purchase Agreement — June 20'],
    ['Q2 2025', 'Exclusivity / Sign', 'Targeted week of June 30, 2025'],
    ['Q3 2025', 'Expected Close', 'Subject to HSR and regulatory clearance'],
    ['Q1 2027', 'TSA Exit', 'Full standalone operations; growth acceleration phase'],
  ];

  timeline.forEach((t, ti) => {
    const ty = 1.26 + ti * 0.78;
    slide.addShape(prs.ShapeType.rect, {
      x: 5.3, y: ty, w: 0.7, h: 0.7,
      fill: { color: NAVY }, line: { type: 'none' }
    });
    slide.addText(t[0], { x: 5.3, y: ty + 0.06, w: 0.7, h: 0.5, fontSize: 7, bold: true, color: GOLD, align: 'center' });
    slide.addShape(prs.ShapeType.rect, {
      x: 6.05, y: ty, w: 3.65, h: 0.7,
      fill: { color: ti % 2 === 0 ? LGRAY : WHITE }, line: { color: MGRAY, width: 0.3 }
    });
    slide.addText([
      { text: t[1] + '\n', options: { bold: true, color: NAVY, fontSize: 8 } },
      { text: t[2], options: { color: DGRAY, fontSize: 7.5 } },
    ], { x: 6.15, y: ty + 0.06, w: 3.45, h: 0.58 });
    if (ti < timeline.length - 1) {
      slide.addShape(prs.ShapeType.rect, {
        x: 5.62, y: ty + 0.7, w: 0.06, h: 0.08,
        fill: { color: GOLD }, line: { type: 'none' }
      });
    }
  });

  // CTA
  slide.addShape(prs.ShapeType.rect, {
    x: 0.3, y: 6.08, w: 9.4, h: 0.62,
    fill: { color: NAVY }, line: { color: GOLD, width: 1 }
  });
  slide.addText([
    { text: 'Next Steps:  ', options: { bold: true, color: GOLD, fontSize: 9.5 } },
    { text: 'Execute NDA  |  Review full process letter  |  Submit PIoI by April 30, 2025  |  Contact Goldman Sachs deal team for data room access', options: { color: WHITE, fontSize: 8.5 } },
  ], { x: 0.5, y: 6.14, w: 9.0, h: 0.5, valign: 'middle' });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const prs = new pptxgen();
  prs.layout = 'LAYOUT_WIDE';
  prs.title = 'Vertex Specialty Chemicals -- Project Apex Investor Presentation';
  prs.subject = 'Carve-out from GlobalChem Industries';
  prs.author = 'Goldman Sachs & Co. LLC';

  slide01_cover(prs);
  slide02_highlights(prs);
  slide03_snapshot(prs);
  slide04_products(prs);
  slide05_end_markets(prs);
  slide06_market(prs);
  slide07_financials(prs);
  slide08_carveout(prs);
  slide09_projections(prs);
  slide10_management(prs);
  slide11_thesis(prs);
  slide12_transaction(prs);

  await prs.writeFile({ fileName: OUTPUT });
  const size = fs.statSync(OUTPUT).size;
  console.log(`Pitch deck saved: ${OUTPUT}`);
  console.log(`File size: ${size.toLocaleString()} bytes (${(size/1024).toFixed(1)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
