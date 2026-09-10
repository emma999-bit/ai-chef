import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { writeFileSync } from "node:fs";
import { formatChefMarkdown } from "../src/lib/chefMarkdown";

const cases: { name: string; input: string }[] = [
  {
    name: "broken-bold",
    input: `**3 草莓酸奶沙拉 | 5分钟 **
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
2. 摆入碗中，淋上酸奶即可（1分钟）`,
  },
  {
    name: "buy-same-line",
    input: `食谱 Top 5：

- **1 生菜炒鸡蛋 | 10分钟**
- **评分**：营养 8/10，简易 9/10
- **食材**： 清单内：生菜(1小棵) 150g、鸡蛋(2个) 100g 需买：蒜(2瓣) 约10g
- **热量**：约200 kcal
- **营养**：蛋白 14g / 脂肪 12g / 碳水 6g
- **理由**：快手下饭。
- **步骤**：
1. 生菜洗净（1分钟）
2. 出锅装盘（1分钟）`,
  },
  {
    name: "two-dishes",
    input: `- **1 生菜炒鸡蛋｜10分钟**
- **评分**：营养 8/10，简易 9/10
- **食材**：生菜(1小棵) 150g、鸡蛋(2个) 100g
- **热量**：约200 kcal
- **营养**：蛋白 14g / 脂肪 12g / 碳水 6g
- **理由**：快手下饭。
- **步骤**：
1. 生菜洗净（1分钟）

- **2 西红柿炒蛋｜8分钟**
- **评分**：营养 8/10，简易 9/10
- **食材**：西红柿(1个) 200g、鸡蛋(2个) 100g
- **热量**：约220 kcal
- **营养**：蛋白 14g / 脂肪 12g / 碳水 10g
- **理由**：家常。
- **步骤**：
1. 西红柿切块（1分钟）`,
  },
];

function assert(name: string, cond: boolean, detail: string) {
  if (!cond) {
    throw new Error(`[${name}] ${detail}`);
  }
}

const cards: string[] = [];

for (const c of cases) {
  const out = formatChefMarkdown(c.input);
  console.log(`\n===== ${c.name} =====\n${out}\n`);

  assert(c.name, !/^[ \t]*\*{1,3}[ \t]*$/m.test(out), "orphan ** line");
  assert(c.name, !/(^|[^\\*])(评分|食材|热量|营养|理由|步骤)\*\*：/.test(out), "broken closing bold");
  assert(c.name, !/清单内[：:]/.test(out), "清单内 still present");
  assert(c.name, !/需买[：:]/.test(out), "需买： field still present");
  for (const field of ["评分", "食材", "热量", "营养", "理由", "步骤"]) {
    assert(c.name, out.includes(`**${field}**：`), `missing **${field}**：`);
  }
  assert(c.name, /分钟\*\*\n\n(?:[-*+]\s+)?\*\*评分\*\*：/.test(out), "title/评分 not split");
  assert(c.name, !/\*\*食材\*\*：[^\n]*热量/.test(out), "食材 merged with 热量");
  assert(c.name, !/\*\*评分\*\*：[^\n]*食材/.test(out), "评分 merged with 食材");
  assert(c.name, !/^[ \t]*[-*+][ \t]*$/m.test(out), "orphan list marker");
  if (c.name === "buy-same-line") {
    assert(c.name, out.includes("蒜(2瓣) 约10g（需买）"), "需买 not annotated");
    assert(c.name, out.includes("生菜(1小棵) 150g、鸡蛋(2个) 100g、蒜"), "ingredients not dunhao-joined");
  }
  if (c.name === "broken-bold") {
    assert(c.name, out.includes("酸奶(1杯) 约200g（需买）"), "需买 remark lost");
  }
  if (c.name === "two-dishes") {
    assert(c.name, /\n---\n/.test(out), "missing --- between dishes");
    assert(c.name, out.includes("**1 生菜炒鸡蛋｜10分钟**"), "missing dish 1");
    assert(c.name, out.includes("**2 西红柿炒蛋｜8分钟**"), "missing dish 2");
  }

  const inner = renderToStaticMarkup(
    h(Markdown, { remarkPlugins: [remarkGfm] }, out),
  );
  cards.push(
    `<section><h3>${c.name}</h3><div class="bubbleChef">${inner}</div></section>`,
  );
}

const html = `<!doctype html>
<meta charset="utf-8">
<title>chef markdown selftest</title>
<style>
  :root { --cream-bg:#fbf7ee; --ink:#33291c; --line:#e8deca; }
  body { margin:0; background:var(--cream-bg); color:var(--ink);
    font-family:"PingFang SC",sans-serif; padding:20px; }
  h3 { margin:0 0 8px; font-size:13px; color:#a2937b; font-weight:600; }
  .row { display:flex; gap:16px; align-items:flex-start; }
  section { flex:1; min-width:280px; }
  .bubbleChef { background:#fff; border:1px solid var(--line);
    border-radius:16px 16px 16px 4px; padding:16px 18px; }
  .bubbleChef p, .bubbleChef ul, .bubbleChef ol { margin:0 0 8px; }
  .bubbleChef > :last-child { margin-bottom:0; }
  .bubbleChef ul, .bubbleChef ol { padding-left:20px; }
  .bubbleChef strong { font-weight:700; }
  .bubbleChef hr { border:0; border-top:1px solid var(--line); margin:24px 0; }
</style>
<div class="row">${cards.join("")}</div>`;

writeFileSync("/tmp/chef-selftest.html", html);
console.log("PASS wrote /tmp/chef-selftest.html");
