#!/bin/bash

# TaskMaster2 - Monitoring Script
# Displays real-time status and logs

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

clear

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         TaskMaster2 - Production Monitoring                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to display container status
show_status() {
    echo -e "${BLUE}📊 Container Status:${NC}"
    docker-compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"
    echo ""
}

# Function to display resource usage
show_resources() {
    echo -e "${BLUE}💾 Resource Usage:${NC}"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
    echo ""
}

# Function to display health checks
show_health() {
    echo -e "${BLUE}🏥 Health Checks:${NC}"
    
    # Flask health
    if curl -s -k https://localhost/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Flask API: Healthy"
    else
        echo -e "${RED}✗${NC} Flask API: Unhealthy"
    fi
    
    # Nginx health
    if docker-compose exec nginx nginx -t > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Nginx: Healthy"
    else
        echo -e "${RED}✗${NC} Nginx: Unhealthy"
    fi
    
    # Socket.IO
    if curl -s -k https://localhost/socket.io/ > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Socket.IO: Healthy"
    else
        echo -e "${RED}✗${NC} Socket.IO: Unhealthy"
    fi
    
    echo ""
}

# Function to display recent logs
show_logs() {
    echo -e "${BLUE}📝 Recent Logs (last 10 lines):${NC}"
    echo ""
    
    echo -e "${YELLOW}Flask:${NC}"
    docker-compose logs --tail=5 web
    echo ""
    
    echo -e "${YELLOW}Nginx:${NC}"
    docker-compose logs --tail=5 nginx
    echo ""
}

# Function to display disk usage
show_disk() {
    echo -e "${BLUE}💿 Disk Usage:${NC}"
    
    # Instance directory
    INSTANCE_SIZE=$(docker-compose exec web du -sh /app/instance 2>/dev/null | cut -f1)
    echo "Instance directory: $INSTANCE_SIZE"
    
    # Docker volumes
    echo ""
    echo "Docker volumes:"
    docker volume ls --format "table {{.Name}}\t{{.Driver}}"
    echo ""
}

# Function to display network info
show_network() {
    echo -e "${BLUE}🌐 Network Info:${NC}"
    
    # Check if accessible from localhost
    if curl -s -k https://localhost/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Accessible from localhost"
    else
        echo -e "${RED}✗${NC} Not accessible from localhost"
    fi
    
    # Get container IPs
    echo ""
    echo "Container IPs:"
    docker-compose exec web hostname -I 2>/dev/null || echo "N/A"
    echo ""
}

# Main menu
show_menu() {
    echo -e "${BLUE}Select option:${NC}"
    echo "1) Show container status"
    echo "2) Show resource usage"
    echo "3) Show health checks"
    echo "4) Show recent logs"
    echo "5) Show disk usage"
    echo "6) Show network info"
    echo "7) Show all"
    echo "8) Follow logs (live)"
    echo "9) Restart containers"
    echo "0) Exit"
    echo ""
}

# Handle user input
handle_input() {
    read -p "Enter option: " choice
    
    case $choice in
        1)
            clear
            show_status
            ;;
        2)
            clear
            show_resources
            ;;
        3)
            clear
            show_health
            ;;
        4)
            clear
            show_logs
            ;;
        5)
            clear
            show_disk
            ;;
        6)
            clear
            show_network
            ;;
        7)
            clear
            show_status
            show_resources
            show_health
            show_disk
            show_network
            ;;
        8)
            clear
            echo -e "${BLUE}Following logs (Ctrl+C to exit)...${NC}"
            echo ""
            docker-compose logs -f
            ;;
        9)
            echo -e "${YELLOW}Restarting containers...${NC}"
            docker-compose restart
            echo -e "${GREEN}✓ Containers restarted${NC}"
            sleep 2
            clear
            show_status
            ;;
        0)
            echo "Goodbye!"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            ;;
    esac
}

# Main loop
while true; do
    show_menu
    handle_input
    echo ""
    read -p "Press Enter to continue..."
    clear
done
