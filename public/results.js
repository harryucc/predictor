document.addEventListener('DOMContentLoaded', async () => {
  const listBody = document.getElementById('resultsBody');
  const headers = document.querySelectorAll('th[data-sort]');

  // default sort: most recent first
  let entries = [];
  let sortKey = 'createdAt';
  let sortDir = 'desc';

  // Firebase setup (same config as app.js)
  const firebaseConfig = {
    apiKey: "AIzaSyAS5PvPMYQjCQz88drt1VG6B5Y2v3PpjZM",
    authDomain: "lcpredic.firebaseapp.com",
    projectId: "lcpredic"
  };
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();

  function colorFor(mean, target) {
    if (!target || !mean) return '#6c757d';
    if (target > mean) return '#dc3545';
    const ratio = mean / target;
    const light = 45 - Math.min((ratio - 1) * 25, 25); // deepen with ratio
    return `hsl(120, 70%, ${light}%)`;
  }

  function compare(a, b) {
    const dir = sortDir === 'asc' ? 1 : -1;
    let vA = a[sortKey];
    let vB = b[sortKey];
    if (sortKey === 'school') {
      return dir * vA.localeCompare(vB);
    }
    if (sortKey === 'createdAt') {
      vA = vA ? vA.getTime() : 0;
      vB = vB ? vB.getTime() : 0;
      return dir * (vA - vB);
    }
    return dir * (vA - vB);
  }

  function updateIndicators() {
    headers.forEach(th => {
      const key = th.dataset.sort;
      const base = th.dataset.label || th.textContent.replace(/[▲▼]/g, '').trim();
      th.dataset.label = base;
      th.textContent = base;
      th.style.cursor = 'pointer';
      if (key === sortKey) {
        th.textContent = `${base} ${sortDir === 'asc' ? '▲' : '▼'}`;
      }
    });
  }

  function render() {
    listBody.innerHTML = '';
    const sorted = entries.slice().sort(compare);
    if (sorted.length === 0) {
      listBody.innerHTML = '<tr><td colspan="4" class="text-muted">No published results yet.</td></tr>';
      updateIndicators();
      return;
    }
    sorted.forEach(r => {
      const colour = colorFor(r.mean, r.target);
      const created = r.createdAt ? r.createdAt.toLocaleString() : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.school}</td>
        <td class="fw-bold" style="color:${colour}">${r.mean.toFixed(1)}</td>
        <td class="fw-bold" style="color:${colour}">${r.target}</td>
        <td>${created}</td>
      `;
      listBody.appendChild(tr);
    });
    updateIndicators();
  }

  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDir = key === 'school' ? 'asc' : 'desc';
      }
      render();
    });
  });

  try {
    const snap = await db.collectionGroup('predictions')
      .where('publish', '==', true)
      .get();

    if (snap.empty) {
      entries = [];
      render();
      return;
    }

    // Track highest mean score per user
    const topByUser = new Map();
    snap.forEach(doc => {
      const data = doc.data();
      const mean = data.meanMarks ? Number(data.meanMarks) : 0;
      const uid = doc.ref && doc.ref.parent && doc.ref.parent.parent
        ? doc.ref.parent.parent.id
        : null;
      if (!uid) return; // skip if we cannot determine uid
      const current = topByUser.get(uid);
      if (!current || mean > current.mean) {
        topByUser.set(uid, { data, mean });
      }
    });

    entries = Array.from(topByUser.values()).map(({ data, mean }) => ({
      school: data.school || '',
      mean,
      target: data.desiredMarks ? Number(data.desiredMarks) : 0,
      createdAt: (data.createdAt && typeof data.createdAt.toDate === 'function')
        ? data.createdAt.toDate()
        : null
    }));

    render();
  } catch (err) {
    listBody.innerHTML = `<tr><td colspan="4" class="text-danger">${err.message || err}</td></tr>`;
  }
});

