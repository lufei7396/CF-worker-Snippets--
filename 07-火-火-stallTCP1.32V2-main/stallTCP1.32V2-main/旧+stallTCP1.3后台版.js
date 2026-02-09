/**
 * StallTCP1.3 修复版 + 紫色UI增强版
 * 
 * 1. [核心] 保持 StallTCP 1.3 核心逻辑不动。
 * 2. [功能] 集成专属订阅生成、ProxyIP 检测、TG 群组跳转。
 * 3. [视觉] 全新紫色渐变 UI。
 * 4. [兼容] 支持 Cloudflare Workers & Snippets (无环境变量)。
 */

import { connect } from 'cloudflare:sockets';

// =============================================================================
// 🟣 用户配置区域 (在此处修改配置)
// =============================================================================
const UUID = "2523c510-9ff0-415b-9582-93949bf55555";  //请修改你的可用UUID

// 1. 后台登录密码 (留空 "" 则直接进入，不显示登录页)
const WEB_PASSWORD = ""; //请修改你的登录密码 留空则直接进入

// 2. 默认配置 (可修改)
const DEFAULT_SUB_URL = "https://sub.cmliussss.net"; // 默认订阅后端
const DEFAULT_PROXY_IP = "ProxyIP.US.CMLiussss.net"; // 默认 ProxyIP
const TG_GROUP_URL = "https://t.me/zyssadmin";       // Telegram 群组链接
const PROXY_CHECK_URL = "https://kaic.hidns.co/";    // ProxyIP 检测地址
// =============================================================================

