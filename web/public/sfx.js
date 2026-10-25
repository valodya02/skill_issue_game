(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var musicBus = null;
  var noiseBuffer = null;
  var voices = [];
  var listener = { x: 800, y: 450 };
  var level = 0.8;
  var musicWanted = false;
  var clock = null;
  var nextBeat = 0;
  var beatNumber = 0;

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function activate() {
    if (!ctx) {
      var Audio = root.AudioContext || root.webkitAudioContext;
      if (!Audio) return;
      try {
        ctx = new Audio();
        master = ctx.createGain();
        master.gain.value = level;
        master.connect(ctx.destination);
        musicBus = ctx.createGain();
        musicBus.gain.value = 0.19;
        musicBus.connect(master);
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        var data = noiseBuffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      } catch (error) {
        ctx = null;
        return;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    if (musicWanted && !clock) startMusic();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', activate, { capture: true, once: true });
    document.addEventListener('click', activate, { capture: true, once: true });
  }

  function stopVoice(v) {
    if (v.dead) return;
    v.dead = true;
    clearTimeout(v.timer);
    v.sources.forEach(function (source) {
      try { source.stop(); } catch (error) {}
      try { source.disconnect(); } catch (error) {}
    });
    v.nodes.forEach(function (node) { try { node.disconnect(); } catch (error) {} });
    var index = voices.indexOf(v);
    if (index !== -1) voices.splice(index, 1);
  }

  function voice(duration, opts, isMusic) {
    if (!ctx) return null;
    if (voices.length >= 24) stopVoice(voices[0]);
    var v = { sources: [], nodes: [], dead: false, music: isMusic, time: ctx.currentTime };
    var gain = ctx.createGain();
    var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    var distance = 1;
    var leftRight = 0;
    if (!isMusic && opts && Number.isFinite(opts.x) && Number.isFinite(opts.y)) {
      var dx = opts.x - listener.x;
      var dy = opts.y - listener.y;
      distance = Math.pow(clamp(1 - Math.hypot(dx, dy) / 900, 0, 1), 1.3);
      leftRight = clamp(dx / 550, -1, 1);
    }
    gain.gain.value = distance;
    if (pan) {
      pan.pan.value = leftRight;
      gain.connect(pan);
      pan.connect(isMusic ? musicBus : master);
      v.nodes.push(gain, pan);
    } else {
      gain.connect(isMusic ? musicBus : master);
      v.nodes.push(gain);
    }
    v.input = gain;
    voices.push(v);
    v.timer = setTimeout(function () { stopVoice(v); }, Math.max(0, (v.time + duration - ctx.currentTime) * 1000 + 80));
    return v;
  }

  function tone(v, type, from, to, offset, duration, loudness, attack) {
    if (!v) return;
    var start = v.time + offset;
    var oscillator = ctx.createOscillator();
    var envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, from), start);
    if (to && to !== from) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(loudness, start + Math.min(attack || 0.006, duration / 2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(v.input);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
    v.sources.push(oscillator);
    v.nodes.push(envelope);
  }

  function noise(v, offset, duration, loudness, cutoff, highpass) {
    if (!v) return;
    var start = v.time + offset;
    var source = ctx.createBufferSource();
    var filter = ctx.createBiquadFilter();
    var envelope = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = highpass ? 'highpass' : 'lowpass';
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(Math.max(0.0001, loudness), start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(v.input);
    source.start(start, Math.random() * Math.max(0, 1 - duration), duration);
    v.sources.push(source);
    v.nodes.push(filter, envelope);
  }

  function play(name, opts) {
    if (!ctx) return;
    opts = opts || {};
    var v;
    var n;
    switch (name) {
      case 'shot':
        v = voice(0.15, opts, false);
        tone(v, 'square', 270, 80, 0, 0.09, 0.19);
        noise(v, 0, 0.075, 0.42, 2400, true);
        break;
      case 'boom':
        v = voice(0.85, opts, false);
        tone(v, 'sine', 125, 36, 0, 0.7, 0.7, 0.008);
        noise(v, 0, 0.52, 0.55, 550, false);
        break;
      case 'jump':
        v = voice(0.24, opts, false);
        tone(v, 'triangle', 170, 460, 0, 0.2, 0.25);
        break;
      case 'land':
        v = voice(0.23, opts, false);
        tone(v, 'sine', 125, 52, 0, 0.18, 0.37);
        noise(v, 0, 0.12, 0.14, 700, false);
        break;
      case 'hop':
        n = clamp(Number(opts.n) || 0, 0, 12);
        v = voice(0.23, opts, false);
        tone(v, 'triangle', 260 + n * 60, 400 + n * 85, 0, 0.2, 0.31);
        break;
      case 'coffee':
        v = voice(0.55, opts, false);
        tone(v, 'sine', 360, 110, 0, 0.29, 0.23, 0.03);
        noise(v, 0.13, 0.38, 0.17, 3600, true);
        break;
      case 'smoke':
        v = voice(0.52, opts, false);
        noise(v, 0, 0.47, 0.26, 1900, true);
        break;
      case 'code_ok':
        v = voice(0.38, opts, false);
        tone(v, 'sine', 660, 660, 0, 0.13, 0.3);
        tone(v, 'sine', 990, 990, 0.14, 0.18, 0.28);
        break;
      case 'code_fail':
        v = voice(0.47, opts, false);
        tone(v, 'sawtooth', 330, 190, 0, 0.2, 0.19);
        tone(v, 'sawtooth', 250, 110, 0.2, 0.23, 0.18);
        break;
      case 'plant':
        v = voice(0.77, opts, false);
        for (n = 0; n < 3; n++) tone(v, 'square', 750 + n * 110, 750 + n * 110, n * 0.23, 0.16, 0.16);
        break;
      case 'defuse':
        v = voice(0.85, opts, false);
        tone(v, 'sine', 392, 392, 0, 0.19, 0.23);
        tone(v, 'sine', 523, 523, 0.2, 0.23, 0.24);
        tone(v, 'sine', 784, 784, 0.44, 0.35, 0.26);
        break;
      case 'turret':
        v = voice(0.65, opts, false);
        for (n = 0; n < 5; n++) {
          tone(v, 'square', 190, 65, n * 0.11, 0.09, 0.24);
          noise(v, n * 0.11, 0.065, 0.2, 1800, true);
        }
        break;
      case 'kill':
        v = voice(0.7, opts, false);
        tone(v, 'sine', 988, 988, 0, 0.46, 0.32);
        tone(v, 'sine', 1480, 1480, 0.03, 0.57, 0.17);
        break;
      case 'round':
        v = voice(1.15, opts, false);
        tone(v, 'sawtooth', 196, 196, 0, 0.48, 0.2, 0.04);
        tone(v, 'sawtooth', 294, 294, 0.5, 0.55, 0.2, 0.04);
        break;
      case 'buy':
        v = voice(0.47, opts, false);
        noise(v, 0, 0.07, 0.22, 2500, true);
        tone(v, 'square', 660, 660, 0.08, 0.1, 0.16);
        tone(v, 'sine', 1320, 1320, 0.2, 0.21, 0.2);
        break;
    }
  }

  function scheduleBeat(at, index) {
    var phase = index % 32;
    var bar = Math.floor(phase / 4);
    var step = phase % 4;
    var v;
    var melody = [0, 7, 10, 7, 3, 7, 12, 10];
    if (step === 0 || step === 2) {
      v = voice(at - ctx.currentTime + 0.33, null, true);
      v.time = at;
      tone(v, 'sine', 135, 43, 0, 0.26, 0.85);
      noise(v, 0, 0.06, 0.22, 500, false);
    }
    if (step === 1 || step === 3) {
      v = voice(at - ctx.currentTime + 0.16, null, true);
      v.time = at;
      noise(v, 0, 0.13, 0.18, 2100, true);
    }
    for (var h = 0; h < 2; h++) {
      v = voice(at - ctx.currentTime + 0.34, null, true);
      v.time = at;
      noise(v, h * 0.3, 0.055, 0.12, 4800, true);
    }
    var bass = [55, 55, 65.41, 49][Math.floor(bar / 2)];
    v = voice(at - ctx.currentTime + 0.37, null, true);
    v.time = at;
    tone(v, 'triangle', bass, bass, 0, 0.32, 0.42);
    if (step === 0 || step === 2) {
      var semitone = melody[(bar + (step === 2 ? 1 : 0)) % 8];
      var frequency = 261.63 * Math.pow(2, semitone / 12);
      v = voice(at - ctx.currentTime + 0.28, null, true);
      v.time = at;
      tone(v, 'triangle', frequency, frequency, 0, 0.24, 0.23);
    }
  }

  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    while (nextBeat < ctx.currentTime + 0.22) {
      scheduleBeat(nextBeat, beatNumber++);
      nextBeat += 0.6;
    }
  }

  function startMusic() {
    if (!ctx || clock) return;
    nextBeat = ctx.currentTime + 0.05;
    beatNumber = 0;
    clock = setInterval(tick, 80);
    tick();
  }

  root.SFX = {
    play: play,
    music: function (on) {
      musicWanted = !!on;
      if (musicWanted) {
        if (ctx) startMusic();
      } else {
        clearInterval(clock);
        clock = null;
        voices.slice().forEach(function (v) { if (v.music) stopVoice(v); });
      }
    },
    setListener: function (x, y) {
      if (Number.isFinite(x) && Number.isFinite(y)) listener = { x: x, y: y };
    },
    volume: function (value) {
      if (!Number.isFinite(value)) return;
      level = clamp(value, 0, 1);
      if (master) master.gain.value = level;
    }
  };
})(this);
