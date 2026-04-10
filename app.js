let cardData = [];
let resources = { heat: 5, hype: 5, clout: 5 };
let packs = 1;
let showNumber = 1;
let hand = [];
let activeCards = [];
let currentWeekMatches = [];
let weekHistory = [];
let selectedMatchId = null;
let pendingCardItem = null;
let pendingMatchId = null;
let drawnCards = [];
let flippedCount = 0;
let promoResolved = 0;
let selectedHandItem = null;
const HAND_LIMIT = 5;

function isRunningOnServer() {
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

async function init() {
  if (!isRunningOnServer()) {
    toast('Please run this app from a local web server instead of opening index.html directly.', 'error');
    console.error('packs.json fetch blocked when loaded via file://. Use a local server (e.g. python3 -m http.server).');
    return;
  }

  try {
    const res = await fetch('packs.json');
    const index = await res.json();
    packs = Array.isArray(index.packs) ? index.packs.length : 0;
    const packPromises = (index.packs || []).map(p => fetch(p).then(r => r.json()));
    cardData = await Promise.all(packPromises);
    renderStore();
  } catch (e) {
    toast('Failed to load card packs. Check packs.json exists.', 'error');
    console.error(e);
  }
  updateHUD();
}

function updateHUD() {
  ['heat','hype','clout'].forEach(r => {
    const el = document.getElementById(`res-${r}`);
    const newVal = resources[r];
    if (el.textContent !== String(newVal)) {
      el.textContent = newVal;
      el.closest('.pill').classList.remove('bump');
      void el.closest('.pill').offsetWidth;
      el.closest('.pill').classList.add('bump');
    }
  });

  document.getElementById('packs-count').textContent = packs;
  document.getElementById('packs-count-side').textContent = packs;
  document.getElementById('show-title').textContent = `WEEK ${showNumber} – RAW`;

  const packsButtonBadge = document.getElementById('packs-button-badge');
  if (packs > 0 && packsButtonBadge) {
    packsButtonBadge.textContent = packs;
    packsButtonBadge.style.display = 'flex';
  } else if (packsButtonBadge) {
    packsButtonBadge.style.display = 'none';
  }

  const handCount = hand.length;
  const handBadge = document.getElementById('hand-badge');
  if (handCount > 0) {
    handBadge.textContent = handCount;
    handBadge.style.display = 'flex';
  } else {
    handBadge.style.display = 'none';
  }
  const handCountSide = document.getElementById('hand-count-side');
  if (handCountSide) handCountSide.textContent = handCount;

  const activeCount = activeCards.length;
  const activeBadge = document.getElementById('active-badge');
  if (activeCount > 0) {
    activeBadge.textContent = activeCount;
    activeBadge.style.display = 'flex';
  } else {
    activeBadge.style.display = 'none';
  }
  const activeCountSide = document.getElementById('active-count-side');
  if (activeCountSide) activeCountSide.textContent = activeCount;

  renderDashboard();
  renderActive();
}

function renderDashboard() {
  const weekLabel = document.getElementById('dashboard-week');
  const packLabel = document.getElementById('dashboard-packs-count');
  const handLabel = document.getElementById('dashboard-hand-count');
  const activeLabel = document.getElementById('dashboard-active-count');

  if (weekLabel) weekLabel.textContent = `WEEK ${showNumber}`;
  if (packLabel) packLabel.textContent = packs;
  if (handLabel) handLabel.textContent = hand.length;
  if (activeLabel) activeLabel.textContent = activeCards.length;
}

function renderStars(matchId, currentRating) {
  const rating = currentRating || 0;
  let starsHtml = '';
  for (let i = 1; i <= 6; i++) {
    let starClass = 'star';
    if (rating >= i) {
      starClass += ' full';
    } else if (rating >= i - 0.5) {
      starClass += ' half';
    }
    starsHtml += `<span class="${starClass}" data-star-index="${i}" onclick="event.stopPropagation(); chooseMatchRating(event, '${matchId}', ${i})" onmousemove="event.stopPropagation(); previewMatchRating(event, '${matchId}', ${i})" onmouseout="resetMatchRatingPreview('${matchId}')">★</span>`;
  }
  return starsHtml;
}

function chooseMatchRating(event, matchId, starIndex) {
  const width = event.target.clientWidth || event.target.offsetWidth;
  const clickValue = (event.offsetX || 0) < width / 2 ? starIndex - 0.5 : starIndex;
  setMatchRating(matchId, clickValue);
}

function previewMatchRating(event, matchId, starIndex) {
  const width = event.target.clientWidth || event.target.offsetWidth;
  const hoverValue = (event.offsetX || 0) < width / 2 ? starIndex - 0.5 : starIndex;
  updateStarPreview(matchId, hoverValue);
}

function updateStarPreview(matchId, previewValue) {
  const matchCard = document.querySelector(`[data-match-id="${matchId}"]`);
  if (!matchCard) return;
  const stars = matchCard.querySelectorAll('.star');
  stars.forEach((star, idx) => {
    const starIndex = idx + 1;
    star.classList.remove('full', 'half', 'hover');
    if (previewValue >= starIndex) {
      star.classList.add('hover');
    } else if (previewValue >= starIndex - 0.5) {
      star.classList.add('hover', 'half');
    }
  });
}

function resetMatchRatingPreview(matchId) {
  const matchCard = document.querySelector(`[data-match-id="${matchId}"]`);
  if (!matchCard) return;
  const stars = matchCard.querySelectorAll('.star');
  const match = currentWeekMatches.find(m => m.id === matchId);
  const rating = match ? (match.rating || 0) : 0;
  stars.forEach((star, idx) => {
    const starIndex = idx + 1;
    star.classList.remove('hover', 'full', 'half');
    if (rating >= starIndex) {
      star.classList.add('full');
    } else if (rating >= starIndex - 0.5) {
      star.classList.add('half');
    }
  });
}

function renderMatchList() {
  const list = document.getElementById('match-list');
  if (!list) return;
  list.innerHTML = '';

  if (currentWeekMatches.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🥊</div><p>No matches yet.<br>Add one to start building the card show.</p></div>`;
    return;
  }

  currentWeekMatches.forEach((match, index) => {
    const isMain = index === 0;
    const el = document.createElement('div');
    el.className = `match-card${match.id === selectedMatchId ? ' selected' : ''}`;
    el.setAttribute('data-match-id', match.id);
    el.onclick = () => selectMatch(match.id);
    el.innerHTML = `
      <div class="match-card-title">
        <span>${match.name}</span>
        ${isMain ? '<span class="match-badge">MAIN EVENT</span>' : ''}
      </div>
      <div class="match-card-meta">
        <label class="match-rating-label">Rating</label>
        <div class="star-rating">${renderStars(match.id, match.rating)}</div>
      </div>
      <div class="match-card-assigned">
        <strong>Assigned cards:</strong> ${match.cardsAssigned.length}
        ${match.cardsAssigned.length > 0 ? `<div class="match-assigned-list">${match.cardsAssigned.map(c => `<span>${c.title}</span>`).join('')}</div>` : ''}
      </div>
      <button class="btn-red btn-small" onclick="event.stopPropagation(); deleteMatch('${match.id}')">🗑️</button>
    `;
    list.appendChild(el);
  });
}

function addMatch() {
  const nextNumber = currentWeekMatches.length + 1;
  const match = {
    id: `match-${Date.now()}-${nextNumber}`,
    name: `Match ${nextNumber}`,
    rating: 0,
    cardsAssigned: []
  };
  currentWeekMatches.unshift(match);
  selectedMatchId = match.id;
  renderMatchList();
  toast(`Match ${match.name} added.`, 'success');
}

function selectMatch(id) {
  selectedMatchId = id;
  renderMatchList();
}

function setMatchRating(matchId, value) {
  const match = currentWeekMatches.find(m => m.id === matchId);
  if (!match) return;
  match.rating = value;
  renderMatchList();
}

function deleteMatch(matchId) {
  currentWeekMatches = currentWeekMatches.filter(m => m.id !== matchId);
  toast('Match deleted.', 'success');
  renderMatchList();
}

function renderHistory() {
  const weekList = document.getElementById('history-week-list');
  const detail = document.getElementById('history-detail');
  if (!weekList || !detail) return;
  weekList.innerHTML = '';

  if (weekHistory.length === 0) {
    detail.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No history yet.<br>Complete a week to save show history.</p></div>`;
    return;
  }

  weekHistory.forEach(entry => {
    const btn = document.createElement('button');
    btn.className = 'history-week-btn';
    btn.textContent = `Week ${entry.week}`;
    btn.onclick = () => renderHistoryEntry(entry.week);
    weekList.appendChild(btn);
  });
  renderHistoryEntry(weekHistory[0].week);
}

function renderHistoryEntry(week) {
  const detail = document.getElementById('history-detail');
  const weekList = document.getElementById('history-week-list');
  const weekEntry = weekHistory.find(entry => entry.week === week);
  if (!weekEntry || !detail || !weekList) return;

  weekList.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === `Week ${week}`);
  });

  detail.innerHTML = `
    <div class="history-summary">
      <p><strong>Week ${weekEntry.week}</strong> · Packs left: ${weekEntry.packs} · Hand size: ${weekEntry.handCount}</p>
    </div>
    <div class="history-section">
      <div class="section-block-title">Matches</div>
      <div class="history-match-list">
        ${weekEntry.matches.map(match => `
          <div class="history-match-card">
            <div class="history-match-title">
              <span>${match.name}</span>
              ${match.mainEvent ? '<span class="match-badge">MAIN EVENT</span>' : ''}
            </div>
            <div class="history-match-rating">Rating: ${match.rating || '—'}</div>
            <div class="history-match-assigned">${match.cardsAssigned.length} card(s) assigned: ${match.cardsAssigned.map(c => c.title).join(', ') || 'none'}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="history-section">
      <div class="section-block-title">Active Effects</div>
      <div class="history-active-list">${weekEntry.activeCards.length ? weekEntry.activeCards.map(ac => `<span>${ac.title} (${ac.type})</span>`).join('') : 'None'}</div>
    </div>
  `;
}

function renderStore() {
  const list = document.getElementById('pack-list');
  list.innerHTML = '';
  cardData.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'pack-card';
    el.innerHTML = `
      <span class="pack-icon">${p.icon || '📦'}</span>
      <div class="pack-name">${p.name.toUpperCase()}</div>
      <div class="pack-count-tag">3 CARDS</div>`;
    el.onclick = () => openPack(i);
    list.appendChild(el);
  });
}

function openPack(idx) {
  if (packs <= 0) return toast('No packs available!', 'error');
  const forcedHeel = hand.find(h =>
    h.card.cardType === 'heel' &&
    (h.card.use === 'Immediately' || h.card.use === 'Immediate')
  );
  if (forcedHeel) return toast('Resolve the forced Heel card in your hand first!', 'error');

  packs--;
  const pack = cardData[idx];
  drawnCards = drawCards(pack);
  flippedCount = 0;
  promoResolved = 0;

  const row = document.getElementById('cards-row');
  row.innerHTML = '';
  document.getElementById('reveal-guide').textContent = '';
  document.getElementById('add-to-hand-btn').style.display = 'none';

  drawnCards.forEach((c, i) => {
    const el = createCardEl(c);
    el.style.animationDelay = `${i * 0.12}s`;
    el.querySelector('.card-front').onclick = () => flipCard(el, c);
    row.appendChild(el);
  });

  switchView('view-reveal', null);
  updateHUD();
}

function drawCards(pack) {
  const pull = type => {
    const pool = pack.cards.filter(c => c.cardType === type);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  };
  return [pull('heel'), pull('face'), pull('promo')].filter(Boolean).sort(() => Math.random() - 0.5);
}

function flipCard(el, card) {
  if (el.classList.contains('flipped')) return;
  el.classList.add('flipped');
  flippedCount++;

  if (card.cardType === 'promo') {
    setTimeout(() => {
      const btn = document.createElement('button');
      btn.className = 'claim-btn';
      btn.textContent = '✦ CLAIM';
      btn.onclick = e => {
        e.stopPropagation();
        Object.entries(card.grants || {}).forEach(([r, v]) => {
          resources[r] = (resources[r] || 0) + v;
          toast(`+${v} ${r.charAt(0).toUpperCase() + r.slice(1)}`, 'success');
        });
        promoResolved++;
        el.style.opacity = '0.5';
        btn.disabled = true;
        btn.textContent = '✓ CLAIMED';
        checkRevealDone();
        updateHUD();
      };
      el.querySelector('.card-back').appendChild(btn);
    }, 400);
  } else {
    checkRevealDone();
  }
}

function checkRevealDone() {
  const promoCount = drawnCards.filter(c => c.cardType === 'promo').length;
  const allFlipped = flippedCount >= drawnCards.length;
  const promosDone = promoResolved >= promoCount;
  if (allFlipped && promosDone) {
    document.getElementById('reveal-guide').textContent = 'All cards revealed! Add them to your hand.';
    document.getElementById('add-to-hand-btn').style.display = 'inline-block';
  } else if (allFlipped && !promosDone) {
    document.getElementById('reveal-guide').textContent = 'Claim your Promo bonus first!';
  }
}

function addCardsToHand() {
  drawnCards.forEach(c => {
    if (c.cardType !== 'promo') {
      hand.push({
        card: c,
        useWindow: parseUseWindow(c.use)
      });
    }
  });
  drawnCards = [];
  switchView('view-packs', document.getElementById('nav-packs'));
  updateHUD();

  const hasForced = hand.some(h =>
    h.card.cardType === 'heel' &&
    (h.card.use === 'Immediately' || h.card.use === 'Immediate')
  );
  if (hasForced) toast('⚠️ Forced Heel card in hand — play it now!', 'error');
}

function parseUseWindow(useStr) {
  if (!useStr) return null;
  if (useStr.includes('within')) {
    const m = useStr.match(/\d+/);
    return m ? parseInt(m[0]) : null;
  }
  return null;
}

function showOverlay(id) {
  document.getElementById(id).classList.add('active');
  if (id === 'hand-overlay') renderHand();
  if (id === 'active-overlay') renderActive();
}
function hideOverlay(id) {
  document.getElementById(id).classList.remove('active');
}

function renderHand() {
  const grid = document.getElementById('hand-grid');
  grid.innerHTML = '';
  selectedHandItem = null;
  document.getElementById('hand-action-panel').classList.remove('visible');
  document.getElementById('hand-hint').style.display = 'block';

  const nonForced = hand.filter(h => !(h.card.cardType === 'heel' && isImmediate(h.card.use)));
  document.getElementById('hand-slots-label').textContent =
    `${nonForced.length}/${HAND_LIMIT} slots used`;

  if (hand.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🃏</div><p>Your hand is empty.<br>Open a pack to get cards.</p></div>`;
    return;
  }

  hand.forEach(h => {
    const el = createCardEl(h.card);
    el.classList.add('flipped');

    if (h.useWindow !== null) {
      const tag = document.createElement('div');
      tag.className = 'use-window-tag';
      tag.textContent = `Expires in ${h.useWindow}w`;
      el.querySelector('.card-back').appendChild(tag);
    }

    el.onclick = () => {
      document.querySelectorAll('#hand-grid .card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      selectedHandItem = h;

      const panel = document.getElementById('hand-action-panel');
      panel.classList.add('visible');
      document.getElementById('hand-hint').style.display = 'none';

      const playBtn = document.getElementById('play-btn');
      playBtn.disabled = !canAfford(h.card);
      playBtn.textContent = canAfford(h.card) ? 'PLAY CARD' : 'CAN\'T AFFORD';

      const discardBtn = document.getElementById('discard-btn');
      discardBtn.style.display = h.card.cardType === 'heel' ? 'none' : 'block';
    };

    grid.appendChild(el);
  });
}

