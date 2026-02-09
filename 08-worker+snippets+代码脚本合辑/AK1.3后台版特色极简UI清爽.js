

/**
 * StallTCP1.3 修复版 + 清爽UI重制版
 * 
 * 1. [逻辑] 核心逻辑 100% 原汁原味，未做任何修改。
 * 2. [UI]  全新 "Modern Clean" 风格，更清爽、更专业。
 */

import { connect } from 'cloudflare:sockets';

// =============================================================================
// 🟣 用户配置区域 (在此处修改配置)
// =============================================================================
const UUID = "2523c510-9ff0-415b-9582-93949bf55555"; //  【请修改你的可用UUID】

// 1. 后台登录密码 (留空 "" 则直接进入)
const WEB_PASSWORD = "";  //  【请修改你的自定义密码】

// 2. 默认基础配置
const DEFAULT_SUB_DOMAIN = "sub.cmliussss.net";      // 默认订阅数据源地址 (UI显示用)  【 可进行自定义修改】
const DEFAULT_PROXY_IP = "ProxyIP.US.CMLiussss.net"; // 默认 ProxyIP  【可进行自定义修改】
const TG_GROUP_URL = "https://t.me/zyssadmin";       // Telegram 群组链接
const PROXY_CHECK_URL = "https://kaic.hidns.co/";    // ProxyIP 检测地址

// 3. 订阅转换默认配置
const DEFAULT_CONVERTER = "https://api.v1.mk";       // 默认转换后端  【可支持自定义修改】
// 默认配置文件 (ACL4SSR)
const DEFAULT_CONFIG = "https://raw.githubusercontent.com/cmlius/ACL4SSR/main/Clash/config/ACL4SSR_Online_Full_MultiMode.ini";  // 支持自定义修改配置文件链接

