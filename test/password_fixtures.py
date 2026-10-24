"""运行时生成的测试口令。

注册/登录/改密链路需要真实可用的口令，但仓库里不应出现字面量口令——
安全扫描会按「硬编码凭据」拦截。改用 secrets 运行时生成，等价类关系：

- PW_A：用户注册时的口令（conftest 的 auth_headers 夹具与多数用例）
- PW_B：改密后的新口令 / 第二变体
- PW_C：改密链路里的第三变体（冷却期用例）
- PW_WRONG：必须错误的口令
- 短口令用例取 PW_A[:5]（< 6 位触发 422），超长口令用例用 "密" * 25 表达式
"""
import secrets

PW_A = secrets.token_urlsafe(12)
PW_B = secrets.token_urlsafe(12)
PW_C = secrets.token_urlsafe(12)
PW_WRONG = secrets.token_urlsafe(12)
