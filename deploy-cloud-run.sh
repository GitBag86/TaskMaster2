#!/bin/bash
# Deploy TaskMaster2 to Google Cloud Run
# Usage: ./deploy-cloud-run.sh <project-id> <region> [instance-name]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate inputs
if [ -z "$1" ]; then
  echo -e "${RED}Error: Missing project ID${NC}"
  echo "Usage: $0 <project-id> <region> [instance-name]"
  echo "Example: $0 my-project us-central1 taskmaster"
  exit 1
fi

PROJECT_ID="$1"
REGION="${2:-us-central1}"
INSTANCE_NAME="${3:-taskmaster}"
SERVICE_NAME="taskmaster2"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo -e "${GREEN}========================================${NC}"
echo "TaskMaster2 Cloud Run Deployment"
echo -e "${GREEN}========================================${NC}"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "SQL Instance: $INSTANCE_NAME"
echo "Image: $IMAGE_NAME"

# Step 1: Get Cloud SQL connection name
echo -e "\n${YELLOW}Step 1: Getting Cloud SQL connection info...${NC}"
INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --format='value(connectionName)' 2>/dev/null || true)

if [ -z "$INSTANCE_CONNECTION_NAME" ]; then
  echo -e "${RED}Error: Could not find Cloud SQL instance '$INSTANCE_NAME'${NC}"
  echo "Create it first with:"
  echo "  gcloud sql instances create $INSTANCE_NAME \\"
  echo "    --project=$PROJECT_ID \\"
  echo "    --database-version=POSTGRES_15 \\"
  echo "    --tier=db-f1-micro \\"
  echo "    --region=$REGION"
  exit 1
fi

echo "Connection Name: $INSTANCE_CONNECTION_NAME"

# Step 2: Get database password
echo -e "\n${YELLOW}Step 2: Getting database password...${NC}"
read -sp "Enter database password for 'appuser' (or press Enter to generate random): " DB_PASSWORD
echo ""

if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD=$(openssl rand -base64 32)
  echo "Generated password: $DB_PASSWORD"
  echo -e "${YELLOW}NOTE: You'll need to update the Cloud SQL user password!${NC}"
  echo "Run: gcloud sql users update appuser --instance=$INSTANCE_NAME --password=$DB_PASSWORD"
fi

# Step 3: Generate SECRET_KEY
echo -e "\n${YELLOW}Step 3: Generating Flask SECRET_KEY...${NC}"
SECRET_KEY=$(openssl rand -hex 32)
echo "Generated SECRET_KEY: $SECRET_KEY"

# Step 4: Get CORS origins
echo -e "\n${YELLOW}Step 4: Configuring CORS origins...${NC}"
read -p "Enter CORS origins (comma-separated, or press Enter for any): " CORS_ORIGINS
if [ -z "$CORS_ORIGINS" ]; then
  CORS_ORIGINS="*"
fi

# Step 5: Build Docker image
echo -e "\n${YELLOW}Step 5: Building Docker image...${NC}"
echo "Building: $IMAGE_NAME:latest"
docker build -t "$IMAGE_NAME:latest" .

# Step 6: Push to Container Registry
echo -e "\n${YELLOW}Step 6: Pushing image to Google Container Registry...${NC}"
docker push "$IMAGE_NAME:latest"

# Step 7: Deploy to Cloud Run
echo -e "\n${YELLOW}Step 7: Deploying to Cloud Run...${NC}"
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME:latest" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --max-instances 10 \
  --project "$PROJECT_ID" \
  --set-env-vars \
    "INSTANCE_UNIX_SOCKET=/cloudsql/${INSTANCE_CONNECTION_NAME}",\
    "DB_NAME=taskmaster_db",\
    "DB_USER=appuser",\
    "DB_PASSWORD=${DB_PASSWORD}",\
    "SECRET_KEY=${SECRET_KEY}",\
    "FLASK_ENV=production",\
    "CORS_ORIGINS=${CORS_ORIGINS}",\
    "ENABLE_SCHEDULER=false",\
    "PORT=8080" \
  --add-cloudsql-instances "$INSTANCE_CONNECTION_NAME"

# Step 8: Get service URL
echo -e "\n${YELLOW}Step 8: Getting service URL...${NC}"
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --format='value(status.url)' \
  --project "$PROJECT_ID")

echo "Service URL: $SERVICE_URL"

# Step 9: Run migrations
echo -e "\n${YELLOW}Step 9: Running database migrations...${NC}"
echo "Note: Using gcloud run jobs to execute migrations..."

# Create a migration job
gcloud beta run jobs create "${SERVICE_NAME}-migrate" \
  --image "$IMAGE_NAME:latest" \
  --region "$REGION" \
  --set-env-vars \
    "INSTANCE_UNIX_SOCKET=/cloudsql/${INSTANCE_CONNECTION_NAME}",\
    "DB_NAME=taskmaster_db",\
    "DB_USER=appuser",\
    "DB_PASSWORD=${DB_PASSWORD}",\
    "FLASK_ENV=production" \
  --add-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
  --cpu 1 --memory 512Mi \
  --command sh -c "python -m flask --app app db upgrade" \
  --project "$PROJECT_ID" 2>/dev/null || true

# Execute migration job
echo "Executing migration job..."
gcloud beta run jobs execute "${SERVICE_NAME}-migrate" --region "$REGION" --project "$PROJECT_ID"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Service URL: $SERVICE_URL"
echo "Region: $REGION"
echo "Project: $PROJECT_ID"
echo ""
echo "Next steps:"
echo "1. Visit your service: $SERVICE_URL"
echo "2. Create an account and test the app"
echo "3. Monitor logs: gcloud run logs read $SERVICE_NAME --region=$REGION --limit=100"
echo "4. View metrics: https://console.cloud.google.com/run"
echo ""
echo "To redeploy after code changes:"
echo "1. Update code"
echo "2. Run: docker build -t $IMAGE_NAME:latest . && docker push $IMAGE_NAME:latest"
echo "3. Run: gcloud run deploy $SERVICE_NAME --image $IMAGE_NAME:latest --region $REGION"
echo ""
echo "Saved configuration (for next time):"
echo "  export PROJECT_ID=$PROJECT_ID"
echo "  export REGION=$REGION"
echo "  export INSTANCE_NAME=$INSTANCE_NAME"
echo "  export SERVICE_NAME=$SERVICE_NAME"
