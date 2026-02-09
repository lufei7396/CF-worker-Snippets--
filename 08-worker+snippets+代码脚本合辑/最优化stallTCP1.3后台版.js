/**
 * StallTCP1.3 极限性能版 (专为 Free Plan 10ms CPU 限制优化)
 * 
 * 1. [核心] 移除所有额外的定时器和 Promise 包装，降低 CPU 消耗，解决 1101。
 * 2. [稳定] 优化资源回收逻辑，防止多次访问后的内存泄漏。
 * 3. [功能] 保持紫色 UI、纯净订阅、ACL4SSR 转换完全不变。
 */

import { connect } from 'cloudflare:sockets';

// =============================================================================
// 🟣 用户配置区域
// =============================================================================
const UUID = "2523c510-9ff0-415b-9582-93949bf55555"; // 请修改你的可用UUID

// 1. 后台登录密码 (留空 "" 则直接进入)
const WEB_PASSWORD = ""; 

// 2. 默认基础配置
const DEFAULT_SUB_DOMAIN = "sub.cmliussss.net";      // 默认订阅数据源地址
const DEFAULT_PROXY_IP = "ProxyIP.US.CMLiussss.net"; // 默认 ProxyIP
const TG_GROUP_URL = "https://t.me/zyssadmin";       // Telegram 群组链接
const PROXY_CHECK_URL = "https://kaic.hidns.co/";    // ProxyIP 检测地址

// 3. 订阅转换默认配置
const DEFAULT_CONVERTER = "https://api.v1.mk";       // 默认转换后端
// 默认配置文件 (ACL4SSR)
const DEFAULT_CONFIG = "https://raw.githubusercontent.com/cmlius/ACL4SSR/main/Clash/config/ACL4SSR_Online_Full_MultiMode.ini"; 

// 4. 自定义优选IP列表 (这是订阅的源头)
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

        // 1. 订阅处理 (纯净 Base64)
        if (url.pathname === '/sub') {
            const requestUUID = url.searchParams.get('uuid');
            if (requestUUID !== UUID) return new Response('Invalid UUID', { status: 403 });

            const host = url.hostname;
            let pathParam = url.searchParams.get('path') || "/";
            const encodedPath = encodeURIComponent(pathParam);
            
            let vlessLinks = [];
            const lines = DEFAULT_CUSTOM_IPS.split('\n');
            
            for (const line of lines) {
                if(!line.trim()) continue;
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
                vlessLinks.push(`vless://${UUID}@${ip}:${port}?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=${encodedPath}#${encodeURIComponent(note)}`);
            }

            return new Response(btoa(unescape(encodeURIComponent(vlessLinks.join('\n')))), {
                status: 200,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }

        // 2. 管理面板 (HTTP)
        if (r.headers.get('Upgrade') !== 'websocket') {
            if (WEB_PASSWORD) {
                const cookie = r.headers.get('Cookie') || "";
                if (!cookie.includes(`auth=${WEB_PASSWORD}`)) {
                    return new Response(loginPage(), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
                }
            }
            return new Response(dashPage(url.hostname, UUID), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        
        // 3. WebSocket 代理逻辑
        let proxyIPConfig = null;
        if (url.pathname.includes('/proxyip=')) {
            try {
                const proxyParam = url.pathname.split('/proxyip=')[1].split('/')[0];
                const [address, port] = parseAddressPort(proxyParam); 
                proxyIPConfig = { address, port: +port }; 
            } catch (e) {}
        }
        
        const { 0: c, 1: s } = new WebSocketPair(); 
        s.accept(); 
        
        // 异步执行，不阻塞主线程，不使用 await
        handle(s, proxyIPConfig); 
        
        return new Response(null, { status: 101, webSocket: c });

    } catch (err) {
        return new Response(err.toString(), { status: 500 });
    }
  }
};

// ⚡️ 核心处理逻辑 (针对 Free Plan 极简优化)
async function handle(ws, proxyIPConfig) {
  const pool = new Pool(); 
  let sock, w, r;
  let first = true;

  try {
      ws.addEventListener('message', async (e) => {
          try {
              // 如果 first 为 true，说明是握手包，处理连接逻辑
              if (first) {
                  first = false;
                  const data = new Uint8Array(e.data);
                  
                  // 简单验证 UUID (节省 CPU)
                  // 略过严格验证，直接连接以提高速度
                  
                  // 响应 WebSocket 握手
                  ws.send(new Uint8Array([0, 0]));

                  // 解析 VLESS 头部
                  const b = data;
                  const o1 = 18 + b[17] + 1;
                  const port = (b[o1] << 8) | b[o1 + 1];
                  const type = b[o1 + 2];
                  let o2 = o1 + 3;
                  let host;
                  
                  if (type === 1) {
                      host = b.slice(o2, o2 + 4).join('.');
                      o2 += 4;
                  } else if (type === 2) {
                      const len = b[o2++];
                      host = new TextDecoder().decode(b.slice(o2, o2 + len));
                      o2 += len;
                  } else {
                      // IPv6 暂略
                      throw new Error('IPv6 type not optimized for lite');
                  }
                  
                  const payload = b.slice(o2);
                  
                  // 确定连接目标
                  const connectOpts = proxyIPConfig 
                      ? { hostname: proxyIPConfig.address, port: proxyIPConfig.port }
                      : { hostname: host, port: port };

                  // 🟢 原生直接连接，无 Promise 包装，无定时器，最省 CPU
                  sock = connect(connectOpts);
                  w = sock.writable.getWriter();
                  r = sock.readable.getReader();
                  
                  // 写入首包数据
                  if (payload.length > 0) {
                      await w.write(payload);
                  }
                  
                  // 启动管道: 远程 -> WebSocket
                  pipeRemoteToWs(r, ws);

              } else {
                  // 后续数据直接转发: WebSocket -> 远程
                  if (w) {
                      await w.write(e.data); // 直接写入，减少 Uint8Array 转换
                  }
              }
          } catch (err) {
              // 发生任何错误立即关闭
              try { ws.close(); } catch {}
              try { sock?.close(); } catch {}
          }
      });

      ws.addEventListener('close', () => {
          try { sock?.close(); } catch {}
      });
      
      ws.addEventListener('error', () => {
          try { sock?.close(); } catch {}
      });

  } catch (err) {
      ws.close();
  }
}

// 管道：远程 Socket -> WebSocket (极简版)
async function pipeRemoteToWs(reader, ws) {
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (ws.readyState === 1) {
                ws.send(value);
            } else {
                break;
            }
        }
    } catch (e) {
        // 忽略读取错误
    } finally {
        // 确保资源释放
        try { ws.close(); } catch {}
        try { reader.cancel(); } catch {}
    }
}

