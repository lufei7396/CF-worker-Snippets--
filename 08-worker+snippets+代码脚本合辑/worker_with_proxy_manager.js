/**
 *
 * @param {any} remoteSocket 
 * @param {string} addressRemote 
 * @param {number} portRemote 
 * @param {Uint8Array} rawClientData 
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket
 * @param {Uint8Array} VLResponseHeader 
 * @param {function} log 
 * @param {string | null} customProxyIP  <-- 新增参数
 * @returns {Promise<void>}
 */
async function handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, VLResponseHeader, log, customProxyIP) {
	
    /**
     * 内部函数：连接到指定地址并写入初始数据
     */
    async function connectAndWrite(address, port) {
		try {
			/** @type {import("@cloudflare/workers-types").Socket} */
			const tcpSocket = connect({
				hostname: address,
				port: port,
			});
			remoteSocket.value = tcpSocket;
			
			const writer = tcpSocket.writable.getWriter();
			await writer.write(rawClientData); 
			writer.releaseLock();
			return tcpSocket;
		} catch (connectError) {
            log(`connectAndWrite failed: ${address}:${port}, Error: ${connectError.message}`);
			throw connectError;
		}
	}

    // 解析自定义 proxyip
    const proxyConfig = customProxyIP ? parseProxyURL(customProxyIP) : null;

    // 路径 1: 如果是 SOCKS5 或 HTTP 代理，则直接使用它连接
    if (proxyConfig && (proxyConfig.type === 'socks5' || proxyConfig.type === 'http')) {
        log(`Connecting via custom proxy: ${proxyConfig.type}://${proxyConfig.host}:${proxyConfig.port}`);
        try {
            let tcpSocket;
            if (proxyConfig.type === 'socks5') {
                tcpSocket = await connectViaSocks5(proxyConfig, addressRemote, portRemote, rawClientData);
            } else { // http
                tcpSocket = await connectViaHttp(proxyConfig, addressRemote, portRemote, rawClientData);
            }
            remoteSocket.value = tcpSocket;
            // 成功后，将远程套接字流式传输到 WebSocket (无重试)
            remoteSocketToWS(tcpSocket, webSocket, VLResponseHeader, null, log);
        } catch (proxyError) {
            log(`Custom proxy connection failed: ${proxyError.message}`);
            safeCloseWebSocket(webSocket);
        }
        return; // SOCKS/HTTP 路径结束
    }

    // 路径 2: (没有 SOCKS/HTTP 代理) 
    // 定义一个 failover 函数。它将使用自定义的 'direct' 代理或默认的 serverPool
    async function retryFailover() {
        log('Direct connection failed, retrying with failover...');
        try {
            let tcpSocket;
            
            if (proxyConfig && proxyConfig.type === 'direct') {
                // 路径 2a: 使用自定义的 'direct' 代理 (例如 "1.2.3.4:8080")
                log(`Using custom failover IP: ${proxyConfig.host}:${proxyConfig.port}`);
                const resolvedHostname = await resolveHostname(proxyConfig.host);
                tcpSocket = await connect({ hostname: resolvedHostname, port: proxyConfig.port });
            
            } else {
                // 路径 2b: 使用默认的 serverPool (原始逻辑)
                log('Using default server pool for failover.');
                const { socket } = await connectWithFailover(); 
                tcpSocket = socket;
            }

            // failover 成功后...
            remoteSocket.value = tcpSocket;
            
            // 必须在新的套接字上重新写入初始数据
            const writer = tcpSocket.writable.getWriter();
            await writer.write(rawClientData);
            writer.releaseLock();

            // 监听套接字关闭
            tcpSocket.closed.catch(error => {
                safeCloseWebSocket(webSocket);
            }).finally(() => {
                safeCloseWebSocket(webSocket);
            });
            
            // 将远程套接字流式传输到 WebSocket (无更多重试)
            remoteSocketToWS(tcpSocket, webSocket, VLResponseHeader, null, log);

        } catch (retryError) {
            log(`All failover connections failed: ${retryError.message}`);
            safeCloseWebSocket(webSocket);
        }
    }

    // 路径 2 (续): 首先尝试直连到 *目标地址*
    try {
        log(`Attempting direct connection to ${addressRemote}:${portRemote}`);
        const tcpSocket = await connectAndWrite(addressRemote, portRemote);
        
        // 直连成功，将远程套接字流式传输到 WS，并传入 failover 函数
        remoteSocketToWS(tcpSocket, webSocket, VLResponseHeader, retryFailover, log);
        
    } catch (connectError) {
        log(`Direct connection error: ${connectError.message}`);
        // 直连失败，触发 failover 逻辑
        await retryFailover();
    }
}