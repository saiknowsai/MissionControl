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

const SEVERITY_CLASS = {
  healthy: 'sev-green',
  needsAttention: 'sev-amber',
  critical: 'sev-red'
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

function normalizeHeader(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function findSalesforceTable() {
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const headerRow = table.querySelector('thead tr, tr');
    if (!headerRow) continue;
    const headerCells = headerRow.querySelectorAll('th, td');
    const headerTexts = Array.from(headerCells).map(c => normalizeHeader(c.textContent));
    const matchCount = KNOWN_HEADERS.filter(kh =>
      headerTexts.some(ht => ht.toLowerCase().includes(kh.toLowerCase()))
    ).length;
    if (matchCount >= 3) {
      const map = {};
      for (let i = 0; i < headerTexts.length; i++) {
        const ht = headerTexts[i].toLowerCase();
        for (const kh of KNOWN_HEADERS) {
          if (ht.includes(kh.toLowerCase())) {
            map[kh] = i;
            break;
          }
        }
      }
      const rows = table.querySelectorAll('tbody tr');
      return { table, map, rows: Array.from(rows) };
    }
  }

  const grids = document.querySelectorAll('[role="grid"]');
  for (const grid of grids) {
    const headerRow = grid.querySelector('[role="row"]');
    if (!headerRow) continue;
    const headerCells = headerRow.querySelectorAll('[role="columnheader"]');
    if (!headerCells.length) continue;
    const headerTexts = Array.from(headerCells).map(c => normalizeHeader(c.textContent));
    const matchCount = KNOWN_HEADERS.filter(kh =>
      headerTexts.some(ht => ht.toLowerCase().includes(kh.toLowerCase()))
    ).length;
    if (matchCount >= 3) {
      const map = {};
      for (let i = 0; i < headerTexts.length; i++) {
        const ht = headerTexts[i].toLowerCase();
        for (const kh of KNOWN_HEADERS) {
          if (ht.includes(kh.toLowerCase())) {
            map[kh] = i;
            break;
          }
        }
      }
      const dataRows = grid.querySelectorAll('[role="row"]:not(:first-child)');
      return { table: grid, map, rows: Array.from(dataRows) };
    }
  }

  return null;
}

function getCellText(row, colIndex) {
  const cells = row.querySelectorAll('td, [role="gridcell"], th');
  if (colIndex < cells.length) {
    return normalizeHeader(cells[colIndex].textContent);
  }
  return '';
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

function parseRow(cells, map) {
  const get = (key) => {
    const idx = map[key];
    if (idx === undefined) return '';
    return idx < cells.length ? normalizeHeader(cells[idx].textContent) : '';
  };

  const caseNumber = get('Case Number');
  if (!caseNumber || !/\d{6,}/.test(caseNumber)) return null;

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
    caseNumber,
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

function parseTableData(tableData) {
  if (!tableData) return [];
  const rows = [];
  const { map, rows: rowEls } = tableData;

  for (const rowEl of rowEls) {
    const isHeader = rowEl.closest('thead') !== null;
    if (isHeader) continue;
    const cells = rowEl.querySelectorAll('td, [role="gridcell"], th');
    if (cells.length < 3) continue;
    const parsed = parseRow(cells, map);
    if (parsed) rows.push(parsed);
  }

  return rows;
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

    items.push({
      ...row,
      bucketIdx
    });
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

  const slaCritical = allRows.filter(r => r.slaStatus === 'critical').length;
  const slaWarning = allRows.filter(r => r.slaStatus === 'warning').length;
  const slaSafe = allRows.filter(r => r.slaStatus === 'safe').length;

  const missingProductCount = allRows.filter(r => r.productMissing).length;
  const productAssignedCount = allRows.filter(r => !r.productMissing && r.productName).length;

  const awaitingUkg = activeRows.filter(r => r.status === 'Awaiting UKG Response').length;
  const awaitingCustomer = activeRows.filter(r => r.status === 'Awaiting Customer Information').length;
  const inProgress = activeRows.filter(r => r.status === 'In Progress').length;
  const rpc = activeRows.filter(r => r.status === 'Resolved Pending Confirmation').length;
  const rpfu = activeRows.filter(r => r.status === 'Resolved Pending Follow Up').length;
  const needsAttention = activeRows.filter(r => r.severity === 'needsAttention').length;
  const criticalCount = activeRows.filter(r => r.severity === 'critical').length;

  const fresh = activeRows.filter(r => r.freshness === 'fresh').length;
  const ripe = activeRows.filter(r => r.freshness === 'ripe').length;
  const rotting = activeRows.filter(r => r.freshness === 'rotting').length;

  const reminderCandidates = allRows.filter(r => r.reminderCandidate).length;
  const reminderMissingAutoClose = allRows.filter(r => r.status === 'Resolved Pending Confirmation' && !r.autoCloseDate).length;
  const reminderFollowUp = allRows.filter(r => r.status === 'Resolved Pending Confirmation' && r.daysSinceLastModified !== null && r.daysSinceLastModified > 3).length;

  const missingKbCount = allRows.filter(r => r.missingKb).length;
  const linkedKbCount = allRows.filter(r => !r.missingKb && r.articleStatus && r.articleStatus !== '--None--' && r.articleStatus !== '').length;

  const parReported = engRows.filter(r => r.status === 'PAR Reported').length;
  const awaitingSd = engRows.filter(r => r.status === 'Awaiting Solution Deployment').length;
  const hold = engRows.filter(r => r.status === 'Hold').length;
  const parAges = engRows.filter(r => r.status === 'PAR Reported' && r.age !== null).map(r => r.age);
  const oldestParAge = parAges.length ? Math.max(...parAges) : null;
  const parOver30 = parAges.filter(a => a > 30).length;
  const parOver60 = parAges.filter(a => a > 60).length;
  const parOver90 = parAges.filter(a => a > 90).length;

  return {
    slaCritical,
    slaWarning,
    slaSafe,
    slaTotal: slaCritical + slaWarning + slaSafe,

    missingProductCount,
    productAssignedCount,

    activeWorkQueue: {
      awaitingUkg,
      awaitingCustomer,
      inProgress,
      rpc,
      rpfu,
      needsAttention,
      criticalCount
    },

    ageHealth: { fresh, ripe, rotting },

    reminderCandidates,
    reminderMissingAutoClose,
    reminderFollowUp,

    missingKbCount,
    linkedKbCount,

    engineering: {
      parReported,
      awaitingSd,
      hold,
      oldestParAge: oldestParAge !== null ? `${oldestParAge}d` : '—',
      parOver30,
      parOver60,
      parOver90
    },

    closureOpportunities: rpfu + rpc
  };
}

function extractMissionData() {
  const tableData = findSalesforceTable();
  if (!tableData) {
    return { error: 'No Salesforce queue table detected. Navigate to a queue view and try again.' };
  }

  const allRows = parseTableData(tableData);
  if (!allRows.length) {
    return { error: 'Could not parse any case rows from the queue table.' };
  }

  const priorityItems = sortPriorities(allRows, false);
  const widgetData = computeWidgetData(allRows);
  const queueState = computeQueueState(allRows);
  const slaRisks = widgetData.slaCritical + widgetData.slaWarning;

  return {
    queueState,
    visibleCases: allRows.length,
    slaRisks,
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
