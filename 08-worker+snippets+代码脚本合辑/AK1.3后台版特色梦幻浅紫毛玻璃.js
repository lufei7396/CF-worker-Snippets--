import { connect } from 'cloudflare:sockets';

// =============================================================================
// 1. 静态配置 (CONSTANTS)
// =============================================================================
const UUID = "2523c510-9ff0-415b-9582-93949bf55555"; 
const DEFAULT_SUB_DOMAIN = "sub.cmliussss.net";      
const DEFAULT_PROXY_IP = "ProxyIP.US.CMLiussss.net"; 
const TG_GROUP_URL = "https://t.me/zyssadmin";       
const PROXY_CHECK_URL = "https://kaic.hidns.co/";    
const DEFAULT_CONVERTER = "https://api.v1.mk";
const DEFAULT_CONFIG = "https://raw.githubusercontent.com/cmlius/ACL4SSR/main/Clash/config/ACL4SSR_Online_Full_MultiMode.ini";

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

// 运行时常量
const MAX_PENDING = 2097152;
const KEEPALIVE = 15000;
const STALL_TO = 8000;
const MAX_STALL = 12;
const MAX_RECONN = 24;

// =============================================================================
// 2. 工具函数 (HELPER FUNCTIONS)
// =============================================================================

function safeBase64(str) {
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
        return "";
    }
}

function parseAddressPort(addressSegment) {
    let address, port;
    if (addressSegment.startsWith('[')) {
        const [ipv6Address, portStr = 443] = addressSegment.slice(1, -1).split(']:');
        address = `[${ipv6Address}]`; port = portStr;
    } else { 
        [address, port = 443] = addressSegment.split(':'); 
    } 
    return [address, +port];
}

function parseProxyHeader(buffer) {
    if (buffer.byteLength < 18) return null;
    const view = new Uint8Array(buffer);
    const idBytes = view.slice(1, 17); 
    
    const addrType = view[17 + 1 + 1]; 
    let addrStart = 17 + 3;
    let address = "";
    let port = 0;
    let payloadStart = 0;

    if (addrType === 1) { 
        address = view.slice(addrStart, addrStart + 4).join('.');
        addrStart += 4;
    } else if (addrType === 2) { 
        const len = view[addrStart];
        addrStart++;
        address = new TextDecoder().decode(view.slice(addrStart, addrStart + len));
        addrStart += len;
    } else if (addrType === 3) { 
        address = "ipv6"; 
        addrStart += 16;
    } else {
        return null; 
    }

    port = (view[addrStart] << 8) | view[addrStart + 1];
    payloadStart = addrStart + 2;

    return {
        hasData: true,
        address: address,
        port: port,
        payload: view.slice(payloadStart)
    };
}

// =============================================================================
// 3. 核心处理逻辑 (CORE LOGIC)
// =============================================================================

async function handleSession(ws, proxyIPConfig) {
    let upstream = null;
    let upstreamWriter = null;
    let isConnected = false;
    
    const closeAll = () => {
        try { upstream?.close(); } catch(e){}
        try { ws?.close(); } catch(e){}
    };

    ws.addEventListener('message', async (event) => {
        try {
            const data = new Uint8Array(event.data);
            
            if (!isConnected) {
                const headerInfo = parseProxyHeader(data);
                if (!headerInfo) return closeAll();
                
                ws.send(new Uint8Array([0, 0]));

                const connectHost = proxyIPConfig ? proxyIPConfig.address : headerInfo.address;
                const connectPort = proxyIPConfig ? proxyIPConfig.port : headerInfo.port;

                try {
                    upstream = connect({
                        hostname: connectHost,
                        port: connectPort
                    });
                    
                    await upstream.opened;
                    upstreamWriter = upstream.writable.getWriter();
                    isConnected = true;

                    if (headerInfo.payload && headerInfo.payload.length > 0) {
                        await upstreamWriter.write(headerInfo.payload);
                    }

                    await pipeStream(upstream.readable, ws);

                } catch (err) {
                    console.error("Connect Error:", err);
                    closeAll();
                }

            } else {
                if (upstreamWriter) {
                    await upstreamWriter.write(data);
                }
            }
        } catch (err) {
            closeAll();
        }
    });

    ws.addEventListener('close', closeAll);
    ws.addEventListener('error', closeAll);
}

async function pipeStream(readable, ws) {
    const reader = readable.getReader();
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
    } catch (err) {
    } finally {
        try { reader.releaseLock(); } catch(e){}
        try { ws.close(); } catch(e){}
    }
}

// =============================================================================
// 4. 页面生成 (浅紫色毛玻璃 UI)
// =============================================================================

