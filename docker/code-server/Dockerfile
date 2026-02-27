FROM lscr.io/linuxserver/code-server:latest

RUN apt-get update && \
    apt-get install -y --no-install-recommends tmux curl && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js 22 LTS (for Claude Code CLI and general dev use)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Pre-install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Trust all origins for WebSocket CSRF check (auth handled at proxy layer)
COPY trusted-origins.sh /custom-cont-init.d/99-trusted-origins
RUN chmod +x /custom-cont-init.d/99-trusted-origins

# Set up project directory + custom prompt
COPY setup-workspace.sh /custom-cont-init.d/98-setup-workspace
RUN chmod +x /custom-cont-init.d/98-setup-workspace
