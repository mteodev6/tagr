// VARIABLES
let currentTab='library', selArt=null, selMbId=null;
let editingId=null, editingList=null, editRating=0;
let library=[], wishlist=[];

const COLORS=['#1a2510','#10181a','#1a1018','#181510','#101820','#1a1010','#121a10'];
const EMOJIS=['🎵','💿','🌀','⚡','🖤','🔊','🎧','💜','🧨','🌙'];
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h)+s.charCodeAt(i);return Math.abs(h);}
function bg(s){return COLORS[hash(s)%COLORS.length];}
function em(s){return EMOJIS[hash(s)%EMOJIS.length];}

// ART
const artCache={};
function imgExists(url){return new Promise(res=>{const i=new Image();i.onload=()=>res(true);i.onerror=()=>res(false);i.src=url;});}
async function itunesArt(artist,album){try{const q=encodeURIComponent(artist+' '+album);const r=await fetch('https://itunes.apple.com/search?term='+q+'&entity=album&limit=3');const d=await r.json();if(d.results&&d.results.length)return d.results[0].artworkUrl100.replace('100x100bb','600x600bb');}catch(e){}return null;}
async function getArt(artist,album,mbId){const key=mbId||artist+'::'+album;if(artCache[key]!==undefined)return artCache[key];artCache[key]=null;if(mbId){const url='https://coverartarchive.org/release/'+mbId+'/front-250';if(await imgExists(url)){artCache[key]=url;return url;}}try{const q=encodeURIComponent('artist:"'+artist+'" release:"'+album+'"');const r=await fetch('https://musicbrainz.org/ws/2/release/?query='+q+'&limit=3&fmt=json',{headers:{'User-Agent':'CRATE/1.0'}});const d=await r.json();if(d.releases&&d.releases.length){for(const rel of d.releases){const url='https://coverartarchive.org/release/'+rel.id+'/front-250';if(await imgExists(url)){artCache[key]=url;return url;}}}}catch(e){}const it=await itunesArt(artist,album);artCache[key]=it;return it;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function loadAllArt(){for(const item of [...library,...wishlist]){if(item.artUrl)continue;const url=await getArt(item.artist,item.album,item.mbId||null);if(url){item.artUrl=url;render();}await sleep(150);}}

// MUSICBRAINZ
function artistStr(rel){if(!rel['artist-credit'])return '';return rel['artist-credit'].map(a=>typeof a==='string'?a:(a.artist?.name||'')).join('');}
async function mbSearch(){const q=document.getElementById('mb-query').value.trim();if(!q)return;const wrap=document.getElementById('mb-results-wrap'),el=document.getElementById('mb-results');wrap.style.display='block';el.innerHTML='<div class="mb-loading">searching...</div>';const m=q.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);if(m){await mbById(m[1]);return;}try{const r=await fetch('https://musicbrainz.org/ws/2/release/?query='+encodeURIComponent(q)+'&limit=10&fmt=json',{headers:{'User-Agent':'CRATE/1.0'}});const d=await r.json();if(!d.releases||!d.releases.length){el.innerHTML='<div class="mb-loading">no results</div>';return;}const seen=new Set();const list=d.releases.filter(r=>{const k=artistStr(r)+'::'+r.title;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,6);showMbResults(list.map(r=>({id:r.id,title:r.title,artist:artistStr(r),date:r.date||''})));}catch(e){el.innerHTML='<div class="mb-loading">search failed</div>';}}
async function mbById(id){const el=document.getElementById('mb-results');try{const r=await fetch('https://musicbrainz.org/ws/2/release/'+id+'?inc=artist-credits&fmt=json',{headers:{'User-Agent':'CRATE/1.0'}});const d=await r.json();showMbResults([{id:d.id,title:d.title,artist:artistStr(d),date:d.date||''}]);}catch(e){el.innerHTML='<div class="mb-loading">could not fetch</div>';}}

function showMbResults(results){
  const el = document.getElementById('mb-results');
  el.innerHTML = results.map(r => 
    `<div class="mb-result" id="mbr-${r.id}" onclick="selectMb('${r.id}','${esc(r.title)}','${esc(r.artist)}','${r.date}')">
      <div class="mb-result-art">💿</div>
      <div class="mb-result-info">
        <div class="mb-result-title">${esc(r.title)}</div>
        <div class="mb-result-sub">${esc(r.artist)} - ${r.date}</div>
      </div>
    </div>`
  ).join('');
}

async function selectMb(id,title,artist,date){document.querySelectorAll('.mb-result').forEach(e=>e.classList.remove('selected'));document.getElementById('mbr-'+id)?.classList.add('selected');selMbId=id;document.getElementById('f-artist').value=artist;document.getElementById('f-album').value=title;const yr=date?parseInt(date.slice(0,4)):null;if(yr)document.getElementById('f-year').value=yr;const preview=document.getElementById('art-preview'),img=document.getElementById('preview-img');const caa='https://coverartarchive.org/release/'+id+'/front-250';if(await imgExists(caa)){img.src=caa;selArt=caa;preview.style.display='flex';}else{const it=await itunesArt(artist,title);if(it){img.src=it;selArt=it;preview.style.display='flex';}}}
function esc(s){return(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");}

// BANDCAMP
function openBandcamp(item){if(item&&item.bcUrl)window.open(item.bcUrl,'_blank');else if(item)window.open('https://bandcamp.com/search?q='+encodeURIComponent(item.artist+' '+item.album),'_blank');}

// STORAGE
function saveState(){try{localStorage.setItem('crate-lib',JSON.stringify(library));localStorage.setItem('crate-wish',JSON.stringify(wishlist));updateVersion();}catch(e){}}
function loadState(){return new Promise(resolve=>{try{const lib=localStorage.getItem('crate-lib');const wish=localStorage.getItem('crate-wish');if(lib)library=JSON.parse(lib);if(wish)wishlist=JSON.parse(wish);}catch(e){}resolve();});}
function updateVersion(){const v=localStorage.getItem('crate-v')||'1.0.0';const parts=v.split('.');parts[2]=parseInt(parts[2]||0)+1;const newV=parts.join('.');localStorage.setItem('crate-v',newV);if(document.getElementById('version'))document.getElementById('version').textContent=newV;}

// RENDER
function setTab(t){currentTab=t;document.getElementById('nav-library').classList.toggle('active',t==='library');document.getElementById('nav-wishlist').classList.toggle('active',t==='wishlist');render();}
function starsHtml(rating,id,lst){return Array.from({length:5},(_,i)=>`<span class="star${i<rating?' on':''}" onclick="event.stopPropagation();quickRate(${id},'${lst}',${i+1})">★</span>`).join('');}

function renderLibrary(items){
  if(!items.length) return '<div class="empty"><div class="empty-icon">💿</div>your library is empty<div class="empty-hint">add albums manually or import your bandcamp collection</div></div>';
  return '<div class="grid">' + items.map(x => 
    `<div class="album-card">
      <div class="album-art" style="background:${bg(x.album)}" onclick="openBandcamp(getItem(${x.id},'library'))">
        <img src="${x.artUrl||''}" style="display:${x.artUrl?'block':'none'}">
        <span class="album-art-emoji" style="display:${x.artUrl?'none':'block'}">${em(x.album)}</span>
        <div class="card-actions">
          <div class="card-action-btn" onclick="event.stopPropagation();openEdit(${x.id},'library')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </div>
        </div>
      </div>
      <div class="album-card-body">
        <div class="album-title">${x.album}</div>
        <div class="album-artist">${x.artist}</div>
        <div class="album-footer">
          <span class="format-badge fmt-${x.format.toLowerCase()}">${x.format}</span>
          <div class="stars-row">${starsHtml(x.rating,x.id,'library')}</div>
        </div>
      </div>
    </div>`
  ).join('') + '</div>';
}

function renderWishlist(items){
  if(!items.length) return '<div class="empty"><div class="empty-icon">✨</div>your wishlist is empty</div>';
  return '<div class="wish-list">' + items.map(x => 
    `<div class="wish-row${x.bought?' bought':''}">
      <div class="priority-dot p-${x.priority}"></div>
      <div class="wish-art" onclick="openBandcamp(getItem(${x.id},'wishlist'))">
        <img src="${x.artUrl||''}" style="display:${x.artUrl?'block':'none'}">
        <span class="wish-art-emoji" style="display:${x.artUrl?'none':'block'}">${em(x.album)}</span>
      </div>
      <div class="wish-info" onclick="openEdit(${x.id},'wishlist')">
        <div class="wish-title">${x.album}</div>
        <div class="wish-sub">${x.artist}</div>
      </div>
      <div class="wish-meta">
        <div class="price-tag">$${x.price}</div>
        <button class="icon-btn" onclick="openEdit(${x.id},'wishlist')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="buy-btn" onclick="markBought(${x.id})">mark bought</button>
      </div>
    </div>`
  ).join('') + '</div>';
}

function render(){const q=document.getElementById('search').value.toLowerCase(),g=document.getElementById('genre-filter').value;const lf=library.filter(x=>(!q||x.artist.toLowerCase().includes(q)||x.album.toLowerCase().includes(q))&&(!g||x.genre===g));const wf=wishlist.filter(x=>(!q||x.artist.toLowerCase().includes(q)||x.album.toLowerCase().includes(q))&&(!g||x.genre===g));document.getElementById('lib-count').textContent=library.length;document.getElementById('wish-count').textContent=wishlist.filter(x=>!x.bought).length;document.getElementById('stat-flac').textContent=library.filter(x=>x.format==='FLAC').length;document.getElementById('stat-mp3').textContent=library.filter(x=>x.format==='MP3').length;const rated=library.filter(x=>x.rating>0);document.getElementById('stat-rating').textContent=rated.length?(rated.reduce((s,x)=>s+x.rating,0)/rated.length).toFixed(1):'--';document.getElementById('content').innerHTML=currentTab==='library'?renderLibrary(lf):renderWishlist(wf);}

// CRUD
function getItem(id,lst){return(lst==='library'?library:wishlist).find(x=>x.id===id);}
function quickRate(id,lst,n){const x=getItem(id,lst);if(x){x.rating=n;saveState();render();}}
function markBought(id){const x=wishlist.find(x=>x.id===id);if(!x)return;x.bought=true;library.push({id:Date.now(),artist:x.artist,album:x.album,year:x.year,genre:x.genre,format:'FLAC',source:'Bandcamp',rating:0,notes:'',artUrl:x.artUrl,mbId:null,bcUrl:x.bcUrl||null});saveState();render();showToast('"'+x.album+'" moved to library');}
function openAdd(){selArt=null;selMbId=null;document.getElementById('lib-fields').style.display=currentTab==='library'?'block':'none';document.getElementById('wish-fields').style.display=currentTab==='wishlist'?'block':'none';document.getElementById('add-modal-title').textContent=currentTab==='library'?'add to library':'add to wishlist';document.getElementById('mb-results-wrap').style.display='none';document.getElementById('mb-results').innerHTML='';document.getElementById('art-preview').style.display='none';document.getElementById('preview-img').src='';['f-artist','f-album','f-year','f-notes','f-wish-notes','f-price','mb-query','f-bcurl','f-bcurl-wish'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});document.getElementById('f-genre').value='';document.getElementById('add-modal').classList.add('open');setTimeout(()=>document.getElementById('mb-query').focus(),100);}
function saveAdd(){const artist=document.getElementById('f-artist').value.trim(),album=document.getElementById('f-album').value.trim();if(!artist||!album){showToast('artist and album required');return;}const year=parseInt(document.getElementById('f-year').value)||new Date().getFullYear();const genre=document.getElementById('f-genre').value||'';if(currentTab==='library'){library.push({id:Date.now(),artist,album,year,genre,format:document.getElementById('f-format').value,source:document.getElementById('f-source').value,rating:0,notes:document.getElementById('f-notes').value.trim(),artUrl:selArt,mbId:selMbId,bcUrl:document.getElementById('f-bcurl').value.trim()||null});showToast('"'+album+'" added to library');}else{wishlist.push({id:Date.now(),artist,album,year,genre,price:parseFloat(document.getElementById('f-price').value)||0,priority:document.getElementById('f-priority').value,notes:document.getElementById('f-wish-notes').value.trim(),bought:false,artUrl:selArt,bcUrl:document.getElementById('f-bcurl-wish').value.trim()||null});showToast('"'+album+'" added to wishlist');}saveState();closeModal('add-modal');render();}
function renderEditStars(){document.getElementById('edit-stars').innerHTML=Array.from({length:5},(_,i)=>'<span class="edit-star'+(i<editRating?' on':'')+'" onclick="setEditRating('+(i+1)+')">★</span>').join('');}
function setEditRating(n){editRating=n;renderEditStars();}
function openEdit(id,lst){const item=getItem(id,lst);if(!item)return;editingId=id;editingList=lst;editRating=item.rating||0;document.getElementById('del-confirm').classList.remove('show');document.getElementById('edit-title').textContent='edit · '+item.album;const thumb=document.getElementById('edit-thumb');if(item.artUrl){thumb.innerHTML=`<img src="${item.artUrl}" onerror="this.parentElement.textContent='💿'">`;}else{thumb.textContent=em(item.artist);}document.getElementById('edit-art-url').value=item.artUrl||'';renderEditStars();document.getElementById('edit-artist').value=item.artist;document.getElementById('edit-album').value=item.album;document.getElementById('edit-year').value=item.year||'';document.getElementById('edit-genre').value=item.genre||'';if(lst==='library'){document.getElementById('edit-lib-fields').style.display='block';document.getElementById('edit-wish-fields').style.display='none';document.getElementById('edit-format').value=item.format||'FLAC';document.getElementById('edit-source').value=item.source||'Bandcamp';document.getElementById('edit-bcurl').value=item.bcUrl||'';document.getElementById('edit-notes').value=item.notes||'';}else{document.getElementById('edit-lib-fields').style.display='none';document.getElementById('edit-wish-fields').style.display='block';document.getElementById('edit-price').value=item.price||0;document.getElementById('edit-priority').value=item.priority||'mid';document.getElementById('edit-bcurl-wish').value=item.bcUrl||'';document.getElementById('edit-wish-notes').value=item.notes||'';}document.getElementById('edit-modal').classList.add('open');}
async function retryArt(){const item=getItem(editingId,editingList);if(!item)return;const key=item.mbId||item.artist+'::'+item.album;delete artCache[key];showToast('fetching art...');const url=await getArt(item.artist,item.album,item.mbId||null);if(url){item.artUrl=url;document.getElementById('edit-thumb').innerHTML=`<img src="${url}" onerror="this.parentElement.textContent='💿'">`;document.getElementById('edit-art-url').value=url;saveState();render();showToast('art loaded');}else showToast('no art found');}
function saveEdit(){const item=getItem(editingId,editingList);if(!item)return;item.artist=document.getElementById('edit-artist').value.trim()||item.artist;item.album=document.getElementById('edit-album').value.trim()||item.album;item.year=parseInt(document.getElementById('edit-year').value)||item.year;item.genre=document.getElementById('edit-genre').value||'';item.rating=editRating;const manualUrl=document.getElementById('edit-art-url').value.trim();item.artUrl=manualUrl||null;if(editingList==='library'){item.format=document.getElementById('edit-format').value;item.source=document.getElementById('edit-source').value;item.bcUrl=document.getElementById('edit-bcurl').value.trim()||null;item.notes=document.getElementById('edit-notes').value.trim();}else{item.price=parseFloat(document.getElementById('edit-price').value)||0;item.priority=document.getElementById('edit-priority').value;item.bcUrl=document.getElementById('edit-bcurl-wish').value.trim()||null;item.notes=document.getElementById('edit-wish-notes').value.trim();}saveState();closeModal('edit-modal');render();showToast('"'+item.album+'" updated');}
function showDel(){const item=getItem(editingId,editingList);document.getElementById('del-name').textContent=item?'"'+item.album+'"':'this';document.getElementById('del-confirm').classList.add('show');}
function confirmDelete(){if(editingList==='library')library=library.filter(x=>x.id!==editingId);else wishlist=wishlist.filter(x=>x.id!==editingId);saveState();closeModal('edit-modal');render();showToast('removed');}

// MODAL
function openImport(){document.getElementById('import-modal').classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function bgClose(e,id){if(e.target===document.getElementById(id))closeModal(id);}

// CSV
function dragOver(e){e.preventDefault();document.getElementById('drop-zone').classList.add('drag-over');}
function dragLeave(){document.getElementById('drop-zone').classList.remove('drag-over');}
function dropFile(e){e.preventDefault();dragLeave();const f=e.dataTransfer.files[0];if(f)processCSV(f);}
function handleFile(e){const f=e.target.files[0];if(f)processCSV(f);}
function splitCSV(line){const cols=[];let cur='',inQ=false;for(const c of line){if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){cols.push(cur.trim());cur='';}else cur+=c;}cols.push(cur.trim());return cols;}
function parseCSV(text){const lines=text.split(/\r?\n/);if(!lines.length)return[];const header=splitCSV(lines[0]).map(h=>h.toLowerCase().trim());const rows=[];for(let i=1;i<lines.length;i++){const l=lines[i].trim();if(!l)continue;const cols=splitCSV(l);const row={};header.forEach((h,i)=>row[h]=(cols[i]||'').replace(/^"|"$/g,''));rows.push(row);}return rows;}
async function processCSV(file){
  const status=document.getElementById('import-status');
  status.textContent='reading file...';
  const text=await file.text();
  const rows=parseCSV(text);
  if(!rows.length){status.textContent='no data found';return;}
  
  const keys=Object.keys(rows[0]);
  const aKey=keys.find(k=>k.includes('artist'))||keys[0];
  
  // FIXED: Explicitly checks for 'name' from your custom file headers
  const tKey=keys.find(k=>k.includes('title')||k.includes('album')||k.includes('name'))||keys[1];
  
  const dKey=keys.find(k=>k.includes('release date')||k.includes('release_date'))||keys.find(k=>k.includes('date'));
  const fKey=keys.find(k=>k.includes('format'));
  const uKey=keys.find(k=>k.includes('url')||k.includes('link'));
  
  let added=0,skipped=0;
  for(const row of rows){
    const artist=(row[aKey]||'').trim(),album=(row[tKey]||'').trim();
    if(!artist&&!album){skipped++;continue;}
    if(library.find(l=>l.artist.toLowerCase()===artist.toLowerCase()&&l.album.toLowerCase()===album.toLowerCase())){
      skipped++;continue;
    }
    const dateStr=dKey?row[dKey]||'':'';
    const year=dateStr?parseInt(dateStr.slice(0,4))||null:null;
    const fmt=fKey?row[fKey]||'':'';
    
    library.push({
      id:Date.now()+added,
      artist,
      album,
      year,
      genre:'',
      format:fmt.toLowerCase().includes('flac')?'FLAC':'MP3',
      source:'Bandcamp',
      rating:0,
      notes:'',
      artUrl:null,
      mbId:null,
      bcUrl:uKey?row[uKey]||null:null
    });
    added++;
  }
  saveState();
  render();
  showToast('imported '+added);
  status.textContent='fetching art...';
  await loadAllArt();
  status.textContent='done';
}
// TOAST
function showToast(msg){const t=document.getElementById('toast');document.getElementById('toast-msg').textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800);}

// INIT
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal('add-modal');closeModal('edit-modal');closeModal('import-modal');}});
loadState().then(()=>{const v=localStorage.getItem('crate-v')||'1.0.0';if(document.getElementById('version'))document.getElementById('version').textContent=v;render();});
