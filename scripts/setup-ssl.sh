#!/bin/bash

# Setup SSL certificates for TaskMaster2
# Usage: ./scripts/setup-ssl.sh [domain] [email]

set -e

DOMAIN=${1:-"taskmaster.local"}
EMAIL=${2:-"admin@taskmaster.local"}
SSL_DIR="./nginx/ssl"
CERTBOT_DIR="./nginx/certbot"

echo "🔐 Setting up SSL certificates for TaskMaster2"
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"

# Create directories
mkdir -p "$SSL_DIR"
mkdir -p "$CERTBOT_DIR/conf"
mkdir -p "$CERTBOT_DIR/www"

# Option 1: Self-signed certificate (for testing/internal use)
if [ "$DOMAIN" = "taskmaster.local" ] || [ "$DOMAIN" = "localhost" ]; then
    echo "📝 Generating self-signed certificate (for internal use)..."
    
    openssl req -x509 -newkey rsa:4096 -keyout "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
        -days 365 -nodes \
        -subj "/C=PL/ST=State/L=City/O=Organization/CN=$DOMAIN"
    
    echo "✅ Self-signed certificate created:"
    echo "   Certificate: $SSL_DIR/cert.pem"
    echo "   Key: $SSL_DIR/key.pem"
    echo ""
    echo "⚠️  WARNING: Self-signed certificates will show browser warnings."
    echo "   For production, use Let's Encrypt (see setup-letsencrypt.sh)"
    
# Option 2: Let's Encrypt certificate (for production)
else
    echo "📝 Setting up Let's Encrypt certificate..."
    echo "   This requires your domain to be publicly accessible."
    echo ""
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        echo "❌ certbot not found. Install it with:"
        echo "   sudo apt-get install certbot"
        exit 1
    fi
    
    # Generate certificate
    certbot certonly --standalone \
        -d "$DOMAIN" \
        -m "$EMAIL" \
        --agree-tos \
        --non-interactive \
        --cert-path "$CERTBOT_DIR/conf/live/$DOMAIN/cert.pem" \
        --key-path "$CERTBOT_DIR/conf/live/$DOMAIN/privkey.pem"
    
    # Copy to nginx directory
    cp "$CERTBOT_DIR/conf/live/$DOMAIN/cert.pem" "$SSL_DIR/cert.pem"
    cp "$CERTBOT_DIR/conf/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"
    
    echo "✅ Let's Encrypt certificate created:"
    echo "   Certificate: $SSL_DIR/cert.pem"
    echo "   Key: $SSL_DIR/key.pem"
    echo ""
    echo "📅 Certificate expires in 90 days."
    echo "   Set up auto-renewal with: sudo certbot renew --dry-run"
fi

echo ""
echo "🚀 Next steps:"
echo "   1. Update nginx/conf.d/taskmaster.conf with your domain"
echo "   2. Run: docker-compose -f docker-compose.prod.yml up -d"
echo "   3. Access: https://$DOMAIN"
