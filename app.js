/* Y2K MIDI GEN — single-page, iPhone-first, 3 files.
   - No external libs
   - MIDI Type 1 writer (PPQ 480)
   - WebAudio preview (simple synth + drums)
*/

(() => {
  "use strict";

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const seedValueEl = $("#seedValue");
  const copySeedBtn = $("#copySeed");
  const modeLabelEl = $("#modeLabel");

  const artistTogglesEl = $("#artistToggles");
  const generateBtn = $("#generateBtn");
  const playBtn = $("#playBtn");
  const stopBtn = $("#stopBtn");
  const settingsBtn = $("#settingsBtn");
  const hideBtn = $("#hideBtn");
  const settingsPanel = $("#settingsPanel");

  const minibar = $("#minibar");
  const showBtn = $("#showBtn");
  const downloadBtn = $("#downloadBtn");
  const downloadBtnMini = $("#downloadBtnMini");

  const trackListEl = $("#trackList");
  const bpmNowEl = $("#bpmNow");
  const keyNowEl = $("#keyNow");
  const artistsNowEl = $("#artistsNow");

  const bpmMinus = $("#bpmMinus");
  const bpmPlus = $("#bpmPlus");
  const bpmDisplay = $("#bpmDisplay");
  const bpmFixedInput = $("#bpmFixed");
  const bpmMinInput = $("#bpmMin");
  const bpmMaxInput = $("#bpmMax");

  const keyButtonsEl = $("#keyButtons");

  // ---------- SETTINGS MODEL ----------
  const state = {
    // generation controls
    seed: 0,
    selectedArtists: [], // ordered
    songSketch: false,   // toggle
    bpmMode: "artist",   // artist | fixed | manual | range
    bpm: 170,            // current bpm used in generation
    bpmFixed: 170,
    bpmRange: [155, 180],
    bpmManual: 170,

    keyMode: "auto",     // auto | pick
    root: 0,             // 0=C
    scaleMode: "auto",   // auto | natural | harmonic | phrygian
    scale: "natural",    // resolved for current gen

    // derived
    resolved: null,      // last generated song object
    midiBytes: null,     // Uint8Array
    hiddenHUD: false,
  };

  const ARTISTS = [
    "2HOLLIS",
    "FAKEMINK",
    "ESDEEKID",
    "FENG",
    "BLADEE",
    "FIMIGUERRERO",
    "KEN CARSON",
  ];

  // Artist probability profiles
  // Values are in [0..1] for "intensity" parameters, plus harmony weights and BPM ranges.
  const PROFILES = {
    "2HOLLIS": {
      bpm: [150, 175],
      density: 0.35,
      aggro: 0.30,
      space: 0.65,
      repetition: 0.78,
      harmony: { drone: 0.50, power: 0.32, two: 0.16, three: 0.02 },
      hatsRoll: 0.12,
      fills: 0.18,
      slides: 0.18,
      halftime: 0.20,
      bells: 0.25,
      texture: 0.55,
    },
    "FAKEMINK": {
      bpm: [155, 180],
      density: 0.55,
      aggro: 0.45,
      space: 0.45,
      repetition: 0.65,
      harmony: { drone: 0.32, power: 0.28, two: 0.34, three: 0.06 },
      hatsRoll: 0.22,
      fills: 0.28,
      slides: 0.28,
      halftime: 0.22,
      bells: 0.65,
      texture: 0.45,
    },
    "ESDEEKID": {
      bpm: [165, 190],
      density: 0.78,
      aggro: 0.82,
      space: 0.22,
      repetition: 0.55,
      harmony: { drone: 0.18, power: 0.32, two: 0.44, three: 0.06 },
      hatsRoll: 0.52,
      fills: 0.45,
      slides: 0.55,
      halftime: 0.18,
      bells: 0.35,
      texture: 0.35,
    },
    "FENG": {
      bpm: [145, 170],
      density: 0.48,
      aggro: 0.58,
      space: 0.55,
      repetition: 0.70,
      harmony: { drone: 0.44, power: 0.32, two: 0.22, three: 0.02 },
      hatsRoll: 0.22,
      fills: 0.26,
      slides: 0.30,
      halftime: 0.50,
      bells: 0.20,
      texture: 0.62,
    },
    "BLADEE": {
      bpm: [140, 170],
      density: 0.50,
      aggro: 0.40,
      space: 0.60,
      repetition: 0.68,
      harmony: { drone: 0.26, power: 0.24, two: 0.42, three: 0.08 },
      hatsRoll: 0.20,
      fills: 0.22,
      slides: 0.20,
      halftime: 0.20,
      bells: 0.70,
      texture: 0.48,
    },
    "FIMIGUERRERO": {
      bpm: [160, 190],
      density: 0.76,
      aggro: 0.74,
      space: 0.28,
      repetition: 0.56,
      harmony: { drone: 0.20, power: 0.30, two: 0.44, three: 0.06 },
      hatsRoll: 0.46,
      fills: 0.46,
      slides: 0.44,
      halftime: 0.25,
      bells: 0.30,
      texture: 0.42,
    },
    "KEN CARSON": {
      bpm: [150, 180],
      density: 0.72,
      aggro: 0.70,
      space: 0.28,
      repetition: 0.58,
      harmony: { drone: 0.14, power: 0.46, two: 0.36, three: 0.04 },
      hatsRoll: 0.40,
      fills: 0.40,
      slides: 0.42,
      halftime: 0.16,
      bells: 0.22,
      texture: 0.30,
    },
  };

  // ---------- UTIL ----------
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function lerp(a, b, t){ return a + (b - a) * t; }

  // Seeded RNG (mulberry32)
  function mulberry32(seed){
    let t = seed >>> 0;
    return function(){
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randomSeed(){
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  }
  function pickWeighted(rng, items){
    // items: [{k, w}]
    const total = items.reduce((s,it)=>s+it.w,0);
    let r = rng()*total;
    for(const it of items){
      r -= it.w;
      if(r <= 0) return it.k;
    }
    return items[items.length-1].k;
  }
  function chance(rng, p){ return rng() < p; }

  function noteName(root){
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    return names[(root%12+12)%12];
  }

  // ---------- UI BUILD ----------
  function buildArtistChips(){
    artistTogglesEl.innerHTML = "";
    for(const name of ARTISTS){
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.textContent = name;
      btn.setAttribute("data-artist", name);
      btn.addEventListener("click", () => toggleArtist(name));
      artistTogglesEl.appendChild(btn);
    }
    syncArtistUI();
  }

  function toggleArtist(name){
    const idx = state.selectedArtists.indexOf(name);
    if(idx >= 0){
      state.selectedArtists.splice(idx,1);
    } else {
      state.selectedArtists.push(name);
    }
    if(state.selectedArtists.length === 0){
      // enforce at least one artist; default to FAKEMINK if user turns all off
      state.selectedArtists = ["FAKEMINK"];
    }
    syncArtistUI();
    updateModeLabel();
    // Update BPM display if in artist mode
    if(state.bpmMode === "artist"){
      const [mn,mx] = getArtistBpmRange();
      bpmMinInput.value = mn;
      bpmMaxInput.value = mx;
    }
  }

  function syncArtistUI(){
    [...artistTogglesEl.querySelectorAll(".chip")].forEach(ch => {
      const a = ch.getAttribute("data-artist");
      ch.classList.toggle("on", state.selectedArtists.includes(a));
    });
    artistsNowEl.textContent = `ARTISTS: ${state.selectedArtists.join(" + ")}`;
  }

  function updateModeLabel(){
    const n = state.selectedArtists.length;
    if(n === 1) modeLabelEl.textContent = "MODE: SOLO";
    else modeLabelEl.textContent = "MODE: MIX";
  }

  function buildKeyButtons(){
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    keyButtonsEl.innerHTML = "";
    names.forEach((nm, i) => {
      const b = document.createElement("button");
      b.className = "keyBtn";
      b.textContent = nm;
      b.addEventListener("click", () => {
        state.root = i;
        syncKeyButtons();
      });
      keyButtonsEl.appendChild(b);
    });
    syncKeyButtons();
  }
  function syncKeyButtons(){
    [...keyButtonsEl.querySelectorAll(".keyBtn")].forEach((b, i) => {
      b.classList.toggle("on", i === state.root);
    });
  }

  function setSeg(setting, value){
    state[setting] = value;
    syncSegUI();
  }

  function syncSegUI(){
    [...document.querySelectorAll(".segBtn")].forEach(btn => {
      const s = btn.dataset.setting;
      const v = btn.dataset.value;
      btn.classList.toggle("on", String(state[s]) === v);
    });

    bpmFixedInput.value = String(state.bpmFixed);
    bpmMinInput.value = String(state.bpmRange[0]);
    bpmMaxInput.value = String(state.bpmRange[1]);
    bpmDisplay.textContent = String(state.bpmMode === "manual" ? state.bpmManual : state.bpm);

    // key buttons only useful in pick mode, but keep visible per your vibe
  }

  function toggleSettings(){
    settingsPanel.classList.toggle("hidden");
  }

  function setHiddenHUD(hidden){
    state.hiddenHUD = hidden;
    $("#hud").classList.toggle("hidden", hidden);
    minibar.classList.toggle("hidden", !hidden);
    hideBtn.textContent = hidden ? "SHOW" : "HIDE";

    // When hidden: keep DOWNLOAD + TRACKLIST visible (footer stays),
    // plus minibar offers SHOW + DOWNLOAD.
  }

  // ---------- ARTIST BLEND ----------
  function blendProfiles(selected){
    // main artist = first selected
    const main = selected[0];
    const base = structuredClone(PROFILES[main]);

    if(selected.length === 1) return { main, profile: base, mode: "SOLO" };

    // Blend remaining with decreasing weights
    const weights = selected.map((_, i) => (i === 0 ? 0.52 : 0.48 / (selected.length - 1)));
    const out = structuredClone(base);

    function blendNum(key){
      let v = 0;
      selected.forEach((name, i) => v += PROFILES[name][key] * weights[i]);
      out[key] = v;
    }
    blendNum("density");
    blendNum("aggro");
    blendNum("space");
    blendNum("repetition");
    blendNum("hatsRoll");
    blendNum("fills");
    blendNum("slides");
    blendNum("halftime");
    blendNum("bells");
    blendNum("texture");

    // Blend BPM ranges
    const bpmMin = selected.reduce((s,name,i)=>s+PROFILES[name].bpm[0]*weights[i],0);
    const bpmMax = selected.reduce((s,name,i)=>s+PROFILES[name].bpm[1]*weights[i],0);
    out.bpm = [Math.round(bpmMin), Math.round(bpmMax)];

    // Blend harmony weights then normalize
    const keys = ["drone","power","two","three"];
    const hw = {};
    keys.forEach(k=>{
      hw[k]= selected.reduce((s,name,i)=>s+PROFILES[name].harmony[k]*weights[i],0);
    });
    const sum = keys.reduce((s,k)=>s+hw[k],0) || 1;
    keys.forEach(k=> hw[k] /= sum);
    out.harmony = hw;

    return { main, profile: out, mode: "MIX" };
  }

  function getArtistBpmRange(){
    const main = state.selectedArtists[0];
    return PROFILES[main]?.bpm ?? [155,180];
  }

  // ---------- MUSIC THEORY ----------
  function scaleIntervals(mode){
    // returns semitone offsets for scale degrees 1..7 (0-based)
    // Natural minor: 0,2,3,5,7,8,10
    // Harmonic minor: 0,2,3,5,7,8,11
    // Phrygian: 0,1,3,5,7,8,10
    if(mode === "harmonic") return [0,2,3,5,7,8,11];
    if(mode === "phrygian") return [0,1,3,5,7,8,10];
    return [0,2,3,5,7,8,10];
  }

  function degreeToMidi(rootMidi, intervals, deg, octaveShift=0){
    // deg: 1..7
    const semis = intervals[(deg-1) % 7];
    return rootMidi + semis + octaveShift*12;
  }

  // ---------- PATTERN GENERATION ----------
  const PPQ = 480;
  const BEAT = PPQ;
  const SIXTEENTH = PPQ / 4;
  const BAR = PPQ * 4;
  const LOOP_BARS = 8;
  const LOOP_TICKS = LOOP_BARS * BAR;

  // Tracks we generate/export
  const TRACKS = [
    { id:"PAD",   name:"PAD/CHORD", ch:0, prog: 89 },  // Pad 2-ish
    { id:"LEAD",  name:"LEAD",      ch:1, prog: 81 },  // Lead 2-ish
    { id:"BELL",  name:"BELL/COUNTER", ch:2, prog: 10 }, // Music Box-ish
    { id:"BASS",  name:"808/BASS",  ch:3, prog: 38 },  // Synth Bass-ish
    { id:"KICK",  name:"KICK",      ch:9, drum:true },
    { id:"SNARE", name:"SNARE/CLAP",ch:9, drum:true },
    { id:"HATS",  name:"HATS",      ch:9, drum:true },
    { id:"TEXT",  name:"TEXTURE",   ch:4, prog: 92 },  // Choir/Aahs-ish for texture mapping
  ];

  // GM drum notes
  const DR = {
    kick: 36,
    snare: 38,
    clap: 39,
    hatC: 42,
    hatO: 46,
    perc: 75,
  };

  function resolveScale(rng){
    // Default weights like we discussed
    // Natural 70%, Harmonic 20%, Phrygian 10%
    if(state.scaleMode !== "auto") return state.scaleMode;
    const pick = pickWeighted(rng, [
      {k:"natural", w:0.70},
      {k:"harmonic", w:0.20},
      {k:"phrygian", w:0.10},
    ]);
    return pick;
  }

  function resolveRoot(rng){
    if(state.keyMode === "pick") return state.root;
    // Weighted keys favor A/E/F a bit (like earlier)
    const keys = [0,1,2,3,4,5,6,7,8,9,10,11];
    const weights = keys.map(k => {
      // A=9, E=4, F=5
      if(k === 9) return 2.0;
      if(k === 4) return 1.6;
      if(k === 5) return 1.4;
      return 1.0;
    });
    const total = weights.reduce((a,b)=>a+b,0);
    let r = rng()*total;
    for(let i=0;i<keys.length;i++){
      r -= weights[i];
      if(r<=0) return keys[i];
    }
    return 0;
  }

  function resolveBpm(rng, blend){
    if(state.bpmMode === "fixed"){
      return clamp(parseInt(bpmFixedInput.value||"170",10), 60, 220);
    }
    if(state.bpmMode === "manual"){
      return clamp(state.bpmManual|0, 60, 220);
    }
    if(state.bpmMode === "range"){
      const mn = clamp(parseInt(bpmMinInput.value||"155",10), 60, 220);
      const mx = clamp(parseInt(bpmMaxInput.value||"180",10), 60, 220);
      const a = Math.min(mn,mx), b = Math.max(mn,mx);
      return Math.round(lerp(a, b, rng()));
    }
    // artist-based random
    const [mn,mx] = blend.profile.bpm;
    return Math.round(lerp(mn, mx, rng()));
  }

  function buildSong(seed){
    const rng = mulberry32(seed);

    const blend = blendProfiles(state.selectedArtists);
    const prof = blend.profile;

    // Resolve BPM + key + scale
    const scale = resolveScale(rng);
    const root = resolveRoot(rng);
    const bpm = resolveBpm(rng, blend);

    state.scale = scale;
    state.root = root;
    state.bpm = bpm;
    bpmDisplay.textContent = String(state.bpmMode === "manual" ? state.bpmManual : bpm);

    // Helper numbers
    const intervals = scaleIntervals(scale);
    const rootMidi = 60 + root; // C4 base
    const rootBass = 36 + root; // C2 base

    // Determine feel (half-time chance)
    const isHalftime = chance(rng, prof.halftime);

    // Harmony type
    const harmonyType = pickWeighted(rng, [
      {k:"drone", w:prof.harmony.drone},
      {k:"power", w:prof.harmony.power},
      {k:"two",   w:prof.harmony.two},
      {k:"three", w:prof.harmony.three},
    ]);

    // Build chord progression (over 8 bars)
    // degrees in minor context: i(1), VI(6), VII(7)
    let prog = [];
    if(harmonyType === "drone"){
      prog = Array(LOOP_BARS).fill({deg:1, kind:"drone"});
    } else if(harmonyType === "power"){
      // mostly i, with optional VII on bar 8
      prog = Array.from({length:LOOP_BARS}, (_,i)=> {
        const deg = (i === LOOP_BARS-1 && chance(rng,0.22)) ? 7 : 1;
        return {deg, kind:"power"};
      });
    } else if(harmonyType === "two"){
      // i->VI or i->VII
      const second = chance(rng,0.55) ? 6 : 7;
      prog = Array.from({length:LOOP_BARS}, (_,i)=> (i < LOOP_BARS/2 ? {deg:1, kind:"tri"} : {deg:second, kind:"tri"}));
    } else {
      // three chord rare: i -> VI -> VII
      const map = [1,1,6,6,7,7,1,1];
      prog = map.map(d=>({deg:d, kind:"tri"}));
    }

    // PAD notes
    const padEvents = [];
    for(let bar=0; bar<LOOP_BARS; bar++){
      const t0 = bar * BAR;
      const d = prog[bar].deg;

      // voicings: 2-3 notes, often omit 3rd (power vibe)
      const omitThird = chance(rng, 0.70);
      const useTriad = !omitThird && chance(rng, 0.80);

      // Build chord degrees for minor triad on i, major-ish for VI/VII (just MIDI color)
      // We'll treat VI/VII as "major" by using degree+ (3rd as major) approximation:
      // minor triad: 1-b3-5
      // major triad: 1-3-5
      const isMinor = (d === 1);
      const third = isMinor ? 3 : 3; // We'll still use scale degree 3 but choose semitone tweak for major
      let n1 = degreeToMidi(rootMidi, intervals, d, -1); // around C3-C4
      let n5 = degreeToMidi(rootMidi, intervals, d, -1) + 7; // perfect fifth approx
      let n3 = degreeToMidi(rootMidi, intervals, ((d+2-1)%7)+1, -1); // 3rd by scale degree

      // For "major-ish": push third up 1 semitone sometimes for brighter
      if(!isMinor && chance(rng,0.55)) n3 += 1;

      const notes = [];
      notes.push(n1);
      notes.push(n5);
      if(useTriad) notes.push(n3);

      // lengths: whole or half; sometimes retrigger midpoint softly
      const len = chance(rng,0.65) ? BAR : BAR/2;
      addChord(padEvents, t0, len, notes, randVel(rng, 48, 72));

      if(chance(rng, 0.30) && len === BAR){
        addChord(padEvents, t0 + BAR/2, BAR/2, notes, randVel(rng, 30, 52));
      }
    }

    // LEAD motif
    const leadEvents = [];
    const motifBars = pickWeighted(rng, [
      {k:1, w:0.55},
      {k:2, w:0.35},
      {k:4, w:0.10},
    ]);
    const motifTicks = motifBars * BAR;

    // Note pool degrees (favor 1, b3,5,b7)
    const pool = [1,3,5,7,2,4,6];
    const weights = [2.2, 1.8, 2.0, 1.6, 0.9, 0.9, 0.6];
    const motif = [];
    const noteCount = Math.round(lerp(3, 6, prof.density));
    let prevDeg = 1;

    for(let i=0;i<noteCount;i++){
      const deg = pickWeighted(rng, pool.map((d,ix)=>({k:d,w:weights[ix]})));
      // step vs leap (60/40)
      const useStep = chance(rng, 0.60);
      let chosen = deg;
      if(useStep){
        // nudge around prev
        const dir = chance(rng,0.5) ? -1 : 1;
        chosen = clamp(((prevDeg + dir -1)%7)+1,1,7);
      }
      prevDeg = chosen;

      // rhythm placement grid (mostly 1/8, some 1/16)
      const grid = chance(rng, 0.30 + prof.aggro*0.20) ? SIXTEENTH : (SIXTEENTH*2);
      let step = Math.floor((rng() * motifTicks) / grid) * grid;

      // rests probability (space)
      if(chance(rng, 0.22 + prof.space*0.25)) continue;

      // pitch (keep mostly mid/high)
      const octaveShift = chance(rng, 0.55) ? 1 : 0;
      const note = degreeToMidi(rootMidi, intervals, chosen, octaveShift);

      // length short
      const len = chance(rng,0.70) ? grid : grid*2;
      motif.push({t: step, n: note, d: len});
    }

    // Sort motif and apply repetition/mutations across 8 bars
    motif.sort((a,b)=>a.t-b.t);

    const loops = Math.floor(LOOP_TICKS / motifTicks);
    for(let li=0; li<loops; li++){
      const baseT = li * motifTicks;

      // first 2 loops: exact
      // later loops: mutate based on repetition
      const mutateP = (li < 2) ? 0 : (1 - prof.repetition) * 0.9;

      for(const ev of motif){
        let n = ev.n;
        let t = baseT + ev.t;
        let d = ev.d;

        if(chance(rng, mutateP)){
          const m = rng();
          if(m < 0.30){
            // change last note-ish by nudging
            n += chance(rng,0.5) ? 2 : -2;
          } else if(m < 0.50){
            // shift one step in scale (approx)
            n += chance(rng,0.5) ? 1 : -1;
          } else if(m < 0.65){
            // delete note => skip
            continue;
          } else if(m < 0.75){
            // grace note before downbeat
            const g = n + (chance(rng,0.5)?1:-1);
            addNote(leadEvents, t - SIXTEENTH/2, SIXTEENTH/2, g, randVel(rng, 55, 85));
          } else {
            // keep
          }
        }

        addNote(leadEvents, t, d, n, randVel(rng, 70, 112));
      }
    }

    // Optional BELL (counter)
    const bellEvents = [];
    const bellOn = chance(rng, 0.35 + prof.bells*0.55);
    if(bellOn){
      const bellNotes = [];
      const bellCount = Math.max(2, Math.round(lerp(2,4, prof.density)));
      for(let i=0;i<bellCount;i++){
        const deg = pickWeighted(rng, [
          {k:1,w:2.0},{k:3,w:1.3},{k:5,w:1.8},{k:7,w:1.2},{k:2,w:0.7},{k:4,w:0.7}
        ]);
        const note = degreeToMidi(rootMidi, intervals, deg, 2); // higher register
        const step = Math.floor((rng() * LOOP_TICKS) / (SIXTEENTH*2)) * (SIXTEENTH*2);
        // offbeat bias
        const off = step + SIXTEENTH;
        bellNotes.push({t: clamp(off,0,LOOP_TICKS-SIXTEENTH), n: note, d: SIXTEENTH});
      }
      bellNotes.sort((a,b)=>a.t-b.t);
      for(const e of bellNotes){
        if(chance(rng, 0.30 + prof.space*0.25)) continue;
        addNote(bellEvents, e.t, e.d, e.n, randVel(rng, 55, 92));
      }
    }

    // 808/BASS
    const bassEvents = [];
    const slideP = clamp(prof.slides, 0.10, 0.65);

    // derive root notes per bar from progression
    const barRoots = prog.map(p => degreeToMidi(rootBass, intervals, p.deg, 0));
    // Rhythm: align to kick later; create a sparse pattern first
    for(let bar=0; bar<LOOP_BARS; bar++){
      const baseT = bar * BAR;
      const rootN = barRoots[bar];
      const hits = Math.round(lerp(1, 3, prof.density));
      for(let i=0;i<hits;i++){
        if(chance(rng, 0.20 + prof.space*0.30)) continue;
        const grid = SIXTEENTH*2;
        let step = Math.floor((rng()*BAR)/grid)*grid;
        // avoid right on snare in halftime feel
        if(isHalftime && Math.abs(step - BEAT*2) < SIXTEENTH) step += grid;
        const len = chance(rng,0.55) ? grid*2 : grid*3;

        // slides: approach note then land
        if(chance(rng, slideP) && i === hits-1){
          const delta = chance(rng,0.5) ? 5 : 7; // 3-7 semis typical
          const from = rootN + (chance(rng,0.5) ? -delta : delta);
          addNote(bassEvents, baseT + step, grid, from, randVel(rng, 70, 110));
          addNote(bassEvents, baseT + step + grid, len, rootN, randVel(rng, 85, 120));
        } else {
          addNote(bassEvents, baseT + step, len, rootN, randVel(rng, 78, 120));
        }

        // occasional octave jump near bar end
        if(chance(rng,0.10) && step > BAR - BEAT){
          addNote(bassEvents, baseT + BAR - SIXTEENTH*2, SIXTEENTH*2, rootN + 12, randVel(rng, 70, 110));
        }
      }
    }

    // DRUMS
    const kickEvents = [];
    const snareEvents = [];
    const hatEvents = [];

    // snare placement
    const snareBeat = isHalftime ? 3 : 2; // beat number in bar (1-based)
    for(let bar=0; bar<LOOP_BARS; bar++){
      const baseT = bar*BAR;
      const tSn = baseT + (snareBeat-1)*BEAT;
      addDrum(snareEvents, tSn, SIXTEENTH, DR.snare, randVel(rng, 92, 122));
      // layer clap
      if(chance(rng,0.70)){
        addDrum(snareEvents, tSn, SIXTEENTH, DR.clap, randVel(rng, 72, 102));
      }
      // ghost clap
      if(prof.aggro > 0.6 && chance(rng,0.30)){
        addDrum(snareEvents, tSn - SIXTEENTH/2, SIXTEENTH/2, DR.clap, randVel(rng, 45, 70));
      }
    }

    // kick templates
    const kickTemplate = pickWeighted(rng, [
      {k:"A", w:0.42}, // simple
      {k:"B", w:0.38}, // bounce
      {k:"C", w:0.20}, // more frequent
    ]);

    for(let bar=0; bar<LOOP_BARS; bar++){
      const baseT = bar*BAR;
      const hitsTarget = Math.round(lerp(2, 6, prof.density));
      const positions = new Set();

      const addPos = (tick) => {
        const q = clamp(Math.floor(tick / SIXTEENTH) * SIXTEENTH, 0, BAR-SIXTEENTH);
        positions.add(q);
      };

      if(kickTemplate === "A"){
        addPos(0);
        if(chance(rng,0.55)) addPos(BEAT + SIXTEENTH*2); // and of 2
        addPos(BEAT*2); // 3
        if(chance(rng,0.35)) addPos(BEAT*3 + SIXTEENTH); // before 4
      } else if(kickTemplate === "B"){
        addPos(0);
        addPos(BEAT + SIXTEENTH);
        if(chance(rng,0.45)) addPos(BEAT*2 + SIXTEENTH*2);
        if(chance(rng,0.55)) addPos(BEAT*3 - SIXTEENTH);
      } else {
        addPos(0);
        addPos(SIXTEENTH*6);
        addPos(BEAT*2);
        addPos(BEAT*2 + SIXTEENTH*2);
        if(chance(rng,0.50)) addPos(BEAT*3 + SIXTEENTH*2);
      }

      // fill random extra hits up to target
      while(positions.size < hitsTarget){
        if(chance(rng, 0.25 + prof.space*0.25)) break;
        addPos(rng()*BAR);
      }

      // avoid kick on exact snare 80%
      const snT = (snareBeat-1)*BEAT;
      if(chance(rng,0.80)) positions.delete(snT);

      // stutter near bar end
      if(chance(rng,0.20) && prof.aggro > 0.5){
        addPos(BAR - SIXTEENTH*2);
        addPos(BAR - SIXTEENTH);
      }

      const sorted = [...positions].sort((a,b)=>a-b);
      for(const p of sorted){
        addDrum(kickEvents, baseT+p, SIXTEENTH, DR.kick, randVel(rng, 98, 124));
      }
    }

    // hats
    const baseGrid = chance(rng, 0.70) ? (SIXTEENTH*2) : SIXTEENTH;
    for(let t=0; t<LOOP_TICKS; t+=baseGrid){
      if(chance(rng, 0.10 + prof.space*0.25)) continue;
      const v = randVel(rng, 60, 96);
      addDrum(hatEvents, t, baseGrid/2, DR.hatC, v);
    }

    // rolls per bar
    for(let bar=0; bar<LOOP_BARS; bar++){
      const baseT = bar*BAR;
      const rollChance = clamp(0.15 + prof.aggro*0.35, 0.15, 0.60);
      if(chance(rng, rollChance)){
        const start = baseT + Math.floor(rng() * (BAR - BEAT));
        const len = chance(rng,0.60) ? (SIXTEENTH*4) : (SIXTEENTH*8);
        const rate = pickWeighted(rng, [
          {k:SIXTEENTH, w:0.55},
          {k:(SIXTEENTH*2)/3, w:0.25}, // ~triplet-ish
          {k:SIXTEENTH/2, w:0.20},
        ]);
        for(let tt=start; tt<start+len; tt+=rate){
          addDrum(hatEvents, tt, rate/2, DR.hatC, randVel(rng, 55, 92));
        }
      }
      // open hat
      if(chance(rng,0.15)){
        addDrum(hatEvents, baseT + BAR - SIXTEENTH*2, SIXTEENTH, DR.hatO, randVel(rng, 60, 95));
      }
    }

    // bar-end fills
    for(let bar=0; bar<LOOP_BARS; bar++){
      if(chance(rng, prof.fills)){
        const baseT = bar*BAR;
        // a simple fill: snare flam or hat burst
        if(chance(rng,0.55)){
          addDrum(snareEvents, baseT + BAR - SIXTEENTH, SIXTEENTH/2, DR.snare, randVel(rng, 80, 115));
          addDrum(snareEvents, baseT + BAR - SIXTEENTH/2, SIXTEENTH/2, DR.snare, randVel(rng, 92, 124));
        } else {
          for(let k=0;k<6;k++){
            addDrum(hatEvents, baseT + BAR - SIXTEENTH*2 + k*(SIXTEENTH/3), SIXTEENTH/6, DR.hatC, randVel(rng, 60, 98));
          }
        }
      }
    }

    // TEXTURE sparse track
    const textEvents = [];
    if(chance(rng, 0.30 + prof.texture*0.60)){
      const hits = Math.round(lerp(4, 10, prof.texture));
      for(let i=0;i<hits;i++){
        if(chance(rng, 0.25 + prof.space*0.25)) continue;
        const t = Math.floor((rng()*LOOP_TICKS)/(BEAT)) * BEAT;
        const deg = pickWeighted(rng, [{k:1,w:2.0},{k:5,w:1.5},{k:7,w:1.0},{k:3,w:1.0}]);
        const n = degreeToMidi(rootMidi, intervals, deg, chance(rng,0.5)?-1:0);
        addNote(textEvents, t, BEAT, n, randVel(rng, 20, 55));
      }
    }

    // Post constraints: clamp too-dense lead vs bass on downbeats
    enforceClashControl(leadEvents, bassEvents, rng);

    // Build arrangement
    const arrangement = buildArrangement(state.songSketch, LOOP_TICKS);

    // Apply arrangement to all tracks (mute layers per section)
    const arranged = applyArrangement({
      PAD: padEvents,
      LEAD: leadEvents,
      BELL: bellEvents,
      BASS: bassEvents,
      KICK: kickEvents,
      SNARE: snareEvents,
      HATS: hatEvents,
      TEXT: textEvents,
    }, arrangement, rng, prof);

    return {
      seed,
      bpm,
      root,
      scale,
      isHalftime,
      mainArtist: blend.main,
      mode: blend.mode,
      artists: [...state.selectedArtists],
      profile: prof,
      arrangement,
      tracks: arranged,
    };
  }

  function buildArrangement(songSketch, loopTicks){
    // If OFF: just 8 bars (single loop)
    if(!songSketch){
      return [{ name:"LOOP", start:0, len:loopTicks, mutes:{} }];
    }

    // If ON: build ~24 bars from the 8-bar loop blocks
    // Intro 4 bars (half loop), Drop 8 bars (full loop), Break 4 bars, Return 8 bars.
    const intro = loopTicks/2;
    const full = loopTicks;
    const breakLen = loopTicks/2;

    return [
      { name:"INTRO",  start:0,           len:intro,    mutes:{KICK:true, BASS:true} },
      { name:"DROP",   start:intro,       len:full,     mutes:{} },
      { name:"BREAK",  start:intro+full,  len:breakLen, mutes:{KICK:true, BASS:true, HATS:true} },
      { name:"RETURN", start:intro+full+breakLen, len:full, mutes:{} },
    ];
  }

  function applyArrangement(tracks, arrangement, rng, prof){
    // For each section, copy the loop content into that section length
    // and apply mutes plus occasional "pull-outs".
    const out = {};
    const loopLen = LOOP_TICKS;

    for(const [k, evs] of Object.entries(tracks)){
      out[k] = [];
      for(const sec of arrangement){
        const sectionEvents = [];
        const copies = Math.ceil(sec.len / loopLen);

        for(let c=0; c<copies; c++){
          const offset = sec.start + c*loopLen;
          const maxT = sec.start + sec.len;

          // Copy events that fit
          for(const e of evs){
            const t = e.t + offset;
            if(t >= sec.start && t < maxT){
              sectionEvents.push({...e, t});
            }
          }
        }

        // Apply mutes
        const muted = sec.mutes[k] === true;
        if(!muted){
          // Pull-outs: 20–40% chance each 4 bars (approx)
          // We'll implement by randomly removing events in a half-bar window
          const pullChance = clamp(0.20 + prof.space*0.20, 0.20, 0.40);
          if(chance(rng, pullChance)){
            const windowStart = sec.start + Math.floor((rng()*sec.len)/(BAR)) * BAR;
            const w0 = windowStart + (chance(rng,0.5) ? 0 : BAR/2);
            const w1 = w0 + BAR/2;
            out[k].push(...sectionEvents.filter(e => !(e.t >= w0 && e.t < w1 && chance(rng,0.65))));
          } else {
            out[k].push(...sectionEvents);
          }
        }
      }

      // Sort
      out[k].sort((a,b)=>a.t-b.t);
    }
    return out;
  }

  function enforceClashControl(lead, bass, rng){
    // If too many lead notes coincide with bass notes on downbeats, remove some lead downbeat notes.
    // Simple heuristic: compare in 1/16 grid.
    const bassSet = new Set(bass.map(e => Math.floor(e.t / SIXTEENTH)));
    let downbeatCount = 0;
    for(const e of lead){
      const s = Math.floor(e.t / SIXTEENTH);
      if(bassSet.has(s) && (e.t % BEAT === 0)) downbeatCount++;
    }
    if(downbeatCount >= 6){
      for(let i=lead.length-1; i>=0; i--){
        const e = lead[i];
        if((e.t % BEAT === 0) && chance(rng,0.35)){
          lead.splice(i,1);
        }
      }
    }
  }

  function randVel(rng, a, b){
    return clamp(Math.round(lerp(a,b,rng())), 1, 127);
  }

  function addNote(arr, t, d, n, v){
    arr.push({t: Math.max(0, Math.floor(t)), d: Math.max(1, Math.floor(d)), n: n|0, v: v|0, type:"note"});
  }
  function addChord(arr, t, d, notes, v){
    for(const n of notes) addNote(arr, t, d, n, v);
  }
  function addDrum(arr, t, d, n, v){
    arr.push({t: Math.max(0, Math.floor(t)), d: Math.max(1, Math.floor(d)), n: n|0, v: v|0, type:"drum"});
  }

  // ---------- MIDI WRITER ----------
  function u32be(n){ return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]; }
  function u16be(n){ return [(n>>>8)&255,n&255]; }
  function strBytes(s){
    const out=[];
    for(let i=0;i<s.length;i++) out.push(s.charCodeAt(i)&255);
    return out;
  }
  function vlq(n){
    // variable-length quantity
    let v = n >>> 0;
    let bytes = [v & 0x7F];
    v >>>= 7;
    while(v){
      bytes.unshift((v & 0x7F) | 0x80);
      v >>>= 7;
    }
    return bytes;
  }
  function chunk(type, data){
    return [...strBytes(type), ...u32be(data.length), ...data];
  }

  function buildMidi(song){
    // Format 1, multiple tracks
    const tracks = [];

    // Track 0: tempo + time signature + end
    const tempoTrack = [];
    // delta 0: Time signature 4/4 (or still 4/4 in halftime)
    tempoTrack.push(...vlq(0), 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);
    // delta 0: Tempo
    const mpqn = Math.round(60000000 / song.bpm); // microseconds per quarter note
    tempoTrack.push(...vlq(0), 0xFF, 0x51, 0x03, (mpqn>>>16)&255, (mpqn>>>8)&255, mpqn&255);
    // Track name meta
    const name = `Y2K MIDI GEN • ${song.artists.join(" + ")} • ${song.mode}`;
    tempoTrack.push(...vlq(0), 0xFF, 0x03, name.length, ...strBytes(name));
    // end of track
    tempoTrack.push(...vlq(0), 0xFF, 0x2F, 0x00);
    tracks.push(chunk("MTrk", tempoTrack));

    // For each music track: name, optional program change, then notes
    for(const tr of TRACKS){
      const evs = song.tracks[tr.id] || [];
      const trk = [];
      // track name
      const tn = tr.name;
      trk.push(...vlq(0), 0xFF, 0x03, tn.length, ...strBytes(tn));

      // program change for melodic tracks (not drums)
      if(!tr.drum){
        trk.push(...vlq(0), 0xC0 | (tr.ch & 0x0F), (tr.prog ?? 0) & 0x7F);
      }

      // Build note on/off events list
      const events = [];
      for(const e of evs){
        const ch = tr.ch & 0x0F;
        const on = {t:e.t, bytes:[0x90|ch, e.n & 0x7F, e.v & 0x7F]};
        const off = {t:e.t + e.d, bytes:[0x80|ch, e.n & 0x7F, 0]};
        events.push(on, off);
      }
      events.sort((a,b)=>a.t-b.t);

      // delta encode
      let lastT = 0;
      for(const ev of events){
        const dt = Math.max(0, ev.t - lastT);
        trk.push(...vlq(dt), ...ev.bytes);
        lastT = ev.t;
      }

      // end of track
      trk.push(...vlq(0), 0xFF, 0x2F, 0x00);
      tracks.push(chunk("MTrk", trk));
    }

    // header
    const format = 1;
    const ntrks = tracks.length;
    const division = PPQ;
    const header = chunk("MThd", [
      ...u16be(format),
      ...u16be(ntrks),
      ...u16be(division),
    ]);

    const all = [...header, ...tracks.flat()];
    return new Uint8Array(all);
  }

  // ---------- WEB AUDIO PREVIEW ----------
  let audio = {
    ctx: null,
    playing: false,
    nodes: [],
    stopAt: 0,
  };

  function ensureAudio(){
    if(!audio.ctx){
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audio.ctx;
  }

  function stopAudio(){
    if(!audio.playing) return;
    audio.playing = false;
    try{
      for(const n of audio.nodes){
        try{ n.stop && n.stop(); } catch {}
        try{ n.disconnect && n.disconnect(); } catch {}
      }
    } finally {
      audio.nodes = [];
    }
  }

  function playAudio(song){
    stopAudio();
    const ctx = ensureAudio();

    // iOS requires user gesture; generate/play buttons are gestures.
    if(ctx.state === "suspended") ctx.resume();

    audio.playing = true;

    const start = ctx.currentTime + 0.05;
    const secondsPerBeat = 60 / song.bpm;
    const secondsPerTick = secondsPerBeat / PPQ;

    // Determine total length from arrangement
    const totalTicks = song.arrangement.reduce((mx,s)=>Math.max(mx, s.start+s.len), 0);
    audio.stopAt = start + totalTicks * secondsPerTick + 0.1;

    // Master
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    audio.nodes.push(master);

    // Simple synth per channel
    function synthNote(t, dur, midi, vel, type){
      const freq = 440 * Math.pow(2, (midi - 69) / 12);

      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.connect(master);

      const attack = 0.005;
      const release = 0.08;

      const amp = (vel/127) * 0.20;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack+0.01, dur - release));
      g.gain.setValueAtTime(0.0001, t + dur);

      if(type === "pad"){
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        o1.type = "sine";
        o2.type = "triangle";
        o1.frequency.value = freq;
        o2.frequency.value = freq * 0.995;

        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 1400;
        f.Q.value = 0.7;

        o1.connect(f); o2.connect(f); f.connect(g);
        o1.start(t); o2.start(t);
        o1.stop(t+dur+0.02); o2.stop(t+dur+0.02);

        audio.nodes.push(o1,o2,f,g);
      } else if(type === "bass"){
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;

        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 420;
        f.Q.value = 0.9;

        o.connect(f); f.connect(g);
        o.start(t); o.stop(t+dur+0.02);
        audio.nodes.push(o,f,g);
      } else if(type === "bell"){
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;

        const o2 = ctx.createOscillator();
        o2.type = "sine";
        o2.frequency.value = freq*2.01;

        const g2 = ctx.createGain();
        g2.gain.value = 0.35;
        o2.connect(g2); g2.connect(g);

        o.connect(g);
        o.start(t); o2.start(t);
        o.stop(t+dur+0.05); o2.stop(t+dur+0.05);
        audio.nodes.push(o,o2,g2,g);
      } else {
        // lead/texture
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = freq;

        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = Math.min(2400, Math.max(400, freq*1.2));
        f.Q.value = 1.2;

        o.connect(f); f.connect(g);
        o.start(t); o.stop(t+dur+0.02);
        audio.nodes.push(o,f,g);
      }
    }

    function drumHit(t, kind, vel){
      const v = (vel/127);
      const g = ctx.createGain();
      g.connect(master);
      g.gain.value = 0.0001;

      const dur = 0.10;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22*v + 0.0002, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      if(kind === "kick"){
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.07);
        o.connect(g);
        o.start(t);
        o.stop(t + dur);
        audio.nodes.push(o,g);
      } else if(kind === "snare" || kind === "clap"){
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate*0.12, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (kind==="clap"?0.65:1.0);
        noise.buffer = buf;

        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = kind==="clap"? 1600 : 900;

        noise.connect(f); f.connect(g);
        noise.start(t); noise.stop(t+dur);
        audio.nodes.push(noise,f,g);
      } else if(kind === "hatC" || kind === "hatO"){
        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate*0.08, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * 0.7;
        noise.buffer = buf;

        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = kind==="hatO"? 6800 : 8200;
        f.Q.value = 0.7;

        noise.connect(f); f.connect(g);
        noise.start(t); noise.stop(t + (kind==="hatO"?0.12:0.06));
        audio.nodes.push(noise,f,g);
      }
    }

    // Schedule notes from song.tracks
    const seconds = (ticks) => ticks * secondsPerTick;

    // melodic track mapping
    const mapType = {
      PAD: "pad",
      LEAD: "lead",
      BELL: "bell",
      BASS: "bass",
      TEXT: "texture",
    };

    for(const tr of TRACKS){
      const evs = song.tracks[tr.id] || [];
      for(const e of evs){
        const t = start + seconds(e.t);
        const dur = Math.max(0.03, seconds(e.d));
        if(tr.drum){
          // Map note to drum kind
          if(e.n === DR.kick) drumHit(t, "kick", e.v);
          else if(e.n === DR.snare) drumHit(t, "snare", e.v);
          else if(e.n === DR.clap) drumHit(t, "clap", e.v);
          else if(e.n === DR.hatC) drumHit(t, "hatC", e.v);
          else if(e.n === DR.hatO) drumHit(t, "hatO", e.v);
          else drumHit(t, "hatC", e.v);
        } else {
          synthNote(t, dur, e.n, e.v, mapType[tr.id] || "lead");
        }
      }
    }

    // Auto-stop
    const stopDelayMs = Math.max(0, (audio.stopAt - ctx.currentTime) * 1000);
    window.setTimeout(() => {
      if(audio.playing) stopAudio();
    }, stopDelayMs);
  }

  // ---------- DOWNLOAD ----------
  function downloadMidi(bytes, filename){
    const blob = new Blob([bytes], {type:"audio/midi"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
  }

  function fileName(song){
    const preset = song.mode === "SOLO" ? song.mainArtist.replace(/\s+/g,"") : "MIX";
    const key = `${noteName(song.root)}_${song.scale.toUpperCase()}`;
    const bpm = `${song.bpm}BPM`;
    return `Y2K_MIDI_${preset}_${bpm}_${key}_SEED${song.seed}.mid`;
  }

  // ---------- RENDER TRACKLIST ----------
  function renderTrackList(song){
    trackListEl.innerHTML = "";
    const totalTicks = song.arrangement.reduce((mx,s)=>Math.max(mx, s.start+s.len), 0);
    const bars = Math.round(totalTicks / BAR);

    const header = document.createElement("div");
    header.className = "trackItem";
    header.innerHTML = `
      <div class="trackName">SESSION</div>
      <div class="trackMeta">${bars} BARS • ${song.bpm} BPM • ${noteName(song.root)} ${song.scale.toUpperCase()} • ${song.mode}</div>
    `;
    trackListEl.appendChild(header);

    for(const tr of TRACKS){
      const evs = song.tracks[tr.id] || [];
      const item = document.createElement("div");
      item.className = "trackItem";
      const mutedHint = (evs.length === 0) ? "—" : `${evs.length} NOTES`;
      item.innerHTML = `
        <div class="trackName">${tr.name}</div>
        <div class="trackMeta">${mutedHint}</div>
      `;
      trackListEl.appendChild(item);
    }

    // arrangement list
    const arr = document.createElement("div");
    arr.className = "trackItem";
    const secText = song.arrangement.map(s => `${s.name}:${Math.round(s.len/BAR)}b`).join(" • ");
    arr.innerHTML = `
      <div class="trackName">ARRANGEMENT</div>
      <div class="trackMeta">${secText}</div>
    `;
    trackListEl.appendChild(arr);
  }

  // ---------- MAIN FLOW ----------
  function generate(){
    state.seed = randomSeed();
    seedValueEl.textContent = String(state.seed);

    const blend = blendProfiles(state.selectedArtists);
    if(state.bpmMode === "artist"){
      // update default range fields to main-artist recommended (for visibility)
      bpmMinInput.value = String(blend.profile.bpm[0]);
      bpmMaxInput.value = String(blend.profile.bpm[1]);
    }

    const song = buildSong(state.seed);
    state.resolved = song;

    // UI tags
    bpmNowEl.textContent = `BPM: ${song.bpm}`;
    keyNowEl.textContent = `KEY: ${noteName(song.root)} ${song.scale.toUpperCase()}`;
    artistsNowEl.textContent = `ARTISTS: ${song.artists.join(" + ")}`;

    updateModeLabel();

    // MIDI
    const bytes = buildMidi(song);
    state.midiBytes = bytes;

    // Tracklist
    renderTrackList(song);
  }

  // ---------- EVENTS ----------
  copySeedBtn.addEventListener("click", async () => {
    const txt = seedValueEl.textContent || "";
    try{
      await navigator.clipboard.writeText(txt);
      copySeedBtn.textContent = "COPIED";
      setTimeout(()=>copySeedBtn.textContent="COPY", 900);
    }catch{
      // fallback
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      copySeedBtn.textContent = "COPIED";
      setTimeout(()=>copySeedBtn.textContent="COPY", 900);
    }
  });

  generateBtn.addEventListener("click", () => {
    generate();
  });

  playBtn.addEventListener("click", () => {
    if(!state.resolved) generate();
    playAudio(state.resolved);
  });

  stopBtn.addEventListener("click", () => {
    stopAudio();
  });

  settingsBtn.addEventListener("click", () => toggleSettings());

  hideBtn.addEventListener("click", () => setHiddenHUD(!state.hiddenHUD));
  showBtn.addEventListener("click", () => setHiddenHUD(false));

  downloadBtn.addEventListener("click", () => {
    if(!state.resolved || !state.midiBytes) generate();
    downloadMidi(state.midiBytes, fileName(state.resolved));
  });
  downloadBtnMini.addEventListener("click", () => {
    if(!state.resolved || !state.midiBytes) generate();
    downloadMidi(state.midiBytes, fileName(state.resolved));
  });

  bpmMinus.addEventListener("click", () => {
    state.bpmManual = clamp((state.bpmManual|0) - 1, 60, 220);
    bpmDisplay.textContent = String(state.bpmManual);
  });
  bpmPlus.addEventListener("click", () => {
    state.bpmManual = clamp((state.bpmManual|0) + 1, 60, 220);
    bpmDisplay.textContent = String(state.bpmManual);
  });

  // Segmented buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".segBtn");
    if(!btn) return;
    const s = btn.dataset.setting;
    const v = btn.dataset.value;

    if(s === "songSketch"){
      state.songSketch = (v === "on");
    } else if(s === "bpmMode"){
      state.bpmMode = v;
      // in artist mode, sync suggested range
      if(v === "artist"){
        const [mn,mx] = getArtistBpmRange();
        bpmMinInput.value = mn;
        bpmMaxInput.value = mx;
      }
    } else if(s === "keyMode"){
      state.keyMode = v;
    } else if(s === "scaleMode"){
      state.scaleMode = v;
    }
    syncSegUI();
  });

  // Inputs update state
  bpmFixedInput.addEventListener("change", () => {
    state.bpmFixed = clamp(parseInt(bpmFixedInput.value||"170",10), 60, 220);
  });
  bpmMinInput.addEventListener("change", () => {
    const mn = clamp(parseInt(bpmMinInput.value||"155",10), 60, 220);
    const mx = clamp(parseInt(bpmMaxInput.value||"180",10), 60, 220);
    state.bpmRange = [Math.min(mn,mx), Math.max(mn,mx)];
  });
  bpmMaxInput.addEventListener("change", () => {
    const mn = clamp(parseInt(bpmMinInput.value||"155",10), 60, 220);
    const mx = clamp(parseInt(bpmMaxInput.value||"180",10), 60, 220);
    state.bpmRange = [Math.min(mn,mx), Math.max(mn,mx)];
  });

  // ---------- INIT ----------
  function init(){
    // default artist selection
    state.selectedArtists = ["FAKEMINK"];
    state.songSketch = false;
    state.bpmMode = "artist";
    state.keyMode = "auto";
    state.scaleMode = "auto";
    state.root = 9; // A
    state.bpmManual = 170;

    buildArtistChips();
    buildKeyButtons();
    updateModeLabel();
    syncSegUI();

    // First generate immediately (no user permission required)
    generate();
  }

  init();

})();
