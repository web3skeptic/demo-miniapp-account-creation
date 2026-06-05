/**
 * Standalone test mini app — uses @aboutcircles/miniapp-sdk to talk to the
 * Circles miniapp host.
 *
 * This runs on its OWN origin (e.g. http://localhost:5190) and is embedded by the
 * host in an iframe. Rather than hand-rolling the postMessage protocol, it imports
 * the published SDK straight from a CDN (no build step, no install):
 *
 *   onWalletChange(cb)        → fires with the current address (or null), then on
 *                               every change. The SDK asks the host for state on load.
 *   requestCreateAccount()    → asks the host to open its account-creation popup;
 *                               resolves { authenticated, address } or rejects.
 *   isMiniappMode()           → true when running inside the host iframe.
 */
import {
	onWalletChange,
	requestCreateAccount,
	isMiniappMode,
} from 'https://esm.sh/@aboutcircles/miniapp-sdk@0.1.44';

const stateEl = document.getElementById('state');
const ctaEl = document.getElementById('cta');
const logEl = document.getElementById('log');
const profileEl = document.getElementById('profile');

function log(msg) {
	const t = new Date().toISOString().slice(11, 19);
	logEl.textContent += `[${t}] ${msg}\n`;
	logEl.scrollTop = logEl.scrollHeight;
}

const CIRCLES_RPC = 'https://rpc.aboutcircles.com/';

function showLoggedIn(address) {
	stateEl.className = 'state in';
	// Show the word "Profile" instead of the raw address; the username (if any)
	// is filled in once fetchProfile resolves.
	stateEl.innerHTML = '✅ Logged in<br><span class="addr">Profile</span>';
	ctaEl.style.display = 'none';
	fetchProfile(address);
}

// Read the account's Circles profile (name + photo) straight from the RPC.
async function fetchProfile(address) {
	profileEl.style.display = 'block';
	profileEl.innerHTML = '<span class="muted">Loading profile…</span>';
	try {
		const res = await fetch(CIRCLES_RPC, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'circles_getProfileByAddress',
				params: [address]
			})
		});
		const json = await res.json();
		const p = json.result;
		log('profile: ' + JSON.stringify(p || null));
		if (!p) {
			profileEl.innerHTML = '<span class="muted">No profile yet.</span>';
			return;
		}
		const name = p.name || p.registeredName || '';
		// If a username was fetched, surface it next to "Profile".
		if (name) {
			stateEl.innerHTML = '✅ Logged in<br><span class="addr">Profile · ' + name + '</span>';
		}
		const img = p.previewImageUrl || p.picture || p.imageUrl;
		profileEl.innerHTML =
			(img ? '<img class="pfp" src="' + img + '" alt="" />' : '<div class="pfp pfp-empty">🙂</div>') +
			'<div class="pname">' + (name || '(no name)') + '</div>';
	} catch (e) {
		profileEl.innerHTML = '<span class="muted">Profile fetch failed: ' + e.message + '</span>';
	}
}

function showLoggedOut() {
	stateEl.className = 'state out';
	stateEl.textContent = '🔒 Not logged in';
	ctaEl.textContent = 'Create new account';
	ctaEl.disabled = false;
	ctaEl.style.display = 'block';
	profileEl.style.display = 'none';
}

// React to wallet state from the host. onWalletChange fires immediately with the
// current state (null until the host answers), then again on every change — e.g.
// once account creation completes the host emits the new address here too.
onWalletChange((address) => {
	if (address) {
		log('wallet connected: ' + address);
		showLoggedIn(address);
	} else {
		log('wallet disconnected');
		showLoggedOut();
	}
});

ctaEl.addEventListener('click', async () => {
	ctaEl.disabled = true;
	ctaEl.textContent = 'Opening…';
	log('→ requestCreateAccount');
	try {
		// Must be called from this click — the host opens a passkey prompt, which
		// browsers only allow inside a user gesture.
		const { address } = await requestCreateAccount();
		log('account ready: ' + address);
		// onWalletChange also fires on success, so the UI is already updating —
		// but show it immediately too in case a listener races.
		showLoggedIn(address);
	} catch (e) {
		log('cancelled / failed: ' + e.message);
		showLoggedOut();
	}
});

if (isMiniappMode()) {
	log('in host — waiting for wallet state…');
	// Fallback if the host never answers request_address (sent by the SDK on load).
	setTimeout(() => {
		if (stateEl.classList.contains('loading')) showLoggedOut();
	}, 1500);
} else {
	stateEl.className = 'state out';
	stateEl.textContent = 'Open this inside the Circles miniapps host.';
	log('not in host — no parent to talk to');
}
