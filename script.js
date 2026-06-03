// --- GLOBAL SYSTEM UTILITIES ---
const LOCAL_PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function showToast(msg) {
  const t = document.getElementById('toast');
  const m = document.getElementById('toast-msg');
  if (t && m) {
    m.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }
}

function makeProgressBar(current, total) {
  const size = 10;
  const percentage = Math.floor((current / total) * 100);
  const completed = Math.round((size * current) / total);
  const remaining = size - completed;
  const bar = '█'.repeat(completed) + '░'.repeat(remaining);
  return `[${bar}] ${percentage}% (${current}/${total})`;
}

// --- STATE MANAGEMENT ---
let currentTab = 'library';
let selArt = null;
let selMbId = null;
let editingId = null;
let editingList = null;
let editRating = 0;
let library = [];
let wishlist = [];
let isSelectMode = false;
let selectedIds = new Set();

const COLORS = ['#1a2510','#10181a','#1a1018','#181510','#101820','#1a1010','#121a10'];
const EMOJIS = ['🎵','💿','🌀','⚡','🖤','🔊','🎧','💜','🧨','🌙'];
function hash(s) { let h = 5381; for(let i=0; i<s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i); return Math.abs(h); }
function bg(s) { return COLORS[hash(s) % COLORS.length]; }
function em(s) { return EMOJIS[hash(s) % EMOJIS.length]; }

// --- PERSISTENCE ---
function saveState() { try { localStorage.setItem('crate-lib', JSON.stringify(library)); localStorage.setItem('crate-wish', JSON.stringify(wishlist)); updateVersion(); } catch(e) {} }
function loadState() { return new Promise(resolve => { try { const lib = localStorage.getItem('crate-lib'); const wish = localStorage.getItem('crate-wish'); if(lib) library = JSON.parse(lib); if(wish) wishlist = JSON.parse(wish); } catch(e) {} resolve(); }); }
function updateVersion() { const v = localStorage.getItem('crate-v') || '1.0.0'; const parts = v.split('.'); parts[2] = parseInt(parts[2] || 0) + 1; const newV = parts.join('.'); localStorage.setItem('crate-v', newV); if(document.getElementById('version')) document.getElementById('version').textContent = newV; }

