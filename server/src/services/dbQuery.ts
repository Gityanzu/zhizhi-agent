import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { usePostgres, query } from '../db';
import { getLLM } from './llm';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

// ==================== 类型定义 ====================

export type DBType = 'mysql' | 'postgres';

export interface DBConnection {
  id: string;
  name: string;
  type: DBType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string; // 存储时加密，返回时不回传明文
  createdAt: string;
}

export interface TableSchema {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
}

export interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
}

// ==================== 密码加密（简单可逆，Base64+固定密钥异或） ====================

const ENC_KEY = 'zhizhi_db_enc_2024';

function encrypt(plain: string): string {
  try {
    const cipher = crypto.createCipheriv('aes-192-cbc', crypto.scryptSync(ENC_KEY, 'salt', 24), Buffer.alloc(16, 0));
    return cipher.update(plain, 'utf8', 'base64') + cipher.final('base64');
  } catch {
    return Buffer.from(plain, 'utf8').toString('base64');
  }
}

function decrypt(cipherText: string): string {
  try {
    const decipher = crypto.createDecipheriv('aes-192-cbc', crypto.scryptSync(ENC_KEY, 'salt', 24), Buffer.alloc(16, 0));
    return decipher.update(cipherText, 'base64', 'utf8') + decipher.final('utf8');
  } catch {
    try {
      return Buffer.from(cipherText, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
}

// ==================== 持久化（PG + JSON 双模式） ====================

const PERSIST_DIR = path.resolve(__dirname, '../../data');
const DB_CONNS_FILE = path.join(PERSIST_DIR, 'db_connections.json');

if (!fs.existsSync(PERSIST_DIR)) {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

let connsMap = new Map<string, DBConnection>();
let loaded = false;

function loadFromFile(): void {
  if (loaded) return;
  if (fs.existsSync(DB_CONNS_FILE)) {
    try {
      const raw = fs.readFileSync(DB_CONNS_FILE, 'utf-8');
      const data = JSON.parse(raw) as DBConnection[];
      for (const c of data) connsMap.set(c.id, c);
      console.log(`数据库连接已加载: ${connsMap.size} 个`);
    } catch (e) {
      console.warn('加载数据库连接失败:', e);
    }
  }
  loaded = true;
}

function saveToFile(): void {
  try {
    fs.writeFileSync(DB_CONNS_FILE, JSON.stringify(Array.from(connsMap.values()), null, 2), 'utf-8');
  } catch (e) {
    console.error('保存数据库连接失败:', e);
  }
}

function mapRow(row: any): DBConnection {
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'postgres',
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    password: row.password || '', // 加密存储
    createdAt: row.created_at,
  };
}

// 返回给前端时不暴露密码
function toPublic(c: DBConnection) {
  const { password, ...rest } = c;
  return rest;
}

// ==================== CRUD ====================

export async function createConnection(data: Partial<DBConnection>): Promise<Omit<DBConnection, 'password'>> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const conn: DBConnection = {
    id,
    name: data.name || '未命名连接',
    type: (data.type || 'postgres') as DBType,
    host: data.host || 'localhost',
    port: data.port || (data.type === 'mysql' ? 3306 : 5432),
    database: data.database || '',
    username: data.username || '',
    password: encrypt(data.password || ''),
    createdAt: now,
  };

  if (usePostgres) {
    await query(
      `INSERT INTO db_connections (id, name, type, host, port, database, username, password, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, conn.name, conn.type, conn.host, conn.port, conn.database, conn.username, conn.password, now]
    );
  } else {
    loadFromFile();
    connsMap.set(id, conn);
    saveToFile();
  }
  return toPublic(conn);
}

export async function getConnection(id: string): Promise<DBConnection | null> {
  if (usePostgres) {
    const result = await query('SELECT * FROM db_connections WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  } else {
    loadFromFile();
    return connsMap.get(id) || null;
  }
}

export async function getAllConnections(): Promise<Array<Omit<DBConnection, 'password'>>> {
  if (usePostgres) {
    const result = await query('SELECT * FROM db_connections ORDER BY created_at DESC');
    return result.rows.map(mapRow).map(toPublic);
  } else {
    loadFromFile();
    return Array.from(connsMap.values()).map(toPublic);
  }
}

export async function updateConnection(id: string, data: Partial<DBConnection>): Promise<Omit<DBConnection, 'password'> | null> {
  const existing = await getConnection(id);
  if (!existing) return null;

  const updated: DBConnection = {
    ...existing,
    ...data,
    id,
    password: data.password !== undefined ? encrypt(data.password) : existing.password,
  };

  if (usePostgres) {
    await query(
      `UPDATE db_connections SET name=$1, type=$2, host=$3, port=$4, database=$5, username=$6, password=$7 WHERE id=$8`,
      [updated.name, updated.type, updated.host, updated.port, updated.database, updated.username, updated.password, id]
    );
  } else {
    loadFromFile();
    connsMap.set(id, updated);
    saveToFile();
  }
  return toPublic(updated);
}

export async function deleteConnection(id: string): Promise<boolean> {
  if (usePostgres) {
    const result = await query('DELETE FROM db_connections WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  } else {
    loadFromFile();
    const result = connsMap.delete(id);
    if (result) saveToFile();
    return result;
  }
}

// ==================== 数据库连接（动态加载 mysql2 / pg） ====================

function getPg() {
  return require('pg');
}

function getMysql2(): any | null {
  try {
    return require('mysql2/promise');
  } catch {
    return null;
  }
}

// 创建连接池/客户端
async function connectDB(conn: DBConnection): Promise<any> {
  const password = decrypt(conn.password);
  if (conn.type === 'mysql') {
    const mysql2 = getMysql2();
    if (!mysql2) throw new Error('mysql2 未安装，不支持 MySQL 连接。请运行 npm install mysql2。');
    const pool = mysql2.createPool({
      host: conn.host,
      port: conn.port,
      user: conn.username,
      password,
      database: conn.database,
      connectionLimit: 3,
    });
    return { kind: 'mysql' as const, pool };
  } else {
    const { Pool } = getPg();
    const pool = new Pool({
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      password,
      max: 3,
      connectionTimeoutMillis: 8000,
    });
    return { kind: 'postgres' as const, pool };
  }
}

// 测试连接
export async function testConnection(id: string): Promise<{ success: boolean; message: string }> {
  const conn = await getConnection(id);
  if (!conn) return { success: false, message: '连接不存在' };
  let client: any = null;
  try {
    const { kind, pool } = await connectDB(conn);
    if (kind === 'mysql') {
      client = await pool.getConnection();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
    } else {
      client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
    }
    return { success: true, message: '连接成功' };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// 获取表结构
export async function getSchema(id: string): Promise<TableSchema[]> {
  const conn = await getConnection(id);
  if (!conn) throw new Error('连接不存在');
  const { kind, pool } = await connectDB(conn);
  try {
    const schemas: TableSchema[] = [];
    if (kind === 'mysql') {
      const [tables] = await pool.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`, [conn.database]);
      for (const t of (tables as any[])) {
        const tableName = t.TABLE_NAME;
        const [cols] = await pool.query(
          `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
          [conn.database, tableName]
        );
        schemas.push({
          tableName,
          columns: (cols as any[]).map((c: any) => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE })),
        });
      }
      await pool.end();
    } else {
      const result = await pool.query(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
      );
      const tableMap = new Map<string, Array<{ name: string; type: string }>>();
      for (const row of result.rows) {
        if (!tableMap.has(row.table_name)) tableMap.set(row.table_name, []);
        tableMap.get(row.table_name)!.push({ name: row.column_name, type: row.data_type });
      }
      for (const [tableName, columns] of tableMap.entries()) {
        schemas.push({ tableName, columns });
      }
      await pool.end();
    }
    return schemas;
  } catch (e) {
    try { await pool.end(); } catch { /* ignore */ }
    throw e;
  }
}

// 只读 SQL 校验：禁止写操作
function isReadOnlySelect(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+$/, '').trim();
  // 只允许单条 SELECT
  if (!/^\s*select\b/i.test(trimmed)) return false;
  // 禁止危险关键字
  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|exec|execute|merge|replace)\b/i;
  if (forbidden.test(trimmed)) return false;
  // 禁止多语句
  if (/;\s*\S/.test(trimmed)) return false;
  return true;
}

// 执行只读 SQL
export async function executeSQL(id: string, sql: string): Promise<QueryResult> {
  if (!isReadOnlySelect(sql)) {
    throw new Error('只允许执行只读 SELECT 查询，禁止 INSERT/UPDATE/DELETE/DROP 等写操作。');
  }
  const conn = await getConnection(id);
  if (!conn) throw new Error('连接不存在');
  const { kind, pool } = await connectDB(conn);
  try {
    if (kind === 'mysql') {
      const [rows, fields] = await pool.query(sql + ' LIMIT 100');
      const columns = (fields as any[]).map((f: any) => f.name);
      await pool.end();
      return { columns, rows: (rows as any[]).slice(0, 100), rowCount: (rows as any[]).length };
    } else {
      const result = await pool.query(sql + ' LIMIT 100');
      await pool.end();
      const columns = result.fields.map((f: any) => f.name);
      return { columns, rows: result.rows.slice(0, 100), rowCount: result.rows.length };
    }
  } catch (e) {
    try { await pool.end(); } catch { /* ignore */ }
    throw e;
  }
}

// 自然语言转 SQL
export async function textToSQL(id: string, naturalLanguage: string): Promise<string> {
  const conn = await getConnection(id);
  if (!conn) throw new Error('连接不存在');
  const schemas = await getSchema(id);

  const schemaText = schemas.map(t => {
    const cols = t.columns.map(c => `${c.name} ${c.type}`).join(', ');
    return `表 ${t.tableName} (${cols})`;
  }).join('\n');

  const llm = getLLM();
  const response = await llm.invoke([
    new SystemMessage(
      `你是一个数据库 SQL 生成专家。根据用户的自然语言问题和数据库表结构，生成一条只读的 SELECT SQL 语句。
只输出 SQL 语句本身，不要解释，不要使用 markdown 代码块标记。只生成 SELECT，禁止任何写操作。
数据库类型：${conn.type}。
表结构：
${schemaText}`
    ),
    new HumanMessage(naturalLanguage),
  ]);
  let sql = typeof response.content === 'string' ? response.content : String(response.content);
  // 清理 markdown 包裹
  sql = sql.replace(/```sql\s*/gi, '').replace(/```/g, '').trim();
  return sql;
}

// 文本到 SQL 再执行（供 Agent 工具调用）
export async function textToSQLAndExecute(connectionId: string, question: string): Promise<string> {
  try {
    const sql = await textToSQL(connectionId, question);
    const result = await executeSQL(connectionId, sql);
    let output = `生成的SQL:\n${sql}\n\n查询结果（共${result.rowCount}行）：\n`;
    if (result.rows.length === 0) {
      output += '(无数据)';
    } else {
      output += result.columns.join(' | ') + '\n';
      output += result.rows.slice(0, 20).map(r => result.columns.map(c => r[c]).join(' | ')).join('\n');
      if (result.rows.length > 20) output += `\n...（仅显示前20行，共${result.rows.length}行）`;
    }
    return output;
  } catch (e) {
    return `数据库查询失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}
