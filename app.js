/**
 * RAAS LEELA 2026 — Interactive Web Application
 * Handles:
 * - Golden Diya Embers Canvas Particle Engine
 * - Real-time Countdown Timer (13 Oct 2026, 6:00 PM)
 * - Web Audio API Festive Garba Groove & Dandiya Clack Synthesizer
 * - Interactive Dandiya Rhythm Pad & Energy Meter
 * - Pass Booking Calculation & Royal E-Pass QR Code Generator
 * - Poster Lightbox, FAQ Accordions & Mobile Drawer
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. AMBIENT GOLDEN PARTICLES CANVAS (Floating Diya Sparks)
     ========================================================================== */
  const canvas = document.getElementById('ambient-particles');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const particles = [];
    const particleCount = Math.min(width > 768 ? 45 : 22, 50);

    class Spark {
      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * width;
        this.y = height + Math.random() * 20;
        this.size = Math.random() * 2.5 + 1;
        this.speedY = Math.random() * 0.8 + 0.3;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random() * 0.7 + 0.2;
        this.hue = Math.random() > 0.3 ? 45 : 30; // Golden yellow or warm saffron
        this.pulse = Math.random() * 0.05 + 0.01;
      }

      update() {
        this.y -= this.speedY;
        this.x += Math.sin(this.y * 0.01) * 0.6 + this.speedX;
        this.opacity += Math.sin(this.y * 0.05) * this.pulse;

        if (this.y < -10 || this.x < -20 || this.x > width + 20) {
          this.reset();
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.hue}, 95%, 65%, ${Math.max(0.1, Math.min(0.9, this.opacity))})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.7)';
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    for (let i = 0; i < particleCount; i++) {
      const s = new Spark();
      s.y = Math.random() * height; // distribute initially
      particles.push(s);
    }

    function animateParticles() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animateParticles);
    }
    animateParticles();
  }

  /* ==========================================================================
     2. COUNTDOWN TIMER (13 October 2026, 18:00:00 IST)
     ========================================================================== */
  const eventDate = new Date('2026-10-13T18:00:00+05:30').getTime();

  const elDays = document.getElementById('cd-days');
  const elHours = document.getElementById('cd-hours');
  const elMinutes = document.getElementById('cd-minutes');
  const elSeconds = document.getElementById('cd-seconds');

  function updateCountdown() {
    const now = new Date().getTime();
    const diff = eventDate - now;

    if (diff <= 0) {
      if (elDays) elDays.textContent = '00';
      if (elHours) elHours.textContent = '00';
      if (elMinutes) elMinutes.textContent = '00';
      if (elSeconds) elSeconds.textContent = '00';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (elDays) elDays.textContent = String(days).padStart(2, '0');
    if (elHours) elHours.textContent = String(hours).padStart(2, '0');
    if (elMinutes) elMinutes.textContent = String(minutes).padStart(2, '0');
    if (elSeconds) elSeconds.textContent = String(seconds).padStart(2, '0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  /* ==========================================================================
     3. WEB AUDIO API SYNTHESIZER (Dhol, Dandiya Clacks & Ambient Loop)
     ========================================================================== */
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Synthesize acoustic Dandiya stick clack
  function playDandiyaClack(pitchVariation = 1.0) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // High resonant wooden stick impact
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1800 * pitchVariation, t);
    osc.frequency.exponentialRampToValueAtTime(800 * pitchVariation, t + 0.04);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, t);
    filter.Q.setValueAtTime(6.0, t);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.07);

    // Subtle Ghungroo / ring overtone
    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(3200 * pitchVariation, t);
    bellGain.gain.setValueAtTime(0.15, t);
    bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    bell.connect(bellGain);
    bellGain.connect(ctx.destination);
    bell.start(t);
    bell.stop(t + 0.09);
  }

  // Synthesize booming Dhol Bass thump
  function playDholBass() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);

    gain.gain.setValueAtTime(0.85, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.36);
  }

  // Synthesize Dholak Chaati snap
  function playChaatiSnap() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.08);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  // Ambient Garba 3-Taali Loop Engine (High Energy & Fast Tempo)
  let ambientPlaying = false;
  let ambientInterval = null;
  let beatStep = 0;
  let tempoSpeed = 190; // High energy ~155 BPM fast Garba rhythm

  function toggleAmbientAudio() {
    const btn = document.getElementById('audio-toggle-btn');
    const mutedIcon = btn?.querySelector('.audio-muted');
    const playingIcon = btn?.querySelector('.audio-playing');

    if (!ambientPlaying) {
      getAudioContext();
      ambientPlaying = true;
      btn?.classList.add('audio-playing-active');
      if (mutedIcon) mutedIcon.style.display = 'none';
      if (playingIcon) playingIcon.style.display = 'inline-block';

      // Fast-paced authentic Gujarati Dodhiya / 3-Taali groove
      beatStep = 0;
      ambientInterval = setInterval(() => {
        if (beatStep % 6 === 0) {
          playDholBass();
          playDandiyaClack(1.0);
        } else if (beatStep % 6 === 2) {
          playChaatiSnap();
          playDandiyaClack(1.2);
        } else if (beatStep % 6 === 3) {
          playDholBass();
        } else if (beatStep % 6 === 4) {
          playChaatiSnap();
        } else if (beatStep % 6 === 5) {
          playDandiyaClack(0.95);
        }
        beatStep++;
      }, tempoSpeed);
    } else {
      ambientPlaying = false;
      btn?.classList.remove('audio-playing-active');
      if (mutedIcon) mutedIcon.style.display = 'inline-block';
      if (playingIcon) playingIcon.style.display = 'none';
      if (ambientInterval) {
        clearInterval(ambientInterval);
        ambientInterval = null;
      }
    }
  }

  const audioToggleBtn = document.getElementById('audio-toggle-btn');
  if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click', toggleAmbientAudio);
  }

  // DJ Aura Spotlight Sound Preview Buttons
  document.querySelectorAll('.play-dj-sample').forEach((btn) => {
    btn.addEventListener('click', () => {
      const soundType = btn.getAttribute('data-sound');
      if (soundType === 'dhol-drop') {
        playDholBass();
        setTimeout(playDholBass, 140);
        setTimeout(playDholBass, 280);
      } else if (soundType === 'garba-groove') {
        playDholBass();
        setTimeout(() => playDandiyaClack(1.1), 160);
        setTimeout(() => playChaatiSnap(), 320);
        setTimeout(() => playDandiyaClack(0.9), 480);
      } else if (soundType === 'clack-tempo') {
        playDandiyaClack(1.0);
        setTimeout(() => playDandiyaClack(1.2), 120);
        setTimeout(() => playDandiyaClack(1.05), 240);
      }
    });
  });

  /* ==========================================================================
     4. INTERACTIVE DANDIYA BEAT SIMULATOR & ENERGY METER
     ========================================================================== */
  let clackTotal = 0;
  let comboTotal = 0;
  let comboTimer = null;

  const clackCountEl = document.getElementById('clack-count');
  const comboCountEl = document.getElementById('combo-count');
  const energyMeterEl = document.getElementById('energy-meter');
  const clashSparkleEl = document.getElementById('clashSparkle');
  const clashTextEl = document.getElementById('clashText');

  const clashPhrases = ['CHHAN!', 'THAK!', 'TAAL!', 'GARBA!', 'HAAL NE!', 'DODHIYA!', 'AURA DROP!'];

  function triggerClack(side) {
    playDandiyaClack(side === 'left' ? 1.05 : 0.95);
    clackTotal++;
    comboTotal++;

    if (clackCountEl) clackCountEl.textContent = clackTotal;
    if (comboCountEl) comboCountEl.textContent = comboTotal + 'x';

    // Update Energy Meter Tier
    if (energyMeterEl) {
      if (comboTotal < 5) energyMeterEl.textContent = 'Warmup';
      else if (comboTotal < 12) energyMeterEl.textContent = '3-Taali Groove';
      else if (comboTotal < 25) energyMeterEl.textContent = 'Dodhiya Fire 🔥';
      else if (comboTotal < 50) energyMeterEl.textContent = 'Mega Garba King 👑';
      else energyMeterEl.textContent = 'GODMODE TAAL! ⚡';
    }

    // Reset combo timeout
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
      comboTotal = 0;
      if (comboCountEl) comboCountEl.textContent = '0x';
      if (energyMeterEl) energyMeterEl.textContent = 'Warmup';
    }, 2000);

    // Visual Stick Swing (Snappy & Fast)
    const stickGraphic = document.querySelector(`.stick-g-${side}`);
    if (stickGraphic) {
      stickGraphic.classList.add(`clack-active-${side}`);
      setTimeout(() => {
        stickGraphic.classList.remove(`clack-active-${side}`);
      }, 75);
    }

    // Sparkle & text animation
    if (clashSparkleEl && clashTextEl) {
      const phrase = clashPhrases[Math.floor(Math.random() * clashPhrases.length)];
      clashTextEl.textContent = phrase;
      clashSparkleEl.classList.add('spark-active');
      clashTextEl.classList.add('spark-active');
      setTimeout(() => {
        clashSparkleEl.classList.remove('spark-active');
        clashTextEl.classList.remove('spark-active');
      }, 120);
    }
  }

  const dandiyaLeftBtn = document.getElementById('dandiyaLeftBtn');
  const dandiyaRightBtn = document.getElementById('dandiyaRightBtn');

  if (dandiyaLeftBtn) {
    dandiyaLeftBtn.addEventListener('click', () => triggerClack('left'));
  }
  if (dandiyaRightBtn) {
    dandiyaRightBtn.addEventListener('click', () => triggerClack('right'));
  }

  // Keyboard shortcut listener ('A' for left, 'L' for right)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'a' || e.key === 'A') {
      triggerClack('left');
    } else if (e.key === 'l' || e.key === 'L') {
      triggerClack('right');
    }
  });

  /* ==========================================================================
     5. PASS BOOKING FLOW & MODAL MANAGEMENT
     ========================================================================== */
  const bookingModal = document.getElementById('bookingModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const passTypeSelect = document.getElementById('passTypeSelect');
  const passQuantity = document.getElementById('passQuantity');
  const qtyMinus = document.getElementById('qtyMinus');
  const qtyPlus = document.getElementById('qtyPlus');
  const summaryPassDesc = document.getElementById('summaryPassDesc');
  const summarySubtotal = document.getElementById('summarySubtotal');
  const summaryTotal = document.getElementById('summaryTotal');
  const passOrderForm = document.getElementById('passOrderForm');
  const modalStepForm = document.getElementById('modalStepForm');
  const modalStepSuccess = document.getElementById('modalStepSuccess');

  const prices = {
    stag: 299,
    couple: 499,
    group: 1199,
  };

  const passNames = {
    stag: 'Stag Pass (1 Person)',
    couple: 'Couple Pass (2 Persons)',
    group: 'Group of 5 (5 Persons)',
  };

  function updateOrderCalculation() {
    const selected = passTypeSelect.value;
    const qty = parseInt(passQuantity.value, 10) || 1;
    const pricePerUnit = prices[selected] || 499;
    const total = pricePerUnit * qty;

    if (summaryPassDesc) {
      summaryPassDesc.textContent = `${passNames[selected]} × ${qty}`;
    }
    if (summarySubtotal) {
      summarySubtotal.textContent = `₹${total.toLocaleString('en-IN')}`;
    }
    if (summaryTotal) {
      summaryTotal.textContent = `₹${total.toLocaleString('en-IN')}`;
    }
  }

  if (passTypeSelect) {
    passTypeSelect.addEventListener('change', updateOrderCalculation);
  }

  if (qtyMinus) {
    qtyMinus.addEventListener('click', () => {
      let current = parseInt(passQuantity.value, 10) || 1;
      if (current > 1) {
        passQuantity.value = current - 1;
        updateOrderCalculation();
      }
    });
  }

  if (qtyPlus) {
    qtyPlus.addEventListener('click', () => {
      let current = parseInt(passQuantity.value, 10) || 1;
      if (current < 10) {
        passQuantity.value = current + 1;
        updateOrderCalculation();
      }
    });
  }

  // Open booking modal when clicking "Book" buttons
  document.querySelectorAll('.book-now-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const type = btn.getAttribute('data-type');
      if (passTypeSelect && type && prices[type]) {
        passTypeSelect.value = type;
      }
      if (passQuantity) passQuantity.value = 1;
      updateOrderCalculation();
      openBookingModal();
    });
  });

  function openBookingModal() {
    if (modalStepForm) modalStepForm.style.display = 'block';
    if (modalStepSuccess) modalStepSuccess.style.display = 'none';
    if (bookingModal) {
      bookingModal.classList.add('active');
      bookingModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeBookingModal() {
    if (bookingModal) {
      bookingModal.classList.remove('active');
      bookingModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeBookingModal);
  }

  if (bookingModal) {
    bookingModal.addEventListener('click', (e) => {
      if (e.target === bookingModal) closeBookingModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bookingModal && bookingModal.classList.contains('active')) {
      closeBookingModal();
    }
  });

  /* ==========================================================================
     6. DIGITAL E-PASS QR CODE GENERATOR (Pure HTML5 Canvas QR)
     ========================================================================== */
  function drawQrCode(canvasElem, text) {
    if (!canvasElem) return;
    const ctx = canvasElem.getContext('2d');
    const size = canvasElem.width;
    ctx.clearRect(0, 0, size, size);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Generate deterministic pseudo-QR matrix pattern from input string
    const gridCount = 21; // Standard Version 1 QR matrix is 21x21
    const cellSize = Math.floor(size / gridCount);
    const offset = Math.floor((size - cellSize * gridCount) / 2);

    // Compute simple hash for consistent matrix
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    ctx.fillStyle = '#1e0207'; // Deep maroon / dark ink

    // Helper to draw QR finder pattern (top-left, top-right, bottom-left)
    function drawFinder(startX, startY) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (isOuter || isInner) {
            ctx.fillRect(
              offset + (startX + c) * cellSize,
              offset + (startY + r) * cellSize,
              cellSize,
              cellSize
            );
          }
        }
      }
    }

    // 3 Finder patterns
    drawFinder(0, 0); // Top-left
    drawFinder(gridCount - 7, 0); // Top-right
    drawFinder(0, gridCount - 7); // Bottom-left

    // Fill data grid
    for (let r = 0; r < gridCount; r++) {
      for (let c = 0; c < gridCount; c++) {
        // Skip finder areas
        if (
          (r < 8 && c < 8) ||
          (r < 8 && c >= gridCount - 8) ||
          (r >= gridCount - 8 && c < 8)
        ) {
          continue;
        }

        // Timing patterns
        if (r === 6 || c === 6) {
          if ((r + c) % 2 === 0) {
            ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
          }
          continue;
        }

        // Pseudo-random data cells seeded with hash
        const cellVal = Math.sin(hash * 0.1 + r * 13 + c * 37);
        if (cellVal > 0) {
          ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // Handle Pass Form Submission
  if (passOrderForm) {
    passOrderForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('attendeeName')?.value.trim() || 'Valued Guest';
      const phone = document.getElementById('attendeePhone')?.value.trim() || '';
      const selectedPass = passTypeSelect.value;
      const qty = parseInt(passQuantity.value, 10) || 1;
      const totalCost = (prices[selectedPass] || 499) * qty;

      // Generate Pass ID
      const randomId = Math.floor(100000 + Math.random() * 900000);
      const passId = `RL26-HUB-${randomId}`;

      // Populate Success Pass Details
      const tName = document.getElementById('ticketAttendeeName');
      const tType = document.getElementById('ticketPassType');
      const tAmount = document.getElementById('ticketAmount');
      const tPassId = document.getElementById('ticketPassId');

      if (tName) tName.textContent = name;
      if (tType) tType.textContent = `${passNames[selectedPass]} × ${qty}`;
      if (tAmount) tAmount.textContent = `₹${totalCost.toLocaleString('en-IN')} (CONFIRMED)`;
      if (tPassId) tPassId.textContent = passId;

      // Draw QR Code
      const qrCanvas = document.getElementById('ticketQrCanvas');
      drawQrCode(qrCanvas, `${passId}|${name}|${phone}|${selectedPass}|${qty}`);

      // Setup WhatsApp Confirmation Link
      const waBtn = document.getElementById('whatsappSharePassBtn');
      if (waBtn) {
        const msg = encodeURIComponent(
          `Namaste Basu & Sumith! I have generated my pass for RAAS LEELA 2026.\n\n` +
          `🎟 Pass ID: ${passId}\n` +
          `👤 Name: ${name}\n` +
          `📱 Phone: ${phone}\n` +
          `✨ Category: ${passNames[selectedPass]} (Qty: ${qty})\n` +
          `💰 Total: ₹${totalCost}\n` +
          `📍 Venue: Sports Space, Hubli\n` +
          `Please confirm my reservation. See you on 13th Oct!`
        );
        waBtn.href = `https://wa.me/919916879803?text=${msg}`;
      }

      // Switch Modal Step
      if (modalStepForm) modalStepForm.style.display = 'none';
      if (modalStepSuccess) modalStepSuccess.style.display = 'block';

      // Play joyful celebratory sound
      playDandiyaClack(1.3);
      setTimeout(playDholBass, 100);
    });
  }

  // Print Pass Action
  const printPassBtn = document.getElementById('printPassBtn');
  if (printPassBtn) {
    printPassBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Book Another Pass Reset
  const bookAnotherBtn = document.getElementById('bookAnotherBtn');
  if (bookAnotherBtn) {
    bookAnotherBtn.addEventListener('click', () => {
      if (passOrderForm) passOrderForm.reset();
      if (passQuantity) passQuantity.value = 1;
      updateOrderCalculation();
      if (modalStepSuccess) modalStepSuccess.style.display = 'none';
      if (modalStepForm) modalStepForm.style.display = 'block';
    });
  }

  /* ==========================================================================
     7. POSTER FULLSCREEN LIGHTBOX
     ========================================================================== */
  const posterLightbox = document.getElementById('posterLightbox');
  const viewPosterBtn = document.getElementById('view-poster-btn');
  const posterClickTrigger = document.getElementById('posterClickTrigger');
  const posterLightboxClose = document.getElementById('posterLightboxClose');
  const posterBookTrigger = document.querySelector('.poster-book-trigger');

  function openPosterLightbox() {
    if (posterLightbox) {
      posterLightbox.classList.add('active');
      posterLightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  function closePosterLightbox() {
    if (posterLightbox) {
      posterLightbox.classList.remove('active');
      posterLightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  if (viewPosterBtn) viewPosterBtn.addEventListener('click', openPosterLightbox);
  if (posterClickTrigger) posterClickTrigger.addEventListener('click', openPosterLightbox);
  if (posterLightboxClose) posterLightboxClose.addEventListener('click', closePosterLightbox);
  if (posterLightbox) {
    posterLightbox.addEventListener('click', (e) => {
      if (e.target === posterLightbox) closePosterLightbox();
    });
  }
  if (posterBookTrigger) {
    posterBookTrigger.addEventListener('click', () => {
      closePosterLightbox();
      openBookingModal();
    });
  }

  /* ==========================================================================
     8. FAQ ACCORDION
     ========================================================================== */
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const parent = btn.parentElement;
      const isExpanded = parent.classList.contains('active');

      // Collapse all
      document.querySelectorAll('.faq-item').forEach((item) => {
        item.classList.remove('active');
        item.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });

      // Toggle current
      if (!isExpanded) {
        parent.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ==========================================================================
     9. MOBILE NAVIGATION DRAWER
     ========================================================================== */
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');

  function openDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeDrawer() {
    if (mobileDrawer) {
      mobileDrawer.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);

  document.querySelectorAll('.drawer-link').forEach((link) => {
    link.addEventListener('click', closeDrawer);
  });

})();