function playSelectedCard() {
  if (!selectedHandItem) return;
  const h = selectedHandItem;
  if (!canAfford(h.card)) return toast('Not enough resources!', 'error');

  pendingCardItem = h;
  showMatchSelectionModal();
}

function showMatchSelectionModal() {
  const modal = document.getElementById('match-selection-modal');
  const list = document.getElementById('modal-match-list');
  list.innerHTML = '';

  if (currentWeekMatches.length === 0) {
    list.innerHTML = '<p style="color: var(--dim);">No matches available. Create one first.</p>';
  } else {
    currentWeekMatches.forEach((match, index) => {
      const isMain = index === 0;
      const btn = document.createElement('button');
      btn.className = 'modal-match-btn';
      btn.innerHTML = `
        <span>${match.name}</span>
        ${isMain ? '<span class="match-badge">MAIN EVENT</span>' : ''}
      `;
      btn.onclick = () => selectMatchForCard(match.id);
      list.appendChild(btn);
    });
  }

  modal.style.display = 'flex';
}

function selectMatchForCard(matchId) {
  pendingMatchId = matchId;
  const match = currentWeekMatches.find(m => m.id === matchId);
  const cardTitle = pendingCardItem.card.title;
  const matchName = match.name;
  const confText = document.getElementById('confirmation-text');
  confText.textContent = `Apply ${cardTitle} to ${matchName}?`;
  document.getElementById('match-selection-modal').style.display = 'none';
  document.getElementById('confirmation-modal').style.display = 'flex';
}

