const CATEGORY_LABEL =
  "蔬菜|水果|肉类|海鲜|蛋类|豆制品|乳制品|主食|调味品|饮料|其他";

const CATEGORY_ORDER = [
  "蔬菜",
  "肉类",
  "蛋类",
  "水果",
  "海鲜",
  "豆制品",
  "乳制品",
  "主食",
  "调味品",
  "饮料",
  "其他",
];

const RECIPE_FIELD = "评分|食材|热量|营养|理由|配图|步骤";
const RECIPE_FIELD_TOKEN = `\\*\\*(?:${RECIPE_FIELD})\\*\\*[：:]`;
const COUNT_UNIT = "个|盒|根|把|颗|块|只|条|片|袋|瓶|罐|勺|小勺|朵|串|瓣|粒";

/** 模型常把表格挤成一行，或把清单类目粘在同一段里。 */
export function formatChefMarkdown(text: string): string {
  const tables = normalizeCategoryBold(text)
    .replace(/\|\s+\|(?=-)/g, "|\n|")
    .replace(/(\|(?:-+\|)+)\s+\|/g, "$1\n|");
  const fields = splitRecipeFields(tables);
  const split = fields
    .replace(
      new RegExp(`([^\\n])(\\*\\*(?:${CATEGORY_LABEL})\\*\\*：)`, "g"),
      "$1\n\n$2",
    )
    .replace(
      new RegExp(`([^\\n*])(${CATEGORY_LABEL})：`, "g"),
      "$1\n\n$2：",
    );
  const bold = split.replace(
    new RegExp(`(^|[^\\*])(${CATEGORY_LABEL})：`, "g"),
    "$1**$2**：",
  );
  return balanceLineBold(
    separateRecipeFields(
      repairRecipeBold(
        formatIngredientAmounts(numberRecipeTitles(reorderCategories(bold))),
      ),
    ),
  );
}

/** 模型偶尔把「**蔬菜：**」的粗体包住冒号，统一还原成「**蔬菜**：」。 */
function normalizeCategoryBold(text: string): string {
  return text.replace(
    new RegExp(`\\*{1,2}\\s*(${CATEGORY_LABEL})\\s*[：:]\\s*\\*{1,2}`, "g"),
    "**$1**：",
  );
}

/** 某行 ** 个数为奇数说明有落单的粗体记号，去掉最后一个避免渲染出裸 **。 */
function balanceLineBold(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const marks = line.match(/\*\*/g);
      if (!marks || marks.length % 2 === 0) {
        return line;
      }
      const at = line.lastIndexOf("**");
      return (line.slice(0, at) + line.slice(at + 2)).replace(/[ \t]+$/, "");
    })
    .join("\n");
}

