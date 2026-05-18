# TaskMaster2 on Google Cloud Run + Cloud SQL (Postgres)

A complete guide to deploy TaskMaster2 to Google Cloud Run with a managed Postgres database via Cloud SQL.

---

## 🎯 Prerequisites

1. **Google Cloud Project** - Created and billing enabled
2. **gcloud CLI** - Installed and authenticated (`gcloud auth login`)
3. **Docker** - Installed locally (for building images)
4. **Postgres database** - Either:
   - Cloud SQL instance (recommended) - `gcloud sql instances create taskmaster --database-version POSTGRES_15`
   - Or self-hosted Postgres (less ideal for Cloud Run's scaling)

---

## 📋 Step 1: Set Up Cloud SQL (Postgres)

### Create Cloud SQL Instance
```bash
# Set your project ID
export PROJECT_ID=your-project-id
export REGION=us-central1  # or your preferred region

# Create Postgres 15 instance (db-f1-micro = free tier eligible)
gcloud sql instances create taskmaster \
  --project=$PROJECT_ID \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-type=SSD \
  --storage-size=10GB
```

### Create Database & User
```bash
# Create the database
gcloud sql databases create taskmaster_db \
  --instance=taskmaster \
  --project=$PROJECT_ID

# Create app user (replace 'app_password' with a strong password!)
gcloud sql users create appuser \
  --instance=taskmaster \
  --password=app_password \
  --project=$PROJECT_ID
```

### Get Connection Info
```bash
# Get the Cloud SQL connection name (you'll need this!)
gcloud sql instances describe taskmaster \
  --project=$PROJECT_ID \
  --format='value(connectionName)'

# Output format: PROJECT_ID:REGION:INSTANCE_NAME
# Example: my-project:us-central1:taskmaster
```

---

## 🔧 Step 2: Update Configuration

### Option A: Cloud SQL Socket Connection (Recommended)

Cloud SQL Auth Proxy connects securely to your database via Unix socket. Add this to `config.py`:

```python
import os
import urllib.parse

# Cloud SQL for Postgres via Socket (Cloud Run + Cloud SQL Auth Proxy)
INSTANCE_UNIX_SOCKET = os.environ.get("INSTANCE_UNIX_SOCKET", "")
if INSTANCE_UNIX_SOCKET:
    SQLALCHEMY_DATABASE_URI = f"postgresql://appuser:{urllib.parse.quote_plus(os.environ.get('DB_PASSWORD', ''))}@/{os.environ.get('DB_NAME', 'taskmaster_db')}?host={INSTANCE_UNIX_SOCKET}"
# Standard Postgres connection (for local dev with Postgres)
elif os.environ.get("DATABASE_URL"):
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
# Fallback to SQLite (local development)
else:
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'instance', 'tasks.db')}"
```

**Why socket connection?**
- More secure (no exposed public IP)
- Works seamlessly in Cloud Run via Cloud SQL Auth Proxy sidecar
- Better performance than TCP

---

## 🐳 Step 3: Update Dockerfile for Cloud Run

Your current Dockerfile works, but add the Cloud SQL Proxy init container support:

```dockerfile
# ... existing stages ...

# Stage 3: Production image
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# Install cloud-sql-proxy
RUN apt-get update && apt-get install -y --no-install-recommends \
    cloud-sql-proxy \
    && rm -rf /var/lib/apt/lists/*

COPY --from=python-builder /install /usr/local
COPY app.py config.py extensions.py models.py schemas.py requirements.txt ./
COPY start.sh ./
COPY routes ./routes
COPY utils ./utils
COPY jobs ./jobs
COPY migrations ./migrations
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN chmod +x /app/start.sh && \
    adduser --disabled-password --gecos '' --uid 10001 appuser && \
    chown -R appuser:appuser /app

USER appuser

# Use PORT env var (Cloud Run requires :8080)
EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--worker-class", "gthread", "--workers", "2", "--worker-connections", "10", "app:app"]
```

---

## 🚀 Step 4: Build & Push Docker Image

```bash
export PROJECT_ID=your-project-id
export IMAGE_NAME=gcr.io/$PROJECT_ID/taskmaster2

# Build the image
docker build -t $IMAGE_NAME:latest .

# Push to Google Container Registry
docker push $IMAGE_NAME:latest
```

---

## ⚙️ Step 5: Deploy to Cloud Run

### With Cloud SQL Auth Proxy (Recommended)

```bash
export PROJECT_ID=your-project-id
export REGION=us-central1
export SERVICE_NAME=taskmaster2
export DB_PASSWORD=your_strong_password_here
export SQL_INSTANCE=taskmaster  # From Step 1

# Get the full connection name
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $SQL_INSTANCE \
  --format='value(connectionName)' --project=$PROJECT_ID)

gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/taskmaster2:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --max-instances 10 \
  --project $PROJECT_ID \
  --set-env-vars \
    DB_NAME=taskmaster_db,\
    DB_PASSWORD=$DB_PASSWORD,\
    SECRET_KEY=$(openssl rand -hex 32),\
    INSTANCE_UNIX_SOCKET=/cloudsql/$INSTANCE_CONNECTION_NAME,\
    FLASK_ENV=production \
  --add-cloudsql-instances $INSTANCE_CONNECTION_NAME
```

### Without Cloud SQL Auth Proxy (Using Public IP)

Less secure but simpler if Cloud SQL Proxy causes issues:

```bash
# Create a public IP for your Cloud SQL instance
gcloud sql instances patch taskmaster --assign-ip

# Get the public IP
export CLOUD_SQL_PUBLIC_IP=$(gcloud sql instances describe taskmaster \
  --format='value(ipAddresses[0].ipAddress)' --project=$PROJECT_ID)

# Deploy with DATABASE_URL
gcloud run deploy taskmaster2 \
  --image gcr.io/$PROJECT_ID/taskmaster2:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --set-env-vars \
    DATABASE_URL=postgresql://appuser:$DB_PASSWORD@$CLOUD_SQL_PUBLIC_IP:5432/taskmaster_db,\
    SECRET_KEY=$(openssl rand -hex 32),\
    FLASK_ENV=production
```

---

## 🗄️ Step 6: Run Database Migrations

After deploying, run migrations to set up the schema:

```bash
# Get your Cloud Run service URL
export SERVICE_URL=$(gcloud run services describe taskmaster2 \
  --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)

# Option 1: Use Cloud Run jobs to run migrations (recommended)
gcloud beta run jobs create taskmaster2-migrate \
  --image gcr.io/$PROJECT_ID/taskmaster2:latest \
  --region $REGION \
  --set-env-vars \
    INSTANCE_UNIX_SOCKET=/cloudsql/$INSTANCE_CONNECTION_NAME,\
    DB_NAME=taskmaster_db,\
    DB_PASSWORD=$DB_PASSWORD,\
    FLASK_ENV=production \
  --add-cloudsql-instances $INSTANCE_CONNECTION_NAME \
  --cpu 1 --memory 512Mi

# Run the job
gcloud beta run jobs execute taskmaster2-migrate --region=$REGION

# Option 2: Or manually via SSH to a bastion host that can reach Cloud SQL
# (This is more complex; Option 1 is recommended)
```

---

## 🔑 Step 7: Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `INSTANCE_UNIX_SOCKET` | Cloud SQL socket path | `/cloudsql/project:region:instance` |
| `DATABASE_URL` | Standard Postgres connection string | `postgresql://user:pass@host:5432/db` |
| `DB_NAME` | Database name | `taskmaster_db` |
| `DB_PASSWORD` | Database user password | (use strong password!) |
| `SECRET_KEY` | Flask session encryption key | Generate with `openssl rand -hex 32` |
| `FLASK_ENV` | Environment mode | `production` |
| `PORT` | Cloud Run port binding | `8080` (required) |
| `CORS_ORIGINS` | Allowed origins | `https://your-domain.com` |

---

## 🐛 Troubleshooting

### "Cannot connect to database" Error

**Check 1: Cloud SQL Auth Proxy**
```bash
# Verify the proxy is running (check Cloud Run logs)
gcloud run logs read taskmaster2 --limit 50 --region=$REGION
```

**Check 2: Network/Firewall**
```bash
# Ensure your Cloud SQL instance allows connections
gcloud sql instances describe taskmaster --format='value(settings.ipConfiguration.publicIp)'

# Add Cloud Run service account to authorized networks (if using public IP)
gcloud sql instances patch taskmaster \
  --authorized-networks=YOUR_IP/32
```

**Check 3: Credentials**
```bash
# Verify the service account has Cloud SQL access
gcloud run services describe taskmaster2 --format='value(spec.template.spec.serviceAccountName)'

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:YOUR-SERVICE-ACCOUNT@appspot.gserviceaccount.com \
  --role=roles/cloudsql.client
```

### "Permission denied" on Migrations

Make sure the Cloud SQL user has proper permissions:
```bash
# SSH into Cloud SQL (via bastion) or use cloud-sql-proxy locally
# Then run:
GRANT ALL PRIVILEGES ON DATABASE taskmaster_db TO appuser;
```

### "Port 5000 not allowed in Cloud Run"

Cloud Run only allows port 8080 for HTTP. Update `start.sh`:
```bash
#!/bin/bash
exec gunicorn --bind 0.0.0.0:8080 --worker-class gthread --workers 2 app:app
```

---

## 📦 Step 8: Scale & Monitor

```bash
# Auto-scale based on request count
gcloud run services update taskmaster2 \
  --region $REGION \
  --max-instances 100 \
  --concurrency 80

# View logs
gcloud run logs read taskmaster2 --region=$REGION --limit=100

# View metrics
gcloud monitoring dashboards create --config-from-file=- <<EOF
{
  "displayName": "TaskMaster2 Cloud Run",
  "gridLayout": {
    "widgets": [
      {"title": "Request Count", "xyChart": {"dataSets": [{"timeSeriesQuery": {"timeSeriesFilter": {"filter": "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"taskmaster2\""}}}]}},
      {"title": "Error Rate", "xyChart": {"dataSets": [{"timeSeriesQuery": {"timeSeriesFilter": {"filter": "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\""}}}]}}
    ]
  }
}
EOF
```

---

## 🔄 Local Development with Postgres (Optional)

To test locally with Postgres before Cloud Run:

```bash
# Start Postgres locally (via Docker)
docker run --name postgres-dev \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=taskmaster_db \
  -e POSTGRES_USER=appuser \
  -p 5432:5432 \
  postgres:15-alpine

# Set connection string
export DATABASE_URL=postgresql://appuser:devpass@localhost:5432/taskmaster_db

# Run migrations
flask db upgrade

# Start Flask
python app.py
```

---

## ✅ Verification Checklist

- [ ] Cloud SQL instance created with Postgres 15
- [ ] Database `taskmaster_db` and user `appuser` created
- [ ] Docker image built and pushed to Container Registry
- [ ] Cloud Run service deployed with correct environment variables
- [ ] Cloud SQL Auth Proxy running (or public IP configured)
- [ ] Database migrations applied successfully
- [ ] Frontend loads at Cloud Run service URL
- [ ] Can create/update/delete tasks
- [ ] Real-time updates work via Socket.IO
- [ ] Logs show no connection errors

---

## 📞 Getting Help

**Common Issues:**
- Cloud Run logs: `gcloud run logs read taskmaster2 --limit 100`
- Cloud SQL status: `gcloud sql instances describe taskmaster`
- Test connection locally: `psql postgresql://appuser:password@cloudsql-host/taskmaster_db`

**Useful Commands:**
```bash
# Restart the service
gcloud run services update taskmaster2 --region $REGION --no-traffic

# SSH into Cloud Run (via Cloud Run workstation)
gcloud compute ssh --zone us-central1-a cloud-run-taskmaster2

# View Cloud SQL metrics
gcloud sql instances describe taskmaster --format=pretty
```

---

**Last Updated:** May 2026
