
/**
 * StallTCP1.2天诚专用版 
 * Cloudflare的workes和snippets部署,部署前请更换有效AUTH_UUID,默认UUID无效,部署完成后删除说明。
 * 订阅地址配置：
 *（https://你的订阅器或SUB/sub?uuid=你的UUID&encryption=none&security=tls&sni=你的域名&alpn=h3&fp=random&type=ws&host=你的域名&path=%2Fproxyip%3Dtw.sni2025.netlib.re)
 * ProxyIP在上面订阅链接中已经内置天诚专用台湾ProxyIP，(TW.sni2025.netlib.re)
 * 天诚专用ProxyIP其他代码部署不能使用，使用别的ProxyIP请你一定编码后放入(path=)后
 * 适配了ProxyIP使用， 路径格式，/proxyip=ip:port(默认无端口443)
 * ProxyIP支持格式：/proxyip=xx.sni2025.netlib.re,/proxyip=xx.sni2025.netlib.re:10086
 * 🫡致敬原版作者：Alexandre_Kojeve
 * 天诚技术交流群@zyssadmin出品
 */



import { connect } from 'cloudflare:sockets';
// AUTH_UUID 和其他辅助函数保持不变
const AUTH_UUID = "f63a2e15-3182-4d0a-9342-b0f916898898";

export default {
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Hello World!', { status: 200 });
    const u = new URL(req.url); 
    let proxyIPConfig = null;
    
    if (u.pathname.includes('/proxyip=')) {
      const proxyParam = u.pathname.split('/proxyip=')[1].split('/')[0];
      
      // *** MODIFICATION START: 调用新的异步解析函数 ***
      const [address, port] = await 解析地址端口(proxyParam);
      // *** MODIFICATION END ***

      proxyIPConfig = { address, port: +port }; 
    }
    
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept(); 
    server.send(new Uint8Array([0, 0]));
    
    handleConnection(server, proxyIPConfig);
    
    return new Response(null, { status: 101, webSocket: client }); 
  }
};

// ====================================================================
// === 新增/修改的解析函数逻辑 (适配 .netlib) ===
// ====================================================================

/**
 * 异步函数：通过 DNS over HTTPS 查询域名的 TXT 记录，并从中随机选择一个 IP:端口 地址。
 * @param {string} netlib 待解析的 .netlib 域名
 * @returns {Promise<string|null>} 返回一个 IP:端口 字符串（例如: "192.0.2.1:443"）或 null
 */
