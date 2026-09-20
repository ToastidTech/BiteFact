/* BiteFact lead capture — mirrors Cope's HubSpot flow.
 * - First-visit overlay starts a 3-day free trial of the AI plate scanner.
 * - Lead is POSTed to /api/bitefact-lead and synced to HubSpot (non-blocking).
 * - PayPal subscription buttons for Plus ($12.99) and AI ($19.99).
 */
(() => {
  'use strict';

  const INTRO_KEY = 'bitefactLeadIntroShown_v1';
  const CAPTURED_KEY = 'bitefactLeadCaptured_v1';
  const TRIAL_KEY = 'bitefactTrialExpiresAt_v1';
  const DEVICE_KEY = 'bitefactDeviceId_v1';
  const ENDPOINT = '/api/bitefact-lead';
  const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;

  // TODO(Sean): replace with the BiteFact PayPal app client ID.
  const PAYPAL_CLIENT_ID = 'REPLACE_WITH_BITEFACT_PAYPAL_CLIENT_ID';
  const PAYPAL_PLANS = {
    plus: 'P-5M38629825526033ANKW7GIY',
    ai: 'P-0AE91990E8900093ENKW7IYQ'
  };

  function paypalConfigured() {
    return PAYPAL_CLIENT_ID && !PAYPAL_CLIENT_ID.startsWith('REPLACE_WITH');
  }

  window.bitefactTrialActive = function () {
    const exp = Number(localStorage.getItem(TRIAL_KEY) || 0);
    return Number.isFinite(exp) && exp > Date.now();
  };

  window.bitefactTrialDaysLeft = function () {
    const exp = Number(localStorage.getItem(TRIAL_KEY) || 0);
    if (!Number.isFinite(exp) || exp <= Date.now()) return 0;
    return Math.max(1, Math.ceil((exp - Date.now()) / (24 * 60 * 60 * 1000)));
  };

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'bitefact-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function injectStyles() {
    if (document.getElementById('bitefactLeadStyles')) return;
    const style = document.createElement('style');
    style.id = 'bitefactLeadStyles';
    style.textContent = `
      #bitefactLeadOverlay { position:fixed; inset:0; display:none; align-items:flex-end; justify-content:center; padding:16px; background:rgba(3,6,12,.82); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); z-index:9999; }
      #bitefactLeadOverlay.open { display:flex; }
      .bitefact-lead-card { width:min(100%,440px); max-height:calc(100dvh - 32px); overflow-y:auto; background:#0d1420; border:1px solid rgba(82,140,255,.35); border-radius:22px; padding:22px; box-shadow:0 24px 80px rgba(0,0,0,.55); }
      .bitefact-lead-card h2 { color:#f4f8ff; font-size:1.5rem; line-height:1.2; margin:0 0 8px; }
      .bitefact-lead-card p { color:#9fb2cc; font-size:.82rem; line-height:1.55; margin:0 0 14px; }
      .bitefact-lead-card label { display:block; color:#c8d6ea; font-size:.72rem; margin:12px 0 6px; }
      .bitefact-lead-card input, .bitefact-lead-card textarea { width:100%; border:1px solid rgba(82,140,255,.25); background:#070b12; color:#f4f8ff; border-radius:12px; padding:12px; font:inherit; font-size:.9rem; outline:none; box-sizing:border-box; }
      .bitefact-lead-card textarea { min-height:80px; resize:vertical; }
      .bitefact-lead-actions { display:flex; gap:10px; margin-top:18px; }
      .bitefact-lead-actions button { flex:1; min-height:46px; border-radius:12px; padding:12px 14px; font:inherit; cursor:pointer; }
      .bitefact-lead-skip { background:transparent; border:1px solid rgba(82,140,255,.25); color:#9fb2cc; }
      .bitefact-lead-submit { background:linear-gradient(135deg,#3aa0ff 0%,#67d6ff 100%); border:1px solid #3aa0ff; color:#02111f; font-weight:700; }
      .bitefact-lead-submit:disabled { opacity:.6; cursor:default; }
      .bitefact-lead-status { min-height:18px; margin-top:10px; font-size:.74rem; line-height:1.4; color:#7abfa0; }
      .bitefact-upgrade-block { margin-top:16px; padding-top:14px; border-top:1px solid rgba(82,140,255,.22); }
      .bitefact-upgrade-block .upgrade-label { font-size:.7rem; color:#9fb2cc; text-align:center; margin-bottom:8px; }
      .bitefact-paypal-wrap { margin-top:10px; }
      .plan-cards { display:grid; gap:12px; margin-top:12px; }
      .plan-card { border:1px solid rgba(82,140,255,.25); border-radius:16px; padding:16px; background:rgba(255,255,255,.02); }
      .plan-card strong { display:block; color:#f4f8ff; font-size:1rem; }
      .plan-price { display:block; color:#67d6ff; font-weight:800; font-size:1.25rem; margin:6px 0; }
      .plan-card span.plan-desc { display:block; color:#9fb2cc; font-size:.78rem; line-height:1.5; }
      .trial-banner { margin-top:12px; padding:10px 14px; border-radius:12px; background:rgba(58,160,255,.12); border:1px solid rgba(103,214,255,.35); color:#67d6ff; font-size:.8rem; }
      .plan-note { color:#9fb2cc; font-size:.74rem; margin-top:10px; }
      @media (min-width:700px) { #bitefactLeadOverlay { align-items:center; } .plan-cards { grid-template-columns:1fr 1fr; } }
    `;
    document.head.appendChild(style);
  }

  function injectMarkup() {
    if (document.getElementById('bitefactLeadOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'bitefactLeadOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="bitefact-lead-card" role="dialog" aria-modal="true" aria-labelledby="bitefactLeadTitle">
        <h2 id="bitefactLeadTitle">Start your 3-day free trial</h2>
        <p id="bitefactLeadIntro">No credit card required. Share your name and email to unlock the AI plate scanner for 3 days.</p>
        <form id="bitefactLeadForm" novalidate>
          <label for="bitefactLeadName">Name</label>
          <input id="bitefactLeadName" name="name" type="text" autocomplete="name" maxlength="120" required>
          <label for="bitefactLeadEmail">Email</label>
          <input id="bitefactLeadEmail" name="email" type="email" autocomplete="email" maxlength="254" required>
          <label for="bitefactLeadComment">Anything you'd like us to know? <span style="opacity:.65">(optional)</span></label>
          <textarea id="bitefactLeadComment" name="comment" maxlength="2000" placeholder="What are you hoping BiteFact helps with?"></textarea>
          <div class="bitefact-lead-actions">
            <button type="button" class="bitefact-lead-skip" id="bitefactLeadSkip">Continue without sharing</button>
            <button type="submit" class="bitefact-lead-submit" id="bitefactLeadSubmit">Start trial</button>
          </div>
          <div class="bitefact-lead-status" id="bitefactLeadStatus" aria-live="polite"></div>
        </form>
        <div class="bitefact-upgrade-block" id="bitefactUpgradeBlock" style="display:none">
          <div class="upgrade-label">Your trial ended — keep the AI plate scanner with BiteFact AI</div>
          <div class="bitefact-paypal-wrap"><div id="bitefact-paypal-overlay-ai"></div></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('bitefactLeadSkip').addEventListener('click', closePrompt);
    overlay.addEventListener('click', event => { if (event.target === overlay) closePrompt(); });

    document.getElementById('bitefactLeadForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = form.elements.name.value.trim();
      const email = form.elements.email.value.trim();
      const comment = form.elements.comment.value.trim();
      const status = document.getElementById('bitefactLeadStatus');
      const submit = document.getElementById('bitefactLeadSubmit');

      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status.textContent = 'Please enter your name and a valid email.';
        status.style.color = '#ff9b9b';
        return;
      }

      submit.disabled = true;
      status.textContent = 'Starting your trial…';
      status.style.color = '#9fb2cc';
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name, email, comment, deviceId: getDeviceId() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`);
        localStorage.setItem(CAPTURED_KEY, 'true');
        localStorage.setItem(TRIAL_KEY, String(data.expiresAt || (Date.now() + TRIAL_MS)));
        status.textContent = 'Trial active! The AI plate scanner is unlocked for 3 days.';
        status.style.color = '#7abfa0';
        submit.style.display = 'none';
        document.getElementById('bitefactLeadSkip').textContent = 'Start tracking';
        if (typeof window.bitefactRefreshPlans === 'function') window.bitefactRefreshPlans();
      } catch (error) {
        console.error('BiteFact lead capture error:', error);
        status.textContent = 'Could not start your trial right now. Please try again.';
        status.style.color = '#ff9b9b';
        submit.disabled = false;
      }
    });
  }

  function closePrompt() {
    const overlay = document.getElementById('bitefactLeadOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function showPrompt(force) {
    const overlay = document.getElementById('bitefactLeadOverlay');
    if (!overlay || overlay.classList.contains('open')) return;
    if (!force && localStorage.getItem(INTRO_KEY)) return;
    localStorage.setItem(INTRO_KEY, '1');

    const captured = localStorage.getItem(CAPTURED_KEY) === 'true';
    const title = document.getElementById('bitefactLeadTitle');
    const intro = document.getElementById('bitefactLeadIntro');
    const form = document.getElementById('bitefactLeadForm');
    const upgradeBlock = document.getElementById('bitefactUpgradeBlock');

    if (captured) {
      // Returning user whose trial expired: lead already captured, show upgrade path.
      title.textContent = 'Your 3-day trial has ended';
      intro.textContent = 'Thanks for trying BiteFact. Upgrade to BiteFact AI to keep the photo plate scanner.';
      form.style.display = 'none';
      upgradeBlock.style.display = '';
      renderPayPalInto(document.getElementById('bitefact-paypal-overlay-ai'), PAYPAL_PLANS.ai, 'ai');
    } else {
      title.textContent = 'Start your 3-day free trial';
      intro.textContent = 'No credit card required. Share your name and email to unlock the AI plate scanner for 3 days.';
      form.style.display = '';
      upgradeBlock.style.display = 'none';
      const submit = document.getElementById('bitefactLeadSubmit');
      submit.style.display = '';
      submit.disabled = false;
      document.getElementById('bitefactLeadStatus').textContent = '';
      form.reset();
    }

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    if (!captured) setTimeout(() => document.getElementById('bitefactLeadName')?.focus(), 50);
  }

  window.bitefactShowLeadPrompt = function () { showPrompt(true); };

  /* =========================
     PAYPAL
     ========================= */

  function loadPayPal() {
    if (!paypalConfigured()) return Promise.reject(new Error('PayPal client ID not configured'));
    if (window.paypal) return Promise.resolve(window.paypal);
    if (window.__bitefactPayPalPromise) return window.__bitefactPayPalPromise;
    window.__bitefactPayPalPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&vault=true&intent=subscription`;
      script.async = true;
      script.onload = () => window.paypal ? resolve(window.paypal) : reject(new Error('PayPal SDK unavailable'));
      script.onerror = () => reject(new Error('PayPal SDK failed to load'));
      document.head.appendChild(script);
    });
    return window.__bitefactPayPalPromise;
  }

  function renderPayPalInto(container, planId, planKey) {
    if (!container || container.dataset.rendered) return;
    if (!paypalConfigured()) {
      container.innerHTML = '<p class="plan-note">Secure checkout is activating — check back soon.</p>';
      container.dataset.rendered = 'pending-config';
      return;
    }
    container.dataset.rendered = 'loading';
    loadPayPal().then(paypal => paypal.Buttons({
      style: { shape: 'rect', color: 'gold', layout: 'vertical', label: 'subscribe' },
      createSubscription: (data, actions) => actions.subscription.create({ plan_id: planId }),
      onApprove: data => {
        container.dataset.rendered = 'true';
        const msg = document.createElement('div');
        msg.style.cssText = 'margin-top:8px;color:#7abfa0;font-size:.78rem;text-align:center;';
        msg.textContent = `Subscription approved (ID: ${data.subscriptionID}). Welcome aboard!`;
        container.appendChild(msg);
        if (typeof window.bitefactOnSubscriptionApproved === 'function') {
          window.bitefactOnSubscriptionApproved(planKey, data.subscriptionID);
        }
      },
      onError: error => {
        console.error('BiteFact PayPal error:', error);
        container.dataset.rendered = 'error';
      }
    }).render(container)).catch(error => {
      console.error('BiteFact PayPal SDK error:', error);
      container.dataset.rendered = 'error';
    });
  }

  // Called after the plans section renders (and re-renders) so buttons attach.
  window.bitefactRenderPayPal = function () {
    const plus = document.getElementById('bitefact-paypal-plus');
    const ai = document.getElementById('bitefact-paypal-ai');
    if (plus) renderPayPalInto(plus, PAYPAL_PLANS.plus, 'plus');
    if (ai) renderPayPalInto(ai, PAYPAL_PLANS.ai, 'ai');
  };

  function init() {
    injectStyles();
    injectMarkup();
    // Safety net: render plan PayPal buttons if the plans section already painted.
    if (typeof window.bitefactRenderPayPal === 'function') {
      try { window.bitefactRenderPayPal(); } catch (e) { console.warn('BiteFact PayPal init render:', e); }
    }
    setTimeout(() => {
      if (!localStorage.getItem(CAPTURED_KEY) && !localStorage.getItem(INTRO_KEY)) showPrompt(false);
    }, 700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
