(function(){
    // Simple error trap to avoid blank screen
    const showErr = (msg) => {
      const el = document.getElementById('errOverlay');
      const tx = document.getElementById('errText');
      if (el && tx) { tx.textContent = String(msg || 'Unknown error'); el.style.display = 'block'; }
      console.error(msg);
    };
  
    window.addEventListener('error', (e)=> showErr(e.message || e.error));
    window.addEventListener('unhandledrejection', (e)=> showErr(e.reason || 'Unhandled promise rejection'));
  
    window.addEventListener('DOMContentLoaded', () => {
      try {
        /* ====== Grab DOM safely ====== */
        const Q = (id) => {
          const el = document.getElementById(id);
          if (!el) throw new Error(`Missing element: #${id}`);
          return el;
        };
  
        // Required elements
        const stepNow = Q('stepNow');
        const stepTotal = Q('stepTotal');
        const subName = Q('subName');
        const subjectList = Q('subjectsList');
        const subLevel = Q('subLevel');
        const gradePills = Q('gradePills');
        const remainingLabel = Q('remainingLabel');
        const remainingBar = Q('remainingBar');
        const subjectCard = Q('subjectCard');
        const probInput = Q('probInput');
        const prevBtn = Q('prevBtn');
        const nextBtn = Q('nextBtn');
        const addBtn = Q('addBtn');
        const finishBtn = Q('finishBtn');
        const clearSubject = Q('clearSubject');
        const fillRemaining = Q('fillRemaining');
        const targetInput = Q('target');
        const schoolInput = Q('school');
        const selectionNote = Q('selectionNote');
        const resultsEl = Q('results');
        const histCanvas = Q('histogram');

        // Firebase setup
        const firebaseConfig = {
          apiKey: "AIzaSyAS5PvPMYQjCQz88drt1VG6B5Y2v3PpjZM",
          authDomain: "lcpredic.firebaseapp.com",
          projectId: "lcpredic"
        };
        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();
        const auth = firebase.auth();
        auth.signInAnonymously().catch(err => showErr(err.message || err));

        async function submitPrediction(prediction, docName) {
          const uid = auth.currentUser.uid;
          const ref = db.collection('users').doc(uid).collection('predictions');
          const docRef = ref.doc(docName);
          await docRef.set({
            ...prediction,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            actualResults: null
          });
          // verify document exists after writing
          const snapshot = await docRef.get();
          if (!snapshot.exists) {
            throw new Error('Submission failed to save');
          }
          return docRef.id;
        }

        async function submitActualResults(predictionId, actualResults) {
          const uid = auth.currentUser.uid;
          const ref = db.collection('users').doc(uid)
                        .collection('predictions').doc(predictionId);
          await ref.update({
            actualResults,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
        
        let allSubjects = [];
        function populateSubjectOptions(){
          subjectList.innerHTML = '';
          allSubjects
            .slice()
            .sort((a,b)=>a.localeCompare(b))
            .forEach(name => {
              const opt = document.createElement('option');
              opt.value = name;
              subjectList.appendChild(opt);
            });
        }
        fetch('subjects.json').then(r=>r.json()).then(list=>{
          allSubjects = list;
          populateSubjectOptions();
        });

        function isValidSubject(name){
          return allSubjects.includes(name);
        }
        function validateCurrentSubject(){
          if (!isValidSubject(subName.value)){
            alert('Please select a subject from the list.');
            subName.focus();
            return false;
          }
          return true;
        }

        function subjectComplete(subj){
          const total = subj.probs.reduce((a,b)=>a+b,0);
          return Math.abs(total - 1) < 1e-6; // allow tiny floating error
        }


        // Optional collections (may be empty on DOMContentLoaded)
        const pctButtons = Array.from(document.querySelectorAll('.pct'));
  
        /* ====== Data & Constants ====== */
        const pointsHigher = [100,88,77,66,56,46,37,0];
        const pointsMathsHigher = [125,113,102,91,81,71,37,0];
        const pointsOrdinary = [56,46,37,28,20,12,0,0];
        const H_LABELS = ["H1","H2","H3","H4","H5","H6","H7","H8"];
        const O_LABELS = ["O1","O2","O3","O4","O5","O6","O7","O8"];
  
        const getPoints = (g, isMaths, level) =>
          level === 'Ordinary' ? pointsOrdinary[g] : (isMaths ? pointsMathsHigher[g] : pointsHigher[g]);
  
        // Model
        let subjects = Array.from({length:6}, ()=>({name:"", level:"Higher", isMaths:false, probs:Array(8).fill(0)}));
        let current = 0;
        let activeGrade = 0;
        let targetDebounce = null;
        let histChart = null;
  
        /* ====== UI Wiring ====== */
        prevBtn.onclick = ()=> { if (current>0){ saveFromUI(); current--; renderWizard(); } };
        nextBtn.onclick = ()=> {
          if (!validateCurrentSubject()) return;
          if (!subjectComplete(subjects[current])){
            alert('Please ensure probabilities total 100% before moving on.');
            return;
          }
          if (current<subjects.length-1){
            saveFromUI(); current++; renderWizard();
            window.scrollTo({top:0, behavior:'smooth'});
            subName.focus();
          }
        };
        addBtn .onclick = ()=> {
          if (!validateCurrentSubject()) return;
          if (!subjectComplete(subjects[current])){
            alert('Please ensure probabilities total 100% before moving on.');
            return;
          }
          saveFromUI(); subjects.push({name:"", level:"Higher", isMaths:false, probs:Array(8).fill(0)});
          stepTotal.textContent=subjects.length; current=subjects.length-1; renderWizard();
          window.scrollTo({top:0, behavior:'smooth'});
          subName.focus();
        };
        finishBtn.onclick = ()=> {
          if (!validateCurrentSubject()) return;
          saveFromUI();
          if (!subjects.every(s => isValidSubject(s.name))){
            alert('Please select valid subjects for all entries.');
            return;
          }
          if (!subjects.every(subjectComplete)){
            alert('Ensure all subject probabilities add to 100%.');
            return;
          }
          if (!targetInput.value.trim()) {
            alert('Please enter target points.');
            targetInput.focus();
            return;
          }
          if (!schoolInput.value.trim()) {
            alert('Please enter school name.');
            schoolInput.focus();
            return;
          }
          const preparedSubjects = collectForCalc();
          const result = calculateAndRender();
          const desiredMarks = Number(targetInput.value);
          const school = schoolInput.value.trim();
          const meanPoints = result && typeof result.mean === 'number'
            ? Math.round(result.mean)
            : 'unknown';
          const timestamp = new Date().toISOString();
          const safeSchool = school.replace(/[^a-zA-Z0-9]/g, '_');
          const docName = `${meanPoints}+${safeSchool}+${timestamp}`;
          const payload = {
            school,
            desiredMarks,
            meanMarks: result ? result.mean : null,
            subjects: preparedSubjects.map(s => ({
              name: s.name,
              level: s.level,
              expected: s.expected
            }))
          };
          submitPrediction(payload, docName).catch(err => showErr(err.message || err));
        };
  
        targetInput.addEventListener('input', ()=>{
          if (targetDebounce) clearTimeout(targetDebounce);
          targetDebounce = setTimeout(calculateAndRender, 800);
        });
  
        clearSubject.onclick = ()=>{
          probInput.value="";
          subjects[current].probs = Array(8).fill(0);
          renderWizard();
        };
        fillRemaining.onclick = ()=>{
          const s = subjects[current];
          const sumOthers = s.probs.reduce((a,b,i)=> i===activeGrade ? a : a+b, 0);
          const remaining = Math.max(0, 1 - sumOthers);
          s.probs[activeGrade] = remaining;
          renderWizard();
        };
  
        // Percent grid
        pctButtons.forEach(btn=>{
          btn.addEventListener('click', ()=>{
            if (!btn.dataset.p) return;
            setGradeValue(Number(btn.dataset.p)/100);
          });
        });

        Q('kpSet').onclick = ()=>{
          const v = Number(probInput.value);
          if (!Number.isFinite(v)) return;
          const asDec = Math.max(0, Math.min(1, (v>1)? v/100 : v));
          setGradeValue(asDec);
        };
        probInput.addEventListener('keydown', e=>{ if(e.key==='Enter') Q('kpSet').click(); });
  
        /* ====== Render Wizard ====== */
      function renderWizard(){
          stepNow.textContent = String(current+1);
          stepTotal.textContent = String(subjects.length);

          const s = subjects[current];
          s.isMaths = (s.name === 'Mathematics');
          subName.value = s.name;
          subLevel.value = s.level;
        
          subName.oninput = ()=> {
            const val = subName.value;
            subjects[current].name = val;
            subjects[current].isMaths = (val === 'Mathematics');
            renderWizard();
          };
          subLevel.onchange = ()=> { subjects[current].level = subLevel.value; renderWizard(); };
  
          // Grade pills
          gradePills.innerHTML = "";
            const labels = s.level === 'Ordinary' ? O_LABELS : H_LABELS;
            for (let i=0;i<8;i++){
              const pct = (s.probs[i]*100)||0;
              const pill = document.createElement('button');
              pill.type = 'button';
              pill.className = 'grade-pill' + (i===activeGrade ? ' active':'');
              pill.innerHTML = `${labels[i]}<small>${pct.toFixed(1)}%</small>`;
              const shade = 90 - s.probs[i]*40;
              pill.style.backgroundColor = `hsl(120, 60%, ${shade}%)`;
              if (shade < 60) pill.style.color = '#fff';
              pill.onclick = ()=> { activeGrade = i; renderWizard(); };
              gradePills.appendChild(pill);
            }
  
          // Remaining
          const totalPct = s.probs.reduce((a,b)=>a+b,0)*100;
          const remaining = 100 - totalPct;
          remainingLabel.textContent = `${remaining.toFixed(1)}%`;
          remainingBar.style.width = `${Math.min(100, Math.max(0, totalPct))}%`;
          subjectCard.classList.toggle('row-complete', Math.abs(remaining) < 1e-9);
        }
  
        function saveFromUI(){
          const s = subjects[current];
          const val = subName.value;
          s.name = val || `Subject ${current+1}`;
          s.level = subLevel.value;
          s.isMaths = (val === 'Mathematics');
        }
  
        /* ====== Input helpers ====== */
        function setGradeValue(asDec){
          const s = subjects[current];
          const sumOthers = s.probs.reduce((a,b,i)=> i===activeGrade ? a : a+b, 0);
          const maxAllowed = Math.max(0, 1 - sumOthers);
          s.probs[activeGrade] = Math.min(Math.max(0, asDec), maxAllowed);
          probInput.value = "";
          renderWizard();
        }
  
        /* ====== Prepare subjects for calc ====== */
        function collectForCalc(){
          return subjects.map((s,idx)=>{
            const rawSum = s.probs.reduce((a,b)=>a+b,0);
            const probs = rawSum>0 ? s.probs.map(p=>p/rawSum) : Array(8).fill(0); // skip empty later
            let expected=0;
            for (let g=0; g<8; g++) expected += probs[g]*getPoints(g, s.isMaths, s.level);
            return { name: s.name || `Subject ${idx+1}`, level: s.level, isMaths: s.isMaths, probs, expected, rawSum };
          });
        }
        function bestSix(list){
          if (list.length<=6) return {selected:list, dropped:[]};
          const sorted = [...list].sort((a,b)=>b.expected-a.expected);
          return {selected: sorted.slice(0,6), dropped: sorted.slice(6)};
        }
  
        /* ====== Ultra-fast DP over points ====== */
        function dpDistribution(subjs){
          if (subjs.length === 0) return { points:[0], probs:[1] };
          const maxPerSubj = 125;
          const maxSum = subjs.length * maxPerSubj;
  
          let dp = new Float64Array(maxSum + 1);
          dp[0] = 1;
  
          for (const subj of subjs){
            const pts = [];
            for (let g=0; g<8; g++){
              const p = subj.probs[g];
              if (p > 0) pts.push([ getPoints(g, subj.isMaths, subj.level), p ]);
            }
            if (pts.length === 0) continue;
  
            const next = new Float64Array(maxSum + 1);
            for (let s=0; s<=maxSum; s++){
              const base = dp[s];
              if (base === 0) continue;
              for (const [score, prob] of pts){
                next[s + score] += base * prob;
              }
            }
            dp = next;
          }
  
          const points = [];
          const probs = [];
          let total = 0;
          for (let s=0; s<=maxSum; s++){
            const v = dp[s];
            if (v > 0){ points.push(s); probs.push(v); total += v; }
          }
          if (total > 0){ for (let i=0;i<probs.length;i++) probs[i] /= total; }
          return { points, probs };
        }
  
        function computeStats({points, probs}){
          let mean=0, variance=0;
          for (let i=0;i<points.length;i++) mean += points[i]*probs[i];
          for (let i=0;i<points.length;i++){ const d=points[i]-mean; variance += probs[i]*d*d; }
          return {mean, stdDev: Math.sqrt(variance)};
        }
        function probabilityGE(dist, threshold){
          if (!Number.isFinite(threshold)) return null;
          let p=0;
          for (let i=0;i<dist.points.length;i++) if (dist.points[i] >= threshold) p += dist.probs[i];
          return p;
        }
  
        /* ====== Chart ====== */
        function drawHistogram(dist, mean, stdDev, targetVal){
          const binWidth=6;
          const bins=new Map();
          for (let i=0;i<dist.points.length;i++){
            const b = Math.round(dist.points[i]/binWidth)*binWidth;
            bins.set(b, (bins.get(b)||0)+dist.probs[i]);
          }
          const labelsAll = Array.from(bins.keys()).sort((a,b)=>a-b);
          let lower=labelsAll[0], upper=labelsAll[labelsAll.length-1];
          if (Number.isFinite(stdDev) && stdDev>0){
            lower = Math.floor((mean-3*stdDev)/binWidth)*binWidth;
            upper = Math.ceil((mean+3*stdDev)/binWidth)*binWidth;
          }
          const labels = labelsAll.filter(v=>v>=lower && v<=upper);
          const data = labels.map(k=>({x:k, y:bins.get(k)||0}));

          const ctx = histCanvas.getContext('2d');
          if (histChart) histChart.destroy();
          const fill = getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim();
          const stroke = getComputedStyle(document.documentElement).getPropertyValue('--accent-green-border').trim();

          const plugins = [];
          if (Number.isFinite(targetVal)){
            plugins.push({
              id:'targetLine',
              afterDraw(chart){
                const xScale = chart.scales.x;
                if (targetVal < xScale.min || targetVal > xScale.max) return;
                const x = xScale.getPixelForValue(targetVal);
                const ctx = chart.ctx;
                ctx.save();
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, chart.chartArea.top);
                ctx.lineTo(x, chart.chartArea.bottom);
                ctx.stroke();
                ctx.restore();
              }
            });
          }

          histChart = new Chart(ctx,{
            type:'bar',
            data:{ datasets:[{ data, backgroundColor: fill, borderColor: stroke, borderWidth:1 }]},
            options:{
              parsing:false,
              animation:false,
              responsive:true, maintainAspectRatio:false,
              scales:{ x:{ type:'linear', grid:{color:'#edf0f2'}}, y:{ beginAtZero:true, grid:{color:'#edf0f2'}}},
              plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` ${(c.raw.y*100).toFixed(2)}%` } } }
            },
            plugins
          });
        }
  
        /* ====== Calculate & Render ====== */
        function calculateAndRender(){
          const prepared = collectForCalc().filter(s => s.rawSum > 0);
          if (prepared.length === 0){
            selectionNote.textContent = 'No subjects yet — add at least one.';
            resultsEl.textContent = 'Awaiting input…';
            if (histChart) histChart.destroy();
            return null;
          }
  
          const {selected, dropped} = bestSix(prepared);
          selectionNote.innerHTML = `
            Using top ${selected.length} subject(s):
            ${selected.map(s=>`<span class="badge-chip">${s.name} (${s.expected.toFixed(1)})</span>`).join("")}
            ${dropped.length? `<div class="mt-1">Ignored: ${dropped.map(s=>`<span class="badge-chip">${s.name} (${s.expected.toFixed(1)})</span>`).join("")}</div>` : ""}
          `;
  
          const dist = dpDistribution(selected);
          const {mean, stdDev} = computeStats(dist);
          const targetVal = Number(targetInput.value);
          const pGE = Number.isFinite(targetVal) ? probabilityGE(dist, targetVal) : null;
  
          resultsEl.innerHTML = `
            <div class="d-flex flex-column gap-1">
              <div>Weighted Mean: <b>${mean.toFixed(2)}</b></div>
              <div>Std Dev: <b>${stdDev.toFixed(2)}</b></div>
              <div>${pGE===null ? `<span class="text-muted">Enter a target to see your probability.</span>` : `P(Points ≥ ${targetVal}) = <b>${(pGE*100).toFixed(2)}%</b>`}</div>
            </div>
          `;
          drawHistogram(dist, mean, stdDev, targetVal);
          return {mean, stdDev};
        }
  
        // Initial render
        renderWizard();
        subName.focus();
        const tutEl = document.getElementById('tutorialModal');
        if (tutEl && typeof bootstrap !== 'undefined'){
          const tut = new bootstrap.Modal(tutEl);
          tut.show();
        }
        // Don’t auto-calc on load; user hits Finish
        // calculateAndRender();
  
      } catch (err){
        showErr(err && err.message ? err.message : err);
      }
    });
  })();
  