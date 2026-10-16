// ===== Jenkins 初始化：创建管理员账号 + 登录授权 =====
// 首次启动执行一次；之后重启不会覆盖已有配置（判断了当前 realm 类型）
import jenkins.model.*
import hudson.security.*

def jenkins = Jenkins.get()
def adminUser = System.getenv('ADMIN_USER') ?: 'admin'
def adminPassword = System.getenv('ADMIN_PASSWORD') ?: 'zhizhi123'

if (!(jenkins.getSecurityRealm() instanceof HudsonPrivateSecurityRealm)) {
    def realm = new HudsonPrivateSecurityRealm(false)
    realm.createAccount(adminUser, adminPassword)
    jenkins.setSecurityRealm(realm)
    println "[init] 已创建管理员账号: ${adminUser}"
}

if (!(jenkins.getAuthorizationStrategy() instanceof FullControlOnceLoggedInAuthorizationStrategy)) {
    def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
    strategy.setAllowAnonymousRead(false)
    jenkins.setAuthorizationStrategy(strategy)
    println '[init] 已启用登录授权策略'
}

// 为 admin 生成 API Token：用 token 走 Basic Auth 调 API 时自动豁免 CSRF crumb，
// CI 脚本（触发构建/查状态）全靠它。token 明文只在生成瞬间打印到容器日志。
def user = hudson.model.User.getById(adminUser, true)
def apiProp = user.getProperty(jenkins.security.ApiTokenProperty)
if (apiProp == null) {
    apiProp = new jenkins.security.ApiTokenProperty()
    user.addProperty(apiProp)
}
if (!apiProp.tokenList.any { it.name == 'ci-auto' }) {
    def res = apiProp.tokenStore.generateNewToken('ci-auto')
    user.save()
    println "[init] ADMIN_API_TOKEN=${res.plainValue}"
} else {
    println '[init] API token ci-auto 已存在（明文不可恢复，如需重置请在 UI 中删除后重启）'
}

jenkins.save()
