// ============================================
// Cloudflare Workers 版本 (已优化)
// 部署方式: wrangler deploy worker.js
// ============================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const workerUrl = `${url.protocol}//${url.host}`; // 获取worker的基础URL

    // API 端点：检查链接状态
    if (url.pathname === '/api/check-link') {
      // 1. 从环境变量获取订阅链接
      const subscriptionUrl = env.SUBSCRIPTION_URL; 
      
      if (!subscriptionUrl) {
        return new Response(JSON.stringify({ active: false, error: 'Subscription URL not configured' }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      
      try {
        const response = await fetch(subscriptionUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });
        
        const isActive = response.ok || (response.status >= 200 && response.status < 400);
        
        return new Response(JSON.stringify({ 
          active: isActive,
          status: response.status
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          active: false,
          error: error.message
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // 2. 新增 API 端点：获取订阅链接 (防爬)
    if (url.pathname === '/api/get-link') {
      // 3. 简单的 Referer 检查，防止API被盗用
      const referer = request.headers.get('Referer');
      if (!referer || !referer.startsWith(workerUrl)) {
        return new Response(JSON.stringify({ error: 'Access Denied' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const subscriptionUrl = env.SUBSCRIPTION_URL;
      
      if (!subscriptionUrl) {
        return new Response(JSON.stringify({ error: 'Subscription URL not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      
      // 4. 将链接在JSON中返回给前端
      return new Response(JSON.stringify({ link: subscriptionUrl }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    // 返回 HTML 页面
    return new Response(getHTML(), {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
      },
    });
  },
};

// HTML 内容保持不变，但我们会修改其中的 <script> 部分
function getHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hello Snippets!</title>
    <style>
        /* CSS 样式部分保持不变... (此处省略) */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .card {
            background: #f5f5f5;
            border-radius: 20px;
            padding: 50px 40px;
            width: 100%;
            max-width: 420px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center;
        }

        .icon {
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 16px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0 auto 30px;
            box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
        }

        .icon svg {
            width: 36px;
            height: 36px;
            fill: white;
        }

        h1 {
            font-size: 32px;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 30px;
        }

        .status {
            color: white;
            padding: 10px 24px;
            border-radius: 25px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 20px;
            transition: all 0.3s ease;
        }

        .status.active {
            background: #10b981;
        }

        .status.inactive {
            background: #ef4444;
        }

        .status.checking {
            background: #f59e0b;
        }

        .status::before {
            font-size: 16px;
            font-weight: bold;
        }

        .status.active::before {
            content: "✓";
        }

        .status.inactive::before {
            content: "✗";
        }

        .status.checking::before {
            content: "⟳";
            animation: rotate 1s linear infinite;
        }

        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .description {
            color: #718096;
            font-size: 14px;
            margin-bottom: 30px;
            line-height: 1.6;
        }

        .button {
            width: 100%;
            padding: 16px 24px;
            border: none;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-bottom: 12px;
            text-decoration: none;
            color: white;
        }

        .button-purple {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .button-purple:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(102, 126, 234, 0.4);
        }

        .button-cyan {
            background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
        }

        .button-cyan:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(8, 145, 178, 0.4);
        }

        .button::before {
            font-size: 18px;
        }

        .button-purple::before {
            content: "📄";
        }

        .button-cyan::before {
            content: "✈";
        }

        .footer {
            margin-top: 40px;
            color: #a0aec0;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
            </svg>
        </div>
        
        <h1>Hello Snippets!</h1>
        
        <div id="statusBadge" class="status checking">正在检测...</div>
        
        <p class="description">
            您的代理服务正在正常运行,享受安全、快速的网络连接体验
        </p>
        
        <a href="#" class="button button-purple" onclick="copySubscriptionLink(this); return false;">
            烈火公益订阅链接（点击复制）
        </a>
        
        <a href="https://t.me/zyssadmin" target="_blank" class="button button-cyan">
            加入天诚交流群组
        </a>
        
        <div class="footer">
            Powered by Cloudflare Workers
        </div>
    </div>

    <script>
        async function checkLinkStatus() {
            const statusBadge = document.getElementById('statusBadge');
            
            try {
                const response = await fetch('/api/check-link');
                const data = await response.json();
                
                if (data.active) {
                    statusBadge.className = 'status active';
                    statusBadge.textContent = '代理功能已启用';
                } else {
                    statusBadge.className = 'status inactive';
                    statusBadge.textContent = '代理功能已失效';
                }
            } catch (error) {
                console.error('检测失败:', error);
                statusBadge.className = 'status inactive';
                statusBadge.textContent = '代理功能已失效';
            }
        }

        // 7. 修改点：重写了复制功能
        async function copySubscriptionLink(buttonElement) {
            // 添加一个 "正在加载" 的视觉反馈
            const originalText = buttonElement.innerHTML;
            buttonElement.innerHTML = '正在获取链接...';
            buttonElement.disabled = true;

            try {
                // 8. 从新的 API 端点获取链接
                const response = await fetch('/api/get-link');
                if (!response.ok) {
                    throw new Error(`获取链接失败: ${response.statusText}`);
                }
                
                const data = await response.json();
                const linkToCopy = data.link;

                if (!linkToCopy) {
                    throw new Error('未返回有效链接');
                }

                // 9. 复制到剪贴板
                await navigator.clipboard.writeText(linkToCopy);
                alert('订阅链接已复制到剪贴板！');

            } catch (err) {
                console.error('复制失败:', err);
                alert('复制失败，请稍后重试或联系管理员');
            } finally {
                // 恢复按钮状态
                buttonElement.innerHTML = originalText;
                buttonElement.disabled = false;
            }
        }

        // 保持不变
        window.addEventListener('DOMContentLoaded', checkLinkStatus);
    </script>
</body>
</html>`;
}