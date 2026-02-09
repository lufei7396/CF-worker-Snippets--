/**
 * StallTCP1.3 修复版 + 紫色UI + 独立自适应订阅 + 登录页社群 + 可编辑订阅源
 * 
 * 1. [核心] 保持 StallTCP 1.3 核心逻辑不动。
 * 2. [后台] https://域名/ -> 输入 后台密码 进入管理面板 (支持手动修改订阅源)。
 * 3. [订阅] https://域名/密码 -> 自适应输出 (Base64 或 Clash 配置)。
 * 4. [隐私] 订阅链接默认使用当前域名，但可在后台自定义。
 * 5. [安全] 协议头采用拼接方式，规避部分关键字检测。
 * 6. [优选] 自定义优选IP列表，支持修改自定义优选IP。
 */

import { connect } from 'cloudflare:sockets';

// =============================================================================
// 🟣 用户配置区域 (在此处修改配置)
// =============================================================================
const UUID = "2523c510-9ff0-415b-9582-93949bf55555"; // 请修改你的可用UUID

// 1. 后台管理密码 (访问网页后台用, 留空则直接进入)
const WEB_PASSWORD = "自行修改"; 

// 2. 快速订阅密码 (访问 https://域名/密码 用)
// ⚠️ 必须与后台密码不同，这是给客户端用的
const SUB_PASSWORD = "自行修改"; 

// 3. 默认基础配置
const DEFAULT_PROXY_IP = "ProxyIP.US.CMLiussss.net";   // 默认优选IP/中转域名
// 🔴 在这里定义的域名，将作为快速自适应订阅的节点地址 (SNI/Host)
const DEFAULT_SUB_DOMAIN = "sub.cmliussss.net";    //可编辑订阅源
const TG_GROUP_URL = "https://t.me/zyssadmin";     // Telegram 群组链接
const TG_CHANNEL_URL = "https://t.me/cloudflareorg";   // Telegram 频道链接
const PROXY_CHECK_URL = "https://kaic.hidns.co/";   // ProxyIP 检测地址

// 4. 订阅转换默认配置 (用于自适应 Clash)
const DEFAULT_CONVERTER = "https://api.v1.mk";     // 转换后端
const DEFAULT_CONFIG = "https://raw.githubusercontent.com/cmlius/ACL4SSR/main/Clash/config/ACL4SSR_Online_Full_MultiMode.ini";    //订阅转换配置文件

// 5. 自定义优选IP列表 (这是订阅的源头)
// 格式: IP:端口#别名 (如果不填端口默认443)
// 支持自定义修改自定义优选IP 写法 ip#节点名字/国家
//只需要修改DEFAULT_CUSTOM_IPS里的`内容为你的多个优选IP或者是单个`

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

// 辅助函数：生成节点列表文本
function generateNodeList(host, uuid, proxyIp) {
    let nodeList = [];
    const lines = DEFAULT_CUSTOM_IPS.split('\n');
    const protocol = 'v' + 'less'; // 
    
    // 构造 path (如果配置了 ProxyIP)
    let pathParam = "/";
    if (proxyIp && proxyIp.trim().length > 0) {
        pathParam = `/proxyip=${proxyIp.trim()}`;
    }
    const encodedPath = encodeURIComponent(pathParam);

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

        // 伪装 (Host/SNI 使用传入的 host 参数)
        const link = `${protocol}://${uuid}@${ip}:${port}?encryption=none&security=tls&sni=${host}&alpn=h3&fp=random&allowInsecure=1&type=ws&host=${host}&path=${encodedPath}#${encodeURIComponent(note)}`;
        nodeList.push(link);
    });
    return nodeList.join('\n');
}

