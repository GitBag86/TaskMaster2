# SQLite to Postgres Migration Guide

This guide helps you migrate TaskMaster2 from SQLite (local development) to Postgres (production-ready) for testing before Cloud Run deployment.

---

## 📋 Prerequisites

- Docker installed (for running Postgres locally)
- Python venv activated
- TaskMaster2 backend dependencies installed (`pip install -r requirements.txt`)
- Existing SQLite database with data you want to preserve (optional)

---

## 🚀 Step 1: Start Postgres Locally (Docker)

### Option A: Quick Docker Postgres

```bash
# Start Postgres container
docker run --name postgres-taskmaster \
  -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_USER=appuser \
  -e POSTGRES_DB=taskmaster_db \
  -p 5432:5432 \
  -d \
  postgres:15-alpine

# Verify it's running
docker ps
```

### Option B: Using Docker Compose (If preferred)

Create `postgres-docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: devpassword
      POSTGRES_USER: appuser
      POSTGRES_DB: taskmaster_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

```bash
docker-compose -f postgres-docker-compose.yml up -d
```

---

## 🔗 Step 2: Connect Flask to Postgres

### Set Environment Variable

**On Linux/Mac:**
```bash
export DATABASE_URL=postgresql://appuser:devpassword@localhost:5432/taskmaster_db
```

**On Windows (PowerShell):**
```powershell
$env:DATABASE_URL="postgresql://appuser:devpassword@localhost:5432/taskmaster_db"
```

**Or create a `.env` file:**
```env
DATABASE_URL=postgresql://appuser:devpassword@localhost:5432/taskmaster_db
FLASK_ENV=development
SECRET_KEY=dev-secret-key
```

### Test Connection

```bash
python -c "from config import Config; print(Config.SQLALCHEMY_DATABASE_URI)"
```

Expected output: `postgresql://appuser:***@localhost:5432/taskmaster_db`

---

## 📊 Step 3: Run Database Migrations

### Initialize Database Schema

```bash
# Create all tables and run migrations
flask db upgrade

# Verify tables were created
python -c "
from app import app, db
with app.app_context():
    from sqlalchemy import inspect
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()
    print('Tables created:', tables)
"
```

Expected output should list tables like: `user`, `task`, `comment`, `subtask`, `tag`, etc.

---

## 🔄 Step 4: Migrate Data from SQLite (Optional)

If you have existing data in SQLite that you want to preserve:

### Export Data from SQLite

```bash
# Create a backup script
cat > export_sqlite_data.py << 'EOF'
import sqlite3
import json
from datetime import datetime

# Connect to SQLite
conn = sqlite3.connect("instance/tasks.db")
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cursor.fetchall()]

print(f"Found {len(tables)} tables in SQLite")

# Export schema and data
data_export = {}
for table in tables:
    cursor.execute(f"SELECT * FROM {table}")
    rows = cursor.fetchall()
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [col[1] for col in cursor.fetchall()]
    
    data_export[table] = {
        "columns": columns,
        "rows": rows
    }
    print(f"  {table}: {len(rows)} rows")

conn.close()

# Save to JSON
with open("sqlite_backup.json", "w") as f:
    json.dump(data_export, f, indent=2, default=str)

print("\nData exported to sqlite_backup.json")
EOF

python export_sqlite_data.py
```

### Import Data into Postgres

```bash
cat > import_postgres_data.py << 'EOF'
import json
from app import app, db
from datetime import datetime

with app.app_context():
    # Load exported data
    with open("sqlite_backup.json", "r") as f:
        data = json.load(f)
    
    # For each table, insert rows
    for table_name, table_data in data.items():
        rows = table_data["rows"]
        columns = table_data["columns"]
        
        if not rows:
            print(f"Skipping {table_name} (no data)")
            continue
        
        # Build INSERT statements
        placeholders = ", ".join(["%s"] * len(columns))
        col_names = ", ".join(columns)
        insert_sql = f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})"
        
        try:
            with db.engine.connect() as conn:
                for row in rows:
                    conn.execute(db.text(insert_sql), row)
                conn.commit()
            print(f"✓ Imported {len(rows)} rows into {table_name}")
        except Exception as e:
            print(f"✗ Error importing {table_name}: {e}")
            db.session.rollback()
    
    print("\nData import complete!")
EOF

python import_postgres_data.py
```

**Note:** If you don't need to preserve data, just run `flask db upgrade` - it creates a clean schema.

---

