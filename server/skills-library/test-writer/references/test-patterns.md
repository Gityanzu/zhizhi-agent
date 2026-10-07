# 测试模式深度参考

## 表驱动测试（多输入同构断言首选）

```ts
// Vitest 示例
it.each([
  ['正常一年', 365, 1],
  ['闰年', 366, 1],
  ['零天', 0, 0],
  ['负数抛错', -1, Error],
])('parseDays(%i) → %s', (_name, input, expected) => { ... });
```

```python
# pytest 示例
@pytest.mark.parametrize("raw,expected", [(None, ""), ("a,b", ["a", "b"]), ("  ", "")])
def test_split_tags(raw, expected): ...
```

## 不稳定因素的注入改造（测不了的代码 = 缺注入点）

| 依赖 | 改造 |
|---|---|
| `Date.now()` / `new Date()` | 函数签名注入 `now: () => number` 或 `clock` |
| `Math.random()` | 注入 `rng`，测试传固定种子 |
| 文件系统 | 临时目录（`os.tmpdir`/`mkdtemp`）而非 mock fs |
| HTTP | 拦截层（msw/nock/respx），不 mock 业务代码 |
| 环境变量 | `vi.stubEnv` / `monkeypatch.setenv`，测后自动还原 |

## 快照测试的边界

- ✅ 适用：纯 UI 结构、CLI 帮助文本、序列化格式回归
- ❌ 不适用：含时间戳/随机数/本地化的输出（先做序列化和冻结）
- 快照变大要警觉——一次 PR 改 500 行快照等于没测

## Mock 三原则

1. 只 mock **边界**（网络、DB、时钟），不 mock 被测单元的内部协作者
2. mock 返回必须符合真实契约（结构、类型、异常），最好用录制回放
3. 每个 mock 在 teardown 校验调用次数与参数（`expect(spy).toHaveBeenCalledWith`）

## 反模式清单

- 断言实现细节（私有方法被调用次数）而非行为输出
- 一个 `it` 里测五件事，挂了不知道挂在哪
- 测试代码复制生产逻辑（逻辑变了测试跟着错 → 假绿）
- 用 `sleep()` 等异步结果（应用可等待的信号：`waitFor` / promise 句柄）
