const APPROVED_CANDIDATES_API = 'https://culture-review-ingest-staging.b95302239.workers.dev/api/public/candidates';
const updateList = document.querySelector('#update-list');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const formatTime = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date).replaceAll('/', '-').replace(',', '');
};

const proposalCount = record => {
  const proposals = record.concrete_proposals;
  if (Array.isArray(proposals) && proposals.length) return proposals.length;
  return 1;
};

async function prependApprovedPolicyUpdates() {
  try {
    const response = await fetch(APPROVED_CANDIDATES_API);
    if (!response.ok) return;
    const { records = [] } = await response.json();
    const items = records
      .filter(record => record.approved_at && record.candidate && record.office)
      .slice(0, 20)
      .map(record => {
        const time = formatTime(record.approved_at);
        if (!time) return '';
        const city = escapeHtml(record.city || '');
        const office = escapeHtml(record.office);
        const candidate = escapeHtml(record.candidate);
        const count = proposalCount(record);
        return `<li><time datetime="${escapeHtml(record.approved_at)}">${time}</time><p>新增${city}${office}${candidate}政見 ${count} 筆。</p></li>`;
      })
      .filter(Boolean)
      .join('');
    if (items) updateList.insertAdjacentHTML('afterbegin', items);
  } catch {
    // Static research and data updates remain available if the public API is temporarily unavailable.
  }
}

prependApprovedPolicyUpdates();
