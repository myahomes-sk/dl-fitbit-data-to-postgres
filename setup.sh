#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting Fitbit Data Environment Setup...${NC}"

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Linux*)   PLATFORM="linux" ;;
    Darwin*)  PLATFORM="mac" ;;
    *)        echo -e "${RED}Unsupported OS: $OS${NC}"; exit 1 ;;
esac

echo -e "${GREEN}Detected platform: ${PLATFORM}${NC}"

# ─────────────────────────────────────────────
# 1. Install Docker
# ─────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker is not installed.${NC}"

    if [ "$PLATFORM" = "linux" ]; then
        echo -e "${YELLOW}Installing Docker via get.docker.com...${NC}"
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
        sudo usermod -aG docker "$USER"
        echo -e "${GREEN}Docker installed! Note: you may need to log out and back in for group changes to take effect.${NC}"

    elif [ "$PLATFORM" = "mac" ]; then
        if command -v brew &> /dev/null; then
            echo -e "${YELLOW}Installing Docker Desktop via Homebrew...${NC}"
            brew install --cask docker
            echo -e "${YELLOW}Opening Docker Desktop — wait for it to finish starting, then press Enter to continue.${NC}"
            open -a Docker
            read -p "Press Enter once Docker Desktop is running..."
        else
            echo -e "${RED}Docker is not installed.${NC}"
            echo -e "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop/"
            echo -e "Then re-run this script."
            exit 1
        fi
    fi
else
    echo -e "${GREEN}Docker is already installed. ✓${NC}"
fi

# ─────────────────────────────────────────────
# 2. Install Node.js
# ─────────────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js is not installed.${NC}"

    if [ "$PLATFORM" = "linux" ]; then
        echo -e "${YELLOW}Installing Node.js via NodeSource...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs

    elif [ "$PLATFORM" = "mac" ]; then
        if command -v brew &> /dev/null; then
            echo -e "${YELLOW}Installing Node.js via Homebrew...${NC}"
            brew install node
        else
            echo -e "${RED}Node.js is not installed and Homebrew was not found.${NC}"
            echo -e "Install Node.js from: https://nodejs.org/en/download"
            echo -e "Or install Homebrew first: https://brew.sh, then re-run this script."
            exit 1
        fi
    fi

    echo -e "${GREEN}Node.js installed! ($(node -v))${NC}"
else
    echo -e "${GREEN}Node.js is already installed. ($(node -v)) ✓${NC}"
fi

# ─────────────────────────────────────────────
# 3. Set up .env
# ─────────────────────────────────────────────
if [ ! -f .env ]; then
    echo -e "${YELLOW}No .env file found. Copying .env.example -> .env${NC}"
    cp .env.example .env
fi

# Overwrite if still pointing to old Supabase cloud credentials
if grep -q "supabase" .env 2>/dev/null; then
    echo -e "${YELLOW}Detected old Supabase config in .env. Resetting to local...${NC}"
    cp .env.example .env
fi

# ─────────────────────────────────────────────
# 4. Start the local Postgres database
# ─────────────────────────────────────────────
echo -e "${GREEN}Starting offline Postgres database...${NC}"
if docker compose version &> /dev/null; then
    docker compose up -d
else
    docker-compose up -d
fi

echo -e "${YELLOW}Waiting 5 seconds for Postgres to initialize...${NC}"
sleep 5

# ─────────────────────────────────────────────
# 5. Install NPM packages
# ─────────────────────────────────────────────
echo -e "${GREEN}Installing Node.js packages...${NC}"
npm install

# ─────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────
echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "Next step — run the migration to load your Fitbit data:"
echo -e "  ${YELLOW}node auto_migrate.js${NC}"
echo ""
echo -e "Then connect to the database:"
echo -e "  ${YELLOW}docker exec -it fitbit-postgres psql -U fitbit_user -d fitbit_db${NC}"
echo ""