// --- ARTWORK PROCESSING ---
const artCache = {};
function imgExists(url) { return new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = url; }); }
async function itunesArt(artist, album) { try { const q = encodeURIComponent(artist + ' ' + album); const r = await fetch('https://itunes.apple.com/search?term=' + q + '&entity=album&limit=3'); const d = await r.json(); if(d.results && d.results.length) return d.results[0].artworkUrl100.replace('100x100bb', '600x600bb'); } catch(e) {} return null; }
async function getArt(artist, album, mbId) {
  const key = mbId || artist + '::' + album;
  if(artCache[key] !== undefined) return artCache[key];
  artCache[key] = null;
  if(mbId) { const url = 'https://coverartarchive.org/release/' + mbId + '/front-250'; if(await imgExists(url)) { artCache[key] = url; return url; } }
  try { const q = encodeURIComponent('artist:"' + artist + '" release:" ' + album + '"'); const r = await fetch('https://musicbrainz.org/ws/2/release/?query=' + q + '&limit=3&fmt=json', { headers: { 'User-Agent': 'CRATE/1.0' } }); const d = await r.json(); if(d.releases && d.releases.length) { for(const rel of d.releases) { const url = 'https://coverartarchive.org/release/' + rel.id + '/front-250'; if(await imgExists(url)) { artCache[key] = url; return url; } } } } catch(e) {}
  const it = await itunesArt(artist, album); artCache[key] = it; return it;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function loadAllArt() {
  const targets = [...library, ...wishlist].filter(item => !item.artUrl || item.artUrl === LOCAL_PLACEHOLDER);
  const total = targets.length;
  const status = document.getElementById('import-status');
  if (total === 0) return;
  let current = 0;
  for(const item of targets) {
    if(status) status.textContent = 'fetching art... ' + makeProgressBar(current, total);
    const url = await getArt(item.artist, item.album, item.mbId || null);
    if(url) { item.artUrl = url; render(); }
    current++;
    await sleep(150);
  }
  if(status) status.textContent = 'done ' + makeProgressBar(total, total);
}

// --- CSV IMPORT ENGINE ---
function splitCSV(line) { const cols = []; let cur = '', inQ = false; for(const c of line) { if(c === '"') { inQ = !inQ; } else if(c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; } else cur += c; } cols.push(cur.trim()); return cols; }
function parseCSV(text) { const lines = text.split(/\r?\n/); if(!lines.length) return []; const header = splitCSV(lines[0]).map(h => h.toLowerCase().trim()); const rows = []; for(let i = 1; i < lines.length; i++) { const l = lines[i].trim(); if(!l) continue; const cols = splitCSV(l); const row = {}; header.forEach((h, i) => row[h] = (cols[i] || '').replace(/^"|"$/g, '')); rows.push(row); } return rows; }

async function processCSV(file) {
  const status = document.getElementById('import-status');
  if (status) status.textContent = 'reading file...';
  const text = await file.text();
  const rows = parseCSV(text);
  if (!rows.length) { if (status) status.textContent = 'no data found'; return; }
  const keys = Object.keys(rows[0]);
  const aKey = keys.find(k => k.includes('artist')) || keys[0];
  const tKey = keys.find(k => k.includes('title') || k.includes('album') || k.includes('name')) || keys[1];
  const uKey = keys.find(k => k.includes('url') || k.includes('link'));
  const artIdKey = keys.find(k => k.includes('art_id') || k.includes('artid') || k.includes('image_id'));
  let added = 0;
  for (const row of rows) {
    const artist = (row[aKey] || '').trim(), album = (row[tKey] || '').trim();
    if (!artist && !album) continue;
    const targetList = currentTab === 'library' ? library : wishlist;
    if (targetList.find(l => l.artist.toLowerCase() === artist.toLowerCase() && l.album.toLowerCase() === album.toLowerCase())) continue;
    const targetArtId = (artIdKey && row[artIdKey]) ? row[artIdKey].trim() : null;
    let computedArtUrl = targetArtId && !isNaN(targetArtId) ? `https://f4.bcbits.com/img/a${targetArtId}_10.jpg` : LOCAL_PLACEHOLDER;
    if (currentTab === 'library') {
      library.push({ id: Date.now() + added, artist, album, year: new Date().getFullYear(), genre: '', format: 'FLAC', source: 'Bandcamp', rating: 0, notes: '', artUrl: computedArtUrl, mbId: null, bcUrl: uKey ? row[uKey] || null : null });
    } else {
      wishlist.push({ id: Date.now() + added, artist, album, year: new Date().getFullYear(), genre: '', price: 0, priority: 'mid', notes: 'Imported', bought: false, artUrl: computedArtUrl, bcUrl: uKey ? row[uKey] || null : null });
    }
    added++;
  }
  saveState(); render(); showToast('imported ' + added + ' to ' + currentTab); await loadAllArt();
}

function dragOver(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-over'); }
function dragLeave() { document.getElementById('drop-zone').classList.remove('drag-over'); }
function dropFile(e) { e.preventDefault(); dragLeave(); const f = e.dataTransfer.files[0]; if(f) processCSV(f); }
function handleFile(e) { const f = e.target.files[0]; if(f) processCSV(f); }

// --- RENDER & BATCH ACTIONS ---
function setTab(t) { currentTab = t; document.getElementById('nav-library').classList.toggle('active', t === 'library'); document.getElementById('nav-wishlist').classList.toggle('active', t === 'wishlist'); render(); }
function starsHtml(rating, id, lst) { return Array.from({ length: 5 }, (_, i) => `<span class="star${i < rating ? ' on' : ''}" onclick="event.stopPropagation();quickRate(${id},'${lst}',${i + 1})">★</span>`).join(''); }

function renderLibrary(items) {
  if(!items.length) return '<div class="empty"><div class="empty-icon">💿</div>your library is empty</div>';
  return '<div class="grid">' + items.map(x => {
    const isChecked = selectedIds.has(x.id) ? 'checked' : '';
    const selectedClass = selectedIds.has(x.id) ? ' card-selected' : '';
    return `<div class="album-card${selectedClass}" data-id="${x.id}">
      <div class="album-art" style="background:${bg(x.album)}" onclick="handleItemClick(event, ${x.id}, 'library')">
        ${isSelectMode ? `<div class="batch-checkbox-wrap" onclick="event.stopPropagation()"><input type="checkbox" class="batch-checkbox" ${isChecked} onchange="toggleItemSelection(${x.id})"></div>` : ''}
        <img src="${x.artUrl || ''}" style="display:${x.artUrl ? 'block' : 'none'}"><span class="album-art-emoji" style="display:${x.artUrl ? 'none' : 'block'}">${em(x.album)}</span>
        <div class="card-actions"><div class="card-action-btn" onclick="event.stopPropagation();openEdit(${x.id},'library')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div></div>
      </div>
      <div class="album-card-body"><div class="album-title">${x.album}</div><div class="album-artist">${x.artist}</div><div class="album-footer"><span class="format-badge fmt-${x.format.toLowerCase()}">${x.format}</span><div class="stars-row">${starsHtml(x.rating, x.id, 'library')}</div></div></div>
    </div>`;
  }).join('') + '</div>';
}

function renderWishlist(items) {
  if(!items.length) return '<div class="empty"><div class="empty-icon">✨</div>your wishlist is empty</div>';
  return '<div class="wish-list">' + items.map(x => {
    const isChecked = selectedIds.has(x.id) ? 'checked' : '';
    const selectedClass = selectedIds.has(x.id) ? ' card-selected' : '';
    return `<div class="wish-row${x.bought ? ' bought' : ''}${selectedClass}" onclick="handleItemClick(event, ${x.id}, 'wishlist')">
      ${isSelectMode ? `<div class="batch-checkbox-wrap" onclick="event.stopPropagation()"><input type="checkbox" class="batch-checkbox" ${isChecked} onchange="toggleItemSelection(${x.id})"></div>` : `<div class="priority-dot p-${x.priority}"></div>`}
      <div class="wish-art"><img src="${x.artUrl || ''}" style="display:${x.artUrl ? 'block' : 'none'}"><span class="wish-art-emoji" style="display:${x.artUrl ? 'none' : 'block'}">${em(x.album)}</span></div>
      <div class="wish-info"><div class="wish-title">${x.album}</div><div class="wish-sub">${x.artist}</div></div>
      <div class="wish-meta" onclick="event.stopPropagation()"><div class="price-tag">$${x.price}</div><button class="icon-btn" onclick="openEdit(${x.id},'wishlist')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button><button class="buy-btn" onclick="markBought(${x.id})">mark bought</button></div>
    </div>`;
  }).join('') + '</div>';
}

function render() { const q = document.getElementById('search').value.toLowerCase(), g = document.getElementById('genre-filter').value; const lf = library.filter(x => (!q || x.artist.toLowerCase().includes(q) || x.album.toLowerCase().includes(q)) && (!g || x.genre === g)); const wf = wishlist.filter(x => (!q || x.artist.toLowerCase().includes(q) || x.album.toLowerCase().includes(q)) && (!g || x.genre === g)); document.getElementById('lib-count').textContent = library.length; document.getElementById('wish-count').textContent = wishlist.filter(x => !x.bought).length; document.getElementById('content').innerHTML = currentTab === 'library' ? renderLibrary(lf) : renderWishlist(wf); }

// --- BATCH SELECTION & CRUD ACTIONS ---
function toggleSelectMode() { isSelectMode = !isSelectMode; selectedIds.clear(); const btn = document.getElementById('select-mode-btn'); const bar = document.getElementById('batch-actions-bar'); if (isSelectMode) { document.getElementById('content').classList.add('selecting-active'); btn.textContent = 'cancel'; btn.classList.add('btn-accent'); if (!document.getElementById('batch-select-all-btn')) { const sa = document.createElement('button'); sa.className = 'btn'; sa.id = 'batch-select-all-btn'; sa.textContent = 'select all'; sa.onclick = toggleSelectAll; bar.insertBefore(sa, bar.children[1]); } } else { document.getElementById('content').classList.remove('selecting-active'); btn.textContent = 'select'; btn.classList.remove('btn-accent'); bar.style.display = 'none'; document.getElementById('batch-select-all-btn')?.remove(); } render(); }

function toggleSelectAll() {
  const currentList = currentTab === 'library' ? library : wishlist;
  const visible = currentList.filter(x => (!document.getElementById('search').value || x.artist.toLowerCase().includes(document.getElementById('search').value.toLowerCase())));
  const allSelected = visible.every(x => selectedIds.has(x.id));
  if (allSelected) visible.forEach(x => selectedIds.delete(x.id)); else visible.forEach(x => selectedIds.add(x.id));
  document.getElementById('batch-actions-bar').style.display = selectedIds.size > 0 ? 'flex' : 'none';
  document.getElementById('batch-count-text').textContent = selectedIds.size + ' selected';
  render();
}

function toggleItemSelection(id) { if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); document.getElementById('batch-actions-bar').style.display = selectedIds.size > 0 ? 'flex' : 'none'; document.getElementById('batch-count-text').textContent = selectedIds.size + ' selected'; render(); }
function handleItemClick(event, id, list) { if (isSelectMode) toggleItemSelection(id); else if (list === 'library') openBandcamp(getItem(id, 'library')); else openEdit(id, 'wishlist'); }

async function batchRefreshArt() {
  const targets = Array.from(selectedIds).map(id => (currentTab === 'library' ? library : wishlist).find(x => x.id === id));
  for (const item of targets) {
    delete artCache[item.mbId || item.artist + '::' + item.album];
    const url = await getArt(item.artist, item.album, item.mbId || null);
    if (url) item.artUrl = url;
  }
  saveState(); toggleSelectMode(); showToast('refreshed'); render();
}

function batchDelete() {
  if (currentTab === 'library') library = library.filter(x => !selectedIds.has(x.id));
  else wishlist = wishlist.filter(x => !selectedIds.has(x.id));
  saveState(); toggleSelectMode(); showToast('removed'); render();
}

// --- MODALS & INIT ---
function getItem(id, lst) { return (lst === 'library' ? library : wishlist).find(x => x.id === id); }
function openEdit(id, lst) { /* Standard edit modal logic */ }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function bgClose(e, id) { if(e.target === document.getElementById(id)) closeModal(id); }
document.addEventListener('keydown', e => { if(e.key === 'Escape') { closeModal('add-modal'); closeModal('edit-modal'); closeModal('import-modal'); } });
loadState().then(() => render());
