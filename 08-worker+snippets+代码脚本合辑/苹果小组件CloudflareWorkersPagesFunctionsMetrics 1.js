// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: cloud;

// 自定义一些文案
// https://www.namecheap.com/visual/font-generator/fancy
let title = '𝗖𝗹𝗼𝘂𝗱𝗳𝗹𝗮𝗿𝗲'
let workersLabel = '𝗪𝗼𝗿𝗸𝗲𝗿𝘀'
let pagesLabel = '𝗣𝗮𝗴𝗲𝘀'
let remainingLabel = '𝗥𝗲𝗺𝗮𝗶𝗻𝗶𝗻𝗴'
// 总量(免费账号为 100,000)
let total = 100000
// 如果知道就填上 不知道就会自动取 懒得做缓存了
let accountId = ''
// 默认取第几项账号
const accountIndex = 0
// 账号
const email = 'ppp@fangys.dpdns.org'
// API Key
// https://dash.cloudflare.com/profile/api-tokens 里生成 Global API Key
const key = 'e4e975daa7affb30fe397c0a503c5fe6328c8'
// 数字是否居中
const isNumberCenter = false
// 下方格子数 自己根据机型尺寸调整
const boxsCount = 16
// 下方格子是否为正方形
const isSquare = false

const now = new Date()
now.setUTCHours(0, 0, 0, 0)
const startDate = now.toISOString()
const endDate = new Date().toISOString()

const logoIcon = 'data:image/png;base64,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'
const pageIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAuIwAALiMBeKU/dgAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAQwSURBVGiB7ZlPaFxVFMZ/Z9pJShLbTqku1J0pGFs0WlshKFZwpQtxYaGZMVpsmwqtf8C/BTFVEFFRGsWqKUbNvCQNceHCjbioSqMWRkpqQGmhC4sLUYJto21m5h0XGevw8v7cd+cmVuy3erz73fOd771733n3XriE/zF0jBXqsU+HuMl17IzrgLEo8wrwCBlK6vGFy9CLZkSH2ARsr7vV6jL+ohjRd2khwwAgdbdLLjUW54208SLQHrjr1MjSuEYtshxhjVXkKj9IDzPqsRF4NIRRAtBhrkfJJsZTjkuB01HNEtWgg6ykic+ADclZz8NRzrKRHEKFEsq6QPssOZYDMM1ZEh7ohZgV7pQH+C2sMXpoNfM+dibKwFbppUyZPSEmAKbkLs4zTQdmJgA6yTIQ1RgXJFd3PQPMGskpb0qBozpKB1WeiWCVatx2hOmEiE3884XLRZFMn8YuyfOBIRftI0OFAwjN4YQ5I1JgHBiPjeXxIDCYpGlqBB1mLcpBoB/hR3z2k2FPbaL2oeyQAocBaOdxhK7IYMJ3prqmMDYC3AisRbkNYRVCBz63IFwGXAd0Aod1lGuo8kJMnDKzTDaSdBjMjWzBw+Mk55mkwjnamGAV3/ITS2jhIM1MqCIMMwC0xESakq2cazjzAIyNiKBQGzpz+LLu+isAHaYXuCMhlNNC+DecVXYd4UqUlw2oF7cRfN4GVhowL14jWqQbuMeAWiHLMReaQTRsRIdZjfCGEVmYks382ahmGNJ8fsPh049whSF7tXqMJXCmOc7D0oefJo2GjOgId+OzxbwDVwH3JfLamQA+TJOL9dDSMVbg845t/1gIz6tG/5mHwX6OVHgVuNq6fzw+rtUtY1gZ0SE2oWyz6WuAk1TpS9sptZGI9bcrKLBDephJ2zH9Gwlff7uB8p7k+dymayojtQl4r42QAU7RxNO2nVMZEUFR9tqKJWCXbOZ3287p68gJhlhDFzHLTgCErlrdSIYyIgU+SZ1LHVIbqVXc3iSeekyCkZFf8XksbR5BLMgGnQ6yDLjWkL5bevilUc2F2WnM0glGm26fSp5RF5ILtWW63oBzGtjpSnBhjIiBEeUJKXDKleS/80aEQ+Q54FLQuZHaRO+IofxBle1pfwqT4P6NLOMG4ia68JzczwnXsu6NaOywOsJS9jnXxLwgvqUer8cy5rZMx4meH7NUeUjyVLXIXoTdhtpNJqQ4I/W75K0knfnJheESZeQl6eF79egEnsWkzsTnFJCPQMqDngo52mpSZ5if5DGy3Mzl+PzMN5jVmSBiD3piF0fGR29CWbqZ1CIbEI4EWn2EW6Wbr/UjWlli/OsSSMby6M1Kq8hOhP2B269Jnidd6oTB7VdrfkW3Wn/bwPXnt96I9frbBq6NnKm7HrBdf9vAqRHJczs+64F+sjzlMvYl/NfwF38bF3/OBysWAAAAAElFTkSuQmCC'
const workerIcon = 'data:image/png;base64,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'