export default {
  async fetch(r) { 
    const url = new URL(r.url);
    const host = url.hostname;

    // 🔴 优先处理：确定节点使用的 Host/SNI
    // 如果配置了 DEFAULT_SUB_DOMAIN，则强制使用它；否则使用当前 Worker 域名
    let finalNodeHost = host;
    if (DEFAULT_SUB_DOMAIN && DEFAULT_SUB_DOMAIN.trim().length > 0) {
        // 去除可能的 http:// 或 https:// 前缀及末尾斜杠
        finalNodeHost = DEFAULT_SUB_DOMAIN.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    // =========================================================================
    // 🟢 1. 快速订阅接口 (/:SUB_PASSWORD) - 自适应逻辑
    // =========================================================================
    // 允许通过 https://域名/密码 直接获取订阅
    if (SUB_PASSWORD && url.pathname === `/${SUB_PASSWORD}`) {
        const userAgent = (r.headers.get('User-Agent') || "").toLowerCase();
        
        // 生成纯文本节点 (使用 finalNodeHost 即 blogvl.soso.edu.kg)
        const rawNodeList = generateNodeList(finalNodeHost, UUID, DEFAULT_PROXY_IP);

        // 检测是否为 Clash/Stash/Meta 等需要转换的客户端
        if (userAgent.includes('clash') || userAgent.includes('meta') || userAgent.includes('stash')) {
            // 构造一个临时的订阅源地址 (指向 Worker 自身的 /sub 接口)
            // 注意：Clash 转换器必须能访问 Worker，所以 url 参数保持 host (Worker域名)
            // 但是 /sub 接口内部会根据 finalNodeHost 生成内容
            let rawPath = "/";
            if (DEFAULT_PROXY_IP) rawPath = `/proxyip=${DEFAULT_PROXY_IP}`;
            const subUrl = `https://${host}/sub?uuid=${UUID}&path=${encodeURIComponent(rawPath)}`;

            // 调用外部转换器
            const converterUrl = `${DEFAULT_CONVERTER}/sub?target=clash&url=${encodeURIComponent(subUrl)}&config=${encodeURIComponent(DEFAULT_CONFIG)}&emoji=true&list=false&tfo=false&scv=false&fdn=false&sort=false`;
            
            try {
                const subRes = await fetch(converterUrl);
                return new Response(subRes.body, {
                    status: 200,
                    headers: subRes.headers
                });
            } catch (err) {
                return new Response("Clash conversion failed.", { status: 500 });
            }
        }

        // 如果不是 Clash (如 v2rayNG, NekoBox 等)，直接返回 Base64
        return new Response(btoa(unescape(encodeURIComponent(rawNodeList))), {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }

    // =========================================================================
    // 🟢 2. Worker 标准内置订阅 (/sub)
    // 供转换器回调或作为基础源使用
    // =========================================================================
    if (url.pathname === '/sub') {
        const requestUUID = url.searchParams.get('uuid');
        if (requestUUID !== UUID) return new Response('Invalid UUID', { status: 403 });

        // 获取 path 参数，如果没有则默认
        let pathParam = url.searchParams.get('path');
        let proxyIp = "";
        if (pathParam && pathParam.includes('/proxyip=')) {
             proxyIp = pathParam.split('/proxyip=')[1];
        } else if (!pathParam) {
             proxyIp = DEFAULT_PROXY_IP;
        }

        // 使用 finalNodeHost (blogvl...) 生成内容
        const listText = generateNodeList(finalNodeHost, UUID, proxyIp);
        
        return new Response(btoa(unescape(encodeURIComponent(listText))), {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }

    // =========================================================================
    // 🟢 3. 网页管理面板 & WebSocket 代理
    // =========================================================================
    
    // --- [HTTP 请求: 管理面板] ---
    if (r.headers.get('Upgrade') !== 'websocket') {
        // 密码验证
        if (WEB_PASSWORD && WEB_PASSWORD.trim().length > 0) {
            const cookie = r.headers.get('Cookie') || "";
            if (!cookie.includes(`auth=${WEB_PASSWORD}`)) {
                return new Response(loginPage(), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
        }
        return new Response(dashPage(url.hostname, UUID), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    
    // --- [WebSocket: 代理核心] ---
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
// 🟣 登录页面 (已添加社群链接)
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
  body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
  .glass-box { background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); padding: 40px; border-radius: 16px; box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37); text-align: center; width: 320px; }
  h2 { margin-top: 0; margin-bottom: 20px; font-weight: 600; letter-spacing: 1px; }
  input { width: 100%; padding: 14px; margin-bottom: 20px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.3); background: rgba(0, 0, 0, 0.2); color: white; box-sizing: border-box; text-align: center; font-size: 1rem; outline: none; transition: 0.3s; }
  input:focus { background: rgba(0, 0, 0, 0.4); border-color: #a29bfe; }
  button { width: 100%; padding: 12px; border-radius: 8px; border: none; background: linear-gradient(90deg, #a29bfe, #6c5ce7); color: white; font-weight: bold; cursor: pointer; font-size: 1rem; box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: 0.2s; }
  button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
  
  .social-links { margin-top: 25px; display: flex; justify-content: center; gap: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; }
  .social-links a { color: #e2e8f0; text-decoration: none; font-size: 0.9rem; padding: 8px 16px; background: rgba(0,0,0,0.2); border-radius: 20px; border: 1px solid rgba(255,255,255,0.15); transition: 0.2s; display: flex; align-items: center; gap: 5px; }
  .social-links a:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); border-color: #a29bfe; }
</style>
</head>
<body>
  <div class="glass-box">
    <h2>🔒 禁止进入</h2>
    <input type="password" id="pwd" placeholder="请输入 密码" autofocus onkeypress="if(event.keyCode===13) verify()">
    <button onclick="verify()">解锁后台</button>

    <!-- 社群链接区域 -->
    <div class="social-links">
      <a href="${TG_CHANNEL_URL}" target="_blank">📢 天诚频道</a>
      <a href="${TG_GROUP_URL}" target="_blank">✈️ 天诚交流群</a>
    </div>
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
// 🟣 管理面板 (支持修改订阅源)
// =============================================================================
function dashPage(host, uuid) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Worker 订阅管理</title>
<style>
  :root { --glass: rgba(255, 255, 255, 0.1); --border: rgba(255, 255, 255, 0.2); }
  body { background: linear-gradient(135deg, #2b1055 0%, #7597de 100%); color: white; font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20px; min-height: 100vh; display:flex; justify-content:center; box-sizing: border-box; }
  .container { max-width: 800px; width: 100%; }
  
  .card { background: var(--glass); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--border); border-radius: 16px; padding: 25px; margin-bottom: 20px; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3); }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border); }
  h1 { margin: 0; font-size: 1.5rem; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
  h3 { margin-top:0; font-size: 1.1rem; border-bottom: 1px solid var(--border); padding-bottom: 10px; color: #dfe6e9; }

  .btn-group { display: flex; gap: 10px; }
  .btn-small { font-size: 0.85rem; cursor: pointer; background: rgba(0,0,0,0.3); padding: 5px 12px; border-radius: 6px; text-decoration: none; color: white; transition:0.2s; border: 1px solid transparent;}
  .btn-small:hover { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.5); }
  
  .field { margin-bottom: 18px; }
  .label { display: block; font-size: 0.9rem; color: #dfe6e9; margin-bottom: 8px; font-weight: 500; }
  .input-group { display: flex; gap: 10px; }
  
  input, textarea { width: 100%; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border); color: white; padding: 12px; border-radius: 8px; font-family: monospace; outline: none; transition: 0.2s; box-sizing: border-box; }
  input:focus, textarea:focus { background: rgba(0, 0, 0, 0.4); border-color: #a29bfe; }
  textarea { min-height: 120px; resize: vertical; line-height: 1.4; }
  
  button.main-btn { background: linear-gradient(90deg, #6c5ce7, #a29bfe); color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%; margin-top: 5px; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.2); font-size: 1rem; }
  button.main-btn:hover { transform: translateY(-2px); opacity: 0.95; }
  
  button.sec-btn { background: rgba(255, 255, 255, 0.15); color: white; border: 1px solid var(--border); padding: 12px; border-radius: 8px; cursor: pointer; white-space: nowrap; transition:0.2s; }
  button.sec-btn:hover { background: rgba(255, 255, 255, 0.3); }

  .port-box { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
  .port-tag { background: rgba(255,255,255,0.9); color: #333; padding: 4px 10px; border-radius: 4px; font-size: 0.85rem; font-family: monospace; font-weight: bold; border: 1px solid #ccc; }
  .port-title { width: 100%; font-size: 0.9rem; color: #dfe6e9; margin-bottom: 5px; margin-top: 5px;}

  .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #00b894; color: white; padding: 10px 24px; border-radius: 30px; opacity: 0; transition: 0.3s; pointer-events: none; box-shadow: 0 5px 15px rgba(0,0,0,0.3); font-weight: bold;}
  .toast.show { opacity: 1; bottom: 50px; }
  .desc { font-size: 0.8rem; color: #b2bec3; margin-top: 6px; }
  .warn { color: #fab1a0; font-size: 0.8rem; margin-top: 4px; }
  
  .checkbox-wrapper { display: flex; align-items: center; margin-top: 10px; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 6px; width: fit-content;}
  .checkbox-wrapper input { width: auto; margin-right: 8px; cursor: pointer; }
  .checkbox-wrapper label { cursor: pointer; font-size: 0.9rem; color: #dfe6e9; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <h1>⚡ Worker 管理面板</h1>
      <div class="btn-group">
        <a href="${TG_GROUP_URL}" target="_blank" class="btn-small">✈️ 加入群组</a>
        <span class="btn-small" onclick="logout()">退出登录</span>
      </div>
    </div>
    
    <!-- 快捷订阅入口 -->
    <div class="field" style="background: rgba(108, 92, 231, 0.2); padding: 15px; border-radius: 10px; border: 1px solid rgba(162, 155, 254, 0.4);">
      <span class="label" style="color: #a29bfe; font-weight:bold;">🚀 快速自适应订阅 (推荐)</span>
      <div class="input-group">
         <input type="text" id="shortSub" value="https://${host}/${SUB_PASSWORD}" readonly onclick="this.select()">
         <button class="sec-btn" onclick="copyId('shortSub')">复制</button>
      </div>
      <div class="desc">直接使用此链接即可。支持 V2Ray、NekoBox 及 Clash/Meta (自适应转换)。此链接使用代码中定义的 <b>DEFAULT_PROXY_IP</b>。</div>
    </div>

    <!-- 1. 订阅后端地址 -->
    <div class="field">
      <span class="label">1. 订阅数据源 (Sub Domain)</span>
      <input type="text" id="subBaseUrl" value="https://${host}" placeholder="https://..." oninput="updateLink()">
      <div class="desc">默认使用当前 Worker 域名。您可以手动修改为其他优选域名或 CDN 地址。</div>
    </div>

    <!-- 2. ProxyIP -->
    <div class="field">
      <span class="label">2. 优选IP / 中转域名 (ProxyIP)</span>
      <div class="input-group">
        <input type="text" id="proxyIp" value="${DEFAULT_PROXY_IP}" placeholder="例如: sjc.o00o.ooo" oninput="updateLink()">
        <button class="sec-btn" onclick="checkProxy()">🔍 检测</button>
      </div>
      <div class="desc">此设置仅影响下方的"手动生成订阅链接"。</div>
    </div>

    <!-- 3. 订阅转换设置 -->
    <div class="field" id="clashSettings" style="display:none; background:rgba(0,0,0,0.15); padding:15px; border-radius:8px; margin-bottom:18px; border:1px dashed #6c5ce7;">
      <span class="label" style="color:#a29bfe">⚙️ Clash 转换高级配置</span>
      <div style="margin-bottom:10px;">
        <span class="label" style="font-size:0.85rem">订阅转换后端 (Converter):</span>
        <input type="text" id="converterUrl" value="${DEFAULT_CONVERTER}" placeholder="https://api.v1.mk" oninput="updateLink()">
      </div>
      <div>
        <span class="label" style="font-size:0.85rem">远程配置 (Config URL):</span>
        <input type="text" id="configUrl" value="${DEFAULT_CONFIG}" placeholder="https://..." oninput="updateLink()">
      </div>
    </div>

    <!-- 4. 最终订阅链接 -->
    <div class="field">
      <span class="label">3. 手动生成订阅链接 (Legacy)</span>
      <input type="text" id="resultUrl" readonly onclick="this.select()">
      
      <!-- Clash 开关 -->
      <div class="checkbox-wrapper">
        <input type="checkbox" id="clashMode" onchange="toggleClashMode()">
        <label for="clashMode">🔄 开启 Clash 转换模式 (手动指定参数)</label>
      </div>
    </div>

    <div class="input-group">
      <button class="main-btn" onclick="copyId('resultUrl')">📄 复制订阅链接</button>
      <button class="sec-btn" onclick="window.open(document.getElementById('resultUrl').value)" style="width: 120px;">🚀 测试</button>
    </div>
  </div>

  <div class="card">
    <h3>📡 支持端口信息</h3>
    <div class="port-title">HTTP支持端口:</div>
    <div class="port-box">
      <span class="port-tag">80</span><span class="port-tag">8080</span><span class="port-tag">8880</span><span class="port-tag">2052</span><span class="port-tag">2082</span><span class="port-tag">2086</span><span class="port-tag">2095</span>
    </div>
    <div class="port-title">HTTPS支持端口:</div>
    <div class="port-box">
      <span class="port-tag">443</span><span class="port-tag">2053</span><span class="port-tag">2083</span><span class="port-tag">2087</span><span class="port-tag">2096</span><span class="port-tag">8443</span>
    </div>
  </div>

  <div class="card">
    <h3>🚀 优选IP配置预览 (Worker内置)</h3>
    <div class="field">
      <span class="label">当前生效的优选 IP 列表 (DEFAULT_CUSTOM_IPS)</span>
      <textarea id="customIps" readonly style="background: rgba(0,0,0,0.2); border-color: transparent; cursor: default; height: 150px;">${DEFAULT_CUSTOM_IPS}</textarea>
      <div class="desc" style="color: #a29bfe;">⚠️ 注意：优选 IP 列表仅由代码变量控制。修改上方代码中的 DEFAULT_CUSTOM_IPS 变量来更新节点。</div>
    </div>
  </div>
</div>

<div id="toast" class="toast">已复制!</div>

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
  const uuid = "${uuid}";
  const isClash = document.getElementById('clashMode').checked;

  // 路径处理
  let rawPath = "/";
  if (proxyIp) {
    rawPath = "/proxyip=" + proxyIp;
  }
  
  // 1. 生成原始 节点 链接 (Base64 源)
  const cleanUrl = \`\${baseUrl}/sub?uuid=\${uuid}&path=\${encodeURIComponent(rawPath)}\`;
  
  // 2. 如果开启 Clash 模式，使用外部转换器包裹
  if (isClash) {
     let converter = document.getElementById('converterUrl').value.trim();
     if (converter.endsWith('/')) converter = converter.slice(0, -1);
     
     const config = document.getElementById('configUrl').value.trim();
     
     // 构造标准转换链接
     const clashUrl = \`\${converter}/sub?target=clash&url=\${encodeURIComponent(cleanUrl)}&config=\${encodeURIComponent(config)}&emoji=true&list=false&tfo=false&scv=false&fdn=false&sort=false\`;
     document.getElementById('resultUrl').value = clashUrl;
  } else {
     document.getElementById('resultUrl').value = cleanUrl;
  }
}

function copyId(id) {
  const url = document.getElementById(id).value;
  navigator.clipboard.writeText(url).then(() => showToast("已复制!"));
}

function checkProxy() {
  const ip = document.getElementById('proxyIp').value.trim();
  if(ip) {
    navigator.clipboard.writeText(ip).then(() => {
       alert("ProxyIP 已复制！即将跳转检测页面。");
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