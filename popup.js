function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? '—';
}

async function getData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  return await chrome.tabs.sendMessage(tab.id, { type: 'GET_MISSION_DATA' }).catch(() => null);
}

function createPriorityBlock(item) {
  const div = document.createElement('div');
  div.className = `priority-block ${item.severity}`;

  const header = document.createElement('div');
  header.className = 'priority-header';

  const caseNum = document.createElement('span');
  caseNum.className = 'priority-case';
  caseNum.textContent = item.caseNumber;

  const tag = document.createElement('span');
  tag.className = `priority-tag ${item.tagColor}`;
  tag.textContent = item.actionTag;

  header.appendChild(caseNum);
  header.appendChild(tag);

  const meta = document.createElement('div');
  meta.className = 'priority-meta';
  meta.textContent = `${item.statusAbbrev || '—'} | ${item.priority} | ${item.daysSinceLastModified != null ? item.daysSinceLastModified + 'd stale' : '—'} | Age ${item.age != null ? item.age + 'd' : '—'}`;

  const summary = document.createElement('div');
  summary.className = 'priority-summary';
  summary.textContent = item.issueSummary || '';

  div.appendChild(header);
  div.appendChild(meta);
  div.appendChild(summary);

  return div;
}

function render(data, includePar) {
  if (!data || data.error) {
    setText('queueState', data?.error || 'No Data');
    setText('visibleCases', '—');
    return;
  }

  const qs = $('queueState');
  setText('queueState', data.queueState);
  qs.className = 'metric-value';
  if (data.queueState === 'Fire Fighting') qs.classList.add('red');
  else if (data.queueState === 'Busy') qs.classList.add('amber');
  else qs.classList.add('green');

  setText('visibleCases', data.visibleCases);
  setText('slaRisks', data.slaRisks);
  setText('closureOpps', data.closureOpportunities);

  setText('slaCritical', data.slaCritical);
  setText('slaWarning', data.slaWarning);
  setText('slaSafe', data.slaSafe);

  setText('missingProductCount', data.missingProductCount);
  setText('productAssignedCount', data.productAssignedCount);

  setText('aw-awaitingUkg', data.activeWorkQueue?.awaitingUkg ?? '—');
  setText('aw-awaitingCustomer', data.activeWorkQueue?.awaitingCustomer ?? '—');
  setText('aw-inProgress', data.activeWorkQueue?.inProgress ?? '—');
  setText('aw-rpc', data.activeWorkQueue?.rpc ?? '—');
  setText('aw-rpfu', data.activeWorkQueue?.rpfu ?? '—');
  setText('needsAttention', data.activeWorkQueue?.needsAttention ?? '—');
  setText('criticalCount', data.activeWorkQueue?.criticalCount ?? '—');

  setText('ageFresh', data.ageHealth?.fresh ?? '—');
  setText('ageRipe', data.ageHealth?.ripe ?? '—');
  setText('ageRotting', data.ageHealth?.rotting ?? '—');

  setText('reminderTotal', data.reminderCandidates ?? '—');
  setText('reminderMissingAc', data.reminderMissingAutoClose ?? '—');
  setText('reminderFollowUp', data.reminderFollowUp ?? '—');

  setText('missingKbCount', data.missingKbCount ?? '—');
  setText('linkedKbCount', data.linkedKbCount ?? '—');

  setText('engParReported', data.engineering?.parReported ?? '—');
  setText('engAwaitingSd', data.engineering?.awaitingSd ?? '—');
  setText('engHold', data.engineering?.hold ?? '—');
  setText('engOldest', data.engineering?.oldestParAge ?? '—');
  setText('engOver30', data.engineering?.parOver30 ?? '—');
  setText('engOver60', data.engineering?.parOver60 ?? '—');
  setText('engOver90', data.engineering?.parOver90 ?? '—');

  const list = $('priorityList');
  list.innerHTML = '';
  const empty = $('priorityEmpty');

  let items = data.priorityItems || [];

  if (!includePar) {
    items = items.filter(it => it.actionTag !== 'PAR');
  }

  if (items.length) {
    empty.style.display = 'none';
    items.forEach(item => {
      list.appendChild(createPriorityBlock(item));
    });
  } else {
    empty.style.display = 'block';
  }
}

async function refresh() {
  const data = await getData();
  const includePar = $('includePar')?.checked ?? false;
  render(data, includePar);
}

document.addEventListener('DOMContentLoaded', () => {
  $('refreshBtn').addEventListener('click', refresh);
  $('includePar').addEventListener('change', refresh);
  refresh();
});