if (!accountId) {
  accountId = await getAccountId()
}

const { pagesSum = 0, workersSum = 0 } = await getSum()



let widget = new ListWidget()
const top_stack = widget.addStack();
top_stack.topAlignContent();
const container = top_stack.addStack();
container.layoutVertically();
const title_info = container.addStack();
title_info.layoutHorizontally();
title_info.centerAlignContent();
let req = new Request(logoIcon)
let logo = await req.loadImage()
const fuelpumpIcon = title_info.addImage(logo);
fuelpumpIcon.imageSize = scaleImage(fuelpumpIcon.image.size, 14);
title_info.addSpacer(4)
const t = title_info.addText(title)
t.font = Font.boldSystemFont(20);
t.textColor = Color.dynamic(Color.black(), Color.white())

widget.addSpacer(8)

const metricStack = widget.addStack()
metricStack.layoutHorizontally()

const pageContainer = metricStack.addStack()
pageContainer.layoutVertically()
const titleContainer = pageContainer.addStack()
titleContainer.layoutHorizontally()
titleContainer.centerAlignContent()
let pageIconReq = new Request(pageIcon)
let pageIconLoader = await pageIconReq.loadImage()
const pageLogo = titleContainer.addImage(pageIconLoader);
pageLogo.imageSize = scaleImage(pageLogo.image.size, 10);
titleContainer.addSpacer(2)
const titleLabel = titleContainer.addText(pagesLabel)
titleLabel.font = Font.systemFont(13)
titleLabel.textColor = Color.gray()
pageContainer.addSpacer(3)
const valueLabel = pageContainer.addText(centerNumber(formatNumber(pagesSum),8));
valueLabel.font = Font.boldRoundedSystemFont(15)

metricStack.addSpacer(20)

const workerContainer = metricStack.addStack()
workerContainer.layoutVertically()

const workerTitleContainer = workerContainer.addStack()
workerTitleContainer.layoutHorizontally()
workerTitleContainer.centerAlignContent()
let workerIconReq = new Request(workerIcon)
let workerIconLoader = await workerIconReq.loadImage()
const workerLogo = workerTitleContainer.addImage(workerIconLoader);
workerLogo.imageSize = scaleImage(workerLogo.image.size, 10);
workerTitleContainer.addSpacer(2)
const workerTitleLabel = workerTitleContainer.addText(workersLabel)
workerTitleLabel.font = Font.systemFont(13)
workerTitleLabel.textColor = Color.gray()
workerContainer.addSpacer(3)

const workerValueLabel = workerContainer.addText(centerNumber(formatNumber(workersSum),15));workerValueLabel.font = Font.boldRoundedSystemFont(15)


widget.addSpacer(5)
const surplusContainer = widget.addStack()
surplusContainer.layoutVertically()
const surplusTitleContainer = surplusContainer.addStack()
surplusTitleContainer.layoutHorizontally()
surplusTitleContainer.centerAlignContent()
let surplusIcon = surplusTitleContainer.addImage(SFSymbol.named("network").image);
surplusIcon.imageSize = scaleImage(surplusIcon.image.size, 10)
surplusIcon.tintColor = Color.orange()
surplusTitleContainer.addSpacer(2)

const surplusTitleLabel = surplusTitleContainer.addText(remainingLabel)
surplusTitleLabel.font = Font.systemFont(12.5)
surplusTitleLabel.textColor = Color.gray()
surplusTitleContainer.addSpacer(20)
const refreshIcon = surplusTitleContainer.addImage(SFSymbol.named("clock").image)
refreshIcon.imageSize = scaleImage(refreshIcon.image.size, 8)
refreshIcon.tintColor = Color.gray()
surplusTitleContainer.addSpacer(1);
const date = new Date()
const month = String(date.getMonth() + 1).padStart(2, '0');
const day = String(date.getDate()).padStart(2, '0');
const dateLabel = surplusTitleContainer.addText(`${month}-${day}`)
dateLabel.font = Font.systemFont(8)
dateLabel.textColor = Color.gray()
dateLabel.rightAlignText()

surplusContainer.addSpacer(3)
const surplusValueLabel = surplusContainer.addText((total - pagesSum - workersSum).toLocaleString() + ' / ' + formatNumber(total))
surplusValueLabel.font = Font.boldRoundedSystemFont(16.2)
surplusContainer.addSpacer(5)
const remainingContainer = widget.addStack()
remainingContainer.layoutHorizontally()
remainingContainer.centerAlignContent()


const remaining = total - pagesSum - workersSum;
const percent = (remaining / total) * 100;
const roundedPercent = Math.round(percent);
const remainingNum = Math.round((roundedPercent / 100) * boxsCount);


