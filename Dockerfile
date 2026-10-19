ARG OPENCLAW_BASE_IMAGE=ghcr.io/openclaw/openclaw:latest
FROM ${OPENCLAW_BASE_IMAGE}

# 底座三件套：git/gh（票与 PR）、Claude Code（三 agent 统一引擎 claude-cli）
USER root
RUN (apt-get update && apt-get install -y --no-install-recommends git gh ca-certificates && rm -rf /var/lib/apt/lists/*) \
  || (apk add --no-cache git github-cli ca-certificates)
# 基础镜像的 npm 默认 ignore-scripts/omit=optional，会挡掉 claude-code 安装脚本
RUN npm_config_ignore_scripts=false npm_config_omit= \
    npm install -g @anthropic-ai/claude-code \
 && claude --version

USER node
WORKDIR /workspace/factory
