const ACTIVE_STATUSES = [
  'Awaiting UKG Response',
  'Awaiting Customer Information',
  'In Progress',
  'Resolved Pending Confirmation',
  'Resolved Pending Follow Up'
];

const ENGINEERING_STATUSES = [
  'PAR Reported',
  'Awaiting Solution Deployment',
  'Hold'
];

const STATUS_ABBREV = {
  'Resolved Pending Confirmation': 'RPC',
  'Resolved Pending Follow Up': 'RPFU',
  'Awaiting Customer Information': 'ACI',
  'Awaiting UKG Response': 'AUKG',
  'In Progress': 'IP',
  'PAR Reported': 'PAR',
  'Awaiting Solution Deployment': 'ASD',
  'Hold': 'Hold'
};

const ACTION_TAG_MAP = {
  'Awaiting Customer Information': 'Hey! Customer',
  'Awaiting UKG Response': 'You! UKG',
  'Resolved Pending Follow Up': 'Follow Up',
  'Resolved Pending Confirmation': 'Chase Confirm',
  'PAR Reported': 'PAR'
};

const TAG_COLORS = {
  'SLA Threat': 'tag-sla',
  'Missing Product': 'tag-missing-product',
  'Chase Confirm': 'tag-chase',
  'Follow Up': 'tag-followup',
  'You! UKG': 'tag-ukg',
  'Hey! Customer': 'tag-customer',
  'Missing KB': 'tag-missing-kb',
  'PAR': 'tag-par',
  'In Progress': 'tag-progress'
};

const BUCKET_ORDER = [
  'SLA Threat',
  'Missing Product',
  'Chase Confirm',
  'Follow Up',
  'You! UKG',
  'Hey! Customer',
  'In Progress',
  'Missing KB',
  'PAR'
];

const KNOWN_HEADERS = [
  'Case Number',
  'Status',
  'Product Name',
  'Issue Summary',
  'DaysSinceLastModified',
  'Priority',
  'Age (In Days)',
  'Auto Close Date',
  'Response Time Remaining (Min)',
  'Article Status'
];

function log(...args) {
  console.log('[MissionControl]', ...args);
}

function norm(text) {
  return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCellText(el) {
  const clone = el.cloneNode(true);
  const hide = clone.querySelectorAll('button, [role="button"], .slds-checkbox, input, svg, img, .slds-icon');
  hide.forEach(n => n.remove());
  return norm(clone.textContent);
}

function findTableByHeaders() {
  const headerSelector = 'th, [role="columnheader"], .slds-th__action, .slds-table_header';

  const candidates = document.querySelectorAll('table, [role="grid"], [role="treegrid"]');
  log(`Found ${candidates.length} table/grid candidates on page`);

  for (const el of candidates) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';

    const headers = el.querySelectorAll('th, [role="columnheader"]');
    if (headers.length < 3) continue;

    const headerTexts = Array.from(headers).map(h => getCellText(h));
    log(`Table (${tag}/${role}) has ${headers.length} headers:`, headerTexts.slice(0, 6));

    const matched = {};
    let matchCount = 0;

    for (let i = 0; i < headerTexts.length; i++) {
      const ht = headerTexts[i].toLowerCase();
      for (const kh of KNOWN_HEADERS) {
        const khl = kh.toLowerCase();
        if (ht.includes(khl) || khl.includes(ht)) {
          if (!matched[kh]) {
            matched[kh] = i;
            matchCount++;
          }
        }
      }
    }

    if (matchCount >= 3) {
      log(`Table matched with ${matchCount} known headers:`, matched);

      let rows = [];
      if (el.tagName === 'TABLE') {
        const tbodies = el.querySelectorAll('tbody');
        if (tbodies.length) {
          tbodies.forEach(tb => rows.push(...tb.querySelectorAll('tr')));
        } else {
          rows = Array.from(el.querySelectorAll('tr'));
        }
      } else {
        const allRows = el.querySelectorAll('[role="row"]');
        const firstRow = el.querySelector('[role="row"]');
        const firstCells = firstRow ? firstRow.querySelectorAll('[role="columnheader"]') : [];
        if (firstCells.length) {
          rows = Array.from(allRows).slice(1);
        } else {
          rows = Array.from(allRows);
        }
      }

      const firstHeaderCell = headers[0];
      const headerRow = firstHeaderCell.closest('tr') || firstHeaderCell.closest('[role="row"]');
      if (headerRow) {
        rows = rows.filter(r => r !== headerRow && !r.closest('thead'));
      }

      log(`Extracted ${rows.length} data rows`);
      return { map: matched, rows, debug: { headerTexts, matchCount } };
    }
  }

  return null;
}