function repairRecipeBold(text: string): string {
  return text
    .replace(
      new RegExp(
        `(?<![\\u4e00-\\u9fffA-Za-z])(?:\\*{1,2})?(${RECIPE_FIELD})(?:\\*{1,2})?[：:](?:\\*{1,2})?`,
        "g",
      ),
      "**$1**：",
    )
    .replace(/^[ \t]*\*{1,3}[ \t]*$/gm, "")
    .replace(/[ \t]+\*{1,2}[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function splitRecipeFields(text: string): string {
  const repaired = repairRecipeBold(text);
  const split = repaired
    .replace(/(分钟)\s+(?=\*\*评分\*\*[：:])/g, "$1\n\n")
    .replace(
      new RegExp(`([^\\n])(?<![-*+]\\s)(${RECIPE_FIELD_TOKEN})`, "g"),
      "$1\n\n$2",
    );
  return flattenRecipeIngredients(split);
}

function formatIngredientBody(body: string): string {
  if (/\|\s*清单内\s*\|\s*需买\s*\|/.test(body)) {
    const row = body
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.startsWith("|") &&
          !/^\|[\s\-|]+\|?$/.test(line) &&
          !/清单内/.test(line),
      );
    const cells = (row ?? "")
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    const haveItems = splitIngredientItems(cells[0] ?? "");
    const buyItems = splitIngredientItems(cells[1] ?? "")
      .filter((item) => item && !/^无(?:需(?:购买)?)?$/.test(item))
      .map((item) => (/需买/.test(item) ? item : `${item}（需买）`));
    return [...haveItems, ...buyItems].filter(Boolean).join("、");
  }
  const cleaned = body
    .replace(/\*{1,2}/g, " ")
    .replace(/[（(]\s*清单内\s*[）)]/g, "")
    .replace(/[；;]/g, "、")
    .replace(/\s+/g, " ")
    .trim();
  if (!/清单内[：:]/.test(cleaned) && !/需买[：:]/.test(cleaned)) {
    return cleaned;
  }
  const parts = cleaned.split(/\s*(?:[／/]\s*)?需买[：:]\s*/);
  const have = (parts[0] || "").replace(/清单内[：:]\s*/g, "").trim();
  const buy = (parts.slice(1).join("、") || "").trim();
  const haveItems = splitIngredientItems(have);
  const buyItems = splitIngredientItems(buy)
    .filter((item) => item && !/^无(?:需(?:购买)?)?$/.test(item))
    .map((item) => (/需买/.test(item) ? item : `${item}（需买）`));
  return [...haveItems, ...buyItems].filter(Boolean).join("、");
}

function flattenRecipeIngredients(text: string): string {
  const startRe = /(^|\n)(\s*(?:[-+]\s+|\*\s+)?)(?:\*\*)?食材(?:\*\*)?[：:]\s*/g;
  const nextRe =
    /\n\s*(?:[-+]\s+|\*\s+)?\*\*(?:评分|热量|营养|理由|配图|步骤)\*\*[：:]/;
  let result = "";
  let last = 0;
  for (const match of text.matchAll(startRe)) {
    const at = match.index ?? 0;
    if (at < last) continue;
    result += text.slice(last, at) + match[1] + match[2] + "**食材**：";
    const start = at + match[0].length;
    const rest = text.slice(start);
    const next = rest.search(nextRe);
    const body = next === -1 ? rest : rest.slice(0, next);
    result += formatIngredientBody(body);
    last = next === -1 ? text.length : start + next;
  }
  return result + text.slice(last);
}

function separateRecipeFields(text: string): string {
  return text
    .replace(/(\d+\s*分钟\*\*)\s*\n+/g, "$1\n\n")
    .replace(
      new RegExp(`\\n+((?:[-*+]\\s+)?${RECIPE_FIELD_TOKEN})`, "g"),
      "\n\n$1",
    );
}

function splitIngredientItems(value: string): string[] {
  return value
    .split(/[、，,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatIngredientAmounts(text: string): string {
  const re = new RegExp(
    `([\\u4e00-\\u9fffA-Za-z+][\\u4e00-\\u9fffA-Za-z0-9+]*)\\s*(\\d+(?:\\.\\d+)?)\\s*(${COUNT_UNIT})\\s*(约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(g|kg|ml|毫升)`,
    "g",
  );
  return text
    .replace(re, (_, name, qty, unit, approx, weight, wunit) => {
      const about = approx ? "约" : "";
      return `${name}(${qty}${unit}) ${about}${weight}${wunit}`;
    })
    .replace(
      new RegExp(
        `(\\([^)]*(?:${COUNT_UNIT})\\))\\s*(约)?\\s*(\\d+(?:\\.\\d+)?)\\s*(g|kg|ml|毫升)`,
        "g",
      ),
      (_, parens, approx, weight, wunit) =>
        `${parens} ${approx ? "约" : ""}${weight}${wunit}`,
    );
}

function numberRecipeTitles(text: string): string {
  let n = 0;
  const numbered = text.replace(
    /^(\s*(?:[-*+]\s+)?)(?:\*+)?(?:Top\s*)?(?:\d+\s+)?(?:\d+\.\s+)?([^*\n]+?(?:｜|\|)\s*\d+\s*分钟)\s*\**\s*$/gim,
    (_, indent: string, title: string) => {
      n += 1;
      const heading = `${indent}**${n} ${title.trim()}**`;
      return n === 1 ? heading : `\n\n---\n\n${heading}`;
    },
  );
  return numbered.replace(/(?:\n\s*---\s*){2,}/g, "\n\n---\n\n");
}

function reorderCategories(text: string): string {
  const catRe = new RegExp(`^\\*\\*(${CATEGORY_LABEL})\\*\\*：`);
  const parts = text.split(/\n\n/);
  const catIdx = parts
    .map((part, i) => (catRe.test(part.trim()) ? i : -1))
    .filter((i) => i >= 0);
  if (catIdx.length < 2) {
    return text;
  }
  const first = catIdx[0];
  const last = catIdx[catIdx.length - 1];
  const block = parts.slice(first, last + 1);
  const cats = block.filter((part) => catRe.test(part.trim()));
  const leftover = block.filter(
    (part) => !catRe.test(part.trim()) && part.trim(),
  );
  cats.sort((a, b) => {
    const na = a.trim().match(catRe)?.[1] ?? "";
    const nb = b.trim().match(catRe)?.[1] ?? "";
    return CATEGORY_ORDER.indexOf(na) - CATEGORY_ORDER.indexOf(nb);
  });
  parts.splice(first, last - first + 1, ...cats, ...leftover);
  return parts.join("\n\n");
}
