# 🚀 Quick Cloud Run Deployment Checklist

Save this file and follow the steps below to deploy TaskMaster2 to Google Cloud Run with Cloud SQL.

## ✅ Pre-Deployment Setup (One-Time)

- [ ] **Google Cloud Project created** and billing enabled
- [ ] **gcloud CLI installed** and authenticated: `gcloud auth login`
- [ ] **Docker installed** locally
- [ ] **Logged into Cloud**: `gcloud config set project YOUR_PROJECT_ID`

## 📋 Deployment Steps

### Step 1: Save Configuration
```bash
# Set these once and save for later
export PROJECT_ID="your-project-id"           # e.g., my-project-prod
export REGION="us-central1"                   # or your preferred region
export SERVICE_NAME="taskmaster2"
export SQL_INSTANCE="taskmaster"
export DB_PASSWORD="GenerateStrongPassword$(date +%s)"  # or your own strong password

echo "Saved configuration:"
echo "PROJECT_ID=$PROJECT_ID"
echo "REGION=$REGION"
echo "SERVICE_NAME=$SERVICE_NAME"
echo "SQL_INSTANCE=$SQL_INSTANCE"
echo "DB_PASSWORD=$DB_PASSWORD (SAVE THIS!)"
```

### Step 2: Create Cloud SQL Infrastructure
```bash
# Check if instance exists
gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID 2>/dev/null

# If NOT found, create it:
gcloud sql instances create $SQL_INSTANCE \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-type=SSD \
  --storage-size=10GB \
  --project=$PROJECT_ID

# Create database
gcloud sql databases create taskmaster_db \
  --instance=$SQL_INSTANCE \
  --project=$PROJECT_ID

# Create/reset database user
gcloud sql users create appuser \
  --instance=$SQL_INSTANCE \
  --password=$DB_PASSWORD \
  --project=$PROJECT_ID 2>/dev/null || \
  gcloud sql users set-password appuser \
    --instance=$SQL_INSTANCE \
    --password=$DB_PASSWORD \
    --project=$PROJECT_ID

# Get connection name (you'll need this!)
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $SQL_INSTANCE \
  --project=$PROJECT_ID --format='value(connectionName)')

echo "✓ Cloud SQL Setup Complete"
echo "Connection Name: $INSTANCE_CONNECTION_NAME"
```

### Step 3: Build & Push Docker Image
```bash
export IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Build
echo "Building Docker image..."
docker build -t $IMAGE_NAME:latest .

# Push to Google Container Registry
echo "Pushing to Container Registry..."
docker push $IMAGE_NAME:latest

echo "✓ Docker image pushed: $IMAGE_NAME:latest"
```

### Step 4: Deploy to Cloud Run
```bash
echo "Deploying to Cloud Run..."

gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --max-instances 10 \
  --project $PROJECT_ID \
  --set-env-vars \
    INSTANCE_UNIX_SOCKET=/cloudsql/${INSTANCE_CONNECTION_NAME},\
    DB_NAME=taskmaster_db,\
    DB_USER=appuser,\
    DB_PASSWORD=${DB_PASSWORD},\
    SECRET_KEY=$(openssl rand -hex 32),\
    FLASK_ENV=production,\
    CORS_ORIGINS=* \
  --add-cloudsql-instances $INSTANCE_CONNECTION_NAME

# Get service URL
export SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

echo "✓ Cloud Run service deployed!"
echo "Service URL: $SERVICE_URL"
```

### Step 5: Create & Run Database Migrations Job
```bash
echo "Creating migration job..."

# Create migration job (only once)
gcloud beta run jobs create ${SERVICE_NAME}-migrate \
  --image $IMAGE_NAME:latest \
  --region $REGION \
  --set-env-vars \
    INSTANCE_UNIX_SOCKET=/cloudsql/${INSTANCE_CONNECTION_NAME},\
    DB_NAME=taskmaster_db,\
    DB_USER=appuser,\
    DB_PASSWORD=${DB_PASSWORD},\
    FLASK_ENV=production \
  --add-cloudsql-instances $INSTANCE_CONNECTION_NAME \
  --cpu 1 --memory 512Mi \
  --project $PROJECT_ID 2>/dev/null || echo "Migration job may already exist"

# Execute migration
echo "Running migrations..."
gcloud beta run jobs execute ${SERVICE_NAME}-migrate \
  --region $REGION \
  --project $PROJECT_ID \
  --wait

echo "✓ Migrations complete"

# View migration logs
gcloud beta run jobs logs read ${SERVICE_NAME}-migrate \
  --region=$REGION \
  --limit=30 \
  --project=$PROJECT_ID
```

### Step 6: Test the Deployment
```bash
# Get service URL again (in case it changed)
export SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

echo "Testing service at: $SERVICE_URL"

# Test health endpoint
curl -s $SERVICE_URL/health

# View latest logs
gcloud run logs read $SERVICE_NAME \
  --region=$REGION \
  --limit=50 \
  --project=$PROJECT_ID
```

## 🐛 Troubleshooting

**If deployment fails:**
1. Check **Cloud SQL logs**:
   ```bash
   gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID
   ```

2. Check **Cloud Run logs**:
   ```bash
   gcloud run logs read $SERVICE_NAME --region=$REGION --limit=100 --project=$PROJECT_ID
   ```

3. Check **Migration logs**:
   ```bash
   gcloud beta run jobs logs read ${SERVICE_NAME}-migrate --region=$REGION --limit=100 --project=$PROJECT_ID
   ```

4. **See full troubleshooting guide**: [CLOUD_RUN_TROUBLESHOOTING.md](CLOUD_RUN_TROUBLESHOOTING.md)

## 📝 After Successful Deployment

### Save for Next Time
```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, or ~/.profile)

# Cloud Run logs
alias crl='gcloud run logs read taskmaster2 --region=us-central1 --limit=50 --project=$PROJECT_ID'
alias crml='gcloud beta run jobs logs read taskmaster2-migrate --region=us-central1 --limit=50 --project=$PROJECT_ID'

# Quick redeploy after code changes
alias redeploy='docker build -t gcr.io/$PROJECT_ID/taskmaster2:latest . && docker push gcr.io/$PROJECT_ID/taskmaster2:latest && gcloud run deploy taskmaster2 --image gcr.io/$PROJECT_ID/taskmaster2:latest --region=us-central1 --project=$PROJECT_ID'
```

### Verify Services
```bash
# List all Cloud SQL instances
gcloud sql instances list --project=$PROJECT_ID

# List all Cloud Run services
gcloud run services list --region=$REGION --project=$PROJECT_ID

# Get service details
gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID
```

## 🔄 Redeploying After Code Changes

```bash
# 1. Update code locally
# 2. Rebuild Docker image
docker build -t gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest .

# 3. Push to registry
docker push gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest

# 4. Redeploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest \
  --region=$REGION \
  --project=$PROJECT_ID

# 5. If database schema changed, run migrations
gcloud beta run jobs execute ${SERVICE_NAME}-migrate --region=$REGION --project=$PROJECT_ID --wait
```

## 📚 Links

- [Full Setup Guide](CLOUD_RUN_SETUP.md)
- [Troubleshooting Guide](CLOUD_RUN_TROUBLESHOOTING.md)
- [Local Postgres Testing](POSTGRES_MIGRATION.md)
- [Deploy Script](deploy-cloud-run.sh)