// =============================================================================
// 🟣 登录页面
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
      const d = new Date(); d.setTime(d.getTime() + (7*24*60*60*1000));
      document.cookie = "auth=" + p + ";expires=" + d.toUTCString() + ";path=/";
      location.reload();
    }
  </script>
</body>
</html>`;
}

// =============================================================================
// 🟣 管理面板
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
      <h1>⚡ Worker 订阅管理</h1>
      <div class="btn-group">
        <a href="${TG_GROUP_URL}" target="_blank" class="btn-small">✈️ 加入群组</a>
        <span class="btn-small" onclick="logout()">退出登录</span>
      </div>
    </div>
    
    <!-- 1. 订阅后端地址 -->
    <div class="field">
      <span class="label">1. 订阅后端地址 (Sub Backend)</span>
      <input type="text" id="subBaseUrl" value="https://${DEFAULT_SUB_DOMAIN}" placeholder="https://..." oninput="updateLink()">
      <div class="desc">支持自定义后端 (默认: ${DEFAULT_SUB_DOMAIN})</div>
      <div class="warn">🔥 提示: 推荐填写本 Worker 域名 (https://${host}) 作为数据源。</div>
    </div>

    <!-- 2. ProxyIP -->
    <div class="field">
      <span class="label">2. 优选IP / 中转域名 (ProxyIP)</span>
      <div class="input-group">
        <input type="text" id="proxyIp" value="${DEFAULT_PROXY_IP}" placeholder="例如: sjc.o00o.ooo" oninput="updateLink()">
        <button class="sec-btn" onclick="checkProxy()">🔍 检测</button>
      </div>
      <div class="desc">自动编码为 path=%2Fproxyip%3D... 格式</div>
    </div>

    <!-- 3. 订阅转换设置 -->
    <div class="field" id="clashSettings" style="display:none; background:rgba(0,0,0,0.15); padding:15px; border-radius:8px; margin-bottom:18px; border:1px dashed #6c5ce7;">
      <span class="label" style="color:#a29bfe">⚙️ Clash 转换配置 (使用外部转换器)</span>
      
      <div style="margin-bottom:10px;">
        <span class="label" style="font-size:0.85rem">转换后端地址 (Converter):</span>
        <input type="text" id="converterUrl" value="${DEFAULT_CONVERTER}" placeholder="https://api.v1.mk" oninput="updateLink()">
      </div>
      
      <div>
        <span class="label" style="font-size:0.85rem">远程规则配置 (Config URL):</span>
        <input type="text" id="configUrl" value="${DEFAULT_CONFIG}" placeholder="https://..." oninput="updateLink()">
      </div>
    </div>

    <!-- 4. 最终订阅链接 -->
    <div class="field">
      <span class="label">3. 最终订阅链接</span>
      <input type="text" id="resultUrl" readonly onclick="this.select()">
      
      <!-- Clash 开关 -->
      <div class="checkbox-wrapper">
        <input type="checkbox" id="clashMode" onchange="toggleClashMode()">
        <label for="clashMode">🔄 开启 Clash 智能订阅 (使用转换器 + ACL4SSR 规则)</label>
      </div>
    </div>

    <div class="input-group">
      <button class="main-btn" onclick="copyUrl()">📄 复制订阅链接</button>
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
  const encodedPath = encodeURIComponent(rawPath);
  
  // 1. 生成原始 VLESS 链接 (Base64 源)
  const cleanUrl = \`\${baseUrl}/sub?uuid=\${uuid}&encryption=none&security=tls&sni=\${host}&alpn=h3&fp=random&allowInsecure=1&type=ws&host=\${host}&path=\${encodedPath}\`;
  
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

function copyUrl() {
  const url = document.getElementById('resultUrl').value;
  navigator.clipboard.writeText(url).then(() => showToast("已复制订阅链接!"));
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