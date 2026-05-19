# Cloud Run Database Troubleshooting & Deployment Guide

## 🔍 Quick Diagnosis

Before fixing, let's identify the exact issue. Run these commands to gather info:

```bash
# Set these variables with your actual values
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export SERVICE_NAME="taskmaster2"
export SQL_INSTANCE="taskmaster"

# 1. Check if Cloud SQL instance exists
gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID

# 2. Get the connection name (you'll need this!)
gcloud sql instances describe $SQL_INSTANCE \
  --project=$PROJECT_ID \
  --format='value(connectionName)'

# 3. Check Cloud Run service status
gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID

# 4. View Cloud Run logs (last 50 lines)
gcloud run logs read $SERVICE_NAME --region=$REGION --limit=50 --project=$PROJECT_ID

# 5. Check if migrations job exists
gcloud beta run jobs describe ${SERVICE_NAME}-migrate --region=$REGION --project=$PROJECT_ID 2>/dev/null || echo "Migration job not found"
```

---

## ❌ Common Database Issues & Fixes

### **Issue 1: "Cannot connect to /cloudsql/... socket"**

**Cause**: `INSTANCE_UNIX_SOCKET` environment variable not set correctly.

**Fix**:
```bash
# Get exact connection name
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $SQL_INSTANCE \
  --project=$PROJECT_ID --format='value(connectionName)')

echo "Connection name: $INSTANCE_CONNECTION_NAME"

# Should look like: my-project:us-central1:taskmaster

# Re-deploy with correct socket path
gcloud run deploy $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --update-env-vars INSTANCE_UNIX_SOCKET=/cloudsql/${INSTANCE_CONNECTION_NAME}
```

---

### **Issue 2: "host 'appuser' does not exist"**

**Cause**: Database user not created in Cloud SQL.

**Fix**:
```bash
# 1. Create the appuser (or reset password)
gcloud sql users create appuser \
  --instance=$SQL_INSTANCE \
  --password=MyStrongPassword123! \
  --project=$PROJECT_ID

# 2. Update Cloud Run to use correct password
gcloud run services update $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --update-env-vars DB_PASSWORD="MyStrongPassword123!"
```

**Note**: Save this password! You'll need it if you redeploy.

---

### **Issue 3: "database 'taskmaster_db' does not exist"**

**Cause**: Database not created in Cloud SQL.

**Fix**:
```bash
# Create the database
gcloud sql databases create taskmaster_db \
  --instance=$SQL_INSTANCE \
  --project=$PROJECT_ID

# Verify it was created
gcloud sql databases list --instance=$SQL_INSTANCE --project=$PROJECT_ID
```

---

### **Issue 4: "relation 'user' does not exist" (after first request)**

**Cause**: Database migrations haven't run yet. Schema tables don't exist.

**Fix**:
```bash
# Check if migration job exists
gcloud beta run jobs describe ${SERVICE_NAME}-migrate --region=$REGION --project=$PROJECT_ID

# If NOT found, create it
if ! gcloud beta run jobs describe ${SERVICE_NAME}-migrate --region=$REGION --project=$PROJECT_ID 2>/dev/null; then
  export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $SQL_INSTANCE \
    --project=$PROJECT_ID --format='value(connectionName)')
  
  echo "Creating migration job..."
  gcloud beta run jobs create ${SERVICE_NAME}-migrate \
    --image gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest \
    --region $REGION \
    --set-env-vars \
      INSTANCE_UNIX_SOCKET=/cloudsql/${INSTANCE_CONNECTION_NAME},\
      DB_NAME=taskmaster_db,\
      DB_PASSWORD=$(gcloud sql users describe appuser --instance=$SQL_INSTANCE --format='value(password)' 2>/dev/null || echo "YOUR_PASSWORD"),\
      DB_USER=appuser,\
      FLASK_ENV=production \
    --add-cloudsql-instances $INSTANCE_CONNECTION_NAME \
    --cpu 1 --memory 512Mi \
    --project $PROJECT_ID
fi

# Execute the migration
echo "Running migrations..."
gcloud beta run jobs execute ${SERVICE_NAME}-migrate \
  --region $REGION \
  --project $PROJECT_ID \
  --wait

# Check job execution status
gcloud beta run jobs logs read ${SERVICE_NAME}-migrate --region=$REGION --limit=50 --project=$PROJECT_ID
```

