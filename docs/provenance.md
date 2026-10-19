# 范围、查重与参考来源

2026-10-19 的详细选题记录存放于同盘 `D:/Codex/ProjectResearch/2026-10-19/MoonCell-选题论证.md`。本文件是随项目保留的简版。

## 本次检索

读取 Mooncakes 索引 `22c8d15797a355c4215c2a246fbb5a48dd3bf3b9` 的 3124 个包条目元数据，检索表格、公式、审计、差异、缩减等相关关键词；补充 GitHub 搜索，阅读相关 README、部分源码及目录树。不是对全部源码的审计，也不覆盖私人或未公开报名项目。

| 项目 | 与 MoonCell 的关系 |
| --- | --- |
| [office.mbt](https://github.com/moonbitlang/office.mbt) | 已有 XLSX 读写、公式计算；检查了 `mbtexcel/inspect/lint.mbt`，其通过重算报告错误值。不能声称生态中没有公式检查。 |
| [SheetCore](https://github.com/liguanda888/sheetcore) | 已有公式解析、依赖图、增量重算和轨迹。不能把这些基础能力当作新贡献。 |
| [MoonLeaf](https://github.com/vectie/moonleaf) | 已有 OOXML 预览和保守编辑。MoonCell 不以 Office 预览为核心。 |
| [ReTrace](https://github.com/FidollarinLA/retrace) | CSV 分析计划和数字报告复算。MoonCell 的输入对象是现成工作簿的公式。 |
| [csv-risk-audit](https://github.com/rogernbrozen-sys/csv-risk-audit) | CSV 公式注入前缀风险；与公式引用逻辑诊断不同。 |
| [ExceLint-core](https://github.com/ExceLint/ExceLint-core) | TypeScript 公式错误诊断研究实现，Apache-2.0。是后续对照基线；当前没有移植其熵评分、基准标注或代码。 |

## 当前独立实现与不足

第一版实现了位置归一化公式指纹、四邻域一致性候选、同地址版本证据、可审核候选和有限重算预览。检测规则仍然是简单基线，尚不足以证明优于成熟工具。不要将这个版本描述为“全球首创”“自动纠正所有 Excel 错误”或“已满足重报条件”。

为使离线单文件原型可以直接处理用户工作簿，本版采用 `fflate` 和 `fast-xml-parser` 做 JS 文件适配；所有诊断、平移、比较和重算规则运行在 MoonBit 中。MoonBit 内部的有限表达式实现是诊断原型所需的支持层，不是另一项宣称独创的计算引擎。接下来需实际评估 mbtexcel / SheetCore 的 API 和目标后端，优先复用可用能力，避免维护重复的大型 Excel 引擎。

开发使用 AI 辅助，参赛者需自行审阅并理解。申报书须由参赛者按赛事要求亲自撰写。这里不代替申报书，不声称获得初审通过。