function confirmCardPlay() {
  if (!pendingCardItem || !pendingMatchId) return;
  const match = currentWeekMatches.find(m => m.id === pendingMatchId);
  if (!match) return;

  const h = pendingCardItem;
  Object.entries(h.card.cost || {}).forEach(([r, v]) => resources[r] -= v);
  match.cardsAssigned.push({ title: h.card.title, type: h.card.cardType });

  const durStr = h.card.duration || '';
  let dur = null;
  if (durStr === 'Permanent') {
    dur = null;
  } else {
    const parsed = parseInt(durStr);
    dur = isNaN(parsed) ? 0 : parsed;
  }

  if (dur !== 0 || durStr === 'Permanent') {
    activeCards.push({ card: h.card, duration: dur });
    toast(`${h.card.title} is now active on ${match.name}!`, 'success');
  } else {
    toast(`Played ${h.card.title} on ${match.name}!`, 'success');
  }

  hand = hand.filter(i => i !== h);
  document.getElementById('confirmation-modal').style.display = 'none';
  pendingCardItem = null;
  pendingMatchId = null;
  updateHUD();
  switchView('view-hand', document.getElementById('nav-hand'));
}

function cancelMatchSelection() {
  document.getElementById('match-selection-modal').style.display = 'none';
  pendingCardItem = null;
}

