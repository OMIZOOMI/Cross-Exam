/** Owned synthetic responses only. No real DNS, public targets, or usable secrets. */
export function collectorFixtureResponse(path: string): {
  statusCode: number;
  headers: Record<string, string>;
  body: Uint8Array;
} | null {
  if (!path.startsWith("/collector/")) return null;
  let type = "text/html";
  let statusCode = 200;
  let body = "";
  const headers: Record<string, string> = {};
  if (path === "/collector/redirect") {
    statusCode = 302;
    headers.location = "/collector/rich";
  } else if (path === "/collector/loop") {
    statusCode = 302;
    headers.location = "/collector/loop";
  } else if (path === "/collector/failure") throw new Error("Owned fixture connection failure");
  else if (path === "/collector/slow") {
    body = `<!doctype html><title>Slow owned fixture</title><img src="/collector/hold"><script>
      setTimeout(() => fetch('/collector/late'), 3000);
    </script>`;
  } else if (path === "/collector/empty-performance") {
    body = "<!doctype html><title>Empty owned performance fixture</title>";
  } else if (path === "/collector/accessibility-good") {
    body = `<!doctype html><html lang="en"><head><title>Accessible owned fixture</title></head><body><main><h1>Owned heading</h1>
      <img src="/collector/image.svg" alt="Owned image"><button>Owned button</button>
      <label for="owned-input">Owned label</label><input id="owned-input" value="DISPOSABLE_NOT_A_SECRET">
      <a href="/collector/next">Owned link</a><p style="color:#000;background:#fff">Passing contrast</p>
      <div aria-hidden="true" hidden><button></button><img src="/collector/image.svg"></div>
      <div role="checkbox" aria-checked="false" aria-label="Owned checkbox" tabindex="0"></div>
      </main></body></html>`;
  } else if (path === "/collector/accessibility-bad") {
    body = `<!doctype html><html><head><title>Owned rule fixture</title></head><body><main><h1>Owned heading</h1><h3>Skipped heading</h3>
      <img src="/collector/image.svg"><img src="/collector/image.svg" alt="Owned image">
      <button id="DISPOSABLE_NOT_A_SECRET" class="DISPOSABLE_NOT_A_SECRET"></button><button>Owned named button</button>
      <input value="DISPOSABLE_NOT_A_SECRET"><input type="password" value="DISPOSABLE_NOT_A_SECRET">
      <label for="owned-labeled">Owned label</label><input id="owned-labeled">
      <a href="/collector/next"></a><a href="/collector/next">Owned named link</a>
      <p style="color:#eee;background:#fff">Owned failing contrast</p><p style="color:#000;background:#fff">Owned passing contrast</p>
      <p style="background-image:linear-gradient(#fff,#000);color:#777">Owned manual contrast review</p>
      <div role="checkbox" tabindex="0" aria-label="Owned checkbox"></div>
      <div role="checkbox" tabindex="0" aria-checked="false" aria-label="Owned valid checkbox"></div>
      <div role="not-a-role"></div><button aria-checked="banana">Owned invalid ARIA</button>
      <div id="owned-duplicate">Owned duplicate</div><div id="owned-duplicate">Owned duplicate</div><input aria-labelledby="owned-duplicate">
      <script>const dynamic=document.createElement('button');document.querySelector('main').append(dynamic);</script>
      </main></body></html>`;
  } else if (path === "/collector/accessibility-scope") {
    body = `<!doctype html><html lang="en"><title>Owned scope fixture</title><body><main><h1>Scope</h1>
      <div id="owned-open"></div><div id="owned-closed"></div><div hidden><button></button></div>
      <iframe title="Owned excluded frame" src="/collector/accessibility-bad"></iframe>
      <script>document.getElementById('owned-open').attachShadow({mode:'open'}).innerHTML='<button></button>';
      document.getElementById('owned-closed').attachShadow({mode:'closed'}).innerHTML='<button></button>';</script>
      </main></body></html>`;
  } else if (path === "/collector/accessibility-csp") {
    headers["content-security-policy"] = "default-src 'self'; script-src 'self'; object-src 'none'";
    body = `<!doctype html><html lang="en"><title>Owned CSP fixture</title><body><main><h1>CSP</h1>
      <script>document.body.insertAdjacentHTML('beforeend','<img src="/collector/image.svg">');</script>
      <script src="/collector/accessibility-csp.js"></script></main></body></html>`;
  } else if (path === "/collector/accessibility-csp.js") {
    type = "text/javascript";
    body = "document.querySelector('main').append(document.createElement('button'));";
  } else if (path === "/collector/rich") {
    headers["x-content-type-options"] = "nosniff";
    headers["referrer-policy"] = "no-referrer";
    headers["set-cookie"] = "owned_fixture_cookie=DISPOSABLE_NOT_A_SECRET; Path=/";
    headers.authorization = "Bearer DISPOSABLE_NOT_A_SECRET";
    headers["x-api-key"] = "DISPOSABLE_NOT_A_SECRET";
    body = `<!doctype html><html lang="en"><head><title>Initial fixture</title>
      <meta name="description" content="Rendered fixture description">
      <link rel="canonical" href="/collector/rich?token=DISPOSABLE_NOT_A_SECRET">
      <link rel="stylesheet" href="/collector/style.css"><script src="/collector/script.js"></script>
      </head><body><h1>Owned browser fixture</h1><form method="post" action="/collector/action?token=DISPOSABLE_NOT_A_SECRET">
      <input type="text" value="DISPOSABLE_NOT_A_SECRET"><input type="password" value="DISPOSABLE_NOT_A_SECRET">
      <textarea>DISPOSABLE_NOT_A_SECRET</textarea></form><a href="/collector/next?api_key=DISPOSABLE_NOT_A_SECRET">Next</a>
      <button>Owned labeled button</button><p style="background-image:linear-gradient(#fff,#000);color:#777">Owned manual contrast review</p><div id="owned-spacer" style="height:0"></div><p id="owned-paint" style="font-size:12px;width:700px">Small initial paint</p><img src="/collector/image.svg" width="32" height="32"><script>
        document.title = 'Rendered fixture';
        document.body.append(document.createElement('button'));
        document.body.insertAdjacentHTML('beforeend', '<h2>Dynamic heading</h2><a href="/collector/dynamic">Dynamic link</a>');
        const image = document.createElement('img'); image.src='/collector/dynamic.svg'; document.body.append(image);
        console.warn('Owned warning token=DISPOSABLE_NOT_A_SECRET'); console.error('Owned console error');
        setTimeout(() => { throw new TypeError('Owned runtime error password=DISPOSABLE_NOT_A_SECRET'); }, 0);
        document.cookie='owned_fixture_cookie=DISPOSABLE_NOT_A_SECRET';
        fetch('/collector/data?token=DISPOSABLE_NOT_A_SECRET', {headers:{Authorization:'Bearer DISPOSABLE_NOT_A_SECRET','X-API-Key':'DISPOSABLE_NOT_A_SECRET'},credentials:'include'}).catch(() => {});
        const xhr=new XMLHttpRequest(); xhr.open('GET','/collector/xhr'); xhr.send();
        fetch('/collector/failure').catch(() => {});
        fetch('/collector/action', {method:'POST',body:'DISPOSABLE_NOT_A_SECRET'}).catch(() => {});
        fetch('http://private.crossexam-fixture.com/').catch(() => {});
        fetch('http://mixed.crossexam-fixture.com/').catch(() => {});
        window.addEventListener('load', () => {
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
            document.getElementById('owned-spacer').style.height='120px';
            const paint=document.createElement('p');
            paint.style.cssText='font-size:48px;width:700px;margin:0'; paint.textContent='Owned large paint candidate with deterministic visible content'; document.getElementById('owned-paint').after(paint);
            setTimeout(() => { const end=performance.now()+90; while(performance.now()<end) {} }, 30);
          }, 80)));
        });
        const ws = new WebSocket('ws://entry.crossexam-fixture.com/collector/socket'); ws.onerror=()=>{};
      </script></body></html>`;
  } else if (path === "/collector/bounds") {
    body = `<!doctype html><title>Bounds fixture</title><body>
      ${"<h2>Heading</h2><a href='/collector/link'>Link</a><form><input type='password' value='DISPOSABLE_NOT_A_SECRET'></form>".repeat(60)}
      <script>
        for(let i=0;i<100;i++) console.warn('Warning '+i+' '+ 'x'.repeat(5000)+' token=DISPOSABLE_NOT_A_SECRET');
        for(let i=0;i<30;i++) setTimeout(()=>{throw new Error('Error '+i)},0);
        for(let i=0;i<34;i++) fetch('/collector/data?i='+i).catch(()=>{});
        for(let i=0;i<50;i++){ const s=document.createElement('script'); s.textContent=' '; document.body.append(s); }
        const a=document.createElement('a'); a.href='https://entry.crossexam-fixture.com/'+'z'.repeat(5000); document.body.append(a);
      </script></body>`;
  } else if (path === "/collector/dom-limit") {
    body = `<!doctype html><title>DOM limit fixture</title><body>${"<h2>Owned heading</h2>".repeat(10_010)}</body>`;
  } else if (path === "/collector/requests") {
    body = `<!doctype html><title>Requests fixture</title><script>for(let i=0;i<100;i++) fetch('/collector/data?i='+i).catch(()=>{});</script>`;
  } else if (path === "/collector/xhr") {
    type = "text/plain";
    body = "owned bounded bytes ".repeat(6500);
  } else if (path.endsWith(".css")) {
    type = "text/css";
    body = "body { color: black; }";
  } else if (path.endsWith(".js")) {
    type = "text/javascript";
    body = "window.ownedScriptLoaded=true";
  } else if (path.endsWith(".svg")) {
    type = "image/svg+xml";
    body = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
  } else {
    type = "text/plain";
    body = "owned fixture data";
  }
  return {
    statusCode,
    headers: { "content-type": type, "access-control-allow-origin": "*", ...headers },
    body: Buffer.from(body),
  };
}

/** Delays are owned fixture transport behavior, never internet timing or proxy policy. */
export function collectorFixtureDelay(path: string): number {
  if (path === "/collector/hold") return 1500;
  if (path === "/collector/rich") return 80;
  if (["/collector/style.css", "/collector/script.js", "/collector/image.svg"].includes(path))
    return 40;
  return 0;
}
