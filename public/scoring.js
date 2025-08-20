document.addEventListener('DOMContentLoaded', async () => {
  const schoolList = document.getElementById('schoolList');
  const subjectList = document.getElementById('subjectList');
  const listBody = document.getElementById('resultsBody');
  const headers = document.querySelectorAll('th[data-sort]');

  let entries = [];
  let sortKey = 'createdAt';
  let sortDir = 'desc';

  const firebaseConfig = {
    apiKey: "AIzaSyAS5PvPMYQjCQz88drt1VG6B5Y2v3PpjZM",
    authDomain: "lcpredic.firebaseapp.com",
    projectId: "lcpredic"
  };
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();

  function normalizeSchool(name) {
    return name.toLowerCase()
      .replace(/\b(colaiste|coláiste|college|school|secondary|community|cbs|of|the|and)\b/g, '')
      .replace(/[^a-z]/g, '')
      .trim();
  }

  function displaySchool(name) {
    return name.replace(/\b(College|School|Secondary|Community|Colaiste|Coláiste|Cbs)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function colorFor(mean, target) {
    if (!target || !mean) return '#6c757d';
    if (target > mean) return '#dc3545';
    const ratio = mean / target;
    const light = 45 - Math.min((ratio - 1) * 25, 25);
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

    const subjectStats = new Map();
    const schoolStats = new Map();
    const topByUser = new Map();

    snap.forEach(doc => {
      const data = doc.data();
      const mean = typeof data.meanMarks === 'number' ? data.meanMarks : 0;

      const school = data.school;
      if (school && mean) {
        const key = normalizeSchool(school);
        const entry = schoolStats.get(key) || { name: displaySchool(school), total: 0, count: 0 };
        entry.total += mean;
        entry.count += 1;
        schoolStats.set(key, entry);
      }

      if (Array.isArray(data.subjects)) {
        data.subjects.forEach(sub => {
          if (!sub || typeof sub.expected !== 'number' || !sub.name) return;
          const sEntry = subjectStats.get(sub.name) || { total: 0, count: 0 };
          sEntry.total += sub.expected;
          sEntry.count += 1;
          subjectStats.set(sub.name, sEntry);
        });
      }

      const uid = doc.ref && doc.ref.parent && doc.ref.parent.parent
        ? doc.ref.parent.parent.id
        : null;
      if (!uid) return;
      const current = topByUser.get(uid);
      if (!current || mean > current.mean) {
        topByUser.set(uid, { data, mean });
      }
    });

    const subjects = Array.from(subjectStats.entries())
      .map(([name, { total, count }]) => ({ name, avg: total / count }))
      .sort((a, b) => b.avg - a.avg);

    subjectList.innerHTML = '';
    if (subjects.length === 0) {
      subjectList.innerHTML = '<li class="text-muted">No data</li>';
    } else {
      subjects.forEach(({ name, avg }) => {
        const li = document.createElement('li');
        li.textContent = `${name} – ${avg.toFixed(1)}`;
        subjectList.appendChild(li);
      });
    }

    const schools = Array.from(schoolStats.values())
      .filter(({ count }) => count > 2)
      .map(({ name, total, count }) => ({ school: name, avg: total / count }))
      .sort((a, b) => b.avg - a.avg);

    schoolList.innerHTML = '';
    if (schools.length === 0) {
      schoolList.innerHTML = '<li class="text-muted">No data</li>';
    } else {
      schools.forEach(({ school, avg }) => {
        const li = document.createElement('li');
        li.textContent = `${school} – ${avg.toFixed(1)}`;
        schoolList.appendChild(li);
      });
    }

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
    const msg = err.message || String(err);
    subjectList.innerHTML = `<li class="text-danger">${msg}</li>`;
    schoolList.innerHTML = `<li class="text-danger">${msg}</li>`;
    listBody.innerHTML = `<tr><td colspan="4" class="text-danger">${msg}</td></tr>`;
  }
});

