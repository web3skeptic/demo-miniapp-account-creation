/**
 * Standalone test mini app — talks to the Circles miniapp host over postMessage.
 *
 * This runs on its OWN origin (e.g. http://localhost:5190) and is embedded by the
 * host in an iframe. It speaks the same protocol as @aboutcircles/miniapp-sdk, so
 * it needs no build step and no import:
 *
 *   miniapp → host:  { type: 'request_address' }
 *                    { type: 'request_create_account', requestId }
 *   host → miniapp:  { type: 'wallet_connected', address }
 *                    { type: 'wallet_disconnected' }
 *                    { type: 'auth_success', address, requestId }
 *                    { type: 'auth_rejected', reason, requestId }
 */
(function () {
	const stateEl = document.getElementById('state');
	const ctaEl = document.getElementById('cta');
	const logEl = document.getElementById('log');
	const profileEl = document.getElementById('profile');

	function log(msg) {
		const t = new Date().toISOString().slice(11, 19);
		logEl.textContent += `[${t}] ${msg}\n`;
		logEl.scrollTop = logEl.scrollHeight;
	}

	const inHost = window.parent !== window;
	let reqCounter = 0;
	const pending = {};

	function call(type, extra) {
		return new Promise((resolve, reject) => {
			if (!inHost) {
				reject(new Error('Not inside the miniapps host'));
				return;
			}
			const requestId = 'treq_' + ++reqCounter;
			pending[requestId] = { resolve, reject };
			window.parent.postMessage({ type, requestId, ...(extra || {}) }, '*');
		});
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

	window.addEventListener('message', (event) => {
		const d = event.data;
		if (!d || !d.type) return;

		switch (d.type) {
			case 'wallet_connected':
				log('wallet_connected: ' + d.address);
				showLoggedIn(d.address);
				break;
			case 'wallet_disconnected':
				log('wallet_disconnected');
				showLoggedOut();
				break;
			case 'auth_success':
				log('auth_success: ' + d.address);
				pending[d.requestId] && pending[d.requestId].resolve({ authenticated: true, address: d.address });
				delete pending[d.requestId];
				showLoggedIn(d.address);
				break;
			case 'auth_rejected':
				log('auth_rejected: ' + (d.reason || d.error || 'cancelled'));
				pending[d.requestId] && pending[d.requestId].reject(new Error(d.reason || d.error || 'cancelled'));
				delete pending[d.requestId];
				break;
		}
	});

	ctaEl.addEventListener('click', async () => {
		ctaEl.disabled = true;
		ctaEl.textContent = 'Opening…';
		log('→ request_create_account');
		try {
			const res = await call('request_create_account');
			log('account ready: ' + res.address);
		} catch (e) {
			log('cancelled / failed: ' + e.message);
			showLoggedOut();
		}
	});

	if (inHost) {
		log('→ request_address');
		window.parent.postMessage({ type: 'request_address' }, '*');
		// Fallback if the host never answers.
		setTimeout(() => {
			if (stateEl.classList.contains('loading')) showLoggedOut();
		}, 1500);
	} else {
		stateEl.className = 'state out';
		stateEl.textContent = 'Open this inside the Circles miniapps host.';
		log('not in host — no parent to talk to');
	}
})();