async function resolveNetlibDomainAsync(netlib) { // <--- 函数名已更改
    try {
        // 使用 Cloudflare 的 1.1.1.1 DNS over HTTPS
        const response = await fetch(`https://1.1.1.1/dns-query?name=${netlib}&type=TXT`, {
            headers: { 'Accept': 'application/dns-json' }
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        const txtRecords = (data.Answer || [])
            .filter(record => record.type === 16)
            .map(record => record.data);
            
        if (txtRecords.length === 0) return null;
        
        // 提取 TXT 记录的 Data
        let txtData = txtRecords[0];
        if (txtData.startsWith('"') && txtData.endsWith('"')) {
            txtData = txtData.slice(1, -1);
        }
        
        // 解析 TXT 记录中的 IP:端口 列表，支持逗号或换行分隔
        const prefixes = txtData
            .replace(/\\010/g, ',') // 替换 \010 (八进制换行符)
            .replace(/\n/g, ',')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean); // 过滤空字符串
            
        if (prefixes.length === 0) return null;
        
        // 随机选择一个 IP:端口
        return prefixes[Math.floor(Math.random() * prefixes.length)];
        
    } catch (error) {
        // console.error('解析Netlib域名失败:', error); 
        return null;
    }
}

/**
 * V1.2 主解析函数：处理 .netlib 的异步逻辑和其他同步逻辑。
 * @param {string} proxyIP 输入的原始地址（域名或IP:端口）
 * @returns {Promise<[string, number]>} 返回 [地址, 端口] 数组，端口默认为 443
 */
async function 解析地址端口(proxyIP) {
    proxyIP = proxyIP.toLowerCase();

    // --- 1. 处理 .netlib 域名解析（异步部分） ---  <--- 逻辑已更改
    if (proxyIP.includes('.netlib')) { 
        const netlibResult = await resolveNetlibDomainAsync(proxyIP); // <--- 调用已更改
        proxyIP = netlibResult || proxyIP;
    }

    let 地址 = proxyIP, 端口 = 443; // 默认端口 443

    // --- 2. 处理 .tpXX 端口分离 ---
    if (proxyIP.includes('.tp')) {
        const tpMatch = proxyIP.match(/\.tp(\d+)/);
        if (tpMatch) {
            端口 = parseInt(tpMatch[1], 10);
        }
        return [地址, 端口];
    }
    
    // --- 3. 处理 IPV6/IPV4/域名:端口 分离 (同步部分) ---
    if (proxyIP.includes(']:')) {
        // IPV6 [::]:port
        const parts = proxyIP.split(']:');
        地址 = parts[0] + ']';
        端口 = parseInt(parts[1], 10) || 端口;
    } 
    else if (proxyIP.includes(':') && !proxyIP.startsWith('[')) {
        // IPV4/域名:port
        const colonIndex = proxyIP.lastIndexOf(':');
        地址 = proxyIP.slice(0, colonIndex);
        端口 = parseInt(proxyIP.slice(colonIndex + 1), 10) || 端口;
    }
    
    return [地址, 端口];
}


// ====================================================================
// === stallTCP v1.2.js 原始其余函数 (保持不变) ===
// ====================================================================

function buildUUID(arr, start) { return Array.from(arr.slice(start, start + 16)).map(n => n.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'); }

const extractAddress = b => {
  const o1 = 18 + b[17] + 1, p = (b[o1] << 8) | b[o1 + 1], t = b[o1 + 2]; let o2 = o1 + 3, h, l;
  switch (t) {
    case 1: l = 4; h = b.slice(o2, o2 + l).join('.'); break;
    case 2: l = b[o2++]; h = new TextDecoder().decode(b.slice(o2, o2 + l)); break;
    case 3: l = 16; h = `[${Array.from({ length: 8 }, (_, i) => ((b[o2 + i * 2] << 8) | b[o2 + i * 2 + 1]).toString(16)).join(':')}]`; break;
    default: throw new Error('Invalid address type.');
  } return { host: h, port: p, payload: b.slice(o2 + l) };
};

function getConnectionOrder(proxyIPConfig) {
  const order = ['direct'];
  if (proxyIPConfig) order.push('proxy'); return order;
}

function handleConnection(ws, proxyIPConfig) {
  let socket, writer, reader, info;
  let isFirstMsg = true, bytesReceived = 0, stallCount = 0, reconnectCount = 0;
  let lastData = Date.now(); const timers = {}; const dataBuffer = [];
  const KEEPALIVE = 15000, STALL_TIMEOUT = 8000, MAX_STALL = 12, MAX_RECONNECT = 24;
  async function processHandshake(data) {
    const bytes = new Uint8Array(data);
    if (buildUUID(bytes, 1) !== AUTH_UUID) throw new Error('Auth failed');
    const { host, port, payload } = extractAddress(bytes);
    const connectionOrder = getConnectionOrder(proxyIPConfig);
    let sock, connectionSuccessful = false;
    for (const method of connectionOrder) {
      try {
        sock = connect(method === 'direct' ? { hostname: host, port } : { hostname: proxyIPConfig.address, port: proxyIPConfig.port });
        await sock.opened; connectionSuccessful = true; break;
      } catch { continue; }}
    if (!connectionSuccessful) throw new Error('All connection methods failed'); const w = sock.writable.getWriter();
    if (payload.length) await w.write(payload); return { socket: sock, writer: w, reader: sock.readable.getReader(), info: { host, port } };
  }
  async function readLoop() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (value?.length) {
          bytesReceived += value.length; lastData = Date.now();
          stallCount = reconnectCount = 0;
          if (ws.readyState === 1) {
            await ws.send(value);
            while (dataBuffer.length && ws.readyState === 1) { await ws.send(dataBuffer.shift()); }
          } else { dataBuffer.push(value); }}
        if (done) { ws.send('Stream ended gracefully'); await reconnect(); break;}}
    } catch (err) {
      if (err.message.includes('reset') || err.message.includes('broken')) {
        ws.send('Server closed connection, attempting reconnect'); await reconnect();
      } else { cleanup(); ws.close(1006, 'Connection abnormal'); }}
  }
  async function reconnect() {
    if (!info || ws.readyState !== 1 || reconnectCount >= MAX_RECONNECT) {
      cleanup(); ws.close(1011, 'Reconnection failed'); return;}
    reconnectCount++; ws.send(`Reconnecting (attempt ${reconnectCount})...`);
    try { cleanupSocket();
      await new Promise(resolve => setTimeout(resolve, 30 * Math.pow(2, reconnectCount) + Math.random() * 5));
      const connectionOrder = getConnectionOrder(proxyIPConfig); let sock, connectionSuccessful = false;
      for (const method of connectionOrder) {
        try {
          sock = connect(method === 'direct' ? { hostname: info.host, port: info.port } : { hostname: proxyIPConfig.address, port: proxyIPConfig.port });
          await sock.opened; connectionSuccessful = true; break;
        } catch { continue; }}
      if (!connectionSuccessful) throw new Error('All reconnect methods failed');
      socket = sock; writer = sock.writable.getWriter(); reader = sock.readable.getReader(); lastData = Date.now(); stallCount = 0; ws.send('Reconnected successfully');
      while (dataBuffer.length && ws.readyState === 1) { await writer.write(dataBuffer.shift()); } readLoop();
    } catch { setTimeout(reconnect, 1000); }
  }
  function startTimers() {
    timers.keepalive = setInterval(async () => {
      if (Date.now() - lastData > KEEPALIVE) {
        try {
          await writer.write(new Uint8Array(0)); lastData = Date.now();
        } catch { reconnect();}}}, KEEPALIVE / 3);
    timers.health = setInterval(() => {
      if (bytesReceived && Date.now() - lastData > STALL_TIMEOUT) {
        stallCount++; ws.send(`Stall detected (${stallCount}/${MAX_STALL}), ${Date.now() - lastData}ms since last data`);
        if (stallCount >= MAX_STALL) reconnect();}}, STALL_TIMEOUT / 2);
  }
  function cleanupSocket() {
    try { writer?.releaseLock(); reader?.releaseLock(); socket?.close(); } catch {}
  }
  function cleanup() {
    Object.values(timers).forEach(clearInterval); cleanupSocket();
  }
  ws.addEventListener('message', async evt => {
    try {
      if (isFirstMsg) {
        isFirstMsg = false;
        ({ socket, writer, reader, info } = await processHandshake(evt.data));
        startTimers(); readLoop();
      } else {
        lastData = Date.now();
        if (socket && writer) { await writer.write(evt.data);
        } else { dataBuffer.push(evt.data);}}
    } catch { cleanup(); ws.close(1006, 'Connection abnormal'); }
  }); ws.addEventListener('close', cleanup); ws.addEventListener('error', cleanup);
}