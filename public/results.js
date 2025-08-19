document.addEventListener('DOMContentLoaded', async () => {
  const listBody = document.getElementById('resultsBody');

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
    const ratio = mean / target;
    if (ratio >= 1) {
      const light = 45 - Math.min((ratio - 1) * 25, 25); // deepen with ratio
      return `hsl(120, 70%, ${light}%)`;
    }
    if (ratio >= 0.9) {
      return '#6c757d'; // within 10% below target
    }
    const light = 50 - Math.min((0.9 - ratio) * 100, 25); // deepen red as ratio drops
    return `hsl(0, 70%, ${light}%)`;
  }

  try {
    const snap = await db.collectionGroup('predictions')
      .where('publish', '==', true)
      .orderBy('publishedAt', 'desc')
      .get();

    listBody.innerHTML = '';
    if (snap.empty) {
      listBody.innerHTML = '<tr><td colspan="3" class="text-muted">No published results yet.</td></tr>';
      return;
    }

    snap.forEach(doc => {
      const data = doc.data();
      const mean = data.meanMarks ? Number(data.meanMarks) : 0;
      const target = data.desiredMarks ? Number(data.desiredMarks) : 0;
      const colour = colorFor(mean, target);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${data.school || ''}</td>
        <td class="fw-bold" style="color:${colour}">${mean.toFixed(1)}</td>
        <td class="fw-bold" style="color:${colour}">${target}</td>
      `;
      listBody.appendChild(tr);
    });
  } catch (err) {
    listBody.innerHTML = `<tr><td colspan="3" class="text-danger">${err.message || err}</td></tr>`;
  }
});