function cancelConfirmation() {
  document.getElementById('confirmation-modal').style.display = 'none';
  document.getElementById('match-selection-modal').style.display = 'flex';
}

function discardSelectedCard() {
  if (!selectedHandItem) return;
  if (selectedHandItem.card.cardType === 'heel') return toast('Cannot discard Heel cards!', 'error');
  hand = hand.filter(i => i !== selectedHandItem);
  updateHUD();
  renderHand();
}

function renderActive() {
  const grid = document.getElementById('active-grid');
  grid.innerHTML = '';

  if (activeCards.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚡</div><p>No active effects.<br>Play cards from your hand.</p></div>`;
  } else {
    activeCards.forEach(ac => {
      const el = createCardEl(ac.card);
      el.classList.add('flipped');
      el.style.cursor = 'default';

      const badge = document.createElement('div');
      badge.className = 'active-dur-badge';
      badge.textContent = ac.duration === null ? '∞' : ac.duration;
      el.appendChild(badge);

      grid.appendChild(el);
    });
  }
}

async function goToNextShow() {
  const nonForced = hand.filter(h => !(h.card.cardType === 'heel' && isImmediate(h.card.use)));
  if (nonForced.length > HAND_LIMIT) return toast(`Discard down to ${HAND_LIMIT} cards first!`, 'error');

  const hasForced = hand.some(h => h.card.cardType === 'heel' && isImmediate(h.card.use));
  if (hasForced) return toast('Play your forced Heel card before advancing!', 'error');

  switchView('view-transition', null);
  document.getElementById('trans-title').textContent = 'Processing Show…';
  document.getElementById('trans-msg').textContent = 'Ticking down active effects...';
  document.getElementById('finish-trans-btn').style.display = 'none';

  const area = document.getElementById('transition-cards-area');
  area.innerHTML = '';

  activeCards.forEach((ac, i) => {
    const el = document.createElement('div');
    el.className = 'mini-card';
    el.style.animationDelay = `${i * 0.1}s`;
    el.textContent = getTypeIcon(ac.card.cardType);
    const badge = document.createElement('div');
    badge.className = 'dur-badge';
    badge.textContent = ac.duration === null ? '∞' : `${ac.duration}w left`;
    el.appendChild(badge);
    area.appendChild(el);
  });

  await delay(1400);

  activeCards.forEach(ac => { if (ac.duration !== null) ac.duration--; });
  activeCards = activeCards.filter(ac => ac.duration === null || ac.duration > 0);

  hand.forEach(h => {
    if (h.useWindow !== null) h.useWindow--;
    if (h.useWindow === 0 && h.card.cardType === 'heel') h.card.use = 'Immediately';
  });
  hand = hand.filter(h => h.useWindow === null || h.useWindow > 0 || isImmediate(h.card.use));

  await delay(600);

  document.getElementById('trans-title').textContent = 'Show Complete!';
  document.getElementById('trans-msg').textContent = `Week ${showNumber} wrapped. A new pack is ready.`;
  document.getElementById('finish-trans-btn').style.display = 'inline-block';
  updateHUD();
}

function finishTransition() {
  saveWeekHistory();
  currentWeekMatches = [];
  selectedMatchId = null;
  showNumber++;
  packs++;
  document.getElementById('finish-trans-btn').style.display = 'none';
  switchView('view-packs', document.getElementById('nav-packs'));
  updateHUD();
  renderActive();
  toast(`Week ${showNumber} begins! New pack available.`, 'success');
}

function saveWeekHistory() {
  const snapshot = {
    week: showNumber,
    packs,
    handCount: hand.length,
    matches: currentWeekMatches.map((match, index) => ({
      name: match.name,
      rating: match.rating,
      cardsAssigned: match.cardsAssigned.map(c => ({ title: c.title, type: c.type })),
      mainEvent: index === 0
    })),
    activeCards: activeCards.map(ac => ({ title: ac.card.title, type: ac.card.cardType, duration: ac.duration }))
  };
  weekHistory.unshift(snapshot);
}

function createCardEl(card) {
  const el = document.createElement('div');
  el.className = 'card';

  let costHtml = '';
  if (card.cardType === 'promo') {
    costHtml = Object.entries(card.grants || {})
      .map(([r, v]) => `<span class="cost-chip plus">+${v} ${capitalise(r)}</span>`)
      .join('');
  } else {
    const entries = Object.entries(card.cost || {});
    if (entries.length > 0) {
      costHtml = entries
        .map(([r, v]) => `<span class="cost-chip minus">-${v} ${capitalise(r)}</span>`)
        .join('');
    } else {
      costHtml = `<span class="cost-chip free">FREE</span>`;
    }
  }

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-front">
        <div class="card-logo">${getTypeIcon(card.cardType)}</div>
        <div class="tap-hint">TAP TO REVEAL</div>
      </div>
      <div class="card-back ${card.cardType}">
        <div class="card-type-badge">${card.cardType.toUpperCase()}</div>
        <div class="card-title">${card.title}</div>
        <div class="card-desc">${card.desc}</div>
        <div class="card-footer">
          <div class="cost-row">${costHtml}</div>
        </div>
      </div>
    </div>`;

  return el;
}

function canAfford(card) {
  return Object.entries(card.cost || {}).every(([r, v]) => (resources[r] || 0) >= v);
}

function isImmediate(useStr) {
  return useStr === 'Immediately' || useStr === 'Immediate';
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getTypeIcon(type) {
  return { heel: '😈', face: '⭐', promo: '🎙️' }[type] || '🃏';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function switchView(id, navBtn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (navBtn) navBtn.classList.add('active');

  if (id === 'view-hand') {
    renderHand();
  }
  if (id === 'view-active') {
    renderActive();
  }
  if (id === 'view-matches') {
    renderMatchList();
  }
  if (id === 'view-history') {
    renderHistory();
  }
}

function toast(msg, type = 'info') {
  const container = document.getElementById('toast-layer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { error: '⚠️', success: '✅', info: '🔔' };
  t.innerHTML = `<span class="toast-ico">${icons[type] || '🔔'}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

init();
