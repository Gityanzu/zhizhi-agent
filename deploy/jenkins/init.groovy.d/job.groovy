// ===== Jenkins 初始化：自动创建 zhizhi-agent 流水线任务 =====
// SCM 指向只读挂载进容器的仓库目录（file:// 协议），
// Pipeline 脚本取仓库根的 Jenkinsfile —— 与 GitHub Actions 同一套构建逻辑。
import jenkins.model.*
import hudson.plugins.git.GitSCM
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition

def jenkins = Jenkins.get()

if (!jenkins.getItem('zhizhi-agent')) {
    def job = (WorkflowJob) jenkins.createProject(WorkflowJob, 'zhizhi-agent')
    job.displayName = '智知 Agent 自动部署'
    job.description = '''质量门禁 → 单元测试 → Docker 镜像构建 → compose 部署 → 健康检查。
tag v* 时额外打包 Windows 桌面端安装包。与 .github/workflows 同源。'''
    job.definition = new CpsScmFlowDefinition(
        new GitSCM('file:///workspace/zhizhi-agent'),
        'Jenkinsfile'
    )
    job.save()
    println '[init] 已创建流水线任务: zhizhi-agent（SCM=file:///workspace/zhizhi-agent）'
} else {
    println '[init] 任务 zhizhi-agent 已存在，跳过'
}
