import raw from "./content/rail.json" with { type: "json" }

export type RailLink = { label: string; url: string }
export type RailQr = { src: string; caption: string }
export type RailBox = { title: string; body: string[] }

export type RailConfig = {
  shop: RailBox & { links: RailLink[] }
  group: RailBox & { code: string; qrs: RailQr[] }
}

/**
 * 右侧栏「闲鱼店铺 / 交流群」弹窗里的文字。
 * 内容由后台写到 src/content/rail.json；这里的默认值只在字段缺失时兜底。
 */
const DATA = raw as Partial<{
  shop: Partial<{ title: string; body: string; links: RailLink[] }>
  group: Partial<{ title: string; body: string; code: string; qrs: RailQr[] }>
}>

const DEFAULT_SHOP_LINK = "https://www.goofish.com/personal?spm=a21ybx.home.nav.1.4c053da6GMjw4U"

/** 纯文本字段：去掉首尾空白并截断，避免一条超长文案撑破弹窗。 */
function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

/** 文案按空行 / 换行拆成多段，弹窗里一段一个 <p>。 */
function paragraphs(value: unknown, max = 600) {
  const body = text(value, max)
  if (!body) return []
  return body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function safeUrl(value: unknown) {
  const raw = text(value, 600)
  if (!raw) return ""
  try {
    const url = new URL(raw)
    return /^https?:$/.test(url.protocol) ? url.toString() : ""
  } catch {
    return ""
  }
}

function shopLinks(value: unknown): RailLink[] {
  const list = Array.isArray(value) ? value : []
  return list
    .map((item) => ({ label: text(item?.label, 24), url: safeUrl(item?.url) }))
    .filter((item) => item.label && item.url)
    .slice(0, 6)
}

function qrList(value: unknown): RailQr[] {
  const list = Array.isArray(value) ? value : []
  const qrs = list
    .map((item) => ({ src: text(item?.src, 200), caption: text(item?.caption, 24) }))
    .filter((item) => item.src.startsWith("/qr/") && !item.src.includes(".."))
    .slice(0, 4)
  return qrs.length ? qrs : [{ src: "/qr/qq.png", caption: "QQ 群" }]
}

const links = shopLinks(DATA.shop?.links)
const shopBody = paragraphs(DATA.shop?.body)

export const railConfig: RailConfig = {
  shop: {
    title: text(DATA.shop?.title, 40) || "闲鱼账号",
    body: shopBody,
    links: links.length ? links : [{ label: "闲鱼店铺", url: DEFAULT_SHOP_LINK }],
  },
  group: {
    title: text(DATA.group?.title, 40) || "交流群",
    body: paragraphs(DATA.group?.body),
    code: text(DATA.group?.code, 60),
    qrs: qrList(DATA.group?.qrs),
  },
}
