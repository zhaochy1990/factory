# QA E2E 报告 · {{RUN_ID}}

> qa1 生成于 {{GENERATED_AT}} · harness={{HARNESS_SHA}} · 模板 harness/report/template.md

## 一、结论

{{CONCLUSION}}

## 二、环境

| 项 | 值 |
|---|---|
| 时间 | {{STARTED_AT}} → {{FINISHED_AT}} |
| running commit | {{RUNNING_SHA}} |
| stride-devops commit | {{DEVOPS_SHA}} |
| factory(harness) commit | {{HARNESS_SHA}} |
| fixture 版本 | {{FIXTURE_VERSION}} |
| 栈 | {{STACK_DESC}} |

### 无 mock checklist（五项）

{{NO_MOCK_CHECKLIST}}

## 三、用例明细

{{CASES_TABLE}}

## 四、回归冒烟

{{REGRESSION}}

## 五、建议

{{SUGGESTIONS}}
