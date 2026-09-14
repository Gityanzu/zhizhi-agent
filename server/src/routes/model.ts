import { Router, Request, Response } from 'express';
import { getCurrentModel, getAvailableModels, setModel, isLLMConfigured } from '../services/llm';
import {
  getProviders,
  getModelsGroupedByProvider,
  detectOllamaModels,
  isOllamaAvailable,
} from '../services/llmProvider';

const router = Router();

// 获取当前模型信息
router.get('/current', (req: Request, res: Response) => {
  try {
    const model = getCurrentModel();
    res.json({
      model,
      configured: isLLMConfigured(),
    });
  } catch (error) {
    console.error('获取模型信息失败:', error);
    res.status(500).json({ error: '获取模型信息失败' });
  }
});

// 功能10：获取提供商列表（含 Ollama 运行状态）
router.get('/providers', (req: Request, res: Response) => {
  try {
    const providers = getProviders().map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      modelCount: p.models.length,
      available: p.available !== false,
      error: p.error,
    }));
    res.json({
      providers,
      ollamaAvailable: isOllamaAvailable(),
    });
  } catch (error) {
    console.error('获取提供商列表失败:', error);
    res.status(500).json({ error: '获取提供商列表失败' });
  }
});

// 获取可用模型列表（扁平 + 按 provider 分组）
router.get('/list', async (req: Request, res: Response) => {
  try {
    // 懒触发一次 Ollama 检测（3秒超时，失败不影响）
    if (!isOllamaAvailable()) {
      await detectOllamaModels(false).catch(() => []);
    }
    const models = getAvailableModels();
    const groups = getModelsGroupedByProvider();
    const current = getCurrentModel();
    res.json({
      models,
      groups,
      current: current.id,
      currentProviderId: (current as any).providerId,
    });
  } catch (error) {
    console.error('获取模型列表失败:', error);
    res.status(500).json({ error: '获取模型列表失败' });
  }
});

// 切换模型（支持 {model, providerId}）
router.post('/switch', (req: Request, res: Response) => {
  try {
    const { model, providerId } = req.body;

    if (!model) {
      return res.status(400).json({ error: '模型名称不能为空' });
    }

    const success = setModel(model, providerId);

    if (!success) {
      return res.status(400).json({ error: `不支持的模型: ${model}` });
    }

    const current = getCurrentModel();
    res.json({
      success: true,
      message: `已切换到 ${current.name}`,
      model: current,
    });
  } catch (error) {
    console.error('切换模型失败:', error);
    res.status(500).json({ error: '切换模型失败' });
  }
});

// 功能10：重新检测 Ollama 模型
router.post('/refresh-ollama', async (req: Request, res: Response) => {
  try {
    const models = await detectOllamaModels(true);
    res.json({
      success: true,
      ollamaAvailable: isOllamaAvailable(),
      models,
      message: isOllamaAvailable()
        ? `检测到 ${models.length} 个本地模型`
        : 'Ollama未运行，请先启动 Ollama 服务',
    });
  } catch (error) {
    console.error('刷新Ollama模型失败:', error);
    res.status(500).json({ error: '刷新Ollama模型失败' });
  }
});

export default router;