## ▶️ Step 5: Run the App with Postgres

```bash
# Terminal 1: Backend
export DATABASE_URL=postgresql://appuser:devpassword@localhost:5432/taskmaster_db
python app.py

# Terminal 2: Frontend (separate terminal)
cd frontend
npm run dev
```

Visit `http://localhost:3000` and test the app.

### What to Test

1. **Authentication**
   - Sign up a new user
   - Log in/logout
   - Session persistence

2. **Task Operations**
   - Create a task
   - Update task title/priority/status
   - Delete a task
   - Add subtasks

3. **Real-Time Sync (Socket.IO)**
   - Open app in two browser tabs
   - Create/update a task in one tab
   - Verify it appears in the other tab instantly

4. **Data Persistence**
   - Create a task
   - Refresh the page (F5)
   - Task should still exist

---

## 🗄️ Step 6: Verify Data Integrity

```bash
# Connect to Postgres and verify data
psql postgresql://appuser:devpassword@localhost:5432/taskmaster_db

-- Count records in each table
SELECT 'user' as table_name, COUNT(*) as record_count FROM "user"
UNION ALL
SELECT 'task', COUNT(*) FROM task
UNION ALL
SELECT 'comment', COUNT(*) FROM comment
UNION ALL
SELECT 'subtask', COUNT(*) FROM subtask;

-- Exit psql
\q
```

---

## 📦 Step 7: Prepare for Cloud Run

Once local Postgres testing works:

1. **Update `config.py`** (already done if using latest version)
   - Supports `INSTANCE_UNIX_SOCKET` for Cloud SQL

2. **Test environment variables:**
```bash
# Simulate Cloud Run env vars
export INSTANCE_UNIX_SOCKET=/path/to/socket
export DB_NAME=taskmaster_db
export DB_USER=appuser
export DB_PASSWORD=your-strong-password
export FLASK_ENV=production

# App should still connect correctly
python app.py
```

3. **Rebuild Docker image:**
```bash
docker build -t taskmaster2:postgres .
```

4. **Deploy to Cloud Run:**
```bash
./deploy-cloud-run.sh your-project-id us-central1 taskmaster
```

---

## 🐛 Troubleshooting

### Error: "FATAL: database does not exist"
```bash
# Postgres container might not have started
docker logs postgres-taskmaster

# Or create database manually
docker exec postgres-taskmaster psql -U appuser -d postgres -c \
  "CREATE DATABASE taskmaster_db;"
```

### Error: "authentication failed for user 'appuser'"
```bash
# Wrong password
export DATABASE_URL=postgresql://appuser:devpassword@localhost:5432/taskmaster_db

# Or check Postgres container logs
docker logs postgres-taskmaster | tail -20
```

### Error: "Connection refused" on localhost:5432
```bash
# Postgres not running
docker ps | grep postgres

# Start it
docker start postgres-taskmaster

# Or restart
docker-compose -f postgres-docker-compose.yml restart
```

### Error: "relation 'user' does not exist"
```bash
# Migrations didn't run
flask db upgrade

# Verify tables exist
psql postgresql://appuser:devpassword@localhost:5432/taskmaster_db -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```

### Slow queries or connection timeouts
```bash
# Check database stats
psql postgresql://appuser:devpassword@localhost:5432/taskmaster_db -c \
  "SELECT * FROM pg_stat_statements LIMIT 10;"

# Increase connection timeout in Flask (config.py)
SQLALCHEMY_ENGINE_OPTIONS = {
    'connect_args': {'connect_timeout': 10}
}
```

---

## 🧹 Cleanup

When done testing:

```bash
# Stop Postgres container
docker stop postgres-taskmaster

# Remove container
docker rm postgres-taskmaster

# Or if using docker-compose
docker-compose -f postgres-docker-compose.yml down -v
```

---

## ✅ Summary

| Step | Command | Purpose |
|------|---------|---------|
| 1 | `docker run postgres:15-alpine` | Start Postgres locally |
| 2 | `export DATABASE_URL=...` | Configure Flask connection |
| 3 | `flask db upgrade` | Create schema from migrations |
| 4 | `python app.py` | Run Flask with Postgres |
| 5 | `npm run dev` | Start React frontend |
| 6 | Test CRUD operations | Verify app works |
| 7 | `docker stop postgres-taskmaster` | Cleanup |

Once local Postgres testing succeeds, Cloud Run deployment will be straightforward!

---

**Last Updated:** May 2026
