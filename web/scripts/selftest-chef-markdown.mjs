import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { writeFileSync } from "node:fs";
import { formatChefMarkdown } from "../src/lib/chefMarkdown.ts";

function render(md) {
  return renderToStaticMarkup(
    h(Markdown, { remarkPlugins: [remarkGfm] }, md),
  );
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

const brokenBold = `**3 草莓酸奶沙拉 | 5分钟 **
评分**：营养 9/10，简易 10/10

**

食材**：草莓(1盒) 约300g、酸奶(1杯) 约200g（需买） **
热量**：约180 kcal

**

营养**：蛋白 8g / 脂肪 4g / 碳水 30g / 纤维 3g / 钠 80mg / 钾 380mg / 钙 200mg / 铁 0.5mg / 维C 70mg

**

理由**：草莓富含维C和抗氧化物，搭配酸奶补充蛋白和钙，零烹饪。

**

步骤**：
1. 草莓去蒂洗净，对半切开（2分钟）
2. 摆入碗中，淋上酸奶即可（1分钟）`;

const buyFields = `- **1 生菜炒鸡蛋｜10分钟**
- **评分**：营养 8/10，简易 9/10
- **食材**： 清单内：生菜(1小棵) 150g、鸡蛋(2个) 100g 需买：蒜(2瓣) 约10g
- **热量**：约200 kcal
- **营养**：蛋白 14g / 脂肪 12g
- **理由**：快手。
- **步骤**：
1. 洗菜（1分钟）`;

const clean = `- **1 番茄炒蛋｜8分钟**
- **评分**：营养 8/10，简易 9/10
- **食材**：西红柿(1个) 200g、鸡蛋(2个) 100g、葱(1根) 约20g（需买）
- **热量**：约220 kcal
- **营养**：蛋白 13g / 脂肪 14g / 碳水 8g
- **理由**：家常。
- **步骤**：
1. 切番茄（2分钟）
2. 炒蛋（3分钟）`;

const boldColonCategory = `**蔬菜：** 生菜(1大把) 约500g；黄瓜(3根) 约450g

**蛋类：** 鸡蛋(10个) 约500g

- **1 圆白菜炒鸡蛋｜10分钟**
- **评分：营养 4/5，简易 4/5，总分 8/10**
- **食材**：圆白菜(半颗) 300g、鸡蛋(2个) 100g
- **热量**：约230 kcal
- **营养**：蛋白 14g / 脂肪 15g
- **理由**：清甜爽脆。
- **步骤**：
1. 切菜（2分钟）`;

const legacyFields = `**圆白菜炒鸡蛋**

**推荐理由：** 高蛋白低脂，快手！

**详细食材**：圆白菜 300g、鸡蛋 2个

**所需食材：**
- 圆白菜 300g

**制作步骤：**
1. 切菜（2分钟）`;

const suffixInventory = `- **1 蒜蓉西兰花虾仁｜15分钟**
- **评分**：营养 9/10，简易 8/10
- **食材**：西兰花 200g（清单内）；虾仁 150g（清单内）；蒜 10g（需买）；橄榄油 5g（需买）
- **热量**：约180 kcal
- **营养**：蛋白 22g / 脂肪 6g
- **理由**：高蛋白。
- **步骤**：
1. 焯水（3分钟）`;

const tableIngredients = `### 1. 生菜炒鸡蛋｜10分钟
- 评分：营养 8/10，简易 9/10
- 食材：

| 清单内 | 需买 |
|--------|------|
| 生菜 200g，鸡蛋 3个 约150g | 蒜 2瓣 约10g |

- 热量：约 220 kcal
- 营养：蛋白 18g / 脂肪 14g
- 理由：快手下饭。
- 步骤：
  1. 生菜洗净（1分钟）`;

const cases = [
  ["broken-bold", brokenBold],
  ["buy-fields", buyFields],
  ["clean", clean],
  ["bold-colon-category", boldColonCategory],
  ["legacy-fields", legacyFields],
  ["suffix-inventory", suffixInventory],
  ["table-ingredients", tableIngredients],
];

const bubbles = [];
for (const [name, src] of cases) {
  const md = formatChefMarkdown(src);
  const html = render(md);
  console.log(`\n===== ${name} markdown =====\n${md}\n===== ${name} html =====\n${html}\n`);

  const plain = html.replace(/<[^>]+>/g, "");
  assert(!plain.includes("*"), `${name}: leftover * in rendered text: ${plain.match(/.{0,30}\*.{0,30}/)?.[0]}`);
  assert(!/清单内/.test(plain), `${name}: 清单内 leaked to render`);
  assert(!/清单内/.test(md), `${name}: 清单内 still present`);
  assert(!/需买[：:]\s/.test(md), `${name}: 需买： field still present`);
  if (/需买/.test(src)) assert(/（需买）/.test(md), `${name}: missing （需买）`);
  assert(!html.includes("<h2"), `${name}: leftover list dash became heading`);
  assert((html.match(/<p>/g) || []).length >= 5, `${name}: expected separate paragraphs, got ${html}`);
  if (src.includes("热量")) assert(html.includes("热量"), `${name}: missing 热量`);
  if (src.includes("步骤")) assert(html.includes("步骤"), `${name}: missing 步骤`);
  bubbles.push(
    `<h3>${name}</h3><div class="bubbleChef">${html}</div>`,
  );
}

const html = `<!doctype html>
<meta charset="utf-8">
<title>chef markdown selftest</title>
<style>
  :root { --cream-bg:#fbf7ee; --ink:#33291c; --line:#e8deca; }
  body { margin:0; background:var(--cream-bg); color:var(--ink); font-family:"PingFang SC",sans-serif; }
  .wrap { padding:20px; display:flex; flex-direction:column; gap:16px; }
  h3 { margin:0; font-size:13px; color:#a2937b; }
  .bubbleChef { background:#fff; border:1px solid var(--line); border-radius:16px 16px 16px 4px; padding:16px 18px; max-width:420px; }
  .bubbleChef p, .bubbleChef ul, .bubbleChef ol { margin:0 0 8px; }
  .bubbleChef > :last-child { margin-bottom:0; }
  .bubbleChef ul, .bubbleChef ol { padding-left:20px; }
  .bubbleChef strong { font-weight:700; }
</style>
<div class="wrap">${bubbles.join("")}</div>`;

writeFileSync("/tmp/chef-selftest.html", html);
console.log(`PASS ${cases.length}/${cases.length}`.concat(",  wrote /tmp/chef-selftest.html"));
