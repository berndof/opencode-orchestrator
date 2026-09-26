#!/usr/bin/env bash
set -euo pipefail

# ASCII Header & Colors
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
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
    echo "  --target <dir>  Target directory (default: ~/.config/opencode)"
    echo "  --symlink       Create symlinks instead of copying files"
    echo "  --copy          Copy files directly (default mode)"
    echo "  --force         Overwrite existing files without prompting"
    echo "  --help          Show this help message"
    exit 0
}

TARGET_DIR="$HOME/.config/opencode"
MODE="copy"
FORCE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)
            TARGET_DIR="$2"
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

echo -e "${BLUE}Target directory:${NC} ${TARGET_DIR}"
echo -e "${BLUE}Installation mode:${NC} ${MODE}"
echo -e "${BLUE}Force overwrite:${NC} ${FORCE}"
echo ""

mkdir -p "${TARGET_DIR}/agents" "${TARGET_DIR}/memory"

install_file() {
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
        echo -e "${GREEN}[COPIED]${NC} $src -> $dest"
    fi
}

echo -e "${BOLD}Installing Agent Definitions...${NC}"
for agent in "${SCRIPT_DIR}/agents/"*.md; do
    if [[ -f "$agent" ]]; then
        filename=$(basename "$agent")
        install_file "$agent" "${TARGET_DIR}/agents/${filename}"
    fi
done

echo ""
echo -e "${BOLD}Installing Memory Files...${NC}"
for mem in "${SCRIPT_DIR}/memory/"*.md; do
    if [[ -f "$mem" ]]; then
        filename=$(basename "$mem")
        install_file "$mem" "${TARGET_DIR}/memory/${filename}"
    fi
done

echo ""
echo -e "${GREEN}${BOLD}Installation complete!${NC}"
echo -e "Agent configurations installed to ${CYAN}${TARGET_DIR}/agents${NC}"
echo -e "Memory configurations installed to ${CYAN}${TARGET_DIR}/memory${NC}"