const boxs = []
const boxIcons = []
for(let i = 0 ; i < boxsCount; i++) {
  if (isSquare) {
    if (i < remainingNum - 1) {
      boxIcons[boxsCount - i - 1] = SFSymbol.named("square").image;
    } else {
      boxIcons[boxsCount - i - 1] = SFSymbol.named("square.fill").image;
    }
  } else {
    boxIcons[i] = SFSymbol.named("rectangle.portrait").image;
    for(let j = 0; j < remainingNum; j++) {
      boxIcons[j] = SFSymbol.named("rectangle.portrait.fill").image;
    }
  }

}
for(let i = 0; i < boxsCount; i++) {
  boxs[i] = remainingContainer.addImage(boxIcons[i]);
  boxs[i].imageSize = scaleImage(boxs[i].image.size, 8.6);
  boxs[i].tintColor = Color.orange();
}

Script.setWidget(widget)
if (!config.runsInWidget) {
  await widget.presentSmall()
}
Script.complete()

// 定义一个方法，将数字居中显示
function centerNumber(num, totalWidth) {
  if(!isNumberCenter) return num
  // 将数字转换为字符串
  let numStr = num.toString();

  // 计算数字需要的空格数
  let numSpaces = Math.max(0, Math.floor((totalWidth - numStr.length) / 2));

  // 构建居中显示的字符串
  let centeredNum = ' '.repeat(numSpaces) + numStr + ' '.repeat(numSpaces);

  // 如果总宽度为奇数，需要再加一个空格来保持整体居中
  if (centeredNum.length < totalWidth) {
      centeredNum += ' ';
  }

  return centeredNum;
}

async function getAccountId() {
  const req = new Request(`https://api.cloudflare.com/client/v4/accounts`)
  req.method = 'GET'
  req.headers = {
    'content-type': 'application/json',
    'X-AUTH-EMAIL': email,
    'X-AUTH-KEY': key,
  }
  const res = await req.loadJSON()
  // console.log(res)
  const name = res?.result?.[accountIndex]?.name
  const id = res?.result?.[accountIndex]?.id
  console.log(`默认取第 ${accountIndex} 项\n名称: ${name}, 账号 ID: ${id}`)
  if (!id) throw new Error('找不到账号 ID')
  return id
}

async function getSum() {
  const req = new Request(`https://api.cloudflare.com/client/v4/graphql`)
  req.method = 'POST'
  req.headers = {
    'content-type': 'application/json',
    'X-AUTH-EMAIL': email,
    'X-AUTH-KEY': key,
  }
  req.body = JSON.stringify({
    query: `query getBillingMetrics($accountId: string!, $filter: AccountWorkersInvocationsAdaptiveFilter_InputObject) {
      viewer {
        accounts(filter: {accountTag: $accountId}) {
          pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: $filter) {
            sum {
              requests
            }
          }
          workersInvocationsAdaptive(limit: 10000, filter: $filter) {
            sum {
              requests
            }
          }
        }
      }
    }`,
    variables: {
      accountId,
      filter:{ datetime_geq: startDate, datetime_leq: endDate}
    },
  })
  const res = await req.loadJSON()
  // console.log(res)
  const pagesFunctionsInvocationsAdaptiveGroups = res?.data?.viewer?.accounts?.[accountIndex]?.pagesFunctionsInvocationsAdaptiveGroups
  const workersInvocationsAdaptive = res?.data?.viewer?.accounts?.[accountIndex]?.workersInvocationsAdaptive
  if (!pagesFunctionsInvocationsAdaptiveGroups && !workersInvocationsAdaptive) throw new Error('找不到数据')
  const pagesSum = pagesFunctionsInvocationsAdaptiveGroups.reduce((a, b) => a + b?.sum.requests, 0) 
  const workersSum = workersInvocationsAdaptive.reduce((a, b) => a + b?.sum.requests, 0) 
  console.log(`范围: ${startDate} ~ ${endDate}\n默认取第 ${accountIndex} 项`)
  
  return { pagesSum, workersSum }
}


// 缩放图片
function scaleImage(imageSize, height) {
	scale = height / imageSize.height
	return new Size(scale * imageSize.width, height)
}
function formatNumber(num) {
  // 如果数字小于1万，直接返回原始数字
  if (num < 1000) {
      return num.toString();
  }
  // 如果数字大于等于1万，进行格式化
  const suffixes = ['', 'k', 'm', 'b', 't']; // 数字后缀，可根据需要扩展
  let suffixIndex = 0;
  let formattedNum = num;
  
  while (formattedNum >= 1000 && suffixIndex < suffixes.length - 1) {
      formattedNum /= 1000;
      suffixIndex++;
  }

  // 使用 toFixed(1) 将数字保留一位小数，然后连接上对应的后缀
  return formattedNum.toFixed(1) + suffixes[suffixIndex];
}
