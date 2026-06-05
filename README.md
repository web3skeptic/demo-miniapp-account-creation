# circles-test-miniapp

A standalone test mini app that runs on **its own origin** (separate from the
Circles host) and exercises the miniapp host bridge:

- On load it asks the host for wallet state.
- **Logged in** → shows the connected address.
- **Not logged in** → shows a **"Create new account"** button that calls
  `requestCreateAccount()`, which makes the host open its account-creation popup.

It's plain static HTML/JS — **no build, no install** — and uses
[`@aboutcircles/miniapp-sdk`](https://www.npmjs.com/package/@aboutcircles/miniapp-sdk)
imported straight from a CDN:

```js
import { onWalletChange, requestCreateAccount, isMiniappMode }
  from 'https://esm.sh/@aboutcircles/miniapp-sdk@0.1.44';
```

The `index.html` script tag must be `type="module"` for the import to work. The SDK
wraps the host's postMessage protocol, so the app never touches `postMessage`
directly. (Bundled mini apps would `npm add @aboutcircles/miniapp-sdk` and import it
the same way — see `public/miniapp.js`.)

## Run
```bash
cd test-miniapp
npm run dev          # serves ./public on http://localhost:5190 (CORS enabled)
```

## Load it inside the host
Open the Circles host playground pointed at this app:
```
https://circles-dev.gnosis.io/playground?url=http://localhost:5190
```
(or wherever the host is running). The host embeds `http://localhost:5190` in its
iframe; the two communicate cross-origin via postMessage.

## Handling account creation

A miniapp never creates the account itself — it **asks the host to**, and the host
runs its own passkey + invite flow. The whole exchange is two messages:

```
miniapp → host:  { type: 'request_create_account', requestId }
host → miniapp:  { type: 'auth_success',  address, requestId }   // user signed up / was already in
                 { type: 'auth_rejected', reason,  requestId }   // user cancelled or it failed
```

`requestId` is any unique string you generate; the host echoes it back so you can
match the reply to the request (handy when several are in flight).

### What the host does behind the scenes
On `request_create_account` the host (`circles.gnosis.io`):
1. If a wallet is **already connected**, replies `auth_success` immediately.
2. Otherwise opens its account-creation popup, which:
   creates a passkey-controlled Safe → enables the Circles invitation module →
   invites the new Safe into Circles via the host's invite backend → confirms
   on-chain that it's now a registered Circles human.
3. Posts `auth_success` (with the new address) or `auth_rejected` when the popup closes.

So a freshly returned `address` is a **real, registered Circles account** — you can
read its profile / send transactions right away.

### With `@aboutcircles/miniapp-sdk` (what this demo does)
The SDK wraps the whole protocol — this is all the app needs:

```js
import { requestCreateAccount, onWalletChange, isMiniappMode } from '@aboutcircles/miniapp-sdk';

// trigger from a user gesture (a click) so the host's passkey prompt is allowed:
button.addEventListener('click', async () => {
  try {
    const { address } = await requestCreateAccount(); // resolves on success, throws on cancel
    console.log('account ready:', address);           // registered Circles account
  } catch (e) {
    console.log('cancelled / failed:', e.message);
  }
});
```

`onWalletChange(cb)` also fires with the new address once the account exists, so a
login-gated UI can simply react to that instead of awaiting the call directly. See
`public/miniapp.js` for the full version (it imports the SDK from a CDN — no build).

### Under the hood (raw postMessage, no SDK)
If you ever need to drop the SDK, the same exchange by hand:

```js
function createAccount() {
  return new Promise((resolve, reject) => {
    const requestId = 'req_' + Math.random().toString(36).slice(2);
    function onMessage(e) {
      const d = e.data;
      if (!d || d.requestId !== requestId) return;
      if (d.type === 'auth_success') { cleanup(); resolve(d.address); }
      if (d.type === 'auth_rejected') { cleanup(); reject(new Error(d.reason)); }
    }
    function cleanup() { window.removeEventListener('message', onMessage); }
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'request_create_account', requestId }, '*');
  });
}
```

### Notes / gotchas
- **Trigger from a click.** Account creation opens a WebAuthn passkey prompt in the
  host; browsers only allow that inside a user gesture.
- **Attribution is host-controlled.** The host tags each signup with the miniapp's
  iframe origin (derived from the iframe `src`, not anything the miniapp sends), so
  it can't be spoofed — you don't pass it.
- **Standalone mode.** Opened outside the host (`window.parent === window`), there's
  no one to talk to. Guard with `isMiniappMode()` (SDK) or an `inHost` check and show
  a "open inside the Circles host" message — see the bottom of `public/miniapp.js`.
