#!/bin/bash
# Set up workspace directory and user prompt for Codevv.
# Env vars CODEVV_USER and CODEVV_PROJECT are set by the workspace service.

USER_NAME="${CODEVV_USER:-dev}"
PROJECT="${CODEVV_PROJECT:-workspace}"

# Create project directory inside workspace root
mkdir -p "/config/workspace/${PROJECT}"
chown 1000:1000 "/config/workspace/${PROJECT}"

# Set up user-local npm global prefix so abc can npm install -g
NPM_DIR="/config/.npm-global"
mkdir -p "$NPM_DIR"
chown 1000:1000 "$NPM_DIR"

# Customize bash prompt — show display name + project name in Codevv colors
BASHRC="/config/.bashrc"
# Remove any previous CODEVV prompt block
sed -i '/# CODEVV_PROMPT_START/,/# CODEVV_PROMPT_END/d' "$BASHRC" 2>/dev/null

cat >> "$BASHRC" << PROMPT
# CODEVV_PROMPT_START
export PS1='\[\033[01;36m\]${USER_NAME}\[\033[00m\]@\[\033[01;35m\]${PROJECT}\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
export NPM_CONFIG_PREFIX="/config/.npm-global"
export PATH="/config/.npm-global/bin:\$PATH"
cd "/config/workspace/${PROJECT}" 2>/dev/null
# CODEVV_PROMPT_END
PROMPT