const MAX_PENDING = 2097152, KEEPALIVE = 15000, STALL_TO = 8000, MAX_STALL = 12, MAX_RECONN = 24;
const buildUUID = (a, i) => Array.from(a.slice(i, i + 16)).map(n => n.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
const extractAddr = b => {
  const o1 = 18 + b[17] + 1, p = (b[o1] << 8) | b[o1 + 1], t = b[o1 + 2]; let o2 = o1 + 3, h, l;
  switch (t) {
    case 1: l = 4; h = b.slice(o2, o2 + l).join('.'); break;
    case 2: l = b[o2++]; h = new TextDecoder().decode(b.slice(o2, o2 + l)); break;
    case 3: l = 16; h = `[${Array.from({ length: 8 }, (_, i) => ((b[o2 + i * 2] << 8) | b[o2 + i * 2 + 1]).toString(16)).join(':')}]`; break;
    default: throw new Error('Invalid address type.');
  } return { host: h, port: p, payload: b.slice(o2 + l) };
};

const parseAddressPort = (addressSegment) => {
  let address, port;
  if (addressSegment.startsWith('[')) {
    const [ipv6Address, portStr = 443] = addressSegment.slice(1, -1).split(']:');
    address = `[${ipv6Address}]`; port = portStr;
  } else { 
    [address, port = 443] = addressSegment.split(':'); 
  } 
  return [address, port];
}

class Pool {
  constructor() { this.buf = new ArrayBuffer(16384); this.ptr = 0; this.pool = []; this.max = 8; this.large = false; }
  alloc = s => {
    if (s <= 4096 && s <= 16384 - this.ptr) { const v = new Uint8Array(this.buf, this.ptr, s); this.ptr += s; return v; } const r = this.pool.pop();
    if (r && r.byteLength >= s) return new Uint8Array(r.buffer, 0, s); return new Uint8Array(s);
  };
  free = b => {
    if (b.buffer === this.buf) { this.ptr = Math.max(0, this.ptr - b.length); return; }
    if (this.pool.length < this.max && b.byteLength >= 1024) this.pool.push(b);
  }; enableLarge = () => { this.large = true; }; reset = () => { this.ptr = 0; this.pool.length = 0; this.large = false; };
}

export default {
  async fetch(r) { 
    // --- [HTTP 请求拦截: 登录 & 面板] ---
    if (r.headers.get('Upgrade') !== 'websocket') {
        const url = new URL(r.url);
        
        // 密码验证逻辑
        if (WEB_PASSWORD && WEB_PASSWORD.trim().length > 0) {
            const cookie = r.headers.get('Cookie') || "";
            if (!cookie.includes(`auth=${WEB_PASSWORD}`)) {
                return new Response(loginPage(), {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }
        }
        
        // 验证通过，显示管理后台
        return new Response(dashPage(url.hostname, UUID), { 
          status: 200, 
          headers: { 'Content-Type': 'text/html; charset=utf-8' } 
        });
    }
    // ----------------------------------
    
    const u = new URL(r.url); 
    let proxyIPConfig = null;
    if (u.pathname.includes('/proxyip=')) {
      try {
        const proxyParam = u.pathname.split('/proxyip=')[1].split('/')[0];
        const [address, port] = parseAddressPort(proxyParam); 
        proxyIPConfig = { address, port: +port }; 
      } catch (e) {
        console.error('Failed to parse proxyip:', e.message);
      }
    }
    
    const { 0: c, 1: s } = new WebSocketPair(); s.accept(); 
    
    handle(s, proxyIPConfig); 
    return new Response(null, { status: 101, webSocket: c });}
};

const handle = (ws, proxyIPConfig) => {
  const pool = new Pool(); let sock, w, r, info, first = true, rxBytes = 0, stalls = 0, reconns = 0;
  let lastAct = Date.now(), conn = false, reading = false, writing = false; 
  const tmrs = {}, pend = [];
  let pendBytes = 0, score = 1.0, lastChk = Date.now(), lastRx = 0, succ = 0, fail = 0;
  let stats = { tot: 0, cnt: 0, big: 0, win: 0, ts: Date.now() }; 
  
  let mode = 'buffered', avgSz = 0, tputs = [];

  const updateMode = s => {
    stats.tot += s; stats.cnt++; if (s > 8192) stats.big++; avgSz = avgSz * 0.9 + s * 0.1; const now = Date.now();
    if (now - stats.ts > 1000) {
      const rate = stats.win; tputs.push(rate); if (tputs.length > 5) tputs.shift(); stats.win = s; stats.ts = now;
      const avg = tputs.reduce((a, b) => a + b, 0) / tputs.length;
      if (stats.cnt >= 20) {
        if (avg > 20971520 && avgSz > 16384) { 
          if (mode !== 'direct') { mode = 'direct'; } 
        }
        else if (avg < 10485760 || avgSz < 8192) { 
          if (mode !== 'buffered') { mode = 'buffered'; pool.enableLarge(); } 
        }
        else { 
          if (mode !== 'adaptive') mode = 'adaptive'; 
        }
      }} else { stats.win += s; }
  };
  
  const readLoop = async () => {
    if (reading) return; reading = true; let batch = [], bSz = 0, bTmr = null;
    const flush = () => {
      if (!bSz) return; const m = new Uint8Array(bSz); let p = 0;
      for (const c of batch) { m.set(c, p); p += c.length; }
      if (ws.readyState === 1) ws.send(m);
      batch = []; bSz = 0; if (bTmr) { clearTimeout(bTmr); bTmr = null; }
    };
    try {
      while (true) {
        if (pendBytes > MAX_PENDING) { await new Promise(res => setTimeout(res, 100)); continue; }
        const { done, value: v } = await r.read();
        if (v?.length) {
          rxBytes += v.length; lastAct = Date.now(); stalls = 0; updateMode(v.length); const now = Date.now();
          if (now - lastChk > 5000) {
            const el = now - lastChk, by = rxBytes - lastRx, tp = by / el;
            if (tp > 500) score = Math.min(1.0, score + 0.05);
            else if (tp < 50) score = Math.max(0.1, score - 0.05);
            lastChk = now; lastRx = rxBytes;
          }
          if (mode === 'buffered') {
            if (v.length < 32768) {
              batch.push(v); bSz += v.length;
              if (bSz >= 131072) flush();
              else if (!bTmr) bTmr = setTimeout(flush, avgSz > 16384 ? 5 : 20);
            } else { flush(); if (ws.readyState === 1) ws.send(v); }
          } else if (mode === 'adaptive') {
            if (v.length < 4096) {
              batch.push(v); bSz += v.length;
              if (bSz >= 32768) flush();
              else if (!bTmr) bTmr = setTimeout(flush, 15);
            } else { flush(); if (ws.readyState === 1) ws.send(v); }
          } else { 
            flush(); if (ws.readyState === 1) ws.send(v); 
          }
        } if (done) { flush(); reading = false; reconn(); break; }
      }} catch (e) { flush(); if (bTmr) clearTimeout(bTmr); reading = false; fail++; reconn(); }
  };

  const writeLoop = async () => {
    if (writing) return; 
    writing = true;
    try {
      while(writing) { 
        if (!w) { 
          await new Promise(res => setTimeout(res, 100));
          continue;
        }
        if (pend.length === 0) { 
          await new Promise(res => setTimeout(res, 20));
          continue;
        }
        
        const b = pend.shift();
        await w.write(b); 
        pendBytes -= b.length; 
        pool.free(b);
      }
    } catch (e) {
      writing = false;
    }
  };
  
  const attemptConnection = async () => {
    const connectionMethods = ['direct'];
    if (proxyIPConfig) {
      connectionMethods.push('proxy');
    }
    let lastError;
    for (const method of connectionMethods) {
      try {
        const connectOpts = (method === 'direct')
          ? { hostname: info.host, port: info.port }
          : { hostname: proxyIPConfig.address, port: proxyIPConfig.port };
        
        const sock = connect(connectOpts);
        await sock.opened;
        return sock;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('All connection methods failed.');
  };

  const establish = async () => { 
    try {
      sock = await attemptConnection(); 
      w = sock.writable.getWriter(); r = sock.readable.getReader(); 
      conn = false; reconns = 0; score = Math.min(1.0, score + 0.15); succ++; lastAct = Date.now(); 
      readLoop();
      writeLoop(); 
    } catch (e) { 
      conn = false; fail++; score = Math.max(0.1, score - 0.2); 
      reconn(); 
    }
  };

  const reconn = async () => {
    if (!info || ws.readyState !== 1) { cleanup(); ws.close(1011, 'Invalid.'); return; }
    if (reconns >= MAX_RECONN) { cleanup(); ws.close(1011, 'Max reconnect.'); return; }
    if (score < 0.3 && reconns > 5 && Math.random() > 0.6) { cleanup(); ws.close(1011, 'Poor network.'); return; }
    if (conn) return; reconns++; let d = Math.min(50 * Math.pow(1.5, reconns - 1), 3000);
    d *= (1.5 - score * 0.5); d += (Math.random() - 0.5) * d * 0.2; d = Math.max(50, Math.floor(d));
    try {
      cleanSock();
      if (pendBytes > MAX_PENDING * 2) {
        while (pendBytes > MAX_PENDING && pend.length > 5) { const drop = pend.shift(); pendBytes -= drop.length; pool.free(drop); }
      }
      await new Promise(res => setTimeout(res, d)); conn = true;
      
      sock = await attemptConnection(); 

      w = sock.writable.getWriter(); r = sock.readable.getReader();
      conn = false; reconns = 0; score = Math.min(1.0, score + 0.15); succ++; stalls = 0; lastAct = Date.now(); 
      readLoop();
      writeLoop(); 
    } catch (e) { 
      conn = false; fail++; score = Math.max(0.1, score - 0.2);
      if (reconns < MAX_RECONN && ws.readyState === 1) setTimeout(reconn, 500);
      else { cleanup(); ws.close(1011, 'Exhausted.'); }
    }
  };

  const startTmrs = () => {
    tmrs.ka = setInterval(async () => {
      if (!conn && w && Date.now() - lastAct > KEEPALIVE) { try { await w.write(new Uint8Array(0)); lastAct = Date.now(); } catch (e) { reconn(); }}
    }, KEEPALIVE / 3);
    tmrs.hc = setInterval(() => {
      if (!conn && stats.tot > 0 && Date.now() - lastAct > STALL_TO) { stalls++;
        if (stalls >= MAX_STALL) {
          if (reconns < MAX_RECONN) { stalls = 0; reconn(); }
          else { cleanup(); ws.close(1011, 'Stall.'); }
        }}}, STALL_TO / 2);
  };
  
  const cleanSock = () => { 
    reading = false; 
    writing = false; 
    try { w?.releaseLock(); r?.releaseLock(); sock?.close(); } catch {} 
  };
  
  const cleanup = () => {
    Object.values(tmrs).forEach(clearInterval); cleanSock();
    while (pend.length) pool.free(pend.shift());
    pendBytes = 0; stats = { tot: 0, cnt: 0, big: 0, win: 0, ts: Date.now() };
    mode = 'buffered'; 
    avgSz = 0; tputs = []; pool.reset();
  };
  
  ws.addEventListener('message', async e => {
    try {
      if (first) {
        first = false; const b = new Uint8Array(e.data);
        if (buildUUID(b, 1).toLowerCase() !== UUID.toLowerCase()) throw new Error('Auth failed.');
        ws.send(new Uint8Array([0, 0])); 
        const { host, port, payload } = extractAddr(b); 
        info = { host, port }; 
        conn = true; 
        if (payload.length) { const buf = pool.alloc(payload.length); buf.set(payload); pend.push(buf); pendBytes += buf.length; } 
        startTmrs(); 
        establish(); 
      } else { 
        lastAct = Date.now();
        if (pendBytes > MAX_PENDING * 2) return; 
        const buf = pool.alloc(e.data.byteLength); 
        buf.set(new Uint8Array(e.data)); 
        pend.push(buf); 
        pendBytes += buf.length;
      }
    } catch (err) { cleanup(); ws.close(1006, 'Error.'); }
  }); 
  ws.addEventListener('close', cleanup); ws.addEventListener('error', cleanup);
};

// =============================================================================
// 🟣 登录页面 (紫色渐变风格)
// =============================================================================
function loginPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Worker Login</title>
<style>
  body { 
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; 
  }
  .glass-box { 
    background: rgba(255, 255, 255, 0.1); 
    backdrop-filter: blur(10px); 
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 40px; border-radius: 16px; 
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37); 
    text-align: center; width: 320px; 
  }
  h2 { margin-top: 0; margin-bottom: 20px; font-weight: 600; letter-spacing: 1px; }
  input { 
    width: 100%; padding: 14px; margin-bottom: 20px; border-radius: 8px; 
    border: 1px solid rgba(255, 255, 255, 0.3); 
    background: rgba(0, 0, 0, 0.2); 
    color: white; box-sizing: border-box; text-align: center; font-size: 1rem; outline: none; transition: 0.3s;
  }
  input:focus { background: rgba(0, 0, 0, 0.4); border-color: #a29bfe; }
  input::placeholder { color: rgba(255, 255, 255, 0.6); }
  button { 
    width: 100%; padding: 12px; border-radius: 8px; border: none; 
    background: linear-gradient(90deg, #a29bfe, #6c5ce7); 
    color: white; font-weight: bold; cursor: pointer; font-size: 1rem; 
    box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: 0.2s; 
  }
  button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
</style>
</head>
<body>
  <div class="glass-box">
    <h2>🔒 访问受限</h2>
    <input type="password" id="pwd" placeholder="请输入访问密码" autofocus onkeypress="if(event.keyCode===13) verify()">
    <button onclick="verify()">解锁后台</button>
  </div>
  <script>
    function verify() {
      const p = document.getElementById('pwd').value;
      const d = new Date(); d.setTime(d.getTime() + (7*24*60*60*1000)); // 7天免登
      document.cookie = "auth=" + p + ";expires=" + d.toUTCString() + ";path=/";
      location.reload();
    }
  </script>
</body>
</html>`;
}

// =============================================================================
// 🟣 管理面板 (紫色渐变 + 功能增强)
// =============================================================================
function dashPage(host, uuid) {
  const vlessLink = `vless://${uuid}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=%2F#Worker-Node`;

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Worker 控制台</title>
<style>
  :root { --glass: rgba(255, 255, 255, 0.1); --border: rgba(255, 255, 255, 0.2); }
  body { 
    background: linear-gradient(135deg, #2b1055 0%, #7597de 100%);
    color: white; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px; 
    min-height: 100vh; display:flex; justify-content:center; box-sizing: border-box;
  }
  .container { max-width: 720px; width: 100%; }
  
  .card { 
    background: var(--glass); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border); border-radius: 16px; padding: 25px; margin-bottom: 20px; 
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
  }
  
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border); }
  h1 { margin: 0; font-size: 1.5rem; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
  
  .btn-group { display: flex; gap: 10px; }
  .btn-small { font-size: 0.85rem; cursor: pointer; background: rgba(0,0,0,0.3); padding: 5px 12px; border-radius: 6px; text-decoration: none; color: white; transition:0.2s; border: 1px solid transparent;}
  .btn-small:hover { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.5); }
  
  .field { margin-bottom: 18px; }
  .label { display: block; font-size: 0.9rem; color: #dfe6e9; margin-bottom: 8px; font-weight: 500; }
  .input-group { display: flex; gap: 10px; }
  
  input { 
    width: 100%; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border); 
    color: white; padding: 12px; border-radius: 8px; font-family: monospace; 
    outline: none; transition: 0.2s; box-sizing: border-box;
  }
  input:focus { background: rgba(0, 0, 0, 0.4); border-color: #a29bfe; }
  
  button.main-btn { 
    background: linear-gradient(90deg, #6c5ce7, #a29bfe); color: white; border: none; 
    padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%; 
    margin-top: 5px; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.2); font-size: 1rem;
  }
  button.main-btn:hover { transform: translateY(-2px); opacity: 0.95; }
  
  button.sec-btn {
    background: rgba(255, 255, 255, 0.15); color: white; border: 1px solid var(--border);
    padding: 12px; border-radius: 8px; cursor: pointer; white-space: nowrap; transition:0.2s;
  }
  button.sec-btn:hover { background: rgba(255, 255, 255, 0.3); }

  .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #00b894; color: white; padding: 10px 24px; border-radius: 30px; opacity: 0; transition: 0.3s; pointer-events: none; box-shadow: 0 5px 15px rgba(0,0,0,0.3); font-weight: bold;}
  .toast.show { opacity: 1; bottom: 50px; }
  .desc { font-size: 0.8rem; color: #b2bec3; margin-top: 6px; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <h1>⚡ Worker 订阅管理</h1>
      <div class="btn-group">
        <a href="${TG_GROUP_URL}" target="_blank" class="btn-small">✈️ 加入群组</a>
        <span class="btn-small" onclick="logout()">退出登录</span>
      </div>
    </div>
    
    <div class="field">
      <span class="label">1. 订阅后端地址 (Sub Backend)</span>
      <input type="text" id="subBaseUrl" value="${DEFAULT_SUB_URL}" placeholder="https://..." oninput="updateLink()">
      <div class="desc">支持自定义后端，默认使用 cmliussss.net</div>
    </div>

    <div class="field">
      <span class="label">2. 优选IP / 中转域名 (ProxyIP)</span>
      <div class="input-group">
        <input type="text" id="proxyIp" value="${DEFAULT_PROXY_IP}" placeholder="例如: sjc.o00o.ooo" oninput="updateLink()">
        <button class="sec-btn" onclick="checkProxy()">🔍 检测</button>
      </div>
      <div class="desc">自动编码为 path=%2Fproxyip%3D... 格式</div>
    </div>

    <div class="field">
      <span class="label">3. 最终订阅链接</span>
      <input type="text" id="resultUrl" readonly onclick="this.select()">
    </div>

    <div class="input-group">
      <button class="main-btn" onclick="copyUrl()">📄 复制订阅链接</button>
      <button class="sec-btn" onclick="window.open(document.getElementById('resultUrl').value)" style="width: 120px;">🚀 测试</button>
    </div>
  </div>
  
  <div class="card">
    <span class="label">原始 VLESS 节点链接</span>
    <input type="text" value="${vlessLink}" readonly onclick="this.select()">
  </div>
</div>

<div id="toast" class="toast">已复制到剪贴板!</div>

<script>
function updateLink() {
  let baseUrl = document.getElementById('subBaseUrl').value.trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl; // 容错
  
  const proxyIp = document.getElementById('proxyIp').value.trim();
  const host = window.location.hostname;
  const uuid = "${uuid}";

  // 核心逻辑：path 编码拼接 (保留 path=%2Fproxyip%3D...)
  let rawPath = "/";
  if (proxyIp) {
    rawPath = "/proxyip=" + proxyIp;
  }
  const encodedPath = encodeURIComponent(rawPath);

  const finalUrl = \`\${baseUrl}/sub?uuid=\${uuid}&encryption=none&security=tls&sni=\${host}&alpn=h3&fp=random&allowInsecure=1&type=ws&host=\${host}&path=\${encodedPath}\`;

  document.getElementById('resultUrl').value = finalUrl;
}

function copyUrl() {
  const url = document.getElementById('resultUrl').value;
  navigator.clipboard.writeText(url).then(() => {
    const t = document.getElementById('toast');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  });
}

function checkProxy() {
  const ip = document.getElementById('proxyIp').value.trim();
  if(ip) {
    // 复制IP到剪贴板并跳转
    navigator.clipboard.writeText(ip).then(() => {
       alert("ProxyIP 已复制！即将跳转检测页面，请在页面中粘贴测试。");
       window.open("${PROXY_CHECK_URL}", "_blank");
    });
  } else {
    window.open("${PROXY_CHECK_URL}", "_blank");
  }
}

function logout() {
  document.cookie = "auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  location.reload();
}

window.onload = updateLink;
</script>
</body>
</html>
`;
}