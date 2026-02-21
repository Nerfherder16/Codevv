#!/bin/bash
# Trust all origins for WebSocket CSRF check.
# Codevv handles auth at the proxy layer — code-server runs password-free
# behind the reverse proxy, so the ensureOrigin() check just gets in the way.

mkdir -p /config/data

# Append trusted-origins if not already present in config
if [ -f /config/data/config.yaml ]; then
  if ! grep -q "trusted-origins" /config/data/config.yaml; then
    printf '\ntrusted-origins:\n  - "*"\n' >> /config/data/config.yaml
  fi
else
  cat > /config/data/config.yaml <<'CONF'
trusted-origins:
  - "*"
CONF
fi