---

### **Issue 5: "Error: gcloud: command not found" or Docker cloud-sql-proxy missing**

**Cause**: Docker image doesn't have cloud-sql-proxy installed.

**Fix**: Update your Dockerfile to include cloud-sql-proxy:

```dockerfile
# In Stage 3: Production image section
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# Install cloud-sql-proxy for Cloud SQL connectivity
RUN apt-get update && apt-get install -y --no-install-recommends \
    cloud-sql-proxy \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# ... rest of your Dockerfile ...
```

Then rebuild and push:
```bash
docker build -t gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest .
docker push gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest

# Redeploy
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest \
  --region=$REGION \
  --project=$PROJECT_ID
```

---

### **Issue 6: "Error: IAM permission denied" or "Cloud SQL Client" role missing**

**Cause**: Cloud Run service account doesn't have permission to access Cloud SQL.

**Fix**:
```bash
# Get the Cloud Run service account email
export SERVICE_ACCOUNT=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format='value(spec.template.spec.serviceAccountName)' \
  --project=$PROJECT_ID)

echo "Service account: $SERVICE_ACCOUNT"

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudsql.client" \
  --condition=None

# Wait 30 seconds for IAM to propagate
sleep 30

# Redeploy
gcloud run deploy $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID
```

---

### **Issue 7: "Connection timeout" or "too many connections"**

**Cause**: Cloud SQL connection limit reached or network timeout.

**Fix**:
```bash
# Check current connections
gcloud sql instances describe $SQL_INSTANCE \
  --project=$PROJECT_ID \
  --format='value(settings.ipConfiguration.maxConnections)'

# Increase max connections (if needed)
gcloud sql instances patch $SQL_INSTANCE \
  --database-flags max_connections=200 \
  --project=$PROJECT_ID \
  --quiet

# Reduce Cloud Run concurrency to avoid overloading DB
gcloud run services update $SERVICE_NAME \
  --region=$REGION \
  --concurrency=50 \
  --project=$PROJECT_ID
```

---

## ✅ Complete Fresh Deployment (Step-by-Step)

If you want to start fresh, follow this workflow:

### **Step 1: Set Up Environment Variables**
```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export SERVICE_NAME="taskmaster2"
export SQL_INSTANCE="taskmaster"
export DB_PASSWORD="GeneratedStrongPassword123!"
export IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
```

### **Step 2: Create Cloud SQL Infrastructure**
```bash
# Create Cloud SQL instance (if not exists)
gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID 2>/dev/null || \
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
  --project=$PROJECT_ID 2>/dev/null || echo "Database already exists"

# Create/reset user
gcloud sql users create appuser \
  --instance=$SQL_INSTANCE \
  --password=$DB_PASSWORD \
  --project=$PROJECT_ID 2>/dev/null || \
  gcloud sql users set-password appuser \
    --instance=$SQL_INSTANCE \
    --password=$DB_PASSWORD \
    --project=$PROJECT_ID

# Get connection name
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $SQL_INSTANCE \
  --project=$PROJECT_ID --format='value(connectionName)')

echo "Cloud SQL Setup Complete!"
echo "Instance: $SQL_INSTANCE"
echo "Connection Name: $INSTANCE_CONNECTION_NAME"
```

### **Step 3: Build & Push Docker Image**
```bash
# Build locally
docker build -t $IMAGE_NAME:latest .

# Push to Container Registry
docker push $IMAGE_NAME:latest

echo "Docker image pushed: $IMAGE_NAME:latest"
```

