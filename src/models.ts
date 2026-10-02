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
}

export const models = raw as Model[]

const bannerConfig = rawBanner as { pinned?: string[] }

/**
 * 首页横幅的四个模型：后台固定的（最多两个，按设置的顺序）排前面，
 * 剩下的位置自动用其余模型里编号最靠后（最新）的补满。
 */
export function bannerModels(list: Model[], pinned: string[] = bannerConfig.pinned ?? [], count = 4): Model[] {
  const withImage = list.filter((model) => model.images[0])
  const chosen: Model[] = []
  for (const id of pinned) {
    const model = withImage.find((item) => item.id === id)
    if (model && !chosen.includes(model) && chosen.length < 2) chosen.push(model)
  }
  const serial = (model: Model) => {
    const value = parseInt(model.code.replace(/\D/g, ""), 10)
    return Number.isNaN(value) ? -1 : value
  }
  const rest = withImage
    .map((model, order) => ({ model, order }))
    .filter(({ model }) => !chosen.includes(model))
    .sort((a, b) => serial(b.model) - serial(a.model) || b.order - a.order)
    .map(({ model }) => model)
  return [...chosen, ...rest].slice(0, count)
}

export function displayName(model: Pick<Model, "name" | "series">) {
  return model.series ? `${model.name} - ${model.series}` : model.name
}

/** 卡片上显示的价格：优先用「价格」，没填就用第一个版本的价格。 */
export function displayPrice(model: Pick<Model, "price" | "versions">) {
  return model.price || model.versions?.find((version) => version.price)?.price || ""
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
    { id: "color", label: "颜色", mode: "all", tags: merge(pool.colors, list.flatMap((model) => model.colors ?? [])) },
    { id: "tag", label: "标签", mode: "all", tags: merge(pool.tags, list.flatMap((model) => model.tags)) },
  ]
}

/** 同一行里选了多个：素体满足其一；颜色 / 标签要全部满足。不同行之间永远是「并且」。 */
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
