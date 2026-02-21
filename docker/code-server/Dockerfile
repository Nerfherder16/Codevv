FROM lscr.io/linuxserver/code-server:latest

RUN apt-get update && \
    apt-get install -y --no-install-recommends tmux && \
    rm -rf /var/lib/apt/lists/*

# Trust all origins for WebSocket CSRF check (auth handled at proxy layer)
COPY trusted-origins.sh /custom-cont-init.d/99-trusted-origins
RUN chmod +x /custom-cont-init.d/99-trusted-origins
