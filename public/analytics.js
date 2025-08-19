document.addEventListener('DOMContentLoaded', async () => {
  const schoolList = document.getElementById('schoolList');
  const subjectList = document.getElementById('subjectList');

  const firebaseConfig = {
    apiKey: "AIzaSyAS5PvPMYQjCQz88drt1VG6B5Y2v3PpjZM",
    authDomain: "lcpredic.firebaseapp.com",
    projectId: "lcpredic"
  };
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();

  try {
    const snap = await db.collectionGroup('predictions')
      .where('publish', '==', true)
      .get();

    const schoolStats = new Map();
    const subjectStats = new Map();

    const normalizeSchoolName = name => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w && w.length > 2 && !['college', 'school', 'secondary', 'community', 'the', 'of', 'and'].includes(w))
        .join(' ');
    };

    snap.forEach(doc => {
      const data = doc.data();
      const mean = typeof data.meanMarks === 'number' ? data.meanMarks : null;
      const school = data.school;
      if (school && mean !== null) {
        const key = normalizeSchoolName(school);
        if (key) {
          const entry = schoolStats.get(key) || { total: 0, count: 0, display: school };
          entry.total += mean;
          entry.count += 1;
          if (!schoolStats.has(key)) {
            entry.display = school;
          }
          schoolStats.set(key, entry);
        }
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
    });

    const schools = Array.from(schoolStats.entries())
      .filter(([_, { count }]) => count > 1)
      .map(([_, { total, count, display }]) => ({ school: display, avg: total / count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    const subjects = Array.from(subjectStats.entries())
      .map(([name, { total, count }]) => ({ name, avg: total / count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

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
  } catch (err) {
    const msg = err.message || String(err);
    schoolList.innerHTML = `<li class="text-danger">${msg}</li>`;
    subjectList.innerHTML = `<li class="text-danger">${msg}</li>`;
  }
});
