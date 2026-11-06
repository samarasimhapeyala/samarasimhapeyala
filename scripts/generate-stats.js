// Generates assets/stats.svg and assets/top-langs.svg from the GitHub API.
// No third-party service: runs inside GitHub Actions with the built-in token.
const fs = require('fs');

const USER = process.env.GH_USER || 'samarasimhapeyala';
const TOKEN = process.env.GITHUB_TOKEN;
const H = { 'User-Agent': 'profile-stats', Accept: 'application/vnd.github+json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

async function api(path) {
  const r = await fetch(`https://api.github.com${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}
async function repos() {
  let all = [], page = 1;
  for (;;) {
    const b = await api(`/users/${USER}/repos?per_page=100&type=owner&page=${page++}`);
    all = all.concat(b);
    if (b.length < 100) return all;
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const T = { bg: '#141321', border: '#e4e2e2', title: '#fe428e', text: '#a9fef7', icon: '#f8d847', muted: '#7d7f9a' };

function card(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<style>text{font-family:'Segoe UI',Ubuntu,Arial,sans-serif}.t{font-size:18px;font-weight:600;fill:${T.title}}.l{font-size:14px;font-weight:600;fill:${T.text}}.v{font-size:14px;font-weight:700;fill:${T.text}}.m{font-size:11px;fill:${T.muted}}</style>
<rect x=".5" y=".5" rx="4.5" width="${w - 1}" height="${h - 1}" fill="${T.bg}" stroke="${T.border}" stroke-opacity=".3"/>
<text class="t" x="25" y="35">${esc(title)}</text>${body}</svg>`;
}

(async () => {
  const [user, rs] = await Promise.all([api(`/users/${USER}`), repos()]);
  const own = rs.filter(r => !r.fork);
  const stars = own.reduce((s, r) => s + r.stargazers_count, 0);
  const forks = own.reduce((s, r) => s + r.forks_count, 0);
  const search = async q => { try { return (await api(q)).total_count; } catch { return '-'; } };
  const [commits, prs, issues] = await Promise.all([
    search(`/search/commits?q=author:${USER}&per_page=1`),
    search(`/search/issues?q=author:${USER}+type:pr&per_page=1`),
    search(`/search/issues?q=author:${USER}+type:issue&per_page=1`),
  ]);

  const rows = [
    ['Public Repos', user.public_repos], ['Total Stars Earned', stars], ['Forks of My Repos', forks],
    ['Commits (public)', commits], ['Pull Requests', prs], ['Issues Opened', issues], ['Followers', user.followers],
  ];
  const body = rows.map((r, i) => `<text class="l" x="25" y="${70 + i * 26}">${esc(r[0])}:</text><text class="v" x="230" y="${70 + i * 26}">${esc(r[1])}</text>`).join('');
  fs.mkdirSync('assets', { recursive: true });
  fs.writeFileSync('assets/stats.svg', card(330, 70 + rows.length * 26 - 6, `${user.name || USER}'s GitHub Stats`, body + `<text class="m" x="25" y="${70 + rows.length * 26 + 2}"> </text>`));

  // top languages by bytes across owned, non-fork repos
  const bytes = {};
  for (const r of own) {
    try { const l = await api(`/repos/${USER}/${r.name}/languages`); for (const [k, v] of Object.entries(l)) bytes[k] = (bytes[k] || 0) + v; } catch {}
  }
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const palette = ['#fe428e', '#a9fef7', '#f8d847', '#7aa2ff', '#9d7bff', '#6ee7a5'];
  let x = 25, bar = '';
  langs.forEach(([, v], i) => { const w = Math.max(2, (v / total) * 270); bar += `<rect x="${x}" y="55" width="${w}" height="8" fill="${palette[i]}"/>`; x += w; });
  const pct = v => { const p = v / total * 100; return p < 0.1 ? '<0.1%' : p.toFixed(1) + '%'; };
  const items = langs.map(([k, v], i) => `<circle cx="32" cy="${90 + i * 22}" r="5" fill="${palette[i]}"/><text class="l" x="46" y="${95 + i * 22}" style="font-size:12px">${esc(k)}</text><text class="v" x="290" y="${95 + i * 22}" text-anchor="end" style="font-size:12px">${esc(pct(v))}</text>`).join('');
  fs.writeFileSync('assets/top-langs.svg', card(320, 90 + langs.length * 22 + 8, 'Most Used Languages', `<clipPath id="c"><rect x="25" y="55" width="270" height="8" rx="4"/></clipPath><g clip-path="url(#c)">${bar}</g>${items}`));
  console.log('stats:', Object.fromEntries(rows), 'langs:', langs.map(l => l[0]).join(','));
})().catch(e => { console.error(e); process.exit(1); });