### **Step 4: Deploy to Cloud Run**
```bash
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

echo "Cloud Run service deployed!"

# Get service URL
export SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

echo "Service URL: $SERVICE_URL"
```

### **Step 5: Run Database Migrations**
```bash
# Create migration job
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
  --project $PROJECT_ID 2>/dev/null || echo "Job may already exist"

# Execute migration
gcloud beta run jobs execute ${SERVICE_NAME}-migrate \
  --region $REGION \
  --project $PROJECT_ID \
  --wait

echo "Database migrations complete!"

# View logs
gcloud beta run jobs logs read ${SERVICE_NAME}-migrate \
  --region=$REGION \
  --limit=30 \
  --project=$PROJECT_ID
```

### **Step 6: Test the Deployment**
```bash
# Get service URL
export SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

# Test basic endpoint
curl -s $SERVICE_URL/health

# Try creating a user (signup)
curl -X POST $SERVICE_URL/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","name":"Test User"}'

# Check logs
gcloud run logs read $SERVICE_NAME --region=$REGION --limit=50 --project=$PROJECT_ID
```

---

## 🛠️ Debugging Checklist

Go through these one by one if deployment fails:

- [ ] **Is Cloud SQL instance running?**
  ```bash
  gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID
  ```

- [ ] **Is database created?**
  ```bash
  gcloud sql databases list --instance=$SQL_INSTANCE --project=$PROJECT_ID
  ```

- [ ] **Is appuser created with correct password?**
  ```bash
  gcloud sql users list --instance=$SQL_INSTANCE --project=$PROJECT_ID
  ```

- [ ] **Does Cloud Run service account have Cloud SQL Client role?**
  ```bash
  gcloud projects get-iam-policy $PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.role:cloudsql.client"
  ```

- [ ] **Is Docker image present in Container Registry?**
  ```bash
  gcloud container images list --repository=gcr.io/${PROJECT_ID} --project=$PROJECT_ID
  ```

- [ ] **Is Cloud Run service deployed?**
  ```bash
  gcloud run services list --region=$REGION --project=$PROJECT_ID
  ```

- [ ] **Are environment variables set correctly?**
  ```bash
  gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(spec.template.spec.containers[0].env)'
  ```

- [ ] **Have migrations run successfully?**
  ```bash
  gcloud beta run jobs logs read ${SERVICE_NAME}-migrate \
    --region=$REGION \
    --limit=50 \
    --project=$PROJECT_ID
  ```

- [ ] **Is there a network error in Cloud Run logs?**
  ```bash
  gcloud run logs read $SERVICE_NAME \
    --region=$REGION \
    --limit=100 \
    --project=$PROJECT_ID \
    | grep -i error
  ```

---

## 📝 Save These Commands for Later

```bash
# Quick commands to save in your shell profile or a script

# View logs
alias crl='gcloud run logs read taskmaster2 --region=us-central1 --limit=50'

# View migration logs
alias crml='gcloud beta run jobs logs read taskmaster2-migrate --region=us-central1 --limit=50'

# Quick redeploy after code changes
alias redeploy='docker build -t gcr.io/YOUR_PROJECT_ID/taskmaster2:latest . && docker push gcr.io/YOUR_PROJECT_ID/taskmaster2:latest && gcloud run deploy taskmaster2 --image gcr.io/YOUR_PROJECT_ID/taskmaster2:latest --region=us-central1 --project=YOUR_PROJECT_ID'
```

---

## 🆘 If Still Stuck

1. **Post migration logs** — Run `gcloud beta run jobs logs read ${SERVICE_NAME}-migrate --region=$REGION --limit=100 --project=$PROJECT_ID` and share output
2. **Post service logs** — Run `gcloud run logs read $SERVICE_NAME --region=$REGION --limit=100 --project=$PROJECT_ID` and share errors
3. **Verify database connection locally** — See [POSTGRES_MIGRATION.md](../POSTGRES_MIGRATION.md) for testing Postgres locally first