// 4. 自定义优选IP列表 (这是订阅的源头)
// 格式: IP:端口#别名 (如果不填端口默认443)
const DEFAULT_CUSTOM_IPS = `173.245.58.127#CF官方优选
8.39.125.176#CF官方优选
172.64.228.106#CF官方优选
198.41.223.138#CF官方优选
104.19.61.220#CF官方优选
104.18.44.31#CF官方优选
104.19.37.177#CF官方优选
104.19.37.36#CF官方优选
162.159.38.199#CF官方优选
172.67.69.193#CF官方优选
108.162.198.41#CF官方优选
8.35.211.134#CF官方优选
173.245.58.201#CF官方优选
172.67.71.105#CF官方优选
162.159.37.12#CF官方优选
104.18.33.144#CF官方优选`;
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
    try {
        const url = new URL(r.url);

        if (url.pathname === '/sub') {
            const requestUUID = url.searchParams.get('uuid');
            if (requestUUID !== UUID) return new Response('Invalid UUID', { status: 403 });

            const host = url.hostname;
            let pathParam = url.searchParams.get('path') || "/";
            const encodedPath = encodeURIComponent(pathParam);
            
            let nodeLinks = [];
            const lines = DEFAULT_CUSTOM_IPS.split('\n');
            
            lines.forEach(line => {
                if(!line.trim()) return;
                const parts = line.split('#');
                let addr = parts[0].trim();
                let note = parts[1] ? parts[1].trim() : 'Worker-Node';
                
                let ip = addr;
                let port = "443";
                if (addr.includes(':') && !addr.includes('[')) {
                    const p = addr.split(':');
                    ip = p[0];
                    port = p[1];
                }

               
                const link = `${atob('dmxlc3M6Ly8=')}${UUID}@${ip}:${port}?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=${encodedPath}#${encodeURIComponent(note)}`;
                    nodeLinks.push(link);
            });

            return new Response(btoa(unescape(encodeURIComponent(nodeLinks.join('\n')))), {
                status: 200,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }

        if (r.headers.get('Upgrade') !== 'websocket') {
            if (typeof WEB_PASSWORD !== 'undefined' && WEB_PASSWORD && WEB_PASSWORD.trim().length > 0) {
                const cookie = r.headers.get('Cookie') || "";
                if (!cookie.includes(`auth=${WEB_PASSWORD}`)) {
                    return new Response(loginPage(), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
                }
            }
            return new Response(dashPage(url.hostname, UUID), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        
        let proxyIPConfig = null;
        if (url.pathname.includes('/proxyip=')) {
          try {
            const proxyParam = url.pathname.split('/proxyip=')[1].split('/')[0];
            const [address, port] = parseAddressPort(proxyParam); 
            proxyIPConfig = { address, port: +port }; 
          } catch (e) {
            console.error('Failed to parse proxyip:', e.message);
          }
        }
        const { 0: c, 1: s } = new WebSocketPair(); s.accept(); 
        handle(s, proxyIPConfig); 
        return new Response(null, { status: 101, webSocket: c });

    } catch (err) {
        return new Response(`Worker Error: ${err.message}`, { status: 500 });
    }
  }
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
        if (avg > 20971520 && avgSz > 16384) { if (mode !== 'direct') { mode = 'direct'; } }
        else if (avg < 10485760 || avgSz < 8192) { if (mode !== 'buffered') { mode = 'buffered'; pool.enableLarge(); } }
        else { if (mode !== 'adaptive') mode = 'adaptive'; }
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
          } else { flush(); if (ws.readyState === 1) ws.send(v); }
        } if (done) { flush(); reading = false; reconn(); break; }
      }} catch (e) { flush(); if (bTmr) clearTimeout(bTmr); reading = false; fail++; reconn(); }
  };

  const writeLoop = async () => {
    if (writing) return; writing = true;
    try {
      while(writing) { 
        if (!w) { await new Promise(res => setTimeout(res, 100)); continue; }
        if (pend.length === 0) { await new Promise(res => setTimeout(res, 20)); continue; }
        const b = pend.shift(); await w.write(b); pendBytes -= b.length; pool.free(b);
      }
    } catch (e) { writing = false; }
  };
  
  const attemptConnection = async () => {
    const connectionMethods = ['direct'];
    if (proxyIPConfig) { connectionMethods.push('proxy'); }
    let lastError;
    for (const method of connectionMethods) {
      try {
        const connectOpts = (method === 'direct')
          ? { hostname: info.host, port: info.port }
          : { hostname: proxyIPConfig.address, port: proxyIPConfig.port };
        const sock = connect(connectOpts); await sock.opened; return sock;
      } catch (e) { lastError = e; }
    }
    throw lastError || new Error('All connection methods failed.');
  };

  const establish = async () => { 
    try {
      sock = await attemptConnection(); w = sock.writable.getWriter(); r = sock.readable.getReader(); 
      conn = false; reconns = 0; score = Math.min(1.0, score + 0.15); succ++; lastAct = Date.now(); 
      readLoop(); writeLoop(); 
    } catch (e) { conn = false; fail++; score = Math.max(0.1, score - 0.2); reconn(); }
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
      readLoop(); writeLoop(); 
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
  
  const cleanSock = () => { reading = false; writing = false; try { w?.releaseLock(); r?.releaseLock(); sock?.close(); } catch {} };
  const cleanup = () => {
    Object.values(tmrs).forEach(clearInterval); cleanSock();
    while (pend.length) pool.free(pend.shift());
    pendBytes = 0; stats = { tot: 0, cnt: 0, big: 0, win: 0, ts: Date.now() };
    mode = 'buffered'; avgSz = 0; tputs = []; pool.reset();
  };
  
  ws.addEventListener('message', async e => {
    try {
      if (first) {
        first = false; const b = new Uint8Array(e.data);
        if (buildUUID(b, 1).toLowerCase() !== UUID.toLowerCase()) throw new Error('Auth failed.');
        ws.send(new Uint8Array([0, 0])); 
        const { host, port, payload } = extractAddr(b); 
        info = { host, port }; conn = true; 
        if (payload.length) { const buf = pool.alloc(payload.length); buf.set(payload); pend.push(buf); pendBytes += buf.length; } 
        startTmrs(); establish(); 
      } else { 
        lastAct = Date.now(); if (pendBytes > MAX_PENDING * 2) return; 
        const buf = pool.alloc(e.data.byteLength); buf.set(new Uint8Array(e.data)); pend.push(buf); pendBytes += buf.length;
      }
    } catch (err) { cleanup(); ws.close(1006, 'Error.'); }
  }); 
  ws.addEventListener('close', cleanup); ws.addEventListener('error', cleanup);
};

