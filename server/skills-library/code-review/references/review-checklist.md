# 代码审查检查清单（分语言补充项）

## 通用追问清单（四维扫完后过一遍）

- [ ] 如果输入是 `null/undefined/空串/0/-1/NaN/超长字符串/Unicode/emoji`，会发生什么？
- [ ] 如果这个调用失败了/超时了/被并发进入 100 次，会发生什么？
- [ ] 这段代码删掉，功能有什么不同？（识别死代码）
- [ ] 日志里会不会打出 token/密码/身份证/手机号？
- [ ] 外部数据（用户输入、第三方响应）有没有在使用前校验？

## TypeScript / JavaScript

- `==` 隐式转换；`any` 吞掉类型错误；未处理的 Promise rejection
- `async` 循环里 `await` 串行（可 `Promise.all`）；事件监听器/定时器泄漏
- JSON.parse 未包 try；原型链污染（`__proto__` 键）

## Python

- 可变默认参数 `def f(x=[])`；裸 `except:` 吞异常
- 时区 naive datetime；`open` 未用 with；f-string 拼 SQL/shell

## SQL / 数据库

- 字符串拼接 SQL（注入）；`SELECT *`；无 LIMIT 的大表扫描
- 事务边界过大；缺失索引的 WHERE/ORDER BY 列；N+1（循环查询）

## 前端（Vue/React）

- v-html / dangerouslySetInnerHTML 渲染用户内容（XSS）
- 组件卸载后 setState / 未清理的 watcher 与订阅
- key 用 index 导致的列表复用错乱

## 安全专项红线（任一命中即 Blocker）

1. 硬编码密钥/token/密码（包括注释和示例值里的真实值）
2. 未鉴权的管理/写接口
3. 用户输入直达 `exec`/`eval`/SQL 拼接/文件路径拼接
4. CORS `*` 叠加凭据；JWT 无过期或算法 `none`
5. 敏感文件（.env、私钥）被打包进产物或提交进仓库
