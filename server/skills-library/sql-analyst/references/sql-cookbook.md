# SQL 分析模板库（PostgreSQL 方言为主）

## 同比 / 环比

```sql
WITH monthly AS (  -- 月度销售额
  SELECT date_trunc('month', paid_at) AS m, SUM(amount) AS amt
  FROM orders WHERE status = 'paid'
  GROUP BY 1
)
SELECT m, amt,
  LAG(amt)               OVER (ORDER BY m) AS prev_month,   -- 上月（环比分母）
  ROUND(amt / NULLIF(LAG(amt) OVER (ORDER BY m), 0) - 1, 4) AS mom_rate,
  LAG(amt, 12)           OVER (ORDER BY m) AS same_last_year, -- 去年同月
  ROUND(amt / NULLIF(LAG(amt, 12) OVER (ORDER BY m), 0) - 1, 4) AS yoy_rate
FROM monthly;
```

## 留存曲线（N 日留存）

```sql
WITH first_act AS (  -- 每用户首次活跃日
  SELECT user_id, MIN(active_date) AS d0 FROM user_events GROUP BY user_id
), act AS (
  SELECT DISTINCT user_id, active_date FROM user_events
)
SELECT f.d0,
  COUNT(DISTINCT CASE WHEN a.active_date = f.d0      THEN a.user_id END) AS d0_cnt,
  COUNT(DISTINCT CASE WHEN a.active_date = f.d0 + 1  THEN a.user_id END) AS d1,
  COUNT(DISTINCT CASE WHEN a.active_date = f.d0 + 7  THEN a.user_id END) AS d7,
  COUNT(DISTINCT CASE WHEN a.active_date = f.d0 + 30 THEN a.user_id END) AS d30
FROM first_act f LEFT JOIN act a ON a.user_id = f.user_id
GROUP BY f.d0 ORDER BY f.d0;
```

## TopN 分组排行

```sql
SELECT * FROM (
  SELECT category, name, sales,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY sales DESC) AS rn
  FROM products
) t WHERE rn <= 3;   -- DENSE_RANK() 允许并列
```

## 连续区间问题（打卡/库存连续 N 天）

```sql
-- 思路：日期 - row_number() 得到相同分组键
SELECT user_id, MIN(dt) AS start, MAX(dt) AS end, COUNT(*) AS days
FROM (
  SELECT user_id, dt, dt - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY dt))::int AS grp
  FROM checkins GROUP BY user_id, dt
) x GROUP BY user_id, grp HAVING COUNT(*) >= 3;
```

## EXPLAIN 速读

| 看到 | 含义 | 动作 |
|---|---|---|
| Seq Scan 大表 | 全表扫 | 找 WHERE 列建索引 |
| rows 估算 ≪ 实际（看 actual rows） | 统计信息过期 | `ANALYZE` 表 |
| Sort / Hash Aggregate 且内存超限 | 落盘 | 加 work_mem 或改索引顺序消排序 |
| Nested Loop 内层百万次 | 驱动表选错 | 改写 JOIN 顺序或统计先行 |
| Index Cond 没吃到时间列 | 索引列序不对 | 等值列在前、范围列收尾 |

## 索引列序口诀

**等值 → 范围 → 排序/覆盖**；高选择性列放前；一个查询一个组合索引胜过三个单列索引；写多读少的表慎加索引。
