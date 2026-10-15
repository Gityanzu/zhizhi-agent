import { onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import type { DesktopMenuCommand, DesktopMenuCommandId } from '@/types/desktop';

/**
 * useAppCommands —— 应用菜单命令的全局分发中心
 *
 * 为什么放在根组件而不是各页面里：
 *   菜单栏是全局 UI，用户可能在任意页面按下 Ctrl+N / Ctrl+1。
 *   如果分发逻辑散落到各个 View，一是容易漏，二是每个 View 都要重复订阅一遍。
 *   这里只在 App.vue 订阅一次，再按"全局命令 / 页面命令"两类分别处理。
 *
 * 两类命令的边界：
 *   全局命令 —— 只依赖全局状态（路由、store）就能完成：新建对话、清空输入、
 *               停止生成、切换主题、跳转、打开设置。
 *   页面命令 —— 需要某个 View 的内部状态才能完成（导入弹窗、导出对话的开关
 *               属于 ChatView）。这类先保证路由就位，再用 window 事件
 *               `app-command` 转交给页面自己处理，避免把页面状态上提到全局。
 */

/** 需要页面自己处理的命令 → 它所属的路由 */
const PAGE_COMMANDS: Partial<Record<DesktopMenuCommandId, string>> = {
  'chat:import': '/chat',
  'chat:export': '/chat',
};

const THEME_KEY = 'theme';

/** 独立预览窗口的路由：它不是"主界面"，只是某一屏内容的容器 */
const PREVIEW_WINDOW_PATH = '/preview-window';

export function useAppCommands() {
  const router = useRouter();
  let dispose: (() => void) | null = null;

  function setTheme(theme: 'dark' | 'light') {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    // ChatView 里还留着 isDark 这个局部 ref（用于渲染月亮/太阳图标），
    // 用事件让它同步，否则会出现"菜单切了主题、页面图标没跟着变"
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
  }

  /** 以当前 DOM 上的实际状态为准，避免多个入口各自维护一份主题状态 */
  function toggleTheme() {
    setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }

  /** 页面命令：先确保路由就位，再把命令转交给页面 */
  async function dispatchToPage(id: DesktopMenuCommandId) {
    const target = PAGE_COMMANDS[id];
    if (target && router.currentRoute.value.path !== target) {
      await router.push(target);
      await nextTick();
    }
    window.dispatchEvent(new CustomEvent('app-command', { detail: { id } }));
  }

  async function handle(command: DesktopMenuCommand) {
    switch (command.id) {
      case 'app:navigate': {
        const path = command.payload?.path;
        if (path) await router.push(path);
        break;
      }

      case 'app:settings':
        await router.push('/settings');
        break;

      case 'chat:new': {
        // 动态引入：chat store 体量很大，没必要因为一个菜单项就把它拉进入口 chunk
        const { useChatStore } = await import('@/stores/chat');
        await useChatStore().newSession();
        if (router.currentRoute.value.path !== '/chat') await router.push('/chat');
        break;
      }

      case 'chat:stop': {
        const { useChatStore } = await import('@/stores/chat');
        const chat = useChatStore();
        // 没有生成任务时不打扰用户，避免误触后弹出无意义的提示
        if (chat.isLoading) chat.stopGeneration();
        break;
      }

      case 'chat:clearInput':
        // 复用 ChatView 已有的约定：输入框监听的就是这个自定义事件
        window.dispatchEvent(new CustomEvent('clear-input'));
        break;

      case 'view:theme':
        toggleTheme();
        break;

      default:
        // 剩下的都是页面命令（chat:import / chat:export）
        await dispatchToPage(command.id);
    }
  }

  onMounted(() => {
    const subscribe = window.desktop?.events?.onMenuCommand;
    // 浏览器环境没有菜单栏，这里静默降级，不影响 Web 端运行
    if (!subscribe) return;
    const isPreviewWindow = router.currentRoute.value.path === PREVIEW_WINDOW_PATH;

    dispose = subscribe((command) => {
      // 菜单是全局的，推送会到达每个窗口。预览窗口只认主题这类无副作用命令：
      // 它要是跟着执行"新建对话/跳转设置"，用户正在看的那份文件当场被顶掉。
      if (isPreviewWindow) {
        if (command.id === 'view:theme') toggleTheme();
        return;
      }
      // 单个命令失败不能影响后续的菜单点击
      void handle(command).catch((e) =>
        console.warn('[app-commands] 命令执行失败:', command.id, e)
      );
    });
  });

  onUnmounted(() => {
    dispose?.();
    dispose = null;
  });
}
