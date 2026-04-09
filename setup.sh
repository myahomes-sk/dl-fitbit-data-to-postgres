#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Fitbit Data Environment Setup...${NC}"

# 1. Install Docker if missing
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker is not installed. Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker installed successfully! Note: you may need to log out and log back in for group permissions to properly register.${NC}"
else
    echo -e "${GREEN}Docker is already installed.${NC}"
fi

# 2. Check for node/npm
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js is not installed. Installing...${NC}"
    # Using NodeSource for Ubuntu/Debian based systems
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo -e "${GREEN}Node.js installed successfully!${NC}"
else
    echo -e "${GREEN}Node.js is already installed. ($(node -v))${NC}"
fi

# 3. Create .env if missing 
if [ ! -f .env ]; then
    echo -e "${YELLOW}No .env file found. Copying .env.example -> .env${NC}"
    cp .env.example .env
fi

# Override .env safely if it contains the old Supabase connection, otherwise leave it
if grep -q "gyzvfktjqxftyenxgjpx.supabase" .env; then
    echo -e "${YELLOW}Detected old Supabase config. Overwriting with local configuration...${NC}"
    cp .env.example .env
fi

# 4. Spin up the Postgres Database
echo -e "${GREEN}Starting offline Postgres database...${NC}"
if docker compose version &> /dev/null; then
    # Docker compose v2
    docker compose up -d
else
    # Fallback to docker-compose v1
    echo -e "${YELLOW}Using legacy docker-compose${NC}"
    docker-compose up -d
fi

# Wait for healthy DB
echo -e "${YELLOW}Waiting 5 seconds for Postgres to initialize...${NC}"
sleep 5

# 5. NPM stuff
echo -e "${GREEN}Installing required NPM packages...${NC}"
npm install

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "You can now run ${YELLOW}node auto_migrate.js${NC} to migrate everything locally."
echo -e "${GREEN}==========================================${NC}"