// =============================================================================
// 🟣 登录页面 (清爽版)
// =============================================================================
function loginPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>后台登录</title>
<style>
  body {
    background-color: #0f172a; /* Slate 900 */
    background-image: radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%);
    color: #fff;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
  }
  .card {
    background: rgba(30, 41, 59, 0.7);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 48px;
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    text-align: center;
    width: 340px;
  }
  h2 { margin-top: 0; margin-bottom: 24px; font-weight: 600; font-size: 1.5rem; color: #f8fafc; }
  input {
    width: 100%;
    padding: 14px;
    margin-bottom: 20px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(15, 23, 42, 0.6);
    color: #fff;
    box-sizing: border-box;
    text-align: center;
    font-size: 1rem;
    outline: none;
    transition: all 0.2s;
  }
  input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
  button {
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    border: none;
    background: #3b82f6;
    color: white;
    font-weight: 600;
    cursor: pointer;
    font-size: 1rem;
    transition: background 0.2s;
  }
  button:hover { background: #2563eb; }
</style>
</head>
<body>
  <div class="card">
    <h2>🔐 访问受限</h2>
    <input type="password" id="pwd" placeholder="输入访问密码" autofocus onkeypress="if(event.keyCode===13) verify()">
    <button onclick="verify()">进入后台</button>
  </div>
  <script>
    function verify() {
      const p = document.getElementById('pwd').value;
      const d = new Date(); d.setTime(d.getTime() + (7*24*60*60*1000));
      document.cookie = "auth=" + p + ";expires=" + d.toUTCString() + ";path=/";
      location.reload();
    }
  </script>
</body>
</html>`;
}

// =============================================================================
// 🟣 管理面板 (清爽UI重制版)
// =============================================================================
function dashPage(host, uuid) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Worker 控制台</title>
<style>
  :root {
    --primary: #3b82f6;
    --primary-hover: #2563eb;
    --bg-dark: #0f172a;
    --card-bg: rgba(30, 41, 59, 0.75);
    --input-bg: rgba(15, 23, 42, 0.6);
    --border: rgba(255, 255, 255, 0.08);
    --text-main: #f1f5f9;
    --text-muted: #94a3b8;
  }
  
  body {
    background-color: var(--bg-dark);
    background-image: radial-gradient(at 40% 20%, hsla(217,33%,17%,1) 0px, transparent 50%),
                      radial-gradient(at 80% 0%, hsla(189,100%,56%,0.1) 0px, transparent 50%),
                      radial-gradient(at 0% 50%, hsla(340,100%,76%,0.05) 0px, transparent 50%);
    color: var(--text-main);
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    margin: 0;
    padding: 40px 20px;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    box-sizing: border-box;
  }

  .container {
    max-width: 850px;
    width: 100%;
  }
  
  .card {
    background: var(--card-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 32px;
    margin-bottom: 24px;
    box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.5);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  
  h1 { margin: 0; font-size: 1.5rem; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
  
  h3 {
    margin: 0 0 16px 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-main);
    display: flex; align-items: center; gap: 8px;
  }

  .btn-group { display: flex; gap: 10px; }
  .btn-small {
    font-size: 0.85rem;
    cursor: pointer;
    background: rgba(255,255,255,0.05);
    padding: 8px 14px;
    border-radius: 8px;
    text-decoration: none;
    color: var(--text-muted);
    transition: 0.2s;
    border: 1px solid transparent;
  }
  .btn-small:hover { background: rgba(255,255,255,0.1); color: #fff; }
  
  .field { margin-bottom: 20px; }
  .label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px; font-weight: 500; }
  
  .input-group { display: flex; gap: 10px; }
  
  input, textarea {
    width: 100%;
    background: var(--input-bg);
    border: 1px solid var(--border);
    color: #fff;
    padding: 12px 16px;
    border-radius: 10px;
    font-family: 'Monaco', monospace;
    font-size: 0.9rem;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
  }
  input:focus, textarea:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
  textarea { min-height: 120px; resize: vertical; line-height: 1.5; color: #cbd5e1; }
  
  button { cursor: pointer; transition: 0.2s; border-radius: 10px; font-weight: 600; font-size: 0.95rem; }
  
  button.main-btn {
    background: var(--primary);
    color: white;
    border: none;
    padding: 14px 24px;
    width: 100%;
    margin-top: 10px;
  }
  button.main-btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
  
  button.sec-btn {
    background: transparent;
    color: var(--primary);
    border: 1px solid rgba(59, 130, 246, 0.3);
    padding: 12px 20px;
    white-space: nowrap;
  }
  button.sec-btn:hover { background: rgba(59, 130, 246, 0.1); border-color: var(--primary); }

  .checkbox-wrapper {
    display: flex;
    align-items: center;
    margin-top: 12px;
    background: rgba(255,255,255,0.03);
    padding: 10px 14px;
    border-radius: 10px;
    width: fit-content;
    border: 1px solid var(--border);
  }
  .checkbox-wrapper input { width: auto; margin-right: 10px; cursor: pointer; accent-color: var(--primary); height: 16px; width: 16px; }
  .checkbox-wrapper label { cursor: pointer; font-size: 0.9rem; color: var(--text-main); }

  /* 端口标签 */
  .port-box { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .port-tag {
    background: rgba(59, 130, 246, 0.1);
    color: #60a5fa;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-family: monospace;
    border: 1px solid rgba(59, 130, 246, 0.2);
  }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 30px; left: 50%;
    transform: translateX(-50%) translateY(50px);
    background: #10b981; /* Emerald 500 */
    color: white;
    padding: 10px 24px;
    border-radius: 50px;
    box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    pointer-events: none;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  
  .desc { font-size: 0.8rem; color: var(--text-muted); margin-top: 6px; margin-left: 2px; }
  .warn { color: #f59e0b; font-size: 0.8rem; margin-top: 4px; }
  
  /* 转换设置区域 */
  #clashSettings {
    margin-top: 20px;
    padding: 20px;
    border-radius: 12px;
    background: rgba(0,0,0,0.2);
    border: 1px dashed rgba(255,255,255,0.15);
  }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <h1>⚡ Worker 控制台</h1>
      <div class="btn-group">
        <a href="${TG_GROUP_URL}" target="_blank" class="btn-small">加入群组</a>
        <span class="btn-small" onclick="logout()">退出登录</span>
      </div>
    </div>
    
    <div class="field">
      <span class="label">1. 订阅后端地址 (Sub Backend)</span>
      <input type="text" id="subBaseUrl" value="https://${DEFAULT_SUB_DOMAIN}" placeholder="https://..." oninput="updateLink()">
      <div class="desc">建议填写 Worker 绑定的自定义域名 (默认: ${DEFAULT_SUB_DOMAIN})</div>
    </div>

    <div class="field">
      <span class="label">2. 优选IP / 中转域名 (ProxyIP)</span>
      <div class="input-group">
        <input type="text" id="proxyIp" value="${DEFAULT_PROXY_IP}" placeholder="例如: sjc.o00o.ooo" oninput="updateLink()">
        <button class="sec-btn" onclick="checkProxy()">🔍 测速</button>
      </div>
      <div class="desc">自动进行 URL 编码处理</div>
    </div>

    <!-- Clash 设置区域 -->
    <div id="clashSettings" style="display:none;">
      <div class="field">
        <span class="label" style="color:var(--primary)">⚙️ 转换后端 (Converter)</span>
        <input type="text" id="converterUrl" value="${DEFAULT_CONVERTER}" placeholder="https://api.v1.mk" oninput="updateLink()">
      </div>
      <div class="field" style="margin-bottom:0">
        <span class="label" style="color:var(--primary)">📜 规则配置 (Config URL)</span>
        <input type="text" id="configUrl" value="${DEFAULT_CONFIG}" placeholder="https://..." oninput="updateLink()">
      </div>
    </div>

    <div class="field" style="margin-top: 24px;">
      <span class="label">3. 最终订阅链接</span>
      <input type="text" id="resultUrl" readonly onclick="this.select()" style="color: var(--primary); font-weight: 600;">
      
      <div class="checkbox-wrapper">
        <input type="checkbox" id="clashMode" onchange="toggleClashMode()">
        <label for="clashMode">启用 Clash 订阅转换 (使用外部 API)</label>
      </div>
    </div>

    <div class="input-group">
      <button class="main-btn" onclick="copyUrl()">复制订阅链接</button>
      <button class="sec-btn" onclick="window.open(document.getElementById('resultUrl').value)" style="width: 120px;">测试访问</button>
    </div>
  </div>

  <div class="card">
    <h3>📡 端口支持信息</h3>
    <div class="field">
      <span class="label">HTTP 端口</span>
      <div class="port-box">
        <span class="port-tag">80</span><span class="port-tag">8080</span><span class="port-tag">8880</span><span class="port-tag">2052</span><span class="port-tag">2082</span><span class="port-tag">2086</span><span class="port-tag">2095</span>
      </div>
      <span class="label">HTTPS 端口</span>
      <div class="port-box">
        <span class="port-tag">443</span><span class="port-tag">2053</span><span class="port-tag">2083</span><span class="port-tag">2087</span><span class="port-tag">2096</span><span class="port-tag">8443</span>
      </div>
    </div>
  </div>

  <div class="card">
    <h3>📝 内置优选 IP 配置</h3>
    <div class="field" style="margin-bottom:0">
      <textarea id="customIps" readonly onclick="this.select()">${DEFAULT_CUSTOM_IPS}</textarea>
      <div class="desc">此列表仅供预览，修改需在 Worker 代码中进行。</div>
    </div>
  </div>
</div>

<div id="toast" class="toast">已复制到剪贴板</div>

<script>
function toggleClashMode() {
  const isClash = document.getElementById('clashMode').checked;
  const settingsDiv = document.getElementById('clashSettings');
  settingsDiv.style.display = isClash ? 'block' : 'none';
  updateLink();
}

function updateLink() {
  let baseUrl = document.getElementById('subBaseUrl').value.trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl; 
  
  const proxyIp = document.getElementById('proxyIp').value.trim();
  const host = window.location.hostname;
  const uuid = "${UUID}";
  const isClash = document.getElementById('clashMode').checked;

  let rawPath = "/";
  if (proxyIp) {
    rawPath = "/proxyip=" + proxyIp;
  }
  const encodedPath = encodeURIComponent(rawPath);
  
  const cleanUrl = \`\${baseUrl}/sub?uuid=\${uuid}&encryption=none&security=tls&sni=\${host}&alpn=h3&fp=random&allowInsecure=1&type=ws&host=\${host}&path=\${encodedPath}\`;
  
  if (isClash) {
     let converter = document.getElementById('converterUrl').value.trim();
     if (converter.endsWith('/')) converter = converter.slice(0, -1);
     const config = document.getElementById('configUrl').value.trim();
     const clashUrl = \`\${converter}/sub?target=clash&url=\${encodeURIComponent(cleanUrl)}&config=\${encodeURIComponent(config)}&emoji=true&list=false&tfo=false&scv=false&fdn=false&sort=false\`;
     document.getElementById('resultUrl').value = clashUrl;
  } else {
     document.getElementById('resultUrl').value = cleanUrl;
  }
}

function copyUrl() {
  const url = document.getElementById('resultUrl').value;
  navigator.clipboard.writeText(url).then(() => showToast("已复制到剪贴板"));
}

function checkProxy() {
  const ip = document.getElementById('proxyIp').value.trim();
  if(ip) {
    navigator.clipboard.writeText(ip).then(() => {
       alert("ProxyIP 已复制，即将前往测速页面。");
       window.open("${PROXY_CHECK_URL}", "_blank");
    });
  } else {
    window.open("${PROXY_CHECK_URL}", "_blank");
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function logout() {
  document.cookie = "auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  location.reload();
}

window.onload = () => {
  updateLink();
};
</script>
</body>
</html>
`;
}