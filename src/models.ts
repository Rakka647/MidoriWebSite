import raw from "./content/models.json" with { type: "json" }
import rawPool from "./content/tags.json" with { type: "json" }
import rawBanner from "./content/banner.json" with { type: "json" }

export type Model = {
  id: string
  code: string
  name: string
  series: string
  price: string
  /** 管理员自定义的版本与价格（如 无面捕版 / 面捕版 / 差价），默认没有 */
  versions?: { name: string; price: string }[]
  erp: boolean | null
  /** 一级标签：素体 */
  bodies?: string[]
  /** 三级标签：颜色 */
  colors?: string[]
  /** 四级标签：其他标签（二级 ERP 由 erp 字段决定） */
  tags: string[]
  author?: string
  download?: string
  vram?: string
  platform?: string
  /** 闲鱼商品链接，「获取模型」按钮跳转用 */
  link?: string
  description: string
  images: string[]
  /** 点开展示图时用的原图；没有就用 images */
  fullImages?: string[]
  /**
   * 「erp模型」按钮点第二次时，模型一览卡片上换成的预设图。
   * 后台单独上传；没有这张图时卡片显示占位符，不会退回封面。
   */
  erpImage?: string
}

export function fullImage(model: Pick<Model, "images" | "fullImages">, index: number) {
  return model.fullImages?.[index] || model.images[index] || ""
}

export const models = raw as Model[]

const bannerConfig = rawBanner as { slides?: { src?: string; modelId?: string }[] }

export type BannerSlide = { id: string; src: string; tags: string[] }

/** 首页横幅：只用后台手动上传的图，不再自动拿模型封面。 */
export function bannerSlides(list: Model[], count = 4): BannerSlide[] {
  const byId = new Map(list.map((model) => [model.id, model]))
  const slides: BannerSlide[] = []
  for (const item of bannerConfig.slides ?? []) {
    if (slides.length >= count) break
    const src = typeof item?.src === "string" ? item.src.trim() : ""
    const model = typeof item?.modelId === "string" ? byId.get(item.modelId) : undefined
    if (!src || !model) continue
    slides.push({ id: model.id, src, tags: bannerTags(model) })
  }
  return slides
}

const COPY_TAGS = new Set(["p", "br", "b", "strong", "i", "em", "u", "s", "mark", "div"])

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** 详情介绍只保留粗体 / 斜体 / 高亮等安全标签。 */
export function sanitizeDescription(raw: string) {
  let html = String(raw ?? "").replace(/\r\n/g, "\n").slice(0, 30000)
  if (!/<[a-z][\s\S]*>/i.test(html)) return html
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "")
  html = html.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (_full, attrs, inner) =>
    /background/i.test(String(attrs)) ? `<mark>${inner}</mark>` : inner,
  )
  return html.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (full, tag) => {
    const name = String(tag).toLowerCase()
    if (!COPY_TAGS.has(name)) return ""
    if (name === "br") return full.startsWith("</") ? "" : "<br>"
    if (full.startsWith("</")) return `</${name === "div" ? "p" : name}>`
    if (name === "div") return "<p>"
    return `<${name}>`
  })
}

/** 详情页展示用：纯文本保留空行；带格式的 HTML 先消毒。 */
export function formatDescription(raw: string) {
  const text = sanitizeDescription(raw)
  if (!text.trim()) return ""
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    return text
      .split("\n")
      .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
      .join("")
  }
  return text
}

export function displayName(model: Pick<Model, "name" | "series">) {
  return model.series ? `${model.name} - ${model.series}` : model.name
}

/** 卡片上显示的价格：优先用「价格」，没填就用第一个版本的价格。 */
export function displayPrice(model: Pick<Model, "price" | "versions">) {
  return model.price || model.versions?.find((version) => version.price)?.price || ""
}

/** 排序用的价格数字：总价、各版本价里取最高的那个，没有价格排到最后。 */
export function priceValue(model: Pick<Model, "price" | "versions">) {
  const texts = [model.price, ...(model.versions ?? []).map((version) => version.price)]
  let highest = Number.NEGATIVE_INFINITY
  for (const text of texts) {
    if (!text) continue
    for (const match of text.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)/g)) {
      const value = Number(match[1])
      if (value > highest) highest = value
    }
  }
  return highest > 0 ? highest : Number.POSITIVE_INFINITY
}

/** 横幅左下角：素体 + 颜色 + 除此以外的第一个标签。 */
export function bannerTags(model: Model) {
  const tags: string[] = []
  const body = model.bodies?.[0]
  const color = model.colors?.[0]
  const extra = model.tags.find((tag) => tag !== body && tag !== color && tag !== "面捕")
  if (body) tags.push(body)
  if (color) tags.push(color)
  if (extra) tags.push(extra)
  return tags
}

export function erpLabel(erp: boolean | null) {
  if (erp === true) return "ERP模型"
  if (erp === false) return "无ERP模型"
  return "未标注"
}

// ---------------------------------------------------------------- 四级标签

export const ERP_YES = "可ERP"
export const ERP_NO = "无ERP"

/** 首页「全部 / erp模型 / 无erp模型」 */
export type ErpFilter = "all" | "erp" | "plain"

export type TagLevel = {
  id: "body" | "color" | "tag"
  label: string
  tags: string[]
  /** any：选了多个时满足其一即可；all：必须全部满足 */
  mode: "any" | "all"
}

const pool = rawPool as { bodies?: string[]; colors?: string[]; tags?: string[] }

export function erpTag(erp: boolean | null) {
  return erp === true ? ERP_YES : erp === false ? ERP_NO : null
}

/** 一个模型的所有标签：素体、ERP、颜色、其他。 */
export function modelTags(model: Model): string[] {
  const erp = erpTag(model.erp)
  return [...(model.bodies ?? []), ...(erp ? [erp] : []), ...(model.colors ?? []), ...model.tags]
}

/** 筛选面板用的四级标签：先是标签池里登记的，再补上模型里用到但池里没有的。 */
export function tagLevels(list: Model[]): TagLevel[] {
  const merge = (base: string[] | undefined, used: string[]) => [...new Set([...(base ?? []), ...used])]
  return [
    { id: "body", label: "素体", mode: "any", tags: merge(pool.bodies, list.flatMap((model) => model.bodies ?? [])) },
    { id: "color", label: "颜色", mode: "any", tags: merge(pool.colors, list.flatMap((model) => model.colors ?? [])) },
    { id: "tag", label: "标签", mode: "all", tags: merge(pool.tags, list.flatMap((model) => model.tags)) },
  ]
}

/** 同一行里选了多个：素体、颜色满足其一；标签要全部满足。不同行之间永远是「并且」。 */
export function matchesPicked(model: Model, picked: string[], levels: TagLevel[]) {
  if (!picked.length) return true
  const mine = new Set(modelTags(model))
  const known = new Set(levels.flatMap((level) => level.tags))
  for (const level of levels) {
    const chosen = picked.filter((tag) => level.tags.includes(tag))
    if (!chosen.length) continue
    const ok = level.mode === "any" ? chosen.some((tag) => mine.has(tag)) : chosen.every((tag) => mine.has(tag))
    if (!ok) return false
  }
  return picked.filter((tag) => !known.has(tag)).every((tag) => mine.has(tag))
}