function findTableByTextFallback() {
  log('Trying text-based fallback extraction');
  const bodyText = norm(document.body.innerText);
  const lines = bodyText.split('\n').filter(l => l.trim());

  const caseLines = lines.filter(l => /[A-Z]?\d{6,}/.test(l) && /Status|Progress|Pending|Awaiting|Resolved/i.test(l));
  log(`Text fallback found ${caseLines.length} candidate lines`);

  if (caseLines.length === 0) return null;

  const rows = caseLines.map(line => {
    const caseMatch = line.match(/([A-Z]?\d{6,})/);
    return { text: line, caseNumber: caseMatch ? caseMatch[1] : null };
  }).filter(r => r.caseNumber);

  if (rows.length === 0) return null;

  const map = {};
  const headerLine = lines.find(l =>
    /Case/i.test(l) && /Status/i.test(l)
  );
  if (headerLine) {
    const knownOrder = ['Case Number', 'Status', 'Product Name', 'Issue Summary', 'DaysSinceLastModified', 'Priority', 'Age (In Days)'];
    const headerParts = headerLine.split(/\s{2,}/).map(norm);
    headerParts.forEach((hp, i) => {
      for (const kh of knownOrder) {
        if (hp.toLowerCase().includes(kh.toLowerCase()) || kh.toLowerCase().includes(hp.toLowerCase())) {
          map[kh] = i;
          break;
        }
      }
    });
  }

  return { map, rows: rows.map(r => ({ text: r.text })), isTextFallback: true };
}

function findSalesforceTable() {
  const result = findTableByHeaders();
  if (result) return result;
  log('Header-based table detection failed, trying text fallback');
  return findTableByTextFallback();
}

