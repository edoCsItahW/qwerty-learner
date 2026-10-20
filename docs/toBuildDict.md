# 如何导入新的词典 📚

注意，我们的词典主要来源于社区贡献。当你想要导入新的词典时，最好准备好词典的源文件，以便我们能够更好的帮助你。

## 0. 交给我们！🤝

### 0.1 如果你没有任何编程基础 🚫💻

我们推荐你加入 qwerty learner 社区群，在群中反映你的需求，我们的开发者会帮助你导入词典。

![groupQRcode](../public/weChat-group.jpg)

### 0.2 如果你不会编程，但会使用 github🐙

我们推荐你以“Dictionary Request”为开头发起 Issue，描述你的词典需求并提供词典来源。

## 1. 亲自动手！🛠️

### 1.1 词典的目标文件格式 📄

词典的文件格式是 `词典名.json` ，其内容结构应当是:

```json
[
    {
        "name" : "xxx" ,
        "trans" : ["xxx", "xxx",...]
    },
    ...
]
```

例如:

```json
  { "name": "file", "trans": ["n. 档案,公文箱,锉刀,[计算机] 文件 vt. 列队行进,归档,申请"] },
  {
    "name": "command",
    "trans": [
      "n.命令，指挥； 司令部，指挥部； [计算机]指令； 控制力 vt.指挥，控制，命令； 命令； 应得，值得 vi.给出命令； 命令，指令 adj.指挥的，根据命令（或要求）而作的"
    ]
  },
  { "name": "use", "trans": ["n. 运用,用法,使用权,适用 vt. 使用,利用,对待 vi. 吸毒"] },
  { "name": "program", "trans": ["n. 节目(单),程序,计划 vt. 规划,拟定计划,制作节目"] },
  { "name": "line", "trans": ["n. 行,线,航线,场界,皱纹,家族 vt. &vi. 用做衬里,排成一行,顺...排列 vi. 排成一行,顺...排列,划线于"] },
  { "name": "if", "trans": ["conj. 如果，是否，即使 n. 条件,设想"] },

```

#### 1.1.0 如何将词典的源文件转换为目标文件格式？🔄

由于词典的源文件格式、来源各异，我们无法为你提供统一的转换方法，但是我们可以提供一些思路：

#### 1.1.1 你可以将部分词典源文件的内容发送给 ChatGPT 并描述需求，让 ChatGPT 生成转换脚本 🤖

#### 1.1.2 你也可以使用在线工具将词典源文件转换为目标文件格式，此类在线工具有很多，如 <https://csvjson.com/csv2json> 🔧

#### 1.1.3 如果内容不多，你也可以手动将词典源文件转换为目标文件格式，或批量交给 ChatGPT 生成 ✍️

#### 1.1.4 如果你卡在了这一步，可以回到 0 部分，交给我们来帮你完成这一步 🔄

### 1.2 词典的目标文件位置 📍

词典的目标文件位置是 `/public/dicts/`，请将处理好的词典文件放置在该目录下

### 1.3 词典的索引建立 🔍

词典的索引建立是在 `/resources/dictionary.ts` 中完成的，你需要在该文件中添加一行代码，格式如下：

```json
{
    "id": "xxx",
    "name": "xxx",
    "description": "xxx",
    "category": "xxx",
    "url": "./dicts/xxx.json",
    "length": xxx
}
```

例如:

```json
  {
    "id": "cet4",
    "name": "CET-4",
    "description": "大学英语四级词库",
    "category": "英语学习",
    "url": "/dicts/CET4_T.json",
    "length": 2607,
    "language": "en",
  },
  {
    "id": "cet6",
    "name": "CET-6",
    "description": "大学英语六级词库",
    "category": "英语学习",
    "url": "/dicts/CET6_T.json",
    "length": 2345,
    "language": "en",
  },
```

其中,  
`id` 需要是所有词典中唯一的  
`name` 是展示给所有用户的词典名  
`description` 是词典描述  
`category` 是词典分类（你可以事先阅读所有已存在的词典分类，来为新的词典选择合适的分类）  
`url` 是词典的目标文件位置  
`length` 是词典的单词数量（可以通过运行脚本 `scripts/update-dict-size.js` 来自动计算）  
`language` 表示词典的语言

### 1.4 测试 🧪

使用 yarn 指令安装依赖，然后使用 yarn dev 启动开发服务器，访问 "http://localhost:5173"

如果你的词典已经成功导入，你将在词典列表中看到你的词典。🎉

### 1.5 提交 PR 📝

现在你可以提交 PR 了，我们会尽快 review 你的代码，如果一切顺利，你的词典将会在下一个版本中发布。🎉

## 2. 本地个人词典（无需改代码）🧑‍💻

如果只是自己使用，不想每次新增词典或追加单词都修改 `src/resources/dictionary.ts`，可以使用运行时本地索引：

- 索引文件：`public/dicts/local-index.json`
- 词库文件：仍放在 `public/dicts/` 下
- 应用会在启动时读取该索引。使用 `pnpm dev` 时，新增词典只需要在 `local-index.json` 中增加一条记录并刷新页面，不需要改 TypeScript 代码，也不需要重新构建。

`local-index.json` 结构示例：

```json
{
  "dictionaries": [
    {
      "id": "my_dict",
      "name": "我的词典",
      "description": "个人使用",
      "category": "个人词典",
      "tags": ["个人"],
      "url": "/dicts/my_dict.json",
      "length": 100,
      "language": "en",
      "languageCategory": "en"
    }
  ],
  "lengthOverrides": {
    "cet4_composition_template": 120
  }
}
```

- `dictionaries`：新增的本地词典列表。
- `lengthOverrides`：追加单词后覆盖内置词典的词数；章节数会根据它自动重新计算。

### 2.1 在应用内导入 / 追加 ✍️

1. 在项目目录运行 `pnpm dev`
2. 打开词典库，点击右上角的“导入词典”
3. 选择 JSON 文件，选择“新建词典”或“追加到已有词典”
4. 导入成功后会写入 `public/dicts/*.json` 并更新 `public/dicts/local-index.json`，页面自动刷新

下次运行 `pnpm dev` 时，修改仍然生效。追加单词会按单词名去重，并自动更新词数和章节数。

> 注意：浏览器不能直接写项目文件，因此导入功能依赖本地 dev server。使用静态部署或 `pnpm build` 后的页面时，只能读取已有词典，无法写回文件。

## 别忘了，在任何步骤遇到困难时，你都可以转向 qwerty learner 社区寻求帮助。我们是一个非常友好的社区，随时欢迎你的加入！🤝
