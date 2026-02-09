{\rtf1\ansi\ansicpg936\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 import \{ connect \} from 'cloudflare:sockets';\
\
// --- 1. \uc0\u24744 \u30340 \u20010 \u20154 \u37197 \u32622  ---\
let proxyIP = '13.230.34.30'; // \uc0\u22312 \u27492 \u35774 \u32622 \u24744 \u30340 \u40664 \u35748  proxyIP\
let yourUUID = '93bf61d9-3796-44c2-9b3a-49210ece2585'; // \uc0\u22312 \u27492 \u35774 \u32622 \u24744 \u30340  UUID\
\
// --- 2. \uc0\u21160 \u24577 \u35746 \u38405 \u21015 \u34920 \u37197 \u32622  (\u20351 \u29992 \u24744 \u25552 \u20379 \u30340  Gist \u38142 \u25509 ) ---\
const cfipListUrl = 'Gist \uc0\u38142 \u25509 ';\
\
\
// --- 3. \uc0\u36741 \u21161 \u20989 \u25968  (\u31934 \u31616 \u29256 ) ---\
function formatIdentifier(arr, offset = 0) \{\
    const hex = [...arr.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join('');\
    return `$\{hex.substring(0,8)\}-$\{hex.substring(8,12)\}-$\{hex.substring(12,16)\}-$\{hex.substring(16,20)\}-$\{hex.substring(20)\}`;\
\}\
\
function base64ToArray(b64Str) \{\
    if (!b64Str) return \{ error: null \};\
    try \{\
        const binaryString = atob(b64Str.replace(/-/g, '+').replace(/_/g, '/'));\
        const bytes = new Uint8Array(binaryString.length);\
        for (let i = 0; i < binaryString.length; i++) \{\
            bytes[i] = binaryString.charCodeAt(i);\
        \}\
        return \{ earlyData: bytes.buffer, error: null \};\
    \} catch (error) \{\
        return \{ error \};\
    \}\
\}\
\
function closeSocketQuietly(socket) \{\
    try \{\
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) \{\
            socket.close();\
        \}\
    \} catch (error) \{\}\
\}\
\
function isSpeedTestSite(hostname) \{\
    const speedTestDomains = ['speedtest.net','fast.com','speedtest.cn','speed.cloudflare.com','ovo.speedtestcustom.com'];\
    if (speedTestDomains.includes(hostname)) \{\
        return true;\
    \}\
    for (const domain of speedTestDomains) \{\
        if (hostname.endsWith('.' + domain) || hostname === domain) \{\
            return true;\
        \}\
    \}\
    return false;\
\}\
\
function parseProxyAddress(proxyStr) \{\
    if (!proxyStr) return null;\
    proxyStr = proxyStr.trim();\
    if (proxyStr.startsWith('socks://') || proxyStr.startsWith('socks5://')) \{\
        const urlStr = proxyStr.replace(/^socks:\\/\\//, 'socks5://');\
        try \{\
            const url = new URL(urlStr);\
            return \{\
                type: 'socks5',\
                host: url.hostname,\
                port: parseInt(url.port) || 1080,\
                username: url.username ? decodeURIComponent(url.username) : '',\
                password: url.password ? decodeURIComponent(url.password) : ''\
            \};\
        \} catch (e) \{\
            return null;\
        \}\
    \}\
\
    if (proxyStr.startsWith('http://') || proxyStr.startsWith('https://')) \{\
        try \{\
            const url = new URL(proxyStr);\
            return \{\
                type: 'http',\
                host: url.hostname,\
                port: parseInt(url.port) || (proxyStr.startsWith('https://') ? 443 : 80),\
                username: url.username ? decodeURIComponent(url.username) : '',\
                password: url.password ? decodeURIComponent(url.password) : ''\
            \};\
        \} catch (e) \{\
            return null;\
        \}\
    \}\
\
    if (proxyStr.startsWith('[')) \{\
        const closeBracket = proxyStr.indexOf(']');\
        if (closeBracket > 0) \{\
            const host = proxyStr.substring(1, closeBracket);\
            const rest = proxyStr.substring(closeBracket + 1);\
            if (rest.startsWith(':')) \{\
                const port = parseInt(rest.substring(1), 10);\
                if (!isNaN(port) && port > 0 && port <= 65535) \{\
                    return \{ type: 'direct', host, port \};\
                \}\
            \}\
            return \{ type: 'direct', host, port: 443 \};\
        \}\
    \}\
\
    const lastColonIndex = proxyStr.lastIndexOf(':');\
\
    if (lastColonIndex > 0) \{\
        const host = proxyStr.substring(0, lastColonIndex);\
        const portStr = proxyStr.substring(lastColonIndex + 1);\
        const port = parseInt(portStr, 10);\
\
        if (!isNaN(port) && port > 0 && port <= 65535) \{\
            return \{ type: 'direct', host, port \};\
        \}\
    \}\
\
    return \{ type: 'direct', host: proxyStr, port: 443 \};\
\}\
\
\
// --- 4. \uc0\u26680 \u24515 \u36335 \u30001 \u36923 \u36753  ---\
export default \{\
    async fetch(request, env, ctx) \{\
        try \{\
            const url = new URL(request.url);\
            const pathname = url.pathname;\
            \
            // 4.1. \uc0\u22788 \u29702  WebSocket \u20195 \u29702 \u35831 \u27714  (\u26680 \u24515 \u21151 \u33021 )\
            if (request.headers.get('Upgrade') === 'websocket') \{\
                let wsPathProxyIP = null;\
                if (pathname.startsWith('/proxyip=')) \{\
                    try \{\
                        wsPathProxyIP = decodeURIComponent(pathname.substring(9)).trim();\
                    \} catch (e) \{\}\
                \}\
                const customProxyIP = wsPathProxyIP || url.searchParams.get('proxyip') || request.headers.get('proxyip');\
                return await handleVlsRequest(request, customProxyIP, proxyIP, yourUUID);\
            \} \
            \
            // 4.2. \uc0\u22788 \u29702  GET \u35831 \u27714 \
            if (request.method === 'GET') \{\
                \
                // --- \uc0\u21160 \u24577 \u35746 \u38405 \u36923 \u36753  (\u26680 \u24515 \u21151 \u33021 ) ---\
                if (url.pathname.toLowerCase().includes(`/sub/$\{yourUUID\}`)) \{\
                    const currentDomain = url.hostname;\
                    let cfip; \
\
                    try \{\
                        const response = await fetch(cfipListUrl, \{\
                            method: 'GET',\
                            headers: \{ 'Accept': 'application/json' \},\
                            cf: \{ cacheTtl: 300 \} // 5\uc0\u20998 \u38047 \u32531 \u23384 \
                        \});\
\
                        if (!response.ok) \{\
                            throw new Error(`Failed to fetch cfip list: $\{response.status\} $\{response.statusText\}`);\
                        \}\
                        cfip = await response.json(); \
                        if (!Array.isArray(cfip)) \{\
                            throw new Error('Fetched cfip list is not a valid array');\
                        \}\
                    \} catch (error) \{\
                        console.error("Error fetching dynamic cfip list:", error.message);\
                        return new Response(`Error fetching node list: $\{error.message\}\\nCheck Gist URL: $\{cfipListUrl\}`, \{\
                            status: 500,\
                            headers: \{ 'Content-Type': 'text/plain; charset=utf-8' \},\
                        \});\
                    \}\
\
                    // --- \uc0\u29983 \u25104 \u35746 \u38405 \u20869 \u23481  ---\
                    const header = 'v' + 'l' + 'e' + 's' + 's';\
                    const nodeLinks = cfip.map(cdnItem => \{\
                        let host, port = 443, nodeName = '';\
                        if (cdnItem.includes('#')) \{\
                            const parts = cdnItem.split('#');\
                            cdnItem = parts[0];\
                            nodeName = parts[1];\
                        \}\
\
                        if (cdnItem.startsWith('[') && cdnItem.includes(']:')) \{\
                            const ipv6End = cdnItem.indexOf(']:');\
                            host = cdnItem.substring(0, ipv6End + 1);\
                            const portStr = cdnItem.substring(ipv6End + 2);\
                            port = parseInt(portStr) || 443;\
                        \} else if (cdnItem.includes(':')) \{\
                            const parts = cdnItem.split(':');\
                            host = parts[0];\
                            port = parseInt(parts[1]) || 443;\
                        \} else \{\
                            // ------------------- \
                            // **** BUG \uc0\u20462 \u22797  ****\
                            // -------------------\
                            host = cdnItem; // \uc0\u20462 \u27491 \u20102  cDnaItem -> cdnItem\
                        \}\
                        \
                        if (!nodeName) \{\
                            nodeName = `Snippets-Dynamic`;\
                        \}\
\
                        return `$\{header\}://$\{yourUUID\}@$\{host\}:$\{port\}?encryption=none&security=tls&sni=$\{currentDomain\}&fp=firefox&allowInsecure=1&type=ws&host=$\{currentDomain\}&path=%2F%3Fed%3D2560#$\{nodeName\}`;\
                    \});\
                    \
                    const linksText = nodeLinks.join('\\n');\
                    const base64Content = btoa(unescape(encodeURIComponent(linksText)));\
                    return new Response(base64Content, \{\
                        headers: \{\
                            'Content-Type': 'text/plain; charset=utf-8',\
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',\
                        \},\
                    \});\
                \}\
                \
                // 4.3. \uc0\u20854 \u20182 \u25152 \u26377  GET \u35831 \u27714  (\u22914  / \u25110  /$\{yourUUID\}) \u22343 \u36820 \u22238 \u31616 \u21333 \u20449 \u24687 \
                // (\uc0\u24050 \u31227 \u38500 \u26292 \u38706  UUID \u30340 \u25991 \u26412 )\
                return new Response(`OK`, \{\
                    status: 200,\
                    headers: \{ 'Content-Type': 'text/plain; charset=utf-8' \}\
                \});\
            \}\
            \
            // 4.4. \uc0\u20854 \u20182 \u25152 \u26377 \u35831 \u27714  (\u22914  POST, PUT\u31561 )\
            return new Response('Not Found', \{ status: 404 \});\
            \
        \} catch (err) \{\
            console.error(err.stack);\
            return new Response(err.stack || 'Internal Server Error', \{ status: 500 \});\
        \}\
    \},\
\};\
\
// --- 5. \uc0\u26680 \u24515  VLESS \u22788 \u29702 \u36923 \u36753  ---\
async function handleVlsRequest(request, customProxyIP, defaultProxyIP, yourUUID) \{\
    const wsPair = new WebSocketPair();\
    const [clientSock, serverSock] = Object.values(wsPair);\
    serverSock.accept();\
    let remoteConnWrapper = \{ socket: null \};\
    let isDnsQuery = false;\
    const earlyData = request.headers.get('sec-websocket-protocol') || '';\
    const readable = makeReadableStream(serverSock, earlyData);\
    readable.pipeTo(new WritableStream(\{\
        async write(chunk) \{\
            if (isDnsQuery) return await forwardUDP(chunk, serverSock, null);\
            if (remoteConnWrapper.socket) \{\
                const writer = remoteConnWrapper.socket.writable.getWriter();\
                await writer.write(chunk);\
                writer.releaseLock();\
                return;\
            \}\
            \
            const \{ hasError, message, addressType, port, hostname, rawIndex, version, isUDP \} = parseWsPacketHeader(chunk, yourUUID);\
            if (hasError) throw new Error(message);\
\
            if (isSpeedTestSite(hostname)) \{\
                throw new Error('Speedtest site is blocked');\
            \}\
            \
            if (isUDP) \{\
                if (port === 53) isDnsQuery = true;\
                else throw new Error('UDP is not supported');\
            \}\
            const respHeader = new Uint8Array([version[0], 0]);\
            const rawData = chunk.slice(rawIndex);\
            if (isDnsQuery) return forwardUDP(rawData, serverSock, respHeader);\
            \
            await forwardTCP(addressType, hostname, port, rawData, serverSock, respHeader, remoteConnWrapper, customProxyIP, defaultProxyIP);\
        \},\
        close() \{\
            closeSocketQuietly(serverSock);\
            if (remoteConnWrapper.socket) \{\
                closeSocketQuietly(remoteConnWrapper.socket);\
            \}\
        \},\
        abort(reason) \{\
            closeSocketQuietly(serverSock);\
            if (remoteConnWrapper.socket) \{\
                closeSocketQuietly(remoteConnWrapper.socket);\
            \}\
        \}\
    \})).catch((err) => \{\
        closeSocketQuietly(serverSock);\
        if (remoteConnWrapper.socket) \{\
            closeSocketQuietly(remoteConnWrapper.socket);\
        \}\
    \});\
\
    return new Response(null, \{ status: 101, webSocket: clientSock \});\
\}\
\
// --- 6. SOCKS5 \uc0\u21644  HTTP \u20195 \u29702 \u36830 \u25509  ---\
async function connect2Socks5(proxyConfig, targetHost, targetPort, initialData) \{\
    const \{ host, port, username, password \} = proxyConfig;\
    let socket;\
    try \{\
        socket = connect(\{ hostname: host, port: port \});\
        const writer = socket.writable.getWriter();\
        const reader = socket.readable.getReader();\
        \
        try \{\
            const authMethods = username && password ?\
                new Uint8Array([0x05, 0x02, 0x00, 0x02]) : // with auth\
                new Uint8Array([0x05, 0x01, 0x00]); // no auth\
            \
            await writer.write(authMethods);\
            const methodResponse = await reader.read();\
            if (methodResponse.done || methodResponse.value.byteLength < 2) \{\
                throw new Error('S5 method selection failed');\
            \}\
            \
            const selectedMethod = new Uint8Array(methodResponse.value)[1];\
            if (selectedMethod === 0x02) \{ // Username/Password\
                if (!username || !password) \{\
                    throw new Error('S5 requires authentication, but no credentials provided');\
                \}\
                \
                const userBytes = new TextEncoder().encode(username);\
                const passBytes = new TextEncoder().encode(password);\
                const authPacket = new Uint8Array(3 + userBytes.length + passBytes.length);\
                authPacket[0] = 0x01; // auth version\
                authPacket[1] = userBytes.length;\
                authPacket.set(userBytes, 2);\
                authPacket[2 + userBytes.length] = passBytes.length;\
                authPacket.set(passBytes, 3 + userBytes.length);\
                await writer.write(authPacket);\
                const authResponse = await reader.read();\
                if (authResponse.done || new Uint8Array(authResponse.value)[1] !== 0x00) \{\
                    throw new Error('S5 authentication failed');\
                \}\
            \} else if (selectedMethod !== 0x00) \{ // No auth\
                throw new Error(`S5 unsupported auth method: $\{selectedMethod\}`);\
            \}\
            \
            // Send connection request\
            const hostBytes = new TextEncoder().encode(targetHost);\
            const connectPacket = new Uint8Array(7 + hostBytes.length);\
            connectPacket[0] = 0x05; // SOCKS version\
            connectPacket[1] = 0x01; // CONNECT\
            connectPacket[2] = 0x00; // RSV\
            connectPacket[3] = 0x03; // Address type: Domain\
            connectPacket[4] = hostBytes.length;\
            connectPacket.set(hostBytes, 5);\
            new DataView(connectPacket.buffer).setUint16(5 + hostBytes.length, targetPort, false); // Port\
            await writer.write(connectPacket);\
            const connectResponse = await reader.read();\
            if (connectResponse.done || new Uint8Array(connectResponse.value)[1] !== 0x00) \{\
                throw new Error('S5 connection failed');\
            \}\
            \
            await writer.write(initialData);\
            writer.releaseLock();\
            reader.releaseLock();\
            return socket;\
        \} catch (error) \{\
            writer.releaseLock();\
            reader.releaseLock();\
            throw error;\
        \}\
    \} catch (error) \{\
        if (socket) \{\
            try \{\
                socket.close();\
            \} catch (e) \{\}\
        \}\
        throw error;\
    \}\
\}\
\
async function connect2Http(proxyConfig, targetHost, targetPort, initialData) \{\
    const \{ host, port, username, password \} = proxyConfig;\
    let socket;\
    try \{\
        socket = connect(\{ hostname: host, port: port \});\
        const writer = socket.writable.getWriter();\
        const reader = socket.readable.getReader();\
        try \{\
            let connectRequest = `CONNECT $\{targetHost\}:$\{targetPort\} HTTP/1.1\\r\\n`;\
            connectRequest += `Host: $\{targetHost\}:$\{targetPort\}\\r\\n`;\
            \
            if (username && password) \{\
                const auth = btoa(`$\{username\}:$\{password\}`);\
                connectRequest += `Proxy-Authorization: Basic $\{auth\}\\r\\n`;\
            \}\
            \
            connectRequest += `User-Agent: Mozilla/5.0\\r\\n`;\
            connectRequest += `Connection: keep-alive\\r\\n`;\
            connectRequest += '\\r\\n';\
            await writer.write(new TextEncoder().encode(connectRequest));\
            let responseBuffer = new Uint8Array(0);\
            let headerEndIndex = -1;\
            let bytesRead = 0;\
            const maxHeaderSize = 8192;\
            const startTime = Date.now();\
            const timeoutMs = 10000;\
            \
            while (headerEndIndex === -1 && bytesRead < maxHeaderSize) \{\
                if (Date.now() - startTime > timeoutMs) \{\
                    throw new Error('HTTP proxy connection timeout');\
                \}\
                \
                const \{ done, value \} = await reader.read();\
                if (done) \{\
                    throw new Error('Connection closed before receiving HTTP response');\
                \}\
                \
                const newBuffer = new Uint8Array(responseBuffer.length + value.length);\
                newBuffer.set(responseBuffer);\
                newBuffer.set(value, responseBuffer.length);\
                responseBuffer = newBuffer;\
                bytesRead = responseBuffer.length;\
                \
                for (let i = 0; i < responseBuffer.length - 3; i++) \{\
                    if (responseBuffer[i] === 0x0d && responseBuffer[i + 1] === 0x0a &&\
                        responseBuffer[i + 2] === 0x0d && responseBuffer[i + 3] === 0x0a) \{\
                        headerEndIndex = i + 4;\
                        break;\
                    \}\
                \}\
            \}\
            \
            if (headerEndIndex === -1) \{\
                throw new Error('Invalid HTTP response or response too large');\
            \}\
            \
            const headerText = new TextDecoder().decode(responseBuffer.slice(0, headerEndIndex));\
            const statusLine = headerText.split('\\r\\n')[0];\
            const statusMatch = statusLine.match(/HTTP\\/\\d\\.\\d\\s+(\\d+)/);\
            \
            if (!statusMatch) \{\
                throw new Error(`Invalid response: $\{statusLine\}`);\
            \}\
            \
            const statusCode = parseInt(statusMatch[1]);\
            if (statusCode < 200 || statusCode >= 300) \{\
                throw new Error(`Connection failed with status $\{statusCode\}: $\{statusLine\}`);\
            \}\
        \
            await writer.write(initialData);\
            writer.releaseLock();\
            reader.releaseLock();\
            \
            return socket;\
        \} catch (error) \{\
            try \{ writer.releaseLock(); \} catch (e) \{\}\
            try \{ reader.releaseLock(); \} catch (e) \{\}\
            throw error;\
        \}\
    \} catch (error) \{\
        if (socket) \{\
            try \{\
                socket.close();\
            \} catch (e) \{\}\
        \}\
        throw error;\
    \}\
\}\
\
// --- 7. \uc0\u26680 \u24515  TCP \u36716 \u21457 \u36923 \u36753  ---\
async function forwardTCP(addrType, host, portNum, rawData, ws, respHeader, remoteConnWrapper, customProxyIP, defaultProxyIP) \{\
    async function connectDirect(address, port, data) \{\
        const remoteSock = connect(\{ hostname: address, port: port \});\
        const writer = remoteSock.writable.getWriter();\
        await writer.write(data);\
        writer.releaseLock();\
        return remoteSock;\
    \}\
    \
    let proxyConfig = null;\
    let shouldUseProxy = false;\
    const effectiveProxyIP = customProxyIP || defaultProxyIP;\
    \
    if (effectiveProxyIP) \{\
        proxyConfig = parseProxyAddress(effectiveProxyIP);\
        if (!proxyConfig) \{\
            console.error(`Failed to parse proxy address: $\{effectiveProxyIP\}. Falling back to default.`);\
            proxyConfig = parseProxyAddress(defaultProxyIP) || \{ type: 'direct', host: defaultProxyIP, port: 443 \};\
        \}\
    \} else \{\
        proxyConfig = \{ type: 'direct', host: '1.1.1.1', port: 443 \};\
    \}\
\
    if (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https') \{\
        shouldUseProxy = true;\
    \}\
    \
    async function connectWithProxy() \{\
        let newSocket;\
        if (proxyConfig.type === 'socks5') \{\
            newSocket = await connect2Socks5(proxyConfig, host, portNum, rawData);\
        \} else if (proxyConfig.type === 'http' || proxyConfig.type === 'httpsClick') \{\
            newSocket = await connect2Http(proxyConfig, host, portNum, rawData);\
        \} else \{\
            newSocket = await connectDirect(proxyConfig.host, proxyConfig.port, rawData);\
        \}\
        \
        remoteConnWrapper.socket = newSocket;\
        newSocket.closed.catch(() => \{\}).finally(() => closeSocketQuietly(ws));\
        connectStreams(newSocket, ws, respHeader, null);\
    \}\
    \
    if (shouldUseProxy) \{\
        try \{\
            await connectWithProxy();\
        \} catch (err) \{\
            console.error(`connectWithProxy (SOCKS/HTTP) error: $\{err.message\}`);\
            throw err;\
        \}\
    \} else \{\
        try \{\
            const initialSocket = await connectDirect(host, portNum, rawData);\
            remoteConnWrapper.socket = initialSocket;\
            connectStreams(initialSocket, ws, respHeader, connectWithProxy); \
        \} catch (err) \{\
            console.error(`connectDirect failed: $\{err.message\}. Retrying with proxy...`);\
            await connectWithProxy();\
        \}\
    \}\
\}\
\
// --- 8. \uc0\u21097 \u20313 \u30340 \u36741 \u21161 \u20989 \u25968  ---\
function parseWsPacketHeader(chunk, token) \{\
    if (chunk.byteLength < 24) return \{ hasError: true, message: 'Invalid data' \};\
    const version = new Uint8Array(chunk.slice(0, 1));\
    if (formatIdentifier(new Uint8Array(chunk.slice(1, 17))) !== token) return \{ hasError: true, message: 'Invalid uuid' \};\
    const optLen = new Uint8Array(chunk.slice(17, 18))[0];\
    const cmd = new Uint8Array(chunk.slice(18 + optLen, 19 + optLen))[0];\
    let isUDP = false;\
    if (cmd === 1) \{\} else if (cmd === 2) \{ isUDP = true; \} else \{ return \{ hasError: true, message: 'Invalid cmd' \}; \}\
    const portIdx = 19 + optLen;\
    const port = new DataView(chunk.slice(portIdx, portIdx + 2)).getUint16(0);\
    let addrIdx = portIdx + 2, addrLen = 0, addrValIdx = addrIdx + 1, hostname = '';\
    const addressType = new Uint8Array(chunk.slice(addrIdx, addrValIdx))[0];\
    switch (addressType) \{\
        case 1: // IPv4\
            addrLen = 4;\
            hostname = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + addrLen)).join('.');\
            break;\
        case 2: // Domain\
            addrLen = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + 1))[0];\
            addrValIdx += 1;\
            hostname = new TextDecoder().decode(chunk.slice(addrValIdx, addrValIdx + addrLen));\
            break;\
        case 3: // IPv6\
            addrLen = 16;\
            const ipv6 = [];\
            const ipv6View = new DataView(chunk.slice(addrValIdx, addrValIdx + addrLen));\
            for (let i = 0; i < 8; i++) ipv6.push(ipv6View.getUint16(i * 2).toString(16));\
            hostname = ipv6.join(':');\
            break;\
        default:\
            return \{ hasError: true, message: `Invalid address type: $\{addressType\}` \};\
    \}\
    if (!hostname) return \{ hasError: true, message: `Invalid address: $\{addressType\}` \};\
    return \{ hasError: false, addressType, port, hostname, isUDP, rawIndex: addrValIdx + addrLen, version \};\
\}\
\
function makeReadableStream(socket, earlyDataHeader) \{\
    let cancelled = false;\
    return new ReadableStream(\{\
        start(controller) \{\
            socket.addEventListener('message', (event) => \{\
                if (!cancelled) controller.enqueue(event.data);\
            \});\
            socket.addEventListener('close', () => \{\
                if (!cancelled) \{\
                    closeSocketQuietly(socket);\
                    controller.close();\
                \}\
            \});\
            socket.addEventListener('error', (err) => controller.error(err));\
            const \{ earlyData, error \} = base64ToArray(earlyDataHeader);\
            if (error) controller.error(error);\
            else if (earlyData) controller.enqueue(earlyData);\
        \},\
        cancel() \{\
            cancelled = true;\
            closeSocketQuietly(socket);\
        \}\
    \});\
\}\
\
async function connectStreams(remoteSocket, webSocket, headerData, retryFunc) \{\
    let header = headerData, hasData = false;\
    await remoteSocket.readable.pipeTo(\
        new WritableStream(\{\
            async write(chunk, controller) \{\
                hasData = true;\
                if (webSocket.readyState !== WebSocket.OPEN) controller.error('ws.readyState is not open');\
                if (header) \{\
                    const response = new Uint8Array(header.length + chunk.byteLength);\
                    response.set(header, 0);\
                    response.set(chunk, header.length);\
                    webSocket.send(response.buffer);\
                    header = null;\
                \} else \{\
                    webSocket.send(chunk);\
                \}\
            \},\
            abort() \{\},\
        \})\
    ).catch((err) => \{\
        closeSocketQuietly(webSocket);\
    \});\
    if (!hasData && retryFunc) \{\
        console.log('No data received on direct connection, retrying with proxy...');\
        await retryFunc();\
    \}\
\}\
\
async function forwardUDP(udpChunk, webSocket, respHeader) \{\
    try \{\
        const tcpSocket = connect(\{ hostname: '8.8.4.4', port: 53 \}); // \uc0\u20351 \u29992  TCP \u36716 \u21457  DNS \u26597 \u35810 \
        let vlessHeader = respHeader;\
        const writer = tcpSocket.writable.getWriter();\
        await writer.write(udpChunk);\
        writer.releaseLock();\
        await tcpSocket.readable.pipeTo(new WritableStream(\{\
            async write(chunk) \{\
                if (webSocket.readyState === WebSocket.OPEN) \{\
                    if (vlessHeader) \{\
                        const response = new Uint8Array(vlessHeader.length + chunk.byteLength);\
                        response.set(vlessHeader, 0);\
                        response.set(chunk, vlessHeader.length);\
                        webSocket.send(response.buffer);\
                        vlessHeader = null;\
                    \} else \{\
                        webSocket.send(chunk);\
                    \}\
                \}\
            \},\
        \}));\
    \} catch (error) \{\}\
\}}