(function(){
  const firebaseConfig = {
    apiKey: "AIzaSyAS5PvPMYQjCQz88drt1VG6B5Y2v3PpjZM",
    authDomain: "lcpredic.firebaseapp.com",
    projectId: "lcpredic"
  };
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();

  const authSection = document.getElementById('authSection');
  const resultsSection = document.getElementById('resultsSection');
  const predictionsList = document.getElementById('predictionsList');

  function showAuth(){
    authSection.style.display = 'block';
    resultsSection.style.display = 'none';
  }
  function showResults(){
    authSection.style.display = 'none';
    resultsSection.style.display = 'block';
    loadPredictions();
  }

  function loadPredictions(){
    const uid = auth.currentUser.uid;
    const ref = db.collection('users').doc(uid).collection('predictions').orderBy('createdAt','desc');
    ref.get().then(snapshot => {
      predictionsList.innerHTML = '';
      snapshot.forEach(doc => {
        const data = doc.data();
        const li = document.createElement('li');
        li.className = 'list-group-item';
        const date = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleDateString() : 'unknown';
        const actualVal = data.actualResults ? data.actualResults : '';
        li.innerHTML = `<div><strong>${data.desiredMarks ?? ''}</strong> points (mean ${data.meanMarks ?? ''}) - <small>${date}</small></div>` +
                       `<div class="mt-2 d-flex align-items-center gap-2"><input type="text" class="form-control form-control-sm actual-input" placeholder="Enter mock results" value="${actualVal}"><button class="btn btn-sm btn-outline-primary save-actual" data-id="${doc.id}">Save</button></div>`;
        predictionsList.appendChild(li);
      });
      predictionsList.querySelectorAll('.save-actual').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const li = btn.closest('li');
          const input = li.querySelector('.actual-input');
          const val = input.value.trim();
          const uid = auth.currentUser.uid;
          db.collection('users').doc(uid).collection('predictions').doc(id).update({
            actualResults: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }).then(loadPredictions);
        });
      });
    });
  }

  auth.onAuthStateChanged(user => {
    if (user && !user.isAnonymous){
      showResults();
    } else {
      showAuth();
      if (!user){
        auth.signInAnonymously().catch(err => alert(err.message));
      }
    }
  });

  document.getElementById('signupBtn').onclick = () => {
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPassword').value;
    const cred = firebase.auth.EmailAuthProvider.credential(email, pass);
    const user = auth.currentUser;
    if (user && user.isAnonymous){
      user.linkWithCredential(cred).catch(err => alert(err.message));
    } else {
      auth.createUserWithEmailAndPassword(email, pass).catch(err => alert(err.message));
    }
  };

  document.getElementById('loginBtn').onclick = () => {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
  };

  document.getElementById('logoutBtn').onclick = () => {
    auth.signOut();
  };
})();