function generateDashPage(host, uuid) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Worker 订阅管理</title>
<style>
  :root {
    --primary: #8b5cf6; /* 浅紫 */
    --primary-hover: #7c3aed;
    --glass-bg: rgba(255, 255, 255, 0.4);
    --glass-border: rgba(255, 255, 255, 0.7);
    --text-main: #2d3436;
    --text-muted: #636e72;
    --input-bg: rgba(255, 255, 255, 0.5);
    --shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.1);
  }
  
  body {
    background-color: #f3e8ff;
    background-image: 
        radial-gradient(at 40% 20%, hsla(266, 53%, 86%, 1) 0px, transparent 50%),
        radial-gradient(at 80% 0%, hsla(229, 79%, 90%, 1) 0px, transparent 50%),
        radial-gradient(at 0% 50%, hsla(301, 44%, 90%, 1) 0px, transparent 50%);
    color: var(--text-main);
    font-family: 'Segoe UI', -apple-system, system-ui, sans-serif;
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
    animation: fadeIn 0.8s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .card {
    background: var(--glass-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: 24px;
    padding: 35px;
    margin-bottom: 25px;
    box-shadow: var(--shadow);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    padding-bottom: 15px;
    border-bottom: 1px solid rgba(0,0,0,0.05);
  }
  
  h1 {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    color: #4c1d95;
    background: linear-gradient(to right, #6d28d9, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .btn-group { display: flex; gap: 10px; }
  
  .btn-small {
    font-size: 0.85rem;
    cursor: pointer;
    background: rgba(255,255,255,0.5);
    padding: 8px 15px;
    border-radius: 12px;
    text-decoration: none;
    color: var(--text-main);
    transition: 0.3s;
    border: 1px solid rgba(255,255,255,0.5);
    font-weight: 500;
  }
  .btn-small:hover {
    background: #fff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }
  
  .field { margin-bottom: 22px; }
  .label { 
    display: block; 
    font-size: 0.9rem; 
    color: var(--text-main); 
    margin-bottom: 8px; 
    font-weight: 600; 
    margin-left: 4px;
  }
  
  .input-group { display: flex; gap: 10px; }
  
  input, textarea {
    width: 100%;
    background: var(--input-bg);
    border: 1px solid rgba(255,255,255,0.6);
    color: var(--text-main);
    padding: 14px 18px;
    border-radius: 16px;
    font-family: 'Monaco', monospace;
    font-size: 0.95rem;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
  }
  input:focus, textarea:focus {
    background: #fff;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
  }
  textarea { min-height: 130px; resize: vertical; line-height: 1.6; color: #4b5563; }
  
  button { cursor: pointer; transition: 0.3s; border-radius: 14px; font-weight: 600; font-size: 1rem; }
  
  button.main-btn {
    background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
    color: white;
    border: none;
    padding: 15px 24px;
    width: 100%;
    margin-top: 10px;
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
  }
  button.main-btn:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4);
  }
  
  button.sec-btn {
    background: rgba(255, 255, 255, 0.6);
    color: var(--primary-hover);
    border: 1px solid rgba(139, 92, 246, 0.2);
    padding: 12px 20px;
    white-space: nowrap;
  }
  button.sec-btn:hover { 
    background: #fff; 
    border-color: var(--primary); 
  }

  .checkbox-wrapper {
    display: flex;
    align-items: center;
    margin-top: 15px;
    background: rgba(255,255,255,0.4);
    padding: 10px 16px;
    border-radius: 14px;
    width: fit-content;
    border: 1px solid rgba(255,255,255,0.6);
  }
  .checkbox-wrapper input { 
    width: auto; margin-right: 10px; cursor: pointer; 
    accent-color: var(--primary); 
    height: 18px; width: 18px; 
    box-shadow: none;
  }
  .checkbox-wrapper label { cursor: pointer; font-size: 0.95rem; color: var(--text-main); font-weight: 500; }

  /* 端口标签 */
  .port-box { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
  .port-tag {
    background: rgba(139, 92, 246, 0.1);
    color: #7c3aed;
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 0.85rem;
    font-family: monospace;
    border: 1px solid rgba(139, 92, 246, 0.1);
    font-weight: 600;
  }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 40px; left: 50%;
    transform: translateX(-50%) translateY(60px);
    background: rgba(255, 255, 255, 0.9);
    color: #10b981;
    padding: 12px 28px;
    border-radius: 50px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    backdrop-filter: blur(10px);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    pointer-events: none;
    font-weight: 600;
    font-size: 0.95rem;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  
  .desc { font-size: 0.85rem; color: var(--text-muted); margin-top: 6px; margin-left: 4px; }
  
  /* 设置区域 */
  #clashSettings {
    margin-top: 20px;
    padding: 20px;
    border-radius: 16px;
    background: rgba(139, 92, 246, 0.05);
    border: 1px dashed rgba(139, 92, 246, 0.3);
  }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <h1>⚡ Worker 订阅管理</h1>
      <div class="btn-group">
        <a href="${TG_GROUP_URL}" target="_blank" class="btn-small">✈️ 群组</a>
        <span class="btn-small" onclick="logout()">🔒 退出</span>
      </div>
    </div>
    
    <div class="field">
      <span class="label">🌐 订阅域名 (Sub Domain)</span>
      <input type="text" id="subBaseUrl" value="https://${DEFAULT_SUB_DOMAIN}" placeholder="https://..." oninput="updateLink()">
      <div class="desc">默认使用: ${DEFAULT_SUB_DOMAIN}</div>
    </div>

    <div class="field">
      <span class="label">🚀 优选IP (ProxyIP)</span>
      <div class="input-group">
        <input type="text" id="proxyIp" value="${DEFAULT_PROXY_IP}" placeholder="例如: sjc.o00o.ooo" oninput="updateLink()">
        <button class="sec-btn" onclick="checkProxy()">⚡ 测速</button>
      </div>
      <div class="desc">自动处理为 path 参数</div>
    </div>

    <!-- Clash 设置区域 -->
    <div id="clashSettings" style="display:none;">
      <div class="field">
        <span class="label" style="color:var(--primary)">🛠️ 转换后端 (Converter)</span>
        <input type="text" id="converterUrl" value="${DEFAULT_CONVERTER}" placeholder="https://api.v1.mk" oninput="updateLink()">
      </div>
      <div class="field" style="margin-bottom:0">
        <span class="label" style="color:var(--primary)">📜 规则配置 (Config URL)</span>
        <input type="text" id="configUrl" value="${DEFAULT_CONFIG}" placeholder="https://..." oninput="updateLink()">
      </div>
    </div>

    <div class="field" style="margin-top: 24px;">
      <span class="label">🔗 最终订阅链接</span>
      <input type="text" id="resultUrl" readonly onclick="this.select()" style="color: var(--primary-hover); font-weight: 600; background: rgba(139,92,246,0.05);">
      
      <div class="checkbox-wrapper">
        <input type="checkbox" id="clashMode" onchange="toggleClashMode()">
        <label for="clashMode">启用 Clash 订阅转换 (ACL4SSR)</label>
      </div>
    </div>

    <div class="input-group">
      <button class="main-btn" onclick="copyUrl()">📄 一键复制订阅</button>
      <button class="sec-btn" onclick="window.open(document.getElementById('resultUrl').value)" style="width: 130px;">🚀 测试访问</button>
    </div>
  </div>

  <div class="card">
    <h3>📡 端口支持</h3>
    <div class="field">
      <span class="label" style="font-weight:500; color:#666;">HTTP 端口</span>
      <div class="port-box">
        <span class="port-tag">80</span><span class="port-tag">8080</span><span class="port-tag">8880</span><span class="port-tag">2052</span><span class="port-tag">2082</span><span class="port-tag">2086</span><span class="port-tag">2095</span>
      </div>
      <span class="label" style="font-weight:500; color:#666;">HTTPS 端口</span>
      <div class="port-box">
        <span class="port-tag">443</span><span class="port-tag">2053</span><span class="port-tag">2083</span><span class="port-tag">2087</span><span class="port-tag">2096</span><span class="port-tag">8443</span>
      </div>
    </div>
  </div>

  <div class="card">
    <h3>📝 内置配置预览</h3>
    <div class="field" style="margin-bottom:0">
      <textarea id="customIps" readonly onclick="this.select()">${DEFAULT_CUSTOM_IPS}</textarea>
      <div class="desc">此列表仅供预览，如需修改请编辑 Worker 代码。</div>
    </div>
  </div>
</div>

<div id="toast" class="toast">✨ 已复制到剪贴板</div>

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

  let rawPath = "/";
  if (proxyIp) {
    rawPath = "/proxyip=" + proxyIp;
  }
  const encodedPath = encodeURIComponent(rawPath);
  
  const protocol = atob('dmxlc3M6Ly8=');
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
  navigator.clipboard.writeText(url).then(() => showToast("✨ 已复制到剪贴板"));
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

// =============================================================================
// 5. 最终导出 (EXPORT DEFAULT)
// =============================================================================
export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);

            // 🟢 订阅导出 (/sub)
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
                        ip = p[0]; port = p[1];
                    }
                    
                    // 使用 atob 动态还原协议头
                    const protocol = atob('dmxlc3M6Ly8=');
                    const link = `${protocol}${UUID}@${ip}:${port}?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=${encodedPath}#${encodeURIComponent(note)}`;
                    nodeLinks.push(link);
                });

                return new Response(safeBase64(nodeLinks.join('\n')), {
                    status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            // 🟣 仪表盘
            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response(generateDashPage(url.hostname, UUID), { 
                    status: 200, 
                    headers: { 'Content-Type': 'text/html; charset=utf-8' } 
                });
            }
            
            // 🔵 WebSocket 代理
            let proxyIPConfig = null;
            if (url.pathname.includes('/proxyip=')) {
                try {
                    const proxyParam = url.pathname.split('/proxyip=')[1].split('/')[0];
                    const [address, port] = parseAddressPort(proxyParam); 
                    proxyIPConfig = { address, port: +port }; 
                } catch (e) { console.error(e); }
            }
            
            const { 0: client, 1: server } = new WebSocketPair(); 
            server.accept(); 
            
            // 异步调用 Session 处理
            handleSession(server, proxyIPConfig).catch(e => console.error(e));
            
            return new Response(null, { status: 101, webSocket: client });

        } catch (err) {
            return new Response(`Worker Error: ${err.message}`, { status: 500 });
        }
    }
};