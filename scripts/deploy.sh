#!/bin/bash

# TaskMaster2 - Production Deployment Script
# Usage: ./scripts/deploy.sh [domain] [email]

set -e

DOMAIN=${1:-"taskmaster.local"}
EMAIL=${2:-"admin@taskmaster.local"}
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 TaskMaster2 Production Deployment"
echo "===================================="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo "Repository: $REPO_DIR"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    log_error "Docker not found. Install it with: curl -fsSL https://get.docker.com | sh"
    exit 1
fi
log_info "Docker found"

if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose not found"
    exit 1
fi
log_info "Docker Compose found"

# Setup SSL
echo ""
echo "🔐 Setting up SSL certificates..."

if [ ! -f "$REPO_DIR/nginx/ssl/cert.pem" ]; then
    mkdir -p "$REPO_DIR/nginx/ssl"
    
    if [ "$DOMAIN" = "taskmaster.local" ] || [ "$DOMAIN" = "localhost" ]; then
        log_info "Generating self-signed certificate..."
        openssl req -x509 -newkey rsa:4096 \
            -keyout "$REPO_DIR/nginx/ssl/key.pem" \
            -out "$REPO_DIR/nginx/ssl/cert.pem" \
            -days 365 -nodes \
            -subj "/C=PL/ST=State/L=City/O=Organization/CN=$DOMAIN"
    else
        log_warn "For Let's Encrypt, run: ./scripts/setup-ssl.sh $DOMAIN $EMAIL"
        log_info "Using self-signed certificate for now..."
        openssl req -x509 -newkey rsa:4096 \
            -keyout "$REPO_DIR/nginx/ssl/key.pem" \
            -out "$REPO_DIR/nginx/ssl/cert.pem" \
            -days 365 -nodes \
            -subj "/C=PL/ST=State/L=City/O=Organization/CN=$DOMAIN"
    fi
else
    log_info "SSL certificates already exist"
fi

# Setup environment
echo ""
echo "⚙️  Setting up environment..."

if [ ! -f "$REPO_DIR/.env" ]; then
    log_info "Creating .env from .env.production..."
    cp "$REPO_DIR/.env.production" "$REPO_DIR/.env"
    
    # Generate SECRET_KEY
    SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
    sed -i "s/change-me-to-random-secret-key-32-chars-min/$SECRET_KEY/" "$REPO_DIR/.env"
    
    # Update CORS_ORIGINS
    sed -i "s/taskmaster.example.com/$DOMAIN/" "$REPO_DIR/.env"
    sed -i "s/192.168.1.100/$DOMAIN/" "$REPO_DIR/.env"
    
    log_info ".env created with random SECRET_KEY"
    log_warn "⚠️  Update .env with your settings:"
    log_warn "   - DEFAULT_ADMIN_PASSWORD"
    log_warn "   - MAIL_* (if needed)"
else
    log_info ".env already exists"
fi

# Update Nginx config
echo ""
echo "🌐 Updating Nginx configuration..."

NGINX_CONF="$REPO_DIR/nginx/conf.d/taskmaster.conf"
if [ -f "$NGINX_CONF" ]; then
    # Backup original
    cp "$NGINX_CONF" "$NGINX_CONF.bak"
    
    # Update server_name (simple replacement)
    sed -i "s/server_name _;/server_name $DOMAIN;/" "$NGINX_CONF"
    log_info "Nginx configuration updated"
else
    log_error "Nginx configuration not found at $NGINX_CONF"
    exit 1
fi

# Build and start containers
echo ""
echo "🐳 Building and starting containers..."

cd "$REPO_DIR"

log_info "Building Docker images..."
docker-compose -f docker-compose.prod.yml build --no-cache

log_info "Starting containers..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to be ready..."

for i in {1..30}; do
    if curl -s -k https://localhost/health > /dev/null 2>&1; then
        log_info "Services are ready!"
        break
    fi
    echo -n "."
    sleep 1
done

# Verify deployment
echo ""
echo "✅ Verifying deployment..."

if docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    log_info "All containers are running"
else
    log_error "Some containers are not running"
    docker-compose -f docker-compose.prod.yml ps
    exit 1
fi

# Test endpoints
echo ""
echo "🧪 Testing endpoints..."

if curl -s -k https://localhost/health | grep -q "healthy"; then
    log_info "Health check passed"
else
    log_error "Health check failed"
fi

if curl -s -k https://localhost/ready | grep -q "ready"; then
    log_info "Readiness check passed"
else
    log_error "Readiness check failed"
fi

# Summary
echo ""
echo "🎉 Deployment complete!"
echo "===================================="
echo ""
echo "📍 Access your application:"
echo "   https://$DOMAIN"
echo ""
echo "🔑 Default credentials:"
echo "   Username: admin"
echo "   Password: (check .env DEFAULT_ADMIN_PASSWORD)"
echo ""
echo "📋 Next steps:"
echo "   1. Change DEFAULT_ADMIN_PASSWORD in .env"
echo "   2. Configure FortiGate firewall rules"
echo "   3. Set up SSL certificate (Let's Encrypt recommended)"
echo "   4. Configure backup strategy"
echo "   5. Set up monitoring"
echo ""
echo "📚 Documentation: $REPO_DIR/DEPLOYMENT_NGINX.md"
echo ""
echo "🆘 Troubleshooting:"
echo "   docker-compose -f docker-compose.prod.yml logs -f"
echo ""
