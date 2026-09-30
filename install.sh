#!/usr/bin/env bash
set -euo pipefail

# ASCII Header & Colors
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
MAGENTA="\033[0;35m"
BOLD="\033[1m"
NC="\033[0m"

print_header() {
    cat << "EOF"
  ██████╗ ██████╗ ███████╗███╗   ██╗██╗   ██╗███████╗
 ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██║   ██║██╔════╝
 ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║   ██║███████╗
 ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║   ██║╚════██║
 ╚██████╔╝██║     ███████╗██║ ╚████║╚██████╔╝███████║
  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝
      OpenCode Orchestrator Suite Installer
EOF
    echo -e "${CYAN}======================================================${NC}"
}

usage() {
    echo -e "${BOLD}Usage:${NC} $0 [options]"
    echo ""
    echo -e "${BOLD}Options:${NC}"
    echo "  --target <dir>   Target config directory (default: ~/.config/opencode)"
    echo "  --bin-dir <dir>  Target binary directory (default: ~/.local/bin)"
    echo "  --symlink        Create symlinks instead of copying files"
    echo "  --copy           Copy files directly (default mode)"
    echo "  --force          Overwrite existing files without backup"
    echo "  --help           Show this help message"
    exit 0
}

TARGET_DIR="$HOME/.config/opencode"
BIN_DIR="$HOME/.local/bin"
MODE="copy"
FORCE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)
            TARGET_DIR="$2"
            shift 2
            ;;
        --bin-dir)
            BIN_DIR="$2"
            shift 2
            ;;
        --symlink)
            MODE="symlink"
            shift
            ;;
        --copy)
            MODE="copy"
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

print_header

echo -e "${BLUE}Target config directory:${NC} ${TARGET_DIR}"
echo -e "${BLUE}Target bin directory:${NC}    ${BIN_DIR}"
echo -e "${BLUE}Installation mode:${NC}       ${MODE}"
echo -e "${BLUE}Force overwrite:${NC}         ${FORCE}"
echo ""

mkdir -p "${TARGET_DIR}/agents" "${TARGET_DIR}/memory" "${TARGET_DIR}/plugins" "${BIN_DIR}"

install_item() {
    local src="$1"
    local dest="$2"

    if [[ -e "$dest" || -L "$dest" ]]; then
        if [[ "$FORCE" == false ]]; then
            echo -e "${YELLOW}Backing up existing ${dest} to ${dest}.bak.${TIMESTAMP}${NC}"
            mv "$dest" "${dest}.bak.${TIMESTAMP}"
        else
            rm -rf "$dest"
        fi
    fi

    if [[ "$MODE" == "symlink" ]]; then
        ln -sf "$src" "$dest"
        echo -e "${GREEN}[SYMLINK]${NC} $dest -> $src"
    else
        cp -r "$src" "$dest"
        echo -e "${GREEN}[COPIED]${NC}  $src -> $dest"
    fi
}

echo -e "${BOLD}${MAGENTA}1. Installing Agent Definitions...${NC}"
for agent in "${SCRIPT_DIR}/agents/"*.md; do
    if [[ -f "$agent" ]]; then
        filename=$(basename "$agent")
        install_item "$agent" "${TARGET_DIR}/agents/${filename}"
    fi
done

echo ""
echo -e "${BOLD}${MAGENTA}2. Installing Memory Files...${NC}"
for mem in "${SCRIPT_DIR}/memory/"*.md; do
    if [[ -f "$mem" ]]; then
        filename=$(basename "$mem")
        install_item "$mem" "${TARGET_DIR}/memory/${filename}"
    fi
done

echo ""
echo -e "${BOLD}${MAGENTA}3. Installing Plugins (Plan Panel & Remote)...${NC}"
if [[ -d "${SCRIPT_DIR}/plugins" ]]; then
    for plugin in "${SCRIPT_DIR}/plugins/"*; do
        if [[ -d "$plugin" ]]; then
            pname=$(basename "$plugin")
            install_item "$plugin" "${TARGET_DIR}/plugins/${pname}"
        fi
    done
fi

echo ""
echo -e "${BOLD}${MAGENTA}4. Installing CLI Tools (opencode-remote & aliases)...${NC}"
if [[ -f "${SCRIPT_DIR}/scripts/opencode-remote" ]]; then
    chmod +x "${SCRIPT_DIR}/scripts/opencode-remote"
    install_item "${SCRIPT_DIR}/scripts/opencode-remote" "${BIN_DIR}/opencode-remote"
    # Create aliases
    ln -sf "${BIN_DIR}/opencode-remote" "${BIN_DIR}/ocd"
    ln -sf "${BIN_DIR}/opencode-remote" "${BIN_DIR}/oc-remote"
    echo -e "${GREEN}[ALIAS]${NC}   ${BIN_DIR}/ocd -> ${BIN_DIR}/opencode-remote"
    echo -e "${GREEN}[ALIAS]${NC}   ${BIN_DIR}/oc-remote -> ${BIN_DIR}/opencode-remote"
fi

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${NC}"
echo -e "Agents:  ${CYAN}${TARGET_DIR}/agents${NC}"
echo -e "Memory:  ${CYAN}${TARGET_DIR}/memory${NC}"
echo -e "Plugins: ${CYAN}${TARGET_DIR}/plugins${NC}"
echo -e "CLI:     ${CYAN}${BIN_DIR}/opencode-remote (aliases: ocd, oc-remote)${NC}"