function parseNum(text) {
  const cleaned = text.replace(/[^0-9.\-]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function getResponseTimeRemaining(text) {
  const digits = text.replace(/[^0-9]/g, '').trim();
  if (!digits) return null;
  return parseInt(digits, 10);
}

function parseRowFromCells(cells, map) {
  const get = (key) => {
    const idx = map[key];
    if (idx === undefined) return '';
    if (idx >= cells.length) return '';
    const text = getCellText(cells[idx]);
    return text;
  };

  const caseNumber = get('Case Number');
  if (!caseNumber) return null;

  const cnClean = caseNumber.replace(/[^A-Za-z0-9]/g, '');
  if (cnClean.length < 5) return null;

  const status = get('Status');
  if (!status) return null;

  const productName = get('Product Name');
  const issueSummary = get('Issue Summary');
  const daysText = get('DaysSinceLastModified');
  const priority = get('Priority');
  const ageText = get('Age (In Days)');
  const autoCloseText = get('Auto Close Date');
  const responseTimeText = get('Response Time Remaining (Min)');
  const articleStatus = get('Article Status');

  const daysSinceLastModified = parseNum(daysText);
  const age = parseNum(ageText);
  const responseTimeRemaining = getResponseTimeRemaining(responseTimeText);
  const autoCloseDate = autoCloseText && autoCloseText !== '-' && autoCloseText !== '' ? autoCloseText : null;
  const hasAutoClose = autoCloseDate !== null;
  const productMissing = !productName || productName === '' || productName === '-';

  return {
    caseNumber: cnClean,
    status,
    productName: productMissing ? '' : productName,
    issueSummary,
    daysSinceLastModified,
    priority,
    age,
    autoCloseDate: hasAutoClose ? autoCloseDate : null,
    responseTimeRemaining,
    articleStatus,
    isActive: ACTIVE_STATUSES.includes(status),
    isEngineering: ENGINEERING_STATUSES.includes(status),
    isPar: status === 'PAR Reported',
    productMissing,
    statusAbbrev: STATUS_ABBREV[status] || status,
    actionTag: getActionTag(status, responseTimeRemaining, productMissing, articleStatus),
    severity: getSeverity(daysSinceLastModified),
    freshness: getFreshness(daysSinceLastModified),
    slaStatus: getSlaStatus(responseTimeRemaining),
    missingKb: !articleStatus || articleStatus === '--None--' || articleStatus === '',
    reminderCandidate: status === 'Resolved Pending Confirmation' && (!hasAutoClose || (daysSinceLastModified !== null && daysSinceLastModified > 3))
  };
}

function parseRowFromText(line, map) {
  const fields = line.split(/\s{2,}/).map(norm);
  const get = (key) => {
    const idx = map[key];
    if (idx === undefined) return '';
    if (idx >= fields.length) return '';
    return fields[idx];
  };

  const caseMatch = line.match(/([A-Z]?\d{6,})/);
  if (!caseMatch) return null;

  const caseNumber = caseMatch[1];
  const status = get('Status') || '';

  const productName = get('Product Name');
  const issueSummary = get('Issue Summary');
  const daysText = get('DaysSinceLastModified');
  const priority = get('Priority');
  const ageText = get('Age (In Days)');

  const daysSinceLastModified = parseNum(daysText);
  const age = parseNum(ageText);
  const productMissing = !productName || productName === '' || productName === '-';
  const statusMatch = ACTIVE_STATUSES.concat(ENGINEERING_STATUSES).find(s => line.includes(s));

  return {
    caseNumber,
    status: statusMatch || status || 'Unknown',
    productName: productMissing ? '' : (productName || ''),
    issueSummary: issueSummary || '',
    daysSinceLastModified,
    priority,
    age,
    autoCloseDate: null,
    responseTimeRemaining: null,
    articleStatus: null,
    isActive: ACTIVE_STATUSES.includes(statusMatch || status),
    isEngineering: ENGINEERING_STATUSES.includes(statusMatch || status),
    isPar: (statusMatch || status) === 'PAR Reported',
    productMissing,
    statusAbbrev: STATUS_ABBREV[statusMatch || status] || (statusMatch || status),
    actionTag: getActionTag(statusMatch || status, null, productMissing, ''),
    severity: getSeverity(daysSinceLastModified),
    freshness: getFreshness(daysSinceLastModified),
    slaStatus: null,
    missingKb: false,
    reminderCandidate: false
  };
}

function parseTableData(tableData) {
  if (!tableData) return [];
  const rows = [];
  const { map, rows: rowEls, isTextFallback } = tableData;

  if (isTextFallback) {
    for (const r of rowEls) {
      const parsed = parseRowFromText(r.text, map);
      if (parsed) rows.push(parsed);
    }
    log(`Text fallback parsed ${rows.length} rows`);
    return rows;
  }

  for (const rowEl of rowEls) {
    const cells = rowEl.querySelectorAll('td, [role="gridcell"], th');
    if (cells.length < 3) continue;
    const parsed = parseRowFromCells(cells, map);
    if (parsed) rows.push(parsed);
  }

  log(`DOM parser extracted ${rows.length} valid rows from ${rowEls.length} row elements`);
  return rows;
}

function getActionTag(status, responseTimeRemaining, productMissing, articleStatus) {
  if (responseTimeRemaining !== null && responseTimeRemaining > 0 && responseTimeRemaining <= 480) {
    return 'SLA Threat';
  }
  if (productMissing) return 'Missing Product';
  if (ACTION_TAG_MAP[status]) return ACTION_TAG_MAP[status];
  if (!articleStatus || articleStatus === '--None--' || articleStatus === '') return 'Missing KB';
  return 'In Progress';
}

function getSeverity(daysSinceLastModified) {
  if (daysSinceLastModified === null) return 'healthy';
  if (daysSinceLastModified > 5) return 'critical';
  if (daysSinceLastModified > 2) return 'needsAttention';
  return 'healthy';
}

function getFreshness(daysSinceLastModified) {
  if (daysSinceLastModified === null) return 'unknown';
  if (daysSinceLastModified <= 2) return 'fresh';
  if (daysSinceLastModified <= 5) return 'ripe';
  return 'rotting';
}

function getSlaStatus(responseTimeRemaining) {
  if (responseTimeRemaining === null || responseTimeRemaining <= 0) return null;
  if (responseTimeRemaining <= 60) return 'critical';
  if (responseTimeRemaining <= 480) return 'warning';
  return 'safe';
}

function computeQueueState(allRows) {
  const activeRows = allRows.filter(r => r.isActive);
  const hasSlaThreat = allRows.some(r => r.slaStatus === 'critical');
  const hasCritical = activeRows.some(r => r.severity === 'critical');
  const hasMissingProduct = allRows.some(r => r.productMissing);

  if (hasSlaThreat || hasCritical || hasMissingProduct) return 'Fire Fighting';

  const hasNeedsAttention = activeRows.some(r => r.severity === 'needsAttention');
  const hasReminderCandidates = allRows.some(r => r.reminderCandidate);
  const hasMissingKb = allRows.some(r => r.missingKb);

  if (hasNeedsAttention || hasReminderCandidates || hasMissingKb) return 'Busy';

  return 'Controlled';
}

function sortPriorities(allRows, includePar) {
  const items = [];

  for (const row of allRows) {
    if (!includePar && row.actionTag === 'PAR') continue;
    if (!row.isActive && !row.isEngineering) continue;

    const bucketIdx = BUCKET_ORDER.indexOf(row.actionTag);
    if (bucketIdx === -1) continue;

    items.push({ ...row, bucketIdx });
  }

  items.sort((a, b) => {
    if (a.bucketIdx !== b.bucketIdx) return a.bucketIdx - b.bucketIdx;
    const daysA = a.daysSinceLastModified ?? 0;
    const daysB = b.daysSinceLastModified ?? 0;
    if (daysB !== daysA) return daysB - daysA;
    const ageA = a.age ?? 0;
    const ageB = b.age ?? 0;
    return ageB - ageA;
  });

  return items.slice(0, 10);
}

function computeWidgetData(allRows) {
  const activeRows = allRows.filter(r => r.isActive);
  const engRows = allRows.filter(r => r.isEngineering);

  return {
    slaCritical: allRows.filter(r => r.slaStatus === 'critical').length,
    slaWarning: allRows.filter(r => r.slaStatus === 'warning').length,
    slaSafe: allRows.filter(r => r.slaStatus === 'safe').length,

    missingProductCount: allRows.filter(r => r.productMissing).length,
    productAssignedCount: allRows.filter(r => !r.productMissing && r.productName).length,

    activeWorkQueue: {
      awaitingUkg: activeRows.filter(r => r.status === 'Awaiting UKG Response').length,
      awaitingCustomer: activeRows.filter(r => r.status === 'Awaiting Customer Information').length,
      inProgress: activeRows.filter(r => r.status === 'In Progress').length,
      rpc: activeRows.filter(r => r.status === 'Resolved Pending Confirmation').length,
      rpfu: activeRows.filter(r => r.status === 'Resolved Pending Follow Up').length,
      needsAttention: activeRows.filter(r => r.severity === 'needsAttention').length,
      criticalCount: activeRows.filter(r => r.severity === 'critical').length
    },

    ageHealth: {
      fresh: activeRows.filter(r => r.freshness === 'fresh').length,
      ripe: activeRows.filter(r => r.freshness === 'ripe').length,
      rotting: activeRows.filter(r => r.freshness === 'rotting').length
    },

    reminderCandidates: allRows.filter(r => r.reminderCandidate).length,
    reminderMissingAutoClose: allRows.filter(r => r.status === 'Resolved Pending Confirmation' && !r.autoCloseDate).length,
    reminderFollowUp: allRows.filter(r => r.status === 'Resolved Pending Confirmation' && r.daysSinceLastModified !== null && r.daysSinceLastModified > 3).length,

    missingKbCount: allRows.filter(r => r.missingKb).length,
    linkedKbCount: allRows.filter(r => !r.missingKb && r.articleStatus && r.articleStatus !== '--None--' && r.articleStatus !== '').length,

    engineering: (() => {
      const parAges = engRows.filter(r => r.status === 'PAR Reported' && r.age !== null).map(r => r.age);
      return {
        parReported: engRows.filter(r => r.status === 'PAR Reported').length,
        awaitingSd: engRows.filter(r => r.status === 'Awaiting Solution Deployment').length,
        hold: engRows.filter(r => r.status === 'Hold').length,
        oldestParAge: parAges.length ? `${Math.max(...parAges)}d` : '—',
        parOver30: parAges.filter(a => a > 30).length,
        parOver60: parAges.filter(a => a > 60).length,
        parOver90: parAges.filter(a => a > 90).length
      };
    })(),

    closureOpportunities: activeRows.filter(r => r.status === 'Resolved Pending Confirmation').length + activeRows.filter(r => r.status === 'Resolved Pending Follow Up').length
  };
}

function extractMissionData() {
  log('extractMissionData called');

  const tableData = findSalesforceTable();
  if (!tableData) {
    const tables = document.querySelectorAll('table').length;
    const grids = document.querySelectorAll('[role="grid"]').length;
    log(`No table found. Page has ${tables} tables, ${grids} grids`);
    return { error: `No Salesforce queue table detected. Found ${tables} tables, ${grids} grids on page.` };
  }

  const allRows = parseTableData(tableData);
  if (!allRows.length) {
    log('Table found but no rows could be parsed. Debug:', tableData.debug);
    return {
      error: `Could not parse any case rows. Table matched headers but got 0 valid rows from ${tableData.rows.length} row elements. Check DevTools console for details.`
    };
  }

  log(`Successfully parsed ${allRows.length} cases`);
  const priorityItems = sortPriorities(allRows, false);
  const widgetData = computeWidgetData(allRows);
  const queueState = computeQueueState(allRows);

  return {
    queueState,
    visibleCases: allRows.length,
    slaRisks: widgetData.slaCritical + widgetData.slaWarning,
    closureOpportunities: widgetData.closureOpportunities,
    priorityItems: priorityItems.map(r => ({
      caseNumber: r.caseNumber,
      actionTag: r.actionTag,
      statusAbbrev: r.statusAbbrev,
      priority: r.priority || '—',
      daysSinceLastModified: r.daysSinceLastModified,
      age: r.age,
      issueSummary: r.issueSummary,
      severity: r.severity,
      tagColor: TAG_COLORS[r.actionTag] || 'tag-gray'
    })),
    ...widgetData
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_MISSION_DATA') {
    sendResponse(extractMissionData());
  }
});

log('Content script loaded');
